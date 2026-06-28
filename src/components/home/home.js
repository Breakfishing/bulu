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

  let targetIcon = btnElement;
  if (btnElement) {
    btnElement.style.pointerEvents = "none";
    btnElement.style.opacity = "0.5";
    const icon = btnElement.querySelector("svg") || btnElement.querySelector("i") || btnElement;
    if (icon) {
      icon.classList.add("hc-spin-anim");
      targetIcon = icon;
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

  let currentTemp = "--°C", currentWeather = "맑음", currentRain = "강수 --% --mm", currentWind = "--- · -.-m/s", currentWave = "파고 --.-m", currentWaterTemp = "수온 --.-°C";
  let currentCrdir = "유향 ---", currentCrsp = "유속 --m/s";

  let kma = getWeatherData(weatherMap, kmaKey);
  let seaKma = getWeatherData(seaWeatherMap, kmaKey);
  if (!kma && seaKma) kma = seaKma;

  if (kma) {
    if (kma.TMP) currentTemp = `${kma.TMP}°C`;
    
    let popVal = kma.POP ? `${kma.POP}%` : "0%";
    let pcpVal = kma.PCP === '강수없음' ? '0mm' : (kma.PCP || '0mm');
    if (pcpVal !== '0mm' && !pcpVal.includes('mm')) { pcpVal = pcpVal + 'mm'; }
    currentRain = `강수 ${popVal} ${pcpVal}`;
    
    if (kma.WAV) { currentWave = `파고 ${parseFloat(kma.WAV).toFixed(1)}m`; } else if (seaKma && seaKma.WAV) { currentWave = `파고 ${parseFloat(seaKma.WAV).toFixed(1)}m`; }
    
    let windVal = kma.WSD ? parseFloat(kma.WSD).toFixed(0) + "m/s" : "-m/s";
    let dirVal = "↓";
    if (kma.VEC) {
      const deg = parseFloat(kma.VEC);
      if (deg >= 337.5 || deg < 22.5