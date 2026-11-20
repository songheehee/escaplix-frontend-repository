// S21 매장 등록·수정 (pages/owner/store-form.html?id=) · C 담당
//   C-1 처음 값(수정), C-2 사업장 등록번호 중복 확인, C-3 등록, C-4 수정 (multipart, api.upload)
//   지역은 B-12 전체 목록에서 고름 (서울·경기… 큰 지역별 묶음, 결정 L1)
//   사장: 등록·수정하면 PENDING → 관리자 승인 (결정 S1). 사업장등록증은 등록할 때 꼭 필요
//   관리자: 바로 APPROVED, 사업장등록증 없어도 됨 (결정 S3)
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Manage.guard(["OWNER", "ADMIN"]);
  if (!me) return;
  const admin = me.role === "ADMIN";
  const storeId = Manage.numParam("id");
  const form = $("form");

  let original = null;      // 수정 중인 매장 (C-1 한 줄)
  let checkedNo = null;     // 중복 확인을 통과한 번호

  setup();

  async function setup() {
    const backTo = Routes.url("owner", { storeId: storeId });
    $("back").href = backTo;
    $("cancel").href = backTo;
    if (admin) $("back").textContent = "← 직접 등록한 매장";
    Manage.counter($("intro"), $("intro-count"));
    const areasReady = loadAreas();   // 수정 화면에서 기존 지역을 고르려면 목록이 먼저 있어야 함
    if (me.role === "OWNER") loadMyBizNo();

    if (storeId) {
      try {
        const list = await api.get("/api/owner/stores");
        original = list.find(function (s) { return s.storeId === storeId; });
      } catch (e) {
        Manage.stop(e.message);
        return;
      }
      if (!original) {
        Manage.stop("내 매장이 아니거나 없는 매장이에요.", "내 매장으로", Routes.url("owner"));
        return;
      }
      await areasReady;
      fill(original);
    }

    document.title = (storeId ? "매장 수정" : "매장 등록") + " · Escaplix";
    $("title").textContent = storeId ? "매장 수정" : (admin ? "매장 직접 등록" : "매장 등록");
    $("lead").textContent = admin
      ? "관리자가 등록·수정한 매장은 승인 없이 바로 손님에게 보여요."
      : "관리자가 사업장등록증을 확인하고 승인하면 손님에게 보여요.";
    $("re-approve").hidden = admin || !storeId;
    $("submit").textContent = admin ? "저장" : (storeId ? "수정하고 다시 승인 요청" : "승인 요청");
    // 사업장등록증: 사장이 새로 등록할 때만 필수. 수정 때 비우면 지금 파일 그대로 (C-4)
    const fileRequired = !admin && !storeId;
    $("file-req").hidden = !fileRequired;
    if (storeId) $("bizPlaceFile-hint").textContent = "바꿀 때만 골라 주세요. 비워 두면 지금 파일을 그대로 써요.";
    else if (admin) $("bizPlaceFile-hint").textContent = "관리자가 등록할 때는 없어도 돼요.";

    Manage.bindImageInput($("storePhoto"), $("storePhoto-preview"), $("storePhoto-hint"),
      original && original.photoUrl, "매장 사진이 없으면 테마 사진이나 장르 색으로 대신 보여요");
    Manage.bindImageInput($("bizPlaceFile"), $("bizPlaceFile-preview"), $("bizPlaceFile-hint"),
      null, storeId ? "지금 파일은 관리자 화면에서만 볼 수 있어요" : "선택한 파일이 없어요");

    $("bizPlaceNo").addEventListener("input", function () {
      checkedNo = null;
      setNoHint("", null);
    });
    $("check-no").addEventListener("click", checkNo);
    form.addEventListener("submit", submit);
  }

  function fill(s) {
    ["name", "area", "phone", "address", "websiteUrl", "hours", "intro", "bizPlaceNo"].forEach(function (k) {
      $(k).value = s[k] || "";
    });
    // 예전에 직접 입력한 지역이 목록에 없으면 그대로 보이게 넣어 둠 (저장하려면 목록에서 다시 골라야 함)
    if (s.area && $("area").value !== s.area) {
      const o = el("option", null, s.area + " (목록에 없음)");
      o.value = s.area;
      $("area").append(o);
      $("area").value = s.area;
    }
    $("lat").value = s.lat !== null && s.lat !== undefined ? s.lat : "";
    $("lng").value = s.lng !== null && s.lng !== undefined ? s.lng : "";
    $("intro").dispatchEvent(new Event("input"));
    checkedNo = s.bizPlaceNo; // 원래 번호는 내 것이니 다시 확인하지 않음
    if (s.status === "REJECTED" && s.rejectReason) {
      form.prepend(Manage.rejectNote(s.rejectReason, "지난번 반려 사유"));
    }
  }

  // 지역 select (B-12): 큰 지역(서울·경기…)마다 묶어서 세부 지역(홍대·강남…)을 보여 줌
  async function loadAreas() {
    const select = $("area");
    try {
      const regions = await api.get("/api/regions");
      regions.forEach(function (r) {
        const group = el("optgroup");
        group.label = r.name;
        r.areas.forEach(function (a) {
          const o = el("option", null, a.name);
          o.value = a.name;
          group.append(o);
        });
        select.append(group);
      });
    } catch (e) {
      UI.toast("지역 목록을 불러오지 못했어요. 새로고침해 주세요.", "err");
    }
  }

  // 사장 사업자등록번호 (가입 때 등록, A-7). 사업장 번호와 헷갈리지 않게 보여 줌
  async function loadMyBizNo() {
    try {
      const m = await api.get("/api/members/me");
      if (!m.bizNo) return;
      const p = $("owner-biz");
      p.textContent = "";
      p.append("사장 사업자등록번호 ", el("b", null, m.bizNo), " · 가입 때 등록한 번호예요. 아래에는 이 매장의 사업장 번호를 넣어 주세요.");
      p.hidden = false;
    } catch (e) { /* 안내만 못 보여 줌 */ }
  }

  function setNoHint(msg, ok) {
    const h = $("bizPlaceNo-hint");
    h.textContent = msg || "매장마다 하나뿐이라 이미 등록된 번호는 쓸 수 없어요.";
    h.classList.toggle("ok", ok === true);
    h.classList.toggle("bad", ok === false);
  }

  // C-2 중복 확인. 이미 있으면 available: false (409 아님)
  async function checkNo() {
    const input = $("bizPlaceNo");
    const no = input.value.trim();
    if (!input.checkValidity()) {
      setNoHint("123-45-67890 모양으로 입력해 주세요.", false);
      input.focus();
      return false;
    }
    if (original && no === original.bizPlaceNo) {
      checkedNo = no;
      setNoHint("지금 이 매장의 번호예요.", true);
      return true;
    }
    const btn = $("check-no");
    Manage.busy(btn, true, "확인 중…");
    try {
      const r = await api.get("/api/owner/stores/check-biz-place-no", { bizPlaceNo: no });
      checkedNo = r.available ? no : null;
      setNoHint(r.available ? "등록되지 않은 번호예요. 쓸 수 있어요." : "이미 등록된 사업장 등록번호예요.", r.available);
      return r.available;
    } catch (e) {
      setNoHint(e.message, false);
      return false;
    } finally {
      Manage.busy(btn, false);
    }
  }

  // 화면에서 먼저 막을 수 있는 것만 검사. 나머지는 서버가 400 으로 알려 줌
  function validate() {
    if (!form.checkValidity()) {
      const bad = form.querySelector(":invalid");
      const label = form.querySelector('label[for="' + bad.id + '"]');
      const name = label ? label.firstChild.textContent.trim() : "입력 칸";
      bad.focus();
      if (bad.validity.valueMissing) return name + "을(를) 입력해 주세요.";
      if (bad.id === "websiteUrl") return "웹사이트 주소는 http:// 또는 https:// 로 시작해야 해요.";
      if (bad.id === "phone") return "전화번호는 숫자와 - 로 9~13자 입력해 주세요.";
      if (bad.id === "bizPlaceNo") return "사업장 등록번호는 123-45-67890 모양으로 입력해 주세요.";
      return name + " 값을 확인해 주세요.";
    }
    if (!Manage.isWebUrl($("websiteUrl").value.trim())) {
      $("websiteUrl").focus();
      return "웹사이트가 열 수 있는 주소가 아니에요. 예) https://example.com";
    }
    const lat = $("lat").value.trim(), lng = $("lng").value.trim();
    if ((lat === "") !== (lng === "")) {
      (lat === "" ? $("lat") : $("lng")).focus();
      return "위도와 경도는 둘 다 넣거나 둘 다 비워 주세요.";
    }
    if (!admin && !storeId && !$("bizPlaceFile").files[0]) {
      $("bizPlaceFile").focus();
      return "사업장등록증 이미지를 올려 주세요.";
    }
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    Manage.showError($("error"), "");
    const err = validate();
    if (err) { Manage.showError($("error"), err); return; }

    const no = $("bizPlaceNo").value.trim();
    if (checkedNo !== no && !(await checkNo())) {
      Manage.showError($("error"), "사업장 등록번호를 확인해 주세요.");
      return;
    }
    if (storeId && !admin && !confirm("수정하면 다시 승인을 받을 때까지 매장과 테마가 손님에게 보이지 않아요. 저장할까요?")) return;

    const f = new FormData();
    ["name", "area", "phone", "address", "websiteUrl", "hours", "intro", "bizPlaceNo"].forEach(function (k) {
      f.append(k, $(k).value.trim());
    });
    if ($("lat").value.trim() !== "") {
      f.append("lat", $("lat").value.trim());
      f.append("lng", $("lng").value.trim());
    }
    if ($("bizPlaceFile").files[0]) f.append("bizPlaceFile", $("bizPlaceFile").files[0]);
    if ($("storePhoto").files[0]) f.append("storePhoto", $("storePhoto").files[0]);

    const btn = $("submit");
    Manage.busy(btn, true, "저장 중…");
    try {
      const r = storeId
        ? await api.upload("/api/owner/stores/" + storeId, f, "PUT")
        : await api.upload("/api/owner/stores", f);
      UI.toast(r.status === "APPROVED" ? "저장했어요. 바로 손님에게 보여요." : "승인 요청을 보냈어요. 관리자 승인을 기다려 주세요.");
      setTimeout(function () { location.href = Routes.url("owner", { storeId: r.storeId }); }, 900);
    } catch (e2) {
      Manage.busy(btn, false);
      Manage.showError($("error"), e2.message);
      if (e2.status === 409) setNoHint(e2.message, false);
    }
  }
})();
