# escaplix-frontend-repository
방탈출 통합 예약 프론트엔드

## 폴더 구조

```
index.html                  메인 (Live Server 시작 화면이라 맨 위에 둠)
pages/{영역}/{화면}.html     화면
js/{영역}/{화면}.js          그 화면의 스크립트 (pages와 같은 폴더·이름)
js/common/                  공용 (아래 표)
css/                        common.css + 화면별 css
img/                        화면용 이미지 (로고 등). 테마 포스터는 백엔드가 관리해요
```

| 영역 | 화면 | 담당 |
| --- | --- | --- |
| `member` | login, signup, signup-user, signup-owner | A |
| `party` | party-list, party-form, party-room | A |
| `theme` | theme | B |
| `store` | stores, store, map | B |
| `mypage` | mypage, wishes, chats, profile (마이페이지 탭) | A·B·D |
| `owner` | owner, store-form, owner-theme, owner-slots | C |
| `admin` | admin, admin-stores, admin-store-detail, admin-themes, admin-theme-detail, admin-members | C |

### 공용 파일 (`js/common/`)

| 파일 | 하는 일 |
| --- | --- |
| `routes.js` | 화면 주소표. `Routes.url("theme", { id: 1 })` |
| `api.js` | 서버 요청(`api.get/post/put/del`), 토큰(`Auth.me()` → `{ memberId, nickname, role }`) |
| `ui.js` | 화면 도우미: 테마 카드, 가로 줄, 찜 버튼, 알림(toast) |
| `header.js` | 위쪽 헤더. 로그인한 역할(비회원·USER·OWNER·ADMIN)에 따라 메뉴가 달라짐. 메뉴는 파일 위쪽 `MENU` 표에서 고쳐요 |
| `footer.js` | 아래쪽 footer |

헤더와 footer는 HTML에 쓰지 않아요. 스크립트가 알아서 넣어요.

### 규칙
- 화면 파일은 `pages/{영역}/` 안에 두고, 스크립트는 `js/{영역}/`에 같은 이름으로 둬요. 예: `pages/party/party-room.html` ↔ `js/party/party-room.js`
- `pages/` 안의 화면은 공용 파일을 `../../`로 불러요. 아래 순서를 지켜 주세요.
  ```html
  <link rel="stylesheet" href="../../css/common.css">
  <script src="../../js/common/routes.js"></script>
  <script src="../../js/common/api.js"></script>
  <script src="../../js/common/ui.js"></script>
  <script src="../../js/common/header.js"></script>
  <script src="../../js/common/footer.js"></script>
  <script src="../../js/party/party-room.js"></script>
  ```
- 다른 화면으로 가는 링크는 JS에서 `"theme.html?id=1"`처럼 직접 쓰지 말고 `Routes.url("theme", { id: 1 })`를 써요. 화면 주소는 [js/common/routes.js](js/common/routes.js) 한 곳에만 적어요. 새 화면을 만들면 거기에 한 줄 추가해 주세요.
