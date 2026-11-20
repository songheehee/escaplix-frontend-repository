// S26 내 정보 (pages/mypage/profile.html) · A 담당 (선호 장르 칸만 D 담당 API)
//   A-7 내 정보 · A-8 닉네임 (+ A-4 중복 확인) · A-9 비밀번호 · D-7/D-8 선호 장르 (손님만)
//   손님·사장·관리자 모두 헤더 "내 정보"로 들어온다. 손님에게만 마이페이지 탭을 보여 준다
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

  start();

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
    setupInfo();
    setupPassword();
    if (isUser) setupGenres();
  }

  // ---------- 1. 기본 정보 · 닉네임 (A-7, A-8) ----------
  function setupInfo() {
    $("loginId").value = info.loginId;
    $("pw-user").value = info.loginId;   // 비밀번호 관리자(브라우저)가 어느 계정인지 알게
    const nick = $("nickname");
    nick.value = info.nickname;

    const dl = $("pinfo");
    function row(k, v) { dl.append(el("dt", null, k), el("dd", null, v)); }
    if (info.createdAt) row("가입일", info.createdAt.slice(0, 10));
    if (info.role === "OWNER" && info.bizNo) row("사업자등록번호", info.bizNo);

    const nickCheck = MemberForm.dupCheck({
      input: nick, button: $("nickname-check"), msg: $("nickname-msg"),
      path: "/api/members/check-nickname", param: "nickname",
      // 지금 닉네임 그대로면 "이미 사용 중"이 아니라 바꿀 게 없다고 알려 줌
      validate: function (v) { return v === info.nickname ? "지금 쓰고 있는 닉네임이에요." : R.nickname(v); },
      emptyText: "닉네임을 입력해 주세요.",
      okText: "사용할 수 있는 닉네임이에요.", takenText: "이미 사용 중인 닉네임이에요.",
    });

    $("info-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      if (nick.value.trim() === info.nickname) { MemberForm.setMsg($("nickname-msg"), nick, "바뀐 닉네임이 없어요.", ""); return; }
      if (!(await nickCheck.ensure())) return;
      const btn = $("info-save");
      btn.disabled = true;
      try {
        const res = await api.put("/api/members/me", { nickname: nick.value.trim() });
        Auth.save(res.token);   // 토큰 안에 닉네임이 있어서 새 토큰으로 바꿈 (명세 A-8)
        info.nickname = res.nickname;
        nick.value = res.nickname;
        MemberForm.setMsg($("nickname-msg"), nick, "", "");
        paintNickname(res.nickname);
        UI.toast("닉네임을 바꿨어요.");
      } catch (err) {
        if (err.status === 409) nickCheck.taken(err.message);
        else MemberForm.setMsg($("nickname-msg"), nick, err.message, "bad");
      } finally {
        btn.disabled = false;
      }
    });
  }

  // 새로고침 없이 화면 곳곳의 닉네임을 바꾼다 (제목 · 헤더 프로필)
  function paintNickname(name) {
    if (isUser) $("p-title").textContent = name + " 님의 마이페이지";
    const pmName = document.querySelector(".pm-name");
    if (pmName) pmName.textContent = name + " 님";
    const avatar = document.querySelector(".profile-btn .avatar");
    if (avatar) avatar.textContent = name.slice(0, 1);
    const btn = document.querySelector(".profile-btn");
    if (btn) btn.setAttribute("aria-label", name + " 님 메뉴");
  }

  // ---------- 2. 비밀번호 (A-9) ----------
  function setupPassword() {
    const now = $("pw-now");
    const pw = $("pw-new");
    const pw2 = $("pw-new2");
    const nowMsg = $("pw-now-msg");
    const check = MemberForm.passwordMatch(pw, pw2, $("pw-new-msg"), $("pw-new2-msg"), R.password);
    now.addEventListener("input", function () { MemberForm.setMsg(nowMsg, now, "", ""); });

    $("pw-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!now.value) { MemberForm.setMsg(nowMsg, now, "현재 비밀번호를 입력해 주세요.", "bad"); now.focus(); return; }
      if (!check.ok()) return;
      if (now.value === pw.value) {
        MemberForm.setMsg($("pw-new-msg"), pw, "지금 비밀번호와 다른 비밀번호를 입력해 주세요.", "bad");
        pw.focus();
        return;
      }
      const btn = $("pw-save");
      btn.disabled = true;
      try {
        await api.put("/api/members/me/password", { currentPassword: now.value, newPassword: pw.value });
        [now, pw, pw2].forEach(function (i) { i.value = ""; });
        ["pw-now-msg", "pw-new-msg", "pw-new2-msg"].forEach(function (id) { MemberForm.setMsg($(id), null, "", ""); });
        UI.toast("비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 써 주세요.");
      } catch (err) {
        // 틀려도 401 이 아니라 400 (명세 A-9). 어느 칸 문제인지 문구로 나눔
        if (err.message.indexOf("현재") >= 0) { MemberForm.setMsg(nowMsg, now, err.message, "bad"); now.value = ""; now.focus(); }
        else { MemberForm.setMsg($("pw-new-msg"), pw, err.message, "bad"); pw.focus(); }
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---------- 3. 선호 장르 (D-7 보기, D-8 통째로 저장) · 손님만 ----------
  async function setupGenres() {
    const form = $("genre-form");
    const box = $("genres");
    const msg = $("genre-msg");
    const saveBtn = $("genre-save");
    form.hidden = false;

    let all;
    let mine = null;
    try {
      all = await api.get("/api/genres");
    } catch (e) {
      MemberForm.setMsg(msg, null, e.message, "bad");
      saveBtn.disabled = true;
      return;
    }
    try {
      mine = await api.get("/api/my/genres");
    } catch (e) {
      // D 담당 API 가 아직이면 (501) 고르기만 막아 둔다. 구현되면 이 코드 그대로 동작
      mine = null;
      MemberForm.setMsg(msg, null, e.status === 501 ? "선호 장르 바꾸기는 곧 열려요." : e.message, e.status === 501 ? "" : "bad");
    }
    const picked = new Set((mine || []).map(function (g) { return g.genreId; }));
    all.forEach(function (g) {
      const label = el("label", "gchip");
      const cb = el("input");
      cb.type = "checkbox";
      cb.value = g.genreId;
      cb.checked = picked.has(g.genreId);
      cb.disabled = mine === null;
      label.append(cb, el("span", null, g.name));
      box.append(label);
    });
    saveBtn.disabled = mine === null;
    box.addEventListener("change", function () { MemberForm.setMsg(msg, null, "", ""); });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const ids = Array.from(box.querySelectorAll("input:checked")).map(function (c) { return Number(c.value); });
      saveBtn.disabled = true;
      try {
        const saved = await api.put("/api/my/genres", { genreIds: ids });
        MemberForm.setMsg(msg, null, saved.length ? "저장했어요: " + saved.map(function (g) { return g.name; }).join(", ") : "선호 장르를 모두 비웠어요.", "ok");
      } catch (err) {
        MemberForm.setMsg(msg, null, err.message, "bad");
      } finally {
        saveBtn.disabled = false;
      }
    });
  }
})();
