// S14 시간표 ③ 테마 화면의 [시간표] 탭 (owner-theme.html) · C 담당 · C-10 보기, C-11 통째 저장
//   주중/주말 시작 시간만 정한다 (결정 T1·T2). 끝나는 시간 = 시작 + 제한 시간
//   시간을 칩으로 나열: ✕ 로 빼고 [추가] 로 넣음. 사장·관리자 같은 화면
//   관리자 개편 11/23
//     - 시간 입력: 브라우저 기본 시간 칸 대신 직접 만든 칸. 숫자만 치면 13:15 모양 (1315, 915 → 09:15), Enter 로도 추가
//       칸을 누르면 시(00~23) | 분(5분 단위) 고르기 판
//     - 회차 겹침은 허용 (밀어내기 테마). 화면에서 막는 것: 같은 시각 두 번, 한 유형 20개 초과 (서버도 다시 검사)
//     - 저장 줄은 화면 아래에 붙어 따라옴. 바뀐 게 없으면 저장 버튼이 흐려짐
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
    document.addEventListener("click", function (e) { if (!e.target.closest(".tin")) closePickers(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePickers(); });
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
  // 숫자만 → "13:15" (1315, 915 → 09:15). 틀린 시각이면 ""
  function norm(v) {
    let d = String(v).replace(/[^0-9]/g, "");
    if (d.length === 3) d = "0" + d;
    if (d.length !== 4) return "";
    const h = Number(d.slice(0, 2)), m = Number(d.slice(2));
    if (h > 23 || m > 59) return "";
    return d.slice(0, 2) + ":" + d.slice(2);
  }

  function render() {
    document.querySelectorAll(".week-col").forEach(function (col) {
      const kind = col.dataset.kind;
      const ul = col.querySelector(".times");
      ul.textContent = "";
      data[kind].sort(function (a, b) { return toMin(a) - toMin(b); });
      if (!data[kind].length) ul.append(el("li", "none", "아직 넣은 시간이 없어요."));
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
      col.querySelector(".wc-n").textContent = data[kind].length + "회";
      const full = data[kind].length >= MAX_PER_KIND;
      col.querySelector(".tin input").disabled = full;
      col.querySelector(".add").disabled = full;
      const warn = col.querySelector(".warn-line");
      if (full) warn.textContent = MAX_PER_KIND + "개까지 넣을 수 있어요.";
      else if (warn.textContent.indexOf("개까지") !== -1) warn.textContent = "";
    });
    const sum = $("slot-summary");
    sum.textContent = "주중 " + data.weekday.length + "회 · 주말 " + data.weekend.length + "회";
    if (dirty()) sum.append(el("b", null, " · 저장 안 됨"));
    $("slot-save").disabled = !dirty();
  }

  // 시각 t 를 kind 에 넣을 수 있는지. 안 되면 이유 (회차 겹침은 허용)
  function problem(kind, t) {
    if (!t) return "13:00처럼 시각을 넣어 주세요.";
    if (data[kind].indexOf(t) !== -1) return t + "는 이미 있어요.";
    if (data[kind].length >= MAX_PER_KIND) return KIND_NAME[kind] + " 시간은 " + MAX_PER_KIND + "개까지 넣을 수 있어요.";
    return null;
  }

  function closePickers() { document.querySelectorAll(".tp").forEach(function (p) { p.hidden = true; }); }

  function bindColumn(col) {
    const kind = col.dataset.kind;
    const input = col.querySelector(".tin input");
    const tp = col.querySelector(".tp");
    const warn = col.querySelector(".warn-line");

    // 치는 동안: 숫자 4개면 가운데 : 를 넣어 줌
    input.addEventListener("input", function () {
      const d = input.value.replace(/[^0-9]/g, "").slice(0, 4);
      input.value = d.length > 2 ? d.slice(0, 2) + ":" + d.slice(2) : d;
      warn.textContent = "";
      paintPicker();
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); add(); } });
    input.addEventListener("focus", function () { closePickers(); paintPicker(); tp.hidden = false; });

    // 시·분 고르기 판 (분은 5분 단위. 직접 치면 1분 단위도 됨)
    function paintPicker() {
      const cur = norm(input.value), ch = cur.slice(0, 2), cm = cur.slice(3);
      tp.textContent = "";
      [["시", 24, 1, ch], ["분", 60, 5, cm]].forEach(function (c, ci) {
        const colEl = el("div", "tp-col");
        colEl.append(el("div", "h", c[0]));
        for (let i = 0; i < c[1]; i += c[2]) {
          const v = String(i).padStart(2, "0");
          const b = el("button", v === c[3] ? "on" : null, v);
          b.type = "button";
          b.addEventListener("mousedown", function (e) { e.preventDefault(); });   // 입력칸 포커스 유지
          b.addEventListener("click", function () {
            const now = norm(input.value) || "13:00";
            input.value = ci === 0 ? v + now.slice(2) : now.slice(0, 3) + v;
            warn.textContent = "";
            paintPicker();
          });
          colEl.append(b);
        }
        tp.append(colEl);
        const on = colEl.querySelector(".on");
        if (on) colEl.scrollTop = on.offsetTop - 40;
      });
    }

    function add() {
      const t = norm(input.value);
      const p = problem(kind, t);
      if (p) { closePickers(); warn.textContent = p; return; }
      data[kind].push(t);
      input.value = "";
      warn.textContent = "";
      closePickers();
      render();
      input.focus();
    }
    col.querySelector(".add").addEventListener("click", add);
    col.querySelector(".copy").addEventListener("click", function () {
      const to = this.dataset.to;
      if (data[to].length && !confirm(KIND_NAME[to] + " 시간표를 " + KIND_NAME[kind] + "와 똑같이 바꿀까요?")) return;
      data[to] = data[kind].slice();
      render();
      UI.toast(KIND_NAME[kind] + " 시간표를 " + KIND_NAME[to] + "에 똑같이 넣었어요.");
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
      $("slot-save").disabled = !dirty();
    }
  }

  return { open: open, dirty: dirty };
})();
