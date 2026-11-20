// S03 가입 유형 고르기 (pages/member/signup.html) · A 담당 · API 없음
//   손님 가입 / 사장 가입 화면으로 보내기만 한다
(function () {
  const $ = UI.$;

  // 이미 로그인했으면 가입할 필요가 없다
  if (Auth.me()) { location.replace(Routes.url("home")); return; }

  $("go-user").href = Routes.url("signupUser");
  $("go-owner").href = Routes.url("signupOwner");
  $("login-link").href = Routes.url("login");
})();
