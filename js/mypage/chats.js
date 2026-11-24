// S20 내 파티 (pages/mypage/chats.html) · A 담당 · A-22
//   내가 참여 중인 파티 (모집 중 · 모집 완료 · 모집 마감 포함, 강퇴·삭제는 빠짐), 다가오는 파티(플레이 날짜 가까운 순) → 끝난 파티(최근에 끝난 순) → 누르면 파티 방
//   끝난 파티는 "파티 종료" 배지만. 후기 쓰기는 파티 방 · 내 기록 · 테마 상세에서
(function () {
  const $ = UI.$;
  const el = UI.el;

  const me = Auth.me();
  if (!me) { Auth.goLogin(); return; }
  if (me.role !== "USER") { location.replace(Routes.url("home")); return; }

  $("c-title").textContent = me.nickname + " 님의 마이페이지";
  $("tab-mypage").href = Routes.url("mypage");
  $("tab-wishes").href = Routes.url("wishes");
  $("tab-chats").href = Routes.url("chats");
  $("tab-profile").href = Routes.url("profile");

  const list = $("chat-list");
  load().finally(function () { document.body.classList.add("my-ready"); });   // 다 불러오면 탭 아래 내용을 한 번에 보여 줌 (깜빡임 방지, common.css)
  // 파티 방에서 나가기·삭제 뒤 뒤로가기로 돌아오면 브라우저가 예전 화면을 그대로 보여 줄 수 있다 → 다시 불러오기
  window.addEventListener("pageshow", function (e) { if (e.persisted) load(); });

  async function load() {
    list.textContent = "";
    for (let i = 0; i < 3; i++) list.append(el("div", "sk chat-sk"));
    try {
      const parties = await api.get("/api/my/parties");
      list.textContent = "";
      if (!parties.length) {
        list.append(UI.emptyBox("아직 참여한 파티가 없어요. 같이 갈 사람을 찾아보세요.", "파티 둘러보기", Routes.url("partyList")));
        return;
      }
      // 다가오는 파티는 날짜 빠른 순, 끝난 파티는 맨 아래에 최근 것부터
      const t = function (p) { return new Date(p.playAt).getTime(); };
      const upcoming = parties.filter(function (p) { return !p.ended; }).sort(function (a, b) { return t(a) - t(b); });
      const ended = parties.filter(function (p) { return p.ended; }).sort(function (a, b) { return t(b) - t(a); });
      upcoming.concat(ended).forEach(function (p) { list.append(row(p)); });
    } catch (e) {
      list.textContent = "";
      list.append(UI.emptyBox(e.message));
    }
  }

  function row(p) {
    const play = new Date(p.playAt);
    const item = el("article", "chat-row" + (p.ended ? " ended" : ""));

    // 카드 전체가 파티 방 링크: [왼쪽 날짜 칸] [배지 / 제목 / 테마 · 인원]
    const link = el("a", "cr-link");
    link.href = Routes.url("partyRoom", { id: p.partyId });

    const date = el("div", "cr-date");
    date.append(el("span", "cr-m", (play.getMonth() + 1) + "월"), el("span", "cr-d", String(play.getDate())),
      el("span", "cr-m", UI.DAYS[play.getDay()] + " " + hm(play)));

    const tags = el("span", "cr-tags");
    if (p.myRole === "LEADER") tags.append(el("span", "lead-tag", "방장"));
    const st = UI.partyStatus(p.status, p.ended);
    tags.append(el("span", st.cls, st.label));

    const main = el("div", "cr-main");
    const title = el("strong", "cr-title", p.title);
    title.title = p.title;
    main.append(tags, title, el("div", "cr-meta", p.themeTitle + " · " + p.currentPeople + "/" + p.maxPeople + "명"));

    link.append(date, main);
    link.setAttribute("aria-label", md(play) + " " + hm(play) + ", " + p.title + " 파티 방 열기" + (p.ended ? " (파티 종료)" : ""));
    item.append(link);
    return item;
  }

  // ---------- 날짜 ----------
  function md(d) { return (d.getMonth() + 1) + "/" + d.getDate() + " (" + UI.DAYS[d.getDay()] + ")"; }
  function hm(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
})();
