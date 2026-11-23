// S02 로그인 (pages/member/login.html) · A 담당 · A-6
//   로그인이 필요한 화면은 Auth.goLogin() 으로 여기로 보낸다 → ?next=돌아갈 화면 (프로젝트 맨 위 기준 주소)
//   성공하면 토큰을 저장하고 next 로, next 가 없으면 역할별 홈으로 간다
(function () {
  const $ = UI.$;
  const form = $("login-form");
  const errorBox = $("login-error");
  const btn = $("login-btn");
  const idInput = $("loginId");
  const pwInput = $("password");

  // 역할별 첫 화면 (header.js 의 로고 주소와 같음)
  const HOME_BY_ROLE = { USER: "home", OWNER: "owner", ADMIN: "admin" };

  $("signup-link").href = Routes.url("signup");

  // 이미 로그인했으면 이 화면에 머물 이유가 없다
  const already = Auth.me();
  if (already) { location.replace(nextUrl(already.role)); return; }

  // 가입하고 넘어왔을 때 (?id=아이디&joined=1): 아이디를 채우고 비밀번호 칸으로
  const params = new URLSearchParams(location.search);
  if (params.get("joined")) {
    const info = $("login-info");
    info.textContent = "가입했어요! 비밀번호를 입력해 로그인해 주세요.";
    info.hidden = false;
  }
  if (params.get("id")) idInput.value = params.get("id");
  (idInput.value ? pwInput : idInput).focus();

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const loginId = idInput.value.trim();
    const password = pwInput.value;
    if (!loginId || !password) {
      showError(!loginId ? "아이디를 입력해 주세요." : "비밀번호를 입력해 주세요.");
      (!loginId ? idInput : pwInput).focus();
      return;
    }

    hideError();
    $("login-info").hidden = true;
    btn.disabled = true;
    btn.textContent = "로그인 중…";
    try {
      const res = await api.post("/api/auth/login", { loginId: loginId, password: password });
      Auth.save(res.token);
      location.replace(nextUrl(res.role));
    } catch (err) {
      // 401 이면 서버 문구 "아이디 또는 비밀번호가 틀렸습니다." 를 그대로 (어느 쪽이 틀렸는지 알려 주지 않음)
      showError(err.message);
      pwInput.value = "";
      pwInput.focus();
      btn.disabled = false;
      btn.textContent = "로그인";
    }
  });

  // 입력을 다시 시작하면 오류 표시를 지운다
  [idInput, pwInput].forEach(function (input) {
    input.addEventListener("input", function () { input.removeAttribute("aria-invalid"); });
  });

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    idInput.setAttribute("aria-invalid", "true");
    pwInput.setAttribute("aria-invalid", "true");
  }
  function hideError() {
    errorBox.hidden = true;
    idInput.removeAttribute("aria-invalid");
    pwInput.removeAttribute("aria-invalid");
  }

  // 돌아갈 주소. ?next= 는 프로젝트 안쪽 화면만 받는다 (https://다른사이트 같은 주소로 보내지 않게)
  function nextUrl(role) {
    const fallback = Routes.url(HOME_BY_ROLE[role] || "home");
    const next = new URLSearchParams(location.search).get("next");
    if (!next) return fallback;
    try {
      const u = new URL(next, Routes.ROOT);
      if (u.origin !== location.origin || u.href.indexOf(Routes.ROOT) !== 0) return fallback;
      if (u.pathname === new URL(Routes.url("login")).pathname) return fallback;   // 로그인 화면으로 다시 오면 무한 반복
      // 관리자는 손님 화면(메인 등)에서 할 일이 없어서, 돌아갈 곳이 관리자·매장 관리 화면이 아니면 관리자 홈으로
      if (role === "ADMIN" && !/\/pages\/(admin|owner)\//.test(u.pathname)) return fallback;
      return u.href;
    } catch (e) {
      return fallback;
    }
  }
})();
