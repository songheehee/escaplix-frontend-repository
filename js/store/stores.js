// S27 매장 목록 (pages/store/stores.html) · B 담당
//   B-8 지역 칩 + 매장 이름 검색 → B-9 (서버가 걸러 줌, 띄어쓰기 무시)
//   주소(?area=&keyword=)에 조건을 남겨서 새로고침·뒤로가기에도 유지
(function () {
  const el = UI.el;
  const $ = UI.$;
  const P = new URLSearchParams(location.search);
  const state = { area: P.get("area") || "", keyword: P.get("keyword") || "" };

  const q = $("store-q");
  q.value = state.keyword;

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
  }).catch(function () { /* 지역 칩 없이 검색만 */ });

  function paintChips() {
    chips.querySelectorAll(".chip").forEach(function (c) {
      const on = c.dataset.area === state.area;
      c.classList.toggle("on", on);
      c.setAttribute("aria-pressed", String(on));
    });
  }

  // 검색: 입력을 멈추고 0.3초 뒤에 요청
  let timer = null;
  q.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { state.keyword = q.value.trim(); load(); }, 300);
  });
  $("store-search").addEventListener("submit", function (e) {
    e.preventDefault();
    clearTimeout(timer);
    state.keyword = q.value.trim();
    load();
  });

  let seq = 0;
  async function load() {
    paintChips();
    const url = new URL(location.href);
    url.search = "";
    if (state.area) url.searchParams.set("area", state.area);
    if (state.keyword) url.searchParams.set("keyword", state.keyword);
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
        grid.append(UI.emptyBox("조건에 맞는 매장이 없어요."));
        return;
      }
      list.forEach(function (s) { grid.append(storeCard(s)); });
    } catch (e) {
      if (my !== seq) return;
      grid.textContent = "";
      $("store-count").textContent = "";
      grid.append(UI.emptyBox(e.message));
    }
  }

  function storeCard(s) {
    const a = el("a", "store-card");
    a.href = Routes.url("store", { id: s.storeId });

    const art = el("div", "sc-art");
    // 매장 사진 (없으면 장르 색)
    UI.posterBg(art, { posterUrl: s.photoUrl, genres: s.genres });
    const top = el("div", "sc-top");
    top.append(el("span", "sc-area", "📍 " + s.area));
    if (s.recruitingPartyCount) top.append(el("span", "sc-party", "파티 모집 " + s.recruitingPartyCount));
    art.append(top);
    art.append(el("h2", "sc-name", s.name));
    a.append(art);

    const body = el("div", "sc-body");
    const r = UI.rating(s.avgRating);
    const line = el("div", "sc-line");
    line.append(el("span", "match", r ? "★ " + r : "후기 없음"));
    line.append(el("span", null, "테마 " + s.themeCount + "개"));
    body.append(line);
    if (s.address) body.append(el("div", "sc-addr", s.address));
    if (s.hours) body.append(el("div", "muted small", "🕒 " + s.hours));
    if (s.genres && s.genres.length) {
      const tags = el("div", "sc-tags");
      s.genres.forEach(function (g) { tags.append(el("span", "tag", g)); });
      body.append(tags);
    }
    a.append(body);
    return a;
  }

  load();
})();
