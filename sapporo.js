const TRIP_DATES = ["2026-06-05", "2026-06-06", "2026-06-07", "2026-06-08"];
const SAPPORO = { lat: 43.0618, lon: 141.3545 };

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
      const date = tab.dataset.date;
      tabs.forEach((t) => {
        const active = t.dataset.date === date;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      panels.forEach((p) => {
        const active = p.dataset.date === date;
        p.classList.toggle("is-active", active);
        p.hidden = !active;
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  loadWeather();
});
