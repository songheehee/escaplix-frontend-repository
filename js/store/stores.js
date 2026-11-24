// S27 매장 목록 (pages/store/stores.html) · B 담당
//   지역 고르기: 오른쪽 위 버튼 → 패널 (왼쪽 큰 지역, 오른쪽 그 안의 세부 지역). 폰에서는 아래에서 올라오는 시트
//     큰 지역 묶음은 B-12, 매장은 B-9 로 한 번에 다 받아서 화면에서 거름 (매장 수가 많지 않아서)
//     지역 옆 숫자 = 그 지역 매장 수. 매장이 없는 세부 지역은 안 보이고, 없는 큰 지역은 흐리게
//   정렬은 B-9 sort (rate 평점순 기본 / new 최신순). 바꾸면 매장만 다시 받음
//   고른 지역·정렬은 주소(?region=&area=&sort=)에 남겨서 새로고침·뒤로가기에도 유지
//   매장 이름으로 찾기는 위쪽 통합 검색이 맡는다 → 메인 검색 결과의 "매장" 탭
(function () {
  const el = UI.el;
  const $ = UI.$;
  const P = new URLSearchParams(location.search);

  // 예전 주소(?keyword=)로 들어오면 통합 검색의 매장 탭으로 보냄
  const oldKeyword = (P.get("keyword") || "").trim();
  if (oldKeyword) {
    const q = { keyword: oldKeyword, tab: "stores", sort: "popular" };
    if (P.get("area")) q.area = P.get("area");
    location.replace(Routes.url("home", q));
    return;
  }

  const state = { region: P.get("region") || "", area: P.get("area") || "", sort: P.get("sort") === "new" ? "new" : "rate" };
  let stores = [];      // B-9 전체
  let regions = [];     // B-12 [{ name, areas: [이름 …] }]
  let preview = "";     // 패널 왼쪽에서 가리키고 있는 큰 지역 (아직 적용 전)
  const grid = $("store-grid");
  const btn = $("region-btn");
  const panel = $("region-panel");
  const sortSel = $("store-sort");
  sortSel.value = state.sort;
  UI.enhanceSelect(sortSel);   // 기본 select 대신 사이트 모양 드롭다운 (select 는 숨겨서 그대로 씀)
  for (let i = 0; i < 6; i++) grid.append(el("div", "sk sk-store"));

  Promise.all([
    api.get("/api/stores", { sort: state.sort }),
    api.get("/api/regions").catch(function () { return null; }),   // 못 받으면 큰 지역 하나("전국")에 세부 지역을 다 넣음
  ]).then(function (res) {
    stores = res[0];
    regions = res[1]
      ? res[1].map(function (r) { return { name: r.name, areas: r.areas.map(function (a) { return a.name; }) }; })
      : [{ name: "전국", areas: uniq(stores.map(function (s) { return s.area; })) }];
    // 세부 지역만 주소에 있으면 큰 지역을 찾아 채움
    if (state.area && !state.region) {
      const r = regions.find(function (x) { return x.areas.indexOf(state.area) !== -1; });
      if (r) state.region = r.name;
    }
    render();
  }).catch(function (e) {
    grid.textContent = "";
    grid.append(UI.emptyBox(e.message));
  });

  // 정렬을 바꾸면 매장만 다시 받음 (늦게 온 옛 응답은 버림)
  let sortSeq = 0;
  sortSel.addEventListener("change", function () {
    state.sort = sortSel.value;
    const my = ++sortSeq;
    api.get("/api/stores", { sort: state.sort }).then(function (list) {
      if (my !== sortSeq) return;
      stores = list;
      render();
    }).catch(function (e) { UI.toast(e.message); });
  });

  function render() {
    $("region-label").textContent = state.area ? state.region + " · " + state.area : (state.region ? state.region + " 전체" : "전체 지역");
    btn.classList.toggle("on", !!state.region);
    paintStores();
    saveToUrl();
  }

  // ---------- 패널 ----------
  function openPanel() {
    preview = state.region || (regions.find(function (r) { return countIn(r.areas) > 0; }) || {}).name || "";
    paintPanel();
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    document.body.classList.add("rp-open");
    const cur = panel.querySelector(".rp-regions .on") || panel.querySelector(".rp-regions button");
    if (cur) cur.focus();
  }
  function closePanel(focusBtn) {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("rp-open");
    if (focusBtn) btn.focus();
  }
  function apply(region, area) {
    state.region = region;
    state.area = area;
    closePanel(true);
    render();
  }

  function paintPanel() {
    // 왼쪽: 전체 + 큰 지역 (매장 수). 큰 지역을 누르면 오른쪽만 바뀜 (아직 적용 안 함)
    const left = $("rp-regions");
    left.textContent = "";
    left.append(wrap(item("전체", stores.length, !state.region, false, function () { apply("", ""); })));
    regions.forEach(function (r) {
      const n = countIn(r.areas);
      left.append(wrap(item(r.name, n, preview === r.name, !n, function () {
        preview = r.name;
        paintPanel();
        const b = panel.querySelector(".rp-regions .on");
        if (b) b.focus();
      })));
    });

    // 오른쪽: 가리킨 큰 지역의 "○○ 전체" + 매장 있는 세부 지역. 누르면 적용하고 닫힘
    const right = $("rp-areas");
    right.textContent = "";
    const r = regions.find(function (x) { return x.name === preview; });
    if (!r) { right.append(el("p", "muted small", "왼쪽에서 지역을 골라 주세요.")); return; }
    right.append(item(r.name + " 전체", countIn(r.areas), state.region === r.name && !state.area, false, function () { apply(r.name, ""); }));
    r.areas.forEach(function (a) {
      const n = countIn([a]);
      if (!n) return;
      right.append(item(a, n, state.area === a, false, function () { apply(r.name, a); }));
    });
  }

  // 패널 한 칸 (이름 + 매장 수)
  function item(label, n, on, disabled, onClick) {
    const b = el("button", "rp-item" + (on ? " on" : ""));
    b.type = "button";
    b.disabled = disabled;
    b.append(el("span", null, label), el("span", "rp-n", String(n)));
    b.addEventListener("click", function (e) { e.stopPropagation(); onClick(); });
    return b;
  }
  function wrap(b) { const li = el("li"); li.append(b); return li; }

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (panel.hidden) openPanel(); else closePanel(false);
  });
  $("region-close").addEventListener("click", function () { closePanel(true); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePanel(true); });
  document.addEventListener("click", function (e) {
    if (!panel.hidden && !panel.contains(e.target)) closePanel(false);
  });

  // ---------- 매장 목록 ----------
  function paintStores() {
    const r = regions.find(function (x) { return x.name === state.region; });
    const list = stores.filter(function (s) {
      if (state.area) return s.area === state.area;
      if (r) return r.areas.indexOf(s.area) !== -1;
      return true;
    });
    grid.textContent = "";
    if (!list.length) {
      grid.append(UI.emptyBox("이 지역에는 아직 매장이 없어요."));
      return;
    }
    list.forEach(function (s) { grid.append(UI.storeCard(s)); });
  }

  function saveToUrl() {
    const url = new URL(location.href);
    url.search = "";
    if (state.region) url.searchParams.set("region", state.region);
    if (state.area) url.searchParams.set("area", state.area);
    if (state.sort !== "rate") url.searchParams.set("sort", state.sort);
    history.replaceState(null, "", url);
  }

  function countIn(areas) {
    return stores.filter(function (s) { return areas.indexOf(s.area) !== -1; }).length;
  }
  function uniq(list) {
    return list.filter(function (x, i) { return list.indexOf(x) === i; });
  }
})();
