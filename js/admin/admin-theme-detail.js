// S24 테마 승인 상세 (pages/admin/admin-theme-detail.html?id=) · C 담당 · C-18 상세, C-19 승인·반려
//   C-18 응답 = C-6 모양 + store { storeId, name, bizPlaceNo, phone, websiteUrl, status }
//     (지금 백엔드는 { theme: {...}, store: {...} } 로 감싸서 줌 → 둘 다 읽는다)
//   PENDING 테마만 처리. 매장이 APPROVED 가 아니면 승인 불가(409). 반려는 사유 필수 → 사장 홈에 보임
(function () {
  const el = UI.el;
  const $ = UI.$;
  if (!Manage.guard(["ADMIN"])) return;
  const themeId = Manage.numParam("id");
  let theme = null;
  let store = null;

  $("back").href = Routes.url("adminThemes");
  if (!themeId) {
    Manage.stop("테마 번호가 없어요.", "테마 승인 목록", Routes.url("adminThemes"));
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
      Manage.stop(e.status === 404 ? "없는 테마예요." : e.message, "테마 승인 목록", Routes.url("adminThemes"));
      return;
    }
    theme = d.theme || d;
    store = d.store || {};
    render();
  }

  function link(href) {
    const safe = UI.safeUrl(href);
    if (!safe) return href || "-";
    const a = el("a", null, safe + " ↗");
    a.href = safe;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function fillDl(dl, rows) {
    dl.textContent = "";
    rows.forEach(function (r) {
      const dd = el("dd");
      if (r[1] instanceof Node) dd.append(r[1]);
      else dd.textContent = r[1] === null || r[1] === undefined || r[1] === "" ? "-" : r[1];
      dl.append(el("dt", null, r[0]), dd);
    });
  }

  function render() {
    const t = theme;
    document.title = t.title + " 승인 · Escaplix";
    $("name").textContent = t.title;

    const photo = $("photo");
    photo.textContent = "";
    photo.append(UI.poster(t));

    fillDl($("info"), [
      ["장르", UI.genresText(t.genres)],
      ["난이도", t.difficulty + " / 5"],
      ["제한 시간", t.playMinutes + "분"],
      ["인원", UI.people(t.minPeople, t.maxPeople)],
      ["가격", "1인 " + UI.won(t.price) + " (고정)"],
      ["예약 링크", link(t.bookingUrl)],
      ["소개", t.description],
      ["등록한 곳", t.source === "ADMIN" ? "관리자" : "사장"],
      ["신청일", Manage.dateTime(t.createdAt)],
      ["수정일", Manage.dateTime(t.updatedAt)],
    ]);

    fillDl($("store-info"), [
      ["이름", store.name],
      ["사업장 등록번호", store.bizPlaceNo],
      ["전화", store.phone],
      ["웹사이트", link(store.websiteUrl)],
    ]);
    const ss = $("store-status");
    ss.textContent = "";
    if (store.status) ss.append(Manage.badge(store.status));
    if (store.storeId && store.status !== "APPROVED") {
      const a = el("a", "btn btn-line small", "매장 승인 상세 →");
      a.href = Routes.url("adminStoreDetail", { id: store.storeId });
      a.style.marginLeft = "8px";
      ss.append(a);
    }
    paintStatus();
  }

  function paintStatus() {
    const st = $("status");
    st.textContent = "";
    st.append(Manage.badge(theme.status));
    $("reject").textContent = "";
    if (theme.status === "REJECTED" && theme.rejectReason) $("reject").append(Manage.rejectNote(theme.rejectReason));
    const pending = theme.status === "PENDING";
    const storeOk = !store.status || store.status === "APPROVED";
    $("decide").hidden = !pending;
    $("decide-note").hidden = !pending;
    $("store-warn").hidden = !pending || storeOk;
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
