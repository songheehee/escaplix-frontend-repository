// S04 파티 목록 (pages/party/party-list.html) · A 담당
//   A-12 파티 목록 (장르 여러 개 · 테마 이름 검색 · 지역 · 테마) · A-16 참여 · B-7 장르 · B-2 테마 이름 · B-8·B-12 지역
//   주소 ?themeId=&keyword=&area=홍대(또는 region=서울)&genreIds=1,2 → 홈·테마 상세의 "모집 중인 파티" 버튼이 ?themeId= 로 들어온다
//   배너를 누르면: 참여 중 → 바로 방 / 강퇴됨 → 못 들어감 / 나머지 → 참여 확인 팝업 → 참여 → 방
(function () {
  const $ = UI.$;
  const el = UI.el;

  const me = Auth.me();   // 비회원도 목록은 볼 수 있다. 참여·만들기를 누르면 로그인으로
  const isUser = !!me && me.role === "USER";   // 만들기·참여는 손님만 (사장·관리자는 보기만)
  const canCreate = !me || isUser;   // 비회원: 만들기 화면이 로그인으로 보낸 뒤 다시 만들기로 돌아옴

  // ---------- 조건 (주소에 남겨서 새로고침·뒤로가기에도 유지) ----------
  const q = new URLSearchParams(location.search);
  const state = {
    themeId: q.get("themeId") || null,
    keyword: q.get("keyword") || "",
    genreIds: new Set((q.get("genreIds") || "").split(",").filter(Boolean)),
    area: q.get("area") || "",                        // 세부 지역 (홍대…)
    region: q.get("area") ? "" : q.get("region") || "", // 큰 지역 (서울 전체…). 세부 지역이 있으면 그게 우선
  };

  const grid = $("grid");
  const keywordInput = $("keyword");
  let loadSeq = 0;   // 늦게 온 옛날 응답이 새 결과를 덮어쓰지 않게 (load 보다 먼저 선언해야 함)
  keywordInput.value = state.keyword;

  const createBtn = $("create-btn");
  if (canCreate) createBtn.href = Routes.url("partyForm", { themeId: state.themeId });
  else createBtn.remove();   // .btn 은 display 가 정해져 있어서 hidden 으로는 안 숨겨짐

  setupThemeFilter();
  setupKeyword();
  setupArea();
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

  // ---------- 테마로 들어왔을 때: 테마 이름 표시 + ✕ ----------
  async function setupThemeFilter() {
    if (!state.themeId) return;
    const box = $("theme-filter");
    $("theme-filter-name").textContent = "이 테마";
    box.hidden = false;
    $("theme-filter-clear").addEventListener("click", function () {
      state.themeId = null;
      box.hidden = true;
      createBtn.href = Routes.url("partyForm");
      changed();
    });
    try {
      const t = await api.get("/api/themes/" + encodeURIComponent(state.themeId));
      $("theme-filter-name").textContent = t.title;
      $("theme-filter-name").title = t.title;   // 잘려도 마우스를 올리면 전체 이름
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

  // ---------- 지역 (검색 패널과 같은 칸: 큰 지역 → 펼쳐서 세부 지역) ----------
  function setupArea() {
    const picker = UI.areaPicker({ area: state.area, region: state.region }, { label: "지역" });
    picker.el.classList.add("pl-area");
    document.querySelector(".pl-search").after(picker.el);
    picker.el.addEventListener("change", function () {
      const v = picker.value();
      state.area = v.area;
      state.region = v.region;
      changed();
    });
  }

  // 조건이 바뀌면 주소를 고치고 다시 불러온다 (뒤로가기 기록은 늘리지 않음)
  function changed() {
    const url = Routes.url("partyList", {
      themeId: state.themeId, keyword: state.keyword, area: state.area, region: state.region,
      genreIds: Array.from(state.genreIds).join(","),
    });
    history.replaceState(null, "", url);
    load();
  }

  // ---------- 목록 ----------
  async function load() {
    const seq = ++loadSeq;
    grid.textContent = "";
    for (let i = 0; i < 4; i++) grid.append(el("div", "sk party-sk"));
    try {
      const list = await api.get("/api/parties", {
        themeId: state.themeId, keyword: state.keyword, area: state.area, region: state.region,
        genreIds: Array.from(state.genreIds).join(","),
      });
      if (seq !== loadSeq) return;
      grid.textContent = "";
      if (!list.length) {
        grid.append(canCreate
          ? UI.emptyBox("조건에 맞는 파티가 없어요.", "직접 파티 만들기", Routes.url("partyForm", { themeId: state.themeId }))
          : UI.emptyBox("조건에 맞는 파티가 없어요."));
        return;
      }
      // 순서: 참여할 수 있는 파티(모집 중) → 내가 들어간 파티 → 못 들어가는 파티(정원 참·강퇴됨, 맨 뒤)
      //   묶음 안에서는 서버 순서(플레이 날짜 빠른 순) 그대로
      function rank(p) { return p.joined ? 1 : (p.status === "FULL" || p.kicked) ? 2 : 0; }
      list.slice().sort(function (a, b) { return rank(a) - rank(b); })
        .forEach(function (p) { grid.append(card(p)); });
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
    const full = p.status === "FULL";   // 정원 마감: 목록엔 보이지만 참여는 못 함 (참여 중이면 방으로)
    const c = el(p.kicked ? "div" : "button", "party-card" + (p.kicked ? " kicked" : "") + (full && !p.joined ? " full" : ""));
    if (p.kicked) c.setAttribute("aria-disabled", "true");
    else c.type = "button";

    // 카드 (11/24 정리): 위 = 테마(크게)+배지 · 장르 · 날짜 시간 · 매장 / 아래 = 제목 · 인원 · 모집 마감
    //   한마디·방장은 카드를 누르면 뜨는 참여 확인 팝업에서 봄
    const top = el("div", "pb-top");
    const theme = el("div", "pb-theme", p.themeTitle);
    theme.title = p.themeTitle;
    // 배지(참여 중·정원 마감·강퇴됨)는 위 칸 오른쪽 위, 테마 이름 옆 → 카드 높이가 안 늘어남
    const badges = el("div", "pb-badges");
    if (p.joined) badges.append(el("span", "badge mine", "참여 중"));
    if (p.kicked) badges.append(el("span", "badge bad", "강퇴됨"));
    else if (full) {   // 강퇴됐으면 강퇴 배지 하나만
      const st = UI.partyStatus("FULL");
      badges.append(el("span", st.cls, st.label));
    } else if (deadline - Date.now() < 24 * 3600 * 1000) {   // 모집 기한이 하루 안 남으면 "곧 마감"
      const soon = el("span", "badge soon", "곧 마감");
      soon.title = "모집 마감 " + md(deadline) + " " + hm(deadline);
      badges.append(soon);
    }
    const themeRow = el("div", "pb-theme-row");
    themeRow.append(theme);
    if (badges.childElementCount) themeRow.append(badges);
    top.append(themeRow);
    if (p.genres && p.genres.length) {
      const g = el("div", "pb-genres");
      p.genres.forEach(function (name) { g.append(el("span", "pb-genre", name)); });
      top.append(g);
    }
    top.append(el("div", "pb-date", md(play) + " " + hm(play)));
    const store = el("div", "pb-store", p.storeName);
    store.title = p.storeName;
    top.append(store);
    c.append(top);

    const body = el("div", "pb-body");
    const title = el("div", "pb-title", p.title);
    title.title = p.title;   // 한 줄 넘어 잘려도 마우스 올리면 전체 제목
    body.append(title);

    const seats = el("div", "pb-seats");
    const dots = el("span", "seats");
    dots.setAttribute("aria-hidden", "true");
    for (let i = 0; i < p.maxPeople; i++) dots.append(el("i", i < p.currentPeople ? "on" : null));
    seats.append(dots, el("b", null, p.currentPeople + " / " + p.maxPeople + "명"));
    body.append(seats);
    c.append(body);

    c.setAttribute("aria-label", p.themeTitle + ", " + md(play) + " " + hm(play) + ", " + p.title + ", "
      + p.currentPeople + "/" + p.maxPeople + "명" + (full ? ", 정원 마감" : "") + (p.joined ? ", 참여 중" : "") + (p.kicked ? ", 강퇴되어 참여 불가" : ""));
    c.addEventListener("click", function () { onPick(p); });
    return c;
  }

  // 모집 마감 한 줄: "모집 마감 11/27 (금) 21:00". 24시간 안이면 "곧 마감 · 오늘 23:00" (굵게)
  //   예전 "전날 21:00까지 모집" 은 무엇의 전날인지 헷갈려서 날짜를 그대로 씀

  function onPick(p) {
    if (p.kicked) { UI.toast("강퇴된 파티에는 다시 참여할 수 없어요.", "err"); return; }
    if (p.joined) { location.href = Routes.url("partyRoom", { id: p.partyId }); return; }   // 팝업 없이 바로 방
    if (p.status === "FULL") { UI.toast("정원이 다 찬 파티예요. 자리가 나면 다시 참여할 수 있어요.", "err"); return; }
    if (!me) { openJoin(p); return; }   // 비회원: 같은 팝업으로 파티를 보여 주고 "로그인하고 참여하기"
    if (!isUser) { UI.toast("손님 계정만 파티에 참여할 수 있어요.", "err"); return; }
    openJoin(p);
  }

  // ---------- 참여 확인 팝업 ----------
  const dialog = $("join-dialog");
  const yesBtn = $("jd-yes");
  let picked = null;

  if (!me) {
    $("jd-q").textContent = "로그인하면 참여할 수 있어요";
    $("jd-no").textContent = "닫기";
  }
  $("jd-no").addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });   // 바깥(어두운 곳) 누르면 닫기

  function openJoin(p) {
    picked = p;
    const play = at(p.playAt);
    // 제목 → 테마·매장·일시·인원·방장 표 → 방장 한마디
    $("jd-title").textContent = p.title;
    $("jd-intro").textContent = p.intro || "";
    $("jd-intro").hidden = !p.intro;
    $("jd-theme").textContent = p.themeTitle;
    $("jd-store").textContent = p.storeName;
    $("jd-when").textContent = md(play) + " " + hm(play);
    const seats = $("jd-seats");
    seats.textContent = "";
    const dots = el("span", "seats");
    dots.setAttribute("aria-hidden", "true");
    for (let i = 0; i < p.maxPeople; i++) dots.append(el("i", i < p.currentPeople ? "on" : null));
    seats.append(dots, el("span", null, p.currentPeople + " / " + p.maxPeople + "명"));
    $("jd-leader").textContent = p.leaderNickname;
    yesBtn.disabled = false;
    yesBtn.textContent = me ? "예, 참여할게요" : "로그인하고 참여하기";
    dialog.showModal();
    yesBtn.focus();
  }

  yesBtn.addEventListener("click", async function () {
    if (!picked) return;
    if (!me) { dialog.close(); Auth.goLogin(); return; }   // 로그인하면 이 목록(같은 조건)으로 돌아옴
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
