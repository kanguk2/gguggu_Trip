# gguggu_Trip — 정적 여행 페이지 프로젝트

GitHub Pages 정적 HTML + Cloudflare Worker (편집용 백엔드). 모든 페이지는 상대경로로 연결되며 모든 페이지의 `<head>`에 `noindex, nofollow` 메타태그가 포함된다.

## 디렉토리 구조

```
index.html          홈 (여행 버튼 + 하단 footer에 개발요청 버튼)
about.html          "클로드 코드에 개발 요청하기" 폼 (GitHub Issues 프리필)
travel.html         여행지 목록 (도시별 버튼 추가되는 페이지)
<city>.html         각 도시 페이지 (날씨 + 준비물 + 항공권 + 일자별 일정·지도)
<city>.js           해당 도시의 좌표·날짜·체크리스트·일정·지도 데이터 및 렌더링
notfound.html       게이트 통과 실패 시 도달 (게이트 없음)

secret.js           암호화된 시크릿 묶음 (PNR·탑승객 등)
gate.js             모든 보호 페이지가 로드하는 키 게이트
edit-page.js        모든 페이지에 ✏️ 수정요청 FAB 주입
overrides.js        도시 페이지에 메모·새 일정 UI 주입 (Worker 백엔드 연동)
request.js          about.html의 폼 → GitHub Issues URL 변환
styles.css          모든 페이지가 공유하는 단일 스타일시트
script.js           index.html의 공용 스크립트 (현재 비어있음)
robots.txt          모든 크롤러 차단
files/              여행 관련 첨부 파일 (PDF·이미지 등). 비식별 처리 필수
  uploads/          일정 항목에 첨부한 사진 (Worker uploadImage 가 자동 커밋, img-*.jpg)
trips/              도시별 동적 데이터 (overrides JSON)
  sapporo-overrides.json   사용자가 추가한 일정 + 메모 (Worker 가 갱신)
worker/             Cloudflare Worker 백엔드 소스
  index.js                 GitHub API 자동 커밋 로직
wrangler.toml       Worker 배포 설정 (npx wrangler deploy 용)
```

## 페이지 골격 — 보호 페이지

모든 보호 페이지(`index.html`, `travel.html`, `about.html`, `<city>.html`)의 `<head>` 와 `<body>` 시작:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <meta name="googlebot" content="noindex, nofollow">
  <title>...</title>
  <link rel="stylesheet" href="./styles.css">
  <script src="./secret.js"></script>     <!-- 동기, 게이트 전 로드 -->
  <script src="./gate.js"></script>        <!-- 동기, secret.js 직후 -->
  <script src="./edit-page.js" defer></script>
</head>
<body class="gated">
  <main>...</main>
  <!-- 페이지별 script 는 main 다음에 -->
</body>
```

- `body.gated` → `body.gated > main { visibility: hidden }` 로 키 입력 모달 동안 본문 가림
- `notfound.html` 만 게이트 없음 (무한 루프 방지) — secret.js / gate.js 로드 안 함

## 키 게이트 (gate.js + secret.js)

저장소가 공개이므로 PNR·이름·e-티켓 같은 민감 정보는 평문으로 두지 않는다.

- `secret.js` 구조 — PBKDF2(SHA-256, 200k iter) → AES-GCM-256 으로 암호화:
  ```js
  window.TRIP_SECRET = {
    version: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 200000 },
    cipher: "AES-GCM",
    salt: "<base64>",
    sentinel: { iv: "<base64>", ct: "<base64>" },  // 평문 "trip-gate-ok"
    payloads: { flight: { iv, ct }, /* 도시별 payload 추가 가능 */ }
  };
  ```
- `gate.js` 흐름: localStorage(`trip-gate-key-v1`) 에 키 있으면 자동 검증 → sentinel 복호화 성공 → `window.TRIP_GATE` 노출 + `body.gated` 제거 + `trip-gate:unlocked` 이벤트. 실패 → 모달 다시 띄움. 모달 입력값 틀리면 `notfound.html` 리다이렉트.
- 페이지별 JS 는 `whenUnlocked(cb)` 패턴으로 받고 `window.TRIP_GATE.decryptPayload(name)` 호출해서 필요한 부분만 복호화.

### secret.js 재생성

키 변경이나 데이터 추가 시 임시 Node 스크립트로:

```js
// _encrypt_once.mjs — 실행 후 즉시 삭제, 절대 커밋 금지
import { webcrypto as crypto } from "node:crypto";
import { writeFileSync } from "node:fs";

const PASSWORD = "<키>";
const ITERATIONS = 200000;
const PAYLOADS = {
  flight: { /* 평문 객체 */ },
  // 도시별 시크릿 페이로드 추가 가능
};
const SENTINEL = "trip-gate-ok";
// salt(16B) + per-payload IV(12B) 랜덤 생성
// PBKDF2 → AES-GCM 으로 sentinel·payloads 암호화
// 결과를 `window.TRIP_SECRET = {...};` 로 secret.js 에 쓰기
```

실행 → secret.js 갱신 → 임시 스크립트 즉시 삭제 → secret.js 만 커밋.

## 수정요청 FAB (edit-page.js)

`<main>` 안에 우측 하단 플로팅 버튼 + 모달 자동 주입. 클릭 → 제목/내용 입력 → 제출 시 GitHub Issues 생성 URL 새 탭으로 (현재는 리다이렉트 방식 유지). 이슈 제목은 `[<페이지파일명>] <사용자제목>`, 본문에는 페이지명·URL 자동 첨부. FAB 는 `<main>` 자식이라 `body.gated` 동안 자동으로 숨겨짐.

## 메모·새 일정 (overrides.js + Cloudflare Worker)

도시 페이지에서 일행과 실시간으로 메모·새 일정을 공유할 수 있다. Worker 가 GitHub API 로 `trips/<city>-overrides.json` 을 자동 커밋해서 모든 사용자가 새로고침하면 봄.

### 아키텍처

```
브라우저(<city>.html)
  ↓ GET /overrides
Cloudflare Worker (https://gguggutrip.tches0606.workers.dev)
  ↓ GitHub API (Bearer GITHUB_TOKEN)
GitHub repo (trips/sapporo-overrides.json)
  ↓ Pages 자동 빌드 (~30초)
브라우저 (다음 방문 시 최신 데이터)
```

### 데이터 구조 (`trips/<city>-overrides.json`)

```json
{
  "additions": {
    "2026-06-05": [
      { "id": "add-abc123", "time": "20:30", "name": "카페 휴식", "coords": [43.0635, 141.3520], "image": "./files/uploads/img-xxx.jpg", "links": [{ "url": "https://...", "label": "블로그 후기" }] },
      { "id": "memo-def456", "kind": "memo", "text": "환전소 위치 확인" }
    ]
  },
  "notes": {
    "2026-06-05/13:00": "이 항목 메모",
    "2026-06-05/add-abc123": "추가 항목 메모"
  },
  "checks": {
    "chk-0-0": true,
    "chk-2-3": true
  },
  "itemEdits": {
    "2026-06-05/19:00": { "time": "19:30", "name": "저녁 (변경)", "coords": [43.05, 141.35], "image": "./files/uploads/img-yyy.jpg", "links": [{ "url": "https://..." }] }
  },
  "itemOrder": {
    "2026-06-05": ["2026-06-05/add-abc123", "2026-06-05/06:30", "2026-06-05/09:20"]
  },
  "itemHidden": {
    "2026-06-05/13:00": true
  }
}
```

- `additions[date]` — 사용자가 추가한 일정. `coords` (선택)가 있으면 지도 마커도 표시. `image` (선택)는 항목 아래 전체폭 사진. `links` (선택)는 참고 링크 배열 `[{url, label?}]` — 항목 아래 칩으로 표시. **시간순 자동정렬**: 수동 드래그 순서(`itemOrder[date]`)가 있으면 Worker 가 그 안에 시간순 위치로 끼워넣고, 없으면 페이지가 시간순 배치(insertByTime). `kind: "memo"` 이면 시간·이름 없이 `text`(+선택 `image`) 만 갖는 **메모 항목** — 일정과 같은 리스트에 들어가 드래그로 위치 변경 가능, 지도에는 안 뜸. 이미지 클릭 시 확대(라이트박스).
- `notes[key]` — 메모. key 는 `<date>/<HH:MM>` (정적 항목, **원본 시간** 기준) 또는 `<date>/<add-id>` (추가 항목).
- `checks[id]` — 체크리스트 체크 상태. id 는 `chk-<category>-<item>` 형식 (sapporo.js renderChecklist 가 부여). 일행 간 공유됨.
- `itemEdits[key]` — **정적(원본 HTML) 항목의 덮어쓰기**. key 는 `<date>/<원본HH:MM>`. `time`/`name`/`coords`/`image`/`links` 부분 적용. 원본 HTML 은 그대로 두고 표시값만 바꿈. 비우면 원복. `coords: null` 은 **마커 제거**(원본 DAY_MAPS 마커까지 숨김), 배열은 마커 덮어쓰기, 키 없으면 DAY_MAPS 기본.
- `itemOrder[date]` — 그 날짜 plan-item 들의 표시 순서 (item-key 배열). 드래그·드롭으로 갱신. 키 없으면 기본 시간순. **이 값이 없을 땐 add 가 건드리지 않아 페이지가 시간순 정렬**, 있으면(드래그 후) Worker `insertKeySorted` 가 시간순 위치에 삽입.
- `itemHidden[key]` — **정적(원본) 항목 숨김**. key 는 `<date>/<원본HH:MM>`. `true` 면 그 원본 일정을 목록·지도에서 가림(원본 HTML 은 그대로, 복구 가능). 추가 항목은 `deleteItem` 으로 삭제.
- 이미지(`image`)는 `<date>` 일정 항목에 첨부한 사진의 상대경로. 실제 파일은 Worker `uploadImage` 가 `files/uploads/img-*.<ext>` 로 커밋. 클라이언트가 canvas 로 최대 1280px JPEG 로 축소 후 업로드(리포 비대화 방지).
- 링크(`links`)는 `[{url, label?}]` 배열 (최대 10개). Worker `cleanLinks` 가 `http(s)` URL 만 허용(`javascript:` 등 차단). label 없으면 호스트명 표시. 추가·편집 모달의 "참고 링크" 에디터로 여러 개 입력.

### overrides.js 동작

게이트 통과 후 실행:
1. `WORKER_URL/overrides` GET → JSON 받음
2. 정적 plan-item 의 원본 시간·이름을 `data-original-*` 에 스냅샷 → `itemEdits` 덮어쓰기 적용 (노란 배경 이탤릭) → `data-item-key` 설정 + 메모 있으면 노란 박스
3. `additions` 항목들을 해당 날짜 패널의 plan-list 에 삽입 (초록 배경) → `itemOrder` 로 재정렬
4. 모든 plan-item 우측에 ✎(편집·메모·이미지) 버튼 추가. 항목에 `image` 있으면 아래 전체폭 사진 표시
5. 각 날짜 패널 맨 아래에 `+ 새 일정 추가` · `+ 메모 추가` 버튼 추가 (메모는 텍스트만 입력, 리스트에 들어가 드래그 가능)
6. 준비물 탭: 카테고리 제목마다 ＋ 버튼(그 카테고리에 항목 추가), 맨 아래 `+ 새 카테고리 추가` 버튼
7. SortableJS 로 드래그·드롭 활성화 (0.5초 롱프레스)
8. 편집 비번은 localStorage(`trip-edit-password-v1`)에 저장, 최초 1회만 입력
9. 일정 추가/편집 모달에서 사진 첨부 가능 (자동 축소 후 Worker 가 리포에 커밋)

### Worker API

`POST /edit` — body: `{ password, action, ...payload }`

| action | payload | 동작 |
|---|---|---|
| `addItem` | `date, time, name, coords?, image?, links?` | `additions[date]` 에 새 항목 추가. `itemOrder[date]` 가 있으면 **시간순 위치**에 삽입(`insertKeySorted`), 없으면 안 건드림(페이지가 시간순). coords 는 `[lat, lng]`, image 는 상대경로, links 는 `[{url, label?}]` |
| `addMemo` | `date, text, image?` | `additions[date]` 에 `{kind:"memo", text}` 메모 항목 추가 + `itemOrder[date]` 맨 앞에 삽입. image 첨부 가능 (편집은 updateItem) |
| `updateItem` | `date, id, time?, name?, coords?, image?, text?, links?` | 추가된 항목/메모 수정. `coords: null`/`image: null` 명시하면 좌표·이미지 제거. `links: []` 면 링크 제거. 메모는 `text` 로 갱신 |
| `deleteItem` | `date, id` | 추가된 항목 삭제 |
| `setNote` | `key, note` | 메모 설정 (빈 문자열이면 삭제) |
| `setCheck` | `key, checked` | 체크리스트 항목 체크/해제 |
| `setItemEdit` | `key, time?, name?, coords?, image?, links?` | 정적 항목 덮어쓰기. `coords: null` 면 **마커 제거(원본 DAY_MAPS 포함)**, `image: null` 이면 이미지 제거, `links: []` 면 링크 제거. 모든 값 비면 해당 키 제거 (원복) |
| `setItemHidden` | `key, hidden` | 정적(원본) 항목 숨김/복구. `itemHidden[key]` 설정·삭제. 목록·지도에서 가림 |
| `setOrder` | `date, order` | `itemOrder[date]` 를 order 배열로 교체 (드래그 결과 저장) |
| `addCheckItem` | `category, label` | `checklistAdds` 에 사용자 준비물 항목 추가 (해당 카테고리, 없으면 새 카테고리 생성) |
| `editCheckItem` | `id, label` | 준비물 항목 내용 수정 (추가 항목은 직접, 정적 항목은 `checklistEdits[id]`) |
| `deleteCheckItem` | `id` | 준비물 항목 삭제 (추가 항목 제거 / 정적 항목은 `checklistHidden[id]`) |
| `uploadImage` | `filename, dataBase64` | 이미지를 `files/uploads/img-*.<ext>` 로 커밋 후 상대경로 반환 (overrides JSON 은 안 건드림). 이후 addItem/updateItem/setItemEdit 의 `image` 로 연결 |

### overrides.js 페이지 측 동작

게이트 통과 후 실행되는 주요 함수:

- `snapshotOriginals()` — 정적 plan-item 의 원본 시간·이름을 `data-original-time/name` 에 1회 저장 (itemEdits 적용 전 기준값)
- `applyItemEdits()` — overrides.itemEdits 로 정적 항목 시간·이름 덮어쓰기 + `.plan-item-overridden` 클래스 (노란 배경) + `image` 있으면 항목 아래 전체폭 사진(`setPlanItemImage`) + `links` 있으면 링크 칩(`setPlanItemLinks`)
- `applyItemHidden()` — `itemHidden[key]` 인 정적 plan-item 에 `.plan-item-hidden`(display:none) 적용. "원본 삭제"(openEditModal 의 `setItemHidden`)로 토글
- `applyNotes()` — overrides.notes 의 메모를 plan-item 마다 노란 박스로 표시. 긴 메모는 3줄 클램프(`setupClamps`)
- `applyAdditions()` — overrides.additions 의 새 일정을 plan-list 에 삽입 (초록 배경). `image` 있으면 사진도 렌더. `kind:"memo"` 항목은 `renderMemoItem()` 으로 📝 메모 스타일(노란 배경, 시간 없음)로 렌더
- `applyOrder()` — overrides.itemOrder 로 plan-item 들 재정렬 (키 없는 항목은 뒤로)
- `applyChecks()` — overrides.checks 와 체크박스 동기화. change 시 Worker setCheck 호출, 실패하면 원복
- `applyChecklistCustomizations()` — checklistEdits/Hidden/Adds 적용 후 `addChecklistButtons()` 호출
- `addChecklistButtons()` — 각 준비물 항목에 ✎/✕ 버튼, **각 카테고리 제목 옆에 ＋ 버튼**(그 카테고리에 바로 항목 추가 → `openCheckAddModal(catName)`), 맨 아래 **"+ 새 카테고리 추가"** 버튼(`openCheckCategoryModal` — 카테고리명+첫 항목)
- `addEditButtons()` — 모든 plan-item 우측에 ✎ 버튼 (정적·추가 공통: 시간·내용·좌표·**이미지**·**참고 링크(여러 개)**·메모 편집). 마커 있는 항목은 모달에 **"지도 마커 제거"** 체크박스(coords:null). 정적 항목은 **"원본 삭제"**(setItemHidden)·"되돌리기", 추가 항목은 "삭제". 링크·이미지 영역은 항상 항목의 마지막 자식들로 유지
- `setPlanItemLinks(li, links)` / `buildLinksEditor(initial)` — 항목에 참고 링크 칩 렌더, 모달용 링크 추가/삭제 에디터(`_read()` 로 `[{url,label?}]` 반환)
- `setPlanItemImage(li, src)` — 항목 아래 전체폭 사진. 클릭 시 `openLightbox(src)` 로 확대(어둠 배경 오버레이, 클릭·Esc·✕ 로 닫힘)
- `setupClamp(el)` / `setupClamps()` — 긴 메모/메모항목 텍스트를 3줄로 접고 넘칠 때만 '더보기/접기' 토글 추가. 숨은 날짜 탭은 측정 불가라 미완료로 두고 **탭 클릭 시 재측정**. `.clamp-text` 가 대상, 토글은 `.clamp-toggle`
- `addAddNewButtons()` — 각 날짜 패널 맨 아래에 "+ 새 일정 추가"·"+ 메모 추가" 버튼 (`openAddModal`/`openMemoAddModal`). 메모 항목 클릭 시 `addEditButtons` 의 ✎ 가 `openMemoModal`(텍스트 편집·삭제)로 분기
- `setupDragDrop()` — SortableJS 적용. `delay: 500` (0.5초 롱프레스 후 드래그), 저장 중엔 `disabled`, onEnd 에서 setOrder 호출·실패 시 applyOrder 원복. `.plan-item` 에 `user-select:none` 줘서 롱프레스가 텍스트선택에 가로채이지 않게 함(특히 텍스트뿐인 메모 항목 드래그)
- `syncAll()` — Worker 에서 overrides 다시 받아 위 함수들 다시 적용 + 지도 재구성. `window.TRIP_OVERRIDES.sync()` 로 노출. 지도의 "🔄 일정 동기화" 버튼이 호출.
- `geocodePlace(query)` — Places API 로 장소명·주소 → 좌표 변환. 추가/편집 모달의 "지도 마커" 입력 처리.
- `compressImage(file)` / `uploadImageFile(file)` — 파일을 canvas 로 최대 1280px JPEG 축소 → Worker `uploadImage` 로 리포 커밋 → 상대경로 반환. 방금 올린 dataURI 는 `recentImageData` 에 캐시해 Pages 빌드(~30초) 전까지 즉시 표시.

### 동시성 가드 (저장 중 편집 차단)

- 전역 `isSaving` 플래그 — `callWorker` 진입 시 set, finally 에서 unset. 진행 중 다른 편집 호출은 토스트로 거부.
- 저장 중엔 전체 화면 `.saving-overlay` (반투명 + 스피너) 로 클릭·드래그 차단, 모든 Sortable `disabled`.
- 비밀번호 모달이 떠 있는 동안에도 `isSaving=true` 라 다른 편집 안 들어감.
- 실패 시 자동 원복: 드래그 → applyOrder, 체크박스 → 체크 상태 되돌림.

### sapporo.js 측 협업 포인트

- `getMergedStops(date)` — **마커는 목록 plan-item 과 1:1**. 패널의 `.plan-item` 을 **DOM 순서대로** 훑어 좌표 있는 것만 stop(`{key,time,name,coords}`)으로. 정적 항목 좌표는 `itemEdits[key].coords`(배열=덮어쓰기, `null`=마커 제거) 우선, 없으면 `DAY_MAPS` 원본시간 매칭. 추가 항목은 `additions[id].coords`. 메모·`itemHidden`·좌표없음은 마커 없음. 항목을 삭제·숨김하거나 좌표를 제거하면 마커도 사라짐.
- `updateMarkerBadges(date, stops)` — 마커 있는 plan-item 의 plan-name 앞에 글자 배지(A·B·C…, 지도와 동일 순서) 부여. 배지 클릭 → `focusMarkerByKey` 로 해당 마커로 이동·InfoWindow. 마커 없으면 배지 제거 + `li.dataset.hasMarker` 토글. initDayMap 끝에서 호출.
- `rebuildDayMap(date)` — 컨테이너·범례·sync 버튼 제거 → `dayMapBuilt[date]` 리셋 → initDayMap 재호출. `window.TRIP_REBUILD_DAY_MAP` 로 노출.
- initDayMap 끝부분에서 `.day-map-sync` 버튼을 지도 컨테이너 바로 뒤에 삽입. 클릭 → `window.TRIP_OVERRIDES.sync()`.

모든 변경은 즉시 GitHub 커밋. 응답에 최신 overrides JSON 포함.

### 의존성

- `sapporo.html` `<head>` 에 SortableJS CDN 로드: `<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js" defer></script>` (overrides.js 보다 먼저).

### Worker 환경변수 (Cloudflare Secrets)

- `GITHUB_TOKEN` — Fine-grained PAT, `kanguk2/gguggu_Trip` 에 Contents:write 권한
- `EDIT_PASSWORD` — 편집 시 클라이언트가 보내야 하는 공유 비밀번호

### Worker 배포 / 재배포

```powershell
cd D:\Kanguk\gguggu_2
npx wrangler login        # 최초 1회
npx wrangler deploy       # 코드 변경할 때마다
```

Secret 만 바꾸려면 Cloudflare 대시보드 → Worker → Settings → Variables and Secrets → 해당 항목 삭제 후 새로 추가 → Deploy. (Secret 값은 저장 후 확인 불가능, 잊으면 재발급 필요)

### CORS 정책

Worker 는 `https://kanguk2.github.io` Origin 만 허용. 다른 도메인 (또는 로컬 file://) 에서 호출하면 차단됨. 로컬 테스트가 필요하면 `ALLOWED_ORIGINS` 배열에 `http://localhost:포트` 추가하고 재배포.

### 토큰 회전 (90일마다)

GitHub Fine-grained PAT 는 최대 1년 유효. 만료 임박 시:
1. https://github.com/settings/personal-access-tokens → 해당 토큰 → **Regenerate token** 또는 새로 발급
2. Cloudflare Worker Settings → Secrets → `GITHUB_TOKEN` 삭제 → 새 토큰으로 다시 등록 → Deploy
3. 새 토큰 권한은 기존과 동일 (`kanguk2/gguggu_Trip` Contents: Read and write)

### 새 도시 페이지에 적용하려면

- `trips/<city>-overrides.json` 빈 `{}` 로 생성·커밋
- `<city>.html` `<head>` 에 `<script src="./overrides.js" defer></script>` 추가
- overrides.js 의 `OVERRIDES_PATH` 가 도시명 포함하도록 Worker 코드 수정 (또는 URL 파라미터로 도시 식별)
  - 단순화: 도시마다 별도 Worker 운영해도 됨 (Cloudflare 무료 플랜은 100개 Worker 가능)

## 도시 페이지 구조 (`sapporo.html` 이 기준)

```
<main>
  <h1>도시명 여행</h1>
  <p class="trip-period">YYYY-MM-DD ~ YYYY-MM-DD · 국가/지역</p>

  <!-- 날씨 -->
  <section class="weather-strip" id="weather-strip">…JS가 채움…</section>
  <p class="weather-detail">
    <a class="weather-detail-link" href="<AccuWeather 같은 외부 상세 페이지>" target="_blank">세부 날씨 보기 →</a>
  </p>

  <!-- 탭 바 -->
  <nav class="tabs tabs-N" role="tablist">  <!-- N = 2 + 여행일수 -->
    <button class="tab is-active" data-panel="checklist">준비물</button>
    <button class="tab" data-panel="flight">항공권</button>
    <button class="tab" data-panel="YYYY-MM-DD">M/D · 요일</button>
    ...
  </nav>

  <!-- 패널: 준비물 (기본 활성) -->
  <section class="tab-panel is-active" data-panel="checklist">
    <div id="checklist-root"></div>
  </section>

  <!-- 패널: 항공권 -->
  <section class="tab-panel" data-panel="flight" hidden>
    <div id="flight-root"></div>
  </section>

  <!-- 패널: 날짜별 (반복) -->
  <section class="tab-panel" data-panel="YYYY-MM-DD" hidden>
    <h2>Day N · 설명</h2>
    <div class="day-map" id="day-map-YYYY-MM-DD"></div>  <!-- JS가 채움 -->
    <ol class="plan-list">…plan-item들…</ol>
  </section>
</main>
<script src="./<city>.js"></script>
```

`.tabs-N` 클래스는 탭 개수에 맞춰 — 현재 styles.css 에 `.tabs-4 / 5 / 6` 정의되어 있음. 더 필요하면 `grid-template-columns: repeat(N, 1fr)` 한 줄 추가.

## 도시 페이지 JS (`<city>.js`)

상단에 다음 상수들. 변수명에 도시명 들어가도 됨:

```js
const TRIP_DATES = ["YYYY-MM-DD", ...];                   // 날짜 탭과 같은 순서·개수
const CITY = { lat: <위도>, lon: <경도> };                // 날씨 API 좌표
const CHECKLIST_STORAGE_KEY = "<slug>-checklist-checks-v1"; // 도시별 고유 localStorage 키
const GOOGLE_MAPS_KEY = "AIzaSyDCpsu8RPxm4pme2o01htptD1VM9fXVzss"; // 모든 도시 공통

const WMO = { /* WMO weather_code → 이모지·라벨 매핑, 그대로 복사 */ };
const CHECKLIST = [ { category, items: [...] }, ... ];
const DAY_MAPS = {
  "YYYY-MM-DD": [
    { time: "HH:MM", name: "장소명", coords: [lat, lng] },
    ...
  ],
  ...
};
```

핵심 함수들 — 새 도시는 기본적으로 복사해서 사용:
- `loadWeather()` — Open-Meteo 호출 (timezone 만 도시별로 조정). API 키 불필요
- `setupTabs()` — 탭 클릭 핸들러. 그대로 사용
- `renderChecklist()` — localStorage 키만 도시별로 다름
- `renderFlight() / loadFlight()` — `whenUnlocked` 패턴으로 항공권 탭 채움 (도시별로 secret.js 의 payload key 가 같으면 그대로, 다르면 변경)
- `loadMapsApi() / initDayMap(date)` — 날짜 탭 클릭 시 Google Maps JS API 동적 로드 후 해당 날짜 지도 렌더

## 날짜별 지도 (Google Maps JavaScript API)

마커 전용 (경로선 없음), 한국어 라벨.

- **API 키 요구사항**: GCP 프로젝트에서 **두 단계 모두 필요**
  - **1단계 — 프로젝트 활성화**: `API 및 서비스 → 라이브러리` 에서 다음 세 API 사용 설정
    - Maps JavaScript API (지도 렌더링용)
    - Maps Embed API (과거 잔재, 현재는 사용 안 하지만 키 제한 풀어두면 미래 안전)
    - **Places API (Legacy)** — `geocodePlace()` 가 장소명·주소 → 좌표 변환에 사용 (추가/편집 모달의 "지도 마커" 입력). `libraries=marker,places` 로 로드됨
  - **2단계 — API 키 자체의 API 제한사항에도 세 API 모두 추가** (자주 빠뜨림 — 이거 빠지면 `ApiTargetBlockedMapError`)
  - 키 HTTP 리퍼러 제한: `https://kanguk2.github.io/*`
- **AdvancedMarkerElement 사용**: `google.maps.Marker` 는 deprecated → `libraries=marker` 로드 + `mapId: "DEMO_MAP_ID"` 지정 + `AdvancedMarkerElement` + `PinElement` 로 마커 렌더링. 클릭 이벤트는 `gmp-click`, InfoWindow 열 때는 `{ anchor: marker, map }` 형태.
- **렌더**: 각 날짜 패널의 `<div class="day-map" id="day-map-<date>">` 에 `google.maps.Map` 생성. `getMergedStops(date)` 의 각 stop 을 `AdvancedMarkerElement` + `PinElement` (글리프 `A, B, C…`) 로 추가. `fitBounds` 로 모든 마커 화면에 들어오게 자동 줌.
- **범례** (`.day-map-legend`): 지도 아래 `<ol>` 자동 생성. `[알파벳] [시간] [장소명]` 한 줄씩. 클릭 시 `map.panTo(position) + zoom 15` + InfoWindow 자동 오픈. Enter/Space 키도 동작.
- **마커-목록 1:1 + 배지**: 마커는 목록 plan-item 과 1:1 (getMergedStops 가 DOM 순서로 좌표 있는 항목만). 각 마커 letter 가 해당 plan-item 의 `.plan-marker-badge` 로도 표시되고, 배지 클릭 시 그 마커로 이동. 마커는 항목 삭제·숨김·좌표제거로 없앨 수 있음(편집 모달 "지도 마커 제거").
- **접기/펼치기 (지연 빌드)**: 지도는 `.day-map-box` 로 감싸 **기본 접힘**. h2 아래 `.day-map-toggle`("🗺️ 지도 보기") 클릭 시 `expandDayMap` 이 펼치고 그때 `initDayMap` 으로 빌드(접힌 채 빌드하면 크기가 0 이라 펼칠 때 빌드+`resize`+`fitBounds`). 날짜 탭 클릭 시엔 `setupMapCollapse`+배지 갱신만, 지도 빌드는 안 함. 배지 클릭(`focusMarkerByKey`)은 접혀 있으면 자동으로 펼친 뒤 해당 마커로 이동. 범례·"🔄 동기화" 버튼도 box 안에 있어 접으면 같이 숨음.
- **지연 로드**: 탭 클릭 시점에 처음 한 번만 Maps JS API 스크립트 주입 (`loadMapsApi()` 가 Promise 캐시). 이후 다른 날짜 탭은 같은 API 인스턴스 재사용.
- **좌표**: 도시 추가 시 주요 방문지 좌표 직접 채움 (Google Maps 에서 우클릭으로 추출하거나 위키 등 참고). 정확도는 ±수십 m 면 충분.

## 일정 항목 형식 (`.plan-item`)

### 일반 항목

3열 그리드: 시간 | 이름 | (선택)외부링크

```html
<li class="plan-item">
  <span class="plan-time">11:50</span>
  <span class="plan-name">신치토세 공항 도착 · 입국 수속</span>
</li>
```

- 장소 마커는 **지도에서만** (`DAY_MAPS` 에 좌표 등록) — 항목별 지도 링크 아이콘 ❌ (예전엔 있었지만 제거됨)
- 외부 페이지 링크가 필요한 경우만 `<a class="plan-link" href="..." target="_blank" rel="noopener noreferrer">🔗</a>` — 예: JR Hokkaido 시각표 같은 비-지도 링크. 사용자가 업로드한 파일은 `./files/<name>` 상대경로
- 부제(주소·메모 등)는 `<small class="plan-sub">` 로 plan-name 안에:
  ```html
  <span class="plan-name">호텔 체크인 · 호텔명<small class="plan-sub">주소</small></span>
  ```

### 펼침형 항목 (이동 옵션·복잡한 안내용)

```html
<li class="plan-item plan-item-expandable">  <!-- 두 클래스 함께 필수 — specificity 때문에 -->
  <details>
    <summary>
      <span class="summary-row">
        <span class="plan-time">13:00</span>
        <span class="plan-name">이동: A → B</span>
        <span class="plan-toggle-icon" aria-hidden="true">▾</span>
      </span>
    </summary>
    <div class="plan-detail">
      <h4>이동 옵션</h4>
      <ul class="transit-options">
        <li>
          <div class="transit-name">JR 쾌속 (자유석)</div>
          <div class="transit-meta">
            <span class="badge">37분</span>
            <span class="badge">¥1,150</span>
          </div>
          <p class="transit-note">설명</p>
        </li>
      </ul>
      <h4>시간표</h4>
      <ul class="transit-times">
        <li>출발 12:53 → 도착 13:30</li>
      </ul>
      <p class="transit-disclaimer">최신 시간표 링크</p>
    </div>
  </details>
</li>
```

**중요**: 반드시 `class="plan-item plan-item-expandable"` 두 개 다 — `.plan-item` 의 `display: grid` 가 뒤늦게 정의된 `.plan-item-expandable` 의 `display: block` 을 덮어쓰는 specificity 문제 때문에 `.plan-item.plan-item-expandable` 결합 셀렉터로 specificity 올려둠.

### 교통 안내 모달 (transit guide modal)

이동 항목 (JR/버스/택시 옵션) 펼침 안에 표 구매·이용 방법 안내 버튼을 둘 수 있다:

```html
<p class="transit-disclaimer">최신 시간표: ...</p>
<button class="transit-guide-btn" data-guide="jr-hokkaido" type="button">🎫 표 구매·이용 방법 안내</button>
```

- 클릭 시 `sapporo.js` 의 `openTransitGuide(key)` 가 모달 띄움. 콘텐츠는 `TRANSIT_GUIDES` 상수에서 정의 (title + sections + tip).
- 현재 등록된 가이드: `jr-hokkaido` (JR Hokkaido 표 구매·IC카드·승차 절차). 새 가이드 추가 (예: 비에이 투어버스, 신칸센) 는 `TRANSIT_GUIDES[key] = { title, sections, tip }` 형태로.
- 모달 닫기: 우측 상단 ×, 백드롭 클릭, Esc 키, 하단 "알겠습니다" 버튼 — 4가지 다 동작.

### 식당 추천 (제거됨)

예전엔 식사 항목 펼침 안에 요리 카테고리 탭 + 식당 카드(사진·메뉴·가격)가 있었으나 **제거됨** (사용자 요청, 커밋 `a834cd6`). 식사는 이제 일반 `.plan-item`. 식당 정보가 필요하면 항목 메모(overrides `notes`)나 좌표 마커로 남기는 방식 사용. 다시 식당 카드가 필요하면 git 히스토리(`a834cd6` 이전)에서 `restaurant-*` 패턴 참고.

## 새 여행지 추가 절차

사용자가 "X 여행 추가해줘" 요청하면:

### 1. 필요한 정보 확인
- **도시명** + ASCII 슬러그 (e.g. `osaka`)
- **여행 날짜 범위** (16일 이내일 때 일기 예보 신뢰)
- **도시 좌표·타임존** (Open-Meteo geocoding: `https://geocoding-api.open-meteo.com/v1/search?name=<city>`)
- **호텔 이름/주소** (있으면)
- **항공편 정보** (있으면 — 게이트로 보호하려면 secret.js 에 추가 필요)
- **여행 성격** (해외/국내, 계절, 액티비티 — 체크리스트 조정용)

### 2. `travel.html` 에 버튼 추가
```html
<a class="btn" href="./<slug>.html"><도시명> 여행</a>
```

### 3. `<slug>.html` 생성
`sapporo.html` 복사 → 다음만 교체:
- `<title>` · `<h1>` · `.trip-period`
- `<script src="./<slug>.js">` 마지막 줄
- `.tabs-N` 클래스 (N = 2 + 여행일수)
- 날짜 탭 버튼들 (`data-panel`, `tab-date` 같은 `M/D`, `tab-dow` 한글자)
- 각 날짜 패널의 `data-panel`, `<h2>Day N · 설명</h2>`, `<div class="day-map" id="day-map-YYYY-MM-DD">`, `.plan-item` 목록
- 항공권·체크리스트 패널의 컨테이너 div 는 그대로
- 날씨 detail 링크 URL (AccuWeather 등 도시별 상세 페이지)

### 4. `<slug>.js` 생성
`sapporo.js` 복사 → 상단 상수 교체:
- `TRIP_DATES`
- 좌표 객체
- `CHECKLIST_STORAGE_KEY` (도시별 고유 키)
- `loadWeather` 의 `timezone` 파라미터
- `CHECKLIST` (도시·계절 맞춰 조정)
- `DAY_MAPS` (날짜별 stop 좌표)

`renderFlight` 의 텍스트가 페이지마다 다른 항공편이 있다면 secret.js 의 payload 키도 도시별 (`flight_osaka` 등)로 분리하고 `decryptPayload("flight_osaka")` 호출.

### 5. 일정 채우기
- 모든 주요 방문지에 시간 + 이름. 좌표는 `DAY_MAPS` 에 별도로.
- 이동 항목은 가능하면 `plan-item-expandable` 로 옵션·시간표 첨부 (사용자가 비교하기 좋음).
- 식사·휴식 등 단순 항목은 일반 `.plan-item`.

### 6. 첨부 파일 (선택)
`files/` 에 PDF·이미지 두고 일정 항목의 `plan-link href="./files/..."` 로 참조. 여권 사진 같은 진짜 민감 정보는 절대 올리지 말 것 (퍼블릭 리포).

### 7. 커밋 & 푸시
```
git add travel.html <slug>.html <slug>.js
git commit -m "Add <도시명> trip page"
git push
```

## 모든 페이지 공통 규칙

- `<head>` 에 noindex/nofollow 메타태그 2개 필수
- 페이지 간 링크는 항상 상대경로 (`./other.html`)
- 스타일은 `styles.css` 에만 추가. 새 CSS 파일 만들지 않음
- 외부 API 우선순위: ① 키 없는 무료 (날씨 Open-Meteo) > ② 키 필요한 무료 티어 (Google Maps JS) > ③ 유료 — 현재는 ①+② 까지만 사용
- 한국어 텍스트가 한 글자씩 줄바뀜되지 않도록 `* { word-break: keep-all; overflow-wrap: break-word; }` 가 전역 적용됨. 새 컨테이너 추가 시 이 설정이 자동 상속됨
- `.claude/` · `_encrypt_once.mjs` (임시) 는 `.gitignore`

## 배포

main 푸시 → GitHub Pages 자동 배포. URL `https://kanguk2.github.io/gguggu_Trip/<page>.html`. 첫 빌드 1~2분, 이후 거의 즉시.

## 향후 개선 아이디어 (요청 받았을 때만)

- 도시·날짜·일정·체크리스트·좌표를 `trips/<city>.json` 한 파일에 모아 페이지가 동적으로 읽도록 → 새 도시 추가가 JSON 한 파일 편집으로 끝남
- 펼침형 plan-item 의 transit options 데이터도 JSON 화
- 체크리스트에 사용자 커스텀 항목 추가 UI
- 이슈 직접 등록 (GitHub OAuth Device Flow 또는 Cloudflare Workers 프록시)
- secret.js 재생성을 Web Crypto + 정적 HTML 도구로 (Node 의존 제거)
