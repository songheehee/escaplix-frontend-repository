// S25 관리자 홈 (pages/admin/admin.html) · C 담당
//   C-12 숫자 요약 (회원 수까지 한 번에), C-13 · C-17 승인 대기 → "지금 처리할 것" (오래된 순으로 합침)
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
  }

  // 숫자 칸은 보여 주기만 한다 (누르는 곳은 위쪽 메뉴와 "지금 처리할 것")
  function stat(label, num, sub, alert) {
    const box = el("div", "m-card stat" + (alert ? " alert" : ""));
    box.append(el("div", "lbl", label), el("div", "num", num), el("div", "lbl", sub));
    return box;
  }

  function renderStats(s) {
    const m = s.memberCountByRole || {};
    const total = (m.USER || 0) + (m.OWNER || 0) + (m.ADMIN || 0);
    const box = $("stats");
    box.textContent = "";
    box.append(
      stat("매장 승인 대기", s.pendingStores,
        s.oldestPendingStoreAt ? "가장 오래된 것 " + Manage.md(s.oldestPendingStoreAt) : "밀린 일 없음", s.pendingStores > 0),
      stat("테마 승인 대기", s.pendingThemes,
        s.oldestPendingThemeAt ? "가장 오래된 것 " + Manage.md(s.oldestPendingThemeAt) : "밀린 일 없음", s.pendingThemes > 0),
      stat("전체 회원", total, "손님 " + (m.USER || 0) + " · 사장 " + (m.OWNER || 0)),
      stat("공개 중 매장 / 테마", s.approvedStores + " / " + s.openThemes, "손님에게 보이는 수")
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
      box.append(el("p", "muted", "승인을 기다리는 매장·테마가 없어요."));
      return;
    }
    const ul = el("ul", "todo");
    items.forEach(function (it) {
      const li = el("li");
      const what = el("span", "what");
      what.append(el("span", "kind", it.kind), el("b", null, it.name), el("span", "muted", " · " + it.who + " · " + Manage.md(it.at)));
      const go = el("a", "btn btn-accent small", "검토");
      go.href = it.href;
      li.append(what, go);
      ul.append(li);
    });
    box.append(ul);
  }
})();
