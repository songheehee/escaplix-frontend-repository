// S12 사장 홈 ② 매장 화면 (pages/owner/owner-store.html?id=매장) · C 담당
//   위: 매장 요약 + [매장 수정]. 아래: 그 매장의 테마 목록 + [새 테마] (승인된 매장만)
//   테마 한 줄: 이름 · 상태 · 평점 · 주중 N회 / 주말 N회. 시간표가 없으면 "시간표 없음"을 눈에 띄게
//   회차 수는 C-5 에 없어서 테마마다 C-10 을 부른다 (매장 하나의 테마는 몇 개뿐이라 한꺼번에)
//   줄을 누르면 ③ 테마 화면. 반려된 테마는 거기서 고쳐서 다시 신청
//   매장 폐업: 사장·관리자 둘 다 (승인된 매장만, 되돌릴 수 없음 → 매장 이름을 쳐야 됨). 폐업 매장은 보기만
//   줄 끝 [수정] · [삭제](= 운영 종료 C-9) / [운영 재개]. 줄 자체는 눌러도 이동 안 함 (사장 화면 개편 11/24)
//   관리자(매장 관리, 관리자 개편 11/23): 승인 상세와 같은 틀 (C-14 상세 + C-15·A-11 서류)
//     맨 위 한 줄(이름 / 등록자·등록일, [매장 수정]) → 매장 → 서류 → 테마 (+ 테마 등록)
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Manage.guard(["OWNER", "ADMIN"]);
  if (!me) return;
  const storeId = Manage.numParam("id");

  const admin = me.role === "ADMIN";
  if (admin) document.body.classList.add("adm-btns");   // 관리자: 상세 화면 버튼 크기를 하나로 (manage.css .adm-btns). 사장은 그대로
  if (!storeId) {
    Manage.stop("매장 번호가 없어요.", admin ? "매장 관리로" : "내 매장으로", Routes.url("owner", { list: 1 }));
    return;
  }
  if (admin) loadAdmin(); else load();

  // ---------- 관리자: 매장 관리 상세 ----------
  async function loadAdmin() {
    let s, themes;
    try {
      const r = await Promise.all([
        api.get("/api/admin/stores/" + storeId),
        api.get("/api/owner/stores/" + storeId + "/themes").catch(function () { return null; }),
      ]);
      s = r[0];
      themes = r[1];
    } catch (e) {
      Manage.stop(e.status === 404 ? "없는 매장이에요." : e.message, "매장 관리로", Routes.url("owner", { list: 1 }));
      return;
    }
    document.title = s.name + " · 매장 관리 · Escaplix";
    Manage.crumbs($("crumbs"), [[s.name]]);
    $("owner-view").hidden = true;
    $("admin-view").hidden = false;
    $("a-name").textContent = s.name;
    // 승인됨은 안 보여 줌 (매장 관리에는 승인된 매장만 있음). 폐업한 매장만 "폐업" 배지
    if (s.status !== "APPROVED") $("a-status").append(Manage.badge(s.status, "store"));
    // 등록자·등록일로 통일. 사장이 신청한 매장은 등록자 = 사장 아이디, 등록일 = 신청일
    Manage.metaRow($("a-meta"), [["등록자", s.owner ? s.owner.loginId : "관리자"], ["등록일", Manage.ymd(s.createdAt)]]);
    $("a-edit").href = Routes.url("storeForm", { id: s.storeId });
    $("a-edit").hidden = s.status === "CLOSED";
    if (s.status === "APPROVED") $("a-edit").after(closeButton(s));

    const body = $("a-body");
    const pub = Manage.section("①", "매장");
    pub.append(Manage.storePublic(s));
    const docs = Manage.section("②", "서류");
    docs.append(Manage.storeDocs(s));
    const add = el("a", "btn btn-line small", "+ 테마 등록");
    add.href = Routes.url("ownerTheme", { storeId: s.storeId });
    add.hidden = s.status !== "APPROVED";
    const th = Manage.section("③", "테마", add);
    body.append(pub, docs, th);
    th.append($("themes"));   // 테마 줄은 사장 화면과 같은 모양
    renderThemes(s, themes);
  }

  async function load() {
    let store, themes;
    try {
      const r = await Promise.all([
        Manage.myStore(storeId),
        api.get("/api/owner/stores/" + storeId + "/themes").catch(function () { return null; }),
      ]);
      store = r[0];
      themes = r[1];
    } catch (e) {
      Manage.stop(e.message);
      return;
    }
    if (!store) {
      Manage.stop("내 매장이 아니거나 없는 매장이에요.", "내 매장으로", Routes.url("owner", { list: 1 }));
      return;
    }
    document.title = store.name + " · Escaplix";
    Manage.crumbs($("crumbs"), [[store.name]]);
    renderStore(store);
    renderThemes(store, themes);
  }

  // ---------- 매장 요약 ----------
  function renderStore(s) {
    const box = $("store");
    box.textContent = "";
    box.append(Manage.thumb(s.photoUrl, s.name));

    const info = el("div", "info");
    const head = el("div", "head");
    const h1 = el("h1", "name", s.name);
    head.append(h1, Manage.badge(s.status, "store"));
    info.append(head);

    const dl = el("dl", "m-dl");
    [["지역", s.area], ["주소", s.address], ["전화", s.phone], ["영업시간", s.hours]].forEach(function (r) {
      dl.append(el("dt", null, r[0]), el("dd", null, r[1] || "-"));
    });
    info.append(dl);
    if (s.status === "REJECTED" && s.rejectReason) info.append(Manage.rejectNote(s.rejectReason));
    box.append(info);

    if (s.status === "CLOSED") return;   // 폐업 매장은 보기만
    const edit = el("a", "btn small btn-soft", "매장 수정");   // 회색 배경 + 기본 글씨색 (테마 줄 [수정]과 같은 모양)
    edit.href = Routes.url("storeForm", { id: s.storeId });
    const acts = el("div", "m-actions");
    acts.append(edit);
    if (s.status === "APPROVED") acts.append(closeButton(s, true));
    box.append(acts);
  }

  // [매장 폐업] → 매장 이름 확인 → 폐업 → 새로고침 (매장·테마 상태가 다 바뀌어서)
  //   사장 화면(small): 회색 배경 + 빨간 테두리·글씨 (btn-soft-bad). 관리자 화면: 빨간 테두리 버튼 그대로
  function closeButton(s, small) {
    const btn = el("button", small ? "btn small btn-soft btn-soft-bad" : "btn btn-no", "매장 폐업");
    btn.type = "button";
    btn.addEventListener("click", async function () {
      if (!(await Manage.askClose(s.name))) return;
      Manage.busy(btn, true);
      try {
        await api.put("/api/owner/stores/" + s.storeId + "/close");
        UI.toast("폐업 처리했어요.");
        setTimeout(function () { location.reload(); }, 600);
      } catch (e) {
        Manage.busy(btn, false);
        UI.toast(e.message, "err");
      }
    });
    return btn;
  }

  // ---------- 테마 목록 ----------
  async function renderThemes(s, themes) {
    const ok = s.status === "APPROVED";
    const add = $("add-theme");
    add.hidden = !ok;
    add.href = Routes.url("ownerTheme", { storeId: s.storeId });   // 관리자 화면에서는 ③ 제목 줄의 "+ 테마 등록"

    const box = $("themes");
    box.textContent = "";
    if (!themes) {
      box.append(UI.emptyBox("테마 목록을 불러오지 못했어요. 새로고침해 주세요."));
      return;
    }
    if (!themes.length) {
      const empty = el("div", "m-card m-empty", ok ? "아직 테마가 없어요. " : s.status === "CLOSED" ? "테마가 없어요." : "매장이 승인되면 테마를 등록할 수 있어요.");
      if (ok) {
        const a = el("a", null, "첫 테마 등록");
        a.href = add.href;
        empty.append(a);
      }
      box.append(empty);
      return;
    }

    // 회차 수 (C-10). 반려된 테마는 시간표를 안 다루니 부르지 않음. 실패하면 "-"
    const counts = await Promise.all(themes.map(function (t) {
      if (t.status === "REJECTED" || s.status === "CLOSED") return null;
      return api.get("/api/owner/themes/" + t.themeId + "/slots").catch(function () { return null; });
    }));

    const list = el("div", "m-rows");
    const closed = s.status === "CLOSED";
    themes.forEach(function (t, i) { list.append(themeRow(t, counts[i], closed)); });
    box.append(list);
  }

  // 줄을 눌러도 이동하지 않음. 오른쪽 끝 [수정] · [삭제] 버튼으로 (사장 화면 개편 11/24)
  //   폐업 매장: 테마를 고칠 수 없어 버튼 없이 보여 주기만
  function themeRow(t, slots, closed) {
    const row = el("div", "m-row" + (closed ? " off" : ""));

    const main = el("div", "r-main");
    const title = el("div", "t-title", t.title);
    main.append(title, el("div", "sub", UI.genresText(t.genres) + " · " + t.playMinutes + "분"));

    const st = el("div", "r-st");
    st.append(Manage.badge(t.status));

    const r = UI.rating(t.avgRating);
    const rating = el("div", "r-rate", r ? r + " (" + t.reviewCount + ")" : "-");   // 후기가 없으면 "-"
    if (!r) rating.classList.add("muted");

    const slotCell = el("div", "r-slots");
    if (closed || t.status === "REJECTED" || !slots) {
      slotCell.textContent = "-";
      slotCell.classList.add("muted");
    } else if (!slots.weekday.length && !slots.weekend.length) {
      slotCell.textContent = "시간표 없음";
      slotCell.classList.add("warn");
    } else {
      slotCell.textContent = "주중 " + slots.weekday.length + "회 / 주말 " + slots.weekend.length + "회";
    }

    row.append(main, st, rating, slotCell, closed ? el("div", "r-act") : rowButtons(t, st));
    return row;
  }

  // 오른쪽 끝 버튼: [수정] (모든 테마) + [삭제] (운영 중) / [운영 재개] (삭제한 테마)
  //   [삭제]는 실제로는 운영 종료 (C-9, 서버에 테마를 지우는 기능은 없음): 손님 화면에서 사라지고 후기·찜 기록은 남음
  //   승인 전·반려 테마는 운영 상태를 바꿀 수 없어 [수정]만
  function rowButtons(t, stCell) {
    const wrap = el("div", "r-act");
    const edit = el("a", "btn small btn-soft", "수정");
    edit.href = Routes.url("ownerTheme", { id: t.themeId });
    edit.setAttribute("aria-label", t.title + " 수정");
    wrap.append(edit);
    if (t.status !== "OPEN" && t.status !== "CLOSED") {
      // 두 번째 버튼이 없어도 그 자리를 비워 둬서 다른 줄과 [수정] 위치·칸 폭이 같게 (안 보이고 안 눌림)
      const ph = el("span", "btn small btn-soft r-ph", "삭제");
      ph.setAttribute("aria-hidden", "true");
      wrap.append(ph);
      return wrap;
    }
    const btn = el("button");
    btn.type = "button";
    paint();
    wrap.append(btn);

    function paint() {
      btn.textContent = t.status === "OPEN" ? "삭제" : "운영 재개";
      btn.className = "btn small btn-soft";
      btn.setAttribute("aria-label", t.title + " " + btn.textContent);
    }
    btn.addEventListener("click", async function () {
      const next = t.status === "OPEN" ? "CLOSED" : "OPEN";
      // 삭제: 매장 폐업처럼 테마 이름을 쳐야 하는 팝업. 운영 재개: 간단한 확인
      if (next === "CLOSED") {
        if (!(await Manage.askDeleteTheme(t.title))) return;
      } else if (!confirm("'" + t.title + "' 을(를) 다시 운영하면 손님 화면에 바로 보여요. 재개할까요?")) return;
      Manage.busy(btn, true);
      try {
        const r = await api.put("/api/owner/themes/" + t.themeId + "/status", { status: next });
        Manage.busy(btn, false);
        t.status = r.status;
        stCell.textContent = "";
        stCell.append(Manage.badge(t.status));
        paint();
        UI.toast(t.status === "CLOSED" ? "삭제했어요. 손님 화면에서 사라졌어요." : "운영을 다시 시작했어요.");
      } catch (e) {
        Manage.busy(btn, false);
        UI.toast(e.message, "err");
      }
    });
    return wrap;
  }
})();
