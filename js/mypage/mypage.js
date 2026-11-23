// S18 마이페이지 내 기록 · D 담당
//   화면 두 개를 주소 ?view= 로 고른다 (mypage.html 하나로, routes.js 는 그대로)
//     (없음)   요약: 통계(탈출·노힌트·평균 남은 시간·전국 제패율, 전국 제패율 카드를 누르면 지역별 제패율 펼침) · 플레이 캘린더 · 플레이 후기 3개
//     reviews  전체 후기: 정렬·검색, 20개씩 더보기
//   API: D-10 /api/my/stats, D-5 /api/my/reviews, D-3 삭제. 쓰기·수정 팝업은 review-modal.js
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Auth.me();

  if (!me) { Auth.goLogin(); return; }
  if (me.role !== "USER") { location.replace(Routes.url("home")); return; }

  const RECENT_SIZE = 3;    // 요약 화면 플레이 후기 수 (최근 것부터)
  const PAGE_SIZE = 20;     // 전체 후기 한 번에 보이는 수
  const DIAL_MINUTES = 60;   // 평균 남은 시간 다이얼 한 바퀴 (분)

  const VIEWS = { home: "내 기록", reviews: "전체 후기" };   // 예전 ?view=stats 주소는 요약으로
  const askedView = new URLSearchParams(location.search).get("view");
  const view = VIEWS[askedView] ? askedView : "home";

  let reviewRows = [];       // D-5 내 후기 전부 (최근 플레이순)
  let viewMonth = firstOfMonth(new Date());
  let shownCount = PAGE_SIZE;
  let sortKey = "new";       // 전체 후기 정렬: new 최신순 · old 오래된순 · rating 별점순
  let detail = null;         // 열려 있는 상세: { date } 또는 { reviewId }
  let regionOpen = false;    // 지역별 제패율 펼침 (다시 불러와도 유지)

  // ---------- 화면 고르기 ----------
  $("m-title").textContent = me.nickname + " 님의 마이페이지";
  document.title = VIEWS[view] + " · Escaplix";
  $("view-" + view).hidden = false;
  $("link-reviews").href = Routes.url("mypage", { view: "reviews" });
  $("back-reviews").href = Routes.url("mypage");

  // ---------- 이벤트 ----------
  $("month-prev").addEventListener("click", function () { moveMonth(-1); });
  $("month-next").addEventListener("click", function () { moveMonth(1); });
  $("write-home").addEventListener("click", function () { window.openReviewModal(); });
  $("write-reviews").addEventListener("click", function () { window.openReviewModal(); });

  // ---------- 정렬 드롭다운 (브라우저 기본 선택칸 대신 직접 만든 것) ----------
  //   버튼을 누르면 목록이 열림. 마우스로 고르거나 ↑↓ 로 옮기고 Enter, Esc 로 닫기. 바깥을 누르면 닫힘
  (function sortMenu() {
    const btn = $("rv-sort-btn");
    const menu = $("rv-sort-menu");
    const options = Array.prototype.slice.call(menu.querySelectorAll("[role=option]"));

    function paint() {
      options.forEach(function (o) {
        const on = o.dataset.v === sortKey;
        o.setAttribute("aria-selected", String(on));
        if (on) $("rv-sort-label").textContent = o.textContent;
      });
    }
    function open() {
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      const cur = options.find(function (o) { return o.dataset.v === sortKey; }) || options[0];
      cur.focus();
      document.addEventListener("pointerdown", outside);
    }
    function close(refocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outside);
      if (refocus) btn.focus();
    }
    function outside(e) { if (!$("rv-sort").contains(e.target)) close(false); }
    function pick(o) {
      close(true);
      if (o.dataset.v === sortKey) return;
      sortKey = o.dataset.v;
      paint();
      resetAndRenderAll();
    }

    btn.addEventListener("click", function () { menu.hidden ? open() : close(true); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
    });
    options.forEach(function (o, i) {
      o.tabIndex = -1;
      o.addEventListener("click", function () { pick(o); });
      o.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); options[Math.min(i + 1, options.length - 1)].focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); options[Math.max(i - 1, 0)].focus(); }
        else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(o); }
        else if (e.key === "Escape") { e.preventDefault(); close(true); }
        else if (e.key === "Tab") { close(false); }
      });
    });
    paint();
  })();

  let searchTimer = null;
  $("rv-q").addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(resetAndRenderAll, 200);
  });
  $("all-more").addEventListener("click", function () {
    shownCount += PAGE_SIZE;
    renderAllReviews();
  });

  const dialog = $("review-detail-dialog");
  $("review-detail-close").addEventListener("click", function () { dialog.close(); });
  // 바깥을 누르면 닫기. 누르기 시작한 곳도 바깥이어야 함 (후기 글을 끌어 고르다 바깥에서 놓으면 닫히던 문제)
  let downOnBackdrop = false;
  dialog.addEventListener("pointerdown", function (e) { downOnBackdrop = e.target === dialog; });
  dialog.addEventListener("click", function (e) {
    if (downOnBackdrop && e.target === dialog) dialog.close();
    downOnBackdrop = false;
  });
  dialog.addEventListener("close", function () { detail = null; });

  document.addEventListener("review-saved", function () { loadAll(); });
  window.addEventListener("pageshow", function (e) { if (e.persisted) loadAll(); });

  loadAll();

  function loadAll() {
    if (view === "home") loadStats();
    loadReviews();
  }

  // ======================================================== D-10 통계

  async function loadStats() {
    const box = $("sum-stats");
    box.textContent = "";
    box.append(el("div", "sk rate-sk"));
    let s;
    try {
      s = await api.get("/api/my/stats");
    } catch (e) {
      box.textContent = "";
      box.append(UI.emptyBox(e.message));
      $("region-grid").textContent = "";
      $("region-panel").hidden = true;
      return;
    }

    box.textContent = "";
    box.append(
      rateCard("탈출 성공률", s.escapeRate, s.escapeCount, s.playCount, "회", "escape"),
      rateCard("노힌트 성공률", s.noHintRate, s.noHintCount, s.playCount, "회", "nohint"),
      remainCard(s),
      conquerCard(s)
    );
    renderRegions(s.byRegion || []);
    $("region-panel").hidden = !regionOpen;
  }

  // 전국 제패율: 누르면 아래에 지역별 제패율이 펼쳐지는 카드
  function conquerCard(s) {
    const card = rateCard("전국 제패율", s.conquerRate, s.conquerCount, s.themeCount, "테마", "conquer", "button");
    card.type = "button";
    card.classList.add("is-toggle");
    card.setAttribute("aria-controls", "region-panel");
    const hint = el("span", "rate-toggle");
    card.append(hint);
    function paint() {
      card.setAttribute("aria-expanded", String(regionOpen));
      card.classList.toggle("is-open", regionOpen);
      hint.textContent = regionOpen ? "지역별 ▴" : "지역별 ▾";
    }
    card.addEventListener("click", function () {
      regionOpen = !regionOpen;
      $("region-panel").hidden = !regionOpen;
      paint();
    });
    paint();
    return card;
  }

  // 평균 남은 시간: 탈출 성공한 판만 평균 (실패는 빠짐)
  //   타이머 다이얼: 한 바퀴 = 60분. 채워진 만큼 = 평균 남은 분 (9분이면 9/60). 60분이 넘으면 가득
  //   가운데 = 평균 남은 시간 (09:10 처럼 두 자리)
  function remainCard(s) {
    const label = "평균 남은 시간";
    if (s.avgRemainSeconds === null || s.avgRemainSeconds === undefined) {
      return ringCard(label, 0, "-", "탈출 기록 없음", "remain", null, label + ", 탈출 기록 없음");
    }
    const sub = "탈출 성공 기준";
    const sec = Math.max(0, Math.round(s.avgRemainSeconds));
    const center = pad(Math.floor(sec / 60)) + ":" + pad(sec % 60);   // 09:05 처럼 두 자리
    const fill = Math.min(1, sec / (DIAL_MINUTES * 60)) * 100;
    return ringCard(label, fill, center, sub, "remain", null,
      label + " " + Math.floor(sec / 60) + "분 " + (sec % 60) + "초, " + sub);
  }

  // 비율 카드: 가운데 %, 아래 이름 · "해낸 수 / 전체 수 + 단위" (3 / 7테마)
  function rateCard(label, rate, part, whole, unit, kind, tag) {
    const sub = part + " / " + whole + unit;
    const p = clampRate(rate);
    return ringCard(label, p, p + "%", sub, kind, tag, label + " " + p + "%, " + sub);
  }

  // 동그라미 카드 틀: fill(0~100) 만큼 동그라미를 채우고 가운데에 center 글자
  //   tag: 보통 "div", 누를 수 있는 카드는 "button" (그래서 안쪽은 모두 span·b)
  function ringCard(label, fill, center, sub, kind, tag, aria) {
    const card = el(tag || "div", "rate-card rate-" + kind);
    const ring = el("span", "rate-ring");
    ring.style.setProperty("--p", clampRate(fill));
    ring.setAttribute("role", "img");
    ring.setAttribute("aria-label", aria);
    ring.append(el("span", "rate-value", center));
    card.append(ring, el("b", "rate-label", label), el("span", "rate-sub", sub));
    return card;
  }

  function renderRegions(regions) {
    const grid = $("region-grid");
    grid.textContent = "";
    if (!regions.length) {
      grid.append(UI.emptyBox("지역 정보가 없어요."));
      return;
    }
    regions.forEach(function (r) {
      const li = el("li", "region-card" + (r.themeCount === 0 ? " is-empty" : "") +
        (r.themeCount > 0 && r.playedCount >= r.themeCount ? " is-done" : ""));
      const head = el("div", "region-top");
      head.append(el("b", "region-name", r.name));
      head.append(el("span", "region-rate", r.themeCount ? clampRate(r.rate) + "%" : "-"));
      li.append(head);

      const track = el("span", "region-track");
      track.setAttribute("role", "img");
      track.setAttribute("aria-label", r.name + " " + r.themeCount + "개 테마 중 " + r.playedCount + "개 플레이");
      const fill = el("span", "region-fill");
      fill.style.width = clampRate(r.rate) + "%";
      track.append(fill);
      li.append(track);

      li.append(el("span", "region-count", r.themeCount
        ? r.playedCount + " / " + r.themeCount
        : "아직 공개된 테마가 없어요"));
      grid.append(li);
    });
  }

  function clampRate(n) { return Math.max(0, Math.min(100, Math.round(Number(n) || 0))); }

  // ======================================================== D-5 내 후기

  async function loadReviews() {
    const target = view === "home" ? $("recent-list") : $("all-list");
    if (view === "home") {
      $("calendar-grid").textContent = "";
      $("calendar-grid").append(el("div", "sk calendar-sk"));
    }
    target.textContent = "";
    target.append(el("li", "sk rv-sk"));

    try {
      reviewRows = await api.get("/api/my/reviews");
    } catch (e) {
      reviewRows = [];
      target.textContent = "";
      target.append(UI.emptyBox(e.message));
      if (view === "home") $("calendar-grid").textContent = "";
      if (dialog.open) dialog.close();
      return;
    }

    $("m-tab").textContent = "내 기록 (" + reviewRows.length + ")";
    if (view === "home") {
      $("link-reviews").textContent = "전체 보기 (" + reviewRows.length + ") →";
      renderCalendar();
      renderRecent();
    } else {
      renderAllReviews();
    }
    refreshDetail();
  }

  // ---------- 요약: 플레이 후기 (최근 5개) ----------
  function renderRecent() {
    const list = $("recent-list");
    list.textContent = "";
    if (!reviewRows.length) {
      list.append(emptyItem("아직 남긴 후기가 없어요. 다녀온 테마의 후기를 남겨 보세요."));
      return;
    }
    reviewRows.slice(0, RECENT_SIZE).forEach(function (r) { list.append(reviewRow(r)); });
  }

  // ---------- 전체 후기: 거르기 · 정렬 · 20개씩 ----------
  function resetAndRenderAll() {
    shownCount = PAGE_SIZE;
    renderAllReviews();
  }

  function renderAllReviews() {
    const list = $("all-list");
    const more = $("all-more");
    list.textContent = "";

    const q = $("rv-q").value.trim().toLowerCase();
    const sort = sortKey;
    const rows = reviewRows.filter(function (r) {
      if (!q) return true;
      return (r.themeTitle || "").toLowerCase().indexOf(q) >= 0 ||
        (r.storeName || "").toLowerCase().indexOf(q) >= 0;
    });
    if (sort === "old") rows.reverse();   // 서버가 최근 플레이순으로 줌
    if (sort === "rating") {
      rows.sort(function (a, b) { return b.rating - a.rating || compareDate(b, a); });
    }

    if (!rows.length) {
      list.append(emptyItem(reviewRows.length ? "조건에 맞는 후기가 없어요." : "아직 남긴 후기가 없어요."));
      more.hidden = true;
      return;
    }
    rows.slice(0, shownCount).forEach(function (r) { list.append(reviewRow(r)); });
    more.hidden = rows.length <= shownCount;
    more.textContent = "더보기 (" + Math.min(shownCount, rows.length) + " / " + rows.length + ")";
  }

  function compareDate(a, b) {
    return String(a.playedDate).localeCompare(String(b.playedDate)) || a.reviewId - b.reviewId;
  }

  // 후기 한 줄: 작은 포스터 · 테마·매장 · 날짜·결과 · 별점. 누르면 상세
  function reviewRow(r) {
    const li = el("li");
    const row = el("button", "rv-row" + (r.status === "HIDDEN" ? " is-hidden" : ""));
    row.type = "button";
    row.setAttribute("aria-label", r.themeTitle + " 후기 자세히 보기");
    row.addEventListener("click", function () { openReview(r.reviewId); });

    const thumb = el("span", "rv-thumb");
    thumb.append(UI.poster(themeFromReview(r), "rv-thumb-img"));
    row.append(thumb);

    const info = el("span", "rv-info");
    const title = el("span", "rv-title");
    title.append(el("b", null, r.themeTitle));
    if (r.status === "HIDDEN") title.append(el("span", "tag rv-hidden-tag", "숨김"));
    info.append(title);
    info.append(el("span", "rv-sub", r.storeName));
    info.append(el("span", "rv-sub", shortDate(r.playedDate)));
    row.append(info);

    row.append(el("span", "rv-stars", stars(r.rating)));
    li.append(row);
    return li;
  }

  function emptyItem(msg) {
    const li = el("li");
    li.append(UI.emptyBox(msg));
    return li;
  }

  // ======================================================== 플레이 캘린더

  function moveMonth(amount) {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + amount, 1);
    renderCalendar();
  }

  function renderCalendar() {
    const grid = $("calendar-grid");
    grid.textContent = "";
    $("calendar-month").textContent = viewMonth.getFullYear() + "년 " + (viewMonth.getMonth() + 1) + "월";

    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const byDate = groupByDate();

    for (let i = 0; i < cellCount; i++) {
      const dayNumber = i - firstWeekday + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) {
        const blank = el("div", "calendar-blank");
        blank.setAttribute("aria-hidden", "true");
        grid.append(blank);
        continue;
      }

      const dateKey = year + "-" + pad(month + 1) + "-" + pad(dayNumber);
      const dayReviews = byDate.get(dateKey) || [];
      const day = el(dayReviews.length ? "button" : "div",
        "calendar-day" + (dateKey === UI.today() ? " is-today" : "") + (dayReviews.length ? " has-play" : ""));
      day.append(el("span", "calendar-day-number", String(dayNumber)));

      if (dayReviews.length) {
        day.type = "button";
        day.setAttribute("aria-label", dateLabel(dateKey) + ", 테마 " + dayReviews.length + "개 플레이 기록 보기");
        day.addEventListener("click", function () { openDay(dateKey); });
        const posters = el("span", "calendar-posters count-" + Math.min(dayReviews.length, 4));
        dayReviews.slice(0, 4).forEach(function (r, index) {
          const poster = el("span", "calendar-poster");
          poster.append(UI.poster(themeFromReview(r), "calendar-poster-image"));
          if (index === 3 && dayReviews.length > 4) {
            poster.append(el("span", "calendar-more", "+" + (dayReviews.length - 4)));
          }
          posters.append(poster);
        });
        day.append(posters);
      }
      grid.append(day);
    }
  }

  function groupByDate() {
    const byDate = new Map();
    reviewRows.forEach(function (r) {
      if (!r.playedDate) return;
      if (!byDate.has(r.playedDate)) byDate.set(r.playedDate, []);
      byDate.get(r.playedDate).push(r);
    });
    return byDate;
  }

  // ======================================================== 후기 상세 팝업

  function openDay(dateKey) {
    detail = { date: dateKey };
    refreshDetail();
  }

  function openReview(reviewId) {
    detail = { reviewId: reviewId };
    refreshDetail();
  }

  // 다시 불러온 뒤에도 같은 상세를 다시 그림 (고치기·지우기 후). 보여 줄 게 없으면 닫음
  function refreshDetail() {
    if (!detail) return;
    let rows;
    let title;
    let summary = "";
    if (detail.date) {
      rows = reviewRows.filter(function (r) { return r.playedDate === detail.date; });
      title = dateLabel(detail.date);
      summary = "테마 " + rows.length + "개를 플레이했어요.";
    } else {
      rows = reviewRows.filter(function (r) { return r.reviewId === detail.reviewId; });
      title = rows.length ? dateLabel(rows[0].playedDate) + " 플레이" : "";
    }
    if (!rows.length) {
      if (dialog.open) dialog.close();
      return;
    }

    $("review-detail-title").textContent = title;
    $("review-detail-summary").textContent = summary;
    $("review-detail-summary").hidden = !summary;
    const list = $("calendar-day-list");
    list.textContent = "";
    rows.forEach(function (r) { list.append(reviewCard(r)); });
    // 캘린더 날짜로 열면 작은 크기(75%), 후기 줄로 열면 원래 크기
    dialog.classList.toggle("is-full", !detail.date);
    if (!dialog.open) dialog.showModal();
  }

  // 상세 카드: 포스터 | 테마명(크게) · 매장·지역 · 결과 칩 / 별점 · 후기 / 고치기·지우기
  function reviewCard(r) {
    const theme = themeFromReview(r);
    const card = el("article", "rd-card" + (r.status === "HIDDEN" ? " is-hidden" : ""));
    const poster = el("a", "rd-poster");
    poster.href = Routes.url("theme", { id: r.themeId });
    poster.setAttribute("aria-label", r.themeTitle + " 테마 보기");
    poster.append(UI.poster(theme, "rd-poster-img"));
    card.append(poster);

    const info = el("div", "rd-info");
    const title = el("a", "rd-title", r.themeTitle);
    title.href = Routes.url("theme", { id: r.themeId });
    info.append(title);
    info.append(el("p", "rd-place", r.storeName));

    // 탈출 여부 · 남은 시간(성공일 때만) · 힌트 · 인원
    const facts = el("div", "rd-facts");
    facts.append(fact(r.escaped ? "탈출 성공" : "탈출 실패", r.escaped ? "is-good" : "is-bad"));
    if (r.escaped) {
      const remain = fact("⏱️ " + mmss(r.remainMinutes, r.remainSeconds), "");
      remain.setAttribute("aria-label", "남은 시간 " + r.remainMinutes + "분 " + r.remainSeconds + "초");
      facts.append(remain);
    }
    facts.append(fact(hintText(r), r.escaped && r.hintCount === 0 ? "is-nohint" : ""));
    facts.append(fact(r.playerCount + "인", ""));
    info.append(facts);
    if (r.status === "HIDDEN") {
      info.append(el("p", "rd-hidden", "숨김 처리된 후기예요. 다른 사람에게는 보이지 않아요."));
    }

    const body = el("div", "rd-body");
    const starLine = el("span", "rd-stars", stars(r.rating));
    starLine.setAttribute("aria-label", "별점 " + r.rating + "점");
    body.append(starLine);
    if (r.content) body.append(el("p", "rd-content", r.content));   // 글이 없으면 별점만
    info.append(body);

    const actions = el("div", "rd-actions");
    const edit = el("button", "btn btn-dim small", "수정");
    edit.type = "button";
    edit.addEventListener("click", function () { window.openReviewModal({ review: r }); });
    const remove = el("button", "btn btn-line small", "삭제");
    remove.type = "button";
    remove.addEventListener("click", function () { deleteReview(r, remove); });
    actions.append(edit, remove);
    info.append(actions);

    card.append(info);
    return card;
  }

  function fact(text, cls) { return el("span", "rd-fact" + (cls ? " " + cls : ""), text); }

  async function deleteReview(review, button) {
    if (!confirm("\"" + review.themeTitle + "\" 후기를 삭제할까요? 삭제하면 되돌릴 수 없어요.")) return;
    button.disabled = true;
    try {
      await api.del("/api/reviews/" + review.reviewId);
    } catch (e) {
      if (e.status !== 404) {   // 404 = 이미 지워짐 → 지운 것으로 보고 새로고침
        UI.toast(e.message, "err");
        button.disabled = false;
        return;
      }
    }
    UI.toast("후기를 삭제했어요");
    loadAll();
  }

  // ======================================================== 작은 도우미

  function themeFromReview(r) {
    return { themeId: r.themeId, title: r.themeTitle, storeName: r.storeName, posterUrl: r.posterUrl };
  }
  function hintText(r) { return r.hintCount === 0 ? "노힌트" : "힌트 " + r.hintCount + "개"; }
  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function dateLabel(dateKey) {
    const p = String(dateKey).split("-").map(Number);
    return p[0] + "년 " + p[1] + "월 " + p[2] + "일";
  }
  function shortDate(dateKey) {
    const p = String(dateKey).split("-");
    return p[0] + "." + p[1] + "." + p[2];
  }
  function stars(n) {
    const full = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
  }
  function mmss(min, sec) { return pad(min || 0) + ":" + pad(sec || 0); }
})();
