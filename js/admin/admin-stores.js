// S22 매장 승인 목록 (pages/admin/admin-stores.html?status=) · C 담당 · C-13
//   기본은 승인 대기(PENDING), 오래된 순. 승인됨·반려도 볼 수 있다
//   목록에서는 승인하지 않는다. 상세(S23)에서 등록증을 보고 처리 (명세 C-13)
(function () {
  const el = UI.el;
  const $ = UI.$;
  if (!Manage.guard(["ADMIN"])) return;

  const STATUSES = ["PENDING", "APPROVED", "REJECTED"];
  let status = STATUSES.indexOf(Manage.param("status")) !== -1 ? Manage.param("status") : "PENDING";

  Manage.approvalTabs($("tabs"), "stores");
  Manage.statusChips($("chips"), STATUSES, status, function (st) {
    status = st;
    history.replaceState(null, "", Routes.url("adminStores", { status: st === "PENDING" ? null : st }));
    load();
  });
  load();

  async function load() {
    const box = $("list");
    box.textContent = "";
    box.append(el("div", "sk sk-block"));
    const asked = status;
    let list;
    try {
      list = await api.get("/api/admin/stores", { status: status });
    } catch (e) {
      box.textContent = "";
      box.append(UI.emptyBox(e.message));
      return;
    }
    if (asked !== status) return;
    box.textContent = "";
    if (!list.length) {
      box.append(UI.emptyBox(status === "PENDING" ? "승인을 기다리는 매장이 없어요." : Manage.statusText(status) + " 매장이 없어요."));
      return;
    }
    box.append(table(list));
  }

  function table(list) {
    const wrap = el("div", "m-table-wrap");
    const t = el("table", "m-table");
    const hr = el("tr");
    ["매장", "신청한 사장", "사업장 등록번호", "신청일", ""].forEach(function (h) { hr.append(el("th", null, h)); });
    const thead = el("thead");
    thead.append(hr);
    t.append(thead);
    const tbody = el("tbody");
    list.forEach(function (s) {
      const tr = el("tr");
      tr.append(el("td", "t-title", s.name));
      tr.append(el("td", null, s.owner ? s.owner.loginId + " (" + s.owner.nickname + ")" : "관리자 직접 등록"));
      tr.append(el("td", "num", s.bizPlaceNo));
      tr.append(el("td", "num", Manage.ymd(s.createdAt)));
      const go = el("td", "go");
      const a = el("a", "btn " + (status === "PENDING" ? "btn-accent" : "btn-line") + " small", status === "PENDING" ? "검토하기 →" : "상세 보기 →");
      a.href = Routes.url("adminStoreDetail", { id: s.storeId });
      go.append(a);
      tr.append(go);
      tbody.append(tr);
    });
    t.append(tbody);
    wrap.append(t);
    return wrap;
  }
})();
