# gguggu_Trip — 정적 여행 페이지 프로젝트

GitHub Pages에 올리는 정적 HTML 사이트. 백엔드 없음, 모든 페이지는 상대경로로 연결되며 모든 페이지의 `<head>`에 `noindex, nofollow` 메타태그가 포함된다.

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
request.js          about.html의 폼 → GitHub Issues URL 변환
styles.css          모든 페이지가 공유하는 단일 스타일시트
script.js           index.html의 공용 스크립트 (현재 비어있음)
robots.txt          모든 크롤러 차단
files/              여행 관련 첨부 파일 (PDF·이미지 등). 비식별 처리 필수
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
  - **1단계 — 프로젝트 활성화**: `API 및 서비스 → 라이브러리` 에서 다음 두 API 사용 설정
    - Maps JavaScript API (지도 렌더링용)
    - Maps Embed API (과거 잔재, 현재는 사용 안 하지만 키 제한 풀어두면 미래 안전)
  - **2단계 — API 키 자체의 API 제한사항에도 두 API 추가** (자주 빠뜨림 — 이거 빠지면 `ApiTargetBlockedMapError`)
  - 키 HTTP 리퍼러 제한: `https://kanguk2.github.io/*`
- **AdvancedMarkerElement 사용**: `google.maps.Marker` 는 deprecated → `libraries=marker` 로드 + `mapId: "DEMO_MAP_ID"` 지정 + `AdvancedMarkerElement` + `PinElement` 로 마커 렌더링. 클릭 이벤트는 `gmp-click`, InfoWindow 열 때는 `{ anchor: marker, map }` 형태.
- **렌더**: 각 날짜 패널의 `<div class="day-map" id="day-map-<date>">` 에 `google.maps.Map` 생성. `DAY_MAPS[date]` 의 각 stop 을 `google.maps.Marker` 로 추가 (label `A, B, C…`). `fitBounds` 로 모든 마커 화면에 들어오게 자동 줌.
- **범례** (`.day-map-legend`): 지도 아래 `<ol>` 자동 생성. `[알파벳] [시간] [장소명]` 한 줄씩. 클릭 시 `map.panTo(position) + zoom 15` + InfoWindow 자동 오픈. Enter/Space 키도 동작.
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

### 식당·카페 추천 (펼침 안의 서브탭)

식사 시간 항목을 펼치면 요리 카테고리별 탭과 식당 카드를 보여주는 패턴 (Day 1 15:00 점심식사 예시):

```html
<div class="plan-detail">
  <nav class="restaurant-tabs" role="tablist">
    <button class="restaurant-tab is-active" data-category="ramen">🍜 라멘</button>
    <button class="restaurant-tab" data-category="curry">🍛 수프 카레</button>
    ...
  </nav>
  <div class="restaurant-category is-active" data-category="ramen">
    <ul class="restaurant-list">
      <li>
        <a class="restaurant-card" href="<google-maps-search-URL>" target="_blank" rel="noopener noreferrer">
          <div class="restaurant-head"><span class="restaurant-name">스미레 라멘</span><span class="restaurant-rating">★ 4.3</span></div>
          <div class="restaurant-meta"><span class="badge">미소 라멘</span><span class="badge">도보 8분</span></div>
          <p class="restaurant-note">한줄 설명</p>
        </a>
      </li>
    </ul>
  </div>
  <div class="restaurant-category" data-category="curry" hidden>...</div>
</div>
```

- 탭 전환은 `sapporo.js` 의 `setupRestaurantTabs()` 가 자동 처리. 새 도시 페이지는 그대로 사용.
- 카드 링크는 기본 Google Maps 검색 URL (`https://www.google.com/maps/search/?api=1&query=<영문+이름>`) — 클릭 시 별점/리뷰/위치 정보 한번에 보임. 특정 블로그 링크가 있으면 그쪽으로 교체.
- 별점은 Google·Tabelog 기준 근사치라는 disclaimer 를 `transit-note` 형태로 본문 상단에 넣어둘 것.
- 도보 시간은 호텔 기준 — 도시별 호텔 위치에 따라 재계산 필요.

**카드 이미지** — 각 카드 최상단에 `<div class="restaurant-image" data-cuisine="X" aria-hidden="true">이모지</div>` 를 둔다. CSS 에서 `data-cuisine` 별로 그라데이션 배경 + 큰 이모지로 시각적 구분 (외부 이미지 의존성 없음). 지원 cuisine 키: `ramen / curry / washoku / seafood / sushi / cafe / jingisukan / izakaya`. 새 카테고리 추가하면 styles.css 의 `.restaurant-image[data-cuisine="..."]` 규칙도 함께 추가. 실제 사진을 쓰고 싶으면 `./files/` 에 이미지 두고 `<img src="./files/...">` 로 교체.

**점심 vs 저녁** — 같은 카드 구조를 점심·저녁 모두에 사용. 카테고리만 시간대에 맞게 조정:
- 점심: 라멘 / 수프 카레 / 정식·일식 / 해산물·스시 / 카페·디저트
- 저녁: 징기스칸(삿포로 특산) / 라멘 / 스시·해산물 / 이자카야 / 수프 카레
- 도시별로 그 지역 특산 요리를 첫 탭에 두면 자연스러움 (오사카면 타코야키·오코노미야키 등).

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
