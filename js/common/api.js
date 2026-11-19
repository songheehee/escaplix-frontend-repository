// 백엔드 요청은 모두 이 파일을 거친다 (API 명세 1-1, 1-3, 1-5)
//   - 서버 주소는 여기 한 곳에만 적는다
//   - 토큰은 sessionStorage "token" 에 둔다 (로그인 화면이 저장, 로그아웃은 지우기만)
//   - 실패하면 ApiError(status, message) 를 던진다. message 는 서버가 준 한국어 문장
// ※ 공용 파일(A 담당)
//
// 쓰는 법
//   api.get("/api/themes", { area: "홍대" })      → 쿼리 붙여서 GET
//   api.post("/api/parties", { ... })             → JSON 본문
//   api.upload("/api/members/owner", form)        → 파일 올리기 (multipart, 명세 1-6). form 은 FormData 또는 <form>
//   api.upload("/api/owner/stores/3", form, "PUT") → 수정(C-4·C-8)처럼 PUT 으로 올릴 때
//   api.blob("/api/admin/members/2/biz-file")     → 토큰이 필요한 이미지 (A-11·C-15). URL.createObjectURL(blob) 로 보여 주기

const API_BASE = "http://localhost:8081";

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

  // 토큰 안의 값 읽기 (서명 검사는 서버가 한다. 화면을 그릴 때만 쓴다)
  // { memberId, nickname, role } 또는 null
  function me() {
    const t = token();
    if (!t) return null;
    try {
      const part = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(part).split("").map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        }).join("")
      );
      const p = JSON.parse(json);
      if (p.exp && p.exp * 1000 < Date.now()) { clear(); return null; }
      return { memberId: Number(p.sub), nickname: p.nickname, role: p.role };
    } catch (e) {
      clear();
      return null;
    }
  }

  function goLogin() {
    location.href = Routes.url("login", { next: Routes.current() });
  }

  return { token: token, save: save, clear: clear, me: me, goLogin: goLogin };
})();

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const api = (function () {
  // asBlob: 응답을 JSON 대신 파일(Blob)로 받기 (이미지 내려받기)
  async function request(method, path, body, asBlob) {
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
      // 401: 토큰이 없거나 만료 → 토큰 지우고 로그인 화면으로 (명세 1-5)
      //   단, 로그인 요청(A-6)의 401 은 "아이디 또는 비밀번호가 틀렸습니다" → 화면에 문구만 보여 준다
      if (res.status === 401 && path !== "/api/auth/login") {
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
