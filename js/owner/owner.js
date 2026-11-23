// S12 사장 홈 ① 내 매장 (pages/owner/owner.html) · C 담당 · C-1
//   사장: 내 매장. 관리자: 직접 등록한 매장(owner_id 없음) (명세 C-1)
//   사장이 다루는 건 매장 → 테마 → 시간표. 여기서는 매장 카드만 보여 주고, 누르면 ② 매장 화면으로
//   순서: 승인됨 → 승인 대기 → 반려, 같은 상태끼리는 최근 등록 순 (Manage.sortStores)
//   매장이 1개뿐이면 ①을 건너뛰고 바로 ② (경로의 "내 매장"을 눌러 온 ?list=1 이면 목록을 보여 줌)
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Manage.guard(["OWNER", "ADMIN"]);
  if (!me) return;
  const admin = me.role === "ADMIN";

  if (admin) {
    $("title").textContent = "직접 등록한 매장";
    document.title = "직접 등록한 매장 · Escaplix";
  }
  $("add-store").href = Routes.url("storeForm");
  load();

  async function load() {
    let stores;
    try {
      stores = await api.get("/api/owner/stores");
    } catch (e) {
      Manage.stop(e.message);
      return;
    }
    if (stores.length === 1 && !Manage.param("list")) {
      location.replace(Routes.url("ownerStore", { id: stores[0].storeId }));
      return;
    }
    const box = $("stores");
    box.textContent = "";
    if (!stores.length) {
      box.append(UI.emptyBox(admin ? "직접 등록한 매장이 없어요." : "등록한 매장이 없어요. 매장부터 등록해 주세요.",
        "매장 등록", Routes.url("storeForm")));
      return;
    }
    Manage.sortStores(stores).forEach(function (s) { box.append(storeCard(s)); });
  }

  // 카드 전체가 링크. 승인 대기·반려는 카드에 안내·사유를 바로 보여 줌
  function storeCard(s) {
    const card = el("a", "m-card store-row");
    card.href = Routes.url("ownerStore", { id: s.storeId });
    card.append(Manage.thumb(s.photoUrl, s.name));

    const info = el("div", "info");
    const head = el("div");
    head.append(el("span", "name", s.name), Manage.badge(s.status));
    info.append(head);
    info.append(el("div", "sub", [s.area, s.address].join(" · ")));
    info.append(el("div", "sub", s.themeCount ? "테마 " + s.themeCount + "개" : "테마 없음"));
    if (s.status === "PENDING") info.append(el("div", "sub note", "관리자 승인 전이라 손님에게 보이지 않아요. 승인되면 테마를 등록할 수 있어요."));
    if (s.status === "REJECTED" && s.rejectReason) info.append(Manage.rejectNote(s.rejectReason));
    card.append(info, el("span", "go", "›"));
    return card;
  }
})();
