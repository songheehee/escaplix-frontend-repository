// 백엔드 요청은 모두 이 파일을 거친다 (API 명세 1-1, 1-3, 1-5)
//   - 서버 주소는 여기 한 곳에만 적는다
//   - Access Token(JWT, 30분)은 sessionStorage "token" 에 둔다 (로그인 화면이 저장)
//   - Refresh Token(7일)은 서버가 HttpOnly 쿠키로 준다. JS 는 못 읽고, 요청에 credentials 로 실려 갈 뿐
//     Access Token 이 끝났으면(또는 401) /api/auth/refresh 로 새로 받아 원래 요청을 한 번 더 보낸다 (11/27)
//   - 실패하면 ApiError(status, message) 를 던진다. message 는 서버가 준 한국어 문장
// ※ 공용 파일(A 담당)
//
// 쓰는 법
//   api.get("/api/themes", { area: "홍대" })      → 쿼리 붙여서 GET
//   api.post("/api/parties", { ... })             → JSON 본문
//   api.upload("/api/members/owner", form)        → 파일 올리기 (multipart, 명세 1-6). form 은 FormData 또는 <form>
//   api.upload("/api/owner/stores/3", form, "PUT") → 수정(C-4·C-8)처럼 PUT 으로 올릴 때
//   api.blob("/api/admin/members/2/biz-file")     → 토큰이 필요한 이미지 (A-11·C-15). URL.createObjectURL(blob) 로 보여 주기

// 백엔드 주소: 지금 화면을 연 컴퓨터의 8081
//   localhost·127.0.0.1 로 열면 내 컴퓨터, 같은 와이파이에서 10.10.0.11:5500 처럼 IP 로 열면 그 컴퓨터로 간다
//   (그 IP 로 연 화면은 백엔드 app.cors.allowed-origins 에도 있어야 함 → application-local.properties)
//   파일을 직접 연 경우(file://)처럼 호스트가 없으면 localhost
const API_BASE = (location.protocol === "https:" ? "https:" : "http:") + "//" + (location.hostname || "localhost") + ":8081";

const Auth = (function () {
  const KEY = "token";

  function token() {
    try { return sessionStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(t) {
    try { sessionStorage.setItem(KEY, t); } catch (e) { /* 저장 못 하는 환경 */ }
  }
  function clear() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
  }

  // 토큰 안의 값 (서명 검사는 서버가 한다). 못 읽으면 null
  function payload(t) {
    try {
      const part = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(part).split("").map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        }).join("")
      );
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  // 화면을 그릴 때 쓰는 내 정보 { memberId, nickname, role } 또는 null
  //   Access Token 이 끝났어도 로그인한 것으로 본다 → 첫 요청 때 Refresh Token 으로 새로 받음 (못 받으면 로그인 화면으로)
  function me() {
    const t = token();
    if (!t) return null;
    const p = payload(t);
    if (!p) { clear(); return null; }
    return { memberId: Number(p.sub), nickname: p.nickname, role: p.role };
  }

  // 곧 끝나는지 (30초 여유: 가는 길에 끝나지 않게)
  function expiring() {
    const p = payload(token() || "");
    return !!(p && p.exp && p.exp * 1000 < Date.now() + 30 * 1000);
  }

  // Refresh Token(쿠키)으로 새 Access Token 받기. 동시에 여러 요청이 와도 한 번만 보냄
  //   true = 새로 받음, false = 못 받음(만료·로그아웃됨 → 토큰 지움)
  let refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    refreshing = fetch(API_BASE + "/api/auth/refresh", { method: "POST", credentials: "include", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) { clear(); return false; }
        return res.json().then(function (data) { save(data.token); return true; });
      })
      .catch(function () { return false; })   // 서버가 꺼져 있음: 토큰은 그대로 둠
      .finally(function () { refreshing = null; });
    return refreshing;
  }

  // 로그아웃: 서버의 Refresh Token 을 지우고(쿠키도) 화면 토큰도 지움. 서버가 안 받아도 화면은 로그아웃
  function logout() {
    return fetch(API_BASE + "/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store" })
      .catch(function () { /* 무시 */ })
      .then(function () { clear(); });
  }

  function goLogin() {
    location.href = Routes.url("login", { next: Routes.current() });
  }

  return { token: token, save: save, clear: clear, me: me, goLogin: goLogin, expiring: expiring, refresh: refresh, logout: logout };
})();

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const api = (function () {
  // 로그인·재발급·로그아웃은 토큰 자동 갱신 대상이 아님
  const AUTH_PATHS = ["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"];

  // asBlob: 응답을 JSON 대신 파일(Blob)로 받기 (이미지 내려받기)
  async function request(method, path, body, asBlob, retried) {
    const isAuthPath = AUTH_PATHS.indexOf(path) !== -1;
    // 보내기 전에 Access Token 이 끝났으면 먼저 새로 받음 (공개 API 도: 찜 여부 등이 비회원처럼 오지 않게)
    if (!isAuthPath && Auth.token() && Auth.expiring()) {
      await Auth.refresh();
    }
    const headers = {};
    const t = Auth.token();
    if (t) headers.Authorization = "Bearer " + t;

    // FormData(파일 올리기)는 그대로 보낸다. Content-Type 은 브라우저가 boundary 를 붙여 정하므로 직접 넣지 않는다
    const isForm = body instanceof FormData;
    if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";

    let res;
    try {
      res = await fetch(API_BASE + path, {
        method: method,
        headers: headers,
        // 서버 응답에 Cache-Control 이 없어서, 뒤로가기로 돌아온 화면에서 브라우저가 예전 응답을 캐시에서 꺼내 쓴다
        // (예: 파티에서 나가고 돌아왔는데 내 파티에 그대로 남음) → API 는 항상 서버에 새로 묻는다
        cache: "no-store",
        credentials: "include",   // Refresh Token 쿠키 (로그인·비밀번호 변경 응답이 새 쿠키를 줌)
        body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
      });
    } catch (e) {
      throw new ApiError(0, "서버에 연결할 수 없어요. 백엔드(:8081)가 켜져 있는지 확인해 주세요.");
    }

    if (res.status === 204) return null;
    if (res.ok && asBlob) return res.blob();
    const data = await res.json().catch(function () { return null; });

    if (!res.ok) {
      // 413: 파일이 서버 한도보다 큼 (서버가 JSON 을 못 줄 수도 있어서 따로)
      const fallback = res.status === 413 ? "파일이 너무 커요. 5MB 이하로 올려 주세요." : "요청을 처리하지 못했어요. (" + res.status + ")";
      const msg = (data && data.message) || fallback;
      // 401: 토큰이 없거나 만료 (명세 1-5)
      //   토큰을 보냈었다면 Refresh Token 으로 새로 받아 한 번만 다시 보냄. 그래도 안 되면 로그인 화면으로
      //   로그인 요청(A-6)의 401 은 "아이디 또는 비밀번호가 틀렸습니다" → 화면에 문구만 보여 준다
      if (res.status === 401 && !isAuthPath) {
        if (t && !retried && await Auth.refresh()) {
          return request(method, path, body, asBlob, true);
        }
        Auth.clear();
        Auth.goLogin();
      }
      throw new ApiError(res.status, msg);
    }
    return data;
  }

  // { a: 1, b: "" } → "?a=1" (빈 값은 안 붙임)
  function query(params) {
    const q = new URLSearchParams();
    Object.keys(params || {}).forEach(function (k) {
      const v = params[k];
      if (v !== undefined && v !== null && v !== "") q.append(k, v);
    });
    const s = q.toString();
    return s ? "?" + s : "";
  }

  return {
    get: function (path, params) { return request("GET", path + query(params)); },
    post: function (path, body) { return request("POST", path, body); },
    put: function (path, body) { return request("PUT", path, body); },
    del: function (path) { return request("DELETE", path); },
    // 파일 올리기. form: FormData 또는 <form> 요소. 빈 파일 칸은 빼고 보낸다 (선택 파일을 안 골랐을 때 400 방지)
    upload: function (path, form, method) {
      const fd = form instanceof FormData ? form : new FormData(form);
      Array.from(fd.entries()).forEach(function (e) {
        if (e[1] instanceof File && e[1].size === 0 && !e[1].name) fd.delete(e[0]);
      });
      return request(method || "POST", path, fd);
    },
    blob: function (path) { return request("GET", path, undefined, true); },
  };
})();
