// S06 파티 방 (pages/party/party-room.html?id=) · A 담당
//   A-13 방 정보 · A-20 새 채팅 (3초마다) · A-21 보내기
//   방장: A-18 강퇴 · A-19 모집 마감 · A-15 삭제 / 참여자: A-17 나가기
//   403(참여 안 함·강퇴됨) · 404(없음·삭제됨)를 받으면 3초 반복을 멈추고 파티 목록으로 (명세 A-13, A-20)
(function () {
  const $ = UI.$;
  const el = UI.el;
  const POLL_MS = 3000;
  const NOTICE = { JOIN: "님이 들어왔어요", LEAVE: "님이 나갔어요", KICK: "님이 강퇴됐어요" };

  // ---------- 상태 (아래 함수들이 쓰므로 맨 위에 선언) ----------
  let room = null;          // A-13 응답
  let lastId = null;        // 마지막으로 받은 messageId
  const shown = new Set();  // 이미 그린 messageId (보내기 응답과 3초 응답이 겹쳐도 한 번만)
  let lastDay = null;       // 날짜 구분 줄
  let timer = null;
  let polling = false;
  let gone = false;         // 방에서 나가게 됨 → 더는 요청하지 않음
  let offlineShown = false; // 서버 연결 실패 알림을 이미 띄움

  const me = Auth.me();
  if (!me) { Auth.goLogin(); return; }
  if (me.role !== "USER") { location.replace(Routes.url("partyList")); return; }

  const partyId = new URLSearchParams(location.search).get("id");
  // 왔던 화면(파티 목록 · 내 채팅 …). 돌아가기 링크 · 나가기 · 삭제 · 강퇴됐을 때 모두 여기로, 모르면 파티 목록
  const back = PartyNav.setup($("back-link"));
  if (!partyId || !/^\d+$/.test(partyId)) { leaveRoom("없는 파티입니다."); return; }

  start();

  async function start() {
    try {
      room = await api.get("/api/parties/" + partyId);
    } catch (e) { return handleGone(e); }
    const box = $("room");
    box.textContent = "";
    box.append($("room-tpl").content.cloneNode(true));
    box.removeAttribute("aria-busy");
    paintRoom();
    setupChat();
    await poll();          // 처음: 최근 50개
    scrollToBottom();
    schedule();
  }

  // ---------- 403 / 404: 방에 있을 수 없음 ----------
  function handleGone(e) {
    if (e.status === 403 || e.status === 404) { leaveRoom(e.message); return; }
    UI.toast(e.message, "err");
  }
  function leaveRoom(msg) {
    gone = true;
    clearTimeout(timer);
    const box = $("room");
    box.textContent = "";
    box.removeAttribute("aria-busy");
    const g = el("div", "room-gone");
    const box2 = UI.emptyBox(msg + " 잠시 뒤 " + back.label + " 화면으로 돌아가요.", "지금 이동", $("back-link").href);
    box2.querySelector("a").addEventListener("click", function (e) { e.preventDefault(); back.go(); });
    g.append(box2);
    box.append(g);
    setTimeout(function () { back.go(); }, 2500);
  }

  // ---------- 파티 정보 · 참여자 ----------
  function isLeader() { return room.myRole === "LEADER"; }
  // 끝난 파티: 플레이 시간이 지남 (내 채팅의 "끝난 파티"와 같은 기준). 지난 대화만 보고 새 메시지는 못 보냄
  function isEnded() { return new Date(room.playAt) <= new Date(); }

  function paintRoom() {
    const play = new Date(room.playAt);
    const deadline = new Date(room.deadlineAt);
    document.title = room.title + " · 파티 방 · Escaplix";
    $("ri-title").textContent = room.title;
    const st = $("ri-status");
    const ended = isEnded();
    const s = UI.partyStatus(room.status, ended);
    st.textContent = s.label;
    st.className = s.cls;
    $("ri-meta").textContent = room.theme.title + " · " + room.theme.storeName + " · 📅 " + md(play) + " " + hm(play) + " (" + room.theme.playMinutes + "분)";
    $("ri-deadline").textContent = ended ? "플레이 시간이 지난 파티예요" : room.status === "CLOSED" ? "모집이 마감됐어요" : "⏰ " + md(deadline) + " " + hm(deadline) + "까지 모집";
    $("ri-intro").textContent = "👑 방장 한마디 · “" + room.intro + "”";

    $("rm-count").textContent = room.currentPeople + " / " + room.maxPeople + "명";
    const list = $("member-list");
    list.textContent = "";
    room.members.forEach(function (m) {
      const li = el("li");
      const name = el("span");
      name.append(m.leader ? "👑 " : "", el("b", null, m.nickname));
      if (m.memberId === me.memberId) name.append(el("span", "me", "(나)"));
      li.append(name);
      if (isLeader() && !m.leader && !ended) {   // 끝난 파티는 강퇴할 일이 없음
        const kick = el("button", "btn danger small", "강퇴");
        kick.type = "button";
        kick.setAttribute("aria-label", m.nickname + " 강퇴");
        kick.addEventListener("click", function () { doKick(m); });
        li.append(kick);
      }
      list.append(li);
    });
    for (let i = room.members.length; i < room.maxPeople; i++) list.append(el("li", "empty", "빈자리"));

    const actions = $("member-actions");
    actions.textContent = "";
    if (isLeader()) {
      if (room.status !== "CLOSED" && !ended) actions.append(actionBtn("모집 마감", "btn btn-line small", doClose));
      actions.append(actionBtn("파티 삭제", "btn danger small", doDelete));
      $("rm-note").textContent = "방장은 나갈 수 없어요. 대신 강퇴하거나 파티를 삭제할 수 있어요.";
    } else {
      actions.append(actionBtn("나가기", "btn btn-line small", doLeave));
      $("rm-note").textContent = "나가면 파티와 채팅방에서 함께 빠져요. 모집 중이면 다시 참여할 수 있어요.";
    }
    if (ended) paintEnded();
  }

  // 끝난 파티: 입력칸 대신 안내 + 후기 쓰기 (한 번만 바꿈)
  function paintEnded() {
    const form = $("chat-form");
    if (!form || form.hidden) return;
    form.hidden = true;
    const live = document.querySelector(".rc-live");
    if (live) live.textContent = "지난 대화";
    const bar = el("div", "chat-ended");
    bar.append(el("span", null, "끝난 파티예요. 지난 대화만 볼 수 있어요."));
    const btn = el("button", "btn btn-line small", "후기 쓰기");
    btn.type = "button";
    btn.addEventListener("click", function () { writeReview(btn); });
    bar.append(btn);
    form.after(bar);
    const empty = document.querySelector("#chat .chat-empty");
    if (empty) empty.textContent = "주고받은 메시지가 없어요.";
  }

  // 후기 쓰기: D 담당 후기 팝업(window.openReviewModal)이 있으면 열고, 없으면 테마 상세로 (chats.js 와 같음)
  async function writeReview(btn) {
    if (typeof window.openReviewModal !== "function") {
      location.href = Routes.url("theme", { id: room.theme.themeId });
      return;
    }
    btn.disabled = true;
    try {
      const t = await api.get("/api/themes/" + room.theme.themeId);
      window.openReviewModal({ themeId: t.themeId, title: t.title, storeName: t.store.name, playMinutes: t.playMinutes });
    } catch (e) {
      UI.toast(e.message, "err");   // 운영 종료된 테마 등
    } finally {
      btn.disabled = false;
    }
  }

  function actionBtn(text, cls, fn) {
    const b = el("button", cls, text);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }

  async function reloadRoom() {
    try {
      room = await api.get("/api/parties/" + partyId);
      paintRoom();
    } catch (e) { handleGone(e); }
  }

  // ---------- 방장 · 참여자 동작 ----------
  async function doKick(m) {
    const ok = await confirmBox(m.nickname + " 님을 강퇴할까요?", "강퇴된 사람은 이 파티에 다시 참여할 수 없어요.", "강퇴", true);
    if (!ok) return;
    try {
      await api.del("/api/parties/" + partyId + "/members/" + m.memberId);
      UI.toast(m.nickname + " 님을 강퇴했어요.");
      await reloadRoom();
      await poll();
    } catch (e) { e.status === 404 ? (UI.toast(e.message, "err"), reloadRoom()) : handleGone(e); }
  }

  async function doClose() {
    const ok = await confirmBox("모집을 마감할까요?", "파티 목록에서 빠지고 더는 참여를 받지 않아요. 채팅은 계속할 수 있어요.", "모집 마감");
    if (!ok) return;
    try {
      await api.put("/api/parties/" + partyId + "/close");
      UI.toast("모집을 마감했어요.");
      await reloadRoom();
    } catch (e) { e.status === 409 ? (UI.toast(e.message, "err"), reloadRoom()) : handleGone(e); }
  }

  async function doDelete() {
    const ok = await confirmBox("파티를 삭제할까요?", "참여자 모두 이 방과 채팅을 더는 볼 수 없어요. 되돌릴 수 없어요.", "삭제", true);
    if (!ok) return;
    try {
      await api.del("/api/parties/" + partyId);
      gone = true;
      clearTimeout(timer);
      back.go();   // 들어오기 전 화면으로 (내 채팅에서 왔으면 내 채팅)
    } catch (e) { handleGone(e); }
  }

  async function doLeave() {
    const ok = await confirmBox("파티에서 나갈까요?", "파티와 채팅방에서 함께 빠져요.", "나가기", true);
    if (!ok) return;
    try {
      await api.del("/api/parties/" + partyId + "/join");
      gone = true;
      clearTimeout(timer);
      back.go();   // 들어오기 전 화면으로 (내 채팅에서 왔으면 내 채팅)
    } catch (e) { handleGone(e); }
  }

  // 확인 팝업 → Promise<boolean>
  function confirmBox(title, body, yesText, danger) {
    const d = $("confirm-dialog");
    $("cd-title").textContent = title;
    $("cd-body").textContent = body;
    const yes = $("cd-yes");
    yes.textContent = yesText;
    yes.classList.toggle("danger-yes", !!danger);
    return new Promise(function (resolve) {
      function done(v) {
        yes.removeEventListener("click", onYes);
        $("cd-no").removeEventListener("click", onNo);
        d.removeEventListener("close", onClose);
        if (d.open) d.close();
        resolve(v);
      }
      function onYes() { done(true); }
      function onNo() { done(false); }
      function onClose() { done(false); }   // Esc
      yes.addEventListener("click", onYes);
      $("cd-no").addEventListener("click", onNo);
      d.addEventListener("close", onClose);
      d.showModal();
      $("cd-no").focus();
    });
  }

  // ---------- 채팅 ----------
  function setupChat() {
    const form = $("chat-form");
    const input = $("chat-input");
    const chat = $("chat");
    // 한글 조합 중 Enter 는 보내지 않음 (마지막 글자가 두 번 가는 문제 방지)
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.isComposing || e.keyCode === 229)) e.preventDefault();
    });
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      const send = $("chat-send");
      send.disabled = true;
      try {
        const m = await api.post("/api/parties/" + partyId + "/messages", { content: text });
        input.value = "";
        addMessage(m);
        scrollToBottom();
      } catch (err) {
        // 409: 방을 열어 둔 사이 플레이 시간이 지남 → 끝난 파티 화면으로
        if (err.status === 409) { UI.toast(err.message, "err"); paintRoom(); return; }
        handleGone(err);
      } finally {
        send.disabled = false;
        input.focus();
      }
    });
    chat.addEventListener("scroll", function () { if (nearBottom()) $("chat-new").hidden = true; });
    $("chat-new").addEventListener("click", function () { scrollToBottom(); });
    // 다른 탭을 보는 동안은 쉬고, 돌아오면 바로 받기
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && !gone) { clearTimeout(timer); poll().then(schedule); }
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (gone) return;
    timer = setTimeout(async function () {
      if (!document.hidden) await poll();
      schedule();
    }, POLL_MS);
  }

  async function poll() {
    if (polling || gone) return;
    polling = true;
    const first = lastId === null;
    try {
      const params = first ? {} : { after: lastId };
      const list = await api.get("/api/parties/" + partyId + "/messages", params);
      offlineShown = false;
      const wasBottom = nearBottom();
      let fresh = 0;
      let notice = false;
      list.forEach(function (m) {
        if (addMessage(m)) {
          fresh++;
          if (m.msgType !== "CHAT") notice = true;
        }
      });
      if (first && !list.length) showEmptyChat();
      if (lastId === null) lastId = 0;
      if (fresh) {
        if (wasBottom) scrollToBottom();
        else $("chat-new").hidden = false;
      }
      if (notice && !first) reloadRoom();   // 누가 들어오거나 나가면 참여자 명단도 새로 (처음엔 방금 받았으니 생략)
      if (isEnded() && !$("chat-form").hidden) paintRoom();   // 방을 열어 둔 사이 플레이 시간이 지나면 끝난 파티 화면으로
    } catch (e) {
      // 403·404 는 방에서 나감. 서버가 잠깐 안 될 때는 알림을 한 번만 (3초마다 쌓이지 않게)
      if (e.status === 403 || e.status === 404) handleGone(e);
      else if (!offlineShown) { offlineShown = true; UI.toast(e.message, "err"); }
    } finally {
      polling = false;
    }
  }

  // 한 줄 그리기. 이미 그린 번호면 false
  function addMessage(m) {
    if (shown.has(m.messageId)) return false;
    shown.add(m.messageId);
    if (lastId === null || m.messageId > lastId) lastId = m.messageId;
    const chat = $("chat");
    const empty = chat.querySelector(".chat-empty");
    if (empty) empty.remove();

    const at = new Date(m.createdAt);
    const day = UI.ymd(at);
    if (day !== lastDay) {
      lastDay = day;
      chat.append(el("div", "day-line", (at.getMonth() + 1) + "월 " + at.getDate() + "일 (" + UI.DAYS[at.getDay()] + ")"));
    }
    if (m.msgType !== "CHAT") {
      chat.append(el("div", "notice", m.nickname + (NOTICE[m.msgType] || "") + " · " + hm(at)));
      return true;
    }
    const leaderId = room && room.members.filter(function (x) { return x.leader; }).map(function (x) { return x.memberId; })[0];
    const box = el("div", "msg" + (m.mine ? " mine" : "") + (m.memberId === leaderId ? " leader" : ""));
    const who = el("div", "who");
    if (m.mine) who.append(hm(at));
    else who.append(el("b", null, m.nickname), " · " + hm(at));
    box.append(who, el("div", "bubble", m.content));
    chat.append(box);
    return true;
  }

  function showEmptyChat() { $("chat").append(el("div", "chat-empty", isEnded() ? "주고받은 메시지가 없어요." : "아직 메시지가 없어요. 먼저 인사해 보세요!")); }
  function nearBottom() { const c = $("chat"); return !c || c.scrollHeight - c.scrollTop - c.clientHeight < 60; }
  function scrollToBottom() { const c = $("chat"); if (c) c.scrollTop = c.scrollHeight; $("chat-new").hidden = true; }

  // ---------- 날짜 ----------
  function md(d) { return (d.getMonth() + 1) + "/" + d.getDate() + " (" + UI.DAYS[d.getDay()] + ")"; }
  function hm(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
})();
