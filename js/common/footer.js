// 아래쪽 footer (모든 화면 공용)
//   HTML 에는 <footer> 를 쓰지 않는다. 이 파일이 <body> 맨 끝에 넣는다
//   불러오는 순서: routes.js → api.js → ui.js → header.js → footer.js
(function () {
  const el = UI.el;

  const footer = el("footer", "footer");
  const inner = el("div", "footer-inner");

  const brand = el("div", "footer-brand");
  const logo = el("a", "logo small");
  logo.href = Routes.url("home");
  logo.append("Escap", el("span", null, "lix"));
  brand.append(logo, el("p", null, "방탈출 테마와 매장을 한곳에서. 같이 갈 사람도 찾아요."));
  inner.append(brand);
  inner.append(el("p", "footer-copy", "© " + new Date().getFullYear() + " Escaplix"));

  footer.append(inner);
  document.body.append(footer);
})();
