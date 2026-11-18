// 아래쪽 footer (모든 화면 공용)
//   HTML 에는 <footer> 를 쓰지 않는다. 이 파일이 <body> 맨 끝에 넣는다
//   불러오는 순서: routes.js → api.js → ui.js → header.js → footer.js
(function () {
  const el = UI.el;
  const me = Auth.me();
  const role = me ? me.role : "GUEST";

  const footer = el("footer", "footer");
  const inner = el("div", "footer-inner");

  const brand = el("div", "footer-brand");
  const logo = el("a", "logo small");
  logo.href = Routes.url("home");
  logo.append("ESCAP", el("span", null, "LIX"));
  brand.append(logo, el("p", null, "방탈출 테마와 매장을 한곳에서. 같이 갈 사람도 여기서 찾아요."));
  inner.append(brand);

  // 손님·비회원은 둘러보기 링크, 사장·관리자는 업무 화면이 헤더에 있으니 생략
  if (role === "GUEST" || role === "USER") {
    const links = el("nav", "footer-links");
    links.setAttribute("aria-label", "바로 가기");
    [["home", "테마"], ["stores", "매장"], ["partyList", "파티"]].forEach(function (l) {
      const a = el("a", null, l[1]);
      a.href = Routes.url(l[0]);
      links.append(a);
    });
    inner.append(links);
  }

  const notes = el("div", "footer-notes");
  notes.append(el("p", null, "Escaplix는 예약을 대신하지 않아요. 실제 예약은 각 매장의 예약 링크에서 해요."));
  const credit = el("p", null, "기본 포스터 사진: ");
  const pexels = el("a", null, "Pexels");
  pexels.href = "https://www.pexels.com";
  pexels.target = "_blank";
  pexels.rel = "noopener noreferrer";
  credit.append(pexels, " (작가 목록은 백엔드 uploads/posters/credits.csv)");
  notes.append(credit);
  notes.append(el("p", "footer-copy", "© " + new Date().getFullYear() + " Escaplix"));
  inner.append(notes);

  footer.append(inner);
  document.body.append(footer);
})();
