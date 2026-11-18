// 화면 공통 도우미 (카드·가로 줄·찜 버튼·알림). 헤더는 header.js, footer 는 footer.js
// 규칙: 사용자가 쓴 글(제목·닉네임·후기 등)은 반드시 textContent 로만 넣는다 (명세 1-7)

const UI = (function () {
  // ---------- 요소 만들기 ----------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function $(id) { return document.getElementById(id); }

  // ---------- 포스터 ----------
  // 테마 사진은 모두 백엔드에 있다. 서버가 주는 posterUrl 은 "/uploads/posters/파일" (명세 1-6)
  //   더미 테마 사진도, 사장이 올린 사진(C-7)도 같은 주소로 백엔드가 내려 준다
  // 사진이 없거나 못 불러오면 장르 색 그라데이션 + 테마 이름 첫 글자로 대신한다
  const GENRE_COLOR = {
    "공포": ["#7a1626", "#1c0a0e"], "추리": ["#25507f", "#0c1622"], "스릴러": ["#4a4f57", "#111316"],
    "감성": ["#8a4f78", "#24131f"], "코믹": ["#c7801c", "#3a2108"], "판타지": ["#5a33a0", "#150c26"],
    "SF": ["#11707f", "#061b20"], "모험": ["#6b7a22", "#1b1f08"],
  };
  const DEFAULT_COLOR = ["#4b3a66", "#141018"];
  function genreName(g) { return typeof g === "string" ? g : (g && g.name) || ""; }
  // 장르 색 그라데이션 (CSS background 값)
  function genreGradient(genres) {
    const c = GENRE_COLOR[genreName((genres || [])[0])] || DEFAULT_COLOR;
    return "radial-gradient(circle at 70% 25%, " + c[0] + " 0%, " + c[1] + " 75%)";
  }
  function posterUrl(url) {
    if (!url) return null;
    if (/^https?:\/\//.test(url)) return url;
    if (url.charAt(0) === "/") return API_BASE + url;
    return null;
  }
  // 사진 대신 쓰는 칸
  function posterPlaceholder(t) {
    const ph = el("div", "poster-ph");
    ph.style.background = genreGradient(t.genres);
    ph.setAttribute("role", "img");
    ph.setAttribute("aria-label", t.title || "");
    ph.append(el("span", null, (t.title || "?").trim().slice(0, 1)));
    return ph;
  }
  // 포스터 요소 (<img>, 못 불러오면 대신 칸으로 바뀜)
  function poster(t, cls) {
    const src = posterUrl(t.posterUrl);
    if (!src) return posterPlaceholder(t);
    const img = el("img", cls);
    img.alt = t.title || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", function () { img.replaceWith(posterPlaceholder(t)); }, { once: true });
    img.src = src;
    return img;
  }
  // 배경으로 쓸 때 (CSS background). 먼저 장르 색을 깔고, 사진을 불러오면 사진으로 바꿈
  function posterBg(node, t) {
    node.style.background = genreGradient(t.genres);
    const src = posterUrl(t.posterUrl);
    if (!src) return;
    const probe = new Image();
    probe.onload = function () {
      node.style.background = "";
      node.style.backgroundImage = "url('" + src.replace(/'/g, "%27") + "')";
    };
    probe.src = src;
  }

  // ---------- 글자 모양 ----------
  function rating(avg) { return avg === null || avg === undefined ? null : Number(avg).toFixed(1); }
  function won(n) { return Number(n).toLocaleString("ko-KR") + "원"; }
  function people(min, max) { return min === max ? min + "명" : min + "~" + max + "명"; }
  function genresText(genres) { return (genres || []).map(genreName).join(" · "); }
  // http(s) 링크만 통과 (javascript: 막기)
  function safeUrl(u) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : null; }
  function ymd(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function today() { return ymd(new Date()); }
  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  function isRecent(dateTime, days) {
    if (!dateTime) return false;
    return Date.now() - new Date(dateTime).getTime() < days * 86400000;
  }
  function difficultyDots(n) {
    const box = el("span", "dots");
    box.setAttribute("aria-label", "난이도 " + n + " / 5");
    for (let i = 1; i <= 5; i++) box.append(el("i", i <= n ? "on" : null));
    return box;
  }

  // ---------- 알림 (잠깐 떴다 사라지는 토스트) ----------
  let toastBox = null;
  function toast(msg, kind) {
    if (!toastBox) {
      toastBox = el("div", "toasts");
      toastBox.setAttribute("role", "status");
      toastBox.setAttribute("aria-live", "polite");
      document.body.append(toastBox);
    }
    const t = el("div", "toast" + (kind ? " " + kind : ""), msg);
    toastBox.append(t);
    setTimeout(function () { t.classList.add("out"); }, 2600);
    setTimeout(function () { t.remove(); }, 3000);
  }

  // ---------- 찜 (B-4, B-5) ----------
  // 손님만 찜할 수 있다. 비회원이면 로그인으로, 사장·관리자면 버튼을 안 그린다
  function canWish() {
    const m = Auth.me();
    return !m || m.role === "USER";
  }
  async function toggleWish(themeId, wished) {
    const m = Auth.me();
    if (!m) {
      if (confirm("찜하려면 로그인이 필요해요. 로그인할까요?")) Auth.goLogin();
      return wished;
    }
    try {
      if (wished) {
        await api.del("/api/themes/" + themeId + "/wish");
        toast("찜 목록에서 뺐어요");
        return false;
      }
      await api.post("/api/themes/" + themeId + "/wish");
      toast("찜 목록에 넣었어요 ♥");
      return true;
    } catch (e) {
      if (e.status === 409) return true;            // 이미 찜함 → 찜한 상태로 맞춤
      if (e.status === 404 && wished) return false; // 이미 취소됨
      toast(e.message, "err");
      return wished;
    }
  }
  // 하트 버튼 (round: 카드 위 동그란 버튼 / 아니면 글자 버튼)
  function wishButton(themeId, wished, round) {
    const b = el("button", round ? "icon-btn wish" : "btn btn-dim wish");
    b.type = "button";
    let state = !!wished;
    function paint() {
      b.classList.toggle("on", state);
      b.textContent = round ? (state ? "♥" : "♡") : (state ? "♥ 찜함" : "♡ 찜하기");
      b.setAttribute("aria-pressed", String(state));
      b.setAttribute("aria-label", state ? "찜 취소" : "찜하기");
      b.title = state ? "찜 취소" : "찜하기";
    }
    b.addEventListener("click", async function (e) {
      e.preventDefault();
      e.stopPropagation();
      b.disabled = true;
      state = await toggleWish(themeId, state);
      b.disabled = false;
      paint();
      document.dispatchEvent(new CustomEvent("wish-change", { detail: { themeId: themeId, wished: state } }));
    });
    // 같은 테마의 하트가 화면 여러 곳(배너·줄)에 있으면 함께 바뀌게
    document.addEventListener("wish-change", function (e) {
      if (e.detail.themeId !== themeId || e.detail.wished === state) return;
      state = e.detail.wished;
      paint();
    });
    paint();
    return b;
  }

  // ---------- 테마 카드 (가로 줄·격자 공용) ----------
  // 평소엔 가로 사진, 마우스를 올리면 커지면서 정보가 아래로 펼쳐진다
  function themeCard(t) {
    const card = el("article", "tcard");
    const link = el("a", "tcard-link");
    link.href = Routes.url("theme", { id: t.themeId });
    link.setAttribute("aria-label", t.title);

    const art = el("div", "tcard-art");
    art.append(poster(t));
    const shade = el("div", "tcard-shade");
    shade.append(el("span", "tcard-title", t.title));
    art.append(shade);
    if (isRecent(t.createdAt, 14)) art.append(el("span", "ribbon new", "NEW"));
    else if (t.recruitingPartyCount > 0) art.append(el("span", "ribbon", "파티 모집 중"));
    link.append(art);
    card.append(link);

    const info = el("div", "tcard-info");
    const actions = el("div", "tcard-actions");
    const play = el("a", "icon-btn solid", "▶");
    play.href = Routes.url("theme", { id: t.themeId });
    play.title = "상세 보기";
    play.setAttribute("aria-label", t.title + " 상세 보기");
    actions.append(play);
    if (canWish()) actions.append(wishButton(t.themeId, t.wished, true));
    if (t.recruitingPartyCount > 0) {
      const p = el("a", "icon-btn", "👥");
      p.href = Routes.url("partyList", { themeId: t.themeId });
      p.title = "모집 중인 파티 " + t.recruitingPartyCount + "개";
      p.setAttribute("aria-label", p.title);
      actions.append(p);
    }
    info.append(actions);

    const meta = el("div", "tcard-meta");
    const r = rating(t.avgRating);
    meta.append(el("span", "match", r ? "★ " + r : "새 테마"));
    meta.append(el("span", "pill", "Lv." + t.difficulty));
    meta.append(el("span", null, t.playMinutes + "분"));
    meta.append(el("span", null, people(t.minPeople, t.maxPeople)));
    info.append(meta);
    info.append(el("div", "tcard-genres", genresText(t.genres)));
    if (t.storeName) info.append(el("div", "tcard-store", t.storeName + (t.area ? " · " + t.area : "")));
    if (t.recruitingPartyCount > 0) info.append(el("div", "tcard-party", "모집 중인 파티 " + t.recruitingPartyCount + "개"));
    card.append(info);
    return card;
  }

  // ---------- 가로로 미는 줄 ----------
  function row(title, note, items, makeItem, extraClass) {
    const sec = el("section", "row-sec" + (extraClass ? " " + extraClass : ""));
    const h = el("h2", "row-title", title);
    if (note) h.append(el("small", null, note));
    sec.append(h);

    const wrap = el("div", "row-wrap");
    const track = el("div", "track");
    items.forEach(function (it, i) { track.append(makeItem(it, i)); });
    const left = el("button", "row-arrow left", "‹");
    const right = el("button", "row-arrow right", "›");
    left.type = right.type = "button";
    left.setAttribute("aria-label", title + " 이전");
    right.setAttribute("aria-label", title + " 다음");
    left.addEventListener("click", function () { track.scrollBy({ left: -track.clientWidth * 0.85, behavior: "smooth" }); });
    right.addEventListener("click", function () { track.scrollBy({ left: track.clientWidth * 0.85, behavior: "smooth" }); });
    function edges() {
      left.hidden = track.scrollLeft < 8;
      right.hidden = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
    }
    track.addEventListener("scroll", edges, { passive: true });
    window.addEventListener("resize", edges);
    requestAnimationFrame(edges);
    wrap.append(left, track, right);
    sec.append(wrap);
    return sec;
  }

  // 불러오는 중 자리 (회색 카드)
  function skeletonRow(n) {
    const sec = el("section", "row-sec");
    sec.append(el("div", "sk sk-title"));
    const track = el("div", "track");
    for (let i = 0; i < (n || 6); i++) track.append(el("div", "sk sk-card"));
    sec.append(track);
    return sec;
  }

  function emptyBox(msg, linkText, href) {
    const box = el("div", "empty", msg);
    if (linkText) {
      const a = el("a", "btn btn-light small", linkText);
      a.href = href;
      box.append(el("br"), a);
    }
    return box;
  }

  return {
    el: el, $: $, poster: poster, posterBg: posterBg, genreGradient: genreGradient,
    rating: rating, won: won, people: people, genresText: genresText, genreName: genreName,
    safeUrl: safeUrl, ymd: ymd, today: today, DAYS: DAYS, isRecent: isRecent, difficultyDots: difficultyDots,
    toast: toast, canWish: canWish, wishButton: wishButton, themeCard: themeCard, row: row,
    skeletonRow: skeletonRow, emptyBox: emptyBox,
  };
})();
