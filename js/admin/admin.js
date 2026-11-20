// S25 관리자 홈 (pages/admin/admin.html) · C 담당
//   C-12 숫자 요약 (회원 수까지 한 번에), C-13 · C-17 승인 대기 → "지금 처리할 것" (오래된 순으로 합침)
//   신고 처리 화면은 이번 범위 밖이라 숫자만 보여 준다 (명세 C-12 waitReports)
(function () {
  const el = UI.el;
  const $ = UI.$;
  if (!Manage.guard(["ADMIN"])) return;

  load();

  async function load() {
    let sum, stores, themes;
    try {
      const r = await Promise.all([
        api.get("/api/admin/summary"),
        api.get("/api/admin/stores", { status: "PENDING" }),
        api.get("/api/admin/themes", { status: "PENDING" }),
      ]);
      sum = r[0];
      stores = r[1];
      themes = r[2];
    } catch (e) {
      Manage.stop(e.message);
      return;
    }
    renderStats(sum);
    renderTodo(stores, themes);
    renderTiles(sum);
  }

  function stat(href, label, num, sub, alert) {
    const box = el(href ? "a" : "div", "m-card stat" + (alert ? " alert" : ""));
    if (href) box.href = href;
    box.append(el("div", "lbl", label), el("div", "num", num), el("div", "lbl", sub));
    return box;
  }

  function renderStats(s) {
    const m = s.memberCountByRole || {};
    const total = (m.USER || 0) + (m.OWNER || 0) + (m.ADMIN || 0);
    const box = $("stats");
    box.textContent = "";
    box.append(
      stat(Routes.url("adminStores"), "매장 승인 대기", s.pendingStores,
        s.oldestPendingStoreAt ? "가장 오래된 것 " + Manage.md(s.oldestPendingStoreAt) : "밀린 일 없음", s.pendingStores > 0),
      stat(Routes.url("adminThemes"), "테마 승인 대기", s.pendingThemes,
        s.oldestPendingThemeAt ? "가장 오래된 것 " + Manage.md(s.oldestPendingThemeAt) : "밀린 일 없음", s.pendingThemes > 0),
      stat(Routes.url("adminMembers"), "전체 회원", total, "손님 " + (m.USER || 0) + " · 사장 " + (m.OWNER || 0)),
      stat(null, "공개 중 매장 / 테마", s.approvedStores + " / " + s.openThemes, "손님에게 보이는 수")
    );
  }

  function renderTodo(stores, themes) {
    const items = stores.map(function (s) {
      return { kind: "매장", name: s.name, who: s.owner ? s.owner.loginId : "관리자 등록", at: s.createdAt,
        href: Routes.url("adminStoreDetail", { id: s.storeId }) };
    }).concat(themes.map(function (t) {
      return { kind: "테마", name: t.title, who: t.storeName, at: t.updatedAt || t.createdAt,
        href: Routes.url("adminThemeDetail", { id: t.themeId }) };
    })).sort(function (a, b) { return new Date(a.at) - new Date(b.at); });

    const box = $("todo-box");
    box.textContent = "";
    if (!items.length) {
      box.append(el("p", "muted", "승인을 기다리는 매장·테마가 없어요. 👍"));
      return;
    }
    const ul = el("ul", "todo");
    items.forEach(function (it) {
      const li = el("li");
      const what = el("span", "what");
      what.append(el("span", "kind", it.kind), el("b", null, it.name), el("span", "muted", " · " + it.who + " · " + Manage.md(it.at)));
      const go = el("a", "btn btn-accent small", "검토 →");
      go.href = it.href;
      li.append(what, go);
      ul.append(li);
    });
    box.append(ul);
  }

  function tile(href, ico, title, desc, go, off) {
    const t = el(href ? "a" : "div", "m-card tile" + (off ? " off" : ""));
    if (href) t.href = href;
    t.append(el("div", "ico", ico), el("div", "ttl", title), el("div", "desc", desc), el("div", "go", go));
    return t;
  }

  function renderTiles(s) {
    const m = s.memberCountByRole || {};
    $("tiles").append(
      tile(Routes.url("adminStores"), "🏪", "매장 승인", "사장이 올린 매장을 사업장등록증과 대조해 승인·반려",
        "대기 " + s.pendingStores + "건 →"),
      tile(Routes.url("adminThemes"), "🚪", "테마 승인", "테마 사진·정보·예약 링크를 보고 승인·반려",
        "대기 " + s.pendingThemes + "건 →"),
      tile(Routes.url("adminMembers"), "👥", "회원 관리", "손님·사장 목록 보기, 아이디·닉네임 검색",
        "회원 " + ((m.USER || 0) + (m.OWNER || 0)) + "명 →"),
      tile(Routes.url("owner"), "📋", "직접 등록한 매장", "관리자가 등록한 매장과 그 매장의 테마 보기·수정", "보기 →"),
      tile(Routes.url("storeForm"), "➕", "매장 직접 등록", "사장이 오지 않았지만 손님 수요가 있는 매장. 바로 공개돼요", "등록하기 →"),
      tile(Routes.url("ownerTheme"), "➕", "테마 직접 등록", "관리자가 등록한 매장의 테마 추가. 바로 공개돼요", "등록하기 →"),
      tile(Routes.url("ownerSlots"), "🕒", "시간표 직접 등록", "주중 / 주말 시작 시간 정하기", "등록하기 →"),
      tile(null, "🚩", "후기 신고 처리", "신고 접수 " + s.waitReports + "건 (처리 화면은 이번 범위 밖)", "이번 범위 제외", true)
    );
  }
})();
