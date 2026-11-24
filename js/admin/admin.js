// S25 관리자 홈 (pages/admin/admin.html) · C 담당
//   C-12 숫자 요약 (승인 대기 매장·테마, 공개 매장, 공개 테마), C-13 · C-17 승인 대기 → 매장 칸 · 테마 칸 (위아래)
//   관리자 개편 11/23: 카드 아래 작은 글씨 없앰, "지금 처리할 것" 을 매장·테마로 나눔, 줄 전체가 링크
(function () {
  const el = UI.el;
  const $ = UI.$;
  if (!Manage.guard(["ADMIN"])) return;

  const MAX_ROWS = 5;   // 칸마다 오래 기다린 순서로 최대 5개
  $("all-store").href = Routes.url("adminStores");
  $("all-theme").href = Routes.url("adminThemes");
  load().finally(function () { document.body.classList.add("adm-ready"); });   // 다 불러오면 제목 아래를 한 번에 보여 줌 (탭 이동 깜빡임 방지, manage.css .adm-fade)

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
    // C-13·C-17 은 오래된 순으로 옴
    renderQueue("store", stores, "승인을 기다리는 매장이 없어요.", function (s) {
      return { name: s.name, sub: (s.owner ? s.owner.loginId : "관리자") + " · " + Manage.ymd(s.createdAt) + " 신청",
        href: Routes.url("adminStoreDetail", { id: s.storeId }) };
    });
    renderQueue("theme", themes, "승인을 기다리는 테마가 없어요.", function (t) {
      return { name: t.title, sub: t.storeName + " · " + Manage.ymd(t.updatedAt || t.createdAt) + " 신청",
        href: Routes.url("adminThemeDetail", { id: t.themeId }) };
    });
  }

  // 숫자 칸은 보여 주기만 한다. 대기가 있으면 주황
  function stat(label, num, alert) {
    const box = el("div", "m-card stat" + (alert ? " alert" : ""));
    box.append(el("div", "lbl", label), el("div", "num", String(num)));
    return box;
  }

  function renderStats(s) {
    const box = $("stats");
    box.textContent = "";
    box.append(
      stat("매장 승인 대기", s.pendingStores, s.pendingStores > 0),
      stat("테마 승인 대기", s.pendingThemes, s.pendingThemes > 0),
      stat("공개 매장", s.approvedStores, false),
      stat("공개 테마", s.openThemes, false)
    );
  }

  function renderQueue(kind, list, emptyText, toRow) {
    const cnt = $("c-" + kind);
    cnt.textContent = String(list.length);
    cnt.classList.toggle("zero", !list.length);
    const ul = $("l-" + kind);
    ul.textContent = "";
    if (!list.length) {
      ul.append(el("li", "ah-empty", emptyText));
      return;
    }
    list.slice(0, MAX_ROWS).forEach(function (item) {
      const r = toRow(item);
      const li = el("li");
      const a = el("a");
      a.href = r.href;
      const what = el("div", "what");
      const b = el("b", null, r.name);
      b.title = r.name;
      what.append(b, el("span", null, r.sub));
      a.append(what, el("span", "go-btn", "검토"));
      li.append(a);
      ul.append(li);
    });
  }
})();
