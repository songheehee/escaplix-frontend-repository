// 아이디 찾기 (pages/member/find-id.html) · A 담당
//   가입한 이메일 → 그 이메일로 아이디를 메일로 받는다.
//   가입한 이메일이 아니어도 화면은 똑같이 "가입한 계정이 있으면 보냈어요" (남의 가입 여부를 캐낼 수 없게)
//   같은 이메일로는 60초에 한 번 (서버 429)
(function () {
  const $ = UI.$;
  const R = MemberForm.rules;

  if (Auth.me()) { location.replace(Routes.url("home")); return; }

  $("back-link").href = Routes.url("login");
  $("login-link").href = Routes.url("login");
  $("find-pw-link").href = Routes.url("findPassword");

  const form = $("find-form");
  const input = $("email");
  const msg = $("email-msg");
  const info = $("find-info");
  const errorBox = $("find-error");
  const btn = $("find-btn");
  const BTN_TEXT = btn.textContent;
  let timer = null;

  input.focus();
  input.addEventListener("input", function () {
    MemberForm.setMsg(msg, input, "", "");
    errorBox.hidden = true;
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    errorBox.hidden = true;
    const email = input.value.trim().toLowerCase();
    const err = email ? R.email(email) : "이메일을 입력해 주세요.";
    if (err) { MemberForm.setMsg(msg, input, err, "bad"); input.focus(); return; }

    btn.disabled = true;
    btn.textContent = "보내는 중…";
    try {
      await api.post("/api/auth/find-id", { email: email });
      info.textContent = "입력한 이메일로 가입한 계정이 있으면 아이디를 보냈어요. 메일함(안 보이면 스팸함)을 확인해 주세요.";
      info.hidden = false;
      cooldown(60);
    } catch (ex) {
      errorBox.textContent = ex.message;   // 429 "n초 뒤에 다시 시도해 주세요." 등
      errorBox.hidden = false;
      btn.disabled = false;
      btn.textContent = BTN_TEXT;
    }
  });

  // 서버와 같은 60초: 버튼에 남은 초를 보여 주고 끝나면 "다시 받기"
  function cooldown(sec) {
    clearInterval(timer);
    let left = sec;
    btn.disabled = true;
    btn.textContent = "다시 받기 (" + left + ")";
    timer = setInterval(function () {
      left--;
      if (left > 0) { btn.textContent = "다시 받기 (" + left + ")"; return; }
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = "다시 받기";
    }, 1000);
  }
})();
