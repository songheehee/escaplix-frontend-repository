// S20 내 채팅 (pages/mypage/chats.html) · A 담당 · A-22
//   내가 참여 중인 파티 (모집 중 · 정원 참 · 마감 포함, 강퇴·삭제는 빠짐), 마지막 메시지 최신순 → 누르면 파티 방
//   끝난 파티(ended)는 "후기 쓰기": D 담당 후기 팝업(window.openReviewModal)이 있으면 열고, 아직 없으면 테마 상세로
(function () {
  const $ = UI.$;
  const el = UI.el;
  const NOTICE = { JOIN: "님이 들어왔어요", LEAVE: "님이 나갔어요", KICK: "님이 강퇴됐어요" };
  const STATUS = { RECRUITING: "모집 중", FULL: "정원 참", CLOSED: "모집 마감" };

  const me = Auth.me();
  if (!me) { Auth.goLogin(); return; }
  if (me.role !== "USER") { location.replace(Routes.url("home")); return; }

  $("c-title").textContent = me.nickname + " 님의 마이페이지";
  $("tab-mypage").href = Routes.url("mypage");
  $("tab-wishes").href = Routes.url("wishes");
  $("tab-chats").href = Routes.url("chats");
  $("tab-profile").href = Routes.url("profile");

  const list = $("chat-list");
  load();

  async function load() {
    for (let i = 0; i < 3; i++) list.append(el("div", "sk chat-sk"));
    try {
      const parties = await api.get("/api/my/parties");
      list.textContent = "";
      $("tab-chats").textContent = "내 채팅 (" + parties.length + ")";
      if (!parties.length) {
        list.append(UI.emptyBox("아직 참여한 파티가 없어요. 같이 갈 사람을 찾아보세요.", "파티 둘러보기", Routes.url("partyList")));
        return;
      }
      parties.forEach(function (p) { list.append(row(p)); });
    } catch (e) {
      list.textContent = "";
      list.append(UI.emptyBox(e.message));
    }
  }

  function row(p) {
    const play = new Date(p.playAt);
    const item = el("article", "chat-row" + (p.ended ? " ended" : ""));

    // 줄 전체가 파티 방 링크 (후기 버튼은 링크 밖에 따로)
    const link = el("a", "cr-link");
    link.href = Routes.url("partyRoom", { id: p.partyId });

    const top = el("div", "cr-top");
    top.append(el("strong", "cr-title", p.title));
    const tags = el("span", "cr-tags");
    if (p.myRole === "LEADER") tags.append(el("span", "tag", "👑 방장"));
    tags.append(el("span", "badge st-" + p.status.toLowerCase(), p.ended ? "끝난 파티" : (STATUS[p.status] || p.status)));
    top.append(tags);
    link.append(top);

    link.append(el("div", "cr-meta", p.themeTitle + " · 📅 " + md(play) + " " + hm(play) + " · " + p.currentPeople + "/" + p.maxPeople + "명"));

    const last = el("div", "cr-last");
    const lm = p.lastMessage;
    if (!lm) {
      last.append(el("span", "muted", "아직 메시지가 없어요"));
    } else {
      const text = lm.msgType === "CHAT" ? lm.nickname + ": " + lm.content : lm.nickname + (NOTICE[lm.msgType] || "");
      last.append(el("span", "cr-text", text), el("span", "cr-when", when(new Date(lm.createdAt))));
    }
    link.append(last);
    link.setAttribute("aria-label", p.title + " 파티 방 열기" + (p.ended ? " (끝난 파티)" : ""));
    item.append(link);

    if (p.ended) {
      const btn = el("button", "btn btn-line small cr-review", "끝난 파티 · 후기 쓰기");
      btn.type = "button";
      btn.addEventListener("click", function () { writeReview(p, btn); });
      item.append(btn);
    }
    return item;
  }

  // D 담당 후기 팝업과의 약속: window.openReviewModal({ themeId, title, storeName, playMinutes }) (theme.js 와 같음)
  async function writeReview(p, btn) {
    if (typeof window.openReviewModal !== "function") {
      location.href = Routes.url("theme", { id: p.themeId });   // 팝업이 아직 없으면 후기 쓰기 버튼이 있는 테마 상세로
      return;
    }
    btn.disabled = true;
    try {
      const t = await api.get("/api/themes/" + p.themeId);
      window.openReviewModal({ themeId: t.themeId, title: t.title, storeName: t.store.name, playMinutes: t.playMinutes });
    } catch (e) {
      UI.toast(e.message, "err");   // 운영 종료된 테마 등
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- 날짜 ----------
  function md(d) { return (d.getMonth() + 1) + "/" + d.getDate() + " (" + UI.DAYS[d.getDay()] + ")"; }
  function hm(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  // 마지막 메시지 시각: 오늘이면 시:분, 어제면 "어제", 그 전은 월/일
  function when(d) {
    const today = UI.today();
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (UI.ymd(d) === today) return hm(d);
    if (UI.ymd(d) === UI.ymd(y)) return "어제";
    return (d.getMonth() + 1) + "/" + d.getDate();
  }
})();
