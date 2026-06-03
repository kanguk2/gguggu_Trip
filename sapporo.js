const TRIP_DATES = ["2026-06-05", "2026-06-06", "2026-06-07", "2026-06-08"];
const SAPPORO = { lat: 43.0618, lon: 141.3545 };
const CHECKLIST_STORAGE_KEY = "sapporo-checklist-checks-v1";

const WMO = {
  0:  { icon: "☀️", label: "맑음" },
  1:  { icon: "🌤️", label: "대체로 맑음" },
  2:  { icon: "⛅", label: "부분 흐림" },
  3:  { icon: "☁️", label: "흐림" },
  45: { icon: "🌫️", label: "안개" },
  48: { icon: "🌫️", label: "짙은 안개" },
  51: { icon: "🌦️", label: "약한 이슬비" },
  53: { icon: "🌦️", label: "이슬비" },
  55: { icon: "🌧️", label: "강한 이슬비" },
  61: { icon: "🌧️", label: "약한 비" },
  63: { icon: "🌧️", label: "비" },
  65: { icon: "🌧️", label: "강한 비" },
  71: { icon: "🌨️", label: "약한 눈" },
  73: { icon: "🌨️", label: "눈" },
  75: { icon: "❄️", label: "강한 눈" },
  80: { icon: "🌦️", label: "소나기" },
  81: { icon: "🌦️", label: "소나기" },
  82: { icon: "⛈️", label: "강한 소나기" },
  95: { icon: "⛈️", label: "천둥번개" },
  96: { icon: "⛈️", label: "천둥·우박" },
  99: { icon: "⛈️", label: "강한 천둥·우박" },
};

const CHECKLIST = [
  {
    category: "필수 서류·결제",
    items: [
      "여권 (사본도 준비)",
      "신분증",
      "현금(엔화), 트래블월렛, 해외신용카드",
      "비짓재팬 QR 발급 (Visit Japan Web)",
      "해외여행자보험",
      "투어 예약 확인",
      "E-ticket 출력 (항공·숙소·기타 바우처)",
      "이코카(ICOCA) 카드",
    ],
  },
  {
    category: "전자기기",
    items: [
      "eSIM 발급",
      "충전기",
      "보조배터리 + 검정테이프 (단자 가림)",
      "변환플러그 (돼지코)",
    ],
  },
  {
    category: "의류",
    items: [
      "옷, 잠옷, 속옷, 양말",
      "경량우산",
      "기내 보조가방 / 가방",
      "봉투 (입은 옷 넣을 거)",
      "장바구니",
    ],
  },
  {
    category: "세면·헤어",
    items: [
      "세안용품 (클렌징오일, 클렌징폼, 아이리무버)",
      "샤워용품 (샴푸, 린스, 바디워시, 바디로션)",
      "헤어 (고데기, 헤어롤, 빗, 헤어에센스, 헤어스프레이, 고무줄, 집게, 핀)",
    ],
  },
  {
    category: "메이크업",
    items: [
      "화장솜, 퍼프, 스킨, 에센스, 크림",
      "선크림, 프라이머, 코렉터, 파운데이션",
      "아이섀도, 아이브로우, 아이라이너, 뷰러, 마스카라",
      "쉐딩, 하이라이터, 블러셔, 브러쉬",
      "틴트, 립밤",
    ],
  },
  {
    category: "비상약·위생",
    items: [
      "비상약 (프로바이오틱스, 영양제, 소화제, 감기약, 지사제, 일회용밴드)",
      "생리대",
      "물티슈, 휴지",
      "손 소독제, 핸드크림",
      "껌, 가글, 마우스 스프레이",
    ],
  },
  {
    category: "기타 짐",
    items: [
      "지퍼백 (액체용, 가로세로합 40cm 이하)",
      "입막음 스티커",
      "일회용 수저",
    ],
  },
];

function weatherInfo(code) {
  return WMO[code] || { icon: "❓", label: "정보 없음" };
}

async function loadWeather() {
  const strip = document.getElementById("weather-strip");
  const params = new URLSearchParams({
    latitude: SAPPORO.lat,
    longitude: SAPPORO.lon,
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    start_date: TRIP_DATES[0],
    end_date: TRIP_DATES[TRIP_DATES.length - 1],
    timezone: "Asia/Tokyo",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const { time, weather_code, temperature_2m_max, temperature_2m_min } = data.daily;

    strip.innerHTML = "";
    time.forEach((date, i) => {
      const info = weatherInfo(weather_code[i]);
      const card = document.createElement("div");
      card.className = "weather-card";
      card.dataset.date = date;
      card.innerHTML = `
        <div class="weather-date">${date.slice(5)}</div>
        <div class="weather-icon" title="${info.label}">${info.icon}</div>
        <div class="weather-label">${info.label}</div>
        <div class="weather-temp">
          <span class="temp-max">${Math.round(temperature_2m_max[i])}°</span>
          <span class="temp-sep">/</span>
          <span class="temp-min">${Math.round(temperature_2m_min[i])}°</span>
        </div>
      `;
      strip.appendChild(card);
    });
  } catch (err) {
    strip.innerHTML = `<div class="weather-error">날씨를 불러오지 못했습니다 (${err.message})</div>`;
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.panel;
      tabs.forEach((t) => {
        const active = t.dataset.panel === key;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      panels.forEach((p) => {
        const active = p.dataset.panel === key;
        p.classList.toggle("is-active", active);
        p.hidden = !active;
      });
    });
  });
}

function loadChecks() {
  try {
    return JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveChecks(checks) {
  localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(checks));
}

function renderChecklist() {
  const root = document.getElementById("checklist-root");
  if (!root) return;

  const checks = loadChecks();
  const totalItems = CHECKLIST.reduce((sum, c) => sum + c.items.length, 0);

  const summary = document.createElement("div");
  summary.className = "checklist-summary";
  root.appendChild(summary);

  const updateSummary = () => {
    const done = Object.values(loadChecks()).filter(Boolean).length;
    summary.textContent = `${done} / ${totalItems} 완료`;
  };

  CHECKLIST.forEach((cat, ci) => {
    const section = document.createElement("section");
    section.className = "checklist-category";
    section.dataset.catIndex = ci;
    section.dataset.catName = cat.category;

    const heading = document.createElement("h3");
    heading.textContent = cat.category;
    section.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "checklist-items";

    cat.items.forEach((label, ii) => {
      const id = `chk-${ci}-${ii}`;
      list.appendChild(buildChecklistItem(id, label, checks, updateSummary, false));
    });

    section.appendChild(list);
    root.appendChild(section);
  });

  updateSummary();
  document.dispatchEvent(new CustomEvent("checklist:rendered"));
}

function buildChecklistItem(id, label, checks, updateSummary, isCustom) {
  const li = document.createElement("li");
  li.className = "checklist-item";
  li.dataset.checkId = id;
  if (isCustom) li.dataset.custom = "1";

  const wrap = document.createElement("label");
  wrap.htmlFor = id;

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.id = id;
  cb.checked = !!checks[id];
  if (cb.checked) li.classList.add("is-checked");

  cb.addEventListener("change", () => {
    const current = loadChecks();
    if (cb.checked) current[id] = true;
    else delete current[id];
    saveChecks(current);
    li.classList.toggle("is-checked", cb.checked);
    updateSummary();
  });

  const span = document.createElement("span");
  span.className = "checklist-label";
  span.textContent = label;

  wrap.appendChild(cb);
  wrap.appendChild(span);
  li.appendChild(wrap);
  return li;
}

window.TRIP_BUILD_CHECK_ITEM = buildChecklistItem;

function renderFlight(root, data) {
  const segmentsHtml = data.segments
    .map((seg) => `
      <section class="flight-segment">
        <div class="flight-segment-head">
          <span class="flight-direction">${seg.label}</span>
          <span class="flight-airline">${seg.airline}</span>
          <span class="flight-code">${seg.code}</span>
          <span class="flight-cabin">${seg.cabin}</span>
        </div>
        <div class="flight-segment-body">
          <div class="flight-endpoint">
            <div class="flight-time">${seg.depart.time}</div>
            <div class="flight-airport">${seg.depart.airport}</div>
            <div class="flight-date">${seg.depart.date}</div>
          </div>
          <div class="flight-arrow">→</div>
          <div class="flight-endpoint">
            <div class="flight-time">${seg.arrive.time}</div>
            <div class="flight-airport">${seg.arrive.airport}</div>
            <div class="flight-date">${seg.arrive.date}</div>
          </div>
        </div>
      </section>
    `)
    .join("");

  root.innerHTML = segmentsHtml;
}

async function loadFlight() {
  const root = document.getElementById("flight-root");
  if (!root || !window.TRIP_GATE) return;
  try {
    const data = await window.TRIP_GATE.decryptPayload("flight");
    renderFlight(root, data);
  } catch (err) {
    root.innerHTML = `<p class="flight-error">비행 정보를 불러오지 못했습니다 (${err.message})</p>`;
  }
}

const DAY_MAPS = {
  "2026-06-05": [
    { time: "11:50", name: "신치토세 공항", coords: [42.7752, 141.6920] },
    { time: "14:00", name: "더 게이트 호텔 삿포로", coords: [43.0635, 141.3520] },
    { time: "16:30", name: "오도리 공원", coords: [43.0606, 141.3537] },
    { time: "17:30", name: "삿포로 TV 타워", coords: [43.0608, 141.3569] },
    { time: "19:00", name: "저녁식사 (스스키노 일대)", coords: [43.0540, 141.3540] },
    { time: "21:00", name: "호텔 복귀", coords: [43.0635, 141.3520] },
  ],
  "2026-06-06": [
    { time: "07:00", name: "JR 삿포로역 북쪽출구 단체버스", coords: [43.0692, 141.3508] },
    { time: "10:30", name: "패치워크 로드 · 켄과 메리의 나무", coords: [43.6107, 142.4329] },
    { time: "11:30", name: "시키사이노오카", coords: [43.5566, 142.4838] },
    { time: "14:00", name: "청의 호수 (Blue Pond)", coords: [43.4963, 142.6395] },
    { time: "15:00", name: "시라히게 폭포", coords: [43.5114, 142.6481] },
    { time: "18:30", name: "JR 삿포로역 도착", coords: [43.0686, 141.3508] },
    { time: "18:30", name: "Hitsujishi 징기스칸 (스스키노)", coords: [43.0556, 141.3530] },
    { time: "20:30", name: "스스키노 사거리·네온", coords: [43.0552, 141.3530] },
    { time: "21:00", name: "다누키코지 쇼핑가", coords: [43.0577, 141.3540] },
    { time: "21:45", name: "삿포로 TV 타워 야경", coords: [43.0608, 141.3569] },
    { time: "22:30", name: "호텔 복귀", coords: [43.0635, 141.3520] },
  ],
  "2026-06-07": [
    { time: "08:00", name: "니조 시장 (아침식사)", coords: [43.0588, 141.3566] },
    { time: "10:30", name: "오타루 운하", coords: [43.1985, 141.0029] },
    { time: "11:30", name: "르타오 본점", coords: [43.1935, 141.0019] },
    { time: "12:30", name: "마사스시 본점", coords: [43.1957, 141.0094] },
    { time: "14:30", name: "오타루 유리공방 (北一硝子)", coords: [43.1944, 141.0051] },
    { time: "16:00", name: "오타루 오르골당", coords: [43.1923, 141.0070] },
    { time: "19:00", name: "다루마 본점 (스스키노)", coords: [43.0546, 141.3535] },
    { time: "21:30", name: "호텔 복귀", coords: [43.0635, 141.3520] },
  ],
  "2026-06-08": [
    { time: "08:30", name: "더 게이트 호텔 (체크아웃)", coords: [43.0635, 141.3520] },
    { time: "09:00", name: "다누키코지 쇼핑가", coords: [43.0577, 141.3540] },
    { time: "10:30", name: "JR 삿포로역", coords: [43.0686, 141.3508] },
    { time: "13:20", name: "신치토세 공항", coords: [42.7752, 141.6920] },
  ],
};

const GOOGLE_MAPS_KEY = "AIzaSyDCpsu8RPxm4pme2o01htptD1VM9fXVzss";
const dayMapBuilt = {};
let mapsApiLoadPromise = null;

function loadMapsApi() {
  if (mapsApiLoadPromise) return mapsApiLoadPromise;
  mapsApiLoadPromise = new Promise((resolve, reject) => {
    window.__onMapsLoaded = () => resolve();
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&language=ko&region=JP&libraries=marker,places&callback=__onMapsLoaded&loading=async`;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return mapsApiLoadPromise;
}

const TRANSIT_GUIDES = {
  "jr-hokkaido": {
    title: "JR 홋카이도 표 구매·이용 가이드",
    sections: [
      {
        heading: "📍 어디서 구매",
        items: [
          "<strong>자동발매기 (券売機)</strong> — 모든 역 비치. 한국어/영어 지원. 현금·카드 결제",
          "<strong>みどりの窓口 (미도리노 마도구치)</strong> — 유인 창구. 특급권·지정석 구매",
          "<strong>IC카드 (Kitaca/Suica)</strong> — 자유석 한정. 탭만 하면 끝. 사전 충전 필요",
          "<strong>온라인 사전 예약</strong> — <a href=\"https://www.jrhokkaido.co.jp/global/english/\" target=\"_blank\" rel=\"noopener noreferrer\">JR Hokkaido eきっぷ</a> 할인 혜택"
        ]
      },
      {
        heading: "🎫 표 종류",
        items: [
          "<strong>자유석권 (普通乗車券)</strong> — 가장 일반적, 좌석 보장 X. 한산할 땐 충분",
          "<strong>U-Seat 지정석 (자유석 + ¥840)</strong> — 신치토세 쾌속 한정. 좌석 보장 + 캐리어 공간",
          "<strong>특급권 (特急券, ¥1,290~)</strong> — 호쿠토 같은 특급 열차 탑승 시 필수 (자유석권과 별도 구매)"
        ]
      },
      {
        heading: "🚉 이용 순서",
        items: [
          "자동발매기 화면에서 <strong>한국어/영어</strong> 선택",
          "출발지(예: 札幌 / Sapporo)와 도착지(新千歳空港 / Otaru) 선택",
          "표 종류 (자유석/U-Seat/특급) 선택 → 결제",
          "발권된 표를 <strong>개찰구</strong>에 투입 → 통과 시 다시 받음 (잃어버리지 X)",
          "열차 탑승 — 자유석은 보통 4~6호차 (열차마다 다름, 플랫폼 안내 확인)",
          "도착역 개찰구에 표 회수 (IC카드면 탭)"
        ]
      },
      {
        heading: "💳 IC카드 추천",
        items: [
          "<strong>Welcome Suica</strong> — 외국인 전용 모바일 앱. 보증금 없음, iPhone Wallet 으로 발급 가능",
          "<strong>Kitaca</strong> — 홋카이도 JR IC카드. 신치토세 공항·삿포로역 발매기에서 <strong>¥2,000</strong> (¥500 보증금 + ¥1,500 충전, 환불 가능)",
          "한국 Tmoney/캐시비는 사용 불가 — 일본 IC카드 별도 필요"
        ]
      }
    ],
    tip: "💡 짐 많은 날 (신치토세 도착·출국)은 <strong>U-Seat 지정석</strong> 추천. 큰 캐리어 둘 공간 있고 자리 못 잡을 걱정 없음."
  }
};

function openTransitGuide(key) {
  const guide = TRANSIT_GUIDES[key];
  if (!guide) return;

  document.querySelectorAll(".transit-guide-modal").forEach((m) => m.remove());

  const modal = document.createElement("div");
  modal.className = "transit-guide-modal";

  const sectionsHtml = guide.sections.map((s) => `
    <section>
      <h3>${s.heading}</h3>
      <ul>${s.items.map((it) => `<li>${it}</li>`).join("")}</ul>
    </section>
  `).join("");

  modal.innerHTML = `
    <div class="transit-guide-card" role="dialog" aria-modal="true">
      <button class="transit-guide-close" type="button" aria-label="닫기">×</button>
      <h2>${guide.title}</h2>
      ${sectionsHtml}
      <p class="transit-guide-tip">${guide.tip}</p>
      <button class="btn transit-guide-done" type="button">알겠습니다</button>
    </div>
  `;

  const close = () => modal.remove();
  modal.querySelector(".transit-guide-close").addEventListener("click", close);
  modal.querySelector(".transit-guide-done").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", escHandler);
    }
  });

  document.body.appendChild(modal);
}

function setupTransitGuides() {
  document.querySelectorAll(".transit-guide-btn").forEach((btn) => {
    btn.addEventListener("click", () => openTransitGuide(btn.dataset.guide));
  });
}

function getMergedStops(date) {
  const base = DAY_MAPS[date] || [];
  const added = window.TRIP_OVERRIDES?.additions?.[date] || [];
  const itemEdits = window.TRIP_OVERRIDES?.itemEdits || {};
  const addedWithCoords = added
    .filter((i) => Array.isArray(i.coords) && i.coords.length === 2)
    .map((i) => ({ time: i.time, name: i.name + " (추가)", coords: i.coords }));
  const staticEditCoords = Object.entries(itemEdits)
    .filter(([key, e]) => key.startsWith(date + "/") && Array.isArray(e.coords) && e.coords.length === 2)
    .map(([key, e]) => {
      const origTime = key.split("/")[1];
      const displayTime = e.time || origTime;
      const displayName = e.name || "(메모 항목)";
      return { time: displayTime, name: displayName + " (마커)", coords: e.coords };
    });
  return [...base, ...staticEditCoords, ...addedWithCoords].sort((a, b) =>
    String(a.time || "").localeCompare(String(b.time || ""))
  );
}

function rebuildDayMap(date) {
  const container = document.getElementById(`day-map-${date}`);
  if (!container) return;
  container.innerHTML = "";
  const parent = container.parentElement;
  parent.querySelectorAll(".day-map-legend, .day-map-sync").forEach((el) => el.remove());
  delete dayMapBuilt[date];
  initDayMap(date);
}

window.TRIP_REBUILD_DAY_MAP = rebuildDayMap;

async function initDayMap(date) {
  if (dayMapBuilt[date]) return;
  const container = document.getElementById(`day-map-${date}`);
  const stops = getMergedStops(date);
  if (!container || !stops || stops.length === 0) return;
  dayMapBuilt[date] = true;

  try {
    await loadMapsApi();
  } catch (e) {
    container.innerHTML = `<div class="map-error">지도를 불러오지 못했습니다.</div>`;
    return;
  }

  const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");

  const map = new google.maps.Map(container, {
    zoom: 12,
    center: { lat: stops[0].coords[0], lng: stops[0].coords[1] },
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    mapId: "DEMO_MAP_ID",
  });

  const bounds = new google.maps.LatLngBounds();
  const markers = [];
  const letters = "ABCDEFGHIJKLMN".split("");

  stops.forEach((stop, i) => {
    const position = { lat: stop.coords[0], lng: stop.coords[1] };
    const pin = new PinElement({
      background: "#c0392b",
      borderColor: "#fff",
      glyphColor: "#fff",
      glyph: letters[i],
    });
    const marker = new AdvancedMarkerElement({
      position,
      map,
      content: pin.element,
      title: `${letters[i]}. ${stop.name}`,
    });
    const info = new google.maps.InfoWindow({
      content: `<div style="font-size:13px;line-height:1.4"><strong>${letters[i]}. ${stop.name}</strong><br>${stop.time}</div>`,
    });
    marker.addListener("gmp-click", () => {
      markers.forEach((m) => m.info.close());
      info.open({ anchor: marker, map });
    });
    markers.push({ marker, info, position });
    bounds.extend(position);
  });

  map.fitBounds(bounds, 50);

  const syncBtn = document.createElement("button");
  syncBtn.type = "button";
  syncBtn.className = "day-map-sync";
  syncBtn.innerHTML = "🔄 일정 동기화";
  syncBtn.title = "추가·편집된 일정을 다시 불러와서 지도와 목록을 갱신";
  syncBtn.addEventListener("click", () => {
    if (window.TRIP_OVERRIDES?.sync) window.TRIP_OVERRIDES.sync();
  });
  container.parentElement.insertBefore(syncBtn, container.nextSibling);

  const legend = document.createElement("ol");
  legend.className = "day-map-legend";
  stops.forEach((stop, i) => {
    const li = document.createElement("li");
    li.className = "day-map-legend-item";
    li.tabIndex = 0;
    li.innerHTML = `<span class="legend-letter">${letters[i]}</span><span class="legend-time">${stop.time}</span><span class="legend-name">${stop.name}</span>`;
    const focusMarker = () => {
      markers.forEach((m) => m.info.close());
      map.panTo(markers[i].position);
      if (map.getZoom() < 14) map.setZoom(15);
      markers[i].info.open({ anchor: markers[i].marker, map });
    };
    li.addEventListener("click", focusMarker);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        focusMarker();
      }
    });
    legend.appendChild(li);
  });
  container.parentElement.insertBefore(legend, container.nextSibling);
}

function whenUnlocked(cb) {
  if (window.TRIP_GATE) cb();
  else document.addEventListener("trip-gate:unlocked", cb, { once: true });
}

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  loadWeather();
  renderChecklist();
  setupTransitGuides();
  whenUnlocked(loadFlight);

  document.querySelectorAll(".tab[data-panel]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.panel;
      if (DAY_MAPS[key]) initDayMap(key);
    });
  });
});
