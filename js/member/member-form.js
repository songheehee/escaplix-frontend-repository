// 회원 폼 공용 도우미 (A 담당). 손님 가입 · 사장 가입 · 내 정보 화면이 같이 쓴다
//   MemberForm.dupCheck(...)   아이디·닉네임·사업자번호 중복 확인 (A-3 ~ A-5)
//   MemberForm.passwordMatch() 비밀번호 확인 칸
//   MemberForm.setMsg()        칸 아래 안내 문구 (ok / bad / 보통)
//   MemberForm.emailVerify()   이메일 인증번호 받기 → 확인
// 서버가 가입할 때 다시 확인하므로, 여기 검사는 "미리 알려 주기" 용도다
const MemberForm = (function () {
  // 칸 아래 문구. kind: "ok" | "bad" | "" (회색 안내)
  function setMsg(msgEl, input, text, kind) {
    msgEl.textContent = text || "";
    msgEl.className = "field-msg" + (kind ? " " + kind : "");
    if (input) {
      if (kind === "bad") input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  }

  /**
   * 중복 확인 칸 하나
   * @param o.input     입력칸
   * @param o.button    "중복 확인" 버튼
   * @param o.msg       칸 아래 문구 요소
   * @param o.path      확인 API 주소 ("/api/members/check-login-id")
   * @param o.param     쿼리 이름 ("loginId")
   * @param o.validate  값 → 형식이 틀리면 문구, 맞으면 null
   * @param o.okText / o.takenText  결과 문구
   * @param o.normalize 값 다듬기 (기본: 앞뒤 공백 지우기)
   * @returns { ensure(): Promise<boolean> }  가입 버튼을 누를 때: 아직 확인 안 했으면 확인하고 결과를 돌려준다
   */
  function dupCheck(o) {
    const normalize = o.normalize || function (v) { return v.trim(); };
    let checkedValue = null;   // 마지막으로 "사용 가능"을 받은 값
    let pending = null;

    // 값을 바꾸면 다시 확인해야 함
    o.input.addEventListener("input", function () {
      checkedValue = null;
      const v = normalize(o.input.value);
      const err = v ? o.validate(v) : null;
      setMsg(o.msg, o.input, err || (v ? "중복 확인을 눌러 주세요." : ""), err ? "bad" : "");
    });
    o.button.addEventListener("click", function () { check(); });

    async function check() {
      const v = normalize(o.input.value);
      const err = v ? o.validate(v) : o.emptyText;
      if (err) { setMsg(o.msg, o.input, err, "bad"); o.input.focus(); return false; }
      if (checkedValue === v) return true;
      if (pending) return pending;

      o.button.disabled = true;
      pending = (async function () {
        try {
          const q = {};
          q[o.param] = v;
          const res = await api.get(o.path, q);
          if (normalize(o.input.value) !== v) return false;   // 기다리는 사이 값을 바꿈
          if (res.available) {
            checkedValue = v;
            setMsg(o.msg, o.input, o.okText, "ok");
            return true;
          }
          setMsg(o.msg, o.input, o.takenText, "bad");
          return false;
        } catch (e) {
          setMsg(o.msg, o.input, e.message, "bad");   // 형식 오류 400 등은 서버 문구 그대로
          return false;
        } finally {
          o.button.disabled = false;
          pending = null;
        }
      })();
      return pending;
    }

    return {
      ensure: check,
      // 가입 요청이 409 로 실패했을 때 (그 사이 누가 먼저 씀)
      taken: function (text) { checkedValue = null; setMsg(o.msg, o.input, text || o.takenText, "bad"); o.input.focus(); },
    };
  }

  /** 비밀번호 · 비밀번호 확인. 반환: ok() → 둘 다 맞으면 true (아니면 문구를 띄우고 false) */
  function passwordMatch(pw, pw2, pwMsg, pw2Msg, rule) {
    function paint() {
      const ruleErr = pw.value ? rule(pw.value) : null;
      setMsg(pwMsg, pw, ruleErr || "", ruleErr ? "bad" : "");
      if (!pw2.value) setMsg(pw2Msg, pw2, "", "");
      else if (pw.value === pw2.value) setMsg(pw2Msg, pw2, "비밀번호가 같아요.", "ok");
      else setMsg(pw2Msg, pw2, "비밀번호가 달라요.", "bad");
    }
    pw.addEventListener("input", paint);
    pw2.addEventListener("input", paint);
    return {
      ok: function () {
        if (!pw.value) { setMsg(pwMsg, pw, "비밀번호를 입력해 주세요.", "bad"); pw.focus(); return false; }
        const ruleErr = rule(pw.value);
        if (ruleErr) { setMsg(pwMsg, pw, ruleErr, "bad"); pw.focus(); return false; }
        if (pw.value !== pw2.value) {
          setMsg(pw2Msg, pw2, pw2.value ? "비밀번호가 달라요." : "비밀번호를 한 번 더 입력해 주세요.", "bad");
          pw2.focus();
          return false;
        }
        return true;
      },
    };
  }

  /**
   * 이메일 인증 칸: [이메일][인증번호 전송] → [6자리][확인]
   *   보낸 뒤 버튼은 "재전송". 인증번호 제한시간(5분)이 끝나야 켜짐 (버튼에 남은 초는 안 씀, 남은 시간은 인증번호 줄 아래에)
   * 서버 규칙: 인증번호 5분 유효, 다시 받기는 60초 뒤, 5번 틀리면 다시 받기, 맞힌 뒤 30분 안에 가입
   * @param o.input / o.sendBtn / o.msg       이메일 칸 · 받기 버튼 · 문구
   * @param o.codeRow / o.code / o.verifyBtn / o.codeMsg  인증번호 줄 (처음엔 hidden)
   * @param o.sendPath / o.verifyPath        API 주소
   * 다른 칸과 같이 인증할 때 (비밀번호 재설정: 아이디 + 이메일)
   * @param o.extra()      요청에 같이 보낼 값 ({ loginId })
   * @param o.watch        그 칸들 (고치면 인증을 처음부터)
   * @param o.checkExtra() 보내기 전에 그 칸 검사 (틀리면 스스로 문구를 띄우고 false)
   * @param o.sentText / o.verifiedText  보냄 · 인증 완료 문구
   * @param o.onVerified() 인증을 마쳤을 때
   * @returns { ensure(): boolean, value(): string, taken(text), expired(text) }
   */
  function emailVerify(o) {
    const CODE_SEC = 300;
    const RESEND_TEXT = "재전송";
    const SEND_TEXT = o.sendBtn.textContent;
    let verifiedValue = null;   // 인증을 마친 값 (key)
    let sentValue = null;       // 인증번호를 보낸 값 (key)
    let resendTimer = null, codeTimer = null;

    function norm() { return o.input.value.trim().toLowerCase(); }
    function extra() { return o.extra ? o.extra() : {}; }
    // 인증 대상 = 이메일 + 같이 보내는 칸. 하나라도 바뀌면 다른 인증
    function key() { return norm() + "\n" + JSON.stringify(extra()); }
    function mmss(s) { return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

    function stopTimers() { clearInterval(resendTimer); clearInterval(codeTimer); resendTimer = codeTimer = null; }
    function resetSendBtn(label) { o.sendBtn.disabled = false; o.sendBtn.textContent = label || SEND_TEXT; }
    function hideCode() { o.codeRow.hidden = true; o.code.value = ""; setMsg(o.codeMsg, o.code, "", ""); }

    // 이메일(이나 같이 보내는 칸)을 고치면 인증을 처음부터
    function changed(isEmail) {
      if (verifiedValue === null && sentValue === null) {
        if (!isEmail) return;
        const v = norm();
        const err = v ? rules.email(v) : null;
        setMsg(o.msg, o.input, err || "", err ? "bad" : "");   // "인증번호를 전송해 주세요" 같은 안내는 안 띄움
        return;
      }
      verifiedValue = sentValue = null;
      stopTimers();
      hideCode();
      resetSendBtn();
      setMsg(o.msg, o.input, (isEmail ? "이메일이" : "입력한 정보가") + " 바뀌었어요. 인증번호를 다시 받아 주세요.", "");
    }
    o.input.addEventListener("input", function () { changed(true); });
    (o.watch || []).forEach(function (w) { w.addEventListener("input", function () { changed(false); }); });
    o.sendBtn.addEventListener("click", send);
    o.verifyBtn.addEventListener("click", verify);
    o.code.addEventListener("input", function () { o.code.value = o.code.value.replace(/\D/g, "").slice(0, 6); });
    o.code.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); verify(); } });

    async function send() {
      const v = norm();
      const err = v ? rules.email(v) : "이메일을 입력해 주세요.";
      if (o.checkExtra && !o.checkExtra()) return;
      if (err) { setMsg(o.msg, o.input, err, "bad"); o.input.focus(); return; }
      const k = key();
      o.sendBtn.disabled = true;
      o.sendBtn.textContent = "보내는 중…";
      try {
        await api.post(o.sendPath, Object.assign({ email: v }, extra()));
        if (key() !== k) return;   // 기다리는 사이 칸을 고침 (input 이 이미 초기화함)
        sentValue = k;
        verifiedValue = null;
        setMsg(o.msg, o.input, o.sentText || "인증번호를 보냈어요. 메일함 또는 스팸함을 확인해 주세요.", "ok");
        o.codeRow.hidden = false;
        o.code.value = "";
        o.verifyBtn.disabled = false;
        o.code.focus();
        startTimers();
      } catch (e) {
        setMsg(o.msg, o.input, e.message, "bad");   // 409 이미 가입 · 429 잠시 후 · 503 메일 실패
        resetSendBtn(sentValue ? RESEND_TEXT : null);
      }
    }

    // 인증번호 줄 문구 = (마지막 오류 · ) 남은 시간
    let codeNote = "", codeLeft = 0;
    function paintCode() {
      setMsg(o.codeMsg, o.code, (codeNote ? codeNote + " · " : "") + "남은 시간 " + mmss(codeLeft), codeNote ? "bad" : "");
    }

    function startTimers() {
      stopTimers();
      codeLeft = CODE_SEC;
      codeNote = "";
      // [재전송]은 제한시간이 끝날 때까지 꺼 둠 (남은 시간은 아래 줄에 보여 줌)
      o.sendBtn.textContent = RESEND_TEXT;
      o.sendBtn.disabled = true;
      paintCode();
      codeTimer = setInterval(function () {
        codeLeft--;
        if (codeLeft > 0) { paintCode(); return; }
        clearInterval(codeTimer); codeTimer = null;
        o.verifyBtn.disabled = true;
        resetSendBtn(RESEND_TEXT);
        setMsg(o.codeMsg, o.code, "인증 시간이 지났어요. 인증번호를 다시 받아 주세요.", "bad");
      }, 1000);
    }

    async function verify() {
      const k = sentValue;
      const code = o.code.value.trim();
      if (!k || key() !== k) return;
      if (!/^\d{6}$/.test(code)) { setMsg(o.codeMsg, o.code, "인증번호 6자리를 입력해 주세요.", "bad"); o.code.focus(); return; }
      o.verifyBtn.disabled = true;
      try {
        await api.post(o.verifyPath, Object.assign({ email: norm(), code: code }, extra()));
        if (key() !== k) return;
        verifiedValue = k;
        stopTimers();
        hideCode();
        resetSendBtn(RESEND_TEXT);
        setMsg(o.msg, o.input, o.verifiedText || "이메일 인증을 마쳤어요.", "ok");
        if (o.onVerified) o.onVerified();
      } catch (e) {
        // 5번 틀렸거나 만료면 그 번호는 끝: 확인은 끄고 받기 버튼을 바로 켠다
        if (/다시 받아/.test(e.message)) {
          stopTimers();
          resetSendBtn(RESEND_TEXT);
          setMsg(o.codeMsg, o.code, e.message, "bad");
        } else {   // 틀림 (n/5): 문구 옆에 남은 시간은 계속
          codeNote = e.message;
          paintCode();
          o.verifyBtn.disabled = false;
          o.code.select();
        }
      }
    }

    return {
      /** 가입 버튼을 누를 때: 지금 이메일로 인증을 마쳤는지 (아니면 문구를 띄우고 false) */
      ensure: function () {
        const v = norm();
        if (!v) { setMsg(o.msg, o.input, "이메일을 입력해 주세요.", "bad"); o.input.focus(); return false; }
        const k = key();
        if (verifiedValue === k) return true;
        if (sentValue === k && !o.codeRow.hidden) {
          if (codeTimer) {   // 아직 시간 안: 번호를 넣고 확인하라고
            codeNote = "받은 인증번호를 입력하고 확인을 눌러 주세요.";
            paintCode();
            o.code.focus();
          } else {           // 시간이 지났거나 5번 틀림: 문구는 그대로, 받기 버튼으로
            o.sendBtn.focus();
          }
        } else {
          const err = rules.email(v);
          setMsg(o.msg, o.input, err || "이메일 인증을 해 주세요. (인증번호 전송)", "bad");
          o.input.focus();
        }
        return false;
      },
      value: norm,
      /** 처음 상태로 (팝업을 다시 열 때) */
      reset: function () {
        verifiedValue = sentValue = null; stopTimers(); hideCode(); resetSendBtn();
        o.input.value = "";
        setMsg(o.msg, o.input, "", "");
      },
      /** 가입 요청이 409 (그 사이 다른 사람이 그 이메일로 가입) */
      taken: function (text) {
        verifiedValue = sentValue = null; stopTimers(); hideCode(); resetSendBtn();
        setMsg(o.msg, o.input, text, "bad"); o.input.focus();
      },
      /** 가입 요청이 400 "이메일 인증을 먼저" (인증 후 30분이 지남 등) */
      expired: function (text) {
        verifiedValue = sentValue = null; stopTimers(); hideCode(); resetSendBtn();
        setMsg(o.msg, o.input, text + " 인증번호를 다시 받아 주세요.", "bad"); o.input.focus();
      },
    };
  }

  // 서버 규칙과 같은 검사 (SignupUserRequest / SignupOwnerRequest)
  const rules = {
    email: function (v) {
      if (v.length > 100) return "이메일은 100자 이내로 입력해 주세요.";
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "이메일 형식이 올바르지 않습니다.";
    },
    loginId: function (v) { return /^[a-z0-9]{4,20}$/.test(v) ? null : "아이디는 영문 소문자와 숫자 4~20자로 입력해 주세요."; },
    password: function (v) { return v.length >= 4 && v.length <= 20 ? null : "비밀번호는 4~20자로 입력해 주세요."; },
    nickname: function (v) { return v.length >= 2 && v.length <= 20 ? null : "닉네임은 2~20자로 입력해 주세요."; },
    bizNo: function (v) { return /^\d{3}-\d{2}-\d{5}$/.test(v) ? null : "사업자등록번호 형식이 올바르지 않습니다. (000-00-00000)"; },
  };

  return { setMsg: setMsg, dupCheck: dupCheck, passwordMatch: passwordMatch, emailVerify: emailVerify, rules: rules };
})();
