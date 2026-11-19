// S12 사장 홈 (pages/owner/owner.html?storeId=) · C 담당 · C-1 내 매장, C-5 매장의 테마
//   사장: 내 매장 목록. 관리자: 직접 등록한 매장(owner_id 없음) 목록 (명세 C-1)
//   반려된 매장·테마는 사유를 보여 준다 (결정 S4)
//   ?storeId= 로 어느 매장의 테마를 펼칠지 기억한다 (수정하고 돌아와도 그대로)
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Manage.guard(["OWNER", "ADMIN"]);
  if (!me) return;
  const admin = me.role === "ADMIN";

  let stores = [];
  let selectedId = Manage.numParam("storeId");

  if (admin) {
    $("title").textContent = "직접 등록한 매장";
    $("lead").textContent = "관리자가 등록한 매장과 테마는 승인 없이 바로 손님에게 보여요.";
  }
  $("add-store").href = Routes.url("storeForm");
  load();

  async function load() {
    try {
      stores = await api.get("/api/owner/stores");
    } catch (e) {
      Manage.stop(e.message);
      return;
    }
    renderStores();
    if (!stores.length) return;
    // 처음 펼칠 매장: 주소에 있던 매장 → 승인된 첫 매장 → 첫 매장
    const keep = stores.find(function (s) { return s.storeId === selectedId; });
    const firstOk = stores.find(function (s) { return s.status === "APPROVED"; });
    select((keep || firstOk || stores[0]).storeId);
  }

  function renderStores() {
    const box = $("stores");
    box.textContent = "";
    if (!stores.length) {
      box.append(UI.emptyBox(admin ? "직접 등록한 매장이 아직 없어요." : "아직 등록한 매장이 없어요. 매장부터 등록해 주세요.",
        "+ 매장 등록", Routes.url("storeForm")));
      return;
    }
    stores.forEach(function (s) { box.append(storeCard(s)); });
  }

  function storeCard(s) {
    const card = el("article", "m-card store-row");
    card.dataset.id = s.storeId;
    card.append(Manage.thumb(s.photoUrl, s.name));

    const info = el("div", "info");
    const head = el("div");
    head.append(el("span", "name", s.name), Manage.badge(s.status));
    info.append(head);
    info.append(el("div", "sub", [s.area, s.address, "☎ " + s.phone].join(" · ")));
    info.append(el("div", "sub", "사업장 " + s.bizPlaceNo + " · 테마 " + s.themeCount + "개 · 등록 " + Manage.ymd(s.createdAt)));
    if (s.status === "PENDING") info.append(el("div", "sub", "관리자 승인 전에는 손님에게 보이지 않고, 테마도 등록할 수 없어요."));
    if (s.status === "REJECTED" && s.rejectReason) info.append(Manage.rejectNote(s.rejectReason));
    card.append(info);

    const actions = el("div", "m-actions");
    const show = el("button", "btn btn-line small", "테마 보기");
    show.type = "button";
    show.addEventListener("click", function () { select(s.storeId, true); });
    const edit = el("a", "btn btn-dim small", s.status === "REJECTED" ? "고쳐서 다시 신청" : "매장 수정");
    edit.href = Routes.url("storeForm", { id: s.storeId });
    actions.append(show, edit);
    card.append(actions);
    return card;
  }

  // 매장 하나를 골라 그 매장의 테마(C-5)를 아래에 펼친다
  async function select(storeId, scroll) {
    selectedId = storeId;
    const s = stores.find(function (x) { return x.storeId === storeId; });
    document.querySelectorAll(".store-row").forEach(function (c) {
      c.classList.toggle("selected", Number(c.dataset.id) === storeId);
    });
    history.replaceState(null, "", Routes.url("owner", { storeId: storeId }));

    $("theme-sec").hidden = false;
    $("theme-title").textContent = s.name + " 테마";
    $("theme-note").textContent = s.status === "APPROVED" ? "" : "매장이 승인되면 테마를 등록할 수 있어요";
    $("add-theme").hidden = s.status !== "APPROVED";
    $("add-theme").href = Routes.url("ownerTheme", { storeId: storeId });

    const box = $("themes");
    box.textContent = "";
    box.append(el("div", "sk sk-block"));
    if (scroll) $("theme-sec").scrollIntoView({ behavior: "smooth", block: "start" });

    let themes;
    try {
      themes = await api.get("/api/owner/stores/" + storeId + "/themes");
    } catch (e) {
      box.textContent = "";
      box.append(UI.emptyBox(e.message));
      return;
    }
    if (selectedId !== storeId) return; // 그 사이 다른 매장을 눌렀음
    box.textContent = "";
    if (!themes.length) {
      box.append(UI.emptyBox(s.status === "APPROVED" ? "아직 등록한 테마가 없어요." : "매장 승인 뒤에 테마를 등록할 수 있어요."));
      return;
    }
    box.append(themeTable(themes));
  }

  function themeTable(themes) {
    const wrap = el("div", "m-table-wrap");
    const table = el("table", "m-table");
    const thead = el("thead");
    const hr = el("tr");
    ["테마", "장르", "제한 시간", "상태", "평점", "수정일", ""].forEach(function (h) { hr.append(el("th", null, h)); });
    thead.append(hr);
    table.append(thead);

    const tbody = el("tbody");
    themes.forEach(function (t) {
      const tr = el("tr");
      const name = el("td");
      name.append(el("div", "t-title", t.title));
      if (t.status === "REJECTED" && t.rejectReason) name.append(Manage.rejectNote(t.rejectReason));
      tr.append(name);
      tr.append(el("td", null, UI.genresText(t.genres)));
      tr.append(el("td", "num", t.playMinutes + "분"));
      const st = el("td");
      st.append(Manage.badge(t.status));
      tr.append(st);
      const r = UI.rating(t.avgRating);
      tr.append(el("td", "num", r ? "★ " + r + " (" + t.reviewCount + ")" : "-"));
      tr.append(el("td", "num", Manage.ymd(t.updatedAt)));

      const go = el("td", "go");
      const edit = el("a", "btn btn-line small", t.status === "REJECTED" ? "고쳐서 다시 신청" : "수정");
      edit.href = Routes.url("ownerTheme", { id: t.themeId });
      go.append(edit);
      if (t.status !== "REJECTED") {
        const slots = el("a", "btn btn-dim small", "시간표");
        slots.href = Routes.url("ownerSlots", { themeId: t.themeId });
        go.append(slots);
      }
      tr.append(go);
      tbody.append(tr);
    });
    table.append(tbody);
    wrap.append(table);
    return wrap;
  }
})();
