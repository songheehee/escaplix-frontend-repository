// S15 테마 승인 목록 (pages/admin/admin-themes.html?status=) · C 담당 · C-17
//   매장 승인과 다른 탭 (회의 v2-10). 목록 → 상세(S24) → 승인/반려
//   기본은 승인 대기(PENDING), 오래된 순
(function () {
  const el = UI.el;
  const $ = UI.$;
  if (!Manage.guard(["ADMIN"])) return;

  // 처리할 것만: 대기 · 반려. 공개 중·운영 종료 테마는 매장 관리 → 매장에서 (관리자 개편 11/23)
  const STATUSES = [["PENDING", "대기"], ["REJECTED", "반려"]];
  const CODES = STATUSES.map(function (x) { return x[0]; });
  let status = CODES.indexOf(Manage.param("status")) !== -1 ? Manage.param("status") : "PENDING";

  Manage.approvalTabs($("tabs"), "themes");
  Manage.statusChips($("chips"), STATUSES, status, function (st) {
    status = st;
    history.replaceState(null, "", Routes.url("adminThemes", { status: st === "PENDING" ? null : st }));
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
      list = await api.get("/api/admin/themes", { status: status });
    } catch (e) {
      box.textContent = "";
      box.append(UI.emptyBox(e.message));
      return;
    }
    if (asked !== status) return;
    box.textContent = "";
    if (!list.length) {
      box.append(UI.emptyBox(status === "PENDING" ? "승인을 기다리는 테마가 없어요." : "반려된 테마가 없어요."));
      return;
    }
    box.append(table(list));
  }

  function table(list) {
    const wrap = el("div", "m-table-wrap");
    const t = el("table", "m-table");
    const hr = el("tr");
    ["테마", "매장", "신청일", "수정일", ""].forEach(function (h) { hr.append(el("th", null, h)); });
    const thead = el("thead");
    thead.append(hr);
    t.append(thead);
    const tbody = el("tbody");
    list.forEach(function (th) {
      const href = Routes.url("adminThemeDetail", { id: th.themeId });
      const tr = el("tr", "click");
      tr.addEventListener("click", function (e) { if (!e.target.closest("a")) location.href = href; });   // 줄 전체가 링크
      tr.append(el("td", "t-title", th.title));
      tr.append(el("td", null, th.storeName));
      tr.append(el("td", "num", Manage.ymd(th.createdAt)));
      tr.append(el("td", "num", Manage.ymd(th.updatedAt)));
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
