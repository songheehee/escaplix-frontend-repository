// 후기 팝업 · D 담당 · D-1 쓰기 · D-2 수정 · D-6 테마 고르기 (신고 기능은 뺌)
//
// 다른 화면과의 약속 (theme.js · chats.js · mypage.js 가 부른다)
//   window.openReviewModal({ themeId, title, storeName, playMinutes })  → 그 테마로 후기 쓰기
//   window.openReviewModal({ review })                                  → 내 후기 수정 (D-5 한 줄을 그대로 넘김)
//   window.openReviewModal()                                            → 테마 골라서 쓰기: 파티로 다녀온 테마(D-6) + 이름 검색(B-1)
//   끝나면 document 에 "review-saved" 이벤트를 쏜다. detail: { type: "create"|"edit", reviewId, themeId }
//
// 규칙: 사용자가 쓴 글은 textContent 로만 넣는다 (명세 1-7)
(function () {
  const el = UI.el;
  const CONTENT_MAX = 200;   // 한 줄 후기 (ReviewCreateRequest @Size)
  const SEARCH_MAX = 8;      // 테마 검색 결과를 몇 개까지 보여 줄지

  let dlg = null;   // <dialog> 하나를 만들어 계속 씀
  let uid = 0;      // 라디오 버튼 name 이 팝업마다 겹치지 않게

  // ---------------------------------------------------------------- 팝업 틀

  function dialog() {
    if (dlg) return dlg;
    dlg = el("dialog", "rm");
    dlg.setAttribute("aria-labelledby", "rm-title");
    // 어두운 바깥을 누르면 닫기. 누르기 시작한 곳도 바깥이어야 함
    //   (안에서 글자를 끌어 고르다 바깥에서 손을 떼면 닫히던 문제)
    let downOnBackdrop = false;
    dlg.addEventListener("pointerdown", function (e) { downOnBackdrop = e.target === dlg; });
    dlg.addEventListener("click", function (e) { if (downOnBackdrop && e.target === dlg) dlg.close(); downOnBackdrop = false; });
    document.body.append(dlg);
    return dlg;
  }

  function open(titleText, body) {
    const d = dialog();
    d.textContent = "";
    const box = el("div", "rm-box");
    const head = el("div", "rm-head");
    const h = el("h2", "rm-title", titleText);
    h.id = "rm-title";
    const x = el("button", "rm-x", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "닫기");
    x.addEventListener("click", function () { d.close(); });
    head.append(h, x);
    box.append(head, body);
    d.append(box);
    if (!d.open) d.showModal();
    return d;
  }

  // 한 줄 후기 칸을 팝업에 스크롤바가 생기기 직전까지 한 줄씩 키움 (2~TEXT_ROWS_MAX 줄)
  //   팝업을 열 때, 창 크기가 바뀔 때, 오류 글이 생겼을 때 다시 맞춤
  const TEXT_ROWS_MIN = 2;
  const TEXT_ROWS_MAX = 6;
  let fitTarget = null;
  function fitText(ta) {
    fitTarget = ta;
    const d = dialog();
    if (!d.open || !ta.isConnected) return;
    ta.rows = TEXT_ROWS_MIN;
    while (ta.rows < TEXT_ROWS_MAX && d.scrollHeight <= d.clientHeight) ta.rows++;
    if (d.scrollHeight > d.clientHeight && ta.rows > TEXT_ROWS_MIN) ta.rows--;
  }
  let fitTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(function () { if (fitTarget) fitText(fitTarget); }, 100);
  });

  function finish(type, detail) {
    dlg.close();
    document.dispatchEvent(new CustomEvent("review-saved", { detail: Object.assign({ type: type }, detail) }));
  }

  // ---------------------------------------------------------------- 후기 쓰기·고치기

  window.openReviewModal = function (opts) {
    if (!Auth.me()) { Auth.goLogin(); return; }
    opts = opts || {};
    if (opts.review) {
      const r = opts.review;
      reviewForm({
        mode: "edit",
        review: r,
        theme: { themeId: r.themeId, title: r.themeTitle, storeName: r.storeName, playMinutes: r.playMinutes },
      });
    } else if (opts.themeId) {
      reviewForm({ mode: "create", theme: opts });
    } else {
      pickTheme();
    }
  };

  // 테마 고르기 (마이페이지 "＋ 후기 쓰기")
  //   ① 파티로 다녀온 테마: 시간이 지난 파티 중 후기 안 쓴 것 (D-6)
  //   ② 다른 테마 찾기: 파티 없이 다녀온 테마를 이름으로 검색 (B-1 keyword). 이미 후기 쓴 테마는 뺌 (D-5)
  async function pickTheme() {
    const body = el("div", "rm-body");
    open("후기 쓰기", body);

    // ① 파티로 다녀온 테마
    const partyList = el("div", "rm-picks");
    partyList.append(el("p", "muted small", "다녀온 파티를 불러오는 중이에요."));
    section(body, "파티로 다녀온 테마").append(partyList);

    // ② 다른 테마 찾기
    const sform = el("form", "rm-search");
    sform.setAttribute("role", "search");
    const q = el("input", "rm-q");
    q.type = "search";
    q.maxLength = 50;
    q.placeholder = "테마나 매장 이름 입력";
    q.setAttribute("aria-label", "테마나 매장 이름으로 찾기");
    const go = el("button", "btn btn-dim small", "찾기");
    go.type = "submit";
    sform.append(q, go);
    const results = el("div", "rm-picks");
    results.setAttribute("aria-live", "polite");
    section(body, "다른 테마 찾기").append(sform, results);

    let reviewed = new Set();       // 이미 후기 쓴 테마 → 검색 결과에서 뺌
    const partyThemes = new Set();  // ①에 이미 보이는 테마 → 검색 결과에서 뺌
    let seq = 0;                    // 빨리 여러 번 입력했을 때 늦게 온 예전 결과는 버림
    let timer = null;

    sform.addEventListener("submit", function (e) { e.preventDefault(); clearTimeout(timer); search(); });
    q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(search, 300); });
    q.focus();

    async function search() {
      const kw = q.value.trim();
      const my = ++seq;
      results.textContent = "";
      if (!kw) {
        results.append(el("p", "muted small", "찾을 테마나 매장 이름을 입력해 주세요."));
        return;
      }
      results.append(el("p", "muted small", "찾는 중이에요."));
      let list;
      try {
        list = await api.get("/api/themes", { keyword: kw, sort: "rate" });
      } catch (e) {
        if (my !== seq) return;
        results.textContent = "";
        results.append(el("p", "rm-msg", e.message));
        return;
      }
      if (my !== seq) return;
      results.textContent = "";
      const found = list.filter(function (t) { return !reviewed.has(t.themeId) && !partyThemes.has(t.themeId); });
      if (!found.length) {
        results.append(el("p", "muted small", list.length
          ? "찾은 테마는 이미 후기를 썼거나 위 목록에 있어요."
          : "\"" + kw + "\"(으)로 찾은 테마가 없어요."));
        return;
      }
      found.slice(0, SEARCH_MAX).forEach(function (t) {
        results.append(pickButton(t.title, t.storeName, function () {
          reviewForm({ mode: "create", theme: { themeId: t.themeId, title: t.title, storeName: t.storeName, playMinutes: t.playMinutes } });
        }));
      });
      if (found.length > SEARCH_MAX) {
        results.append(el("p", "muted small", "더 있어요. 이름을 조금 더 자세히 입력해 보세요."));
      }
    }

    // ①과 "이미 쓴 테마" 목록을 함께 불러옴
    const loaded = await Promise.all([
      api.get("/api/my/review-candidates").catch(function (e) { return e; }),
      api.get("/api/my/reviews").catch(function () { return []; }),
    ]);
    const cands = loaded[0];
    reviewed = new Set(loaded[1].map(function (r) { return r.themeId; }));

    partyList.textContent = "";
    if (cands instanceof Error) {
      partyList.append(el("p", "rm-msg", cands.message));
    } else if (!cands.length) {
      partyList.append(el("p", "muted small", "후기를 모두 작성했어요."));
    } else {
      cands.forEach(function (c) {
        partyThemes.add(c.themeId);
        partyList.append(pickButton(c.title, c.storeName + ", " + when(c.playAt) + " 파티 " + c.memberCount + "인", function () {
          reviewForm({
            mode: "create",
            theme: { themeId: c.themeId, title: c.title, storeName: c.storeName, playMinutes: c.playMinutes },
            playerCount: c.memberCount,         // 파티 인원으로 처음 값을 채움 (명세 D-6)
            playedDate: c.playAt.slice(0, 10),
          });
        }));
      });
    }
    if (q.value.trim()) search();   // 불러오는 사이에 입력했다면 제외 목록을 반영해 다시 찾기
  }

  function section(parent, title) {
    const s = el("section", "rm-section");
    s.append(el("h3", "rm-sub", title));
    parent.append(s);
    return s;
  }

  function pickButton(title, sub, onClick) {
    const b = el("button", "rm-pick");
    b.type = "button";
    b.append(el("b", null, title), el("span", "muted small", sub));
    b.addEventListener("click", onClick);
    return b;
  }

  function reviewForm(ctx) {
    uid++;
    const t = ctx.theme;
    const r = ctx.review || {};
    const isEdit = ctx.mode === "edit";

    const form = el("form", "rm-body rm-form");
    form.noValidate = true;

    const themeLine = el("div", "rm-theme");
    const tName = el("b", null, t.title);
    tName.title = t.title;   // 긴 이름은 한 줄에서 … 로 자르고, 전체는 마우스를 올리면
    themeLine.append(tName);
    if (t.storeName) themeLine.append(el("span", "muted small", t.storeName));
    form.append(themeLine);

    // 별점 1~5
    let rating = r.rating || 0;
    const stars = el("div", "rm-stars");
    stars.setAttribute("role", "group");
    stars.setAttribute("aria-label", "별점");
    for (let i = 1; i <= 5; i++) {
      const s = el("button", "rm-star", "★");
      s.type = "button";
      s.dataset.v = String(i);
      s.setAttribute("aria-label", i + "점");
      s.addEventListener("click", function () { rating = i; paintStars(); });
      stars.append(s);
    }
    function paintStars() {
      stars.querySelectorAll(".rm-star").forEach(function (s) {
        const v = Number(s.dataset.v);
        s.classList.toggle("on", v <= rating);
        s.setAttribute("aria-pressed", String(v === rating));
      });
    }
    paintStars();
    field(form, "별점").append(stars);

    // 탈출 여부: 성공·실패
    const ok = radio("escaped", "Y", "성공");
    const ng = radio("escaped", "N", "실패");
    const seg = el("div", "rm-seg");
    seg.append(ok.label, ng.label);
    (isEdit && !r.escaped ? ng : ok).input.checked = true;
    // 고른 칸에 .on (성공은 초록, 실패는 빨강). CSS :has(:checked) 는 바꿔도 다시 칠해지지 않는 경우가 있어서 클래스로
    function paintSeg() {
      ok.label.classList.toggle("on", ok.input.checked);
      ng.label.classList.toggle("on", ng.input.checked);
    }
    seg.addEventListener("change", paintSeg);
    paintSeg();
    const result = field(form, "탈출 결과");
    result.append(seg);

    // 남은 시간: 성공 바로 아래 상자. 실패면 상자가 사라지고 분·초는 0 으로 보냄
    const min = numInput(0, t.playMinutes, r.remainMinutes ?? 0, "남은 분");
    const sec = numInput(0, 59, r.remainSeconds ?? 0, "남은 초");
    const time = el("div", "rm-remain");
    time.append(el("span", "rm-remain-label", "남은 시간"), min, el("span", null, "분"), sec, el("span", null, "초"));
    result.append(time);
    function syncEscaped() {
      const fail = ng.input.checked;
      time.hidden = fail;
      if (fail) { min.value = "0"; sec.value = "0"; }
    }
    seg.addEventListener("change", syncEscaped);
    syncEscaped();

    // 힌트 · 인원 · 플레이한 날: 한 상자 안에 줄로. 이름은 왼쪽, 고르는 칸은 오른쪽
    //   숫자를 치는 칸은 남은 시간 두 개만 남기고, 힌트는 − + 버튼, 인원은 칩으로 고름
    const list = el("div", "rm-list");

    // 힌트: − 노힌트 +
    let hints = Number.isInteger(r.hintCount) ? r.hintCount : 0;
    const hintVal = el("b", "rm-step-v");
    hintVal.setAttribute("aria-live", "polite");
    const minus = stepBtn("−", "힌트 하나 빼기", function () { hints = Math.max(0, hints - 1); paintHint(); });
    const plus = stepBtn("+", "힌트 하나 더", function () { hints = Math.min(99, hints + 1); paintHint(); });
    function paintHint() {
      hintVal.textContent = hints === 0 ? "노힌트" : hints + "개";
      minus.disabled = hints === 0;
      plus.disabled = hints === 99;
    }
    paintHint();
    const step = el("div", "rm-step");
    step.setAttribute("role", "group");
    step.setAttribute("aria-label", "힌트 수");
    step.append(minus, hintVal, plus);
    list.append(listRow("힌트", null, step));

    // 인원: 테마의 최소~최대 인원을 칩으로 (B-2 에서 받아 옴). 이미 있는 값이 범위 밖이면 범위를 넓혀서 지킴
    let people = r.playerCount ?? ctx.playerCount ?? null;
    const chips = el("div", "rm-people");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "플레이 인원");
    const peopleSub = el("small", null, "");
    function paintPeople(lo, hi) {
      if (people !== null) { lo = Math.min(lo, people); hi = Math.max(hi, people); }
      chips.textContent = "";
      for (let n = lo; n <= hi; n++) {
        const b = el("button", "rm-pp" + (n === people ? " on" : ""), n + "인");
        b.type = "button";
        b.setAttribute("aria-pressed", String(n === people));
        b.addEventListener("click", function () { people = n; paintPeople(lo, hi); });
        chips.append(b);
      }
    }
    paintPeople(2, 4);   // 테마 정보를 받기 전 잠깐
    loadPeopleRange(t.themeId).then(function (range) {
      if (!range) { paintPeople(1, 8); return; }   // 못 받으면 1~8
      peopleSub.textContent = "이 테마 " + (range.lo === range.hi ? range.lo : range.lo + "~" + range.hi) + "인";
      if (people === null && range.lo <= 2 && range.hi >= 2) people = 2;   // 처음 값: 2인 (가능하면)
      paintPeople(range.lo, range.hi);
    });
    list.append(listRow("인원", peopleSub, chips));

    // 플레이한 날 (처음 값은 오늘)
    const date = el("input", "rm-date");
    date.type = "date";
    date.max = UI.today();
    date.value = r.playedDate || ctx.playedDate || UI.today();
    date.setAttribute("aria-label", "플레이한 날");
    list.append(listRow("플레이한 날", null, date));
    form.append(list);

    // 한 줄 후기 (선택)
    const ta = el("textarea", "rm-text");
    ta.rows = TEXT_ROWS_MIN;   // 열린 뒤 fitText 가 남는 높이만큼 키움
    ta.maxLength = CONTENT_MAX;
    ta.value = r.content || "";
    const count = el("div", "rm-count muted small");
    function paintCount() { count.textContent = ta.value.length + " / " + CONTENT_MAX; }
    ta.addEventListener("input", paintCount);
    paintCount();
    const cBox = field(form, "한 줄 후기");
    cBox.append(ta, count);

    const msg = el("p", "rm-msg");
    msg.setAttribute("role", "alert");
    const btns = el("div", "rm-btns");
    const cancel = el("button", "btn btn-dim", "취소");
    cancel.type = "button";
    cancel.addEventListener("click", function () { dlg.close(); });
    const save = el("button", "btn btn-light", isEdit ? "후기 수정" : "후기 남기기");
    save.type = "submit";
    btns.append(cancel, save);
    form.append(msg, btns);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      msg.textContent = "";
      const escaped = ok.input.checked;
      const body = {
        rating: rating,
        escaped: escaped,
        hintCount: hints,
        playerCount: people,
        remainMinutes: escaped ? toInt(min.value) : 0,
        remainSeconds: escaped ? toInt(sec.value) : 0,
        playedDate: date.value || null,
        content: ta.value.trim() || null,
      };
      const problem = check(body, t.playMinutes);
      if (problem) { msg.textContent = problem; fitText(ta); return; }

      save.disabled = true;
      try {
        const res = isEdit
          ? await api.put("/api/reviews/" + r.reviewId, body)
          : await api.post("/api/reviews", Object.assign({ themeId: t.themeId }, body));
        UI.toast(isEdit ? "후기를 수정했어요" : "후기를 남겼어요");
        finish(ctx.mode, { reviewId: res.reviewId, themeId: t.themeId });
      } catch (err) {
        msg.textContent = err.status === 409
          ? "이 테마에는 이미 후기를 남겼어요. 마이페이지 내 기록에서 고칠 수 있어요."
          : err.message;
        fitText(ta);
      } finally {
        save.disabled = false;
      }
    });

    open(isEdit ? "후기 수정" : "후기 쓰기", form);
    fitText(ta);
    if (!rating) stars.firstChild.focus();
  }

  // 서버와 같은 검사 (서버도 다시 검사함. 여기서는 빨리 알려 주려고)
  function check(b, playMinutes) {
    if (!b.rating) return "별점을 골라 주세요.";
    if (!isInt(b.remainMinutes, 0, 999) || !isInt(b.remainSeconds, 0, 59)) return "남은 시간을 확인해 주세요. 초는 0~59입니다.";
    if (b.remainMinutes * 60 + b.remainSeconds > playMinutes * 60) return "남은 시간은 제한 시간(" + playMinutes + "분)보다 길 수 없습니다.";
    if (!isInt(b.hintCount, 0, 99)) return "힌트 수는 0~99입니다.";
    if (!isInt(b.playerCount, 1, 20)) return "플레이 인원을 골라 주세요.";
    if (b.playedDate && b.playedDate > UI.today()) return "플레이한 날은 오늘이거나 그 이전이어야 합니다.";
    return null;
  }

  // ---------------------------------------------------------------- 도우미

  function field(parent, label) {
    const f = el("div", "rm-field");
    f.append(el("div", "rm-label", label));
    parent.append(f);
    return f;
  }
  function radio(name, value, text) {
    const label = el("label", "rm-opt rm-opt-" + value);   // rm-opt-Y 성공 / rm-opt-N 실패
    const input = el("input");
    input.type = "radio";
    input.name = name + "-" + uid;
    input.value = value;
    label.append(input, el("span", null, text));
    return { label: label, input: input };
  }
  function numInput(lo, hi, value, aria) {
    const i = el("input", "rm-num");
    i.type = "number";
    i.min = String(lo);
    i.max = String(hi);
    i.step = "1";
    i.inputMode = "numeric";
    i.value = String(value);
    i.setAttribute("aria-label", aria);
    return i;
  }
  // 상자 안 한 줄: 왼쪽 이름(+ 작은 설명), 오른쪽 고르는 칸
  function listRow(text, sub, control) {
    const row = el("div", "rm-li");
    const k = el("span", "rm-li-k", text);
    if (sub) k.append(sub);
    row.append(k, control);
    return row;
  }
  function stepBtn(text, aria, onClick) {
    const b = el("button", "rm-step-b", text);
    b.type = "button";
    b.setAttribute("aria-label", aria);
    b.addEventListener("click", onClick);
    return b;
  }

  // 테마의 최소~최대 인원 (B-2). 못 받으면 null (비공개가 된 테마 등)
  async function loadPeopleRange(themeId) {
    try {
      const theme = await api.get("/api/themes/" + themeId);
      return { lo: theme.minPeople, hi: theme.maxPeople };
    } catch (e) {
      return null;
    }
  }
  function toInt(v) { return v === "" ? NaN : Number(v); }
  function isInt(n, lo, hi) { return Number.isInteger(n) && n >= lo && n <= hi; }
  function when(playAt) {
    const d = new Date(playAt);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
})();
