// S12 사장 홈 ② 매장 화면 (pages/owner/owner-store.html?id=매장) · C 담당
//   위: 매장 요약 + [매장 수정]. 아래: 그 매장의 테마 목록 + [새 테마] (승인된 매장만)
//   테마 한 줄: 이름 · 상태 · 평점 · 주중 N회 / 주말 N회. 시간표가 없으면 "시간표 없음"을 눈에 띄게
//   회차 수는 C-5 에 없어서 테마마다 C-10 을 부른다 (매장 하나의 테마는 몇 개뿐이라 한꺼번에)
//   줄을 누르면 ③ 테마 화면. 반려된 테마는 거기서 고쳐서 다시 신청
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Manage.guard(["OWNER", "ADMIN"]);
  if (!me) return;
  const storeId = Manage.numParam("id");

  if (!storeId) {
    Manage.stop("매장 번호가 없어요.", "내 매장으로", Routes.url("owner", { list: 1 }));
    return;
  }
  load();

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
    head.append(h1, Manage.badge(s.status));
    info.append(head);

    const dl = el("dl", "m-dl");
    [["지역", s.area], ["주소", s.address], ["전화", s.phone], ["영업시간", s.hours]].forEach(function (r) {
      dl.append(el("dt", null, r[0]), el("dd", null, r[1] || "-"));
    });
    info.append(dl);
    if (s.status === "PENDING") info.append(el("p", "m-notice", "관리자 승인 전이라 손님에게 보이지 않아요. 승인되면 테마를 등록할 수 있어요."));
    if (s.status === "REJECTED" && s.rejectReason) info.append(Manage.rejectNote(s.rejectReason));
    box.append(info);

    const edit = el("a", "btn btn-line small", s.status === "REJECTED" ? "고쳐서 다시 신청" : "매장 수정");
    edit.href = Routes.url("storeForm", { id: s.storeId });
    const acts = el("div", "m-actions");
    acts.append(edit);
    box.append(acts);
  }

  // ---------- 테마 목록 ----------
  async function renderThemes(s, themes) {
    const ok = s.status === "APPROVED";
    const add = $("add-theme");
    add.hidden = !ok;
    add.href = Routes.url("ownerTheme", { storeId: s.storeId });

    const box = $("themes");
    box.textContent = "";
    if (!themes) {
      box.append(UI.emptyBox("테마 목록을 불러오지 못했어요. 새로고침해 주세요."));
      return;
    }
    if (!themes.length) {
      const empty = el("div", "m-card m-empty", ok ? "아직 테마가 없어요. " : "매장이 승인되면 테마를 등록할 수 있어요.");
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
      if (t.status === "REJECTED") return null;
      return api.get("/api/owner/themes/" + t.themeId + "/slots").catch(function () { return null; });
    }));

    const list = el("div", "m-rows");
    themes.forEach(function (t, i) { list.append(themeRow(t, counts[i])); });
    box.append(list);
  }

  function themeRow(t, slots) {
    const row = el("a", "m-row");
    row.href = Routes.url("ownerTheme", { id: t.themeId });

    const main = el("div", "r-main");
    main.append(el("div", "t-title", t.title), el("div", "sub", UI.genresText(t.genres) + " · " + t.playMinutes + "분"));
    if (t.status === "REJECTED" && t.rejectReason) main.append(Manage.rejectNote(t.rejectReason));

    const st = el("div", "r-st");
    st.append(Manage.badge(t.status));

    const r = UI.rating(t.avgRating);
    const rating = el("div", "r-rate", r ? r + " (" + t.reviewCount + ")" : "후기 없음");
    if (!r) rating.classList.add("muted");

    const slotCell = el("div", "r-slots");
    if (t.status === "REJECTED" || !slots) {
      slotCell.textContent = "-";
      slotCell.classList.add("muted");
    } else if (!slots.weekday.length && !slots.weekend.length) {
      slotCell.textContent = "시간표 없음";
      slotCell.classList.add("warn");
    } else {
      slotCell.textContent = "주중 " + slots.weekday.length + "회 / 주말 " + slots.weekend.length + "회";
    }

    row.append(main, st, rating, slotCell, el("span", "go", "›"));
    return row;
  }
})();
