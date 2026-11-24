# Skyline Weather

Interactive weather app built with HTML, CSS and vanilla JavaScript.

**API:** [Open-Meteo](https://open-meteo.com) (geocoding + forecast, no API key needed)

## Features
- Search any city, view current conditions and a 7-day forecast
- Filter forecast days (All / Rainy / Dry) and click a day for details
- °C / °F toggle
- Loading, error and empty states
- **Local Storage:** saved cities, chosen unit and last viewed city persist after refresh

## Requirement mapping
| Requirement | Where |
|---|---|
| DOM manipulation & dynamic rendering | `renderDays`, `renderDetail`, `renderSaved`, search results |
| Event handling & array methods | `addEventListener` throughout; `map`, `filter`, `forEach`, `find`, `some` |
| fetch + async/await, loading/error/empty | `searchCities`, `fetchForecast`, `loadWeather`, `showLoading/showError/showEmpty` |
| localStorage | `store` helper; keys `wx.saved`, `wx.units`, `wx.last` |


