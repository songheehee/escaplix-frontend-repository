// S21 매장 등록·수정 (pages/owner/store-form.html?id=) · C 담당
//   C-1 처음 값(수정), C-2 사업장 관리번호 중복 확인, C-3 등록, C-4 수정 (multipart, api.upload)
//   사장: 등록·수정하면 PENDING → 관리자 승인 (결정 S1). 사업장 증빙 서류는 등록할 때 꼭 필요
//   관리자: 바로 APPROVED, 사업장 증빙 서류 없어도 됨 (결정 S3). 사장 매장을 고쳐도 상태 그대로 (관리자 개편 11/23)
//   관리자 개편 11/23
//     - 매장 → 서류 (승인 상세와 같은 순서), 버튼 줄은 화면 아래에 붙어 따라옴
//     - 주소: [주소 검색] = 다음 우편번호 서비스 (키 없음) + 상세 주소. 저장은 "도로명 주소, 상세 주소" 한 칸 (address)
//       좌표(lat·lng)는 서버가 주소로 채움 → 위도·경도 칸 없음
//     - 지역: 드롭다운(B-12 목록, 큰 지역별 묶음). 주소를 고르면 시·구·동 낱말이 지역 이름으로 시작할 때만 미리 골라 둠
//       (강남구 → 강남, 수원시 → 수원). 대응표는 없음. 못 찾으면 "직접 골라 주세요"
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Manage.guard(["OWNER", "ADMIN"]);
  if (!me) return;
  const admin = me.role === "ADMIN";
  if (admin) document.body.classList.add("adm-btns");   // 관리자: 상세 화면 버튼 크기를 하나로 (manage.css .adm-btns). 사장은 그대로
  const storeId = Manage.numParam("id");
  const form = $("form");

  let original = null;      // 수정 중인 매장 (C-1 한 줄)
  let checkedNo = null;     // 중복 확인을 통과한 번호
  let areaNames = [];       // 세부 지역 이름 (B-12)
  const area = UI.selectPicker("area", [["", "선택"]], "", { label: "지역" });
  $("area-box").append(area.el);
  area.input.addEventListener("change", function () { $("area-auto").hidden = true; });

  setup();

  async function setup() {
    $("cancel").href = storeId ? Routes.url("ownerStore", { id: storeId }) : Routes.url("owner");
    Manage.crumbs($("crumbs"), [[storeId ? "매장 수정" : "매장 등록"]]);
    Manage.counter($("intro"), $("intro-count"));
    const areasReady = loadAreas();

    if (storeId) {
      try {
        const list = await api.get("/api/owner/stores");
        original = list.find(function (s) { return s.storeId === storeId; });
      } catch (e) {
        Manage.stop(e.message);
        return;
      }
      if (!original) {
        Manage.stop(admin ? "없는 매장이거나 아직 승인 전인 매장이에요." : "내 매장이 아니거나 없는 매장이에요.",
          admin ? "매장 관리로" : "내 매장으로", Routes.url("owner"));
        return;
      }
      if (original.status === "CLOSED") {
        Manage.stop("폐업한 매장은 고칠 수 없어요.", "매장으로", Routes.url("ownerStore", { id: storeId }));
        return;
      }
      await areasReady;
      fill(original);
      Manage.crumbs($("crumbs"), [[original.name, Routes.url("ownerStore", { id: storeId })], ["매장 수정"]]);
    }

    document.title = (storeId ? "매장 수정" : "매장 등록") + " · Escaplix";
    $("title").textContent = storeId ? "매장 수정" : "매장 등록";
    $("re-approve").hidden = admin || !storeId;
    $("submit").textContent = admin ? (storeId ? "저장" : "등록") : "승인 요청";
    // 사업장 증빙 서류: 사장이 새로 등록할 때만 필수. 수정 때 비우면 지금 파일 그대로 (C-4)
    const fileRequired = !admin && !storeId;
    $("file-req").hidden = !fileRequired;
    $("file-opt").hidden = fileRequired;
    if (storeId) $("doc-empty").innerHTML = "<b>바꿀 때만 올리기</b>비워 두면 지금 파일을 그대로 써요";

    bindDrop($("storePhoto"), $("photo-drop"), original && original.photoUrl);
    bindDrop($("bizPlaceFile"), $("doc-drop"), null);

    $("find-addr").addEventListener("click", findAddress);
    $("addr1").addEventListener("click", findAddress);
    autoFormat($("phone"), fmtPhone);
    autoFormat($("bizPlaceNo"), fmtBiz);
    $("bizPlaceNo").addEventListener("input", function () {
      checkedNo = null;
      setNoHint("", null);
    });
    $("check-no").addEventListener("click", checkNo);
    form.addEventListener("submit", submit);
  }

  function fill(s) {
    ["name", "phone", "websiteUrl", "hours", "intro", "bizPlaceNo"].forEach(function (k) { $(k).value = s[k] || ""; });
    $("phone").value = fmtPhone($("phone").value);   // 예전에 - 없이 넣은 번호도 모양을 맞춰 보여 줌
    $("addr1").value = s.address || "";   // 저장된 주소는 한 칸 그대로. 다시 고르려면 [주소 검색]
    area.set(s.area || "");
    if (s.area && area.value() !== s.area) {
      // 예전에 직접 입력한 지역이 목록에 없으면 비워 둠 (저장하려면 목록에서 골라야 함)
      setAuto("예전 지역 「" + s.area + "」은 목록에 없어요. 다시 골라 주세요", true);
    }
    $("intro").dispatchEvent(new Event("input"));
    checkedNo = s.bizPlaceNo; // 원래 번호는 내 것이니 다시 확인하지 않음
    if (s.status === "REJECTED" && s.rejectReason) {
      form.prepend(Manage.rejectNote(s.rejectReason));
    }
  }

  // 지역 드롭다운 (B-12): 큰 지역(서울·경기…) 묶음 제목 + 세부 지역
  async function loadAreas() {
    try {
      const regions = await api.get("/api/regions");
      const opts = [["", "선택"]];
      regions.forEach(function (r) {
        opts.push([null, r.name, "group"]);
        r.areas.forEach(function (a) { opts.push([a.name, a.name]); areaNames.push(a.name); });
      });
      area.setOptions(opts);
    } catch (e) {
      UI.toast("지역 목록을 불러오지 못했어요. 새로고침해 주세요.", "err");
    }
  }

  function setAuto(text, miss) {
    const t = $("area-auto");
    t.textContent = text;
    t.classList.toggle("miss", !!miss);
    t.hidden = !text;
  }
  // 대응표 없이: 주소의 시·구·동 낱말이 지역 이름으로 시작하면 그 지역 (강남구 → 강남, 수원시 → 수원, 부산 → 부산)
  function guessArea(words) {
    for (let i = 0; i < areaNames.length; i++) {
      const a = areaNames[i];
      if (words.some(function (w) { return w && w.indexOf(a) === 0; })) return a;
    }
    return "";
  }

  // [주소 검색] 다음 우편번호 서비스 창
  function findAddress() {
    if (!window.daum || !window.daum.Postcode) {
      UI.toast("주소 검색을 불러오지 못했어요. 새로고침해 주세요.", "err");
      return;
    }
    new window.daum.Postcode({
      oncomplete: function (d) {
        const road = d.roadAddress || d.address;
        $("addr1").value = road;
        $("addr1").removeAttribute("aria-invalid");
        const words = road.split(" ").concat([d.sido, d.sigungu, d.bname]);
        const g = guessArea(words);
        if (g) { area.set(g); setAuto("주소로 골랐어요"); }
        else if (!area.value()) setAuto("직접 골라 주세요", true);
        $("addr2").focus();
      },
    }).open();
  }

  // 사진 칸: 누르거나 끌어다 놓으면 미리보기 (jpg·png·webp, 5MB 이하는 Manage.checkImage)
  function bindDrop(input, box, current) {
    let objectUrl = null;
    function show(src) {
      let img = box.querySelector("img");
      if (!src) { if (img) img.remove(); return; }
      if (!img) { img = el("img"); img.alt = "미리보기"; box.insertBefore(img, input); }
      img.src = src;
    }
    show(Manage.publicUrl(current));
    input.addEventListener("change", function () {
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      const file = input.files[0];
      const err = Manage.checkImage(file);
      if (err) { UI.toast(err, "err"); input.value = ""; show(Manage.publicUrl(current)); return; }
      if (!file) { show(Manage.publicUrl(current)); return; }
      objectUrl = URL.createObjectURL(file);
      show(objectUrl);
    });
  }

  // 숫자만 쳐도 - 가 붙음. 서버 StoreForm 의 모양 검사와 같은 규칙
  const PHONE_RE = /^(02-\d{3,4}-\d{4}|050\d-\d{4}-\d{4}|0[13-9]\d-\d{3,4}-\d{4}|1[5-9]\d{2}-\d{4})$/;
  // 사업장 관리번호 11자리 = 사업자 등록번호 10자리 + 끝 1자리 (000-00-00000-0)
  //   예전에 10자리로 넣은 매장(더미 데이터)은 번호를 안 바꾸면 그대로 저장 가능 (bizOk)
  const BIZ_RE = /^\d{3}-\d{2}-\d{5}-\d$/;

  function join(d, cuts) {   // cuts: 끊는 자리. 친 만큼만 - 를 붙임
    const parts = [];
    let at = 0;
    cuts.concat([Infinity]).some(function (c) {
      if (d.length <= at) return true;
      parts.push(d.slice(at, c));
      at = c;
      return false;
    });
    return parts.join("-");
  }
  // 02-123-4567 · 02-1234-5678 · 031-123-4567 · 010-1234-5678 · 0507-1234-5678 · 1588-1234
  function fmtPhone(v) {
    let d = String(v || "").replace(/\D/g, "");
    if (d.startsWith("02")) { d = d.slice(0, 10); return join(d, d.length === 10 ? [2, 6] : [2, 5]); }
    if (d.startsWith("050")) return join(d.slice(0, 12), [4, 8]);
    if (/^1[5-9]/.test(d)) return join(d.slice(0, 8), [4]);
    d = d.slice(0, 11);
    return join(d, d.length === 11 ? [3, 7] : [3, 6]);
  }
  function fmtBiz(v) {
    return join(String(v || "").replace(/\D/g, "").slice(0, 11), [3, 5, 10]);
  }
  function bizOk(no) { return BIZ_RE.test(no) || !!(original && no === original.bizPlaceNo); }
  // 고친 뒤에도 커서가 같은 숫자 뒤에 남도록
  function autoFormat(input, fmt) {
    input.addEventListener("input", function () {
      const before = input.value.slice(0, input.selectionStart).replace(/\D/g, "").length;
      const f = fmt(input.value);
      if (f === input.value) return;
      input.value = f;
      let pos = 0, seen = 0;
      while (pos < f.length && seen < before) { if (/\d/.test(f[pos])) seen++; pos++; }
      input.setSelectionRange(pos, pos);
    });
  }

  function setNoHint(msg, ok) {
    const h = $("bizPlaceNo-hint");
    h.textContent = msg || "";
    h.classList.toggle("ok", ok === true);
    h.classList.toggle("bad", ok === false);
  }

  // C-2 중복 확인. 이미 있으면 available: false (409 아님)
  async function checkNo() {
    const input = $("bizPlaceNo");
    const no = input.value.trim();
    if (original && no === original.bizPlaceNo) {
      checkedNo = no;
      setNoHint("지금 이 매장의 번호예요.", true);
      return true;
    }
    if (!BIZ_RE.test(no)) {
      setNoHint("숫자 11자리를 입력해 주세요.", false);
      input.focus();
      return false;
    }
    const btn = $("check-no");
    Manage.busy(btn, true, "확인 중…");
    try {
      const r = await api.get("/api/owner/stores/check-biz-place-no", { bizPlaceNo: no });
      checkedNo = r.available ? no : null;
      setNoHint(r.available ? "쓸 수 있는 번호예요." : "이미 등록된 사업장 관리번호예요.", r.available);
      return r.available;
    } catch (e) {
      setNoHint(e.message, false);
      return false;
    } finally {
      Manage.busy(btn, false);
    }
  }

  function fullAddress() {
    const a1 = $("addr1").value.trim(), a2 = $("addr2").value.trim();
    return a2 ? a1 + ", " + a2 : a1;
  }

  // 화면에서 먼저 막을 수 있는 것만 검사. 나머지는 서버가 400 으로 알려 줌
  function validate() {
    function need(id, label) {
      if ($(id).value.trim()) return null;
      $(id).focus();
      return label + "을(를) 입력해 주세요.";
    }
    let err = need("name", "매장 이름");
    if (err) return err;
    if (!$("addr1").value.trim()) { $("find-addr").focus(); return "주소 검색으로 주소를 골라 주세요."; }
    if (fullAddress().length > 100) { $("addr2").focus(); return "주소는 100자까지 넣을 수 있어요. 상세 주소를 줄여 주세요."; }
    if (!area.value()) { area.button.focus(); return "지역을 골라 주세요."; }
    err = need("phone", "전화번호");
    if (err) return err;
    if (!PHONE_RE.test($("phone").value.trim())) { $("phone").focus(); return "전화번호를 끝까지 입력해 주세요. 예) 02-123-4567, 010-1234-5678"; }
    err = need("hours", "영업시간");
    if (err) return err;
    // 자유 입력이지만 시간은 하나 있어야 함 (10:00 / 10시). 서버 StoreForm 과 같은 규칙
    if (!/\d{1,2}\s*:\s*\d{2}|\d{1,2}\s*시/.test($("hours").value)) {
      $("hours").focus();
      return "영업시간에 시간을 넣어 주세요. 예) 10:00 ~ 23:00 (화 휴무)";
    }
    err = need("websiteUrl", "웹사이트");
    if (err) return err;
    if (!Manage.isWebUrl($("websiteUrl").value.trim())) {
      $("websiteUrl").focus();
      return "웹사이트가 열 수 있는 주소가 아니에요. 예) https://example.com";
    }
    err = need("bizPlaceNo", "사업장 관리번호");   // 매장 소개는 선택
    if (err) return err;
    if (!bizOk($("bizPlaceNo").value.trim())) { $("bizPlaceNo").focus(); return "사업장 관리번호 숫자 11자리를 입력해 주세요."; }
    if (!admin && !storeId && !$("bizPlaceFile").files[0]) {
      $("bizPlaceFile").focus();
      return "사업장 증빙 서류 이미지를 올려 주세요.";
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
      Manage.showError($("error"), "사업장 관리번호를 확인해 주세요.");
      return;
    }
    if (storeId && !admin && !(await UI.ask({ title: "승인 요청을 보낼까요?", body: "다시 승인을 받을 때까지 매장과 테마가 손님에게 보이지 않아요.", yes: "예, 요청할게요" }))) return;

    const f = new FormData();
    ["name", "phone", "websiteUrl", "hours", "intro", "bizPlaceNo"].forEach(function (k) { f.append(k, $(k).value.trim()); });
    f.append("area", area.value());
    f.append("address", fullAddress());
    if ($("bizPlaceFile").files[0]) f.append("bizPlaceFile", $("bizPlaceFile").files[0]);
    if ($("storePhoto").files[0]) f.append("storePhoto", $("storePhoto").files[0]);

    const btn = $("submit");
    Manage.busy(btn, true, "저장 중…");
    try {
      const r = storeId
        ? await api.upload("/api/owner/stores/" + storeId, f, "PUT")
        : await api.upload("/api/owner/stores", f);
      // 등록·수정 모두 그 매장 페이지로 바로. 알림은 그 페이지에서 (UI.flash). replace 라 뒤로 가기로 폼에 다시 안 들어옴
      UI.flash(r.status === "APPROVED" ? "저장했어요. 바로 손님에게 보여요." : "승인 요청을 보냈어요. 관리자 승인을 기다려 주세요.");
      location.replace(Routes.url("ownerStore", { id: r.storeId || storeId }));
    } catch (e2) {
      Manage.busy(btn, false);
      Manage.showError($("error"), e2.message);
      if (e2.status === 409) setNoHint(e2.message, false);
    }
  }
})();
