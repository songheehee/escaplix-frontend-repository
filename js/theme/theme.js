// S09 테마 상세 (pages/theme/theme.html?id=) · B 담당
//   B-2 상세 → B-3 그날 시간표(날짜 고르기) → D-4 후기 → B-10 같은 매장의 다른 테마
//   후기 쓰기·신고 팝업은 D 담당(review-modal.js). 그 파일이 window.openReviewModal / window.openReportModal 을
//   만들어 두면 여기 버튼이 그걸 부른다. 저장 뒤 document 에 "review-saved" 이벤트를 쏘면 후기를 다시 불러온다.
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
    renderDates(t);
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
    sub.append(el("span", "match", r ? "★ " + r + " (후기 " + t.reviewCount + ")" : "아직 후기 없음"));
    const store = el("a", "d-store", t.store.name + " ›");
    store.href = Routes.url("store", { id: t.store.storeId });
    sub.append(store);
    box.append(sub);

    // 고를 때 제일 많이 보는 네 가지를 크게 (난이도 · 시간 · 인원 · 가격)
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
    stat("난이도", [big(String(t.difficulty)), unit("/ 5"), el("span", "ds-level", LEVEL[t.difficulty] || "")]);
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
        party.textContent = "👥 모집 중인 파티 " + t.recruitingPartyCount;
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
    if (!t.description) return;
    $("intro").append(longText(t.description));
    $("intro-sec").hidden = false;
  }

  // 소개글: 네 줄까지만 보이고, 넘치면 "더 보기"로 펼치기
  function longText(text) {
    const wrap = el("div", "d-desc-wrap");
    const p = el("p", "d-desc clamp", text);
    p.id = "d-desc";
    wrap.append(p);
    // 화면에 붙은 뒤에야 넘치는지 잴 수 있음
    requestAnimationFrame(function () {
      if (p.scrollHeight <= p.clientHeight + 2) { p.classList.remove("clamp"); return; }
      const more = el("button", "d-more", "더 보기");
      more.type = "button";
      more.setAttribute("aria-controls", "d-desc");
      more.setAttribute("aria-expanded", "false");
      more.addEventListener("click", function () {
        const open = p.classList.toggle("clamp") === false;
        more.textContent = open ? "접기" : "더 보기";
        more.setAttribute("aria-expanded", String(open));
      });
      wrap.append(more);
    });
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
    function line(icon, label, text) {
      const li = el("li");
      li.append(el("span", "si-icon", icon));
      li.setAttribute("aria-label", label);
      li.append(el("span", null, text));
      list.append(li);
    }
    if (s.address) line("📍", "주소", s.address);
    if (s.phone) line("☎", "전화", s.phone);
    if (detail && detail.hours) line("🕒", "영업시간", detail.hours);
    body.append(list);
    card.append(body, el("span", "sinfo-arrow", "›"));
    box.append(card);
  }

  // ---------- 시간표 (B-3) ----------
  function renderDates(t) {
    const strip = $("date-strip");
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    let current = null;

    for (let i = 0; i < 14; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const day = d.getDay();
      const b = el("button", "date-chip" + (day === 0 || day === 6 ? " weekend" : ""));
      b.type = "button";
      b.setAttribute("role", "tab");
      b.dataset.date = UI.ymd(d);
      b.append(el("span", "dc-day", i === 0 ? "오늘" : i === 1 ? "내일" : UI.DAYS[day]));
      b.append(el("span", "dc-num", String(d.getDate())));
      b.addEventListener("click", function () { pick(b); });
      strip.append(b);
    }
    pick(strip.firstChild);

    async function pick(btn) {
      if (current === btn) return;
      current = btn;
      strip.querySelectorAll(".date-chip").forEach(function (c) {
        const on = c === btn;
        c.classList.toggle("on", on);
        c.setAttribute("aria-selected", String(on));
      });
      const box = $("slots");
      const note = $("slot-note");
      box.textContent = "";
      box.append(el("div", "sk", null));
      box.firstChild.style.cssText = "height:40px;width:100%";
      try {
        const res = await api.get("/api/themes/" + t.themeId + "/slots", { date: btn.dataset.date });
        if (current !== btn) return; // 그사이 다른 날짜를 눌렀으면 버림
        box.textContent = "";
        const dateLabel = btn.dataset.date.slice(5).replace("-", "/");
        if (res.holidayName) {
          btn.classList.add("weekend");
          btn.title = res.holidayName;
          note.textContent = dateLabel + " · " + res.holidayName + "이라 주말 시간표";
        } else {
          note.textContent = dateLabel + " · " + (res.dayType === "WEEKEND" ? "주말" : "주중") + " 시간표";
        }
        if (!res.slots.length) {
          box.append(el("p", "muted", "이 날은 남은 회차가 없어요."));
          return;
        }
        res.slots.forEach(function (s) {
          const label = s.startTime + " ~ " + s.endTime;
          let n;
          if (isUser) {
            // 손님은 시간을 눌러 바로 그 시간으로 파티를 모집할 수 있게
            n = el("a", "slot");
            n.href = Routes.url("partyForm", { themeId: t.themeId, playAt: btn.dataset.date + "T" + s.startTime + ":00" });
            n.title = "이 시간으로 파티 모집하기";
          } else {
            n = el("span", "slot");
          }
          n.append(el("b", null, s.startTime), el("small", null, "~ " + s.endTime));
          n.setAttribute("aria-label", label);
          box.append(n);
        });
      } catch (e) {
        if (current !== btn) return;
        box.textContent = "";
        box.append(el("p", "muted", e.message));
      }
    }
  }

  // ---------- 후기 (D-4) ----------
  async function loadReviews(t) {
    const sum = $("review-summary");
    const list = $("reviews");
    const writeBtn = $("write-review");

    if (isUser) {
      writeBtn.hidden = false;
      writeBtn.onclick = function () {
        if (typeof window.openReviewModal === "function") {
          window.openReviewModal({ themeId: t.themeId, title: t.title, storeName: t.store.name, playMinutes: t.playMinutes });
        } else {
          UI.toast("후기 쓰기는 곧 열려요");
        }
      };
    }

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
    right.append(el("div", "rs-stars", stars(res.avgRating || 0)));
    right.append(el("div", "muted small", "후기 " + res.reviewCount + "개"));
    const mine = res.reviews.find(function (x) { return x.mine; });
    if (mine) writeBtn.hidden = true; // 이미 썼으면 내 기록에서 수정
    if (res.reviews.length) {
      const escaped = res.reviews.filter(function (x) { return x.escaped; }).length;
      right.append(el("div", "small", "탈출 성공률 " + Math.round(escaped / res.reviews.length * 100) + "%"));
    }
    sum.append(big, right);

    if (!res.reviews.length) {
      list.append(el("p", "muted", "아직 후기가 없어요. 첫 후기를 남겨 주세요!"));
      return;
    }
    showReviewPage(res.reviews, res.playMinutes, 1, false);
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
    head.append(who, el("span", "rv-stars", stars(v.rating)));
    c.append(head);

    // 한 줄: [탈출 성공] 12분 34초 · 힌트 2개 · 2인  (실패면 남은 시간 없이)
    const facts = el("div", "rv-facts");
    facts.append(el("span", "badge " + (v.escaped ? "open" : "closed"), v.escaped ? "탈출 성공" : "탈출 실패"));
    const bits = [];
    // 남은 시간은 분(remainMinutes)·초(remainSeconds 0~59) 두 칸으로 옴 (D-4)
    if (v.escaped) bits.push(remainText(v.remainMinutes || 0, v.remainSeconds || 0));   // 남은 시간
    bits.push("힌트 " + v.hintCount + "개");
    bits.push(v.playerCount + "인");
    facts.append(el("span", "rv-bits", bits.join(" · ")));
    c.append(facts);

    if (v.content) c.append(el("p", "rv-text", v.content));

    // 신고: 손님·사장만, 내 후기는 빼고 (D-11)
    if (me && (me.role === "USER" || me.role === "OWNER") && !v.mine) {
      const rep = el("button", "rv-report", v.reportedByMe ? "신고함" : "🚩 신고");
      rep.type = "button";
      rep.disabled = v.reportedByMe;
      rep.addEventListener("click", function () {
        if (typeof window.openReportModal === "function") window.openReportModal(v);
        else UI.toast("신고하기는 곧 열려요");
      });
      c.append(rep);
    }
    return c;
  }

  function stars(n) {
    const full = Math.round(Number(n) || 0);
    return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
  }
  // 남은 시간 글: 12분 34초 / 21분 / 35초
  function remainText(min, sec) {
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
