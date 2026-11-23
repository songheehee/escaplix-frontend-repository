// S10 찜 목록 (pages/mypage/wishes.html) · B 담당 · B-6, B-5
//   손님 전용. 운영 종료(CLOSED) 테마도 남아 있고 흐리게 보여 줌
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Auth.me();

  if (!me) { Auth.goLogin(); return; }
  if (me.role !== "USER") { location.replace(Routes.url("home")); return; }

  $("w-title").textContent = me.nickname + " 님의 마이페이지";
  const grid = $("wish-grid");
  let count = 0;

  load().finally(function () { document.body.classList.add("my-ready"); });   // 다 불러오면 탭 아래 내용을 한 번에 보여 줌 (깜빡임 방지, common.css)

  async function load() {
    for (let i = 0; i < 6; i++) {
      const sk = el("div", "sk");
      sk.style.aspectRatio = "2 / 3";
      grid.append(sk);
    }
    try {
      const list = await api.get("/api/my/wishes");
      grid.textContent = "";
      count = list.length;
      if (!list.length) { showEmpty(); return; }
      list.forEach(function (w) { grid.append(wishCard(w)); });
    } catch (e) {
      grid.textContent = "";
      grid.append(UI.emptyBox(e.message));
    }
  }

  function showEmpty() { grid.append(UI.emptyBox("아직 찜한 테마가 없어요. 마음에 드는 테마에 ♡를 눌러 보세요.", "테마 둘러보기", Routes.url("home"))); }

  function wishCard(w) {
    const closed = w.status !== "OPEN";
    const c = el("article", "wcard" + (closed ? " closed" : ""));
    const link = el("a", "wcard-link");
    link.href = Routes.url("theme", { id: w.themeId });
    const art = el("div", "wcard-art");
    art.append(UI.poster({ themeId: w.themeId, title: w.title, posterUrl: w.posterUrl, genres: [] }));
    if (closed) art.append(el("div", "wcard-closed", "운영 종료"));
    link.append(art);
    const name = el("div", "wcard-title", w.title);
    name.title = w.title;
    link.append(name);
    link.append(el("div", "wcard-sub", w.storeName));   // 찜한 날짜는 안 보여 줌
    // 운영 종료 테마는 상세가 404라서 링크를 끔
    if (closed) { link.removeAttribute("href"); link.setAttribute("aria-disabled", "true"); }
    c.append(link);

    const rm = el("button", "icon-btn wish on", "♥");
    rm.type = "button";
    rm.title = "찜 취소";
    rm.setAttribute("aria-label", w.title + " 찜 취소");
    rm.addEventListener("click", async function () {
      rm.disabled = true;
      try {
        await api.del("/api/themes/" + w.themeId + "/wish");
      } catch (e) {
        if (e.status !== 404) { UI.toast(e.message, "err"); rm.disabled = false; return; }
      }
      c.classList.add("removing");
      setTimeout(function () {
        c.remove();
        count--;
        if (!count) showEmpty();
      }, 300);
      UI.toast("찜 목록에서 뺐어요");
    });
    c.append(rm);
    return c;
  }
})();
