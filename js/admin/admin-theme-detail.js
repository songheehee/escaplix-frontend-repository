// S24 테마 승인 상세 (pages/admin/admin-theme-detail.html?id=) · C 담당
//   C-18 상세(테마 + 매장 정보), C-19 승인·반려. 매장이 승인 전이면 테마는 승인할 수 없음
//   관리자 개편 11/23: 맨 위 한 줄(이름·상태 / 매장·신청자·신청일·수정일 + 승인/반려, 스크롤해도 위에 붙음)
//     테마: 포스터 + 장르 + 4칸 숫자(손님 테마 상세와 같은 배치) + 예약 링크 + 소개
//        소개는 오른쪽 칸의 남은 아래를 다 쓰고, 칸을 넘을 때만 "더 보기"
//     매장: 이름·상태 + 지역·주소·전화·영업시간·웹사이트. 승인 전 매장이면 빨간 카드 + "매장 먼저 승인하기"
(function () {
  const el = UI.el;
  const $ = UI.$;
  if (!Manage.guard(["ADMIN"])) return;
  const themeId = Manage.numParam("id");
  let theme = null;
  let store = null;

  $("back").href = Routes.url("adminThemes");
  if (!themeId) {
    Manage.stop("테마 번호가 없어요.", "승인 요청", Routes.url("adminThemes"));
    return;
  }
  $("approve").addEventListener("click", approve);
  $("reject-btn").addEventListener("click", reject);
  load();

  async function load() {
    let d;
    try {
      d = await api.get("/api/admin/themes/" + themeId);
    } catch (e) {
      Manage.stop(e.status === 404 ? "없는 테마예요." : e.message, "승인 요청", Routes.url("adminThemes"));
      return;
    }
    theme = d.theme || d;
    store = d.store || {};
    render();
  }

  function render() {
    const t = theme;
    document.title = t.title + " · 테마 승인 · Escaplix";
    $("name").textContent = t.title;

    const body = $("body");
    body.textContent = "";
    const pub = Manage.section("①", "테마");
    pub.append(publicCard(t));
    const st = Manage.section("②", "매장");
    st.append(storeCard());
    body.append(pub, st);
    paintStatus();
    fitIntro();
  }

  // ① 포스터 + 정보. 오른쪽 칸 높이는 포스터에 맞추고 소개가 남은 아래를 다 씀
  let pubBox = null;
  function publicCard(t) {
    const card = el("div", "m-card ad-tpub");
    pubBox = card;
    const photo = el("div", "m-photo poster");
    photo.append(UI.poster(t));
    const info = el("div", "ad-tinfo");

    const tags = el("div", "ad-tags");
    (t.genres || []).forEach(function (g) { tags.append(el("span", "tag", g)); });

    const stats = el("div", "ad-stats");
    function cell(label, big, unit) {
      const c = el("div");
      const b = el("b", null, big);
      if (unit) b.append(" ", el("small", null, unit));
      c.append(el("span", null, label), b);
      stats.append(c);
    }
    cell("난이도", String(t.difficulty), "/ 5");
    cell("시간", String(t.playMinutes), "분");
    cell("인원", t.minPeople === t.maxPeople ? String(t.minPeople) : t.minPeople + "~" + t.maxPeople, "인");
    cell("가격", Number(t.price).toLocaleString("ko-KR"), "원 / 1인");

    const intro = el("div", "ad-intro");
    const text = el("p", "m-text", t.description || "소개가 없어요.");
    const more = el("button", "ad-more", "더 보기");
    more.type = "button";
    more.hidden = true;
    more.addEventListener("click", function () {
      const open = card.classList.toggle("open");
      more.textContent = open ? "접기" : "더 보기";
    });
    intro.append(el("span", "lbl", "소개"), text, more);

    info.append(tags, stats, Manage.dlRows([["예약 링크", Manage.webLink(t.bookingUrl)]]), intro);
    card.append(photo, info);
    return card;
  }
  // 소개 글이 칸을 넘을 때만 "더 보기"
  function fitIntro() {
    if (!pubBox || pubBox.classList.contains("open")) return;
    const text = pubBox.querySelector(".ad-intro .m-text");
    const more = pubBox.querySelector(".ad-more");
    more.hidden = text.scrollHeight <= text.clientHeight + 1;
  }
  window.addEventListener("resize", fitIntro);

  // ② 매장 카드
  function storeCard() {
    const ok = !store.status || store.status === "APPROVED";
    const card = el("div", "m-card ad-store" + (ok ? "" : " bad"));
    const top = el("div", "ad-store-top");
    top.append(el("b", null, store.name || "-"));
    if (store.status) top.append(Manage.badge(store.status));
    if (!ok && store.storeId) {
      const go = el("a", "go", "매장 먼저 승인하기 →");
      go.href = Routes.url("adminStoreDetail", { id: store.storeId });
      top.append(go);
    }
    card.append(top, Manage.dlRows([
      ["지역", store.area], ["주소", store.address], ["전화", store.phone],
      ["영업시간", store.hours], ["웹사이트", Manage.webLink(store.websiteUrl)],
    ]));
    return card;
  }

  function paintStatus() {
    const t = theme;
    const st = $("status");
    st.textContent = "";
    st.append(Manage.badge(t.status));
    const updated = t.updatedAt && Manage.ymd(t.updatedAt) !== Manage.ymd(t.createdAt) ? Manage.ymd(t.updatedAt) : null;
    Manage.metaRow($("meta"), [
      ["매장", store.name],
      [t.source === "ADMIN" ? "등록자" : "신청자", t.source === "ADMIN" ? "관리자" : store.ownerLoginId],
      ["신청일", Manage.ymd(t.createdAt)],
      ["수정일", updated],
    ]);
    $("reject").textContent = "";
    if (t.status === "REJECTED" && t.rejectReason) $("reject").append(Manage.rejectNote(t.rejectReason));
    const pending = t.status === "PENDING";
    const storeOk = !store.status || store.status === "APPROVED";
    $("decide").hidden = !pending;
    $("lock").hidden = storeOk;
    $("approve").disabled = !storeOk;
  }

  async function decide(body, btn) {
    Manage.busy(btn, true);
    try {
      const r = await api.put("/api/admin/themes/" + themeId + "/approval", body);
      theme.status = r.status;
      theme.rejectReason = r.rejectReason;
      UI.toast(r.status === "OPEN" ? "승인했어요. 손님 메인에 나타나요." : "반려했어요. 사장 홈에 사유가 보여요.");
    } catch (e) {
      UI.toast(e.message, "err");
      if (e.status === 409) { Manage.busy(btn, false); load(); return; }
    }
    Manage.busy(btn, false);
    paintStatus();
  }

  function approve() {
    if (!confirm("「" + theme.title + "」을(를) 승인할까요? 바로 손님 메인에 나타나요.")) return;
    decide({ approved: true }, $("approve"));
  }

  async function reject() {
    const reason = await Manage.askReason("테마 반려", "「" + theme.title + "」을(를) 반려해요. 사장이 고쳐서 다시 신청할 수 있게 이유를 적어 주세요.");
    if (reason) decide({ approved: false, reason: reason }, $("reject-btn"));
  }
})();
