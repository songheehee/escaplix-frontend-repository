// S12 사장 홈 ① 내 매장 (pages/owner/owner.html) · C 담당 · C-1
//   사장: 내 매장. 순서: 승인됨 → 승인 대기 → 반려, 같은 상태끼리는 최근 등록 순 (Manage.sortStores)
//     매장이 1개여도 항상 목록 (11/25: 바로 ② 로 넘기던 것 없앰. [사장 홈]을 눌렀는데 상세가 떠서 헷갈림)
//   관리자: "매장 관리" = 승인된 매장 전체 + 폐업 매장(맨 뒤, 흐리게 + 폐업 배지) (대기·반려 매장은 승인 요청 화면에서)
//     위에 "매장 이름으로 찾기" + "+ 매장 등록". 카드 오른쪽에 테마 수와 사장 아이디 (관리자가 등록한 매장은 "관리자")
//   카드를 누르면 ② 매장 화면
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Manage.guard(["OWNER", "ADMIN"]);
  if (!me) return;
  const admin = me.role === "ADMIN";
  let stores = [];
  let themesByStore = {};   // 관리자: 매장 번호 → 테마 이름들 (검색창에서 테마 이름으로도 찾기)
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
  // 관리자 정렬 (검색창 옆): 최신순 · 오래된순(등록일) · 이름순(가나다). 폐업 매장은 어느 정렬이든 맨 뒤
  const sortPicker = admin ? UI.selectPicker("sort", [["new", "최신순"], ["old", "오래된순"], ["name", "이름순"]], "new", { label: "정렬" }) : null;
  if (sortPicker) {
    sortPicker.el.classList.add("mg-sort");
    $("find").closest(".mg-search").after(sortPicker.el);
    sortPicker.input.addEventListener("change", function () { page = 1; paint(); });
  }
  function adminSort(list) {
    const key = sortPicker.value();
    return list.slice().sort(function (a, b) {
      const closed = (a.status === "CLOSED") - (b.status === "CLOSED");
      if (closed) return closed;
      if (key === "name") return a.name.localeCompare(b.name, "ko");
      const d = new Date(a.createdAt) - new Date(b.createdAt);
      return key === "old" ? d : -d;
    });
  }
  load().finally(function () { document.body.classList.add("adm-ready"); });   // 관리자 매장 관리: 다 불러오면 제목 아래를 보여 줌 (사장 화면엔 adm-fade 가 없어 영향 없음)
  // 매장 화면에서 폐업·수정한 뒤 뒤로가기로 오면 브라우저가 예전 목록을 그대로 보여 줄 수 있음 → 다시 불러와 정렬까지 새로
  window.addEventListener("pageshow", function (e) { if (e.persisted) load(); });

  async function load() {
    try {
      const r = await Promise.all([api.get("/api/owner/stores"), admin ? loadThemeNames() : null]);
      stores = r[0];
    } catch (e) {
      Manage.stop(e.message);
      return;
    }
    paint();
  }

  // 관리자 검색용 테마 이름. 상태별 목록(C-17)을 다 받아 매장별로 묶음. 실패하면 매장 이름으로만 찾음
  async function loadThemeNames() {
    const lists = await Promise.all(["OPEN", "CLOSED", "PENDING", "REJECTED"].map(function (st) {
      return api.get("/api/admin/themes", { status: st }).catch(function () { return []; });
    }));
    themesByStore = {};
    lists.forEach(function (list) {
      list.forEach(function (t) { (themesByStore[t.storeId] = themesByStore[t.storeId] || []).push(t.title); });
    });
  }
  function themeHits(s, q) {
    if (!q) return [];
    return (themesByStore[s.storeId] || []).filter(function (title) { return title.indexOf(q) !== -1; });
  }

  function paint() {
    const box = $("stores");
    box.textContent = "";
    const q = admin ? $("find").value.trim() : "";
    const list = (admin ? adminSort(stores) : Manage.sortStores(stores))   // 사장: 승인됨 → 대기 → 반려 → 폐업, 같은 상태끼리 최근 등록 순
      .filter(function (s) { return !q || s.name.indexOf(q) !== -1 || themeHits(s, q).length; });   // 매장 이름 또는 테마 이름
    if (!list.length) {
      box.append(admin
        ? UI.emptyBox(q ? "「" + q + "」에 맞는 매장·테마가 없어요." : "승인된 매장이 아직 없어요.", q ? null : "매장 등록", q ? null : Routes.url("storeForm"))
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
    list.slice((page - 1) * PER_PAGE, page * PER_PAGE).forEach(function (s) { box.append(storeCard(s, themeHits(s, q))); });
    const nav = Manage.pager(list.length, page, PER_PAGE, function (p) {
      page = p;
      paint();
      $("title").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    if (nav) box.append(nav);
  }

  // 카드 전체가 링크. 승인 대기·반려는 카드에 안내·사유를 바로 보여 줌 (사장)
  function storeCard(s, hits) {
    const card = el("a", "m-card store-row" + (s.status === "CLOSED" ? " off" : ""));
    card.href = Routes.url("ownerStore", { id: s.storeId });
    card.append(Manage.thumb(s.photoUrl, s.name));

    const info = el("div", "info");
    const head = el("div");
    head.append(el("span", "name", s.name));
    // 관리자 목록은 승인된 매장이 대부분이라 승인됨 배지는 빼고, 폐업만 표시
    if (!admin || s.status === "CLOSED") head.append(Manage.badge(s.status, "store"));
    info.append(head);
    info.append(el("div", "sub", [s.area, s.address].join(" · ")));
    // 관리자가 테마 이름으로 찾았으면 어떤 테마 때문에 나왔는지
    if (hits && hits.length) info.append(el("div", "sub hit", "테마 · " + hits.join(", ")));
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
