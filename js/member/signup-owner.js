// S03-2 사장 회원가입 (pages/member/signup-owner.html) · A 담당
//   A-3 아이디 · A-4 닉네임 · A-5 사업자번호 중복 확인 · A-2 가입 (multipart, api.upload)
//   성공하면 로그인 화면으로 (아이디를 채워서). 승인은 매장 단위라 가입하면 바로 로그인할 수 있다
(function () {
  const $ = UI.$;
  const R = MemberForm.rules;
  const MAX_BYTES = 5 * 1024 * 1024;
  const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

  if (Auth.me()) { location.replace(Routes.url("home")); return; }

  $("back-link").href = Routes.url("signup");
  $("login-link").href = Routes.url("login");

  const form = $("signup-form");
  const errorBox = $("form-error");
  const submitBtn = $("submit-btn");
  const bizInput = $("bizNo");
  const fileInput = $("bizFile");

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
  // 숫자만 쳐도 000-00-00000 으로 (dupCheck 의 input 검사보다 먼저 돌도록 먼저 붙인다)
  bizInput.addEventListener("input", function () {
    const d = bizInput.value.replace(/\D/g, "").slice(0, 10);
    const f = d.length > 5 ? d.slice(0, 3) + "-" + d.slice(3, 5) + "-" + d.slice(5)
            : d.length > 3 ? d.slice(0, 3) + "-" + d.slice(3) : d;
    if (f !== bizInput.value) bizInput.value = f;
  });
  const bizCheck = MemberForm.dupCheck({
    input: bizInput, button: $("bizNo-check"), msg: $("bizNo-msg"),
    path: "/api/members/check-biz-no", param: "bizNo",
    validate: R.bizNo, emptyText: "사업자등록번호를 입력해 주세요.",
    okText: "등록되지 않은 번호예요.", takenText: "이미 등록된 사업자등록번호예요.",
  });
  const pwCheck = MemberForm.passwordMatch($("password"), $("password2"), $("password-msg"), $("password2-msg"), R.password);

  // 칸을 고치거나 파일을 바꾸면 지난번 서버 오류 문구는 치운다
  form.addEventListener("input", function () { errorBox.hidden = true; });
  form.addEventListener("change", function () { errorBox.hidden = true; });

  // ---------- 사업자등록증 이미지: 고르면 바로 미리보기, 형식·크기는 올리기 전에 검사 ----------
  let previewUrl = null;
  fileInput.addEventListener("change", function () { checkFile(); });

  function checkFile() {
    const f = fileInput.files[0];
    const msg = $("bizFile-msg");
    const img = $("file-preview");
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    img.hidden = true;
    $("file-drop").classList.remove("has-file");
    $("file-text").firstChild.textContent = "눌러서 이미지 고르기";

    if (!f) { MemberForm.setMsg(msg, fileInput, "사업자등록증 이미지를 골라 주세요.", "bad"); return false; }
    if (IMAGE_TYPES.indexOf(f.type) < 0) {
      MemberForm.setMsg(msg, fileInput, "이미지 파일(jpg, png, webp)만 올릴 수 있습니다.", "bad");
      fileInput.value = "";
      return false;
    }
    if (f.size > MAX_BYTES) {
      MemberForm.setMsg(msg, fileInput, "파일은 5MB까지 올릴 수 있습니다. (지금 " + (f.size / 1024 / 1024).toFixed(1) + "MB)", "bad");
      fileInput.value = "";
      return false;
    }
    previewUrl = URL.createObjectURL(f);
    img.src = previewUrl;
    img.hidden = false;
    $("file-drop").classList.add("has-file");
    $("file-text").firstChild.textContent = "다른 이미지로 바꾸기";
    MemberForm.setMsg(msg, fileInput, f.name + " (" + Math.max(1, Math.round(f.size / 1024)) + "KB)", "ok");
    return true;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    // 위에서부터 차례로 확인 (틀린 칸으로 커서가 감)
    if (!(await idCheck.ensure())) return;
    if (!pwCheck.ok()) return;
    if (!(await nickCheck.ensure())) return;
    if (!(await bizCheck.ensure())) return;
    if (!checkFile()) { fileInput.focus(); return; }

    // 서버로 보낼 칸만 (비밀번호 확인 칸은 보내지 않음)
    const fd = new FormData();
    fd.append("loginId", $("loginId").value.trim());
    fd.append("password", $("password").value);
    fd.append("nickname", $("nickname").value.trim());
    fd.append("bizNo", bizInput.value.trim());
    fd.append("bizFile", fileInput.files[0]);

    submitBtn.disabled = true;
    submitBtn.textContent = "가입하는 중…";
    try {
      await api.upload("/api/members/owner", fd);
      location.replace(Routes.url("login", { id: fd.get("loginId"), joined: 1 }));
    } catch (err) {
      // 확인한 뒤에 다른 사람이 먼저 썼으면 409 → 그 칸에 표시
      if (err.status === 409 && err.message.indexOf("아이디") >= 0) idCheck.taken(err.message);
      else if (err.status === 409 && err.message.indexOf("닉네임") >= 0) nickCheck.taken(err.message);
      else if (err.status === 409 && err.message.indexOf("사업자") >= 0) bizCheck.taken(err.message);
      else { errorBox.textContent = err.message; errorBox.hidden = false; errorBox.scrollIntoView({ block: "center" }); }
      submitBtn.disabled = false;
      submitBtn.textContent = "가입하기";
    }
  });
})();
