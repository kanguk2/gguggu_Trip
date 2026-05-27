# gguggu_Trip — 정적 여행 페이지 프로젝트

GitHub Pages에 올리는 정적 HTML 사이트. 백엔드 없음, 모든 페이지는 상대경로로 연결되며 모든 페이지의 `<head>`에 `noindex, nofollow` 메타태그가 포함되어 있어야 한다.

## 디렉토리 구조

```
index.html          홈 (여행 버튼 + 화면 하단 footer에 개발요청 버튼)
about.html          "클로드 코드에 개발 요청하기" 폼 (GitHub Issues 프리필)
request.js          about.html의 폼 → GitHub Issues URL 변환
travel.html         여행지 목록 (도시별 버튼이 추가되는 페이지)
<city>.html         각 도시 페이지 (날씨 스트립 + 날짜 탭 + 일정)
<city>.js           해당 도시의 좌표/날짜를 가진 날씨·탭 스크립트
styles.css          모든 페이지가 공유하는 단일 스타일시트
script.js           index.html의 공용 스크립트 (현재 비어있음)
robots.txt          모든 크롤러 차단
```

## 새 여행지 추가 절차

사용자가 "X 여행 추가해줘" 같은 요청을 하면 다음 순서로 작업한다.

### 1. 입력 확인
- **도시명** (예: 오사카, 교토)
- **위경도** (예: 오사카 34.6937, 135.5023). 모르면 사용자에게 묻거나, Open-Meteo geocoding (`https://geocoding-api.open-meteo.com/v1/search?name=<city>`)으로 조회.
- **여행 날짜 범위** (예: 2026-07-10 ~ 2026-07-13). Open-Meteo 일별 예보는 약 16일까지 정확하다.
- **파일명 슬러그** — ASCII 소문자, 도시 영문명 (예: `osaka.html`, `osaka.js`). 한글 파일명은 사용하지 않는다.

### 2. `travel.html`에 버튼 추가
`<div class="link-list">` 안에 다음을 추가:
```html
<a class="btn" href="./<slug>.html"><도시명> 여행</a>
```

### 3. `<slug>.html` 생성

- `sapporo.html`을 그대로 복사한 뒤 다음만 바꾼다:
  - `<title>` — `<도시명> 여행`
  - `<h1>` — `<도시명> 여행`
  - `.trip-period` — 새 날짜 범위 문자열
  - 네 개의 `.tab` 버튼의 `data-date`, `tab-date`(예: `7/10`), `tab-dow`(예: `금`)
  - 네 개의 `.tab-panel`의 `data-date`와 내부 `<h2>`, 일정 `<li>`
  - `<script src="./<slug>.js"></script>`
- 탭 개수 = 여행일수. 4일이 아닐 경우 탭과 패널을 같은 수만큼 만든다.
- 요일은 한국어 한 글자(`월화수목금토일`)로 표기한다. 정확한 요일은 JS Date로 확인하거나 달력으로 검증한다.

### 4. `<slug>.js` 생성

`sapporo.js`를 복사한 뒤 상단 두 상수만 바꾼다:

```js
const TRIP_DATES = ["YYYY-MM-DD", "YYYY-MM-DD", ...];  // HTML 탭과 정확히 같은 순서
const SAPPORO = { lat: <위도>, lon: <경도> };          // 변수명도 도시명으로 바꿔도 되지만 필수는 아님
```

WMO weather_code 매핑(`WMO`), `setupTabs`, `loadWeather`는 그대로 둔다. timezone은 도시 기준으로 바꿀 것 — 일본 도시는 `Asia/Tokyo`, 한국은 `Asia/Seoul` 등.

### 5. 일정 항목

각 `<li>`는 자리잡기용 항목이라도 시간순/지역순으로 합리적으로 채운다. 사용자가 이후 직접 편집하더라도 처음 본 모습이 비어있지 않도록.

### 6. 커밋 & 푸시

```
git add travel.html <slug>.html <slug>.js
git commit -m "Add <도시명> trip page with date tabs and weather"
git push
```

## 모든 페이지 공통 규칙

- `<head>`에 다음 두 메타태그가 반드시 들어간다:
  ```html
  <meta name="robots" content="noindex, nofollow">
  <meta name="googlebot" content="noindex, nofollow">
  ```
- 페이지 간 링크는 항상 상대경로(`./other.html`)로 작성.
- 스타일은 새 CSS 파일을 만들지 말고 `styles.css`에 추가한다. 도시별 특수 스타일이 정말 필요할 때만 별도 파일을 고려.
- 외부 API는 가능하면 API 키가 필요 없는 것을 쓴다 (현재 날씨는 Open-Meteo).
- `.claude/`는 `.gitignore`에 이미 포함되어 있다.

## 배포

main 브랜치 푸시 → GitHub Pages가 자동 배포. URL: `https://kanguk2.github.io/gguggu_Trip/<page>.html`. 첫 배포 1~2분, 이후는 거의 즉시.

## 향후 개선 아이디어 (작업 요청 받았을 때만 진행)

- 탭/패널을 `TRIP_DATES` 배열에서 JS로 동적 생성하면 새 여행지 추가 시 HTML 중복이 줄어든다.
- 도시 좌표·날짜·일정을 JSON 한 파일(`trips.json`)로 모으고 페이지가 그걸 읽도록 하면 사실상 한 파일만 편집하면 된다.
- 일정 항목에 시간·장소·메모 필드를 추가해 구조화.
