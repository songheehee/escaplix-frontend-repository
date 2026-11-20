// S04 파티 목록 (pages/party/party-list.html) · A 담당
//   A-12 모집 중인 파티 (장르 여러 개 · 테마 이름 검색 · 테마) · A-16 참여 · B-7 장르 · B-2 테마 이름
//   주소 ?themeId=&keyword=&genreIds=1,2 → 홈·테마 상세의 "모집 중인 파티" 버튼이 ?themeId= 로 들어온다
//   배너를 누르면: 참여 중 → 바로 방 / 강퇴됨 → 못 들어감 / 나머지 → 참여 확인 팝업 → 참여 → 방
(function () {
  const $ = UI.$;
  const el = UI.el;

  const me = Auth.me();
  if (!me) { Auth.goLogin(); return; }
  const isUser = me.role === "USER";   // 만들기·참여는 손님만 (사장·관리자는 보기만)

  // ---------- 조건 (주소에 남겨서 새로고침·뒤로가기에도 유지) ----------
  const q = new URLSearchParams(location.search);
  const state = {
    themeId: q.get("themeId") || null,
    keyword: q.get("keyword") || "",
    genreIds: new Set((q.get("genreIds") || "").split(",").filter(Boolean)),
  };

  const grid = $("grid");
  const keywordInput = $("keyword");
  let loadSeq = 0;   // 늦게 온 옛날 응답이 새 결과를 덮어쓰지 않게 (load 보다 먼저 선언해야 함)
  keywordInput.value = state.keyword;

  const createBtn = $("create-btn");
  if (isUser) createBtn.href = Routes.url("partyForm", { themeId: state.themeId });
  else createBtn.remove();   // .btn 은 display 가 정해져 있어서 hidden 으로는 안 숨겨짐

  setupThemeFilter();
  setupKeyword();
  setupGenres();
  load();
  // 파티 방에서 나가기·삭제 뒤 뒤로가기로 돌아오면 브라우저가 예전 화면을 그대로 보여 줄 수 있다 → 다시 불러오기
  //   참여 확인 팝업이 열린 채로 저장된 화면이면 팝업도 닫는다
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    const d = $("join-dialog");
    if (d.open) d.close();
    load();
  });

  // ---------- 테마로 들어왔을 때: "○○ 파티만" 표시 + ✕ ----------
  async function setupThemeFilter() {
    if (!state.themeId) return;
    const box = $("theme-filter");
    $("theme-filter-name").textContent = "이 테마 파티만";
    box.hidden = false;
    $("theme-filter-clear").addEventListener("click", function () {
      state.themeId = null;
      box.hidden = true;
      createBtn.href = Routes.url("partyForm");
      changed();
    });
    try {
      const t = await api.get("/api/themes/" + encodeURIComponent(state.themeId));
      $("theme-filter-name").textContent = t.title + " 파티만";
    } catch (e) { /* 이름을 못 불러와도 조건은 그대로 */ }
  }

  // ---------- 검색어: 치는 동안은 기다렸다가 한 번에 ----------
  function setupKeyword() {
    let timer = null;
    keywordInput.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.keyword = keywordInput.value.trim();
        changed();
      }, 300);
    });
  }

  // ---------- 장르: 버튼 → 칩 패널 (여러 개) ----------
  async function setupGenres() {
    const btn = $("genre-btn");
    const panel = $("genre-panel");
    const chips = $("genre-chips");
    const names = {};

    function open(v) {
      panel.hidden = !v;
      btn.setAttribute("aria-expanded", String(v));
    }
    btn.addEventListener("click", function (e) { e.stopPropagation(); open(panel.hidden); });
    document.addEventListener("click", function (e) { if (!panel.hidden && !panel.contains(e.target)) open(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) { open(false); btn.focus(); } });

    function paintLabel() {
      const picked = Array.from(state.genreIds).map(function (id) { return names[id]; }).filter(Boolean);
      btn.textContent = "장르: " + (picked.length === 0 ? "전체" : picked.length === 1 ? picked[0] : picked[0] + " 외 " + (picked.length - 1)) + " ▾";
    }

    $("genre-reset").addEventListener("click", function () {
      state.genreIds.clear();
      chips.querySelectorAll("input").forEach(function (c) { c.checked = false; });
      paintLabel();
      changed();
    });

    try {
      const genres = await api.get("/api/genres");
      genres.forEach(function (g) {
        names[g.genreId] = g.name;
        const label = el("label", "pchip");
        const cb = el("input");
        cb.type = "checkbox";
        cb.value = g.genreId;
        cb.checked = state.genreIds.has(String(g.genreId));
        cb.addEventListener("change", function () {
          if (cb.checked) state.genreIds.add(cb.value); else state.genreIds.delete(cb.value);
          paintLabel();
          changed();
        });
        label.append(cb, el("span", null, g.name));
        chips.append(label);
      });
      paintLabel();
    } catch (e) {
      chips.append(el("span", "muted", "장르를 불러오지 못했어요."));
    }
  }

  // 조건이 바뀌면 주소를 고치고 다시 불러온다 (뒤로가기 기록은 늘리지 않음)
  function changed() {
    const url = Routes.url("partyList", {
      themeId: state.themeId, keyword: state.keyword, genreIds: Array.from(state.genreIds).join(","),
    });
    history.replaceState(null, "", url);
    load();
  }

  // ---------- 목록 ----------
  async function load() {
    const seq = ++loadSeq;
    grid.textContent = "";
    for (let i = 0; i < 4; i++) grid.append(el("div", "sk party-sk"));
    $("count").textContent = "";
    try {
      const list = await api.get("/api/parties", {
        themeId: state.themeId, keyword: state.keyword, genreIds: Array.from(state.genreIds).join(","),
      });
      if (seq !== loadSeq) return;
      grid.textContent = "";
      $("count").textContent = "모집 중 " + list.length + "개";
      if (!list.length) {
        grid.append(isUser
          ? UI.emptyBox("조건에 맞는 모집 중인 파티가 없어요.", "직접 파티 만들기", Routes.url("partyForm", { themeId: state.themeId }))
          : UI.emptyBox("조건에 맞는 모집 중인 파티가 없어요."));
        return;
      }
      list.forEach(function (p) { grid.append(card(p)); });
    } catch (e) {
      if (seq !== loadSeq) return;
      grid.textContent = "";
      grid.append(UI.emptyBox(e.message));
    }
  }

  // ---------- 날짜 ----------
  function at(s) { return new Date(s); }   // 서버 "2026-11-20T19:00:00" (한국 시각, 시간대 없음)
  function md(d) { return (d.getMonth() + 1) + "/" + d.getDate() + " (" + UI.DAYS[d.getDay()] + ")"; }
  function hm(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }

  // ---------- 배너 한 장 ----------
  function card(p) {
    const play = at(p.playAt);
    const deadline = at(p.deadlineAt);
    const c = el(p.kicked ? "div" : "button", "party-card" + (p.kicked ? " kicked" : ""));
    if (p.kicked) c.setAttribute("aria-disabled", "true");
    else c.type = "button";

    const top = el("div", "pb-top");
    top.style.background = UI.genreGradient(p.genres);
    top.append(el("div", "pb-theme", "🚪 " + p.themeTitle));
    const g = el("div", "pb-genres");
    (p.genres || []).forEach(function (name) { g.append(el("span", "pb-genre", name)); });
    top.append(g);
    top.append(el("div", "pb-date", md(play)));
    top.append(el("div", "pb-time", hm(play) + " 플레이 · " + p.storeName));
    c.append(top);

    const body = el("div", "pb-body");
    const badges = el("div", "pb-badges");
    if (p.joined) badges.append(el("span", "badge mine", "참여 중"));
    if (p.kicked) badges.append(el("span", "badge bad", "강퇴됨"));
    if (!p.kicked && deadline - Date.now() < 24 * 3600 * 1000) badges.append(el("span", "badge soon", "곧 마감"));
    body.append(badges);
    body.append(el("div", "pb-title", p.title));
    body.append(el("div", "pb-intro", "“" + p.intro + "”"));

    const seats = el("div", "pb-seats");
    const dots = el("span", "seats");
    dots.setAttribute("aria-hidden", "true");
    for (let i = 0; i < p.maxPeople; i++) dots.append(el("i", i < p.currentPeople ? "on" : null));
    seats.append(dots, el("b", null, p.currentPeople + " / " + p.maxPeople + "명"));
    body.append(seats);

    const foot = el("div", "pb-foot");
    if (p.kicked) foot.append(el("div", "kicked-note", "강퇴된 파티라 다시 참여할 수 없어요"));
    else foot.append(el("div", "pb-deadline", "⏰ " + md(deadline) + " " + hm(deadline) + " 모집 마감"));
    foot.append(el("div", "muted", "👑 방장 " + p.leaderNickname));
    body.append(foot);
    c.append(body);

    c.setAttribute("aria-label", p.themeTitle + ", " + md(play) + " " + hm(play) + ", " + p.title + ", "
      + p.currentPeople + "/" + p.maxPeople + "명" + (p.joined ? ", 참여 중" : "") + (p.kicked ? ", 강퇴되어 참여 불가" : ""));
    c.addEventListener("click", function () { onPick(p); });
    return c;
  }

  function onPick(p) {
    if (p.kicked) { UI.toast("강퇴된 파티에는 다시 참여할 수 없어요.", "err"); return; }
    if (p.joined) { location.href = Routes.url("partyRoom", { id: p.partyId }); return; }   // 팝업 없이 바로 방
    if (!isUser) { UI.toast("손님 계정만 파티에 참여할 수 있어요.", "err"); return; }
    openJoin(p);
  }

  // ---------- 참여 확인 팝업 ----------
  const dialog = $("join-dialog");
  const yesBtn = $("jd-yes");
  let picked = null;

  $("jd-no").addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });   // 바깥(어두운 곳) 누르면 닫기

  function openJoin(p) {
    picked = p;
    const play = at(p.playAt);
    $("jd-title").textContent = p.title;
    $("jd-place").textContent = p.themeTitle + " · " + p.storeName;
    $("jd-when").textContent = "📅 " + md(play) + " " + hm(play) + " · 지금 " + p.currentPeople + " / " + p.maxPeople + "명 · 👑 " + p.leaderNickname;
    $("jd-intro").textContent = "“" + p.intro + "”";
    yesBtn.disabled = false;
    yesBtn.textContent = "예, 참여할게요";
    dialog.showModal();
    yesBtn.focus();
  }

  yesBtn.addEventListener("click", async function () {
    if (!picked) return;
    yesBtn.disabled = true;
    yesBtn.textContent = "참여하는 중…";
    try {
      await api.post("/api/parties/" + picked.partyId + "/join");
      dialog.close();   // 닫고 나서 이동해야 뒤로가기로 돌아왔을 때 팝업이 다시 보이지 않음
      location.href = Routes.url("partyRoom", { id: picked.partyId });
    } catch (e) {
      // 409: 그사이 자리가 찼거나 마감됨 → 문구를 보여 주고 목록을 새로 (명세 A-16)
      dialog.close();
      UI.toast(e.message, "err");
      if (e.status === 409 || e.status === 404) load();
    }
  });
})();
