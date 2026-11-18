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
    renderDates(t);
    loadReviews(t);
    loadSameStore(t);
  }

  // ---------- 위쪽 큰 화면 ----------
  function renderHero(t) {
    UI.posterBg($("d-bg"), t);
    const posterBox = $("d-poster");
    posterBox.textContent = "";
    posterBox.append(UI.poster(t));

    const box = $("d-text");
    box.textContent = "";
    const genres = el("div", "d-genres");
    t.genres.forEach(function (g) {
      const a = el("a", "tag", g.name);
      a.href = Routes.url("home", { genreId: g.genreId });
      genres.append(a);
    });
    box.append(genres);
    box.append(el("h1", "d-title", t.title));

    const meta = el("div", "d-meta");
    const r = UI.rating(t.avgRating);
    meta.append(el("span", "match", r ? "★ " + r + " (" + t.reviewCount + ")" : "아직 후기 없음"));
    const lv = el("span", "lv", "난이도 ");
    lv.append(UI.difficultyDots(t.difficulty));
    meta.append(lv);
    meta.append(el("span", null, "제한 시간 " + t.playMinutes + "분"));
    meta.append(el("span", null, UI.people(t.minPeople, t.maxPeople)));
    meta.append(el("span", null, "1인 " + UI.won(t.price)));
    box.append(meta);

    const store = el("a", "d-store", t.store.name + " · " + t.store.area + " ›");
    store.href = Routes.url("store", { id: t.store.storeId });
    box.append(store);

    if (t.description) box.append(el("p", "d-desc", t.description));

    const btns = el("div", "d-btns");
    const booking = UI.safeUrl(t.bookingUrl);
    if (booking) {
      const b = el("a", "btn btn-light", "예약하러 가기 ↗");
      b.href = booking;
      b.target = "_blank";
      b.rel = "noopener noreferrer";
      btns.append(b);
    }
    if (UI.canWish()) btns.append(UI.wishButton(t.themeId, t.wished, false));
    if (!me || isUser) {
      const party = el("a", "btn btn-dim");
      party.href = Routes.url("partyList", { themeId: t.themeId });
      party.textContent = t.recruitingPartyCount > 0 ? "👥 모집 중인 파티 " + t.recruitingPartyCount : "👥 이 테마 파티 보기";
      btns.append(party);
      const make = el("a", "btn btn-dim", "＋ 파티 만들기");
      make.href = Routes.url("partyForm", { themeId: t.themeId });
      btns.append(make);
    }
    box.append(btns);
  }

  function renderStoreInfo(t) {
    const dl = $("store-info");
    const s = t.store;
    function item(k, v, href) {
      dl.append(el("dt", null, k));
      const dd = el("dd");
      if (href) {
        const a = el("a", null, v);
        a.href = href;
        dd.append(a);
      } else {
        dd.textContent = v;
      }
      dl.append(dd);
    }
    item("매장", s.name, Routes.url("store", { id: s.storeId }));
    item("지역", s.area);
    if (s.address) item("주소", s.address);
    if (s.phone) item("전화", s.phone, "tel:" + s.phone.replace(/[^0-9]/g, ""));
    item("가격", "1인 " + UI.won(t.price) + " (인원 상관없이 같은 가격)");
    item("인원", UI.people(t.minPeople, t.maxPeople));
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
    res.reviews.forEach(function (v) { list.append(reviewCard(v, res.playMinutes)); });
  }

  function reviewCard(v, playMinutes) {
    const c = el("article", "review");
    const head = el("div", "rv-head");
    const who = el("div", "rv-who");
    who.append(el("span", "avatar small", (v.nickname || "?").slice(0, 1)));
    who.append(el("b", null, v.nickname));
    if (v.mine) who.append(el("span", "tag", "내 후기"));
    head.append(who, el("span", "rv-stars", stars(v.rating)));
    c.append(head);

    const facts = el("div", "rv-facts");
    facts.append(el("span", "badge " + (v.escaped ? "open" : "closed"), v.escaped ? "탈출 성공" : "탈출 실패"));
    if (v.escaped) facts.append(el("span", null, mmss(v.remainSeconds) + " 남기고 (" + playMinutes + ":00 중)"));
    facts.append(el("span", null, "힌트 " + v.hintCount + "개"));
    facts.append(el("span", null, v.playerCount + "명이서"));
    facts.append(el("span", "muted", v.playedDate + " 플레이"));
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
  function mmss(sec) {
    return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  }

  // 후기 팝업(D)이 저장을 마치면 다시 불러오기
  document.addEventListener("review-saved", function () {
    api.get("/api/themes/" + themeId).then(loadReviews).catch(function () { /* 무시 */ });
  });

  // ---------- 같은 매장의 다른 테마 (B-10) ----------
  async function loadSameStore(t) {
    try {
      const s = await api.get("/api/stores/" + t.store.storeId);
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
