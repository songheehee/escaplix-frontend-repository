// S23 매장 승인 상세 (pages/admin/admin-store-detail.html?id=) · C 담당
//   C-14 상세, C-15 사업장등록증, A-11 사장 사업자등록증 (둘 다 토큰이 필요한 이미지 → api.blob)
//   C-16 승인·반려. PENDING 매장만 처리, 반려는 사유 필수 1~300자 → 사장 홈에 보임 (결정 S4)
(function () {
  const el = UI.el;
  const $ = UI.$;
  if (!Manage.guard(["ADMIN"])) return;
  const storeId = Manage.numParam("id");
  let store = null;

  $("back").href = Routes.url("adminStores");
  if (!storeId) {
    Manage.stop("매장 번호가 없어요.", "매장 승인 목록", Routes.url("adminStores"));
    return;
  }
  $("approve").addEventListener("click", approve);
  $("reject-btn").addEventListener("click", reject);
  load();

  async function load() {
    try {
      store = await api.get("/api/admin/stores/" + storeId);
    } catch (e) {
      Manage.stop(e.status === 404 ? "없는 매장이에요." : e.message, "매장 승인 목록", Routes.url("adminStores"));
      return;
    }
    render();
    loadDocs();
  }

  function render() {
    const s = store;
    document.title = s.name + " 승인 · Escaplix";
    $("name").textContent = s.name;
    paintStatus();

    const photo = $("photo");
    photo.textContent = "";
    photo.append(UI.poster({ posterUrl: s.photoUrl, title: s.name, genres: [] }));
    if (!s.photoUrl) photo.title = "매장 사진 없음";

    const dl = $("info");
    dl.textContent = "";
    const site = UI.safeUrl(s.websiteUrl);
    const rows = [
      ["지역", s.area], ["주소", s.address], ["전화", s.phone],
      ["웹사이트", site ? link(site) : s.websiteUrl],
      ["영업시간", s.hours], ["소개", s.intro],
      ["사업장 등록번호", s.bizPlaceNo],
      ["사장 사업자번호", s.owner ? s.owner.bizNo : "-"],
      ["신청한 사장", s.owner ? s.owner.loginId + " (" + s.owner.nickname + ")" : "관리자 직접 등록"],
      ["신청일", Manage.dateTime(s.createdAt)],
    ];
    rows.forEach(function (r) {
      const dd = el("dd");
      if (r[1] instanceof Node) dd.append(r[1]);
      else dd.textContent = r[1] === null || r[1] === undefined || r[1] === "" ? "-" : r[1];
      dl.append(el("dt", null, r[0]), dd);
    });
  }

  function link(href) {
    const a = el("a", null, href + " ↗");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function paintStatus() {
    const st = $("status");
    st.textContent = "";
    st.append(Manage.badge(store.status));
    $("reject").textContent = "";
    if (store.status === "REJECTED" && store.rejectReason) $("reject").append(Manage.rejectNote(store.rejectReason));
    const pending = store.status === "PENDING";
    $("decide").hidden = !pending;
    $("decide-note").hidden = !pending;
  }

  function loadDocs() {
    const s = store;
    if (s.hasBizPlaceFile) {
      Manage.privateImage("/api/admin/stores/" + s.storeId + "/biz-place-file", $("doc-place"), "사업장등록증");
      $("doc-place-hint").textContent = "번호 " + s.bizPlaceNo + " · 상호와 주소가 맞는지 확인";
    } else {
      $("doc-place").textContent = "올린 사업장등록증이 없어요" + (s.owner ? "." : " (관리자 직접 등록).");
    }
    if (s.owner) {
      Manage.privateImage("/api/admin/members/" + s.owner.memberId + "/biz-file", $("doc-owner"), "사장 사업자등록증");
      $("doc-owner-hint").textContent = "번호 " + (s.owner.bizNo || "-") + " · 매장을 올린 사장과 같은 사람인지 확인";
    } else {
      $("doc-owner").textContent = "관리자가 직접 등록한 매장이라 사장 서류가 없어요.";
    }
  }

  async function decide(body, btn) {
    Manage.busy(btn, true);
    try {
      const r = await api.put("/api/admin/stores/" + storeId + "/approval", body);
      store.status = r.status;
      store.rejectReason = r.rejectReason;
      paintStatus();
      UI.toast(r.status === "APPROVED" ? "승인했어요. 이제 손님에게 보여요." : "반려했어요. 사장 홈에 사유가 보여요.");
    } catch (e) {
      UI.toast(e.message, "err");
      if (e.status === 409) load(); // 이미 처리됨 → 지금 상태로 다시 그림
    } finally {
      Manage.busy(btn, false);
    }
  }

  function approve() {
    if (!confirm("「" + store.name + "」을(를) 승인할까요? 바로 손님 매장 목록에 보여요.")) return;
    decide({ approved: true }, $("approve"));
  }

  async function reject() {
    const reason = await Manage.askReason("매장 반려", "「" + store.name + "」을(를) 반려해요. 사장이 고쳐서 다시 신청할 수 있게 이유를 적어 주세요.");
    if (reason) decide({ approved: false, reason: reason }, $("reject-btn"));
  }
})();
