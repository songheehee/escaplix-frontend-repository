// S27 매장 목록 (pages/store/stores.html) · B 담당
//   B-8 지역 칩 → B-9 (서버가 걸러 줌). 지역(?area=)은 주소에 남겨서 새로고침·뒤로가기에도 유지
//   매장 이름으로 찾기는 위쪽 통합 검색이 맡는다 → 메인 검색 결과의 "매장" 탭
(function () {
  const el = UI.el;
  const $ = UI.$;
  const P = new URLSearchParams(location.search);

  // 예전 주소(?keyword=)로 들어오면 통합 검색의 매장 탭으로 보냄
  const oldKeyword = (P.get("keyword") || "").trim();
  if (oldKeyword) {
    const q = { keyword: oldKeyword, tab: "stores", sort: "rate" };
    if (P.get("area")) q.area = P.get("area");
    location.replace(Routes.url("home", q));
    return;
  }

  const state = { area: P.get("area") || "" };

  // 지역 칩
  const chips = $("area-chips");
  function chip(value, label) {
    const b = el("button", "chip", label);
    b.type = "button";
    b.dataset.area = value;
    b.addEventListener("click", function () { state.area = value; load(); });
    chips.append(b);
  }
  chip("", "전체");
  api.get("/api/areas").then(function (list) {
    list.forEach(function (a) { chip(a, a); });
    paintChips();
  }).catch(function () { /* 지역 칩 없이 전체만 */ });

  function paintChips() {
    chips.querySelectorAll(".chip").forEach(function (c) {
      const on = c.dataset.area === state.area;
      c.classList.toggle("on", on);
      c.setAttribute("aria-pressed", String(on));
    });
  }

  let seq = 0;
  async function load() {
    paintChips();
    const url = new URL(location.href);
    url.search = "";
    if (state.area) url.searchParams.set("area", state.area);
    history.replaceState(null, "", url);

    const my = ++seq;
    const grid = $("store-grid");
    if (!grid.children.length) for (let i = 0; i < 6; i++) grid.append(el("div", "sk sk-store"));
    try {
      const list = await api.get("/api/stores", state);
      if (my !== seq) return; // 늦게 온 옛 응답은 버림
      grid.textContent = "";
      $("store-count").textContent = (state.area ? state.area + " · " : "") + "매장 " + list.length + "곳";
      if (!list.length) {
        grid.append(UI.emptyBox("이 지역에는 아직 매장이 없어요."));
        return;
      }
      list.forEach(function (s) { grid.append(UI.storeCard(s)); });
    } catch (e) {
      if (my !== seq) return;
      grid.textContent = "";
      $("store-count").textContent = "";
      grid.append(UI.emptyBox(e.message));
    }
  }

  load();
})();
