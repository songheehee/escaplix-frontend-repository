// S14 시간표 관리 (pages/owner/owner-slots.html?themeId=) · C 담당 · C-10 보기, C-11 통째 저장
//   주중/주말 시작 시간만 정한다 (결정 T1·T2). 끝나는 시간 = 시작 + 제한 시간
//   화면에서 먼저 막는 것: 같은 시각 두 번, 앞뒤 회차 간격 < 제한 시간, 한 유형 20개 초과 (서버도 다시 검사)
//   "주말에도 똑같이" 복사는 화면에서만. 저장은 C-11 한 번
//   themeId 가 없으면 매장(C-1) → 테마(C-5)를 골라서 연다
(function () {
  const el = UI.el;
  const $ = UI.$;
  const me = Manage.guard(["OWNER", "ADMIN"]);
  if (!me) return;
  const themeId = Manage.numParam("themeId");
  const MAX_PER_KIND = 20;
  const KIND_NAME = { weekday: "주중", weekend: "주말" };

  let playMinutes = 0;
  let data = { weekday: [], weekend: [] };
  let saved = "";  // 마지막으로 저장된 상태 (바뀐 게 있는지 비교)

  if (themeId) openEditor();
  else openPicker();

  // ---------- 테마 고르기 ----------
  async function openPicker() {
    $("back").href = Routes.url("owner");
    $("picker").hidden = false;
    let stores;
    try {
      stores = await api.get("/api/owner/stores");
    } catch (e) {
      Manage.stop(e.message);
      return;
    }
    if (!stores.length) {
      Manage.stop("먼저 매장을 등록해 주세요.", "+ 매장 등록", Routes.url("storeForm"));
      return;
    }
    const ss = $("pick-store");
    stores.forEach(function (s) {
      const o = el("option", null, s.name + (s.status === "APPROVED" ? "" : " (" + Manage.badge(s.status).textContent + ")"));
      o.value = s.storeId;
      ss.append(o);
    });
    const first = stores.find(function (s) { return s.status === "APPROVED"; }) || stores[0];
    ss.value = first.storeId;
    ss.addEventListener("change", loadThemes);
    $("pick-go").addEventListener("click", function () {
      const id = $("pick-theme").value;
      if (id) location.href = Routes.url("ownerSlots", { themeId: id });
    });
    loadThemes();
  }

  async function loadThemes() {
    const ts = $("pick-theme");
    ts.textContent = "";
    ts.disabled = true;
    $("pick-go").disabled = true;
    let themes = [];
    try {
      themes = await api.get("/api/owner/stores/" + $("pick-store").value + "/themes");
    } catch (e) {
      UI.toast(e.message, "err");
    }
    themes = themes.filter(function (t) { return t.status !== "REJECTED"; });
    if (!themes.length) {
      ts.append(el("option", null, "시간표를 정할 테마가 없어요"));
      return;
    }
    themes.forEach(function (t) {
      const o = el("option", null, t.title + " · " + t.playMinutes + "분 · " + Manage.badge(t.status).textContent);
      o.value = t.themeId;
      ts.append(o);
    });
    ts.disabled = false;
    $("pick-go").disabled = false;
  }

  // ---------- 시간표 편집 ----------
  async function openEditor() {
    let slots, theme;
    try {
      const r = await Promise.all([
        api.get("/api/owner/themes/" + themeId + "/slots"),
        api.get("/api/owner/themes/" + themeId).catch(function () { return null; }),
      ]);
      slots = r[0];
      theme = r[1];
    } catch (e) {
      Manage.stop(e.status === 403 || e.status === 404 ? "내 테마가 아니거나 없는 테마예요." : e.message,
        "내 매장으로", Routes.url("owner"));
      return;
    }
    const storeId = theme && (theme.storeId || (theme.store && theme.store.storeId));
    const back = Routes.url("owner", { storeId: storeId });
    $("back").href = back;
    $("cancel").href = back;
    if (theme) {
      $("title").textContent = "시간표 관리 · " + theme.title;
      document.title = theme.title + " 시간표 · Escaplix";
    }
    apply(slots);
    $("lead").append(" 제한 시간 " + playMinutes + "분 기준으로 끝나는 시간이 자동으로 계산돼요.");
    $("editor").hidden = false;

    document.querySelectorAll(".week-col").forEach(bindColumn);
    $("save").addEventListener("click", save);
    // 저장하지 않고 나가려 하면 한 번 묻기
    window.addEventListener("beforeunload", function (e) {
      if (dirty()) { e.preventDefault(); e.returnValue = ""; }
    });
    $("cancel").addEventListener("click", function (e) {
      if (dirty() && !confirm("저장하지 않은 시간표가 있어요. 나갈까요?")) e.preventDefault();
      else saved = snapshot();
    });
  }

  // C-10 / C-11 응답 → 화면 상태
  function apply(r) {
    playMinutes = r.playMinutes;
    data = {
      weekday: r.weekday.map(function (s) { return s.startTime; }),
      weekend: r.weekend.map(function (s) { return s.startTime; }),
    };
    saved = snapshot();
    render();
  }
  function snapshot() { return JSON.stringify([data.weekday.slice().sort(), data.weekend.slice().sort()]); }
  function dirty() { return snapshot() !== saved; }

  function toMin(t) {
    const p = t.split(":");
    return Number(p[0]) * 60 + Number(p[1]);
  }
  function toTime(m) {
    const day = m >= 24 * 60 ? " (다음날)" : "";
    m = m % (24 * 60);
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0") + day;
  }

  function render() {
    document.querySelectorAll(".week-col").forEach(function (col) {
      const kind = col.dataset.kind;
      const ul = col.querySelector(".times");
      ul.textContent = "";
      data[kind].sort(function (a, b) { return toMin(a) - toMin(b); });
      if (!data[kind].length) ul.append(el("li", "none", "아직 시간이 없어요"));
      data[kind].forEach(function (t) {
        const li = el("li");
        const left = el("span");
        left.append(el("span", "t", t), el("span", "end", "→ " + toTime(toMin(t) + playMinutes) + " 종료"));
        const del = el("button", null, "✕");
        del.type = "button";
        del.title = t + " 빼기";
        del.setAttribute("aria-label", KIND_NAME[kind] + " " + t + " 빼기");
        del.addEventListener("click", function () {
          data[kind] = data[kind].filter(function (x) { return x !== t; });
          render();
        });
        li.append(left, del);
        ul.append(li);
      });
    });
    $("summary").textContent = "주중 하루 " + data.weekday.length + "회 · 주말 하루 " + data.weekend.length + "회 → 일주일 " +
      (data.weekday.length * 5 + data.weekend.length * 2) + "회" + (dirty() ? " · 저장 안 됨" : "");
  }

  // 시각 t 를 kind 에 넣을 수 있는지. 안 되면 이유
  function problem(kind, t, list) {
    list = list || data[kind];
    if (!/^\d{2}:\d{2}$/.test(t)) return "시간은 19:00처럼 입력해 주세요.";
    if (list.indexOf(t) !== -1) return t + "은(는) 이미 있어요.";
    if (list.length >= MAX_PER_KIND) return KIND_NAME[kind] + " 시간은 " + MAX_PER_KIND + "개까지 넣을 수 있어요.";
    const clash = list.find(function (x) { return Math.abs(toMin(x) - toMin(t)) < playMinutes; });
    if (clash) return clash + " 회차와 겹쳐요 (플레이 " + playMinutes + "분).";
    return null;
  }

  function bindColumn(col) {
    const kind = col.dataset.kind;
    const input = col.querySelector("input[type=time]");
    const warn = col.querySelector(".warn-line");
    function add() {
      const t = (input.value || "").slice(0, 5);
      warn.textContent = "";
      if (!t) return;
      const p = problem(kind, t);
      if (p) { warn.textContent = p; return; }
      data[kind].push(t);
      // 다음 회차 자리를 미리 채워 둠 (끝나는 시간)
      input.value = toTime(toMin(t) + playMinutes).slice(0, 5);
      render();
    }
    col.querySelector(".add").addEventListener("click", add);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); add(); }
    });
    col.querySelector(".copy").addEventListener("click", function () {
      const to = this.dataset.to;
      if (data[to].length && !confirm(KIND_NAME[to] + " 시간표를 " + KIND_NAME[kind] + "와 똑같이 바꿀까요?")) return;
      data[to] = data[kind].slice();
      render();
    });
  }

  async function save() {
    Manage.showError($("error"), "");
    const btn = $("save");
    Manage.busy(btn, true, "저장 중…");
    try {
      const r = await api.put("/api/owner/themes/" + themeId + "/slots", {
        weekday: data.weekday.slice(),
        weekend: data.weekend.slice(),
      });
      apply(r);
      UI.toast("시간표를 저장했어요.");
    } catch (e) {
      Manage.showError($("error"), e.message);
    } finally {
      Manage.busy(btn, false);
    }
  }
})();
