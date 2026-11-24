"use strict";

/* ---------- Constants & state ---------- */
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// WMO weather codes -> [description, icon]
const WEATHER_CODES = {
  0: ["Clear sky", "☀️"], 1: ["Mainly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Freezing fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌦️"],
  61: ["Light rain", "🌧️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"],
  80: ["Rain showers", "🌦️"], 81: ["Heavy showers", "🌧️"], 82: ["Violent showers", "⛈️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm, hail", "⛈️"], 99: ["Severe thunderstorm", "⛈️"]
};

const state = {
  units: "celsius",     // "celsius" | "fahrenheit"
  saved: [],            // [{ id, name, country, admin, lat, lon }]
  city: null,           // currently displayed city
  days: [],             // normalized daily forecast objects
  filter: "all",
  selectedDate: null
};

/* ---------- DOM references ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  form: $("search-form"), input: $("search-input"), results: $("search-results"),
  savedList: $("saved-list"), savedEmpty: $("saved-empty"),
  stateBox: $("state"), weather: $("weather"),
  cityName: $("city-name"), citySub: $("city-sub"), saveBtn: $("save-btn"),
  curIcon: $("cur-icon"), curTemp: $("cur-temp"), curDesc: $("cur-desc"),
  curFeels: $("cur-feels"), curHum: $("cur-hum"), curWind: $("cur-wind"),
  days: $("days"), daysEmpty: $("days-empty"), detail: $("day-detail"),
  unitC: $("unit-c"), unitF: $("unit-f"), chips: document.querySelectorAll(".chip")
};

/* ---------- Local Storage helpers ---------- */
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }
};

/* ---------- Helpers ---------- */
const describe = (code) => WEATHER_CODES[code] || ["Unknown", "❔"];
const unitSymbol = () => (state.units === "celsius" ? "°C" : "°F");
const windUnit = () => (state.units === "celsius" ? "km/h" : "mph");
const round = (n) => Math.round(n);
const cityId = (c) => `${c.lat.toFixed(2)},${c.lon.toFixed(2)}`;
const isSaved = (c) => state.saved.some((s) => s.id === cityId(c));

function dayLabel(dateStr, index) {
  if (index === 0) return "Today";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- UI states (loading / error / empty) ---------- */
function showLoading(message) {
  el.weather.hidden = true;
  el.stateBox.hidden = false;
  el.stateBox.className = "state";
  el.stateBox.replaceChildren(make("div", "spinner"), make("p", "", message));
}
function showError(message) {
  el.weather.hidden = true;
  el.stateBox.hidden = false;
  el.stateBox.className = "state error";
  el.stateBox.replaceChildren(make("p", "", message));
}
function showEmpty() {
  el.weather.hidden = true;
  el.stateBox.hidden = false;
  el.stateBox.className = "state";
  el.stateBox.replaceChildren(
    make("p", "", "Search for a city to see its weather, or pick one from your saved list.")
  );
}
function showWeather() {
  el.stateBox.hidden = true;
  el.weather.hidden = false;
}

/* ---------- API: geocoding (async/await + fetch) ---------- */
async function searchCities(query) {
  const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  return (data.results || []).map((r) => ({
    id: "", name: r.name, country: r.country || "", admin: r.admin1 || "",
    lat: r.latitude, lon: r.longitude
  })).map((c) => ({ ...c, id: cityId(c) }));
}

async function onSearch(event) {
  event.preventDefault();
  const query = el.input.value.trim();
  if (!query) return;
  el.results.replaceChildren(make("li", "hint", "Searching…"));
  try {
    const cities = await searchCities(query);
    renderSearchResults(cities);
  } catch (err) {
    el.results.replaceChildren(
      make("li", "hint", "Could not search right now. Check your connection and try again.")
    );
  }
}

function renderSearchResults(cities) {
  el.results.replaceChildren();
  if (cities.length === 0) {
    el.results.append(make("li", "hint", "No cities found. Check the spelling or try a nearby city."));
    return;
  }
  cities.forEach((city) => {
    const li = make("li");
    const btn = make("button", "", city.name);
    btn.type = "button";
    btn.append(make("small", "", [city.admin, city.country].filter(Boolean).join(", ")));
    btn.addEventListener("click", () => {
      el.results.replaceChildren();
      el.input.value = "";
      loadWeather(city);
    });
    li.append(btn);
    el.results.append(li);
  });
}

/* ---------- API: forecast ---------- */
async function fetchForecast(city) {
  const params = new URLSearchParams({
    latitude: city.lat, longitude: city.lon, timezone: "auto", forecast_days: 7,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset",
    temperature_unit: state.units,
    wind_speed_unit: state.units === "celsius" ? "kmh" : "mph"
  });
  const res = await fetch(`${FORECAST_URL}?${params}`);
  if (!res.ok) throw new Error(`Forecast failed (${res.status})`);
  return res.json();
}

async function loadWeather(city) {
  showLoading(`Loading weather for ${city.name}…`);
  try {
    const data = await fetchForecast(city);
    state.city = city;
    state.filter = "all";
    state.selectedDate = null;
    state.days = data.daily.time.map((date, i) => ({
      date,
      code: data.daily.weather_code[i],
      max: data.daily.temperature_2m_max[i],
      min: data.daily.temperature_2m_min[i],
      rainChance: data.daily.precipitation_probability_max[i] ?? 0,
      rainSum: data.daily.precipitation_sum[i] ?? 0,
      uv: data.daily.uv_index_max[i],
      sunrise: data.daily.sunrise[i],
      sunset: data.daily.sunset[i]
    }));
    store.set("wx.last", city);          // Local Storage: remember last city
    renderCurrent(data.current);
    renderChips();
    renderDays();
    renderSaved();
    showWeather();
  } catch (err) {
    showError("We couldn't load the forecast. Check your internet connection and try again.");
  }
}

/* ---------- Rendering ---------- */
function renderCurrent(cur) {
  const [desc, icon] = describe(cur.weather_code);
  el.cityName.textContent = state.city.name;
  el.citySub.textContent = [state.city.admin, state.city.country].filter(Boolean).join(", ");
  el.curIcon.textContent = icon;
  el.curTemp.textContent = `${round(cur.temperature_2m)}${unitSymbol()}`;
  el.curDesc.textContent = desc;
  el.curFeels.textContent = `${round(cur.apparent_temperature)}${unitSymbol()}`;
  el.curHum.textContent = `${cur.relative_humidity_2m}%`;
  el.curWind.textContent = `${round(cur.wind_speed_10m)} ${windUnit()}`;
  updateSaveButton();
}

function updateSaveButton() {
  const saved = isSaved(state.city);
  el.saveBtn.textContent = saved ? "Saved ✓ (remove)" : "Save city";
  el.saveBtn.classList.toggle("saved", saved);
}

function visibleDays() {
  if (state.filter === "rain") return state.days.filter((d) => d.rainChance >= 40);
  if (state.filter === "dry") return state.days.filter((d) => d.rainChance < 40);
  return state.days;
}

function renderDays() {
  const days = visibleDays();
  el.days.replaceChildren();
  el.daysEmpty.hidden = days.length > 0;

  days.forEach((day) => {
    const [, icon] = describe(day.code);
    const index = state.days.indexOf(day);
    const card = make("button", "day" + (day.date === state.selectedDate ? " selected" : ""));
    card.type = "button";
    card.dataset.date = day.date;
    card.append(
      make("span", "dname", dayLabel(day.date, index)),
      make("span", "dicon", icon),
      make("span", "hi", `${round(day.max)}°`),
      make("span", "lo", `${round(day.min)}°`),
      make("span", "rain", `${day.rainChance}% rain`)
    );
    card.addEventListener("click", () => selectDay(day.date));
    el.days.append(card);
  });
  renderDetail();
}

function selectDay(date) {
  state.selectedDate = state.selectedDate === date ? null : date;
  renderDays();
}

function renderDetail() {
  const day = state.days.find((d) => d.date === state.selectedDate);
  if (!day) { el.detail.hidden = true; return; }
  const [desc] = describe(day.code);
  const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const rows = [
    ["Conditions", desc],
    ["High / Low", `${round(day.max)}${unitSymbol()} / ${round(day.min)}${unitSymbol()}`],
    ["Rain chance", `${day.rainChance}%`],
    ["Rain total", `${day.rainSum} mm`],
    ["UV index", day.uv ?? "–"],
    ["Sunrise", time(day.sunrise)],
    ["Sunset", time(day.sunset)]
  ];
  const dl = make("dl");
  rows.forEach(([label, value]) => {
    const wrap = make("div");
    wrap.append(make("dt", "", label), make("dd", "", String(value)));
    dl.append(wrap);
  });
  el.detail.replaceChildren(make("h4", "", new Date(day.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })), dl);
  el.detail.hidden = false;
}

function renderChips() {
  el.chips.forEach((chip) => chip.classList.toggle("active", chip.dataset.filter === state.filter));
}

/* ---------- Saved cities (Local Storage) ---------- */
function renderSaved() {
  el.savedList.replaceChildren();
  el.savedEmpty.hidden = state.saved.length > 0;
  state.saved.forEach((city) => {
    const li = make("li");
    const pick = make("button", "pick", city.name);
    pick.type = "button";
    pick.append(make("small", "", [city.admin, city.country].filter(Boolean).join(", ")));
    pick.addEventListener("click", () => loadWeather(city));
    const remove = make("button", "remove", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${city.name}`);
    remove.addEventListener("click", () => removeCity(city.id));
    li.append(pick, remove);
    el.savedList.append(li);
  });
}

function toggleSaveCurrent() {
  if (!state.city) return;
  if (isSaved(state.city)) removeCity(cityId(state.city));
  else {
    state.saved.push({ ...state.city, id: cityId(state.city) });
    store.set("wx.saved", state.saved);
    renderSaved();
    updateSaveButton();
  }
}

function removeCity(id) {
  state.saved = state.saved.filter((c) => c.id !== id);
  store.set("wx.saved", state.saved);
  renderSaved();
  if (state.city) updateSaveButton();
}

/* ---------- Units ---------- */
function setUnits(units, reload = true) {
  state.units = units;
  store.set("wx.units", units);
  el.unitC.classList.toggle("active", units === "celsius");
  el.unitF.classList.toggle("active", units === "fahrenheit");
  el.unitC.setAttribute("aria-pressed", units === "celsius");
  el.unitF.setAttribute("aria-pressed", units === "fahrenheit");
  if (reload && state.city) loadWeather(state.city);
}

/* ---------- Events ---------- */
el.form.addEventListener("submit", onSearch);
el.saveBtn.addEventListener("click", toggleSaveCurrent);
el.unitC.addEventListener("click", () => setUnits("celsius"));
el.unitF.addEventListener("click", () => setUnits("fahrenheit"));
el.chips.forEach((chip) =>
  chip.addEventListener("click", () => {
    state.filter = chip.dataset.filter;
    state.selectedDate = null;
    renderChips();
    renderDays();
  })
);

/* ---------- Init: restore data after refresh ---------- */
function init() {
  state.saved = store.get("wx.saved", []);
  setUnits(store.get("wx.units", "celsius"), false);
  renderSaved();
  const last = store.get("wx.last", null);
  if (last) loadWeather(last);
  else showEmpty();
}
init();
