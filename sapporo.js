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
      "여권 (유효기간 6개월 이상)",
      "항공권 (e-티켓 사본·모바일)",
      "호텔 예약 확인서",
      "여행자 보험 증서 (긴급 연락처 포함)",
      "비상 연락처 메모 (가족·대사관)",
      "신용카드·직불카드 (해외결제 가능 확인)",
      "엔화 현금 (소액 환전)",
      "교통용 IC카드 또는 Welcome Suica 앱",
      "국제 운전면허증 (렌터카 시)",
    ],
  },
  {
    category: "전자기기",
    items: [
      "휴대폰 + 충전기 + 케이블",
      "보조배터리 (기내 휴대만, 100Wh 이하)",
      "돼지코 어댑터 (일본 A타입 / 100V)",
      "포켓 와이파이 또는 eSIM (사전 활성화)",
      "이어폰·헤드폰",
      "카메라 + 메모리카드 + 여분 배터리 (선택)",
      "노트북·태블릿 (선택)",
    ],
  },
  {
    category: "의류 (6월 삿포로 평균 10~20°C, 일교차 큼)",
    items: [
      "긴팔 셔츠·티셔츠 4~5장",
      "가벼운 자켓 또는 바람막이",
      "긴바지 2~3벌",
      "편한 운동화 (도보 많음)",
      "양말·속옷 (일수 +1)",
      "잠옷",
      "휴대용 우산 또는 우비 (장마 직전)",
      "모자",
      "얇은 스카프·머플러 (저녁 쌀쌀할 때)",
    ],
  },
  {
    category: "세면도구·위생",
    items: [
      "칫솔·치약 (호텔 품질 낮은 경우 많음)",
      "샴푸·린스·바디워시 (대부분 호텔 제공)",
      "스킨케어·기초화장품",
      "선크림",
      "면도기",
      "여성용품",
      "손세정제·휴대용 티슈",
      "예비 마스크",
    ],
  },
  {
    category: "의약품 (개인 처방약 별도)",
    items: [
      "감기약·해열제",
      "두통약",
      "소화제·지사제",
      "멀미약",
      "1회용 밴드·소독제",
      "안약 (선택)",
      "처방약 (영문 소견서 동봉 권장)",
    ],
  },
  {
    category: "기타 짐",
    items: [
      "휴대용 우산",
      "에코백·보조 가방 (일본은 비닐봉투 유료)",
      "지퍼백·비닐백 (정리·세탁물)",
      "여행용 슬리퍼",
      "비상식량 (라면·김·즉석밥 등)",
      "노트와 펜",
    ],
  },
  {
    category: "출발 전 체크",
    items: [
      "Visit Japan Web 사전 등록 (입국·세관 QR)",
      "온라인 체크인 (출발 24시간 전)",
      "구글맵·파파고·NAVITIME·환율 앱 설치",
      "데이터 로밍 또는 eSIM 동작 확인",
      "자동출입국심사 등록 확인",
      "집 가스·전기 차단",
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

    const heading = document.createElement("h3");
    heading.textContent = cat.category;
    section.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "checklist-items";

    cat.items.forEach((label, ii) => {
      const id = `chk-${ci}-${ii}`;
      const li = document.createElement("li");
      li.className = "checklist-item";

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
      list.appendChild(li);
    });

    section.appendChild(list);
    root.appendChild(section);
  });

  updateSummary();
}

function formatKrw(n) {
  return "KRW " + Number(n).toLocaleString("ko-KR");
}

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

  const passengersHtml = data.passengers
    .map((p) => `
      <li>
        <div class="flight-passenger-name">${p.name}</div>
        <div class="flight-tickets">${p.tickets.join(" · ")}</div>
      </li>
    `)
    .join("");

  root.innerHTML = `
    <section class="flight-meta">
      <div class="flight-label">예약번호</div>
      <div class="flight-pnr">${data.pnr}</div>
    </section>
    ${segmentsHtml}
    <section class="flight-passengers">
      <h3>탑승객</h3>
      <ul>${passengersHtml}</ul>
    </section>
    <section class="flight-total">
      <span class="flight-label">총 금액</span>
      <span class="flight-value">${formatKrw(data.totalKrw)}</span>
    </section>
  `;
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
    { time: "19:00", name: "스미레 라멘 (스스키노)", coords: [43.0537, 141.3573] },
    { time: "21:00", name: "호텔 복귀", coords: [43.0635, 141.3520] },
  ],
  "2026-06-06": [
    { time: "07:00", name: "JR 삿포로역 북쪽출구 단체버스", coords: [43.0692, 141.3508] },
    { time: "10:30", name: "패치워크 로드 · 켄과 메리의 나무", coords: [43.6107, 142.4329] },
    { time: "11:30", name: "시키사이노오카", coords: [43.5566, 142.4838] },
    { time: "14:00", name: "청의 호수 (Blue Pond)", coords: [43.4963, 142.6395] },
    { time: "15:00", name: "시라히게 폭포", coords: [43.5114, 142.6481] },
    { time: "18:30", name: "JR 삿포로역 도착", coords: [43.0686, 141.3508] },
    { time: "22:00", name: "호텔 복귀", coords: [43.0635, 141.3520] },
  ],
  "2026-06-07": [
    { time: "10:00", name: "오타루 운하", coords: [43.1985, 141.0029] },
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&language=ko&region=JP&callback=__onMapsLoaded&loading=async`;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return mapsApiLoadPromise;
}

async function initDayMap(date) {
  if (dayMapBuilt[date]) return;
  const container = document.getElementById(`day-map-${date}`);
  const stops = DAY_MAPS[date];
  if (!container || !stops || stops.length === 0) return;
  dayMapBuilt[date] = true;

  try {
    await loadMapsApi();
  } catch (e) {
    container.innerHTML = `<div class="map-error">지도를 불러오지 못했습니다.</div>`;
    return;
  }

  const map = new google.maps.Map(container, {
    zoom: 12,
    center: { lat: stops[0].coords[0], lng: stops[0].coords[1] },
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });

  const bounds = new google.maps.LatLngBounds();
  const markers = [];
  const letters = "ABCDEFGHIJKLMN".split("");

  stops.forEach((stop, i) => {
    const position = { lat: stop.coords[0], lng: stop.coords[1] };
    const marker = new google.maps.Marker({
      position,
      map,
      label: { text: letters[i], color: "#fff", fontWeight: "bold", fontSize: "13px" },
      title: `${letters[i]}. ${stop.name}`,
    });
    const info = new google.maps.InfoWindow({
      content: `<div style="font-size:13px;line-height:1.4"><strong>${letters[i]}. ${stop.name}</strong><br>${stop.time}</div>`,
    });
    marker.addListener("click", () => {
      markers.forEach((m) => m.info.close());
      info.open(map, marker);
    });
    markers.push({ marker, info, position });
    bounds.extend(position);
  });

  map.fitBounds(bounds, 50);

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
      markers[i].info.open(map, markers[i].marker);
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
  whenUnlocked(loadFlight);

  document.querySelectorAll(".tab[data-panel]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.panel;
      if (DAY_MAPS[key]) initDayMap(key);
    });
  });
});
