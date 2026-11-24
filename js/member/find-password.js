// 비밀번호 찾기 (pages/member/find-password.html) · A 담당
//   1) 아이디 + 가입한 이메일 → 인증번호 받기 (맞을 때만 메일이 가지만, 화면은 언제나 "맞으면 보냈어요")
//   2) 인증번호 확인 → 새 비밀번호 칸이 열림
//   3) 새 비밀번호 → 로그인 화면으로 (아이디를 채워서)
(function () {
  const $ = UI.$;
  const R = MemberForm.rules;

  if (Auth.me()) { location.replace(Routes.url("home")); return; }

  $("back-link").href = Routes.url("login");

  const form = $("reset-form");
  const errorBox = $("form-error");
  const submitBtn = $("submit-btn");
  const idInput = $("loginId");
  const newPw = $("new-pw");

  // 로그인 화면에서 아이디를 친 채로 왔으면 채워 둔다 (?id=)
  const presetId = new URLSearchParams(location.search).get("id");
  if (presetId) idInput.value = presetId;
  (idInput.value ? $("email") : idInput).focus();

  const loginId = function () { return idInput.value.trim(); };

  const emailCheck = MemberForm.emailVerify({
    input: $("email"), sendBtn: $("email-send"), msg: $("email-msg"),
    codeRow: $("email-code-row"), code: $("email-code"), verifyBtn: $("email-verify"), codeMsg: $("email-code-msg"),
    sendPath: "/api/auth/password-reset/code", verifyPath: "/api/auth/password-reset/verify",
    extra: function () { return { loginId: loginId() }; },
    watch: [idInput],
    checkExtra: function () {
      if (loginId()) return true;
      MemberForm.setMsg($("loginId-msg"), idInput, "아이디를 입력해 주세요.", "bad");
      idInput.focus();
      return false;
    },
    // 아이디·이메일이 맞는지는 알려 주지 않는다 (남의 가입 여부를 캐낼 수 없게)
    sentText: "아이디와 이메일이 맞으면 인증번호를 보냈어요. 메일함(안 보이면 스팸함)을 확인해 주세요.",
    verifiedText: "인증을 마쳤어요. 새 비밀번호를 정해 주세요.",
    onVerified: function () {
      newPw.hidden = false;
      $("password").focus();
    },
  });
  const pwCheck = MemberForm.passwordMatch($("password"), $("password2"), $("password-msg"), $("password2-msg"), R.password);

  // 아이디를 고치면 문구를 지우고, 인증이 풀리면 새 비밀번호 칸도 닫는다
  idInput.addEventListener("input", function () {
    MemberForm.setMsg($("loginId-msg"), idInput, "", "");
    newPw.hidden = true;
  });
  $("email").addEventListener("input", function () { newPw.hidden = true; });
  form.addEventListener("input", function () { errorBox.hidden = true; });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    errorBox.hidden = true;
    if (!emailCheck.ensure()) { newPw.hidden = true; return; }
    if (!pwCheck.ok()) return;

    const id = loginId();
    submitBtn.disabled = true;
    submitBtn.textContent = "바꾸는 중…";
    try {
      await api.post("/api/auth/password-reset", { loginId: id, email: emailCheck.value(), newPassword: $("password").value });
      location.replace(Routes.url("login", { id: id, reset: 1 }));
    } catch (err) {
      if (err.status === 400 && err.message.indexOf("이메일 인증") >= 0) {   // 인증하고 30분이 지남 등
        newPw.hidden = true;
        emailCheck.expired(err.message);
      } else {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "비밀번호 바꾸기";
    }
  });
})();
