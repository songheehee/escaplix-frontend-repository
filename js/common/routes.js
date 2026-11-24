// 화면 주소는 모두 여기 한 곳에 적는다
//   - 화면 파일을 옮기거나 이름을 바꾸면 이 표만 고치면 된다
//   - 다른 화면으로 갈 때는 "theme.html" 처럼 직접 쓰지 말고 Routes.url("theme", { id: 1 }) 을 쓴다
//   - 주소는 이 파일 위치(js/common/)를 기준으로 프로젝트 맨 위 폴더를 찾아서 만든다.
//     그래서 index.html 에서 부르든 pages/theme/theme.html 에서 부르든 같은 주소가 나온다
//
// 폴더 규칙: pages/{영역}/{화면}.html  ↔  js/{영역}/{화면}.js
//   member (가입·로그인) · party · theme · store · mypage (마이페이지 탭) · owner · admin
//   아직 없는 화면(다른 담당)도 들어갈 자리를 미리 적어 둔다.

const Routes = (function () {
  const ROOT = new URL("../../", document.currentScript.src).href;

  const PAGES = {
    home: "index.html",

    // A · 회원
    login: "pages/member/login.html",
    signup: "pages/member/signup.html",
    signupUser: "pages/member/signup-user.html",
    signupOwner: "pages/member/signup-owner.html",
    findId: "pages/member/find-id.html",
    findPassword: "pages/member/find-password.html",

    // A · 파티
    partyList: "pages/party/party-list.html",
    partyForm: "pages/party/party-form.html",
    partyRoom: "pages/party/party-room.html",

    // B · 테마 · 매장
    theme: "pages/theme/theme.html",
    stores: "pages/store/stores.html",
    store: "pages/store/store.html",   // 지도는 매장 상세 안에만 (전체 지도 화면 없음)

    // 마이페이지 탭 (A · B · D)
    mypage: "pages/mypage/mypage.html",
    wishes: "pages/mypage/wishes.html",
    chats: "pages/mypage/chats.html",
    profile: "pages/mypage/profile.html",

    // C · 사장
    //   내 매장(owner) → 매장(ownerStore) → 테마(ownerTheme, [기본 정보]·[시간표] 탭)
    owner: "pages/owner/owner.html",
    ownerStore: "pages/owner/owner-store.html",
    storeForm: "pages/owner/store-form.html",
    ownerTheme: "pages/owner/owner-theme.html",

    // C · 관리자
    admin: "pages/admin/admin.html",
    adminStores: "pages/admin/admin-stores.html",
    adminStoreDetail: "pages/admin/admin-store-detail.html",
    adminThemes: "pages/admin/admin-themes.html",
    adminThemeDetail: "pages/admin/admin-theme-detail.html",
    adminMembers: "pages/admin/admin-members.html",
  };

  // Routes.url("theme", { id: 3 }) → ".../pages/theme/theme.html?id=3" (빈 값은 안 붙임)
  function url(name, params) {
    const path = PAGES[name];
    if (!path) throw new Error("routes.js 에 없는 화면 이름: " + name);
    const u = new URL(path, ROOT);
    Object.keys(params || {}).forEach(function (k) {
      const v = params[k];
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
    });
    return u.href;
  }

  // 이미지 같은 파일: Routes.asset("img/logo.png")
  function asset(path) { return new URL(path, ROOT).href; }

  // 지금 보고 있는 화면이 name 인지 (헤더 메뉴 강조용)
  function isHere(name) {
    const target = new URL(PAGES[name], ROOT).pathname;
    const now = location.pathname.endsWith("/") ? location.pathname + "index.html" : location.pathname;
    return now === target;
  }

  // 프로젝트 맨 위 기준 지금 주소 (로그인 뒤 돌아올 곳: ?next=)
  function current() {
    return location.href.indexOf(ROOT) === 0 ? location.href.slice(ROOT.length) : location.href;
  }

  return { url: url, asset: asset, isHere: isHere, current: current, ROOT: ROOT };
})();
