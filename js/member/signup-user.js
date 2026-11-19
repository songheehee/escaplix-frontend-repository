// S03-1 손님 회원가입 (pages/member/signup-user.html) · A 담당
//   A-3 아이디 중복 · A-4 닉네임 중복 · B-7 장르 목록 · A-1 가입
//   성공하면 로그인 화면으로 (아이디를 채워서)
(function () {
  const $ = UI.$;
  const el = UI.el;
  const R = MemberForm.rules;

  if (Auth.me()) { location.replace(Routes.url("home")); return; }

  $("back-link").href = Routes.url("signup");
  $("login-link").href = Routes.url("login");

  const form = $("signup-form");
  const errorBox = $("form-error");
  const submitBtn = $("submit-btn");

  const idCheck = MemberForm.dupCheck({
    input: $("loginId"), button: $("loginId-check"), msg: $("loginId-msg"),
    path: "/api/members/check-login-id", param: "loginId",
    validate: R.loginId, emptyText: "아이디를 입력해 주세요.",
    okText: "사용할 수 있는 아이디예요.", takenText: "이미 사용 중인 아이디예요.",
  });
  const nickCheck = MemberForm.dupCheck({
    input: $("nickname"), button: $("nickname-check"), msg: $("nickname-msg"),
    path: "/api/members/check-nickname", param: "nickname",
    validate: R.nickname, emptyText: "닉네임을 입력해 주세요.",
    okText: "사용할 수 있는 닉네임이에요.", takenText: "이미 사용 중인 닉네임이에요.",
  });
  const pwCheck = MemberForm.passwordMatch($("password"), $("password2"), $("password-msg"), $("password2-msg"), R.password);

  loadGenres();

  // B-7 장르 목록 → 고르는 칩. 못 불러와도 가입은 할 수 있다 (장르는 선택)
  async function loadGenres() {
    const box = $("genres");
    try {
      const genres = await api.get("/api/genres");
      genres.forEach(function (g) {
        const label = el("label", "gchip");
        const cb = el("input");
        cb.type = "checkbox";
        cb.name = "genreIds";
        cb.value = g.genreId;
        label.append(cb, el("span", null, g.name));
        box.append(label);
      });
    } catch (e) {
      box.append(el("span", "muted", "장르를 불러오지 못했어요. 장르는 나중에 마이페이지에서 고를 수 있어요."));
    }
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    // 위에서부터 차례로 확인 (틀린 칸으로 커서가 감)
    if (!(await idCheck.ensure())) return;
    if (!pwCheck.ok()) return;
    if (!(await nickCheck.ensure())) return;

    const body = {
      loginId: $("loginId").value.trim(),
      password: $("password").value,
      nickname: $("nickname").value.trim(),
      genreIds: Array.from(form.querySelectorAll("input[name=genreIds]:checked")).map(function (c) { return Number(c.value); }),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "가입하는 중…";
    try {
      await api.post("/api/members/user", body);
      location.replace(Routes.url("login", { id: body.loginId, joined: 1 }));
    } catch (err) {
      // 확인한 뒤에 다른 사람이 먼저 가입했으면 409 → 그 칸에 표시
      if (err.status === 409 && err.message.indexOf("아이디") >= 0) idCheck.taken(err.message);
      else if (err.status === 409 && err.message.indexOf("닉네임") >= 0) nickCheck.taken(err.message);
      else { errorBox.textContent = err.message; errorBox.hidden = false; errorBox.scrollIntoView({ block: "center" }); }
      submitBtn.disabled = false;
      submitBtn.textContent = "가입하기";
    }
  });
})();
