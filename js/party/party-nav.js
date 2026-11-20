// 파티 화면 공용: "← 돌아가기" 링크를 왔던 화면에 맞춘다 (A 담당)
//   홈에서 "파티 모집하기"로 왔으면 "← 홈으로", 테마 상세에서 왔으면 "← 테마 상세로" … → 누르면 브라우저 뒤로가기처럼
//   우리 사이트의 아는 화면이 아니면 (주소 직접 입력 · 새 탭 · 로그인 거쳐 옴 · 만들기 직후) 기본 화면(파티 목록)으로
const PartyNav = (function () {
  // 돌아갈 수 있는 화면 (routes.js 이름 → 링크 문구)
  const LABELS = {
    home: "홈으로", theme: "테마 상세로", stores: "매장 목록으로", store: "매장 상세로",
    partyList: "파티 목록", chats: "내 채팅", wishes: "찜 목록으로", mypage: "마이페이지로",
  };

  // 바로 전 화면이 위 표의 어느 화면인지 (없으면 null)
  function from() {
    const ref = document.referrer;
    if (!ref || ref.indexOf(Routes.ROOT) !== 0) return null;
    const refPath = new URL(ref).pathname.replace(/\/$/, "/index.html");
    if (refPath === location.pathname) return null;   // 같은 화면 새로고침
    const names = Object.keys(LABELS);
    for (let i = 0; i < names.length; i++) {
      if (new URL(Routes.url(names[i])).pathname === refPath) return { name: names[i], url: ref };
    }
    return null;
  }

  /**
   * link: <a> 요소, fallback: { name, params } (기본 파티 목록)
   * 반환: { go(): 같은 곳으로 이동 (취소 · 나가기 · 삭제 뒤), label: "내 채팅" 같은 화면 이름 }
   */
  function setup(link, fallback) {
    const fb = fallback || { name: "partyList" };
    const prev = from();
    const target = prev ? prev.url : Routes.url(fb.name, fb.params);
    const label = prev ? LABELS[prev.name] : LABELS[fb.name] || "돌아가기";
    link.textContent = "← " + label;
    link.href = target;

    function go() {
      // 바로 전 기록이 그 화면이면 뒤로가기 (스크롤·필터 그대로), 아니면 그 주소로
      if (prev && history.length > 1) history.back();
      else location.href = target;
    }
    link.addEventListener("click", function (e) {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;   // 새 탭으로 열기는 그대로
      e.preventDefault();
      go();
    });
    return { go: go, label: label.replace(/으로$/, "") };
  }

  return { setup: setup };
})();
