// =========================================================================
// [TAB AREA 1] 홈 화면 프리미엄 웨더 대시보드 및 오픈 API 실시간 캐싱 엔진
// =========================================================================
const TIDE_STATIONS = [
  { code: 'DT_0005', name: '부산', lat: 35.0975, lng: 129.0369 },
  { code: 'DT_0023', name: '통영', lat: 34.8286, lng: 128.4328 },
  { code: 'DT_0026', name: '삼천포', lat: 34.9258, lng: 128.0336 },
  { code: 'DT_0004', name: '마산', lat: 35.2044, lng: 128.5786 },
  { code: 'DT_0016', name: '가덕도', lat: 35.0233, mesh: 128.8322 },
  { code: 'DT_0013', name: '울산', lat: 35.5033, lng: 129.3853 },
  { code: 'DT_0012', name: '포항', lat: 36.0442, lng: 129.3839 }
];

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

window.handleHomeFavoriteChange = function (selectEl) {
  if (!selectEl) return;
  
  const mainCardEl = document.querySelector(".hc-main-card");
  if (mainCardEl) {
    mainCardEl.style.transition = "opacity 0.2s ease";
    mainCardEl.style.opacity = "0.4";
  }

  if (selectEl.value === "my_location") {
    localStorage.setItem(window.HOME_SELECTED_FAV_KEY, "my_location");
    if (window.userLatLng) {
      window.updateHomeCardByLocation(window.userLatLng.lat, window.userLatLng.lng);
    } else {
      if (mainCardEl) mainCardEl.style.opacity = "1";
      console.log("GPS 신호를 추적하는 중입니다. 신호가 수신되면 데이터가 자동 반전됩니다.");
    }
  } else {
    const [lat, lng] = selectEl.value.split(",").map(Number);
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const favId = selectedOption?.getAttribute("data-id");

    if (favId) localStorage.setItem(window.HOME_SELECTED_FAV_KEY, favId);
    if (lat && lng) window.updateHomeCardByLocation(lat, lng);
  }
};

window.updateHomeCardByLocation = async function (lat, lng) {
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
    window.isHomeCardLoaded = true;
    if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
    const mainCardEl = document.querySelector(".hc-main-card");
    if (mainCardEl) {
      mainCardEl.style.opacity = "1";
    }
  }
};

window.refreshHomeLocation = function (btnElement) {
  const selectEl = document.getElementById("hcHomeFavoriteSelect");
  if (!selectEl || !selectEl.value) return;

  let targetIcon = null;
  if (btnElement) {
    btnElement.style.pointerEvents = "none";
    btnElement.style.opacity = "0.5";
    
    // 정밀 축이 설정된 내부 g 태그 타겟팅
    const iconGroup = btnElement.querySelector(".hc-refresh-icon-target");
    if (iconGroup) {
      iconGroup.classList.add("hc-spin-anim");
      // SVG 내에서 제자리 회전이 가능하도록 중심축 명시적 강제 선언
      iconGroup.style.transformOrigin = "10px 10px";
      iconGroup.style.transformBox = "fill-box";
      targetIcon = iconGroup;
    }
  }

  const mainCardEl = document.querySelector(".hc-main-card");
  if (mainCardEl) {
    mainCardEl.style.transition = "opacity 0.2s ease";
    mainCardEl.style.opacity = "0.4";
  }

  if (selectEl.value === "my_location") {
    if (window.userLatLng) {
      window.updateHomeCardByLocation(window.userLatLng.lat, window.userLatLng.lng);
    } else {
      if (btnElement) {
        btnElement.style.pointerEvents = "auto"; btnElement.style.opacity = "1";
        if (targetIcon) targetIcon.classList.remove("hc-spin-anim");
      }
      if (mainCardEl) mainCardEl.style.opacity = "1";
      return;
    }
  } else {
    const [lat, lng] = selectEl.value.split(",").map(Number);
    window.updateHomeCardByLocation(lat, lng);
  }

  setTimeout(() => {
    if (btnElement) {
      btnElement.style.pointerEvents = "auto"; btnElement.style.opacity = "1";
      if (targetIcon) targetIcon.classList.remove("hc-spin-anim");
    }
  }, 2000);
};

window.fetchAllPublicOpenAPI = async function (lat, lng) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const kmaKey = `${dateStr}${String(now.getHours()).padStart(2, '0')}00`;

  const getWeatherData = (map, targetKey) => {
    if (!map) return null;
    if (map[targetKey]) return map[targetKey];
    const dayPrefix = targetKey.substring(0, 8);
    const keys = Object.keys(map).filter(k => k.startsWith(dayPrefix)).sort();
    if (keys.length > 0) {
      let best = keys[0];
      for (let k of keys) { if (k <= targetKey) best = k; }
      return map[best];
    }
    const allKeys = Object.keys(map).sort();
    return allKeys.length > 0 ? map[allKeys[allKeys.length - 1]] : null;
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
      window.fetchKMAWeatherPromise(stationObj.lat, stationObj.lng !== undefined ? stationObj.lng : stationObj.mesh),
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

  let currentTemp = "--°C", currentWeather = "맑음", currentRain = "강수 0mm (0%)", currentWind = "--- · -.-m/s";
  let wtVal = "--.-°C", wvVal = "--.-m", dirVal = "-", spVal = "-.-m/s";

  let kma = getWeatherData(weatherMap, kmaKey);
  let seaKma = getWeatherData(seaWeatherMap, kmaKey);
  if (!kma && seaKma) kma = seaKma;

  if (kma) {
    if (kma.TMP) currentTemp = `${kma.TMP}°C`;
    
    let popVal = kma.POP ? `${kma.POP}%` : "0%";
    let pcpVal = kma.PCP === '강수없음' ? '0mm' : (kma.PCP || '0mm');
    if (pcpVal !== '0mm' && !pcpVal.includes('mm')) { pcpVal = pcpVal + 'mm'; }
    currentRain = `강수 ${pcpVal} (${popVal})`;
    
    if (kma.WAV) { wvVal = `${parseFloat(kma.WAV).toFixed(1)}m`; } else if (seaKma && seaKma.WAV) { wvVal = `${parseFloat(seaKma.WAV).toFixed(1)}m`; }
    
    let windVal = kma.WSD ? parseFloat(kma.WSD).toFixed(0) + "m/s" : "-m/s";
    let windDir = "↓";
    if (kma.VEC) {
      const deg = parseFloat(kma.VEC);
      if (deg >= 337.5 || deg < 22.5) windDir = "북풍";
      else if (deg >= 22.5 && deg < 67.5) windDir = "북동풍";
      else if (deg >= 67.5 && deg < 112.5) windDir = "동풍";
      else if (deg >= 112.5 && deg < 157.5) windDir = "남동풍";
      else if (deg >= 157.5 && deg < 202.5) windDir = "남풍";
      else if (deg >= 202.5 && deg < 247.5) windDir = "남서풍";
      else if (deg >= 247.5 && deg < 292.5) windDir = "서풍";
      else if (deg >= 292.5 && deg < 337.5) windDir = "북서풍";
    }
    currentWind = `${windDir} · ${windVal}`;

    if (kma.PTY && kma.PTY !== "0") { currentWeather = kma.PTY === "3" ? "눈" : "비"; }
    else if (kma.SKY === "3") { currentWeather = "구름많음"; }
    else if (kma.SKY === "4") { currentWeather = "흐림"; }
    else { currentWeather = "맑음"; }
  } else if (seaKma && seaKma.WAV) {
    wvVal = `${parseFloat(seaKma.WAV).toFixed(1)}m`;
  }

  const wTempObj = getWeatherData(waterTempMap?.details, kmaKey);
  if (wTempObj) {
    if (wTempObj.wtemp) {
      wtVal = typeof wTempObj.wtemp === 'string' && wTempObj.wtemp.includes('°C') ? wTempObj.wtemp : `${parseFloat(wTempObj.wtemp).toFixed(1)}°C`;
    }
    if (wTempObj.crdir !== null && wTempObj.crdir !== undefined) {
      const d = wTempObj.crdir;
      dirVal = (d >= 337.5 || d < 22.5) ? "북" : (d < 67.5) ? "북동" : (d < 112.5) ? "동" : (d < 157.5) ? "남동" : (d < 202.5) ? "남" : (d < 247.5) ? "남서" : (d < 292.5) ? "서" : "북서";
    }
    if (wTempObj.crsp) {
      spVal = typeof wTempObj.crsp === 'string' && wTempObj.crsp.includes('m/s') ? wTempObj.crsp : `${parseFloat(wTempObj.crsp).toFixed(2)}m/s`;
    }
  } else {
    const wTempSimple = getWeatherData(waterTempMap, kmaKey);
    if (wTempSimple) wtVal = typeof wTempSimple === 'string' && wTempSimple.includes('°C') ? wTempSimple : `${parseFloat(wTempSimple).toFixed(1)}°C`;
  }

  let oceanSummaryText = `${wtVal} · ${wvVal} · ${dirVal} · ${spVal}`;

  let targetTides = realTides || [];
  const nowMs = now.getTime();

  if (targetTides.length === 0) {
    let dummyTides = [];
    for (let k = 0; k < 4; k++) {
      let xHigh = 112 * (Math.PI / 2 + 2 * k * Math.PI); let xLow = 112 * (3 * Math.PI / 2 + 2 * k * Math.PI);
      let hH = xHigh / 56; let dH = new Date(nowMs + hH * 60 * 60 * 1000);
      let hL = xLow / 56; let dL = new Date(nowMs + hL * 60 * 60 * 1000);
      dummyTides.push({ type: '만조', time: `${String(dH.getHours()).padStart(2, '0')}:${String(dH.getMinutes()).padStart(2, '0')}`, level: '270', hoursFromNow: hH, rawDt: dH.toISOString() });
      dummyTides.push({ type: '간조', time: `${String(dL.getHours()).padStart(2, '0')}:${String(dL.getMinutes()).padStart(2, '0')}`, level: '50', hoursFromNow: hL, rawDt: dL.toISOString() });
    }
    targetTides = dummyTides;
  }

  let futureEvents = targetTides.filter(ev => {
    const evTime = ev.rawDt ? new Date(ev.rawDt.replace(/-/g, '/')).getTime() : (nowMs + ev.hoursFromNow * 60 * 60 * 1000);
    return evTime >= nowMs;
  });
  futureEvents.sort((a, b) => {
    const timeA = a.rawDt ? new Date(a.rawDt.replace(/-/g, '/')).getTime() : (nowMs + a.hoursFromNow * 60 * 60 * 1000);
    const timeB = b.rawDt ? new Date(b.rawDt.replace(/-/g, '/')).getTime() : (nowMs + b.hoursFromNow * 60 * 60 * 1000);
    return timeA - timeB;
  });

  let tideLowText = "간조 --:-- ▼--", tideHighText = "만조 --:-- ▲--";
  let firstEvType = "간조";

  if (futureEvents.length >= 1) {
    const ev1 = futureEvents[0];
    firstEvType = ev1.type;
    const restStr = `${ev1.time} ${ev1.type === "만조" ? "▲" : "▼"}${ev1.level || ev1.value || "--"}`;
    if (ev1.type === '간조') tideLowText = `간조 ${restStr}`;
    else tideHighText = `만조 ${restStr}`;
  }
  if (futureEvents.length >= 2) {
    const ev2 = futureEvents[1];
    const restStr = `${ev2.time} ${ev2.type === "만조" ? "▲" : "▼"}${ev2.level || ev2.value || "--"}`;
    if (ev2.type === '간조') tideLowText = `간조 ${restStr}`;
    else tideHighText = `만조 ${restStr}`;
  }

  let detailedTideStatus = "--";
  if (targetTides && targetTides.length > 0) {
    const getEventTime = (ev) => ev.rawDt ? new Date(ev.rawDt.replace(/-/g, '/')).getTime() : (nowMs + ev.hoursFromNow * 60 * 60 * 1000);
    const sortedTides = [...targetTides].sort((a, b) => getEventTime(a) - getEventTime(b));
    
    let prevEv = null;
    let nextEv = null;
    
    for (let i = 0; i < sortedTides.length; i++) {
      const evTime = getEventTime(sortedTides[i]);
      if (evTime <= nowMs) {
        prevEv = sortedTides[i];
      } else if (evTime > nowMs && !nextEv) {
        nextEv = sortedTides[i];
        break;
      }
    }
    
    if (prevEv && nextEv) {
      const prevTime = getEventTime(prevEv);
      const nextTime = getEventTime(nextEv);
      const totalDuration = nextTime - prevTime;
      const elapsed = nowMs - prevTime;
      const ratio = totalDuration > 0 ? (elapsed / totalDuration) : 0;
      
      if (prevEv.type === '간조') {
        if (ratio < 1/3) detailedTideStatus = "초들물";
        else if (ratio < 2/3) detailedTideStatus = "중들물";
        else detailedTideStatus = "끝들물";
      } else if (prevEv.type === '만조') {
        if (ratio < 1/3) detailedTideStatus = "초썰물";
        else if (ratio < 2/3) detailedTideStatus = "중썰물";
        else detailedTideStatus = "끝썰물";
      }
    } else if (nextEv) {
      const nextTime = getEventTime(nextEv);
      const prevTime = nextTime - (6 * 60 * 60 * 1000);
      const totalDuration = nextTime - prevTime;
      const elapsed = nowMs - prevTime;
      const ratio = Math.max(0, Math.min(1, totalDuration > 0 ? (elapsed / totalDuration) : 0));
      
      if (nextEv.type === '만조') {
        if (ratio < 1/3) detailedTideStatus = "초들물";
        else if (ratio < 2/3) detailedTideStatus = "중들물";
        else detailedTideStatus = "끝들물";
      } else {
        if (ratio < 1/3) detailedTideStatus = "초썰물";
        else if (ratio < 2/3) detailedTideStatus = "중썰물";
        else detailedTideStatus = "끝썰물";
      }
    }
  }

  return {
    timeStr: window.getFormattedCurrentTime(), temp: currentTemp, weather: currentWeather, rain: currentRain, wind: currentWind,
    sunrise: currentSunrise, sunset: currentSunset, tideIdx: currentTideIdx, tideLow: tideLowText, tideHigh: tideHighText,
    detailedTide: detailedTideStatus, oceanSummary: oceanSummaryText, firstEvType: firstEvType
  };
};

window.applyHomeCardDOM = function (payload) {
  if (!payload) return;
  const setTxt = (className, val) => { const el = document.querySelector(`.hc-premium-card ${className}`); if (el) el.textContent = val; };

  setTxt(".hc-temp", payload.temp); setTxt(".hc-weather", payload.weather); setTxt(".hc-rain", payload.rain); setTxt(".hc-wind", payload.wind);
  setTxt(".hc-sunrise", payload.sunrise); setTxt(".hc-sunset", payload.sunset); setTxt(".hc-tide-idx", payload.tideIdx); setTxt(".hc-tide-status", payload.detailedTide);
  setTxt(".hc-ocean-summary", payload.oceanSummary);

  const setTideTxt = (className, val) => {
    const el = document.querySelector(`.hc-premium-card ${className}`);
    if (!el) return;
    if (!val) { el.textContent = ""; return; }
    const parts = val.split(" ");
    if (parts.length > 1) {
      const label = parts[0];
      const rest = parts.slice(1).join(" ");
      el.innerHTML = `${label} <tspan class="hc-txt-muted">${rest}</tspan>`;
    } else {
      el.textContent = val;
    }
  };
  setTideTxt(".hc-tide-low", payload.tideLow);
  setTideTxt(".hc-tide-high", payload.tideHigh);

  const lowEl = document.querySelector(".hc-premium-card .hc-tide-low");
  const highEl = document.querySelector(".hc-premium-card .hc-tide-high");
  const summaryEl = document.querySelector(".hc-premium-card .hc-ocean-summary");
  
  if (lowEl && highEl && summaryEl) {
    if (payload.firstEvType === '간조') {
      lowEl.setAttribute("y", "194");
      highEl.setAttribute("y", "214");
    } else {
      highEl.setAttribute("y", "194");
      lowEl.setAttribute("y", "214");
    }
    summaryEl.setAttribute("y", "234");
  }

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

window.fallbackHomeDataLoad = function () {
  const existingTemp = document.querySelector(".hc-premium-card .hc-temp")?.textContent || "";
  if (existingTemp !== "" && existingTemp !== "--°C") return;
  window.applyHomeCardDOM({
    timeStr: window.getFormattedCurrentTime(), temp: "--°C", weather: "정보없음", rain: "강수 0mm (0%)", wind: "--- · -.-m/s",
    sunrise: "일출 --:--", sunset: "일몰 --:--", tideIdx: "--물", wave: "파고 --.-m", waterTemp: "수온 --.-°C", tideLow: "간조 --:-- ▼--", tideHigh: "만조 --:-- ▲--",
    detailedTide: "--", oceanSummary: "--.-°C · --.-m · - · -.-m/s", firstEvType: "간조"
  });
};

window.getFormattedCurrentTime = function () {
  const now = new Date(); return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};