# gguggu_Trip — 정적 여행 페이지 프로젝트

GitHub Pages에 올리는 정적 HTML 사이트. 백엔드 없음, 모든 페이지는 상대경로로 연결되며 모든 페이지의 `<head>`에 `noindex, nofollow` 메타태그가 포함되어 있어야 한다.

## 디렉토리 구조

```
index.html          홈 (여행 버튼 + 하단 footer에 개발요청 버튼)
about.html          "클로드 코드에 개발 요청하기" 폼 (GitHub Issues 프리필)
request.js          about.html의 폼 → GitHub Issues URL 변환
travel.html         여행지 목록 (도시별 버튼이 추가되는 페이지)
<city>.html         각 도시 페이지 (날씨 + 준비물 체크리스트 + 일자별 일정)
<city>.js           해당 도시의 좌표·날짜·체크리스트 데이터 및 렌더링
styles.css          모든 페이지가 공유하는 단일 스타일시트
script.js           index.html의 공용 스크립트 (현재 비어있음)
robots.txt          모든 크롤러 차단
files/              여행 관련 첨부 파일을 두는 디렉토리 (PDF·이미지 등)
```

## 도시 페이지의 표준 구조

`sapporo.html` 이 기준 템플릿. 모든 새 여행지 페이지는 같은 골격을 따른다:

1. **헤더** — `<h1>` 도시명, `.trip-period` 날짜·국가 정보
2. **날씨 스트립** (`#weather-strip`) — Open-Meteo API로 일별 날씨를 자동 렌더링
3. **탭 바** (`.tabs.tabs-5`) — 첫 탭은 `준비물` (`data-panel="checklist"`), 이후 날짜 탭들 (`data-panel="YYYY-MM-DD"`). 탭 수에 따라 `.tabs-5` 대신 `.tabs-4`, `.tabs-6` 등 (해당 클래스의 grid-template-columns CSS를 같이 추가해야 함). 첫 진입 시 활성 탭은 `준비물`.
4. **탭 패널** — 각 탭에 대응하는 `<section class="tab-panel" data-panel="...">`
   - 체크리스트 패널: `<div id="checklist-root">` 비어있는 컨테이너 (JS가 채움)
   - 날짜 패널: `<ol class="plan-list">` 안에 `.plan-item` 줄들
5. **하단 네비게이션** (`.page-nav`) — 여행 페이지로, 홈으로

## 일정 항목 형식 (.plan-item)

각 항목은 시간·장소·옆 링크의 3열 그리드로 구성한다:

```html
<li class="plan-item">
  <span class="plan-time">11:30</span>
  <span class="plan-name">신치토세 공항 도착</span>
  <a class="plan-link" href="<URL or ./files/...>" target="_blank" rel="noopener noreferrer" title="지도">🔗</a>
</li>
```

- `plan-time`: 24시간제 `HH:MM`
- `plan-name`: 활동·장소 한국어 설명
- `plan-link` (선택): 항목 옆에 표시되는 외부 링크 아이콘
  - 기본값: 구글맵 검색 URL — `https://www.google.com/maps/search/?api=1&query=<영문+장소명>`
  - 사용자가 등록한 페이지: 다른 정적 페이지 (`./otaru.html`) 등
  - 업로드한 파일: `./files/<filename>` 으로 참조 (e.g. 항공권 PDF, 호텔 바우처)
  - 링크가 없는 항목 (조식·휴식·체크아웃 등)은 `<a>` 태그 자체를 생략

## 첨부 파일 (./files/)

- 항공권·바우처·예약 확인서·여행자보험증서 등은 `files/` 디렉토리에 직접 추가하고 일정 항목의 `plan-link href`에서 상대경로로 참조한다.
- 민감 정보(여권번호 등)는 git에 올라가므로 주의. 저장소가 public이면 비식별 처리 후 업로드한다.
- `.gitkeep` 외 다른 파일이 없을 때도 디렉토리는 유지한다.

## 준비물 체크리스트

`<city>.js` 상단의 `CHECKLIST` 배열에서 정의한다. 카테고리 → 항목 구조:

```js
const CHECKLIST = [
  { category: "필수 서류·결제", items: ["여권 (유효기간 6개월 이상)", ...] },
  { category: "전자기기", items: [...] },
  // ...
];
```

- 카테고리·항목 텍스트는 한국어.
- 체크 상태는 `localStorage` (key: `<city>-checklist-checks-v1`)에 저장 — 새 도시 페이지 만들 때 key도 도시명에 맞춰 변경.
- 해외/국내, 계절, 액티비티 종류에 맞춰 항목을 조정한다.

## 새 여행지 추가 절차

사용자가 "X 여행 추가해줘" 같은 요청을 하면 다음 순서로 진행한다.

### 1. 입력 확인
- **도시명** (예: 오사카, 교토)
- **위경도** (예: 오사카 34.6937, 135.5023). 모르면 사용자에게 묻거나 Open-Meteo geocoding (`https://geocoding-api.open-meteo.com/v1/search?name=<city>`)으로 조회.
- **타임존** (일본 `Asia/Tokyo`, 한국 `Asia/Seoul`).
- **여행 날짜 범위** (예: 2026-07-10 ~ 2026-07-13). 일별 예보는 약 16일 이내일 때 신뢰도 높음.
- **파일명 슬러그** — ASCII 소문자 영문명 (예: `osaka.html`, `osaka.js`).

### 2. `travel.html`에 버튼 추가
`<div class="link-list">` 안에:
```html
<a class="btn" href="./<slug>.html"><도시명> 여행</a>
```

### 3. `<slug>.html` 생성

- `sapporo.html`을 복사한 뒤 다음만 바꾼다:
  - `<title>` · `<h1>` · `.trip-period`
  - `.tabs` 클래스 — 탭 개수에 맞춰 `.tabs-5` 등 (예: 5일치면 `.tabs-6`, CSS 추가 필요)
  - 날짜 탭 버튼들의 `data-panel`, `tab-date`, `tab-dow` (요일 한 글자: 월화수목금토일)
  - 각 날짜 패널의 `data-panel`, `<h2>`, `.plan-item` 목록
  - `<script src="./<slug>.js"></script>`
- 일정 항목은 시간순으로 자리잡기용이라도 합리적으로 채운다. 각 장소엔 구글맵 검색 링크를 기본으로 붙인다.

### 4. `<slug>.js` 생성

`sapporo.js`를 복사한 뒤 상단 상수와 데이터를 바꾼다:

```js
const TRIP_DATES = ["YYYY-MM-DD", ...];                          // HTML 탭과 같은 순서
const SAPPORO = { lat: <위도>, lon: <경도> };                    // 변수명을 도시에 맞춰 바꿔도 무방
const CHECKLIST_STORAGE_KEY = "<slug>-checklist-checks-v1";       // 도시별로 고유한 키
const CHECKLIST = [ /* 카테고리·항목 — 여행 성격에 맞춰 조정 */ ];
```

`loadWeather` 함수 안의 `timezone` 파라미터도 도시 기준으로 바꾼다. WMO 매핑·탭 핸들러·체크리스트 렌더링은 그대로 둔다.

### 5. 일정 채우기

해외/국내, 일자, 도시 특성에 맞춰 시간 + 장소 + 링크를 채운다.
- 모든 장소에 가능한 한 구글맵 검색 링크를 붙인다.
- 식사·체크인 등 일반 항목은 링크 생략 가능.
- 사용자가 첨부 파일이나 등록 페이지를 미리 안다면 그쪽으로 링크.

### 6. 커밋 & 푸시

```
git add travel.html <slug>.html <slug>.js
git commit -m "Add <도시명> trip page"
git push
```

## 모든 페이지 공통 규칙

- `<head>`에 다음 두 메타태그가 반드시 포함:
  ```html
  <meta name="robots" content="noindex, nofollow">
  <meta name="googlebot" content="noindex, nofollow">
  ```
- 페이지 간 링크는 항상 상대경로(`./other.html`)로.
- 스타일은 새 CSS 파일을 만들지 말고 `styles.css`에 추가한다.
- 외부 API는 가능하면 API 키 없는 것 (현재 날씨는 Open-Meteo).
- `.claude/`는 `.gitignore`에 포함되어 있다.

## 배포

main 브랜치 푸시 → GitHub Pages 자동 배포. URL: `https://kanguk2.github.io/gguggu_Trip/<page>.html`. 첫 배포 1~2분, 이후 거의 즉시.

## 향후 개선 아이디어 (요청 받았을 때만 진행)

- 탭·패널·일정을 JS 데이터 한 구조에서 동적 렌더링 → 새 도시 추가가 더 간단해짐.
- 도시별 좌표·날짜·일정·체크리스트를 `trips.json` 한 파일에 모으는 통합 안.
- 일정 항목에 메모·예산 필드 추가.
- 체크리스트에 사용자가 추가/삭제하는 커스텀 항목 입력 UI.
