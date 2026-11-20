// S28 매장 상세 (pages/store/store.html?id=) · B 담당 · B-10
//   승인 전(PENDING)·반려 매장은 404 → "볼 수 없는 매장" 안내
//   "매장 웹사이트 ↗"는 websiteUrl 로 새 창 (결정 B2). 테마별 예약은 테마 상세의 bookingUrl 로
(function () {
  const el = UI.el;
  const $ = UI.$;
  const storeId = Number(new URLSearchParams(location.search).get("id"));

  if (!storeId) { notFound("매장 번호가 없어요."); return; }
  load();

  async function load() {
    let s;
    try {
      s = await api.get("/api/stores/" + storeId);
    } catch (e) {
      notFound(e.status === 404 ? "승인 전이거나 없는 매장이에요." : e.message);
      return;
    }
    document.title = s.name + " · Escaplix";
    renderHero(s);
    renderInfo(s);
    renderThemes(s);
    $("d-body").hidden = false;
  }

  function renderHero(s) {
    // 배경: 매장 사진. 없으면 평점이 가장 높은 테마 사진, 그것도 없으면 장르 색
    const best = s.themes.slice().sort(function (a, b) { return (b.avgRating || 0) - (a.avgRating || 0); })[0];
    UI.posterBg($("d-bg"), s.photoUrl ? { posterUrl: s.photoUrl, genres: [] } : (best || { genres: [] }));

    const box = $("d-text");
    box.textContent = "";
    box.append(el("div", "d-kicker", s.area));
    // 매장명은 한 줄. 길면 글자를 줄여서 맞춤 (detail.css .d-title)
    const title = el("h1", "d-title", s.name);
    title.title = s.name;
    title.style.setProperty("--len", UI.textWidth(s.name));
    box.append(title);

    const meta = el("div", "d-meta");
    const r = UI.rating(s.avgRating);
    meta.append(el("span", "match", r ? "★ " + r : "아직 후기 없음"));   // 매장 별점 = 테마 평균의 평균
    meta.append(el("span", null, "테마 " + s.themes.length + "개"));
    const parties = s.themes.reduce(function (n, t) { return n + t.recruitingPartyCount; }, 0);
    if (parties) meta.append(el("span", "party", "모집 중인 파티 " + parties + "개"));
    if (s.hours) meta.append(el("span", null, "🕒 " + s.hours));
    box.append(meta);

    if (s.intro) box.append(el("p", "d-desc", s.intro));

    const btns = el("div", "d-btns");
    const site = UI.safeUrl(s.websiteUrl);
    if (site) {
      const a = el("a", "btn btn-light", "매장 웹사이트 ↗");
      a.href = site;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      btns.append(a);
    }
    if (s.phone) {
      const call = el("a", "btn btn-dim", "☎ 전화하기");
      call.href = "tel:" + s.phone.replace(/[^0-9]/g, "");
      btns.append(call);
    }
    box.append(btns);
  }

  function renderInfo(s) {
    const dl = $("store-info");
    [["주소", s.address], ["전화", s.phone], ["영업", s.hours], ["지역", s.area]].forEach(function (p) {
      if (!p[1]) return;
      dl.append(el("dt", null, p[0]), el("dd", null, p[1]));
    });

    // 위치가 있으면 지도 (OpenStreetMap 미리보기 + 카카오맵 링크)
    if (s.lat !== null && s.lng !== null && s.lat !== undefined && s.lng !== undefined) {
      const lat = Number(s.lat), lng = Number(s.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      const box = $("map-box");
      const d = 0.004;
      const frame = el("iframe");
      frame.title = s.name + " 위치 지도";
      frame.loading = "lazy";
      frame.referrerPolicy = "no-referrer";
      frame.src = "https://www.openstreetmap.org/export/embed.html?bbox=" +
        [lng - d, lat - d, lng + d, lat + d].join(",") + "&layer=mapnik&marker=" + lat + "," + lng;
      const link = el("a", "small", "카카오맵에서 크게 보기 ↗");
      link.href = "https://map.kakao.com/link/map/" + encodeURIComponent(s.name) + "," + lat + "," + lng;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      box.append(frame, link);
      box.hidden = false;
    }
  }

  function renderThemes(s) {
    const grid = $("themes");
    $("themes-count").textContent = s.themes.length + "개";
    if (!s.themes.length) {
      grid.replaceWith(UI.emptyBox("지금 운영 중인 테마가 없어요."));
      return;
    }
    s.themes.forEach(function (t) {
      grid.append(UI.themeCard(Object.assign({ storeName: s.name, area: s.area }, t)));
    });
  }

  function notFound(msg) {
    $("d-hero").hidden = true;
    const page = el("main", "page");
    page.append(UI.emptyBox(msg, "매장 목록으로", Routes.url("stores")));
    $("d-body").replaceWith(page);
  }
})();
