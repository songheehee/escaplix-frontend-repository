// S09 테마 상세 (pages/theme/theme.html?id=) · B 담당
//   B-2 상세 → B-3 시간표(평일 / 주말·공휴일 회차) → D-4 후기 → B-10 같은 매장의 다른 테마
//   후기 쓰기·수정 팝업은 D 담당(js/mypage/review-modal.js, theme.html 에서 불러옴) 의 window.openReviewModal.
//   저장 뒤 document 에 "review-saved" 이벤트를 쏘면 후기를 다시 불러온다. 후기 신고 버튼은 뺌
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Auth.me();
  const isUser = !!me && me.role === "USER";
  const themeId = Number(new URLSearchParams(location.search).get("id"));

  if (!themeId) { notFound("테마 번호가 없어요."); return; }
  load();

  async function load() {
    let t;
    try {
      t = await api.get("/api/themes/" + themeId);
    } catch (e) {
      notFound(e.status === 404 ? "공개되지 않았거나 없는 테마예요." : e.message);
      return;
    }
    document.title = t.title + " · Escaplix";
    renderHero(t);
    renderStoreInfo(t);
    $("d-body").hidden = false;
    renderIntro(t);   // 본문이 보인 뒤에 (더 보기가 필요한지 재야 해서)
    renderWeek(t);
    loadReviews(t);
    loadSameStore(t);
  }

  // ---------- 위쪽 큰 화면 ----------
  function renderHero(t) {
    UI.posterBg($("d-bg"), t);   // 포스터는 배경으로만 (따로 세운 포스터 카드는 뺌)

    const box = $("d-text");
    box.textContent = "";
    const genres = el("div", "d-genres");
    t.genres.forEach(function (g) { genres.append(el("span", "tag", g.name)); });   // 글자만 (누르는 링크 아님)
    box.append(genres);
    // 제목은 한 줄. 길면 글자를 줄여서 맞춤 (메인 배너와 같은 방식, detail.css .d-title)
    const title = el("h1", "d-title", t.title);
    title.title = t.title;
    title.style.setProperty("--len", UI.textWidth(t.title));
    box.append(title);

    // 별점 · 매장 (한 줄)
    const sub = el("div", "d-meta");
    const r = UI.rating(t.avgRating);
    sub.append(el("span", r ? "match" : "match none", r ? "★ " + r + " (" + t.reviewCount + ")" : "아직 후기 없음"));
    const store = el("a", "d-store", t.store.name + " ›");
    store.href = Routes.url("store", { id: t.store.storeId });
    sub.append(store);
    box.append(sub);

    // 고를 때 제일 많이 보는 것을 크게 (지역 · 난이도 · 시간 · 인원 · 가격)
    //   숫자는 크게, 단위는 작게. 칸 사이는 얇은 세로줄
    const stats = el("dl", "d-stats");
    function stat(label, nodes) {
      const cell = el("div", "ds-cell");
      cell.append(el("dt", null, label));
      const dd = el("dd");
      nodes.forEach(function (n) { dd.append(n); });
      cell.append(dd);
      stats.append(cell);
    }
    function big(text) { return el("b", "ds-num", text); }
    function unit(text) { return el("span", "ds-unit", text); }
    const LEVEL = ["", "아주 쉬움", "쉬움", "보통", "어려움", "아주 어려움"];
    // 화면에는 "4 / 5"만. "어려움" 같은 말은 화면 읽기 프로그램용으로만 (보이는 배지는 뺌)
    if (t.store.area) stat("지역", [big(t.store.area)]);   // 매장 세부 지역 (홍대·강남…)
    stat("난이도", [big(String(t.difficulty)), unit("/ 5"), el("span", "sr-only", ", " + (LEVEL[t.difficulty] || ""))]);
    stat("시간", [big(String(t.playMinutes)), unit("분")]);
    stat("인원", [big(t.minPeople === t.maxPeople ? String(t.minPeople) : t.minPeople + "~" + t.maxPeople), unit("명")]);
    // 인원별 가격은 매장마다 달라서 정확한 건 예약 페이지에서. 여기는 1인 기준
    stat("가격", [big(Number(t.price).toLocaleString("ko-KR")), unit("원 / 1인")]);
    box.append(stats);


    const btns = el("div", "d-btns");
    const booking = UI.safeUrl(t.bookingUrl);
    if (booking) {
      const b = el("a", "btn btn-light", "예약하러 가기 ↗");
      b.href = booking;
      b.target = "_blank";
      b.rel = "noopener noreferrer";
      btns.append(b);
    }
    // 파티 버튼은 하나: 모집 중인 파티가 있으면 목록으로, 없으면 바로 만들기
    if (!me || isUser) {
      const party = el("a", "btn btn-dim");
      if (t.recruitingPartyCount > 0) {
        party.textContent = "모집 중인 파티 " + t.recruitingPartyCount;
        party.href = Routes.url("partyList", { themeId: t.themeId });
      } else {
        party.textContent = "＋ 파티 만들기";
        party.href = Routes.url("partyForm", { themeId: t.themeId });
      }
      btns.append(party);
    }
    if (UI.canWish()) btns.append(UI.wishButton(t.themeId, t.wished, true));   // 동그란 ♡ (메인 배너와 같음)
    box.append(btns);
  }

  // ---------- 테마 소개 (본문 맨 위) ----------
  function renderIntro(t) {
    const img = UI.poster(t, "d-poster-img");   // 사진이 없으면 장르 색 칸
    if (img.tagName === "IMG") img.loading = "eager";   // 설명 칸 높이를 포스터에 맞춰 재야 해서 바로 불러옴
    $("d-poster").append(img);
    if (t.description) $("intro").append(longText(t.description));
    $("intro-sec").hidden = false;
  }

  // 소개글: 옆 포스터 높이까지만 보이고, 넘칠 때만 "더 보기"로 펼치기 (포스터보다 짧으면 버튼 없음)
  function longText(text) {
    const wrap = el("div", "d-desc-wrap");
    const p = el("p", "d-desc", text);
    p.id = "d-desc";
    wrap.append(p);
    // 화면에 붙고 포스터 사진까지 불러온 뒤에야 넘치는지 잴 수 있음 (포스터 높이가 사진마다 다름)
    const img = $("d-poster").querySelector("img");
    if (img && !img.complete) {
      img.addEventListener("load", measure, { once: true });
      img.addEventListener("error", function () { requestAnimationFrame(measure); }, { once: true });   // 장르 색 칸으로 바뀐 뒤
    } else requestAnimationFrame(measure);
    function measure() {
      const poster = $("d-poster");
      const lineH = parseFloat(getComputedStyle(p).lineHeight) || 27;
      // 포스터 아래 끝까지 남은 높이 (더 보기 버튼 한 줄 자리는 빼 둠). 줄 단위로 맞춰 글자가 반쯤 잘리지 않게
      //   가로로 납작한 사진이면 포스터가 낮아서, 그래도 네 줄은 보이게
      const room = Math.max(poster.getBoundingClientRect().bottom - p.getBoundingClientRect().top - 30, lineH * 4);
      if (p.scrollHeight <= room + lineH) return;   // 다 들어감 (한 줄 넘치는 정도는 그냥 보여 줌)
      const lines = Math.floor(room / lineH);
      p.style.maxHeight = lines * lineH + "px";
      p.classList.add("cut");
      const more = el("button", "d-more", "더 보기");
      more.type = "button";
      more.setAttribute("aria-controls", "d-desc");
      more.setAttribute("aria-expanded", "false");
      more.addEventListener("click", function () {
        const open = p.classList.toggle("cut") === false;
        p.style.maxHeight = open ? "" : lines * lineH + "px";
        more.textContent = open ? "접기" : "더 보기";
        more.setAttribute("aria-expanded", String(open));
        // 접으면 글이 확 줄어 화면이 아래(시간표 쪽)로 가 있음 → 테마 소개 위가 화면 밖(또는 헤더 밑)이면 그쪽으로 돌아감
        if (!open) {
          const sec = $("intro-sec");
          if (sec.getBoundingClientRect().top < 80) sec.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      });
      wrap.append(more);
    }
    return wrap;
  }

  // ---------- 매장 정보 (맨 아래 매장 카드) ----------
  //   B-2 의 store(이름·지역·주소·전화)로 먼저 그리고, B-10 매장 상세가 오면 사진·영업시간을 채움
  function renderStoreInfo(t, detail) {
    const s = t.store;
    const box = $("store-card");
    box.textContent = "";
    // 카드 전체가 매장 페이지 링크 (안에는 다른 링크를 두지 않음)
    const card = el("a", "sinfo");
    card.href = Routes.url("store", { id: s.storeId });
    card.setAttribute("aria-label", s.name + " 매장 보기");

    const photo = el("div", "sinfo-photo");
    UI.posterBg(photo, detail && detail.photoUrl ? { posterUrl: detail.photoUrl, genres: t.genres } : t);
    card.append(photo);

    const body = el("div", "sinfo-body");
    const head = el("div", "sinfo-head");
    const name = el("span", "sinfo-name", s.name);
    head.append(name, el("span", "sinfo-area", s.area));
    body.append(head);

    const list = el("ul", "sinfo-list");
    // 주소 · 전화 · 영업시간: 줄마다 아이콘 (세 줄 모두 있어야 칸이 맞음)
    function line(icon, label, text) {
      const li = el("li");
      const ic = el("span", "si-icon si-" + icon);   // 선 아이콘 (CSS 마스크, detail.css)
      ic.setAttribute("aria-hidden", "true");
      li.append(ic, el("span", null, text));
      li.setAttribute("aria-label", label + " " + text);
      list.append(li);
    }
    if (s.address) line("pin", "주소", s.address);
    if (s.phone) line("phone", "전화", s.phone);
    if (detail && detail.hours) line("clock", "영업시간", detail.hours);
    body.append(list);
    card.append(body, el("span", "sinfo-arrow", "›"));
    box.append(card);
  }

  // ---------- 시간표 (B-3) ----------
  //   평일 / 주말·공휴일 회차만 보여 줌. 예약이 찼는지는 알 수 없어서 날짜를 고르게 하지 않음
  //   공개 API 는 날짜별(B-3)이라, 다음 평일 하루·다음 토요일 하루의 시간표를 불러와 씀
  //   (평일이 공휴일이면 주말 시간표가 오니 그날은 건너뛰고 다음 평일로)
  async function renderWeek(t) {
    const box = $("week-slots");
    box.textContent = "";
    box.append(el("div", "sk ws-sk"));
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    function dayAt(n) { const d = new Date(base); d.setDate(base.getDate() + n); return d; }
    function get(d) { return api.get("/api/themes/" + t.themeId + "/slots", { date: UI.ymd(d) }); }

    let weekday = null;
    let weekend = null;
    try {
      // 내일부터 (오늘은 지난 회차가 빠져서). 토요일은 늘 주말 시간표
      let sat = 1;
      while (dayAt(sat).getDay() !== 6) sat++;
      const satReq = get(dayAt(sat));
      for (let i = 1; i <= 14 && !weekday; i++) {
        const day = dayAt(i).getDay();
        if (day === 0 || day === 6) continue;
        const r = await get(dayAt(i));
        if (r.dayType === "WEEKDAY") weekday = r.slots;
      }
      weekend = (await satReq).slots;
    } catch (e) {
      box.textContent = "";
      box.append(el("p", "muted", e.message));
      return;
    }

    box.textContent = "";
    if (!(weekday || []).length && !weekend.length) {
      box.append(el("p", "muted", "아직 시간표가 없어요."));
      return;
    }
    [["평일", weekday || []], ["주말·공휴일", weekend]].forEach(function (row) {
      const line = el("div", "ws-row");
      line.append(el("div", "ws-label", row[0]));
      const slots = el("div", "slots");
      if (!row[1].length) slots.append(el("p", "muted", "회차 없음"));
      row[1].forEach(function (s) {
        const n = el("span", "slot");
        n.append(el("b", null, s.startTime), el("small", null, "~ " + s.endTime));
        n.setAttribute("aria-label", row[0] + " " + s.startTime + " ~ " + s.endTime);
        slots.append(n);
      });
      line.append(slots);
      box.append(line);
    });
  }

  // ---------- 후기 (D-4) ----------
  let reviewTheme = null;   // 내 후기 카드의 [수정] 이 팝업에 넘길 테마 정보
  function canEditReview() { return isUser && typeof window.openReviewModal === "function"; }

  async function loadReviews(t) {
    reviewTheme = t;
    const sum = $("review-summary");
    const list = $("reviews");
    const writeBtn = $("write-review");

    // 후기 쓰기 버튼은 후기를 받은 뒤 정함 (이미 썼으면 숨기고, 내 후기 카드의 [수정] 으로)
    writeBtn.hidden = true;

    let res;
    try {
      res = await api.get("/api/themes/" + t.themeId + "/reviews");
    } catch (e) {
      sum.textContent = "";
      list.textContent = "";
      list.append(el("p", "muted", e.message));
      return;
    }

    sum.textContent = "";
    list.textContent = "";
    $("review-pager").hidden = true;
    const r = UI.rating(res.avgRating);
    const big = el("div", "rs-score", r || "-");
    const right = el("div");
    right.append(avgStars(res.avgRating || 0));
    right.append(el("div", "muted small", "후기 " + res.reviewCount + "개"));
    const mine = res.reviews.find(function (x) { return x.mine; });
    // 손님만, 아직 안 썼을 때만 "후기 쓰기" (팝업은 D 의 review-modal.js)
    //   테마당 후기는 한 사람 하나라서, 이미 썼으면 맨 위 내 후기 카드의 [수정] 으로 고침
    if (canEditReview() && !mine) {
      writeBtn.hidden = false;
      writeBtn.onclick = function () {
        window.openReviewModal({ themeId: t.themeId, title: t.title, storeName: t.store.name, playMinutes: t.playMinutes });
      };
    }
    if (res.reviews.length) {
      const escaped = res.reviews.filter(function (x) { return x.escaped; }).length;
      right.append(el("div", "small", "탈출 성공률 " + Math.round(escaped / res.reviews.length * 100) + "%"));
    }
    sum.append(big, right);

    if (!res.reviews.length) {
      list.append(el("p", "muted", isUser || !me ? "아직 후기가 없어요. 첫 후기를 남겨 주세요!" : "아직 후기가 없어요."));   // 사장·관리자는 후기를 못 써서
      return;
    }
    // 내 후기를 맨 앞에, 나머지는 받은 순서(최신순) 그대로
    const ordered = mine ? [mine].concat(res.reviews.filter(function (x) { return x !== mine; })) : res.reviews;
    showReviewPage(ordered, res.playMinutes, 1, false);
  }

  // 후기 페이지 나누기 (한 쪽에 5개). D-4 가 후기를 한 번에 다 주므로 화면에서 나눠 보여 줌
  const REVIEWS_PER_PAGE = 5;
  function showReviewPage(reviews, playMinutes, page, scroll) {
    const list = $("reviews");
    const pager = $("review-pager");
    const pages = Math.ceil(reviews.length / REVIEWS_PER_PAGE);
    page = Math.min(Math.max(page, 1), pages);

    list.textContent = "";
    reviews.slice((page - 1) * REVIEWS_PER_PAGE, page * REVIEWS_PER_PAGE)
      .forEach(function (v) { list.append(reviewCard(v, playMinutes)); });

    pager.textContent = "";
    pager.hidden = pages < 2;
    if (pages >= 2) {
      function btn(label, target, opts) {
        const b = el("button", "pg" + (opts.cls ? " " + opts.cls : ""), label);
        b.type = "button";
        if (opts.aria) b.setAttribute("aria-label", opts.aria);
        if (opts.current) b.setAttribute("aria-current", "page");
        b.disabled = !!opts.disabled;
        b.addEventListener("click", function () { showReviewPage(reviews, playMinutes, target, true); });
        pager.append(b);
      }
      btn("‹", page - 1, { cls: "pg-arrow", aria: "이전 쪽", disabled: page === 1 });
      for (let p = 1; p <= pages; p++) btn(String(p), p, { current: p === page, aria: p + "쪽" });
      btn("›", page + 1, { cls: "pg-arrow", aria: "다음 쪽", disabled: page === pages });
    }
    // 쪽을 넘기면 후기 칸 처음으로
    if (scroll) $("review-h").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function reviewCard(v, playMinutes) {
    const c = el("article", "review");
    const head = el("div", "rv-head");
    const who = el("div", "rv-who");
    who.append(el("span", "avatar small", (v.nickname || "?").slice(0, 1)));
    who.append(el("b", null, v.nickname));
    if (v.mine) who.append(el("span", "tag", "내 후기"));
    who.append(el("span", "rv-date", v.playedDate));   // 플레이한 날 (이름 옆 작게)
    head.append(who);
    // 내 후기: 이름 줄 오른쪽에 [수정] (D-2 팝업에 이 한 줄 + 테마 정보를 넘김)
    if (v.mine && canEditReview() && reviewTheme) {
      const t = reviewTheme;
      const edit = el("button", "btn btn-line small rv-edit", "수정");
      edit.type = "button";
      edit.setAttribute("aria-label", "내 후기 수정");
      edit.addEventListener("click", function () {
        window.openReviewModal({ review: Object.assign({}, v, {
          themeId: t.themeId, themeTitle: t.title, storeName: t.store.name, playMinutes: t.playMinutes,
        }) });
      });
      head.append(edit);
    }
    c.append(head);

    // 결과 칩: [탈출 성공] [2분 3초] [노힌트] [2인]. 색은 성공·실패 칩만
    const facts = el("div", "rv-facts");
    facts.append(fact(v.escaped ? "탈출 성공" : "탈출 실패", v.escaped ? "is-good" : "is-bad"));
    if (v.escaped) {
      // 남은 시간은 분(remainMinutes)·초(remainSeconds 0~59) 두 칸으로 옴 (D-4)
      const remain = fact(remainText(v.remainMinutes, v.remainSeconds), "");
      remain.setAttribute("aria-label", "남은 시간 " + remainText(v.remainMinutes, v.remainSeconds));
      facts.append(remain);
    }
    facts.append(fact(v.hintCount === 0 ? "노힌트" : "힌트 " + v.hintCount + "개", ""));
    facts.append(fact(v.playerCount + "인", ""));
    c.append(facts);

    // 별점은 칩 아래 한 줄, 그 아래 후기 글
    const starLine = el("span", "rv-stars", stars(v.rating));
    starLine.setAttribute("aria-label", "별점 " + v.rating + "점");
    c.append(starLine);
    if (v.content) c.append(el("p", "rv-text", v.content));
    return c;
  }

  // 평균 별점: 3.6 이면 별 3개 + 네 번째 별 60% 만 금색 (별마다 왼쪽부터 채우는 그라데이션)
  function avgStars(avg) {
    const box = el("div", "rs-stars");
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", "평균 별점 " + (UI.rating(avg) || 0) + "점");
    for (let i = 0; i < 5; i++) {
      const fill = Math.max(0, Math.min(1, avg - i));   // 이 별을 얼마나 채울지 0~1
      const s = el("span", "rs-star", "★");
      s.style.setProperty("--fill", Math.round(fill * 100) + "%");
      s.setAttribute("aria-hidden", "true");
      box.append(s);
    }
    return box;
  }

  function stars(n) {
    const full = Math.round(Number(n) || 0);
    return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
  }
  // 후기 결과 칩 한 개
  function fact(text, cls) { return el("span", "rv-fact" + (cls ? " " + cls : ""), text); }
  // 남은 시간: 2분 3초 / 12분 / 35초
  function remainText(min, sec) {
    min = min || 0; sec = sec || 0;
    if (min && sec) return min + "분 " + sec + "초";
    if (min) return min + "분";
    return sec + "초";
  }

  // 후기 팝업(D)이 저장을 마치면 다시 불러오기
  document.addEventListener("review-saved", function () {
    api.get("/api/themes/" + themeId).then(loadReviews).catch(function () { /* 무시 */ });
  });

  // ---------- 같은 매장의 다른 테마 (B-10) ----------
  async function loadSameStore(t) {
    try {
      const s = await api.get("/api/stores/" + t.store.storeId);
      renderStoreInfo(t, s);   // 매장 사진·영업시간 채우기
      const others = s.themes.filter(function (x) { return x.themeId !== t.themeId; })
        .map(function (x) { return Object.assign({ storeName: s.name, area: s.area }, x); });
      if (!others.length) return;
      $("more-rows").append(UI.row(s.name + "의 다른 테마", null, others, UI.themeCard));
    } catch (e) { /* 줄 하나 없는 것뿐이라 조용히 넘어감 */ }
  }

  function notFound(msg) {
    $("d-hero").hidden = true;
    const page = el("main", "page");
    page.append(UI.emptyBox(msg, "다른 테마 둘러보기", Routes.url("home")));
    $("d-body").replaceWith(page);
  }
})();
