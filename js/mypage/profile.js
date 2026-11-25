// S26 내 정보 (pages/mypage/profile.html) · A 담당 (선호 장르 칸만 D 담당 API)
//   A-7 내 정보 · A-8 닉네임 (+ A-4 중복 확인) · A-9 비밀번호 · 이메일 등록·수정 · D-7/D-8 선호 장르 (손님만) · 회원 탈퇴
//   손님·사장·관리자 모두 헤더 "내 정보"로 들어온다. 손님에게만 마이페이지 탭을 보여 준다
//   화면: 카드 하나에 아이디 · 비밀번호 · 닉네임 · 선호 장르 줄. [수정]을 누르면 팝업에서 고친다
(function () {
  const $ = UI.$;
  const el = UI.el;
  const R = MemberForm.rules;

  let info = null;   // A-7 응답

  const me = Auth.me();
  if (!me) { Auth.goLogin(); return; }

  const isUser = me.role === "USER";
  if (isUser) {
    $("p-title").textContent = me.nickname + " 님의 마이페이지";
    $("my-tabs").hidden = false;
    $("tab-mypage").href = Routes.url("mypage");
    $("tab-wishes").href = Routes.url("wishes");
    $("tab-chats").href = Routes.url("chats");
    $("tab-profile").href = Routes.url("profile");
  } else {
    $("my-tabs").remove();   // 탭 자리째 없앰
    document.querySelector("main").classList.add("profile-solo");
  }

  start().finally(function () { document.body.classList.add("my-ready"); });   // 다 불러오면 탭 아래 내용을 한 번에 보여 줌 (깜빡임 방지, common.css)

  async function start() {
    const box = $("profile");
    try {
      info = await api.get("/api/members/me");
    } catch (e) {
      box.textContent = "";
      box.removeAttribute("aria-busy");
      box.append(UI.emptyBox(e.message));
      return;
    }
    box.textContent = "";
    box.append($("profile-tpl").content.cloneNode(true));
    box.removeAttribute("aria-busy");

    $("v-loginId").textContent = info.loginId;
    if (info.role === "OWNER" && info.bizNo) {
      $("v-biz").textContent = info.bizNo;
      $("row-biz").hidden = false;
    }
    setupPassword();
    setupNickname();
    setupEmail();
    if (info.role !== "ADMIN") setupWithdraw();
    if (isUser) setupGenres();
  }

  // 팝업 공통: [취소]·✕·Esc·바깥 누르기로 닫기
  //   바깥 닫기는 누르기 시작한 곳도 바깥일 때만 (칸 안에서 글자를 드래그하다 바깥에서 떼면 안 닫히게)
  //   onReset: 열 때마다 칸을 비우는 함수
  function dialog(id, onReset) {
    const d = $(id);
    let downOutside = false;
    d.addEventListener("pointerdown", function (e) { downOutside = e.target === d; });
    d.addEventListener("click", function (e) { if (e.target === d && downOutside) d.close(); });
    d.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { d.close(); }); });
    return {
      open: function () { onReset(); d.showModal(); },
      close: function () { d.close(); },
    };
  }

  // ---------- 비밀번호 (A-9) ----------
  function setupPassword() {
    const now = $("pw-now");
    const pw = $("pw-new");
    const pw2 = $("pw-new2");
    const nowMsg = $("pw-now-msg");
    const save = $("pw-save");
    $("pw-user").value = info.loginId;   // 비밀번호 관리자(브라우저)가 어느 계정인지 알게

    const pwCheck = MemberForm.passwordMatch(pw, pw2, $("pw-new-msg"), $("pw-new2-msg"), R.password);
    now.addEventListener("input", function () { MemberForm.setMsg(nowMsg, now, "", ""); });

    const dlg = dialog("pw-dialog", function () {
      [now, pw, pw2].forEach(function (i) {
        i.value = "";
        MemberForm.setMsg($(i.id + "-msg"), i, "", "");
      });
      save.disabled = false;
    });
    $("pw-edit").addEventListener("click", dlg.open);

    $("pw-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!now.value) { MemberForm.setMsg(nowMsg, now, "현재 비밀번호를 입력해 주세요.", "bad"); now.focus(); return; }
      if (!pwCheck.ok()) return;
      if (now.value === pw.value) {
        MemberForm.setMsg($("pw-new-msg"), pw, "지금 비밀번호와 다른 비밀번호를 입력해 주세요.", "bad");
        pw.focus();
        return;
      }
      save.disabled = true;
      try {
        await api.put("/api/members/me/password", { currentPassword: now.value, newPassword: pw.value });
        dlg.close();
        UI.toast("비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 써 주세요.");
      } catch (err) {
        // 틀려도 401 이 아니라 400 (명세 A-9). 어느 칸 문제인지 문구로 나눔
        if (err.message.indexOf("현재") >= 0) { MemberForm.setMsg(nowMsg, now, err.message, "bad"); now.value = ""; now.focus(); }
        else { MemberForm.setMsg($("pw-new-msg"), pw, err.message, "bad"); pw.focus(); }
      } finally {
        save.disabled = false;
      }
    });
  }

  // ---------- 이메일 등록·수정 ----------
  //   새 이메일로 인증번호 → [확인]이 맞으면 서버가 바로 바꾼다 (저장 버튼 없음)
  //   이메일 칸 생기기 전에 가입한 회원은 "등록 안 함" → [등록]
  function setupEmail() {
    function paint() {
      const v = $("v-email");
      v.textContent = info.email || "등록 안 함";
      v.classList.toggle("is-empty", !info.email);
      $("email-edit").textContent = info.email ? "수정" : "등록";
      $("email-edit").setAttribute("aria-label", info.email ? "이메일 수정" : "이메일 등록");
      $("email-title").textContent = info.email ? "이메일 수정" : "이메일 등록";
    }
    paint();

    const emailCheck = MemberForm.emailVerify({
      input: $("email"), sendBtn: $("email-send"), msg: $("email-msg"),
      codeRow: $("email-code-row"), code: $("email-code"), verifyBtn: $("email-verify"), codeMsg: $("email-code-msg"),
      sendPath: "/api/members/me/email-code", verifyPath: "/api/members/me/email",
      onVerified: function () {
        const wasEmpty = !info.email;
        info.email = emailCheck.value();
        paint();
        dlg.close();
        UI.toast(wasEmpty ? "이메일을 등록했어요." : "이메일을 바꿨어요.");
      },
    });
    // 아래 [저장] = 인증번호 확인 (맞으면 바로 이메일이 바뀜). 칸 옆 [확인]은 숨기고 [저장]이 대신 누름
    //   [저장]은 인증번호 줄이 열리고 6자리를 다 쳤을 때만 켜짐 (확인 중에는 꺼짐)
    const save = $("email-save");
    function paintSave() {
      save.disabled = $("email-code-row").hidden || $("email-verify").disabled || $("email-code").value.length !== 6;
    }
    $("email-code").addEventListener("input", paintSave);
    new MutationObserver(paintSave).observe($("email-code-row"), { attributes: true, attributeFilter: ["hidden"] });
    new MutationObserver(paintSave).observe($("email-verify"), { attributes: true, attributeFilter: ["disabled"] });
    // [저장]·Enter: 인증번호 줄이 열려 있으면 확인(=저장), 아니면 인증번호 발송 (폼 제출로 새로고침되지 않게)
    $("email-form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!$("email-code-row").hidden) { if ($("email-code").value.length === 6) $("email-verify").click(); }
      else $("email-send").click();
    });

    const dlg = dialog("email-dialog", function () {
      emailCheck.reset();
      paintSave();
      $("email").placeholder = info.email ? "지금 이메일: " + info.email : "이메일 주소";
    });
    $("email-edit").addEventListener("click", function () { dlg.open(); $("email").focus(); });
  }

  // ---------- 회원 탈퇴 ----------
  //   서버가 비밀번호를 다시 확인한다. 매장이 남은 사장은 409 (팝업 안에 문구)
  //   성공하면 토큰을 지우고 로그인 화면으로 ("탈퇴했어요" 안내)
  function setupWithdraw() {
    $("withdraw-line").hidden = false;
    $("wd-user").value = info.loginId;
    const list = $("withdraw-list");
    const pw = $("wd-pw");
    const pwMsg = $("wd-pw-msg");
    const agree = $("wd-agree");
    const save = $("wd-save");
    const errorBox = $("withdraw-error");

    const lines = info.role === "OWNER"
      ? ["매장이 남아 있으면 탈퇴할 수 없어요. 매장을 먼저 정리해 주세요.",
         "사업자 등록번호와 사업자등록증은 지워져요."]
      : ["참여 중인 파티에서 나가고, 내가 방장인 진행 전 파티는 삭제돼요.",
         "찜 목록과 선호 장르는 지워져요.",
         "남긴 후기와 지난 채팅은 \"탈퇴한 회원\"으로 남아요."];
    lines.push("탈퇴하면 되돌릴 수 없어요. 같은 아이디·이메일로 새로 가입할 수는 있어요.");
    lines.forEach(function (t) { list.append(el("li", null, t)); });

    function paintSave() { save.disabled = !agree.checked || !pw.value; }
    agree.addEventListener("change", paintSave);
    pw.addEventListener("input", function () { MemberForm.setMsg(pwMsg, pw, "", ""); errorBox.hidden = true; paintSave(); });

    const dlg = dialog("withdraw-dialog", function () {
      pw.value = "";
      agree.checked = false;
      errorBox.hidden = true;
      MemberForm.setMsg(pwMsg, pw, "", "");
      paintSave();
    });
    $("withdraw-open").addEventListener("click", function () { dlg.open(); pw.focus(); });

    $("withdraw-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!pw.value) { MemberForm.setMsg(pwMsg, pw, "비밀번호를 입력해 주세요.", "bad"); pw.focus(); return; }
      if (!agree.checked) return;
      save.disabled = true;
      save.textContent = "탈퇴하는 중…";
      try {
        await api.post("/api/members/me/withdraw", { password: pw.value });
        Auth.clear();
        location.replace(Routes.url("login", { bye: 1 }));
      } catch (err) {
        if (err.status === 400) { MemberForm.setMsg(pwMsg, pw, err.message, "bad"); pw.value = ""; pw.focus(); }
        else { errorBox.textContent = err.message; errorBox.hidden = false; }   // 409 매장이 남음 등
        save.textContent = "탈퇴하기";
        paintSave();
      }
    });
  }

  // ---------- 닉네임 (A-8, 중복 확인 A-4) ----------
  //   새 닉네임 칸은 비어서 열림. "중복 확인"을 통과해야 [저장]이 켜짐
  function setupNickname() {
    const nick = $("nickname");
    const msg = $("nickname-msg");
    const save = $("nick-save");
    $("v-nickname").textContent = info.nickname;

    let nickOk = false;   // 지금 칸의 닉네임이 중복 확인을 통과했는지
    const nickCheck = MemberForm.dupCheck({
      input: nick, button: $("nickname-check"), msg: msg,
      path: "/api/members/check-nickname", param: "nickname",
      // 지금 닉네임 그대로면 "이미 사용 중"이 아니라 바꿀 게 없다고 알려 줌
      validate: function (v) { return v === info.nickname ? "지금 쓰고 있는 닉네임이에요." : R.nickname(v); },
      emptyText: "새 닉네임을 입력해 주세요.",
      okText: "사용할 수 있는 닉네임이에요.", takenText: "이미 사용 중인 닉네임이에요.",
    });
    function paintSave() { save.disabled = !nickOk || nick.value.trim() === ""; }
    nick.addEventListener("input", function () { nickOk = false; paintSave(); });
    // dupCheck 가 먼저 확인을 시작하고, 여기서는 같은 결과를 받아 저장 버튼을 켬
    $("nickname-check").addEventListener("click", async function () {
      nickOk = await nickCheck.ensure();
      paintSave();
    });

    const dlg = dialog("nick-dialog", function () {
      nick.value = "";
      nick.placeholder = "";   // "지금 닉네임: …" 안내는 안 보여 줌
      nickOk = false;
      MemberForm.setMsg(msg, nick, "", "");
      paintSave();
    });
    $("nick-edit").addEventListener("click", dlg.open);

    $("nick-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!nickOk) { MemberForm.setMsg(msg, nick, "중복 확인을 눌러 주세요.", "bad"); return; }
      save.disabled = true;
      try {
        const res = await api.put("/api/members/me", { nickname: nick.value.trim() });
        Auth.save(res.token);   // 토큰 안에 닉네임이 있어서 새 토큰으로 바꿈 (명세 A-8)
        info.nickname = res.nickname;
        $("v-nickname").textContent = res.nickname;
        paintNickname(res.nickname);
        nickOk = false;
        dlg.close();
        UI.toast("닉네임을 바꿨어요.");
      } catch (err) {
        nickOk = false;
        if (err.status === 409) nickCheck.taken(err.message);
        else MemberForm.setMsg(msg, nick, err.message, "bad");
      } finally {
        paintSave();
      }
    });
  }

  // 새로고침 없이 화면 곳곳의 닉네임을 바꾼다 (제목 · 헤더 프로필)
  function paintNickname(name) {
    if (isUser) $("p-title").textContent = name + " 님의 마이페이지";
    const pmName = document.querySelector(".pm-name");
    if (pmName) pmName.textContent = name + " 님";
    document.querySelectorAll(".profile-btn .avatar, .pm-avatar").forEach(function (x) { x.textContent = name.slice(0, 1); });
    const btn = document.querySelector(".profile-btn");
    if (btn) btn.setAttribute("aria-label", name + " 님 메뉴");
  }

  // ---------- 선호 장르 (D-7 보기, D-8 통째로 저장) · 손님만 ----------
  async function setupGenres() {
    const row = $("row-genre");
    const value = $("v-genres");
    const edit = $("genre-edit");
    const box = $("genres");
    const msg = $("genre-msg");
    const saveBtn = $("genre-save");
    row.hidden = false;
    edit.disabled = true;   // 다 불러오기 전에는 못 누름
    value.textContent = "불러오는 중…";

    let all;
    let mine;   // [{ genreId, name }]
    try {
      all = await api.get("/api/genres");
      mine = await api.get("/api/my/genres");
    } catch (e) {
      value.textContent = e.message;
      value.classList.add("is-empty");
      return;
    }

    function paintValue() {
      value.textContent = mine.length ? mine.map(function (g) { return g.name; }).join(", ") : "아직 고르지 않았어요";
      value.classList.toggle("is-empty", !mine.length);
    }
    paintValue();
    edit.disabled = false;

    all.forEach(function (g) {
      const label = el("label", "gchip");
      const cb = el("input");
      cb.type = "checkbox";
      cb.value = g.genreId;
      label.append(cb, el("span", null, g.name));
      box.append(label);
    });
    box.addEventListener("change", function () { MemberForm.setMsg(msg, null, "", ""); });

    // 열 때마다 지금 저장된 장르로 체크를 맞춤 (고르다 취소한 건 버림)
    const dlg = dialog("genre-dialog", function () {
      const picked = new Set(mine.map(function (g) { return g.genreId; }));
      box.querySelectorAll("input").forEach(function (c) { c.checked = picked.has(Number(c.value)); });
      MemberForm.setMsg(msg, null, "", "");
      saveBtn.disabled = false;
    });
    edit.addEventListener("click", dlg.open);

    $("genre-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      const ids = Array.from(box.querySelectorAll("input:checked")).map(function (c) { return Number(c.value); });
      saveBtn.disabled = true;
      try {
        mine = await api.put("/api/my/genres", { genreIds: ids });
        paintValue();
        dlg.close();
        UI.toast(mine.length ? "선호 장르를 저장했어요." : "선호 장르를 모두 비웠어요.");
      } catch (err) {
        MemberForm.setMsg(msg, null, err.message, "bad");
      } finally {
        saveBtn.disabled = false;
      }
    });
  }
})();
