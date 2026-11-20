// 위쪽 헤더 (모든 화면 공용)
//   HTML 에는 헤더 태그가 없다. 이 파일이 로그인한 사람의 역할(role)을 보고 메뉴를 골라 <body> 맨 위에 넣는다
//   역할은 토큰에서 읽는다 (Auth.me().role). 비회원은 GUEST
//   메뉴를 바꾸려면 아래 MENU 표만 고치면 된다. 화면 이름은 routes.js 의 이름을 쓴다
//   불러오는 순서: routes.js → api.js → ui.js → header.js
(function () {
  const el = UI.el;
  const me = Auth.me();
  const role = me ? me.role : "GUEST";

  // 역할별 메뉴 (API 명세 3. 역할군별 보기)
  //   home  : 로고를 누르면 갈 곳
  //   links : 위쪽 바 메뉴
  //   my    : 오른쪽 프로필 ▾ 안의 메뉴
  //   search: 테마·매장 검색칸을 보여 줄지
  const MENU = {
    GUEST: {
      home: "home",
      links: [["home", "홈"], ["stores", "매장"]],
      my: [],
      search: true,
    },
    USER: {
      home: "home",
      links: [["home", "홈"], ["stores", "매장"], ["partyList", "파티"]],   // 찜 목록은 프로필 ▾ 안에
      my: [["mypage", "내 기록"], ["wishes", "찜 목록"], ["chats", "내 채팅"], ["profile", "내 정보"]],
      search: true,
    },
    OWNER: {
      home: "owner",
      links: [["owner", "사장 홈"], ["storeForm", "매장 등록"], ["ownerTheme", "테마 등록"], ["ownerSlots", "시간표 관리"]],
      my: [["profile", "내 정보"]],
      search: false,
    },
    ADMIN: {
      home: "admin",
      links: [["admin", "관리자 홈"], ["adminStores", "매장 승인"], ["adminThemes", "테마 승인"], ["adminMembers", "회원 관리"]],
      my: [["profile", "내 정보"]],
      search: false,
    },
  };
  const ROLE_NAME = { USER: "손님", OWNER: "사장", ADMIN: "관리자" };
  const menu = MENU[role] || MENU.GUEST;

  const header = el("header", "topbar topbar-" + role.toLowerCase());
  const inner = el("div", "topbar-inner");

  // 로고
  const logo = el("a", "logo");
  logo.href = Routes.url(menu.home);
  logo.append("Escap", el("span", null, "lix"));
  if (role === "OWNER" || role === "ADMIN") logo.append(el("small", "logo-role", ROLE_NAME[role]));
  inner.append(logo);

  // 메뉴 (넓은 화면: 한 줄 / 좁은 화면: "메뉴 ▾" 펼치기)
  const nav = el("nav", "topnav");
  nav.setAttribute("aria-label", "주 메뉴");
  const navToggle = el("button", "topnav-toggle", "메뉴 ▾");
  navToggle.type = "button";
  navToggle.setAttribute("aria-expanded", "false");
  const list = el("ul");
  menu.links.forEach(function (l) {
    const li = el("li");
    const a = el("a", null, l[1]);
    a.href = Routes.url(l[0]);
    if (Routes.isHere(l[0]) && !location.search) a.setAttribute("aria-current", "page");
    li.append(a);
    list.append(li);
  });
  navToggle.addEventListener("click", function () {
    const open = !nav.classList.contains("open");
    nav.classList.toggle("open", open);
    navToggle.setAttribute("aria-expanded", String(open));
  });
  nav.append(navToggle, list);
  inner.append(nav);

  const right = el("div", "topbar-right");
  if (menu.search) right.append(searchBox());
  right.append(me ? profileMenu() : loginButtons());
  inner.append(right);

  header.append(inner);
  document.body.prepend(header);

  // 좁은 화면 메뉴: 바깥을 누르거나 Esc 면 닫기
  document.addEventListener("click", function (e) {
    if (!nav.contains(e.target)) { nav.classList.remove("open"); navToggle.setAttribute("aria-expanded", "false"); }
  });

  // 스크롤하면 바 배경이 진해짐
  function onScroll() { header.classList.toggle("solid", window.scrollY > 10 || document.body.classList.contains("sp-open")); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---------- 검색 (손님·비회원) ----------
  // 처음엔 돋보기만. 누르면 헤더 바로 아래(메인이면 헤더와 추천 배너 사이)가 열리면서 상세 검색 칸이 나온다
  //   검색 → 메인 결과 화면 (B-1: keyword·area·date·people·genreId·sort)
  //   메인 검색 결과 화면은 조건 막대가 이미 있으니 패널 대신 그 막대의 검색어 칸으로 보낸다
  function searchBox() {
    const btn = el("button", "top-search-btn", "⌕");
    btn.type = "button";
    btn.setAttribute("aria-label", "상세 검색 열기");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "search-panel");
    let panel = null;

    btn.addEventListener("click", function () {
      const bar = document.querySelector(".filter-bar .fb-keyword");
      if (bar) { window.scrollTo({ top: 0, behavior: "smooth" }); bar.focus({ preventScroll: true }); return; }
      if (!panel) {
        panel = searchPanel(btn);
        // 방금 만든 패널은 "닫힌 모습"을 한 번 계산시켜야 처음 열 때도 펼쳐지는 움직임이 나온다
        //   (안 하면 만들자마자 열린 상태로 그려져서 툭 튀어나옴)
        void document.getElementById("search-panel").offsetHeight;
      }
      panel.toggle();
    });
    return btn;
  }

  function searchPanel(btn) {
    const box = el("section", "sp");
    box.id = "search-panel";
    box.setAttribute("aria-label", "상세 검색");
    box.inert = true;
    const clip = el("div", "sp-clip");
    const form = el("form", "sp-form");
    form.action = Routes.url("home");
    form.setAttribute("role", "search");

    const head = el("div", "sp-head");
    head.append(el("h2", "sp-title", "어떤 방탈출을 찾고 있나요?"));
    const close = el("button", "sp-close", "✕");
    close.type = "button";
    close.setAttribute("aria-label", "상세 검색 닫기");
    head.append(close);
    form.append(head);

    const fields = el("div", "sp-fields");
    const kw = el("input");
    kw.type = "search";
    kw.name = "keyword";
    kw.maxLength = 50;
    kw.placeholder = "테마·매장 이름 (비워 두면 전체)";
    fields.append(field("검색어", kw, "sp-kw"));

    const area = select("area", [["", "모든 지역"]]);
    fields.append(field("지역", area));
    const date = UI.datePicker("date", "");   // 사이트 색 달력 (오늘 이전은 못 고름)
    fields.append(field("날짜", date.el));
    const ppl = select("people", [["", "인원 무관"]].concat([2, 3, 4, 5, 6, 7, 8].map(function (n) { return [String(n), n + "명"]; })));
    fields.append(field("인원", ppl));
    const genre = select("genreId", [["", "모든 장르"]]);
    fields.append(field("장르", genre));
    const sort = select("sort", [["rate", "평점순"], ["popular", "이번 주 인기순"], ["new", "최신순"]]);
    fields.append(field("정렬", sort));

    const go = el("button", "btn btn-accent sp-go", "검색");
    go.type = "submit";
    fields.append(go);
    form.append(fields);
    clip.append(form);
    box.append(clip);
    header.after(box);

    // 지역·장르 목록은 처음 열 때 한 번만 (실패하면 "모든 ○○"만 남음)
    api.get("/api/areas").then(function (list) {
      list.forEach(function (a) { area.append(option(a, a)); });
    }).catch(function () { /* 지역 없이 */ });
    api.get("/api/genres").then(function (list) {
      list.forEach(function (g) { genre.append(option(String(g.genreId), g.name)); });
    }).catch(function () { /* 장르 없이 */ });

    form.addEventListener("submit", function () {
      // 빈 칸은 주소에 안 붙임. sort 는 남겨서 조건이 하나도 없어도 메인이 "검색 결과 화면"이 되게
      kw.value = kw.value.trim();
      Array.from(form.elements).forEach(function (x) { if (x.name && x.name !== "sort" && !x.value) x.disabled = true; });
    });
    // 뒤로가기로 돌아왔을 때: 끈 칸을 다시 켜고, 패널은 닫힌 상태로
    window.addEventListener("pageshow", function (e) {
      Array.from(form.elements).forEach(function (x) { x.disabled = false; });
      if (e.persisted && opened) set(false);
    });

    close.addEventListener("click", function () { set(false); btn.focus(); });
    box.addEventListener("keydown", function (e) { if (e.key === "Escape") { set(false); btn.focus(); } });

    let opened = false;
    function set(v) {
      if (!v) date.close();   // 열려 있던 달력도 같이 닫기
      opened = v;
      box.classList.toggle("open", v);
      box.inert = !v;
      document.body.classList.toggle("sp-open", v);
      btn.setAttribute("aria-expanded", String(v));
      btn.setAttribute("aria-label", v ? "상세 검색 닫기" : "상세 검색 열기");
      onScroll();
      if (v) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        kw.focus({ preventScroll: true });
      }
    }
    return { toggle: function () { set(!opened); } };

    function field(label, control, cls) {
      const l = el("label", "sp-field" + (cls ? " " + cls : ""));
      l.append(el("span", null, label), control);
      return l;
    }
    function option(v, t) { const o = el("option", null, t); o.value = v; return o; }
    function select(name, opts) {
      const s = el("select");
      s.name = name;
      opts.forEach(function (o) { s.append(option(o[0], o[1])); });
      return s;
    }
  }

  // ---------- 비회원: 로그인 · 회원가입 ----------
  function loginButtons() {
    const box = el("div", "auth-btns");
    const login = el("a", "btn btn-accent small", "로그인");
    login.href = Routes.url("login", { next: Routes.current() });
    const signup = el("a", "btn btn-line small", "회원가입");
    signup.href = Routes.url("signup");
    box.append(login, signup);
    return box;
  }

  // ---------- 로그인한 사람: 프로필 ▾ ----------
  function profileMenu() {
    const prof = el("div", "profile");
    const btn = el("button", "profile-btn");
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", me.nickname + " 님 메뉴");
    btn.append(el("span", "avatar", (me.nickname || "?").slice(0, 1)), el("span", "caret", "▾"));

    const box = el("div", "profile-menu");
    box.hidden = true;
    box.append(el("div", "pm-name", me.nickname + " 님"));
    box.append(el("div", "pm-role", ROLE_NAME[role] || role));
    menu.my.forEach(function (l) {
      const a = el("a", null, l[1]);
      a.href = Routes.url(l[0]);
      box.append(a);
    });
    // 로그아웃: API 없음. 토큰만 지우고 메인으로 (명세 1-3)
    const out = el("button", "pm-logout", "로그아웃");
    out.type = "button";
    out.addEventListener("click", function () { Auth.clear(); location.href = Routes.url("home"); });
    box.append(out);

    function close() { box.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      box.hidden = !box.hidden;
      btn.setAttribute("aria-expanded", String(!box.hidden));
    });
    document.addEventListener("click", function (e) { if (!prof.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    prof.append(btn, box);
    return prof;
  }
})();
