// S08 메인 (index.html) · B 담당
//   - 맨 위 추천 배너: 로그인 손님은 D-9 맞춤 추천, 비회원은 B-1(sort=rate) 상위 5개 (결정 C1)
//   - 가로 줄: B-1 응답을 한 번 받아서 화면이 나눠 그림 (명세 B-1)
//   - 검색·필터로 들어오면(주소에 조건이 있으면) 배너·줄 대신 통합 검색 결과
//     테마(B-1)·매장(B-9)을 한 번에 찾아서 [테마] [매장] 탭으로 보여 줌. 매장 탭은 검색어·지역만 적용
(function () {
  const el = UI.el;
  const me = Auth.me();
  const isUser = !!me && me.role === "USER";

  const P = new URLSearchParams(location.search);
  const F = {
    keyword: (P.get("keyword") || "").trim(),
    area: P.get("area") || "",
    region: P.get("area") ? "" : P.get("region") || "",   // 큰 지역 (서울 전체 등). 세부 지역이 있으면 그게 우선
    date: P.get("date") || "",
    people: P.get("people") || "",
    genreId: P.get("genreId") || "",
    sort: P.get("sort") || "popular",   // 기본은 이번 주 인기순
    tab: P.get("tab") === "stores" ? "stores" : "themes",   // 결과 탭
  };
  let tabChosen = P.has("tab");   // 처음 검색에서만: 탭을 안 정했고 테마가 0개면 매장 탭을 먼저 보여 줌
  let firstLoad = true;           // 조건을 바꿔서 다시 찾을 때는 탭을 저절로 바꾸지 않음
  // 지난 날짜는 달력에서 고를 수 없게 막아 두지만, 예전에 저장한 주소로 들어오면 남아 있을 수 있다
  //   → 날짜 조건만 빼고 주소도 고친다 (그대로 보내면 서버가 400)
  if (F.date && F.date < UI.today()) {
    F.date = "";
    P.delete("date");
    history.replaceState(null, "", location.pathname + (P.toString() ? "?" + P : "") + location.hash);
  }
  const searchMode = !!(F.keyword || F.area || F.region || F.date || F.people || F.genreId || P.has("sort") || P.has("tab"));

  const heroBox = UI.$("hero");
  const main = UI.$("rows");
  // 검색 결과 화면: 제목 · 결과 칸 (renderSearch 보다 먼저 만들어 둬야 함)
  const searchHead = el("div", "search-head");
  const searchTabs = el("div", "search-tabs");
  searchTabs.setAttribute("role", "tablist");
  searchTabs.setAttribute("aria-label", "검색 결과 종류");
  const searchOut = el("div", "search-out");
  searchOut.id = "search-out";
  searchOut.setAttribute("role", "tabpanel");
  let searchPage = null;
  let found = null;    // 마지막 검색 결과 { themes, stores } (탭만 바꿀 때는 다시 안 불러옴)
  let searchSeq = 0;   // 늦게 온 옛날 응답이 새 결과를 덮어쓰지 않게

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
      // 이번 주 인기순으로 한 번 받아서 줄마다 나눠 그림 (TOP 5·배너는 이 순서 그대로)
      themes = await api.get("/api/themes", { sort: "popular" });
    } catch (e) {
      heroBox.hidden = true;
      main.textContent = "";
      main.append(errorBox(e.message));
      return;
    }
    const [genres, recs, myGenres] = await Promise.all([
      api.get("/api/genres").catch(function () { return null; }),
      isUser ? api.get("/api/my/recommendations").catch(function () { return null; }) : Promise.resolve(null),
      isUser ? api.get("/api/my/genres").catch(function () { return null; }) : Promise.resolve(null),   // D-7 선호 장르
    ]);

    main.textContent = "";
    if (!themes.length) {
      heroBox.hidden = true;
      main.append(UI.emptyBox("아직 공개된 테마가 없어요. 곧 새로운 테마가 열릴 거예요."));
      return;
    }

    renderHero(themes, recs);
    renderRows(themes, genres, myGenres);
  }

  // 메인 줄은 많아야 8개: TOP 5 · 파티 모집 중 · 새 테마 · 장르 3줄 · 난이도 2줄
  const GENRE_ROWS = 3;

  function renderRows(themes, genres, myGenres) {
    const rows = [];
    // 이번 주 인기 TOP 5: 최근 7일 새 파티×3 + 새 찜×2 + 새 후기×1 (B-1 sort=popular, 같으면 평점순)
    rows.push({ title: "이번 주 인기 TOP 5", note: "최근 7일 파티·찜·후기 기준", list: themes.slice(0, 5), rank: true });
    // 찜한 테마 줄은 두지 않음 (찜 목록은 프로필 ▾ → 찜 목록)

    const party = themes.filter(function (t) { return t.recruitingPartyCount > 0; })
      .sort(function (a, b) { return b.recruitingPartyCount - a.recruitingPartyCount; });
    rows.push({ title: "지금 파티 모집 중", note: "같이 갈 사람이 기다리고 있어요", list: party });

    const fresh = themes.filter(function (t) { return UI.isRecent(t.createdAt, 14); })
      .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    rows.push({ title: "새로 문을 연 테마", note: "최근 14일", list: fresh });

    // 장르 줄은 3개만: 로그인 손님은 선호 장르(D-7)부터, 남는 자리(비회원·선호 없음 포함)는 테마가 많은 장르로
    //   나머지 장르는 검색의 장르 고르기로
    const names = genres ? genres.map(function (g) { return g.name; })
      : Array.from(new Set(themes.flatMap(function (t) { return t.genres; })));
    const byGenre = {};
    names.forEach(function (name) {
      byGenre[name] = themes.filter(function (t) { return t.genres.indexOf(name) !== -1; });
    });
    const picked = [];
    (myGenres || []).forEach(function (g) {
      if (picked.length < GENRE_ROWS && byGenre[g.name] && byGenre[g.name].length) picked.push(g.name);
    });
    names.slice().sort(function (a, b) { return byGenre[b].length - byGenre[a].length; })   // 테마 많은 순 (같으면 B-7 순서)
      .forEach(function (name) {
        if (picked.length < GENRE_ROWS && picked.indexOf(name) === -1 && byGenre[name].length) picked.push(name);
      });
    picked.forEach(function (name) {
      rows.push({ title: GENRE_ROW[name] || name + " 테마", list: byGenre[name] });
    });

    rows.push({ title: "방탈출이 처음이라면", note: "난이도 2 이하", list: themes.filter(function (t) { return t.difficulty <= 2; }) });
    rows.push({ title: "고수만 오세요", note: "난이도 5", list: themes.filter(function (t) { return t.difficulty >= 5; }) });

    rows.forEach(function (r) {
      if (!r.list.length) return;
      const sec = r.rank
        ? UI.row(r.title, r.note, r.list, rankCard, "rank-row")
        : UI.row(r.title, r.note, r.list, UI.themeCard);
      if (r.id) sec.id = r.id;
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
    const name = el("b", null, t.title);
    name.title = t.title;
    cap.append(name);
    const r = UI.rating(t.avgRating);
    cap.append(el("span", null, (r ? "★ " + r : "새 테마") + " · " + t.storeName));
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
      picks = themes.slice(0, 5);
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
        personal ? me.nickname + " 님을 위한 추천" : "이번 주 인기 " + (i + 1) + "위"));
      // 장르 태그 (테마 상세와 같은 모양)
      const genres = el("div", "hero-genres");
      (t.genres || []).forEach(function (g) { genres.append(el("span", "tag", UI.genreName(g))); });
      box.append(genres);
      // 제목은 한 줄. 길수록 글자를 줄여서 한 줄에 맞추고(--len), 그래도 넘치면 … (전체 이름은 마우스를 올리면)
      const title = el("h1", "hero-title", t.title);
      title.title = t.title;
      title.style.setProperty("--len", UI.textWidth(t.title));
      box.append(title);

      const meta = el("div", "hero-meta");
      const r = UI.rating(t.avgRating);
      meta.append(el("span", "match", r ? "★ " + r : "새 테마"));
      const lv = el("span", "lv", "난이도 ");
      lv.append(UI.difficultyDots(t.difficulty));
      meta.append(lv);
      meta.append(el("span", null, t.playMinutes + "분"));
      box.append(meta);

      // 매장 (설명·추천 이유는 배너에서 뺌. 자세한 건 상세에서)
      box.append(el("div", "hero-store", t.storeName));

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
      dotsBox.append(dot);
    });

    // 넘기기: 7초마다 다음 추천으로. 지금 점이 7초 동안 차오르는 막대로 남은 시간을 보여 준다
    //   멈추는 경우: ❚❚ 버튼을 눌렀을 때, 키보드(Tab)로 배너 안 버튼에 들어왔을 때
    //   마우스를 올려도 멈추지 않는다 (배너가 화면 대부분이라 멈추면 안 넘어가는 것처럼 보임)
    const SLIDE_MS = 7000;
    const slides = track.children;
    const dots = dotsBox.querySelectorAll("button");
    const pause = UI.$("hero-pause");
    let idx = 0, timer = null, paused = false, keyboardFocus = false;
    heroBox.style.setProperty("--slide-ms", SLIDE_MS + "ms");

    function go_(n) {
      idx = (n + picks.length) % picks.length;
      Array.prototype.forEach.call(slides, function (s, k) {
        const on = k === idx;
        s.classList.toggle("on", on);
        s.setAttribute("aria-hidden", String(!on));
        s.querySelectorAll("a, button").forEach(function (x) { x.tabIndex = on ? 0 : -1; });
      });
      dots.forEach(function (d, k) {
        d.classList.remove("on");
        if (k === idx) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current");
      });
      void dotsBox.offsetWidth;          // 막대 애니메이션을 처음부터 다시
      dots[idx].classList.add("on");
    }
    function running() { return !paused && !keyboardFocus && picks.length > 1; }
    function schedule() {
      clearTimeout(timer);
      heroBox.classList.toggle("autoplay", running());
      if (running()) timer = setTimeout(function () { go_(idx + 1); schedule(); }, SLIDE_MS);
    }
    function jump(n) { go_(n); schedule(); }

    dots.forEach(function (d, k) {
      d.addEventListener("click", function () { jump(k); });
    });
    heroBox.querySelector(".hero-arrow.prev").addEventListener("click", function () { jump(idx - 1); });
    heroBox.querySelector(".hero-arrow.next").addEventListener("click", function () { jump(idx + 1); });
    function paintPause() {
      pause.textContent = paused ? "▶" : "❚❚";
      pause.setAttribute("aria-label", paused ? "자동 넘김 켜기" : "자동 넘김 멈추기");
    }
    pause.addEventListener("click", function () { paused = !paused; paintPause(); jump(idx); });

    // 키보드로 들어왔을 때만 멈춤 (마우스 클릭으로 생긴 포커스는 무시)
    heroBox.addEventListener("focusin", function (e) {
      if (e.target === pause || !e.target.matches(":focus-visible")) return;
      keyboardFocus = true; schedule();
    });
    heroBox.addEventListener("focusout", function (e) {
      if (heroBox.contains(e.relatedTarget)) return;
      if (keyboardFocus) { keyboardFocus = false; schedule(); }
    });

    // 휴대폰: 옆으로 밀어서 넘기기
    let x0 = null;
    heroBox.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    heroBox.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40) jump(idx + (dx < 0 ? 1 : -1));
    });
    if (picks.length < 2) heroBox.classList.add("single");

    paintPause();
    heroBox.classList.remove("loading");
    go_(0);
    schedule();
  }

  // =========================================================
  // 3) 검색 결과 화면 (B-1 조건 검색)
  // =========================================================
  // 조건을 바꾸면 화면을 새로 열지 않고 결과만 다시 그린다 (검색어를 치는 중에도 칸이 그대로 유지되게)
  function renderSearch() {
    searchPage = el("section", "search-page");
    searchPage.append(buildFilterForm(), searchHead, searchTabs, searchOut);
    main.append(searchPage);
    loadResults();
  }

  async function loadResults() {
    const seq = ++searchSeq;
    searchHead.textContent = "";
    searchHead.append(el("div", "sk sk-title"));
    searchOut.setAttribute("aria-busy", "true");
    try {
      // 테마는 모든 조건, 매장은 검색어·지역만 (B-9가 받는 조건)
      const [themes, stores] = await Promise.all([
        api.get("/api/themes", { keyword: F.keyword, area: F.area, region: F.region, date: F.date, people: F.people, genreId: F.genreId, sort: F.sort }),
        api.get("/api/stores", { keyword: F.keyword, area: F.area, region: F.region }),
      ]);
      if (seq !== searchSeq) return;
      found = { themes: themes, stores: stores };
      if (firstLoad && !tabChosen) F.tab = !themes.length && stores.length ? "stores" : "themes";
      firstLoad = false;
      paintResults();
    } catch (e) {
      if (seq !== searchSeq) return;
      found = null;
      searchHead.textContent = "";
      searchTabs.textContent = "";
      searchOut.textContent = "";
      searchOut.append(errorBox(e.message));
    } finally {
      if (seq === searchSeq) searchOut.removeAttribute("aria-busy");
    }
  }

  // 받아 둔 결과로 제목 · 탭 · 목록을 그림
  function paintResults() {
    if (!found) return;
    const stores = F.tab === "stores";
    searchPage.classList.toggle("on-stores", stores);
    searchHead.textContent = "";
    searchHead.append(el("h1", "search-title", "검색 결과"));   // 조건은 위 조건 막대에 보이니 제목은 이것만

    searchTabs.textContent = "";
    [["themes", "테마", found.themes.length], ["stores", "매장", found.stores.length]].forEach(function (x) {
      const b = el("button", "search-tab");
      b.type = "button";
      b.id = "tab-" + x[0];
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "search-out");
      b.setAttribute("aria-selected", String(F.tab === x[0]));
      b.tabIndex = F.tab === x[0] ? 0 : -1;
      b.append(x[1] + " ", el("span", "st-count", String(x[2])));
      b.addEventListener("click", function () { pickTab(x[0]); });
      b.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        pickTab(x[0] === "themes" ? "stores" : "themes");
        UI.$("tab-" + F.tab).focus();
      });
      searchTabs.append(b);
    });
    searchOut.setAttribute("aria-labelledby", "tab-" + F.tab);

    searchOut.textContent = "";
    const list = stores ? found.stores : found.themes;
    if (stores && (F.date || F.people || F.genreId)) {
      searchOut.append(el("p", "search-note muted", "매장은 검색어·지역으로만 골라요. 날짜·인원·장르는 테마 탭에 적용돼요."));
    }
    if (!list.length) {
      searchOut.append(stores
        ? UI.emptyBox("찾는 매장이 없어요. 다른 이름이나 지역으로 검색해 보세요.", "전체 매장 보기", Routes.url("stores"))
        : themeEmptyBox());
      return;
    }
    const grid = el("div", stores ? "store-grid" : "grid");
    list.forEach(function (x) { grid.append(stores ? UI.storeCard(x) : UI.themeCard(x)); });
    searchOut.append(grid);
  }

  // 테마가 0개일 때: 매장은 있으면 "매장 N곳 보기"로 탭을 바꿀 수 있게 (저절로 바꾸지는 않음)
  function themeEmptyBox() {
    if (!found.stores.length) {
      return UI.emptyBox("찾는 테마가 없어요. 다른 이름이나 조건으로 검색해 보세요.", "전체 테마 보기", Routes.url("home"));
    }
    const box = UI.emptyBox("조건에 맞는 테마가 없어요.");
    const go = el("button", "btn btn-light small", "매장 " + found.stores.length + "곳 보기");
    go.type = "button";
    go.addEventListener("click", function () { pickTab("stores"); });
    box.append(el("br"), go);
    return box;
  }

  function pickTab(tab) {
    tabChosen = true;
    if (F.tab === tab) return;
    F.tab = tab;
    saveToUrl();
    paintResults();
  }

  // 지금 조건을 주소에 남긴다 (빈 칸은 빼고 sort 는 남겨서 "검색 화면"이 유지되게). 공유·새로고침용
  function saveToUrl() {
    const q = new URLSearchParams();
    ["keyword", "area", "region", "date", "people", "genreId"].forEach(function (k) { if (F[k]) q.set(k, F[k]); });
    q.set("sort", F.sort || "popular");
    if (tabChosen && F.tab === "stores") q.set("tab", "stores");
    history.replaceState(null, "", location.pathname + "?" + q);
  }




  // 검색 조건 막대: 바꾸면 바로 다시 검색 (주소가 바뀌어서 공유·뒤로가기 가능)
  function buildFilterForm() {
    const form = el("form", "filter-bar");
    form.action = Routes.url("home");
    form.setAttribute("role", "search");

    const kw = el("input", "fb-keyword");
    kw.type = "search";
    kw.name = "keyword";
    kw.placeholder = "테마나 매장 이름을 입력해 보세요";
    kw.maxLength = 50;
    kw.value = F.keyword;
    kw.setAttribute("aria-label", "테마·매장 이름 검색");
    form.append(field("검색어", kw));

    const area = UI.areaPicker({ area: F.area, region: F.region });   // 큰 지역 → 세부 지역
    form.append(field("지역", area.el));

    const date = UI.datePicker("date", F.date);   // 사이트 색 달력 (오늘 이전은 못 고름)
    form.append(field("날짜", date.el, true));

    // 인원·장르·정렬: 사이트 모양 선택 칸 (UI.selectPicker)
    const ppl = UI.selectPicker("people", [["", "인원 무관"]].concat([2, 3, 4, 5, 6, 7, 8].map(function (n) { return [String(n), n + "명"]; })), F.people, { label: "인원" });
    form.append(field("인원", ppl.el, true));

    const genre = UI.selectPicker("genreId", [["", "모든 장르"]], F.genreId, { label: "장르" });
    form.append(field("장르", genre.el, true));
    api.get("/api/genres").then(function (list) {
      genre.setOptions([["", "모든 장르"]].concat(list.map(function (g) { return [String(g.genreId), g.name]; })), F.genreId);
    }).catch(function () { /* 장르 없이 */ });

    const sort = UI.selectPicker("sort", [["popular", "이번 주 인기순"], ["rate", "평점순"], ["new", "최신순"]], F.sort, { label: "정렬" });   // 이번 주 인기순이 맨 위·기본
    form.append(field("정렬", sort.el, true));

    const reset = el("a", "btn btn-line small fb-reset", "조건 지우기");
    reset.href = Routes.url("home", { sort: "popular" });
    reset.addEventListener("click", function () {   // 지금 탭은 남김
      if (F.tab === "stores") reset.href = Routes.url("home", { sort: "popular", tab: "stores" });
    });
    form.append(reset);

    // 고르는 칸은 바꾸는 즉시, 검색어는 치다가 잠깐(0.4초) 멈추면 검색. 엔터는 바로
    let timer = null;
    function apply() {
      clearTimeout(timer);
      if (!form.checkValidity()) { form.reportValidity(); return; }   // 지난 날짜를 직접 친 경우 등
      const next = {
        keyword: kw.value.trim(), area: area.value().area, region: area.value().region, date: date.input.value,
        people: ppl.value(), genreId: genre.value(), sort: sort.value(), tab: F.tab,
      };
      if (Object.keys(next).every(function (k) { return next[k] === F[k]; })) return;   // 바뀐 게 없으면 그대로
      Object.assign(F, next);
      saveToUrl();
      loadResults();
    }
    kw.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(apply, 400);
    });
    form.addEventListener("change", function (e) { if (e.target !== kw) apply(); });
    form.addEventListener("submit", function (e) { e.preventDefault(); apply(); });
    return form;

    // themeOnly: 테마에만 걸리는 칸 (매장 탭에서는 숨김)
    function field(label, control, themeOnly) {
      const l = el("label", "fb-field" + (themeOnly ? " fb-theme-only" : ""));
      l.append(el("span", null, label), control);
      return l;
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
