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
      links: [["home", "홈"], ["stores", "매장"], ["partyList", "파티"], ["wishes", "내가 찜한 테마"]],
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
  logo.append("ESCAP", el("span", null, "LIX"));
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
  function onScroll() { header.classList.toggle("solid", window.scrollY > 10); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---------- 검색 (손님·비회원) ----------
  // 돋보기를 누르면 칸이 펼쳐짐 → 엔터 → 메인 결과 화면 (B-1 keyword)
  function searchBox() {
    const form = el("form", "top-search");
    form.action = Routes.url("home");
    form.setAttribute("role", "search");
    const btn = el("button", "top-search-btn", "⌕");
    btn.type = "button";
    btn.setAttribute("aria-label", "검색 열기");
    const input = el("input");
    input.type = "search";
    input.name = "keyword";
    input.placeholder = "테마·매장 이름";
    input.setAttribute("aria-label", "테마·매장 검색");
    input.value = (Routes.isHere("home") && new URLSearchParams(location.search).get("keyword")) || "";
    if (input.value) form.classList.add("open");
    btn.addEventListener("click", function () {
      if (form.classList.contains("open") && input.value.trim()) { form.requestSubmit(); return; }
      form.classList.add("open");
      input.focus();
    });
    input.addEventListener("blur", function () { if (!input.value.trim()) form.classList.remove("open"); });
    form.addEventListener("submit", function (e) {
      if (!input.value.trim()) { e.preventDefault(); input.focus(); }
    });
    form.append(btn, input);
    return form;
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
