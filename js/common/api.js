// 백엔드 요청은 모두 이 파일을 거친다 (API 명세 1-1, 1-3, 1-5)
//   - 서버 주소는 여기 한 곳에만 적는다
//   - 토큰은 sessionStorage "token" 에 둔다 (로그인 화면이 저장, 로그아웃은 지우기만)
//   - 실패하면 ApiError(status, message) 를 던진다. message 는 서버가 준 한국어 문장
// ※ 공용 파일(A 담당). 파일 올리기용 함수(api.upload)는 A가 이어서 채우기로 함.

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
  async function request(method, path, body) {
    const headers = {};
    const t = Auth.token();
    if (t) headers.Authorization = "Bearer " + t;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res;
    try {
      res = await fetch(API_BASE + path, {
        method: method,
        headers: headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new ApiError(0, "서버에 연결할 수 없어요. 백엔드(:8081)가 켜져 있는지 확인해 주세요.");
    }

    if (res.status === 204) return null;
    const data = await res.json().catch(function () { return null; });

    if (!res.ok) {
      const msg = (data && data.message) || "요청을 처리하지 못했어요. (" + res.status + ")";
      // 401: 토큰이 없거나 만료 → 토큰 지우고 로그인 화면으로 (명세 1-5)
      if (res.status === 401) {
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
  };
})();
