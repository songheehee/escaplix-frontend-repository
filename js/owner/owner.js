// S12 사장 홈 ① 내 매장 (pages/owner/owner.html) · C 담당 · C-1
//   사장: 내 매장. 순서: 승인됨 → 승인 대기 → 반려, 같은 상태끼리는 최근 등록 순 (Manage.sortStores)
//     매장이 1개뿐이면 ①을 건너뛰고 바로 ② (경로의 "내 매장"을 눌러 온 ?list=1 이면 목록을 보여 줌)
//   관리자: "매장 관리" = 승인된 매장 전체 (관리자 개편 11/23. 대기·반려 매장은 승인 요청 화면에서)
//     위에 "매장 이름으로 찾기" + "+ 매장 등록". 카드 오른쪽에 테마 수와 사장 아이디 (관리자가 등록한 매장은 "관리자")
//   카드를 누르면 ② 매장 화면
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Manage.guard(["OWNER", "ADMIN"]);
  if (!me) return;
  const admin = me.role === "ADMIN";
  let stores = [];
  let page = 1;
  const PER_PAGE = 10;   // 관리자 매장 관리: 한 쪽에 10개 (카드에 사진이 있어 길어서)

  $("add-store").href = Routes.url("storeForm");
  $("add-store-admin").href = Routes.url("storeForm");
  if (admin) {
    $("title").textContent = "매장 관리";
    document.title = "매장 관리 · Escaplix";
    $("owner-actions").hidden = true;
    $("admin-tools").hidden = false;
    $("find").addEventListener("input", function () { page = 1; paint(); });   // 찾으면 다시 1쪽부터
  }
  load().finally(function () { document.body.classList.add("adm-ready"); });   // 관리자 매장 관리: 다 불러오면 제목 아래를 보여 줌 (사장 화면엔 adm-fade 가 없어 영향 없음)

  async function load() {
    try {
      stores = await api.get("/api/owner/stores");
    } catch (e) {
      Manage.stop(e.message);
      return;
    }
    if (!admin && stores.length === 1 && !Manage.param("list")) {
      location.replace(Routes.url("ownerStore", { id: stores[0].storeId }));
      return;
    }
    paint();
  }

  function paint() {
    const box = $("stores");
    box.textContent = "";
    const q = admin ? $("find").value.trim() : "";
    const list = (admin ? stores : Manage.sortStores(stores))
      .filter(function (s) { return !q || s.name.indexOf(q) !== -1; });
    if (!list.length) {
      box.append(admin
        ? UI.emptyBox(q ? "「" + q + "」에 맞는 매장이 없어요." : "승인된 매장이 아직 없어요.", q ? null : "매장 등록", q ? null : Routes.url("storeForm"))
        : UI.emptyBox("등록한 매장이 없어요. 매장부터 등록해 주세요.", "매장 등록", Routes.url("storeForm")));
      return;
    }
    if (!admin) {
      list.forEach(function (s) { box.append(storeCard(s)); });
      return;
    }
    // 관리자: 10개씩 쪽 나누기 (매장 수가 많아져도 한 화면이 길어지지 않게)
    const pages = Math.ceil(list.length / PER_PAGE);
    if (page > pages) page = pages;
    list.slice((page - 1) * PER_PAGE, page * PER_PAGE).forEach(function (s) { box.append(storeCard(s)); });
    const nav = Manage.pager(list.length, page, PER_PAGE, function (p) {
      page = p;
      paint();
      $("title").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    if (nav) box.append(nav);
  }

  // 카드 전체가 링크. 승인 대기·반려는 카드에 안내·사유를 바로 보여 줌 (사장)
  function storeCard(s) {
    const card = el("a", "m-card store-row" + (s.status === "CLOSED" ? " off" : ""));
    card.href = Routes.url("ownerStore", { id: s.storeId });
    card.append(Manage.thumb(s.photoUrl, s.name));

    const info = el("div", "info");
    const head = el("div");
    head.append(el("span", "name", s.name));
    if (!admin) head.append(Manage.badge(s.status, "store"));   // 관리자 목록은 모두 승인됨이라 뺌
    info.append(head);
    info.append(el("div", "sub", [s.area, s.address].join(" · ")));
    if (!admin) {
      info.append(el("div", "sub", s.themeCount ? "테마 " + s.themeCount + "개" : "테마 없음"));
    }
    card.append(info);

    if (admin) {
      const side = el("div", "side");
      side.append(el("span", null, "테마 " + s.themeCount + "개"));   // 등록한 사람(사장 아이디·관리자)은 안 보여 줌
      card.append(side);
    }
    card.append(el("span", "go", "›"));
    return card;
  }
})();
