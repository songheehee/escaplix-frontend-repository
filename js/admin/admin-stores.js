// S22 승인 요청 · 매장 탭 (pages/admin/admin-stores.html?status=) · C 담당 · C-13
//   처리할 것만: 대기(PENDING) · 반려(REJECTED). 승인된 매장은 매장 관리에서 (관리자 개편 11/23)
//   기본은 대기, 오래된 순. 줄 전체를 누르면 상세
//   목록에서는 승인하지 않는다. 상세(S23)에서 등록증을 보고 처리 (명세 C-13)
(function () {
  const el = UI.el;
  const $ = UI.$;
  if (!Manage.guard(["ADMIN"])) return;

  const STATUSES = [["PENDING", "대기"], ["REJECTED", "반려"]];
  const CODES = STATUSES.map(function (x) { return x[0]; });
  let status = CODES.indexOf(Manage.param("status")) !== -1 ? Manage.param("status") : "PENDING";

  Manage.approvalTabs($("tabs"), "stores");   // 탭은 바로 보임 (숫자는 지난번 값으로 먼저 칠함, manage.js)
  Manage.statusChips($("chips"), STATUSES, status, function (st) {
    status = st;
    history.replaceState(null, "", Routes.url("adminStores", { status: st === "PENDING" ? null : st }));
    load();
  });
  load().finally(function () { document.body.classList.add("adm-ready"); });   // 다 불러오면 제목 아래를 한 번에 보여 줌 (탭 이동 깜빡임 방지, manage.css .adm-fade)

  async function load() {
    // 대기 ↔ 반려를 바꿀 때 회색 자리로 비우지 않고 지금 표를 둔 채 새 표가 오면 한 번에 바꿈 (깜빡임 방지)
    //   처음에는 HTML 의 회색 자리가 있음
    const box = $("list");
    box.setAttribute("aria-busy", "true");
    const asked = status;
    let list;
    try {
      list = await api.get("/api/admin/stores", { status: status });
    } catch (e) {
      if (asked !== status) return;
      box.removeAttribute("aria-busy");
      box.textContent = "";
      box.append(UI.emptyBox(e.message));
      return;
    }
    if (asked !== status) return;
    box.removeAttribute("aria-busy");
    box.textContent = "";
    if (!list.length) {
      box.append(UI.emptyBox(status === "PENDING" ? "승인을 기다리는 매장이 없어요." : "반려된 매장이 없어요."));
      return;
    }
    box.append(table(list));
  }

  function table(list) {
    const wrap = el("div", "m-table-wrap");
    const t = el("table", "m-table");
    const hr = el("tr");
    ["매장", "신청자", "사업장 관리번호", "신청일", ""].forEach(function (h) { hr.append(el("th", null, h)); });
    const thead = el("thead");
    thead.append(hr);
    t.append(thead);
    const tbody = el("tbody");
    list.forEach(function (s) {
      const href = Routes.url("adminStoreDetail", { id: s.storeId });
      const tr = el("tr", "click");
      tr.addEventListener("click", function (e) { if (!e.target.closest("a")) location.href = href; });   // 줄 전체가 링크
      tr.append(el("td", "t-title", s.name));
      tr.append(el("td", null, s.owner ? s.owner.loginId + " (" + s.owner.nickname + ")" : "관리자"));
      tr.append(el("td", "num", s.bizPlaceNo));
      tr.append(el("td", "num", Manage.ymd(s.createdAt)));
      const go = el("td", "go");
      const a = el("a", "btn " + (status === "PENDING" ? "btn-accent" : "btn-line") + " small", status === "PENDING" ? "검토" : "보기");
      a.href = href;
      go.append(a);
      tr.append(go);
      tbody.append(tr);
    });
    t.append(tbody);
    wrap.append(t);
    return wrap;
  }
})();
