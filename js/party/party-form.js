// S05 파티 만들기 (pages/party/party-form.html) · A 담당
//   B-1 공개 테마 목록 · B-3 그날 시간표 · A-14 만들기 → 성공하면 파티 방으로
//   ?themeId=  (파티 목록·테마 상세의 "파티 만들기")
//   ?themeId=&playAt=2026-11-20T19:00:00  (테마 상세 시간표에서 시간을 눌러 들어옴) → 테마·날짜·시간을 미리 골라 둔다
(function () {
  const $ = UI.$;
  const el = UI.el;

  const me = Auth.me();
  if (!me) { Auth.goLogin(); return; }
  if (me.role !== "USER") { location.replace(Routes.url("partyList")); return; }   // 파티는 손님 기능

  const q = new URLSearchParams(location.search);
  const preset = { themeId: q.get("themeId"), playAt: q.get("playAt") };

  const form = $("party-form");
  const errorBox = $("form-error");
  const themeSel = $("theme");
  // 플레이 날짜: 사이트 색 달력. 숨은 칸(dateInput)에 "YYYY-MM-DD", 고르면 change
  const datePk = UI.datePicker(null, "", { id: "date", placeholder: "날짜를 골라 주세요", clearable: false, label: "플레이 날짜" });
  $("date-box").append(datePk.el);
  const dateInput = datePk.input;
  const slotsBox = $("slots");
  const peopleSel = $("maxPeople");
  // 모집 기한: 날짜(달력) + 시각(고르기). 값은 deadlineValue() → "2026-11-20T16:00"
  const dlPk = UI.datePicker(null, "", { id: "deadline", placeholder: "날짜", clearable: false, disabled: true, label: "모집 기한 날짜" });
  const dlTime = $("deadline-time");
  $("deadline-box").prepend(dlPk.el);
  // 테마 · 모집 인원 · 기한 시각: 기본 select 대신 사이트 모양 드롭다운 (select 는 숨겨서 그대로 씀, UI.enhanceSelect)
  [themeSel, peopleSel, dlTime].forEach(function (s) { UI.enhanceSelect(s); });
  const submitBtn = $("submit-btn");

  let themes = [];
  let pickedTime = null;   // "19:00"
  let slotSeq = 0;         // 늦게 온 옛날 시간표 응답 무시

  // 돌아가기·취소: 왔던 화면으로 (홈 · 테마 상세 · 파티 목록 …), 모르면 파티 목록
  const back = PartyNav.setup($("back-link"), { name: "partyList", params: { themeId: preset.themeId } });
  $("cancel-btn").addEventListener("click", function () { back.go(); });
  if (preset.playAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(preset.playAt)) {
    datePk.set(preset.playAt.slice(0, 10));
    pickedTime = preset.playAt.slice(11, 16);
  }

  $("intro").addEventListener("input", function () { $("intro-count").textContent = $("intro").value.length + " / 100"; });
  form.addEventListener("input", function () { errorBox.hidden = true; });
  form.addEventListener("change", function () { errorBox.hidden = true; });

  loadThemes();

  // ---------- 테마 ----------
  async function loadThemes() {
    try {
      themes = await api.get("/api/themes");
    } catch (e) {
      themeSel.textContent = "";
      themeSel.append(new Option("테마를 불러오지 못했어요", ""));
      showError(e.message);
      return;
    }
    themes.sort(function (a, b) { return a.title.localeCompare(b.title, "ko"); });
    themeSel.textContent = "";
    themeSel.append(new Option("테마를 골라 주세요", ""));
    themes.forEach(function (t) {
      themeSel.append(new Option(t.title + " · " + t.storeName, t.themeId));
    });
    if (preset.themeId) {
      if (themes.some(function (t) { return String(t.themeId) === preset.themeId; })) themeSel.value = preset.themeId;
      else showError("지금은 파티를 만들 수 없는 테마예요. 다른 테마를 골라 주세요.");
    }
    onThemeChange();
  }

  function currentTheme() {
    return themes.find(function (t) { return String(t.themeId) === themeSel.value; }) || null;
  }

  themeSel.addEventListener("change", function () { pickedTime = null; onThemeChange(); });

  function onThemeChange() {
    const t = currentTheme();
    $("theme-info").textContent = t
      ? t.area + " · " + UI.genresText(t.genres) + " · " + UI.people(t.minPeople, t.maxPeople) + " · " + t.playMinutes + "분"
      : "";
    // 모집 인원: 2명 이상이면서 테마 인원 범위 안 (기본은 가장 적은 인원 = 보통 2명. 테마 최소가 3명 이상이면 그 인원)
    peopleSel.textContent = "";
    if (!t) {
      peopleSel.append(new Option("테마를 먼저 골라 주세요", ""));
      peopleSel.disabled = true;
    } else {
      for (let n = Math.max(2, t.minPeople); n <= t.maxPeople; n++) peopleSel.append(new Option(n + "명", n));
      peopleSel.value = String(Math.max(2, t.minPeople));
      peopleSel.disabled = false;
    }
    loadSlots();
  }

  // ---------- 그날 시간표 ----------
  dateInput.addEventListener("change", function () { pickedTime = null; loadSlots(); });

  async function loadSlots() {
    const t = currentTheme();
    const date = dateInput.value;
    const seq = ++slotSeq;
    slotsBox.textContent = "";
    setSlotMsg("", "");
    if (!t || !date) {
      slotsBox.append(el("span", "muted slots-note", "테마와 날짜를 먼저 골라 주세요."));
      paintDeadline();
      return;
    }
    if (date < UI.today()) {
      slotsBox.append(el("span", "muted slots-note", "오늘 이후 날짜를 골라 주세요."));
      pickedTime = null;
      paintDeadline();
      return;
    }
    slotsBox.append(el("span", "muted slots-note", "시간표를 불러오는 중…"));
    let res;
    try {
      res = await api.get("/api/themes/" + t.themeId + "/slots", { date: date });
    } catch (e) {
      if (seq !== slotSeq) return;
      slotsBox.textContent = "";
      slotsBox.append(el("span", "muted slots-note", e.message));
      return;
    }
    if (seq !== slotSeq) return;
    slotsBox.textContent = "";
    if (res.holidayName) setSlotMsg(res.holidayName + "이라 주말 시간표예요.", "");
    if (!res.slots.length) {
      slotsBox.append(el("span", "muted slots-note", "이 날은 고를 수 있는 시간이 없어요. 다른 날짜를 골라 주세요."));
      pickedTime = null;
      paintDeadline();
      return;
    }
    if (pickedTime && !res.slots.some(function (s) { return s.startTime === pickedTime; })) pickedTime = null;
    res.slots.forEach(function (s) {
      const b = el("button", "slot", s.startTime);
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(s.startTime === pickedTime));
      b.append(el("small", null, "~" + s.endTime));
      b.addEventListener("click", function () {
        pickedTime = s.startTime;
        slotsBox.querySelectorAll(".slot").forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
        setSlotMsg(res.holidayName ? res.holidayName + "이라 주말 시간표예요." : "", "");
        paintDeadline(true);
      });
      slotsBox.append(b);
    });
    paintDeadline(true);
  }

  function setSlotMsg(text, kind) {
    const m = $("slot-msg");
    m.textContent = text;
    m.className = "field-msg" + (kind ? " " + kind : "");
  }

  // ---------- 모집 기한: 지금 ~ 플레이 시간. 시간을 고르면 기본값(플레이 3시간 전, 너무 이르면 지금+30분) ----------
  function playAtValue() { return dateInput.value && pickedTime ? dateInput.value + "T" + pickedTime : null; }

  function deadlineValue() { return dlPk.input.value && dlTime.value ? dlPk.input.value + "T" + dlTime.value : ""; }

  function paintDeadline(fillDefault) {
    const play = playAtValue();
    if (!play) {
      dlPk.set("");
      dlPk.disable(true);
      fillTimes("");
      dlTime.disabled = true;
      return;
    }
    const now = localInput(new Date());
    dlPk.disable(false);
    dlTime.disabled = false;
    dlPk.range(now.slice(0, 10), play.slice(0, 10));   // 지금 ~ 플레이 날짜만 고를 수 있음
    let cur = deadlineValue();
    if (fillDefault && (!cur || cur > play || cur <= now)) {
      const p = new Date(play);
      let d = new Date(p.getTime() - 3 * 3600 * 1000);
      const soon = new Date(Date.now() + 30 * 60 * 1000);
      if (d < soon) d = soon < p ? soon : p;
      cur = localInput(d);
      dlPk.set(cur.slice(0, 10));
    }
    fillTimes(cur ? cur.slice(11, 16) : dlTime.value);
  }

  // 기한 시각 목록: 30분 간격. 기한 날짜가 오늘이면 지금 이후, 플레이 날짜면 플레이 시각까지
  //   기본값처럼 30분 단위가 아닌 시각(예: 지금+30분)도 하나 넣어 둔다
  function fillTimes(keep) {
    const date = dlPk.input.value;
    const play = playAtValue();
    dlTime.textContent = "";
    dlTime.append(new Option("시각", ""));
    if (!date || !play) return;
    const now = localInput(new Date());
    const lo = date === now.slice(0, 10) ? now.slice(11, 16) : null;    // 이 시각 "뒤"부터
    const hi = date === play.slice(0, 10) ? play.slice(11, 16) : null;  // 이 시각 "까지"
    function fits(t) { return (!lo || t > lo) && (!hi || t <= hi); }
    const list = [];
    for (let m = 0; m < 24 * 60; m += 30) {
      const t = String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
      if (fits(t)) list.push(t);
    }
    if (keep && fits(keep) && list.indexOf(keep) < 0) list.push(keep);
    if (hi && fits(hi) && list.indexOf(hi) < 0) list.push(hi);
    list.sort();
    list.forEach(function (t) { dlTime.append(new Option(t, t)); });
    dlTime.value = keep && list.indexOf(keep) >= 0 ? keep : "";
  }
  // 기한 날짜를 바꾸면 그날 고를 수 있는 시각으로 목록을 다시 (같은 시각이 되면 그대로)
  dlPk.input.addEventListener("change", function () { fillTimes(dlTime.value); });

  // Date → "2026-11-20T19:00" (내 컴퓨터 시각 그대로)
  function localInput(d) {
    return UI.ymd(d) + "T" + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  // ---------- 만들기 ----------
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    const t = currentTheme();
    const play = playAtValue();
    const deadline = deadlineValue();
    const title = $("title").value.trim();
    const intro = $("intro").value.trim();

    if (!t) return fail("테마를 골라 주세요.", themeSel);
    if (!dateInput.value) return fail("플레이 날짜를 골라 주세요.", datePk.button);
    if (!play) { setSlotMsg("시간을 골라 주세요.", "bad"); slotsBox.scrollIntoView({ block: "center" }); return; }
    if (!deadline) return fail("모집 기한을 정해 주세요.", dlPk.input.value ? dlTime : dlPk.button);
    if (deadline > play) return fail("모집 기한은 플레이 시간 전이어야 합니다.", dlTime);
    if (deadline <= localInput(new Date())) return fail("모집 기한은 지금 이후여야 합니다.", dlTime);
    if (!title) return fail("제목을 입력해 주세요.", $("title"));
    if (!intro) return fail("한마디를 입력해 주세요.", $("intro"));

    submitBtn.disabled = true;
    submitBtn.textContent = "만드는 중…";
    try {
      const res = await api.post("/api/parties", {
        themeId: t.themeId, title: title, intro: intro,
        playAt: play + ":00", deadlineAt: deadline + ":00", maxPeople: Number(peopleSel.value),
      });
      location.replace(Routes.url("partyRoom", { id: res.partyId }));
    } catch (err) {
      showError(err.message);
      // 그사이 시간이 지나 시간표에서 빠졌을 수 있으니 다시 불러온다
      if (err.status === 400 && err.message.indexOf("시간") >= 0) loadSlots();
      submitBtn.disabled = false;
      submitBtn.textContent = "모집 시작";
    }
  });

  function fail(msg, input) {
    showError(msg);
    if (input) input.focus();
  }
  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ block: "center" });
  }
})();
