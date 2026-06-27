// =========================================================================
// [COMPONENT] 홈 화면 프리미엄 웨더 대시보드 및 오픈 API 실시간 캐싱 엔진
// =========================================================================
import { TIDE_STATIONS } from '../../utils/constants.js';

window.HOME_CARD_CACHE_KEY = "home_card_weather_tide_data";
window.HOME_SELECTED_FAV_KEY = "home_selected_favorite_id";
window.CACHE_EXPIRE_TIME = 60 * 60 * 1000;
window.isHomeCardLoaded = false;

window.initHomeDataSequence = async function () {
  await window.populateHomeFavoritesDropdown();
};

window.populateHomeFavoritesDropdown = async function () {
  const selectEl = document.getElementById("hcHomeFavoriteSelect");
  if (!selectEl) {
    window.isHomeCardLoaded = true;
    if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
    return;
  }

  let favorites = [];
  if (Array.isArray(window.cachedFishingPoints)) {
    favorites = window.cachedFishingPoints.filter(p => p.isFavorite === true || p.favorite === true);
  }

  selectEl.innerHTML = '<option value="my_location">내 위치</option>';
  favorites.forEach(fav => {
    const opt = document.createElement("option");
    opt.value = `${fav.lat},${fav.lng}`;
    opt.textContent = fav.name || fav.title || "지정 포인트";
    opt.setAttribute("data-id", fav.id || fav.docId || fav.name);
    selectEl.appendChild(opt);
  });

  const savedSelectedId = localStorage.getItem(window.HOME_SELECTED_FAV_KEY);
  if (savedSelectedId && savedSelectedId !== "my_location") {
    let targetOpt = null;
    for (let i = 0; i < selectEl.options.length; i++) {
      if (selectEl.options[i].getAttribute("data-id") === savedSelectedId) {
        targetOpt = selectEl.options[i];
        break;
      }
    }
    if (targetOpt) selectEl.value = targetOpt.value;
    else selectEl.value = "my_location";
  } else {
    selectEl.value = "my_location";
  }

  const cacheData = localStorage.getItem(window.HOME_CARD_CACHE_KEY);
  if (cacheData) {
    try {
      const parsed = JSON.parse(cacheData);
      const currentTime = Date.now();
      if (parsed.selectedValue === selectEl.value && (currentTime - parsed.timestamp < window.CACHE_EXPIRE_TIME) && parsed.payload) {
        window.applyHomeCardDOM(parsed.payload);
        window.isHomeCardLoaded = true;
        if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
        return;
      }
    } catch (e) {
      localStorage.removeItem(window.HOME_CARD_CACHE_KEY);
    }
  }

  if (selectEl.value === "my_location") {
    if (window.userLatLng) await window.updateHomeCardByLocation(window.userLatLng.lat, window.userLatLng.lng);
    else {
      window.fallbackHomeDataLoad();
      window.isHomeCardLoaded = true;
      if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
    }
  } else {
    const [lat, lng] = selectEl.value.split(",").map(Number);
    if (lat && lng) await window.updateHomeCardByLocation(lat, lng);
  }
};

window.handleHomeFavoriteChange = async function (selectEl) {
  if (!selectEl) return;
  
  const mainCardEl = document.querySelector(".hc-main-card");
  if (mainCardEl) {
    mainCardEl.style.transition = "opacity 0.2s ease";
    mainCardEl.style.opacity = "0.4";
  }

  window.fallbackHomeDataLoad(true);
  await new Promise(resolve => setTimeout(resolve, 800));

  if (selectEl.value === "my_location") {
    localStorage.setItem(window.HOME_SELECTED_FAV_KEY, "my_location");
    if (window.userLatLng) {
      await window.updateHomeCardByLocation(window.userLatLng.lat, window.userLatLng.lng);
    } else {
      if (mainCardEl) mainCardEl.style.opacity = "1";
    }
  } else {
    const [lat, lng] = selectEl.value.split(",").map(Number);
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const favId = selectedOption?.getAttribute("data-id");

    if (favId) localStorage.setItem(window.HOME_SELECTED_FAV_KEY, favId);
    if (lat && lng) await window.updateHomeCardByLocation(lat, lng);
  }
};

window.updateHomeCardByLocation = async function (lat, lng) {
  if (window.isFetchingAPI) {
    console.warn("[SYSTEM] 이전 API 파이프라인이 가동 중이므로 중복 호출을 차단합니다.");
    return;
  }

  window.isFetchingAPI = true;
  const selectEl = document.getElementById("hcHomeFavoriteSelect");
  const currentVal = selectEl ? selectEl.value : `${lat},${lng}`;

  try {
    const payload = await window.fetchAllPublicOpenAPI(lat, lng);
    const cacheObject = { timestamp: Date.now(), selectedValue: currentVal, payload: payload };
    localStorage.setItem(window.HOME_CARD_CACHE_KEY, JSON.stringify(cacheObject));
    window.applyHomeCardDOM(payload);
  } catch (err) {
    console.error("위치 기반 공공데이터 연동 갱신 실패:", err);
    window.fallbackHomeDataLoad();
  } finally {
    window.isFetchingAPI = false;
    window.isHomeCardLoaded = true;
    if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
    const mainCardEl = document.querySelector(".hc-main-card");
    if (mainCardEl) {
      mainCardEl.style.opacity = "1";
    }
  }
};

window.refreshHomeLocation = async function (btnElement) {
  const selectEl = document.getElementById("hcHomeFavoriteSelect");
  if (!selectEl || !selectEl.value) return;

  localStorage.removeItem(window.HOME_CARD_CACHE_KEY);
  window.fallbackHomeDataLoad(true);

  const mainCardEl = document.querySelector(".hc-main-card");
  if (mainCardEl) {
    mainCardEl.style.transition = "opacity 0.2s ease";
    mainCardEl.style.opacity = "0.4"; 
  }

  let targetIcon = btnElement;
  if (btnElement) {
    btnElement.style.pointerEvents = "none";
    const icon = btnElement.querySelector(".hc-refresh-icon-g");
    if (icon) {
      icon.classList.add("hc-spin-anim"); 
      targetIcon = icon;
    }
  }

  await new Promise(resolve => setTimeout(resolve, 800));

  if (selectEl.value === "my_location") {
    if (window.userLatLng) {
      await window.updateHomeCardByLocation(window.userLatLng.lat, window.userLatLng.lng);
    } else {
      if (btnElement) {
        btnElement.style.pointerEvents = "auto"; 
        if (targetIcon) targetIcon.classList.remove("hc-spin-anim");
      }
      if (mainCardEl) mainCardEl.style.opacity = "1";
      return;
    }
  } else {
    const [lat, lng] = selectEl.value.split(",").map(Number);
    await window.updateHomeCardByLocation(lat, lng);
  }

  if (btnElement) {
    btnElement.style.pointerEvents = "auto"; 
    if (targetIcon) targetIcon.classList.remove("hc-spin-anim");
  }
};

window.fetchAllPublicOpenAPI = async function (lat, lng) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const kmaKey = `${dateStr}${String(now.getHours()).padStart(2, '0')}00`;

  const findLatestData = (map, tKey) => {
    if (!map) return null;
    if (map[tKey]) return map[tKey];
    const keys = Object.keys(map).sort();
    let best = null;
    for (let k of keys) { if (k <= tKey) best = map[k]; }
    return best || map[keys[0]]; 
  };

  const getBearingStr = (deg) => {
    if (deg === undefined || deg === null) return "---";
    const d = parseFloat(deg);
    if (d >= 337.5 || d < 22.5) return "북";
    if (d >= 22.5 && d < 67.5) return "북동";
    if (d >= 67.5 && d < 112.5) return "동";
    if (d >= 112.5 && d < 157.5) return "남동";
    if (d >= 157.5 && d < 202.5) return "남";
    if (d >= 202.5 && d < 247.5) return "남서";
    if (d >= 247.5 && d < 292.5) return "서";
    if (d >= 292.5 && d < 337.5) return "북서";
    return "---";
  };

  let lunarDay = now.getDate();
  try {
    const lunarRaw = new Intl.DateTimeFormat('ko-KR-u-ca-chinese').format(now);
    const lunarArr = lunarRaw.split('.').map(s => s.trim()).filter(Boolean);
    if (lunarArr.length >= 3) lunarDay = parseInt(lunarArr[2], 10);
  } catch (e) {}
  const tideNames8 = ["조금", "1물", "2물", "3물", "4물", "5물", "6물", "7물", "8물", "9물", "10물", "11물", "12물", "13물", "14물"];
  const currentTideIdx = tideNames8[(lunarDay + 7) % 15];

  const obsCode = window.getNearestTideStation(lat, lng);
  const stationObj = TIDE_STATIONS.find(s => s.code === obsCode) || TIDE_STATIONS[0];

  let weatherMap = null;
  let seaWeatherMap = null;
  let waterTempMap = null;
  let realTides = [];

  try {
    const res = await Promise.allSettled([
      window.fetchSunriseSunsetForDatesPromise(lat, lng, [dateStr]),
      window.fetchKMAWeatherPromise(lat, lng),
      window.fetchKMAWeatherPromise(stationObj.lat, stationObj.lng !== undefined ? stationObj.lng : (stationObj.mesh !== undefined ? stationObj.mesh : lng)),
      window.fetchRealWaterTempPromise(lat, lng, [dateStr]),
      window.fetchTideData3DaysPromise(lat, lng)
    ]);

    if (res[1].status === 'fulfilled') weatherMap = res[1].value;
    if (res[2].status === 'fulfilled') seaWeatherMap = res[2].value;
    if (res[3].status === 'fulfilled') waterTempMap = res[3].value;
    if (res[4].status === 'fulfilled') realTides = res[4].value;
  } catch (err) {
    console.error("오픈 API 병렬 수신 중 에러:", err);
  }

  const sunTimes = window.getSunTimesForDate(now);
  const currentSunrise = sunTimes.sunrise ? `일출 ${sunTimes.sunrise}` : "일출 --:--";
  const currentSunset = sunTimes.sunset ? `일몰 ${sunTimes.sunset}` : "일몰 --:--";

  let currentTemp = "--°C", currentWeather = "맑음", currentRain = "0% · 0mm", currentWind = "--- · -.-m/s", currentWave = "--.-m";

  let kma = findLatestData(weatherMap, kmaKey);
  let seaKma = findLatestData(seaWeatherMap, kmaKey);
  if (!kma && seaKma) kma = seaKma;

  if (kma) {
    if (kma.TMP) currentTemp = `${kma.TMP}°C`;
    
    let pop = kma.POP ? kma.POP : "0";
    let pcp = kma.PCP ? kma.PCP : "0mm";
    if (pcp === '강수없음') pcp = '0mm';
    currentRain = `${pop}% · ${pcp}`;

    if (kma.WAV) { currentWave = `${parseFloat(kma.WAV).toFixed(1)}m`; } else if (seaKma && seaKma.WAV) { currentWave = `${parseFloat(seaKma.WAV).toFixed(1)}m`; }
    
    let windVal = kma.WSD ? parseFloat(kma.WSD).toFixed(0) + "m/s" : "-m/s";
    let dirVal = "↓";
    if (kma.VEC) {
      const deg = parseFloat(kma.VEC);
      if (deg >= 337.5 || deg < 22.5) dirVal = "북풍";
      else if (deg >= 22.5 && deg < 67.5) dirVal = "북동풍";
      else if (deg >= 67.5 && deg < 112.5) dirVal = "동풍";
      else if (deg >= 112.5 && deg < 157.5) dirVal = "남동풍";
      else if (deg >= 157.5 && deg < 202.5) dirVal = "남풍";
      else if (deg >= 202.5 && deg < 247.5) dirVal = "남서풍";
      else if (deg >= 247.5 && deg < 292.5) dirVal = "서풍";
      else if (deg >= 292.5 && deg < 337.5) dirVal = "북서풍";
    }
    currentWind = `${dirVal} · ${windVal}`;

    if (kma.PTY && kma.PTY !== "0") { currentWeather = kma.PTY === "3" ? "눈" : "비"; }
    else if (kma.SKY === "3") { currentWeather = "구름많음"; }
    else if (kma.SKY === "4") { currentWeather = "흐림"; }
    else { currentWeather = "맑음"; }
  } else if (seaKma && seaKma.WAV) {
    currentWave = `${parseFloat(seaKma.WAV).toFixed(1)}m`;
  }

  let rObj = null;
  if (waterTempMap && waterTempMap.details) {
    if (waterTempMap.details[kmaKey]) {
      rObj = waterTempMap.details[kmaKey];
    } else {
      const fk = Object.keys(waterTempMap.details).find(k => k.startsWith(kmaKey.substring(0, 8)));
      if (fk) rObj = waterTempMap.details[fk];
    }
  }

  let currentWaterTemp = "--.-°C", currentCrdir = "---", currentCrsp = "--m/s";
  if (rObj) {
    currentWaterTemp = rObj.wtemp ? (rObj.wtemp.includes("°C") ? rObj.wtemp : rObj.wtemp + "°C") : "--.-°C";
    currentCrsp = rObj.crsp ? rObj.crsp : "--m/s";
    if (rObj.crdir !== null && rObj.crdir !== undefined) {
      currentCrdir = getBearingStr(rObj.crdir);
    }
  }

  let targetTides = realTides || [];
  if (targetTides.length === 0) {
    let dummyTides = [];
    for (let k = 0; k < 4; k++) {
      let xHigh = 112 * (Math.PI / 2 + 2 * k * Math.PI); let xLow = 112 * (3 * Math.PI / 2 + 2 * k * Math.PI);
      let hH = xHigh / 56; let dH = new Date(now.getTime() + hH * 60 * 60 * 1000);
      let hL = xLow / 56; let dL = new Date(now.getTime() + hL * 60 * 60 * 1000);
      dummyTides.push({ type: '만조', time: `${String(dH.getHours()).padStart(2, '0')}:${String(dH.getMinutes()).padStart(2, '0')}`, level: '270', hoursFromNow: hH, rawDt: dH.toISOString() });
      dummyTides.push({ type: '간조', time: `${String(dL.getHours()).padStart(2, '0')}:${String(dL.getMinutes()).padStart(2, '0')}`, level: '50', hoursFromNow: hL, rawDt: dL.toISOString() });
    }
    targetTides = dummyTides;
  }

  let currentDetailedTideStr = "물때 계산중";
  if (targetTides.length > 0) {
    const nowMs = now.getTime();
    let pastEvent = null;
    let futureEvent = null;

    const absoluteSchedule = targetTides.map(ev => {
      const evTime = ev.rawDt ? new Date(ev.rawDt.replace(/-/g, '/')).getTime() : (nowMs + ev.hoursFromNow * 60 * 60 * 1000);
      return { ...ev, absTime: evTime };
    }).sort((a, b) => a.absTime - b.absTime);

    for (let ev of absoluteSchedule) {
      if (ev.absTime <= nowMs) pastEvent = ev;
      else if (ev.absTime > nowMs && !futureEvent) futureEvent = ev;
    }

    if (pastEvent) {
      const elapsedHours = (nowMs - pastEvent.absTime) / (1000 * 60 * 60);
      if (pastEvent.type === '간조') {
        if (elapsedHours <= 0.2) currentDetailedTideStr = "간조";
        else if (elapsedHours <= 2.0) currentDetailedTideStr = "초들물";
        else if (elapsedHours <= 4.0) currentDetailedTideStr = "중들물";
        else currentDetailedTideStr = "끝들물";
      } else {
        if (elapsedHours <= 0.2) currentDetailedTideStr = "만조";
        else if (elapsedHours <= 2.0) currentDetailedTideStr = "초날물";
        else if (elapsedHours <= 4.0) currentDetailedTideStr = "중날물";
        else currentDetailedTideStr = "끝날물";
      }
    } else if (futureEvent) {
      const remainingHours = (futureEvent.absTime - nowMs) / (1000 * 60 * 60);
      if (futureEvent.type === '만조') {
        if (remainingHours <= 0.2) currentDetailedTideStr = "만조";
        else if (remainingHours <= 2.0) currentDetailedTideStr = "끝들물";
        else if (remainingHours <= 4.0) currentDetailedTideStr = "중들물";
        else currentDetailedTideStr = "초들물";
      } else {
        if (remainingHours <= 0.2) currentDetailedTideStr = "간조";
        else if (remainingHours <= 2.0) currentDetailedTideStr = "끝날물";
        else if (remainingHours <= 4.0) currentDetailedTideStr = "중날물";
        else currentDetailedTideStr = "초날물";
      }
    }
  }

  const nowMs = now.getTime();
  let futureEvents = targetTides.filter(ev => {
    const evTime = ev.rawDt ? new Date(ev.rawDt.replace(/-/g, '/')).getTime() : (nowMs + ev.hoursFromNow * 60 * 60 * 1000);
    return evTime >= nowMs;
  });
  futureEvents.sort((a, b) => {
    const timeA = a.rawDt ? new Date(a.rawDt.replace(/-/g, '/')).getTime() : (nowMs + a.hoursFromNow * 60 * 60 * 1000);
    const timeB = b.rawDt ? new Date(b.rawDt.replace(/-/g, '/')).getTime() : (nowMs + b.hoursFromNow * 60 * 60 * 1000);
    return timeA - timeB;
  });

  let tideLowText = "간조 <tspan class=\"hc-txt-muted\" font-weight=\"normal\">--:-- ▼--cm</tspan>";
  let tideHighText = "만조 <tspan class=\"hc-txt-muted\" font-weight=\"normal\">--:-- ▲--cm</tspan>";

  if (futureEvents.length >= 1) { 
    const ev1 = futureEvents[0]; 
    tideLowText = `${ev1.type} <tspan class="hc-txt-muted" font-weight="normal">${ev1.time} ${ev1.type === "만조" ? "▲" : "▼"}${ev1.level || ev1.value || "--"}cm</tspan>`; 
  }
  if (futureEvents.length >= 2) { 
    const ev2 = futureEvents[1]; 
    tideHighText = `${ev2.type} <tspan class="hc-txt-muted" font-weight="normal">${ev2.time} ${ev2.type === "만조" ? "▲" : "▼"}${ev2.level || ev2.value || "--"}cm</tspan>`; 
  } else { 
    tideHighText = ""; 
  }

  const oceanSummaryText = `<tspan class="hc-txt-muted" font-weight="normal">${currentWaterTemp} · ${currentWave} · ${currentCrdir} · ${currentCrsp}</tspan>`;

  return {
    timeStr: window.getFormattedCurrentTime(), temp: currentTemp, weather: currentWeather, rain: currentRain, wind: currentWind,
    sunrise: currentSunrise, sunset: currentSunset, tideIdx: currentTideIdx, 
    tideStatus: currentDetailedTideStr, oceanSummary: oceanSummaryText, tideLow: tideLowText, tideHigh: tideHighText
  };
};

window.applyHomeCardDOM = function (payload) {
  if (!payload) return;
  
  const setTxt = (className, val) => { 
    const el = document.querySelector(`.hc-premium-card ${className}`); 
    if (el) el.textContent = val; 
  };
  
  const setHtml = (className, htmlContent) => {
    const el = document.querySelector(`.hc-premium-card ${className}`);
    if (el) el.innerHTML = htmlContent;
  };

  setTxt(".hc-temp", payload.temp); 
  setTxt(".hc-weather", payload.weather); 
  setTxt(".hc-rain", payload.rain); 
  setTxt(".hc-wind", payload.wind);
  setTxt(".hc-sunrise", payload.sunrise); 
  setTxt(".hc-sunset", payload.sunset); 
  setTxt(".hc-tide-idx", payload.tideIdx); 
  setTxt(".hc-tide-status", payload.tideStatus);
  
  setHtml(".hc-ocean-summary", payload.oceanSummary);
  setHtml(".hc-tide-low", payload.tideLow); 
  setHtml(".hc-tide-high", payload.tideHigh);

  const timeEl = document.getElementById("hcHomeRefreshTime");
  if (timeEl) timeEl.textContent = `${payload.timeStr} 기준`;

  const mainCardEl = document.querySelector(".hc-main-card");
  if (mainCardEl) {
    mainCardEl.classList.remove("day", "night", "sunset", "snow", "rain", "cloudy");
    const nowTime = new Date();
    const kstFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: 'numeric', hour12: false });
    const parts = kstFormatter.formatToParts(nowTime);
    const kstHour = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const nowMin = kstHour * 60 + parseInt(parts.find(p => p.type === 'minute').value, 10);

    const parseTimeToMinutes = (str) => { if (!str) return null; const match = str.match(/(\d{1,2}):(\d{2})/); return match ? parseInt(match[1], 10) * 60 + parseInt(match[2], 10) : null; };
    const srMin = parseTimeToMinutes(payload.sunrise); const ssMin = parseTimeToMinutes(payload.sunset);

    if (srMin !== null && ssMin !== null) {
      if (nowMin >= srMin - 30 && nowMin < srMin + 60) mainCardEl.classList.add("sunset");
      else if (nowMin >= ssMin - 60 && nowMin < ssMin + 30) mainCardEl.classList.add("sunset");
      else if (nowMin >= srMin + 60 && nowMin < ssMin - 60) mainCardEl.classList.add("day");
      else mainCardEl.classList.add("night");
    } else {
      if (kstHour >= 6 && kstHour < 17) mainCardEl.classList.add("day");
      else if (kstHour >= 17 && kstHour < 20) mainCardEl.classList.add("sunset");
      else mainCardEl.classList.add("night");
    }

    if (payload.weather) {
      if (payload.weather.includes("눈")) mainCardEl.classList.add("snow");
      else if (payload.weather.includes("비")) mainCardEl.classList.add("rain");
      else if (payload.weather.includes("흐림")) mainCardEl.classList.add("cloudy");
    }
  }
};

window.fallbackHomeDataLoad = function (force = false) {
  const existingTemp = document.querySelector(".hc-premium-card .hc-temp")?.textContent || "";
  if (!force && existingTemp !== "" && existingTemp !== "--°C") return;
  
  window.applyHomeCardDOM({
    timeStr: window.getFormattedCurrentTime(), temp: "--°C", weather: "정보없음", rain: "0% · 0mm", wind: "--- · -.-m/s",
    sunrise: "일출 --:--", sunset: "일몰 --:--", tideIdx: "--물", 
    tideStatus: "정보 없음", 
    oceanSummary: "<tspan class=\"hc-txt-muted\" font-weight=\"normal\">--.-°C · --.-m · -- · -.-m/s</tspan>",
    tideLow: "간조 <tspan class=\"hc-txt-muted\" font-weight=\"normal\">--:-- ▼--cm</tspan>", tideHigh: "만조 <tspan class=\"hc-txt-muted\" font-weight=\"normal\">--:-- ▲--cm</tspan>"
  });
};

window.getFormattedCurrentTime = function () {
  const now = new Date(); return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};