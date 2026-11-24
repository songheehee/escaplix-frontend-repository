// S07 회원 관리 (pages/admin/admin-members.html?role=&keyword=) · A 담당
//   A-10 회원 목록 (keyword: 아이디·닉네임 일부, role: USER / OWNER, 없으면 전체)
//   A-11 사장 사업자등록증 이미지 (토큰이 필요 → Manage.privateImage 가 api.blob 으로 불러옴)
//   탭 숫자(countByRole)는 검색과 상관없이 전체 수. 회원 정지 기능은 없음 (명세 A-10)
//   검색 조건은 주소에 남겨서 새로고침·뒤로 가기에도 그대로
(function () {
  const el = UI.el;
  const $ = UI.$;
  if (!Manage.guard(["ADMIN"])) return;

  const ROLES = [["", "전체"], ["USER", "손님"], ["OWNER", "사장"]];
  const ROLE_BADGE = { USER: ["손님", "off"], OWNER: ["사장", "warn"], ADMIN: ["관리자", "ok"] };

  let loadSeq = 0;   // 늦게 도착한 예전 응답 무시
  const PER_PAGE = 20;   // 한 쪽에 20명 (A-10 은 한 번에 다 주므로 화면에서 나눔)
  let members = [];
  let page = 1;
  let timer = null;
  let role = ["USER", "OWNER"].indexOf(Manage.param("role")) !== -1 ? Manage.param("role") : "";
  let keyword = (Manage.param("keyword") || "").trim();

  const input = $("keyword");
  input.value = keyword;
  const tabs = renderTabs();

  // 칸에 쓰는 동안 잠깐 멈추면 찾기, Enter·검색 버튼은 바로
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { setKeyword(input.value); }, 300);
  });
  $("search").addEventListener("submit", function (e) {
    e.preventDefault();
    clearTimeout(timer);
    setKeyword(input.value);
  });

  load().finally(function () { document.body.classList.add("adm-ready"); });   // 다 불러오면 제목 아래를 한 번에 보여 줌 (탭 이동 깜빡임 방지, manage.css .adm-fade)

  function setKeyword(v) {
    v = v.trim();
    if (v === keyword) return;
    keyword = v;
    load();
  }

  function renderTabs() {
    const box = $("roles");
    const btns = {};
    ROLES.forEach(function (r) {
      const b = el("button", null, r[1]);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(r[0] === role));
      b.addEventListener("click", function () {
        if (role === r[0]) return;
        role = r[0];
        Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-selected", String(k === role)); });
        load();
      });
      btns[r[0]] = b;
      box.append(b);
    });
    return btns;
  }

  // 탭 글자 옆에 전체 수 (전체 = 손님 + 사장, 관리자는 뺌). 괄호 없이 작고 흐리게: "전체 1,000"
  //   메인 검색 결과 탭(테마 12 · 매장 3)과 같은 모양. 검색어와 상관없이 전체 수
  function paintTabCounts(c) {
    const all = (c.USER || 0) + (c.OWNER || 0);   // 관리자는 명단에서 빼므로 전체 수에서도 뺌
    Manage.tabCount(tabs[""], "전체", all);
    Manage.tabCount(tabs.USER, "손님", c.USER || 0);
    Manage.tabCount(tabs.OWNER, "사장", c.OWNER || 0);
  }

  async function load() {
    const seq = ++loadSeq;
    history.replaceState(null, "", Routes.url("adminMembers", { role: role, keyword: keyword }));
    const box = $("list");
    box.setAttribute("aria-busy", "true");
    let res;
    try {
      res = await api.get("/api/admin/members", { role: role, keyword: keyword });
    } catch (e) {
      if (seq !== loadSeq) return;
      box.removeAttribute("aria-busy");
      box.textContent = "";
      $("count").textContent = "";
      box.append(UI.emptyBox(e.message));
      return;
    }
    if (seq !== loadSeq) return;
    box.removeAttribute("aria-busy");
    paintTabCounts(res.countByRole || {});

    const what = role ? ROLE_BADGE[role][0] : "회원";
    // 검색했을 때만 검색창 옆에 결과 수 (검색어가 없으면 탭 숫자와 같아서 안 보임)
    // 관리자 계정은 명단에서 뺌 (손님·사장만)
    const list = res.members.filter(function (m) { return m.role !== "ADMIN"; });
    $("count").textContent = keyword ? list.length.toLocaleString("ko-KR") + "명" : "";

    box.textContent = "";
    if (!list.length) {
      box.append(UI.emptyBox(keyword ? "「" + keyword + "」에 맞는 " + what + "이 없어요." : what + "이 아직 없어요."));
      return;
    }
    members = list;
    page = 1;   // 검색어·탭이 바뀌면 다시 1쪽부터
    showPage();
  }

  function showPage() {
    const box = $("list");
    box.textContent = "";
    box.append(table(members.slice((page - 1) * PER_PAGE, page * PER_PAGE)));
    const nav = Manage.pager(members.length, page, PER_PAGE, function (p) {
      page = p;
      showPage();
      $("roles").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    if (nav) box.append(nav);
  }

  function table(members) {
    const wrap = el("div", "m-table-wrap");
    const t = el("table", "m-table am-table");
    const thead = el("thead");
    const hr = el("tr");
    ["번호", "아이디", "닉네임", "유형", "사업자등록번호", "관리 매장", "가입일", ""].forEach(function (h) { hr.append(el("th", null, h)); });
    thead.append(hr);
    t.append(thead);

    const tbody = el("tbody");
    members.forEach(function (m) {
      const owner = m.role === "OWNER";
      const tr = el("tr");
      tr.append(el("td", "num", String(m.memberId)));
      tr.append(el("td", "t-title", m.loginId));
      tr.append(el("td", null, m.nickname));
      const rc = el("td");
      const b = ROLE_BADGE[m.role] || [m.role, "off"];
      rc.append(el("span", "st " + b[1], b[0]));
      tr.append(rc);
      tr.append(el("td", "num", owner ? (m.bizNo || "-") : "-"));
      // 사장: "매장 N곳 ▾" 을 누르면 그 줄 아래에 매장 목록 (관리자 개편 11/23)
      const sc = el("td", "num");
      if (owner) {
        const n = (m.stores || []).length;
        const btn = el("button", "am-stores-btn", n ? "매장 " + n + "곳 ▾" : "매장 없음");
        btn.type = "button";
        btn.disabled = !n;
        btn.setAttribute("aria-expanded", "false");
        btn.addEventListener("click", function () { toggleStores(tr, btn, m); });
        sc.append(btn);
      } else sc.textContent = "-";
      tr.append(sc);
      tr.append(el("td", "num", Manage.ymd(m.createdAt)));
      const go = el("td", "go");
      if (owner) {
        const btn = el("button", "btn btn-line small", "사업자등록증");
        btn.type = "button";
        btn.addEventListener("click", function () { showBizFile(m); });
        go.append(btn);
      }
      tr.append(go);
      tbody.append(tr);
    });
    t.append(tbody);
    wrap.append(t);
    return wrap;
  }

  // 사장의 매장 목록 펼치기/접기. 승인된 매장 → 매장 관리의 그 매장, 대기·반려 → 승인 상세
  function toggleStores(tr, btn, m) {
    const next = tr.nextElementSibling;
    if (next && next.classList.contains("am-stores")) {
      next.remove();
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "매장 " + m.stores.length + "곳 ▾";
      return;
    }
    // 매장마다 한 줄: 이름 · 상태 · 오른쪽 "매장 보기 ›" (줄 전체가 링크)
    const row = el("tr", "am-stores");
    const td = el("td");
    td.colSpan = tr.children.length;
    const list = el("div", "am-store-list");
    m.stores.forEach(function (s) {
      const a = el("a", "am-store");
      a.href = s.status === "APPROVED" ? Routes.url("ownerStore", { id: s.storeId }) : Routes.url("adminStoreDetail", { id: s.storeId });
      const name = el("span", "am-store-name", s.name);
      name.title = s.name;
      a.append(name, Manage.badge(s.status), el("span", "am-store-go", s.status === "APPROVED" ? "매장 보기 ›" : "승인 상세 ›"));
      list.append(a);
    });
    td.append(list);
    row.append(td);
    tr.after(row);
    btn.setAttribute("aria-expanded", "true");
    btn.textContent = "매장 " + m.stores.length + "곳 ▴";
  }

  // A-11 사업자등록증 보기 (팝업). 닫으면 팝업을 지움
  function showBizFile(m) {
    const dlg = el("dialog", "m-dialog am-doc");
    dlg.setAttribute("aria-labelledby", "am-doc-title");
    const form = el("form");
    form.method = "dialog";
    const h = el("h2", null, m.nickname + " 님의 사업자등록증");
    h.id = "am-doc-title";
    const info = el("p", null, m.loginId + " · 사업자등록번호 " + (m.bizNo || "-") + " · 관리 매장 " + m.managedStoreCount + "곳");
    const preview = el("div", "m-preview");
    const actions = el("div", "m-actions");
    const close = el("button", "btn btn-line", "닫기");
    close.type = "submit";
    actions.append(close);
    form.append(h, info, preview, actions);
    dlg.append(form);
    document.body.append(dlg);
    dlg.addEventListener("close", function () {
      preview.querySelectorAll("img").forEach(function (i) { URL.revokeObjectURL(i.src); });
      dlg.remove();
    });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });   // 바깥 누르면 닫기
    dlg.showModal();
    Manage.privateImage("/api/admin/members/" + m.memberId + "/biz-file", preview, m.nickname + " 님의 사업자등록증");
  }
})();
