// S13 테마 등록·수정 (pages/owner/owner-theme.html?id=테마 | ?storeId=매장) · C 담당
//   C-1 매장 고르기(승인된 매장만), B-7 장르, C-6 수정용 상세, C-7 등록, C-8 수정 (multipart), C-9 운영 종료·재개
//   사장: 등록·수정하면 PENDING → 관리자 승인. 관리자: 바로 OPEN (결정 S3)
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Manage.guard(["OWNER", "ADMIN"]);
  if (!me) return;
  const admin = me.role === "ADMIN";
  const themeId = Manage.numParam("id");
  const form = $("form");

  let stores = [];
  let theme = null; // 수정 중인 테마 (C-6)

  setup();

  async function setup() {
    Manage.counter($("description"), $("description-count"));
    let genres;
    try {
      const r = await Promise.all([
        api.get("/api/owner/stores"),
        api.get("/api/genres"),
        themeId ? api.get("/api/owner/themes/" + themeId) : Promise.resolve(null),
      ]);
      stores = r[0];
      genres = r[1];
      theme = r[2];
    } catch (e) {
      Manage.stop(e.status === 403 || e.status === 404 ? "내 테마가 아니거나 없는 테마예요." : e.message,
        "내 매장으로", Routes.url("owner"));
      return;
    }

    const storeId = theme ? storeIdOf(theme) : Manage.numParam("storeId");
    const back = Routes.url("owner", { storeId: storeId });
    $("back").href = back;
    $("cancel").href = back;
    if (admin) $("back").textContent = "← 직접 등록한 매장";

    renderGenres(genres);
    renderStores(storeId);
    if (!theme && !$("storeId").options.length) {
      Manage.stop("승인된 매장이 있어야 테마를 등록할 수 있어요.", "내 매장으로", Routes.url("owner"));
      return;
    }

    document.title = (theme ? "테마 수정" : "테마 등록") + " · Escaplix";
    $("title").textContent = theme ? "테마 수정" : (admin ? "테마 직접 등록" : "테마 등록");
    $("lead").textContent = admin ? "관리자가 등록·수정한 테마는 승인 없이 바로 손님에게 보여요." : "관리자가 승인하면 손님 메인에 나타나요.";
    $("submit").textContent = admin ? "저장" : (theme ? "수정하고 다시 승인 요청" : "승인 요청");
    if (theme) fill(theme);

    Manage.bindImageInput($("poster"), $("poster-preview"), $("poster-hint"),
      theme && theme.posterUrl, "사진이 없으면 장르 색으로 대신 보여요");
    form.addEventListener("submit", submit);
  }

  // C-6 응답의 매장 번호 (명세는 B-2 모양 store.storeId, 백엔드는 storeId)
  function storeIdOf(t) { return t.storeId || (t.store && t.store.storeId) || null; }

  function renderGenres(genres) {
    const box = $("genres");
    genres.forEach(function (g) {
      const label = el("label");
      const cb = el("input");
      cb.type = "checkbox";
      cb.value = g.genreId;
      cb.name = "genreIds";
      label.append(cb, el("span", null, g.name));
      box.append(label);
    });
  }

  // 등록: 승인된 매장만 고를 수 있음 (명세 C-1·C-7). 수정: 매장은 바꿀 수 없음 (C-8)
  function renderStores(selected) {
    const sel = $("storeId");
    if (theme) {
      const s = stores.find(function (x) { return x.storeId === selected; });
      const o = el("option", null, s ? s.name : "매장 #" + selected);
      o.value = selected;
      sel.append(o);
      sel.disabled = true;
      showStoreInfo(s, "매장은 바꿀 수 없어요.");
      return;
    }
    stores.filter(function (s) { return s.status === "APPROVED"; }).forEach(function (s) {
      const o = el("option", null, s.name);
      o.value = s.storeId;
      if (s.storeId === selected) o.selected = true;
      sel.append(o);
    });
    sel.addEventListener("change", function () { showStoreInfo(current()); });
    showStoreInfo(current());
    function current() {
      return stores.find(function (x) { return x.storeId === Number(sel.value); });
    }
  }
  // 고른 매장의 사업장 번호·전화 (회의 v2-4)
  function showStoreInfo(s, extra) {
    $("store-info").textContent = s ? "사업장 " + s.bizPlaceNo + " · 전화 " + s.phone + (extra ? " · " + extra : "") : (extra || "");
  }

  function fill(t) {
    $("title-input").value = t.title;
    $("description").value = t.description || "";
    $("description").dispatchEvent(new Event("input"));
    $("difficulty").value = t.difficulty;
    $("playMinutes").value = t.playMinutes;
    $("minPeople").value = t.minPeople;
    $("maxPeople").value = t.maxPeople;
    $("price").value = t.price;
    $("bookingUrl").value = t.bookingUrl;
    const ids = (t.genreIds || []).map(Number);
    document.querySelectorAll("#genres input").forEach(function (cb) { cb.checked = ids.indexOf(Number(cb.value)) !== -1; });

    $("re-approve").hidden = admin;
    if (t.status === "REJECTED" && t.rejectReason) form.prepend(Manage.rejectNote(t.rejectReason, "지난번 반려 사유"));

    // 위쪽: 상태 · 시간표 · 운영 종료/재개
    $("theme-actions").hidden = false;
    $("go-slots").href = Routes.url("ownerSlots", { themeId: t.themeId });
    paintStatus(t.status);
    $("toggle-status").addEventListener("click", toggleStatus);
  }

  function paintStatus(status) {
    theme.status = status;
    const box = $("status");
    box.textContent = "";
    box.append(Manage.badge(status));
    const btn = $("toggle-status");
    // C-9: OPEN ↔ CLOSED 만. 승인 전·반려 테마는 바꿀 수 없음
    btn.hidden = status !== "OPEN" && status !== "CLOSED";
    btn.textContent = status === "OPEN" ? "운영 종료" : "운영 재개";
  }

  async function toggleStatus() {
    const next = theme.status === "OPEN" ? "CLOSED" : "OPEN";
    const msg = next === "CLOSED"
      ? "운영을 종료하면 손님 화면에서 사라져요. 찜 목록과 후기 기록에는 남아요. 종료할까요?"
      : "다시 운영하면 손님 화면에 바로 보여요. 재개할까요?";
    if (!confirm(msg)) return;
    const btn = $("toggle-status");
    Manage.busy(btn, true);
    try {
      const r = await api.put("/api/owner/themes/" + theme.themeId + "/status", { status: next });
      Manage.busy(btn, false);
      paintStatus(r.status);
      UI.toast(r.status === "CLOSED" ? "운영을 종료했어요." : "운영을 다시 시작했어요.");
    } catch (e) {
      Manage.busy(btn, false);
      UI.toast(e.message, "err");
    }
  }

  function checkedGenres() {
    return Array.prototype.map.call(document.querySelectorAll("#genres input:checked"), function (cb) { return cb.value; });
  }

  function validate() {
    if (!form.checkValidity()) {
      const bad = form.querySelector(":invalid");
      const label = form.querySelector('label[for="' + bad.id + '"]');
      const name = label ? label.firstChild.textContent.trim() : "입력 칸";
      bad.focus();
      if (bad.validity.valueMissing) return name + "을(를) 입력해 주세요.";
      if (bad.id === "bookingUrl") return "예약 링크는 http:// 또는 https:// 로 시작해야 해요.";
      if (bad.id === "playMinutes") return "제한 시간은 1~300분이에요.";
      if (bad.id === "minPeople" || bad.id === "maxPeople") return "인원은 1~20명이에요.";
      if (bad.id === "price") return "가격은 0원 이상이에요.";
      return name + " 값을 확인해 주세요.";
    }
    if (!Manage.isWebUrl($("bookingUrl").value.trim())) {
      $("bookingUrl").focus();
      return "예약 링크가 열 수 있는 주소가 아니에요. 예) https://example.com/booking";
    }
    if (Number($("minPeople").value) > Number($("maxPeople").value)) {
      $("minPeople").focus();
      return "최소 인원이 최대 인원보다 클 수 없어요.";
    }
    if (!checkedGenres().length) {
      $("genres").querySelector("input").focus();
      return "장르를 하나 이상 골라 주세요.";
    }
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    Manage.showError($("error"), "");
    const err = validate();
    if (err) { Manage.showError($("error"), err); return; }
    if (theme && !admin && theme.status !== "PENDING" &&
        !confirm("수정하면 다시 승인을 받을 때까지 이 테마가 손님에게 보이지 않아요. 저장할까요?")) return;

    const f = new FormData();
    // 수정(C-8)할 때도 storeId 칸은 보낸다 (서버는 무시하지만 필수 칸)
    f.append("storeId", $("storeId").value);
    f.append("title", $("title-input").value.trim());
    f.append("description", $("description").value.trim());
    ["difficulty", "playMinutes", "minPeople", "maxPeople", "price"].forEach(function (k) { f.append(k, $(k).value); });
    f.append("bookingUrl", $("bookingUrl").value.trim());
    checkedGenres().forEach(function (id) { f.append("genreIds", id); }); // genreIds=1&genreIds=2 (명세 C-7)
    if ($("poster").files[0]) f.append("poster", $("poster").files[0]);

    const btn = $("submit");
    Manage.busy(btn, true, "저장 중…");
    try {
      const r = theme
        ? await api.upload("/api/owner/themes/" + theme.themeId, f, "PUT")
        : await api.upload("/api/owner/themes", f);
      UI.toast(r.status === "OPEN" ? "저장했어요. 바로 손님에게 보여요." : "승인 요청을 보냈어요. 관리자 승인을 기다려 주세요.");
      setTimeout(function () { location.href = Routes.url("owner", { storeId: $("storeId").value }); }, 900);
    } catch (e2) {
      Manage.busy(btn, false);
      Manage.showError($("error"), e2.message);
    }
  }
})();
