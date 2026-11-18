// S08 메인 (index.html) · B 담당
//   - 맨 위 추천 배너: 로그인 손님은 D-9 맞춤 추천, 비회원은 B-1(sort=rate) 상위 5개 (결정 C1)
//   - 가로 줄: B-1 응답을 한 번 받아서 화면이 나눠 그림 (명세 B-1)
//   - 검색·필터로 들어오면(주소에 조건이 있으면) 배너·줄 대신 결과 격자
(function () {
  const el = UI.el;
  const me = Auth.me();
  const isUser = !!me && me.role === "USER";

  const P = new URLSearchParams(location.search);
  const F = {
    keyword: (P.get("keyword") || "").trim(),
    area: P.get("area") || "",
    date: P.get("date") || "",
    people: P.get("people") || "",
    genreId: P.get("genreId") || "",
    sort: P.get("sort") || "rate",
  };
  const searchMode = !!(F.keyword || F.area || F.date || F.people || F.genreId || P.has("sort"));

  const heroBox = UI.$("hero");
  const main = UI.$("rows");

  // 줄 제목 (장르 이름 → 문구). 없는 장르는 "{장르} 테마"
  const GENRE_ROW = {
    "공포": "심장이 쫄깃한 공포", "추리": "머리 쓰는 추리", "스릴러": "숨 막히는 스릴러",
    "감성": "마음이 몽글몽글, 감성", "코믹": "웃다가 탈출하는 코믹", "판타지": "다른 세계로, 판타지",
    "SF": "미래에서 온 SF", "모험": "떠나 볼까, 모험", "잠입": "들키면 끝, 잠입", "어드벤처": "떠나 볼까, 어드벤처",
  };

  if (searchMode) {
    heroBox.hidden = true;
    document.body.classList.add("search-mode");
    renderSearch();
  } else {
    renderBrowse();
  }

  // =========================================================
  // 1) 둘러보기 화면 (배너 + 가로 줄)
  // =========================================================
  async function renderBrowse() {
    for (let i = 0; i < 4; i++) main.append(UI.skeletonRow());

    let themes;
    try {
      themes = await api.get("/api/themes", { sort: "rate" });
    } catch (e) {
      heroBox.hidden = true;
      main.textContent = "";
      main.append(errorBox(e.message));
      return;
    }
    const [genres, recs] = await Promise.all([
      api.get("/api/genres").catch(function () { return null; }),
      isUser ? api.get("/api/my/recommendations").catch(function () { return null; }) : Promise.resolve(null),
    ]);

    main.textContent = "";
    if (!themes.length) {
      heroBox.hidden = true;
      main.append(UI.emptyBox("아직 공개된 테마가 없어요. 곧 새로운 테마가 열릴 거예요."));
      return;
    }

    renderHero(themes, recs);
    renderRows(themes, genres);
  }

  function renderRows(themes, genres) {
    const rows = [];
    const rated = themes.filter(function (t) { return t.avgRating !== null; });

    if (rated.length) rows.push({ title: "오늘의 Escaplix TOP 5", note: "평균 별점 기준", list: rated.slice(0, 5), rank: true });

    if (isUser) {
      const wished = themes.filter(function (t) { return t.wished; });
      if (wished.length) rows.push({ title: "내가 찜한 테마", list: wished, id: "row-wished" });
    }

    const party = themes.filter(function (t) { return t.recruitingPartyCount > 0; })
      .sort(function (a, b) { return b.recruitingPartyCount - a.recruitingPartyCount; });
    rows.push({ title: "지금 파티 모집 중", note: "같이 갈 사람이 기다리고 있어요", list: party });

    const fresh = themes.filter(function (t) { return UI.isRecent(t.createdAt, 14); })
      .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    rows.push({ title: "새로 문을 연 테마", note: "최근 14일", list: fresh });

    // 장르 줄: B-7 순서대로. B-7을 못 받으면 테마에 붙은 장르로
    const names = genres ? genres.map(function (g) { return g.name; })
      : Array.from(new Set(themes.flatMap(function (t) { return t.genres; })));
    names.forEach(function (name) {
      const list = themes.filter(function (t) { return t.genres.indexOf(name) !== -1; });
      rows.push({ title: GENRE_ROW[name] || name + " 테마", list: list, genre: name });
    });

    rows.push({ title: "방탈출이 처음이라면", note: "난이도 2 이하", list: themes.filter(function (t) { return t.difficulty <= 2; }) });
    rows.push({ title: "고수만 오세요", note: "난이도 5", list: themes.filter(function (t) { return t.difficulty >= 5; }) });

    rows.forEach(function (r) {
      if (!r.list.length) return;
      const sec = r.rank
        ? UI.row(r.title, r.note, r.list, rankCard, "rank-row")
        : UI.row(r.title, r.note, r.list, UI.themeCard);
      if (r.id) sec.id = r.id;
      if (r.genre && genres) {
        const g = genres.find(function (x) { return x.name === r.genre; });
        if (g) {
          const more = el("a", "row-more", "모두 보기 ›");
          more.href = Routes.url("home", { genreId: g.genreId });
          sec.querySelector(".row-title").append(more);
        }
      }
      main.append(sec);
    });
  }

  // TOP 5 줄: 큰 숫자 + 세로 포스터
  function rankCard(t, i) {
    const a = el("a", "rank");
    a.href = Routes.url("theme", { id: t.themeId });
    a.setAttribute("aria-label", (i + 1) + "위 " + t.title);
    const no = el("span", "rank-no", String(i + 1));
    no.setAttribute("aria-hidden", "true");
    const art = el("div", "rank-art");
    art.append(UI.poster(t));
    const cap = el("div", "rank-cap");
    cap.append(el("b", null, t.title));
    cap.append(el("span", null, "★ " + UI.rating(t.avgRating) + " · " + t.storeName));
    art.append(cap);
    a.append(no, art);
    return a;
  }

  // =========================================================
  // 2) 추천 배너 (자동으로 넘어가는 큰 화면)
  // =========================================================
  function renderHero(themes, recs) {
    const byId = {};
    themes.forEach(function (t) { byId[t.themeId] = t; });

    let picks;
    let personal = false;
    if (recs && recs.length) {
      personal = true;
      picks = recs.map(function (r) {
        const t = byId[r.themeId] || {};
        return Object.assign({}, t, r, { wished: !!t.wished, area: t.area, createdAt: t.createdAt });
      });
    } else {
      picks = themes.slice(0, 5).map(function (t) {
        return Object.assign({}, t, { reason: "평점 높은 인기 테마" });
      });
    }

    const track = UI.$("hero-track");
    const dotsBox = UI.$("hero-dots");
    track.textContent = "";
    dotsBox.textContent = "";

    picks.forEach(function (t, i) {
      const slide = el("article", "hero-slide");
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "slide");
      slide.setAttribute("aria-label", (i + 1) + " / " + picks.length + " · " + t.title);

      const bg = el("div", "hero-bg");
      UI.posterBg(bg, t);
      slide.append(bg, el("div", "hero-shade"));

      const box = el("div", "hero-content");
      box.append(el("div", "hero-kicker",
        personal ? me.nickname + " 님을 위한 추천" : (i === 0 ? "지금 가장 인기 있는 테마" : "인기 테마 " + (i + 1) + "위")));
      box.append(el("h1", "hero-title", t.title));

      const meta = el("div", "hero-meta");
      const r = UI.rating(t.avgRating);
      meta.append(el("span", "match", r ? "★ " + r : "새 테마"));
      const lv = el("span", "lv", "난이도 ");
      lv.append(UI.difficultyDots(t.difficulty));
      meta.append(lv);
      meta.append(el("span", null, t.playMinutes + "분"));
      meta.append(el("span", null, UI.people(t.minPeople, t.maxPeople)));
      meta.append(el("span", null, "1인 " + UI.won(t.price)));
      box.append(meta);

      if (t.reason) box.append(el("div", "hero-reason", t.reason));
      const desc = el("p", "hero-desc", t.description || "");
      box.append(desc);
      if (!t.description) fillDescription(t.themeId, desc);
      box.append(el("div", "hero-store", UI.genresText(t.genres) + "  ·  " + t.storeName));

      const btns = el("div", "hero-btns");
      const go = el("a", "btn btn-light", "▶  상세 보기");
      go.href = Routes.url("theme", { id: t.themeId });
      btns.append(go);
      if (!me || isUser) {
        const party = el("a", "btn btn-dim");
        if (t.recruitingPartyCount > 0) {
          party.textContent = "👥  모집 중인 파티 " + t.recruitingPartyCount;
          party.href = Routes.url("partyList", { themeId: t.themeId });
        } else {
          party.textContent = "👥  파티 모집하기";
          party.href = Routes.url("partyForm", { themeId: t.themeId });
        }
        btns.append(party);
        btns.append(UI.wishButton(t.themeId, t.wished, true));
      }
      box.append(btns);
      slide.append(box);
      track.append(slide);

      const dot = el("button");
      dot.type = "button";
      dot.setAttribute("aria-label", (i + 1) + "번째 보기");
      dot.addEventListener("click", function () { go_(i); restart(); });
      dotsBox.append(dot);
    });

    // 넘기기
    const slides = track.children;
    const dots = dotsBox.querySelectorAll("button");
    const pause = UI.$("hero-pause");
    let idx = 0, timer = null, paused = false;

    function go_(n) {
      idx = (n + picks.length) % picks.length;
      Array.prototype.forEach.call(slides, function (s, k) {
        const on = k === idx;
        s.classList.toggle("on", on);
        s.setAttribute("aria-hidden", String(!on));
        s.querySelectorAll("a, button").forEach(function (x) { x.tabIndex = on ? 0 : -1; });
      });
      dots.forEach(function (d, k) {
        d.classList.toggle("on", k === idx);
        if (k === idx) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current");
      });
    }
    function start() { if (!paused && !timer && picks.length > 1) timer = setInterval(function () { go_(idx + 1); }, 7000); }
    function stop() { clearInterval(timer); timer = null; }
    function restart() { stop(); start(); }

    heroBox.querySelector(".hero-arrow.prev").addEventListener("click", function () { go_(idx - 1); restart(); });
    heroBox.querySelector(".hero-arrow.next").addEventListener("click", function () { go_(idx + 1); restart(); });
    function paintPause() {
      pause.textContent = paused ? "▶" : "❚❚";
      pause.setAttribute("aria-label", paused ? "자동 넘김 켜기" : "자동 넘김 멈추기");
    }
    pause.addEventListener("click", function () { paused = !paused; paintPause(); paused ? stop() : start(); });
    heroBox.addEventListener("mouseenter", stop);
    heroBox.addEventListener("mouseleave", start);
    heroBox.addEventListener("focusin", stop);
    heroBox.addEventListener("focusout", start);
    let x0 = null;
    heroBox.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; stop(); }, { passive: true });
    heroBox.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) go_(idx + (dx < 0 ? 1 : -1));
      x0 = null;
      start();
    });
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) paused = true;
    if (picks.length < 2) heroBox.classList.add("single");

    paintPause();
    heroBox.classList.remove("loading");
    go_(0);
    start();
  }

  // 비회원 배너는 B-1에 설명이 없어서 B-2로 한 줄 채워 넣는다 (실패하면 빈 칸 그대로)
  function fillDescription(themeId, node) {
    api.get("/api/themes/" + themeId).then(function (d) {
      node.textContent = d.description || "";
    }).catch(function () { /* 설명 없이 둠 */ });
  }

  // =========================================================
  // 3) 검색 결과 화면 (B-1 조건 검색)
  // =========================================================
  async function renderSearch() {
    const wrap = el("section", "search-page");
    const form = buildFilterForm();
    const head = el("div", "search-head");
    const grid = el("div", "grid");
    wrap.append(form, head, grid);
    main.append(wrap);
    head.append(el("div", "sk sk-title"));

    try {
      const list = await api.get("/api/themes", F);
      head.textContent = "";
      const h = el("h1", "search-title", summaryText() + " 검색 결과");
      h.append(el("small", null, list.length + "개"));
      head.append(h);
      if (!list.length) {
        grid.replaceWith(UI.emptyBox("찾는 테마나 매장이 없어요. 다른 이름이나 조건으로 검색해 보세요.", "전체 테마 보기", Routes.url("home")));
        return;
      }
      list.forEach(function (t) { grid.append(UI.themeCard(t)); });
    } catch (e) {
      head.textContent = "";
      grid.replaceWith(errorBox(e.message));
    }
  }

  function summaryText() {
    const parts = [];
    if (F.keyword) parts.push("‘" + F.keyword + "’");
    if (F.area) parts.push(F.area);
    if (F.date) parts.push(F.date.slice(5).replace("-", "/"));
    if (F.people) parts.push(F.people + "명");
    if (F.genreId) parts.push(genreLabel || "장르");
    return parts.length ? parts.join(" · ") : "전체 테마";
  }
  let genreLabel = "";

  // 검색 조건 막대: 바꾸면 바로 다시 검색 (주소가 바뀌어서 공유·뒤로가기 가능)
  function buildFilterForm() {
    const form = el("form", "filter-bar");
    form.action = Routes.url("home");
    form.setAttribute("role", "search");

    const kw = el("input", "fb-keyword");
    kw.type = "search";
    kw.name = "keyword";
    kw.placeholder = "테마·매장 이름";
    kw.value = F.keyword;
    kw.setAttribute("aria-label", "테마·매장 이름");
    form.append(field("검색어", kw));

    const area = select("area", [["", "모든 지역"]], F.area);
    form.append(field("지역", area));
    api.get("/api/areas").then(function (list) {
      list.forEach(function (a) { area.append(option(a, a)); });
      area.value = F.area;
    }).catch(function () { /* 지역 없이 */ });

    const date = el("input");
    date.type = "date";
    date.name = "date";
    date.min = UI.today();
    date.value = F.date;
    form.append(field("날짜", date));

    const ppl = select("people", [["", "인원 무관"]].concat([2, 3, 4, 5, 6, 7, 8].map(function (n) { return [String(n), n + "명"]; })), F.people);
    form.append(field("인원", ppl));

    const genre = select("genreId", [["", "모든 장르"]], F.genreId);
    form.append(field("장르", genre));
    api.get("/api/genres").then(function (list) {
      list.forEach(function (g) { genre.append(option(String(g.genreId), g.name)); });
      genre.value = F.genreId;
      const g = list.find(function (x) { return String(x.genreId) === F.genreId; });
      if (g) {
        genreLabel = g.name;
        const t = document.querySelector(".search-title");
        if (t) t.firstChild.textContent = summaryText() + " 검색 결과";
      }
    }).catch(function () { /* 장르 없이 */ });

    const sort = select("sort", [["rate", "평점순"], ["new", "최신순"]], F.sort);
    form.append(field("정렬", sort));

    const reset = el("a", "btn btn-line small fb-reset", "조건 지우기");
    reset.href = Routes.url("home", { sort: "rate" });
    form.append(reset);

    form.addEventListener("change", function (e) { if (e.target !== kw) form.requestSubmit(); });
    form.addEventListener("submit", function () {
      // 빈 칸은 주소에 안 붙임. 단 sort 는 남겨서 "검색 화면"이 유지되게
      Array.from(form.elements).forEach(function (x) { if (x.name && x.name !== "sort" && !x.value) x.disabled = true; });
    });
    return form;

    function field(label, control) {
      const l = el("label", "fb-field");
      l.append(el("span", null, label), control);
      return l;
    }
    function option(v, t) { const o = el("option", null, t); o.value = v; return o; }
    function select(name, opts, value) {
      const s = el("select");
      s.name = name;
      opts.forEach(function (o) { s.append(option(o[0], o[1])); });
      s.value = value;
      return s;
    }
  }

  function errorBox(msg) {
    const box = UI.emptyBox(msg);
    const retry = el("button", "btn btn-light small", "다시 시도");
    retry.type = "button";
    retry.addEventListener("click", function () { location.reload(); });
    box.append(el("br"), retry);
    return box;
  }
})();
