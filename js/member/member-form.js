// 회원 폼 공용 도우미 (A 담당). 손님 가입 · 사장 가입 · 내 정보 화면이 같이 쓴다
//   MemberForm.dupCheck(...)   아이디·닉네임·사업자번호 중복 확인 (A-3 ~ A-5)
//   MemberForm.passwordMatch() 비밀번호 확인 칸
//   MemberForm.setMsg()        칸 아래 안내 문구 (ok / bad / 보통)
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

  // 서버 규칙과 같은 검사 (SignupUserRequest / SignupOwnerRequest)
  const rules = {
    loginId: function (v) { return /^[a-z0-9]{4,20}$/.test(v) ? null : "아이디는 영문 소문자와 숫자 4~20자로 입력해 주세요."; },
    password: function (v) { return v.length >= 4 && v.length <= 20 ? null : "비밀번호는 4~20자로 입력해 주세요."; },
    nickname: function (v) { return v.length >= 2 && v.length <= 20 ? null : "닉네임은 2~20자로 입력해 주세요."; },
    bizNo: function (v) { return /^\d{3}-\d{2}-\d{5}$/.test(v) ? null : "사업자등록번호 형식이 올바르지 않습니다. (000-00-00000)"; },
  };

  return { setMsg: setMsg, dupCheck: dupCheck, passwordMatch: passwordMatch, rules: rules };
})();
