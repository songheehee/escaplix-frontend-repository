// S23 매장 승인 상세 (pages/admin/admin-store-detail.html?id=) · C 담당
//   C-14 상세, C-15 사업장등록증, A-11 사장 사업자등록증 (둘 다 토큰이 필요한 이미지 → api.blob)
//   C-16 승인·반려. PENDING 매장만 처리, 반려는 사유 필수 1~300자 → 사장 홈에 보임 (결정 S4)
//   관리자 개편 11/23: 맨 위 한 줄(이름·상태 / 신청자·신청일 / 승인·반려 버튼, 스크롤해도 위에 붙음)
//     매장 (작은 사진 + 지역·주소·전화·영업시간·웹사이트·소개)
//     서류 (사업장등록증 · 사업자등록증 나란히. 관리자 직접 등록이면 사업장등록증만)
(function () {
  const $ = UI.$;
  if (!Manage.guard(["ADMIN"])) return;
  const storeId = Manage.numParam("id");
  let store = null;

  $("back").href = Routes.url("adminStores");
  if (!storeId) {
    Manage.stop("매장 번호가 없어요.", "승인 요청", Routes.url("adminStores"));
    return;
  }
  $("approve").addEventListener("click", approve);
  $("reject-btn").addEventListener("click", reject);
  load();

  async function load() {
    try {
      store = await api.get("/api/admin/stores/" + storeId);
    } catch (e) {
      Manage.stop(e.status === 404 ? "없는 매장이에요." : e.message, "승인 요청", Routes.url("adminStores"));
      return;
    }
    render();
  }

  function render() {
    const s = store;
    document.title = s.name + " · 매장 승인 · Escaplix";
    $("name").textContent = s.name;
    paintStatus();

    const body = $("body");
    body.textContent = "";
    const pub = Manage.section("①", "매장");
    pub.append(Manage.storePublic(s));
    const docs = Manage.section("②", "서류");
    docs.append(Manage.storeDocs(s));
    body.append(pub, docs);
  }

  function paintStatus() {
    const s = store;
    const st = $("status");
    st.textContent = "";
    st.append(Manage.badge(s.status));
    Manage.metaRow($("meta"), s.owner
      ? [["신청자", s.owner.loginId + " (" + s.owner.nickname + ")"], ["신청일", Manage.ymd(s.createdAt)],
        ["승인일", s.status === "APPROVED" && s.approvedAt ? Manage.ymd(s.approvedAt) : null]]
      : [["등록자", "관리자"], ["등록일", Manage.ymd(s.createdAt)]]);
    $("reject").textContent = "";
    if (s.status === "REJECTED" && s.rejectReason) $("reject").append(Manage.rejectNote(s.rejectReason));
    $("decide").hidden = s.status !== "PENDING";
  }

  async function decide(body, btn) {
    Manage.busy(btn, true);
    try {
      const r = await api.put("/api/admin/stores/" + storeId + "/approval", body);
      store.status = r.status;
      store.rejectReason = r.rejectReason;
      if (r.status === "APPROVED") store.approvedAt = new Date().toISOString();
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
