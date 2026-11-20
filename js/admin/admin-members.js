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

  load();

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

  // 탭 글자에 전체 수 붙이기 (전체 = 손님 + 사장 + 관리자)
  function paintTabCounts(c) {
    const all = (c.USER || 0) + (c.OWNER || 0) + (c.ADMIN || 0);
    tabs[""].textContent = "전체 (" + all + ")";
    tabs.USER.textContent = "손님 (" + (c.USER || 0) + ")";
    tabs.OWNER.textContent = "사장 (" + (c.OWNER || 0) + ")";
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
    $("count").textContent = keyword
      ? "「" + keyword + "」 검색 결과 " + what + " " + res.total + "명"
      : what + " " + res.total + "명";

    box.textContent = "";
    if (!res.members.length) {
      box.append(UI.emptyBox(keyword ? "「" + keyword + "」에 맞는 " + what + "이 없어요." : what + "이 아직 없어요."));
      return;
    }
    box.append(table(res.members));
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
      tr.append(el("td", "num", owner ? m.managedStoreCount + "곳" : "-"));
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
