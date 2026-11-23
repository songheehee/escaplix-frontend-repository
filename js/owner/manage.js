// 사장·관리자 화면 공용 도구 (C 담당)
//   쓰는 화면: owner/*, admin/*
//   불러오는 순서: routes.js → api.js → ui.js → header.js → footer.js → owner/manage.js → 화면 js
//   규칙: 사용자가 쓴 글(매장 이름·소개·반려 사유 등)은 textContent 로만 넣는다 (명세 1-7)
const Manage = (function () {
  const el = UI.el;

  // ---------- 들어올 수 있는 사람인지 ----------
  // 비회원이면 로그인으로, 역할이 다르면 본문을 안내로 바꾼다. 통과하면 { memberId, nickname, role }
  const ROLE_NAME = { USER: "손님", OWNER: "사장", ADMIN: "관리자" };
  function guard(roles) {
    const me = Auth.me();
    if (!me) {
      Auth.goLogin();
      return null;
    }
    if (roles.indexOf(me.role) === -1) {
      stop("이 화면은 " + roles.map(function (r) { return ROLE_NAME[r]; }).join("·") + "만 쓸 수 있어요.",
        "홈으로", Routes.url(me.role === "OWNER" ? "owner" : me.role === "ADMIN" ? "admin" : "home"));
      return null;
    }
    return me;
  }
  function isAdmin() {
    const me = Auth.me();
    return !!me && me.role === "ADMIN";
  }

  // 본문(#main)을 안내 한 줄로 바꾼다 (없는 번호, 권한 없음 등)
  function stop(msg, linkText, href) {
    const main = document.getElementById("main");
    main.textContent = "";
    main.append(UI.emptyBox(msg, linkText, href));
  }

  // ---------- 상태 표시 ----------
  const STATUS = {
    APPROVED: ["승인됨", "ok"],
    PENDING: ["승인 대기", "warn"],
    REJECTED: ["반려", "bad"],
    OPEN: ["공개 중", "ok"],
    CLOSED: ["운영 종료", "off"],
  };
  function badge(status) {
    const s = STATUS[status] || [status, "off"];
    return el("span", "st " + s[1], s[0]);
  }
  function rejectNote(reason, prefix) {
    return el("div", "reject-note", (prefix || "반려 사유") + ": " + reason);
  }

  // ---------- 날짜 ("2026-11-17T10:00:00") ----------
  function pad(n) { return String(n).padStart(2, "0"); }
  function parse(dt) { return dt ? new Date(dt) : null; }
  function md(dt) {
    const d = parse(dt);
    return d ? (d.getMonth() + 1) + "/" + d.getDate() : "-";
  }
  function ymd(dt) {
    const d = parse(dt);
    return d ? UI.ymd(d) : "-";
  }
  function dateTime(dt) {
    const d = parse(dt);
    return d ? UI.ymd(d) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) : "-";
  }

  // ---------- 주소 쿼리 ----------
  function param(name) { return new URLSearchParams(location.search).get(name); }
  function numParam(name) {
    const n = Number(param(name));
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  // ---------- 사진 ----------
  // 명세 1-6: jpg·png·webp, 5MB 이하 (서버도 다시 검사)
  const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const MAX_BYTES = 5 * 1024 * 1024;
  // 서버가 주는 공개 사진 주소 "/uploads/…" → 서버 주소를 붙인 전체 주소 (명세 1-6)
  function publicUrl(url) {
    if (!url) return null;
    if (/^https?:\/\//.test(url)) return url;
    return url.charAt(0) === "/" ? API_BASE + url : null;
  }
  // 손님이 누를 웹 주소인지 (예약 링크·매장 웹사이트)
  //   서버·명세는 "http(s):// 로 시작"만 본다 → javascript: 실행은 막히지만 "http://javascript:", "http://abc" 같은
  //   열리지 않는 주소도 통과한다. 화면에서는 도메인(점이 있는 이름)까지 있는지 한 번 더 본다
  function isWebUrl(v) {
    let u;
    try { u = new URL(v); } catch (e) { return false; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return /^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/i.test(u.hostname);
  }
  // 작은 사진 칸 (매장 사진·테마 사진). 없거나 못 불러오면 장르 색 대신 칸 (ui.js)
  function thumb(url, title, genres, cls) {
    const box = el("div", cls || "thumb");
    box.append(UI.poster({ posterUrl: url, title: title, genres: genres || [] }));
    return box;
  }
  function checkImage(file) {
    if (!file) return null;
    if (IMAGE_TYPES.indexOf(file.type) === -1) return "이미지 파일(jpg, png, webp)만 올릴 수 있어요.";
    if (file.size > MAX_BYTES) return "파일은 5MB까지 올릴 수 있어요.";
    return null;
  }

  // 파일 칸을 고르면 미리보기. 규칙에 안 맞으면 칸을 비우고 hint 에 이유를 쓴다
  //   current: 지금 저장된 사진 주소 (수정 화면, "/uploads/…")
  function bindImageInput(input, preview, hint, current, emptyText) {
    let objectUrl = null;
    function show(src, alt) {
      preview.textContent = "";
      if (!src) {
        preview.append(emptyText || "선택한 사진이 없어요");
        return;
      }
      const img = el("img");
      img.alt = alt;
      img.src = src;
      img.addEventListener("error", function () { preview.textContent = "사진을 불러오지 못했어요"; }, { once: true });
      preview.append(img);
    }
    const currentSrc = publicUrl(current);
    show(currentSrc, "지금 사진");

    input.addEventListener("change", function () {
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      const file = input.files[0];
      const err = checkImage(file);
      hint.classList.toggle("bad", !!err);
      if (err) {
        hint.textContent = err;
        input.value = "";
        show(currentSrc, "지금 사진");
        return;
      }
      hint.textContent = file ? file.name + " (" + Math.ceil(file.size / 1024) + "KB)" : "";
      if (!file) { show(currentSrc, "지금 사진"); return; }
      objectUrl = URL.createObjectURL(file);
      show(objectUrl, "고른 사진 미리보기");
    });
  }

  // 토큰이 필요한 등록증 이미지 (A-11, C-15). 파일이 없으면 404 → 안내 글
  async function privateImage(path, box, alt) {
    box.textContent = "불러오는 중…";
    try {
      const blob = await api.blob(path);
      const url = URL.createObjectURL(blob);
      box.textContent = "";
      if (blob.type === "application/pdf") {
        const a = el("a", null, "PDF 파일 열기 ↗");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        box.append(a);
        return;
      }
      const img = el("img");
      img.alt = alt;
      img.src = url;
      img.addEventListener("error", function () { box.textContent = "이미지를 열 수 없는 파일이에요."; }, { once: true });
      box.append(img);
    } catch (e) {
      box.textContent = e.status === 404 ? "올린 파일이 없어요." : e.message;
    }
  }

  // ---------- 반려 사유 팝업 ----------
  // 명세 C-16·C-19: 반려할 때 사유 필수 1~300자. 확인 → 사유 문자열, 취소 → null
  function askReason(title, help) {
    return new Promise(function (resolve) {
      const dlg = el("dialog", "m-dialog");
      dlg.setAttribute("aria-labelledby", "m-dialog-title");
      const form = el("form");
      form.method = "dialog";
      const h = el("h2", null, title);
      h.id = "m-dialog-title";
      const ta = el("textarea");
      ta.maxLength = 300;
      ta.required = true;
      ta.placeholder = "사장님 화면에 그대로 보여요. 무엇을 고치면 되는지 적어 주세요.";
      ta.setAttribute("aria-label", "반려 사유");
      const count = el("p", "hint m-count", "0 / 300");
      ta.addEventListener("input", function () { count.textContent = ta.value.length + " / 300"; });
      const actions = el("div", "m-actions");
      const cancel = el("button", "btn btn-line", "취소");
      cancel.type = "button";
      const ok = el("button", "btn btn-danger", "반려");
      ok.type = "submit";
      actions.append(cancel, ok);
      form.append(h, el("p", null, help), ta, count, actions);
      dlg.append(form);
      document.body.append(dlg);

      let result = null;
      cancel.addEventListener("click", function () { dlg.close(); });
      form.addEventListener("submit", function (e) {
        const v = ta.value.trim();
        if (!v) { e.preventDefault(); ta.focus(); return; }
        result = v;
      });
      dlg.addEventListener("close", function () { dlg.remove(); resolve(result); });
      dlg.showModal();
      ta.focus();
    });
  }

  // ---------- 사장 화면 경로 (내 매장 › 홍대점 › 사라진 탐정) ----------
  //   items: [[글자, 주소], ..., [글자]]. 마지막은 지금 화면이라 링크 없음
  //   맨 앞 "내 매장"(관리자는 "매장 관리")은 자동으로 붙인다
  //   ?list=1: 매장이 1개뿐이어도 목록을 보여 줌 (안 붙이면 바로 그 매장 화면으로 넘어감)
  function crumbs(box, items) {
    box.textContent = "";
    const all = [[isAdmin() ? "매장 관리" : "내 매장", Routes.url("owner", { list: 1 })]].concat(items);
    all.forEach(function (it, i) {
      if (i) box.append(el("span", "sep", "›"));
      if (it[1] && i < all.length - 1) {
        const a = el("a", null, it[0]);
        a.href = it[1];
        box.append(a);
      } else {
        box.append(el("span", "here", it[0]));
      }
    });
  }

  // 매장 순서: 승인됨 → 승인 대기 → 반려, 같은 상태끼리는 최근 등록 순 (C-1 은 등록일 최신순으로만 줌)
  const STORE_ORDER = { APPROVED: 0, PENDING: 1, REJECTED: 2 };
  function sortStores(list) {
    function rank(s) { return s.status in STORE_ORDER ? STORE_ORDER[s.status] : 9; }
    return list.slice().sort(function (a, b) {
      const d = rank(a) - rank(b);
      return d || new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  // 내 매장 하나 (매장 하나만 주는 API 가 없어서 C-1 목록에서 찾음). 없거나 남의 매장이면 null
  async function myStore(storeId) {
    const list = await api.get("/api/owner/stores");
    return list.find(function (s) { return s.storeId === storeId; }) || null;
  }

  // ---------- 승인 목록 위쪽 탭 (S22 매장 승인 · S15 테마 승인) ----------
  //   active: "stores" | "themes". 탭 옆 숫자는 승인 대기 수 (C-12)
  function approvalTabs(box, active) {
    const tabs = [["stores", "adminStores", "매장"], ["themes", "adminThemes", "테마"]];
    const links = {};
    tabs.forEach(function (t) {
      const a = el("a", null, t[2]);
      a.href = Routes.url(t[1]);
      if (t[0] === active) a.setAttribute("aria-current", "page");
      links[t[0]] = a;
      box.append(a);
    });
    api.get("/api/admin/summary").then(function (s) {
      links.stores.textContent = "매장 (" + s.pendingStores + ")";
      links.themes.textContent = "테마 (" + s.pendingThemes + ")";
    }).catch(function () { /* 숫자만 못 보여 줌 */ });
  }

  // 상태 고르기 칩. list 한 칸은 상태("PENDING") 또는 [상태, 글자] (승인 요청 화면은 "대기" · "반려")
  function statusChips(box, list, current, onPick) {
    list.forEach(function (item) {
      const st = Array.isArray(item) ? item[0] : item;
      const b = el("button", null, Array.isArray(item) ? item[1] : statusText(st));
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(st === current));
      b.addEventListener("click", function () {
        box.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
        onPick(st);
      });
      box.append(b);
    });
  }
  function statusText(status) { return (STATUS[status] || [status])[0]; }

  // ---------- 폼 도우미 ----------
  // 버튼을 잠그고 글자를 바꿨다가 되돌린다
  function busy(btn, on, text) {
    if (on) {
      btn.dataset.text = btn.textContent;
      btn.textContent = text || "처리 중…";
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.text || btn.textContent;
      btn.disabled = false;
    }
  }
  // 폼 위쪽 오류 칸에 서버 메시지를 보여 주고 그 칸으로 스크롤
  function showError(box, msg) {
    box.textContent = msg || "";
    box.hidden = !msg;
    if (msg) box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  // 글자 수 표시 (maxlength 칸 옆)
  function counter(input, out) {
    function paint() { out.textContent = input.value.length + " / " + input.maxLength; }
    input.addEventListener("input", paint);
    paint();
  }

  // ---------- 승인 상세 · 매장 관리 상세 공용 칸 (관리자 개편 11/23) ----------
  // 이름 아래 "글자 값" 칸들. rows: [[글자, 값, 빨강?], …] (값이 없으면 그 칸은 뺌)
  function metaRow(box, rows) {
    box.textContent = "";
    rows.forEach(function (r) {
      if (r[1] === null || r[1] === undefined || r[1] === "") return;
      const d = el("div", r[2] ? "red" : null);
      d.append(el("span", null, r[0]), el("b", null, r[1]));
      box.append(d);
    });
  }
  // 이름-값 목록. 값은 글자 또는 요소. 빈 값은 "-"
  function dlRows(rows) {
    const dl = el("dl", "m-dl");
    rows.forEach(function (r) {
      const dd = el("dd");
      if (r[1] instanceof Node) dd.append(r[1]);
      else dd.textContent = r[1] === null || r[1] === undefined || r[1] === "" ? "-" : r[1];
      dl.append(el("dt", null, r[0]), dd);
    });
    return dl;
  }
  // 새 창 링크 (http(s) 주소만. 아니면 글자 그대로)
  function webLink(href) {
    const safe = UI.safeUrl(href);
    if (!safe) return href || "-";
    const a = el("a", null, safe + " ↗");
    a.href = safe;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }
  // 칸 제목: <section><div 제목줄><h2>제목</h2>[오른쪽]</div>…</section>
  //   n(①②③)은 예전 자리. 번호는 화면에 보이지 않음 (11/23)
  function section(n, title, right) {
    const sec = el("section", "ad-sec");
    const h = el("div", "ad-sec-h");
    const h2 = el("h2", null, title);
    h.append(h2);
    if (right) h.append(right);
    sec.append(h);
    return sec;
  }
  // 매장 칸: 작은 사진 + 지역·전화·영업시간·웹사이트·소개 (C-14 모양)
  function storePublic(s) {
    const card = el("div", "m-card ad-pub");
    card.append(thumb(s.photoUrl, s.name));
    card.append(dlRows([
      ["지역", s.area], ["주소", s.address], ["전화", s.phone], ["영업시간", s.hours],
      ["웹사이트", webLink(s.websiteUrl)], ["소개", s.intro],
    ]));
    return card;
  }
  // 서류 칸: 사업장등록증(C-15) · 사장 사업자등록증(A-11) 나란히. 관리자 직접 등록이면 사업장등록증만
  function storeDocs(s) {
    const wrap = el("div", "ad-docs");
    const place = el("div", "m-card ad-doc");
    const pv = el("div", "m-preview");
    place.append(el("h3", null, "사업장등록증"), pv,
      dlRows([["상호", s.name], ["주소", s.address], ["등록번호", s.bizPlaceNo]]));
    wrap.append(place);
    if (s.hasBizPlaceFile) privateImage("/api/admin/stores/" + s.storeId + "/biz-place-file", pv, "사업장등록증");
    else pv.textContent = s.owner ? "올린 사업장등록증이 없어요." : "관리자가 등록한 매장이라 등록증이 없어요.";
    if (s.owner) {
      const own = el("div", "m-card ad-doc");
      const opv = el("div", "m-preview");
      own.append(el("h3", null, "사업자등록증"), opv, dlRows([
        ["사장", s.owner.loginId + " (" + s.owner.nickname + ")"],
        ["사업자번호", s.owner.bizNo],
        ["가입일", s.owner.joinedAt ? ymd(s.owner.joinedAt) : null],
      ]));
      wrap.append(own);
      privateImage("/api/admin/members/" + s.owner.memberId + "/biz-file", opv, "사업자등록증");
    }
    return wrap;
  }

  // ---------- 쪽 나누기 ‹ 1 2 3 › (목록을 한 번에 받아 화면에서 나눔) ----------
  //   total 개를 per 개씩. 한 쪽뿐이면 null. 누르면 onGo(쪽)
  function pager(total, page, per, onGo) {
    const pages = Math.ceil(total / per);
    if (pages <= 1) return null;
    const nav = el("nav", "m-pager");
    nav.setAttribute("aria-label", "쪽 넘기기");
    function btn(text, target, opts) {
      const b = el("button", "m-pg" + (opts.cls ? " " + opts.cls : ""), text);
      b.type = "button";
      b.setAttribute("aria-label", opts.aria);
      if (opts.current) b.setAttribute("aria-current", "page");
      b.disabled = !!opts.disabled;
      b.addEventListener("click", function () { onGo(target); });
      nav.append(b);
    }
    btn("‹", page - 1, { cls: "arrow", aria: "이전 쪽", disabled: page === 1 });
    // 쪽이 많으면 지금 쪽 앞뒤 2개 + 처음·끝만 (1 … 4 5 6 7 8 … 30)
    let last = 0;
    for (let p = 1; p <= pages; p++) {
      if (p !== 1 && p !== pages && Math.abs(p - page) > 2) continue;
      if (p - last > 1) nav.append(el("span", "m-pg-gap", "…"));
      btn(String(p), p, { current: p === page, aria: p + "쪽" });
      last = p;
    }
    btn("›", page + 1, { cls: "arrow", aria: "다음 쪽", disabled: page === pages });
    return nav;
  }

  return {
    guard: guard, isAdmin: isAdmin, stop: stop, pager: pager,
    metaRow: metaRow, dlRows: dlRows, webLink: webLink, section: section, storePublic: storePublic, storeDocs: storeDocs,
    badge: badge, rejectNote: rejectNote,
    md: md, ymd: ymd, dateTime: dateTime,
    param: param, numParam: numParam,
    publicUrl: publicUrl, isWebUrl: isWebUrl, thumb: thumb,
    checkImage: checkImage, bindImageInput: bindImageInput, privateImage: privateImage,
    approvalTabs: approvalTabs, statusChips: statusChips, statusText: statusText,
    crumbs: crumbs, sortStores: sortStores, myStore: myStore,
    askReason: askReason, busy: busy, showError: showError, counter: counter,
  };
})();
