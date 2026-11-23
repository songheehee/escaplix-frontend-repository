// S14 시간표 ③ 테마 화면의 [시간표] 탭 (owner-theme.html) · C 담당 · C-10 보기, C-11 통째 저장
//   예전 시간표 관리 페이지(owner-slots.html)의 편집 부분. 매장·테마 고르는 부분은 없앰 (사장 화면 개편 11/23)
//   주중/주말 시작 시간만 정한다 (결정 T1·T2). 끝나는 시간 = 시작 + 제한 시간
//   시간을 칩으로 나열: ✕ 로 빼고 [추가] 로 넣음
//   화면에서 먼저 막는 것: 같은 시각 두 번, 앞뒤 회차 간격 < 제한 시간, 한 유형 20개 초과 (서버도 다시 검사)
//   "주말에도 똑같이" 복사는 화면에서만. 저장은 C-11 한 번
//   쓰는 법: ThemeSlots.open(themeId) — 탭을 처음 열 때 한 번. 탭 안의 요소는 owner-theme.html 의 #slots-panel
const ThemeSlots = (function () {
  const el = UI.el;
  const $ = UI.$;
  const MAX_PER_KIND = 20;
  const KIND_NAME = { weekday: "주중", weekend: "주말" };

  let themeId = null;
  let playMinutes = 0;
  let data = { weekday: [], weekend: [] };
  let saved = "";  // 마지막으로 저장된 상태 (바뀐 게 있는지 비교)
  let opened = false;

  async function open(id) {
    if (opened) return;
    opened = true;
    themeId = id;
    let slots;
    try {
      slots = await api.get("/api/owner/themes/" + themeId + "/slots");
    } catch (e) {
      Manage.showError($("slot-error"), e.message);
      return;
    }
    apply(slots);
    $("slot-play").textContent = playMinutes;
    $("slot-editor").hidden = false;

    document.querySelectorAll(".week-col").forEach(bindColumn);
    $("slot-save").addEventListener("click", save);
    // 저장하지 않고 나가려 하면 한 번 묻기
    window.addEventListener("beforeunload", function (e) {
      if (dirty()) { e.preventDefault(); e.returnValue = ""; }
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
  function dirty() { return opened && snapshot() !== saved; }

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
      if (!data[kind].length) ul.append(el("li", "none", "시간 없음"));
      data[kind].forEach(function (t) {
        const li = el("li");
        li.append(el("span", "t", t), el("span", "end", "~ " + toTime(toMin(t) + playMinutes)));
        const del = el("button", null, "✕");
        del.type = "button";
        del.title = t + " 빼기";
        del.setAttribute("aria-label", KIND_NAME[kind] + " " + t + " 빼기");
        del.addEventListener("click", function () {
          data[kind] = data[kind].filter(function (x) { return x !== t; });
          render();
        });
        li.append(del);
        ul.append(li);
      });
    });
    $("slot-summary").textContent = "주중 하루 " + data.weekday.length + "회 · 주말 하루 " + data.weekend.length + "회 · 일주일 " +
      (data.weekday.length * 5 + data.weekend.length * 2) + "회" + (dirty() ? " · 저장 안 됨" : "");
  }

  // 시각 t 를 kind 에 넣을 수 있는지. 안 되면 이유
  function problem(kind, t) {
    const list = data[kind];
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
    Manage.showError($("slot-error"), "");
    const btn = $("slot-save");
    Manage.busy(btn, true, "저장 중…");
    try {
      const r = await api.put("/api/owner/themes/" + themeId + "/slots", {
        weekday: data.weekday.slice(),
        weekend: data.weekend.slice(),
      });
      apply(r);
      UI.toast("시간표를 저장했어요.");
    } catch (e) {
      Manage.showError($("slot-error"), e.message);
    } finally {
      Manage.busy(btn, false);
    }
  }

  return { open: open, dirty: dirty };
})();
