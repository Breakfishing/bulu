// =========================================================================
// [CORE] 엔트리 포인트 및 모듈 통합 제어 메인 엔진 (src/main.js)
// =========================================================================
import './style.css'; 
import { db } from './utils/firebase.js'; 

// --- 전역 변수 및 상태 레이어 관리 ---
window.cachedFishingPoints = [];
window.cachedPublicToilets = [];
window.userLatLng = null;
window.isFirstLocation = true;
window.tempLatLng = null;
window.tempTargetVisual = null;
window.tempToiletMarker = null;
window.cachedActiveAddressStr = "";
window.isToiletLayerActive = false;

window.timelineDatesArray = [];
window.allTidesSchedule = [];
window.globalSunTimesCache = {};
window.isFishingPointsLoaded = false;
window.isPublicToiletsLoaded = false;

// API 무한 중복 요청을 방지하기 위한 전역 네트워킹 락 상태 변수
window.isFetchingAPI = false;

// 오픈 API 키 컴포넌트
const PUBLIC_PORTAL_KEY = "7440915081950a748b3d8d5d1b9904d246ce8028893a02ec4042b2b192383803";
window.DATA_GO_KR_SERVICE_KEY = PUBLIC_PORTAL_KEY;
const KHOA_API_KEY = PUBLIC_PORTAL_KEY;
const KMA_AUTH_KEY = "RAp21103R7OKdtddNwezzw";

// =========================================================================
// [COMMON UI] 라이프사이클 및 네비게이션 공통 UI 제어 영역 (모듈 임포트 전 배치)
// =========================================================================
window.toggleMapLayer = function(layerType) {
    if (!window.mapObj) return;
    
    window.mapObj.eachLayer((layer) => {
        if (layer.options && layer.options.isCartoLayer) {
            window.mapObj.removeLayer(layer);
        }
    });

    if (layerType === 'carto') {
        const cartoLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
            isCartoLayer: true,
            attribution: '© CartoDB'
        }).addTo(window.mapObj);
        window.isToiletLayerActive = true;
    }
};

window.loadCoastalDepthData = async function() {
  try {
    const response = await fetch('coastal_depth_compact.json');
    if (response.ok) {
      window.coastalDepthData = await response.json();
      console.log(`[수심 데이터 로드 완료] 총 ${window.coastalDepthData.length} 격자 확보`);
      if (window.mapObj) window.toggleMapLayer('carto'); 
    }
  } catch (err) { console.error("수심 데이터 로드 중 에러 발생:", err); }
};

window.checkAndHideSplash = function () {
  const splashEl = document.getElementById('splash-screen');
  if (!splashEl) return;

  const homeLoaded = window.isHomeCardLoaded === true;
  const pointsLoaded = window.isFishingPointsLoaded === true;
  const toiletsLoaded = window.isPublicToiletsLoaded === true;

  if (homeLoaded && pointsLoaded && toiletsLoaded) {
    splashEl.style.transition = 'opacity 0.35s ease-out';
    splashEl.style.opacity = '0';
    setTimeout(() => {
      if (splashEl.parentNode) {
        splashEl.remove();
        console.log("[SYSTEM] 전역 라이프사이클 부팅 정상 완료 - 스플래시 블록 제거");
      }
    }, 350);
  } else {
    if (!window.globalSplashFallbackTimer) {
      window.globalSplashFallbackTimer = setTimeout(() => {
        console.warn("[SYSTEM] 백엔드 응답 지연으로 인한 스플래시 강제 타파 실행");
        window.isHomeCardLoaded = true;
        window.isFishingPointsLoaded = true;
        window.isPublicToiletsLoaded = true;
        window.checkAndHideSplash();
      }, 3000);
    }
  }
};

window.logApiStatus = function(apiName, status, details = {}) {
  const time = new Date().toLocaleTimeString();
  const msg = `[API LOG][${apiName}] ${status}`;
  console.log(`${msg}`, details);
  if (typeof window.logToAdminTerminal === 'function') {
    window.logToAdminTerminal(`${time} ${msg} ${details.error || ''}`);
  }
};

window.closeModals = function () {
  document.querySelectorAll('.modal, .custom-modal-native, .bottom-sheet-modal-native, .bottom-sheet').forEach(m => m.classList.remove('active'));
  document.getElementById('noticeWriteModal')?.classList.remove('active');
  document.getElementById('infoEditModal')?.classList.remove('active');
  document.getElementById('fishingBanModal')?.classList.remove('active');
  document.getElementById('sizeLimitModal')?.classList.remove('active');
  document.getElementById('knotGuideModal')?.classList.remove('active');
  document.getElementById('detailModalWrapper')?.classList.remove('active');
  document.getElementById('modalBackdrop')?.classList.remove('active');
  document.getElementById('weatherModal')?.classList.remove('active');

  if (window.tempTargetVisual && window.mapObj) { window.mapObj.removeLayer(window.tempTargetVisual); window.tempTargetVisual = null; }
  if (window.tempToiletMarker && window.mapObj) { window.mapObj.removeLayer(window.tempToiletMarker); window.tempToiletMarker = null; }
};

window.switchTab = function (tabId, navItem) {
  window.closeModals();
  document.getElementById('settings-page')?.classList.remove('active');
  document.getElementById('notice-page')?.classList.remove('active');
  document.getElementById('info-board-page')?.classList.remove('active');

  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(ni => ni.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');
  if (navItem) navItem.classList.add('active');

  if (tabId === 'tab-map') {
    setTimeout(() => { if (window.mapObj) window.mapObj.invalidateSize(); }, 50);
  }
  if (tabId === 'tab-manage') {
    window.renderPointsManagementTab();
  }
};

// =========================================================================
// 하위 컴포넌트 모듈 스레드 가동 (공통 UI 함수 선언 완료 후 실행)
// =========================================================================
import './components/more/more.js';
import './components/map/map.js';
import './components/weather/weatherModal.js';
import './components/pm/pointmanagement.js'; 
import { TIDE_STATIONS } from './utils/constants.js';

// =========================================================================
// [TAB AREA 1] 홈 화면 프리미엄 웨더 대시보드 및 오픈 API 실시간 캐싱 엔진
// =========================================================================
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

// [교정] 좌측 상단(15, 15) 비행 애니메이션 연동 및 원래 위치(362, 208) 자율 복귀 제어 시스템
window.refreshHomeLocation = function (btnElement) {
  const selectEl = document.getElementById("hcHomeFavoriteSelect");
  if (!selectEl || !selectEl.value) return;

  let targetIcon = btnElement;
  if (btnElement) {
    btnElement.style.pointerEvents = "none";
    
    const icon = btnElement.querySelector(".hc-refresh-icon-g");
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
        btnElement.style.pointerEvents = "auto"; 
        btnElement.setAttribute("transform", "translate(362, 208)"); 
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
      btnElement.style.pointerEvents = "auto"; 
      btnElement.setAttribute("transform", "translate(362, 208)"); 
      if (targetIcon) targetIcon.classList.remove("hc-spin-anim");
    }
  }, 2000);
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

  // [교정] ReferenceError 타파를 위한 데이터 동기화 어레이 바인딩 최상단 조율 선언
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

  // [교정] tspan 내부에 font-weight="normal" 속성을 명시적으로 적용하여 수치 부분의 볼드 완전 해제
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

  // [교정] "수온, 파고, 유향, 유속" 한글 식별 단어를 완전히 탈락시키고 순수 수치만 엮어 표출 처리
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

window.fallbackHomeDataLoad = function () {
  const existingTemp = document.querySelector(".hc-premium-card .hc-temp")?.textContent || "";
  if (existingTemp !== "" && existingTemp !== "--°C") return;
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

// =========================================================================
// [MODAL AREA] 포인트/화장실 마커 신규 등록 및 기존 인스턴스 정보 수정 모달 핸들러
// =========================================================================
const parkingUnits = ['10분', '30분', '일'];
let currentUnitIndex = 0;
let selectedParkingType = 'none';
let selectedEditPointParkingType = 'none';
const editPointParkingUnits = ['10분', '30분', '일'];
let currentEditPointUnitIndex = 0;
let selectedToiletHoursValue = '모름';

window.openPointModal = function () {
  document.getElementById('firstModal').classList.remove('active');
  document.getElementById('modalBackdrop')?.classList.add('active');
  document.getElementById('pointModal').classList.add('active');

  const categorySelect = document.getElementById('pointCategory');
  if (categorySelect) {
    categorySelect.innerHTML = '';
    let savedCatOrder = JSON.parse(localStorage.getItem('pm-category-order') || '[]');
    let activeCategories = [...new Set([...savedCatOrder, ...window.cachedFishingPoints.map(p => (p.category || '미분류').trim())])].filter(cat => cat !== '공중화장실 정보' && cat !== 'toilet' && cat !== '미분류');
    activeCategories.push('미분류'); const savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');

    activeCategories.forEach(catName => {
      const matchPoints = window.cachedFishingPoints.filter(p => (p.category || '미분류') === catName);
      const groupColor = catName === '미분류' ? '#868e96' : (matchPoints.length > 0 ? matchPoints[0].color : (savedCatColors[catName] || '#007aff'));
      const option = document.createElement('option'); option.value = catName; option.setAttribute('data-color', groupColor); option.innerText = catName;
      categorySelect.appendChild(option);
    });
    categorySelect.value = '미분류';
  }
  window.fetchAddressForModal(window.tempLatLng.lat, window.tempLatLng.lng, 'pointAddress');
};

window.openToiletModal = function () {
  document.getElementById('firstModal').classList.remove('active');
  document.getElementById('modalBackdrop')?.classList.add('active');
  document.getElementById('toiletModal').classList.add('active');
  window.selectedNewToiletHoursValue = "24시간";

  const chips = document.getElementById('newToiletHoursChips');
  if (chips) { chips.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active')); document.getElementById('chipNewHours24')?.classList.add('active'); }
  document.getElementById('newToiletHoursDetailRow').classList.remove('active');
  window.fetchAddressForModal(window.tempLatLng.lat, window.tempLatLng.lng, 'toiletAddress');
};

window.savePointMarker = function () {
  const name = document.getElementById('pointName').value.trim(); if (!name) return alert("포인트 이름을 입력하세요.");
  const categorySelect = document.getElementById('pointCategory'); const category = categorySelect ? (categorySelect.value || '미분류') : '미분류';
  let color = (categorySelect && categorySelect.options.length > 0) ? categorySelect.options[categorySelect.selectedIndex].getAttribute('data-color') : '#007aff';
  if (category === '미분류') color = '#868e96';

  db.collection('fishing_points').add({
    name, category, color, memo: document.getElementById('pointMemo')?.value.trim() || '등록된 메모가 없습니다.',
    parkingType: selectedParkingType, parkingUnit: parkingUnits[currentUnitIndex], parkingPrice: document.getElementById('parkingPrice').value || '0',
    hasStore: document.getElementById('btnNewFacStore')?.classList.contains('active') || false,
    hasCafe: document.getElementById('btnNewFacCafe')?.classList.contains('active') || false,
    hasTackle: document.getElementById('btnNewFacTackle')?.classList.contains('active') || false,
    address: window.cachedActiveAddressStr || "주소 정보 없음", lat: window.tempLatLng.lat, lng: window.tempLatLng.lng, isFavorite: false, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => { window.closeModals(); });

  document.getElementById('pointName').value = ''; document.getElementById('pointMemo').value = ''; document.getElementById('parkingPrice').value = '';
  document.getElementById('btnNewFacStore')?.classList.remove('active'); document.getElementById('btnNewFacCafe')?.classList.remove('active'); document.getElementById('btnNewFacTackle')?.classList.remove('active');
  selectedParkingType = 'none'; currentUnitIndex = 0; document.getElementById('btnParkingUnit').innerText = '10분'; document.getElementById('parkingDetailRow').classList.remove('active');
  window.cachedActiveAddressStr = "";
};

window.saveToiletMarker = function () {
  const name = document.getElementById('toiletName')?.value.trim() || '공중화장실';
  const memo = document.getElementById('newToiletMemo')?.value.trim() || '양호';
  let finalHours = window.selectedNewToiletHoursValue;
  if (window.selectedNewToiletHoursValue === '지정시간') {
    finalHours = `${document.getElementById('newToiletStartHour').value.trim() || '09'}:${document.getElementById('newToiletStartMin').value.trim() || '00'} ~ ${document.getElementById('newToiletEndHour').value.trim() || '18'}:${document.getElementById('newToiletEndMin').value.trim() || '00'}`;
  }
  db.collection('public_toilets').add({ name, memo: `${finalHours}||${memo}`, category: 'toilet', lat: window.tempLatLng.lat, lng: window.tempLatLng.lng, createdAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => { window.closeModals(); });
  if (document.getElementById('toiletName')) document.getElementById('toiletName').value = ''; if (document.getElementById('newToiletMemo')) document.getElementById('newToiletMemo').value = '';
};

window.openPointEditModal = function (docId, name, category, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, address, lat, lng) {
  document.getElementById('editPointDocId').value = docId; document.getElementById('editPointName').value = name; document.getElementById('editPointMemo').value = memo;
  const pointEditAddrEl = document.getElementById('pointEditAddress'); if (pointEditAddrEl) pointEditAddrEl.innerText = address || "주소 정보 없음";

  if ((!address || address.includes("없음") || address.includes("중...")) && lat && lng) {
    window.searchNearestCoastalLandmark(lat, lng, nearestAddr => { if (pointEditAddrEl) pointEditAddrEl.innerText = nearestAddr; db.collection('fishing_points').doc(docId).update({ address: nearestAddr }); }, () => {});
  }

  const catSelect = document.getElementById('editPointCategory');
  if (catSelect) {
    catSelect.innerHTML = '';
    let savedCatOrder = JSON.parse(localStorage.getItem('pm-category-order') || '[]');
    let activeCategories = [...new Set([...savedCatOrder, ...window.cachedFishingPoints.map(p => (p.category || '미분류').trim())])].filter(cat => cat !== '공중화장실 정보' && cat !== 'toilet' && cat !== '미분류');
    activeCategories.push('미분류'); const savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');

    activeCategories.forEach(catName => {
      const matchPoints = window.cachedFishingPoints.filter(p => (p.category || '미분류') === catName);
      const groupColor = catName === '미분류' ? '#868e96' : (matchPoints.length > 0 ? matchPoints[0].color : (savedCatColors[catName] || '#007aff'));
      const option = document.createElement('option'); option.value = catName; option.setAttribute('data-color', groupColor); option.innerText = catName;
      catSelect.appendChild(option);
    });
    catSelect.value = category || '미분류';
  }

  selectedEditPointParkingType = pType || 'none';
  const chipsContainer = document.getElementById('editPointParkingChips');
  if (chipsContainer) {
    chipsContainer.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('active'));
    if (pType === 'none') document.getElementById('chipEditParkingNone')?.classList.add('active');
    else if (pType === 'free') document.getElementById('chipEditParkingFree')?.classList.add('active');
    else chipsContainer.querySelectorAll('.chip-btn')[2]?.classList.add('active');
  }

  if (pType === 'paid') {
    document.getElementById('editPointParkingDetailRow').classList.add('active'); document.getElementById('editPointParkingPrice').value = pPrice || '0';
    const unitBtn = document.getElementById('btnEditPointParkingUnit'); if (unitBtn) { unitBtn.innerText = pUnit || '10분'; currentEditPointUnitIndex = Math.max(0, editPointParkingUnits.indexOf(pUnit || '10분')); }
  } else { document.getElementById('editPointParkingDetailRow').classList.remove('active'); }

  document.getElementById('btnEditFacStore')?.classList.toggle('active', hasStore);
  document.getElementById('btnEditFacCafe')?.classList.toggle('active', hasCafe);
  document.getElementById('btnEditFacTackle')?.classList.toggle('active', hasTackle);

  document.getElementById('modalBackdrop')?.classList.add('active'); document.getElementById('pointEditModal').classList.add('active');
};

window.openToiletEditModal = function (docId, name, memo, address) {
  document.getElementById('editToiletDocId').value = docId; document.getElementById('editToiletName').value = name || '공중화장실';
  document.getElementById('toiletEditAddress').innerText = address || "주소 정보 없음";
  const tokens = (memo || '').split('||'); const hoursText = tokens[0] || '모름'; document.getElementById('editToiletMemo').value = tokens[1] || '';

  const chipsContainer = document.getElementById('editToiletHoursChips');
  if (chipsContainer) {
    chipsContainer.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('active'));
    if (hoursText === '24시간') document.getElementById('chipEditHours24')?.classList.add('active');
    else if (hoursText === '모름') document.getElementById('chipEditHoursUnknown')?.classList.add('active');
    else chipsContainer.querySelectorAll('.chip-btn')[2]?.classList.add('active');
  }

  if (hoursText !== '24시간' && hoursText !== '모름') {
    document.getElementById('editToiletHoursDetailRow').classList.add('active'); selectedToiletHoursValue = '지정시간';
    try {
      const times = hoursText.split('~').map(t => t.trim());
      if (times.length === 2) {
        document.getElementById('editToiletStartHour').value = times[0].split(':')[0]; document.getElementById('editToiletStartMin').value = times[0].split(':')[1];
        document.getElementById('editToiletEndHour').value = times[1].split(':')[0]; document.getElementById('editToiletEndMin').value = times[1].split(':')[1];
      }
    } catch {}
  } else { document.getElementById('editToiletHoursDetailRow').classList.remove('active'); selectedToiletHoursValue = hoursText; }

  document.getElementById('modalBackdrop')?.classList.add('active'); document.getElementById('toiletEditModal').classList.add('active');
};

window.savePointEditData = function () {
  const docId = document.getElementById('editPointDocId').value; const name = document.getElementById('editPointName').value.trim(); if (!name) return alert("포인트 이름을 입력하세요.");
  db.collection('fishing_points').doc(docId).update({
    name, category: document.getElementById('editPointCategory')?.value || '미분류', color: document.getElementById('editPointCategory')?.options[document.getElementById('editPointCategory').selectedIndex]?.getAttribute('data-color') || '#007aff',
    memo: document.getElementById('editPointMemo').value.trim() || '등록된 메모가 없습니다.', parkingType: selectedEditPointParkingType, parkingUnit: editPointParkingUnits[currentEditPointUnitIndex], parkingPrice: document.getElementById('editPointParkingPrice').value || '0',
    hasStore: document.getElementById('btnEditFacStore')?.classList.contains('active'), hasCafe: document.getElementById('btnEditFacCafe')?.classList.contains('active'), hasTackle: document.getElementById('btnEditFacTackle')?.classList.contains('active')
  }).then(() => window.closeModals());
};

window.saveToiletEditData = function () {
  const docId = document.getElementById('editToiletDocId').value; let finalHours = selectedToiletHoursValue;
  if (selectedToiletHoursValue === '지정시간') finalHours = `${document.getElementById('editToiletStartHour').value.trim()}:${document.getElementById('editToiletStartMin').value.trim()} ~ ${document.getElementById('editToiletEndHour').value.trim()}:${document.getElementById('editToiletEndMin').value.trim()}`;
  db.collection('public_toilets').doc(docId).update({ name: document.getElementById('editToiletName').value.trim() || '공중화장실', memo: `${finalHours}||${document.getElementById('editToiletMemo').value.trim() || '양호'}` }).then(() => window.closeModals());
};

window.openMarkerDeleteModal = function (docId, collectionName, displayName, onSuccess) {
  const deleteModal = document.getElementById('deleteConfirmModal'); if (!deleteModal) return;
  document.getElementById('deleteModalTargetName').innerText = displayName;
  document.getElementById('btnDoDelete').onclick = function () { db.collection(collectionName).doc(docId).delete().then(() => { window.closeModals(); if (typeof onSuccess === 'function') onSuccess(); }); };

  document.getElementById('detailModalWrapper')?.classList.remove('active'); document.getElementById('detailModal')?.classList.remove('active');
  document.querySelectorAll('.modal, .custom-modal-native').forEach(m => { if (m !== deleteModal) m.classList.remove('active'); });
  document.getElementById('modalBackdrop')?.classList.add('active'); deleteModal.classList.add('active');
};

window.openCategoryEditBottomSheet = function (catName, catColor, event) {
  if (event) event.stopPropagation();
  document.getElementById('editTargetCategoryOldName').value = catName; document.getElementById('editCategoryNameInput').value = catName;
  const modalTitle = document.querySelector('#categoryEditModal h3 span'); if (modalTitle) modalTitle.innerText = "카테고리 수정";
  window.selectCategoryColor(catColor || '#4f46e5'); document.getElementById('modalBackdrop')?.classList.add('active'); document.getElementById('categoryEditModal').classList.add('active');
};

window.openCategoryAddBottomSheet = function () {
  const modalTitle = document.querySelector('#categoryEditModal h3 span'); if (modalTitle) modalTitle.innerText = "카테고리 추가";
  document.getElementById('editTargetCategoryOldName').value = "NEW_CATEGORY"; document.getElementById('editCategoryNameInput').value = "";
  window.selectCategoryColor('#4f46e5'); document.getElementById('modalBackdrop')?.classList.add('active'); document.getElementById('categoryEditModal').classList.add('active');
};

window.saveCategoryEditData = function () {
  const modeFlag = document.getElementById('editTargetCategoryOldName').value; 
  const nextCatName = document.getElementById('editCategoryNameInput').value.trim(); 
  const nextColor = document.getElementById('editCategoryColorInput').value;

  if (!nextCatName) return alert("카테고리 명칭은 필수입니다.");
  if (nextCatName.length > 8) return alert("카테고리 이름은 띄어쓰기 포함 8자 이내로 입력해 주세요.");

  let savedCatOrder = JSON.parse(localStorage.getItem('pm-category-order') || '[]'); 
  let savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');

  const systemCategories = ['전체', '즐겨찾기', '최근 추가된 화장실', '미분류', '공중화장실 정보'];

  if (modeFlag === "NEW_CATEGORY") {
    if (savedCatOrder.includes(nextCatName) || systemCategories.includes(nextCatName)) {
      return alert("이미 존재하는 카테고리 명칭이거나 사용할 수 없는 이름입니다.");
    }
    savedCatOrder.push(nextCatName); savedCatColors[nextCatName] = nextColor;
    localStorage.setItem('pm-category-order', JSON.stringify(savedCatOrder)); localStorage.setItem('pm-category-colors', JSON.stringify(savedCatColors));
    window.closeModals(); alert(`[${nextCatName}] 카테고리가 추가되었습니다.`); window.renderPointsManagementTab(); return;
  }

  if (nextCatName !== modeFlag && (savedCatOrder.includes(nextCatName) || systemCategories.includes(nextCatName))) {
    return alert("이미 존재하는 카테고리 명칭이거나 사용할 수 없는 이름입니다.");
  }

  const idx = savedCatOrder.indexOf(modeFlag); 
  if (idx !== -1) savedCatOrder[idx] = nextCatName;

  delete savedCatColors[modeFlag]; savedCatColors[nextCatName] = nextColor;
  localStorage.setItem('pm-category-order', JSON.stringify(savedCatOrder)); localStorage.setItem('pm-category-colors', JSON.stringify(savedCatColors));

  const batch = db.batch(); 
  const targets = window.cachedFishingPoints.filter(p => (p.category || '미분류').trim() === modeFlag.trim());
  targets.forEach(item => batch.update(db.collection('fishing_points').doc(item.id), { category: nextCatName, color: nextColor }));
  
  batch.commit().then(() => { 
    if (window.currentActiveCategory === modeFlag) {
      window.currentActiveCategory = nextCatName;
      localStorage.setItem('pm-last-category', nextCatName);
    }
    window.closeModals(); 
    window.renderPointsManagementTab();
  }).catch(err => {
    console.error(err);
    alert("카테고리 데이터 동기화 중 오류가 발생했습니다.");
  });
};

window.deleteCategoryWithGuard = function (catName, event) {
  if (event) event.stopPropagation();
  if (window.cachedFishingPoints.some(p => (p.category || '미분류').trim() === catName.trim())) { alert(`삭제 불가: [${catName}] 카테고리 내부에 소속된 포인트 마커가 존재합니다.`); return; }
  if (confirm(`[${catName}] 카테고리를 삭제하시겠습니까?`)) {
    let savedCatOrder = JSON.parse(localStorage.getItem('pm-category-order') || '[]'); let savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');
    savedCatOrder = savedCatOrder.filter(c => c !== catName); delete savedCatColors[catName];
    localStorage.setItem('pm-category-order', JSON.stringify(savedCatOrder)); localStorage.setItem('pm-category-colors', JSON.stringify(savedCatColors));
    alert("카테고리가 삭제되었습니다."); window.renderPointsManagementTab();
  }
};

window.selectCategoryColor = function (color) {
  if (document.getElementById('editCategoryColorInput')) document.getElementById('editCategoryColorInput').value = color;
  document.querySelectorAll('.color-palette-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-color') === color));
  const previewEl = document.getElementById('categoryEditMarkerIcon'); if (previewEl && typeof getFishingPointSvg === 'function') previewEl.innerHTML = getFishingPointSvg(color);
};

window.selectNewToiletHours = function (type, element) { window.selectedNewToiletHoursValue = type; element.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active')); element.classList.add('active'); document.getElementById('newToiletHoursDetailRow').classList.toggle('active', type === '지정시간'); };
window.selectParking = function (type, element) { selectedParkingType = type; element.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active')); element.classList.add('active'); document.getElementById('parkingDetailRow').classList.toggle('active', type === 'paid'); };
window.shiftParkingUnit = function (btn) { currentUnitIndex = (currentUnitIndex + 1) % parkingUnits.length; if (btn) btn.innerText = parkingUnits[currentUnitIndex]; };
window.shiftEditPointParkingUnit = function (btn) { currentEditPointUnitIndex = (currentEditPointUnitIndex + 1) % editPointParkingUnits.length; if (btn) btn.innerText = editPointParkingUnits[currentEditPointUnitIndex]; };
window.selectEditPointParking = function (type, element) { selectedEditPointParkingType = type; element.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active')); element.classList.add('active'); document.getElementById('editPointParkingDetailRow').classList.toggle('active', type === 'paid'); };
window.selectEditToiletHours = function (type, element) { selectedToiletHoursValue = type; element.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active')); element.classList.add('active'); document.getElementById('editToiletHoursDetailRow').classList.toggle('active', type === '지정시간'); };

// =========================================================================
// [SHEET AREA] 실시간 연안 종합 타임라인 바텀시트 정보 렌더링 엔진
// =========================================================================
window.renderPointDetailBottomSheet = function (docId, name, category, color, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, lat, lng, isFavorite, dbSavedAddress) {
  const wrapper = document.getElementById('detailModalWrapper'); const sheet = document.getElementById('detailModal');
  if (wrapper) wrapper.classList.add('active'); if (sheet) sheet.classList.add('active');

  if (dbSavedAddress && dbSavedAddress.startsWith('소재지 도로명 주소:')) dbSavedAddress = dbSavedAddress.replace('소재지 도로명 주소:', '').trim();
  document.getElementById('lblDetailName').innerText = name;
  const addrField = document.getElementById('lblDetailAddressField'); if (addrField) addrField.innerText = dbSavedAddress || "주소 변환 중...";

  if ((!dbSavedAddress || dbSavedAddress.includes("중...") || dbSavedAddress.includes("없음")) && typeof window.kakao !== 'undefined' && window.kakao.maps) {
    window.kakao.maps.load(function () {
      if (window.kakao.maps.services?.Geocoder) {
        new window.kakao.maps.services.Geocoder().coord2Address(lng, lat, function (result, status) {
          if (status === window.kakao.maps.services.Status.OK && result[0]) {
            let finalAddr = result[0].road_address ? result[0].road_address.address_name : (result[0].address ? result[0].address.address_name : "주소 정보 없음");
            if (finalAddr === "주소 정보 없음" || finalAddr.trim() === "") {
              window.searchNearestCoastalLandmark(lat, lng, nearestAddr => { if (addrField) addrField.innerText = nearestAddr; db.collection((category === 'toilet') ? 'public_toilets' : 'fishing_points').doc(docId).update({ [category === 'toilet' ? 'dbSavedAddress' : 'address']: nearestAddr }); }, () => {});
            } else { if (addrField) addrField.innerText = finalAddr; db.collection((category === 'toilet') ? 'public_toilets' : 'fishing_points').doc(docId).update({ [category === 'toilet' ? 'dbSavedAddress' : 'address']: finalAddr }); }
          }
        });
      }
    });
  }

  const facContainer = document.getElementById('lblDetailFacilitiesContainer'); if (facContainer) facContainer.innerHTML = '';
  const favBtn = document.getElementById('btnDetailModalFavorite'), lblDetailParking = document.getElementById('lblDetailParking'), lblDetailFacilities = document.getElementById('lblDetailFacilities');
  const categoryBadge = document.getElementById('lblDetailCategory'), weatherOpenBtn = document.getElementById('btnDetailWeatherOpen'), lblDetailToiletHours = document.getElementById('lblDetailToiletHours');

  if (category === 'toilet') {
    [favBtn, lblDetailParking, lblDetailFacilities, categoryBadge, weatherOpenBtn].forEach(el => el?.classList.add('detail-toilet-hours-hidden'));
    lblDetailToiletHours?.classList.remove('detail-toilet-hours-hidden');
    const tokens = (memo || '').split('||');
    if (lblDetailToiletHours) { const ts = lblDetailToiletHours.querySelector('.tag-txt'); if (ts) ts.innerText = tokens[0] || '모름'; }
    document.getElementById('lblDetailMemo').innerText = tokens[1] || '기록된 특이사항이 없습니다.';
  } else {
    [favBtn, lblDetailParking, lblDetailFacilities, categoryBadge, weatherOpenBtn].forEach(el => el?.classList.remove('detail-toilet-hours-hidden'));
    lblDetailToiletHours?.classList.add('detail-toilet-hours-hidden');

    if (favBtn) {
      const renderFav = (state) => { favBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="${state ? '#ffcc00' : 'none'}" stroke="${state ? '#ffcc00' : '#adb5bd'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`; }; renderFav(isFavorite);
      favBtn.onclick = function (e) { e.stopPropagation(); isFavorite = !isFavorite; renderFav(isFavorite); db.collection('fishing_points').doc(docId).update({ isFavorite, favoritedAt: isFavorite ? Date.now() : firebase.firestore.FieldValue.delete() }); };
    }
    if (categoryBadge) { categoryBadge.innerText = category; categoryBadge.style.backgroundColor = color || 'var(--primary-color)'; }
    document.getElementById('lblDetailMemo').innerText = memo || '등록된 메모가 없습니다.';
    if (lblDetailParking) { const ts = lblDetailParking.querySelector('.tag-txt'); if (ts) ts.innerText = pType === 'none' ? '주차 불가' : pType === 'free' ? '무료 주차' : `${pUnit} ${Number(pPrice).toLocaleString()}원`; }

    if (facContainer) {
      if (hasStore) facContainer.innerHTML += `<div class="detail-tag-item inline-flex"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span class="tag-txt">편의점</span></div>`;
      if (hasCafe) facContainer.innerHTML += `<div class="detail-tag-item inline-flex"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg><span class="tag-txt">카페</span></div>`;
      if (hasTackle) facContainer.innerHTML += `<div class="detail-tag-item inline-flex"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span class="tag-txt">낚시점</span></div>`;
    }
    try { window.buildTimelineUI(lat, lng, null, []); } catch (err) {}
  }

  document.getElementById('btnDetailPointDelete').onclick = function (e) { e.stopPropagation(); window.openMarkerDeleteModal(docId, (category === 'toilet') ? 'public_toilets' : 'fishing_points', name || '지정 포인트'); };
  document.getElementById('btnDetailPointEditTrigger').onclick = function (e) { e.stopPropagation(); if (sheet) sheet.classList.remove('active'); if (wrapper) wrapper.classList.remove('active'); if (category === 'toilet') window.openToiletEditModal(docId, name, memo, addrField.innerText); else window.openPointEditModal(docId, name, category, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, addrField.innerText, lat, lng); };

  if (weatherOpenBtn) {
    weatherOpenBtn.onclick = function (e) {
      e.stopPropagation(); document.getElementById('lblWeatherModalTitle').innerText = name;
      const wIcon = document.getElementById('weatherModalMarkerIcon');
      if (wIcon) {
        if (category === 'toilet') {
          wIcon.innerHTML = `<svg width="20" height="30" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="#ff9500"/><circle cx="12" cy="12" r="4" fill="#ffffff"/></svg>`;
        } else {
          wIcon.innerHTML = getFishingPointSvg(color).replace('width="26" height="39"', 'width="20" height="30"');
        }
      }
      document.getElementById('weatherModal')?.classList.add('active'); window.loadTimelineWithOptimisticUI(lat, lng);
    };
  }

  const naviOpenBtn = document.getElementById('btnDetailNaviOpen');
  if (naviOpenBtn) {
    const naviApp = localStorage.getItem('navi-app') || 'naver';
    
    if (naviApp === 'naver') {
      naviOpenBtn.style.background = '#03C75A';
      naviOpenBtn.style.color = '#ffffff';
    } else if (naviApp === 'kakao') {
      naviOpenBtn.style.background = '#FEE500';
      naviOpenBtn.style.color = '#111111';
    } else if (naviApp === 'tmap') {
      naviOpenBtn.style.background = 'linear-gradient(135deg, #007BC7, #6F359E)';
      naviOpenBtn.style.color = '#ffffff';
    }

    naviOpenBtn.onclick = function (e) { 
      e.stopPropagation(); 
      const currentApp = localStorage.getItem('navi-app') || 'naver';
      
      if (currentApp === 'naver') {
        window.open(`https://map.naver.com/index.nhn?elat=${lat}&elng=${lng}&etext=${encodeURIComponent(name)}&menu=route`, '_blank');
      } else if (currentApp === 'kakao') {
        window.open(`https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`, '_blank');
      } else if (currentApp === 'tmap') {
        window.open(`tmap://route?rGoName=${encodeURIComponent(name)}&rGoX=${lng}&rGoY=${lat}`, '_blank');
      }
    };
  }
};

window.openPointDetailFromList = function (pt) {
  window.closeModals(); const mapNavItem = document.querySelector('.nav-item[onclick*="tab-map"]') || document.querySelector('.nav-item');
  if (typeof window.switchTab === 'function') window.switchTab('tab-map', mapNavItem);
  if (window.mapObj) window.mapObj.panTo([pt.lat, pt.lng]);

  if (pt.category === 'toilet') {
    if (window.tempToiletMarker && window.mapObj) window.mapObj.removeLayer(window.tempToiletMarker);
    if (typeof window.L !== 'undefined' && window.mapObj) {
      const toiletHtml = `<svg width="24" height="36" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="#ff9500"/><circle cx="12" cy="12" r="4" fill="#ffffff"/></svg>`;
      window.tempToiletMarker = window.L.marker([pt.lat, pt.lng], { icon: window.L.divIcon({ html: toiletHtml, className: 'custom-marker-wrapper-toilet temp-list-injected-toilet-node', iconSize: [24, 36], iconAnchor: [12, 36] }), zIndexOffset: 1000 }).addTo(window.mapObj);
    }
    window.renderPointDetailBottomSheet(pt.id, pt.name || '공중화장실', 'toilet', '#ff9500', pt.memo || '', '', '', 0, false, false, false, pt.lat, pt.lng, false, pt.dbSavedAddress || pt.address || '주소 정보 없음');
  } else {
    window.renderPointDetailBottomSheet(pt.id, pt.name, pt.category, pt.color, pt.memo, pt.parkingType || 'none', pt.parkingUnit || '', pt.parkingPrice || '0', pt.hasStore || false, pt.hasCafe || false, pt.hasTackle || false, pt.lat, pt.lng, pt.isFavorite || false, pt.address || "주소 정보 없음");
  }
};

window.fetchAddressForModal = function (lat, lng, elementId) {
  const el = document.getElementById(elementId); if (el) el.innerText = "주소 변환 중...";
  if (typeof kakao !== 'undefined' && kakao.maps) {
    kakao.maps.load(() => {
      new kakao.maps.services.Geocoder().coord2Address(lng, lat, (result, status) => {
        if (status === kakao.maps.services.Status.OK && result[0]) {
          const finalAddr = result[0].road_address?.address_name || result[0].address?.address_name || "주소 정보 없음";
          if (finalAddr === "주소 정보 없음") window.searchNearestCoastalLandmark(lat, lng, n => { if (el) el.innerText = n; }, () => { if (el) el.innerText = "주소 정보 없음"; });
          else { if (el) el.innerText = finalAddr; if (elementId === 'pointAddress') window.cachedActiveAddressStr = finalAddr; }
        } else { window.searchNearestCoastalLandmark(lat, lng, n => { if (el) el.innerText = n; }, () => { if (el) el.innerText = "주소 정보 없음"; }); }
      });
    });
  }
};

window.searchNearestCoastalLandmark = function (lat, lng, successCallback, errorCallback) {
  if (typeof kakao === 'undefined' || !kakao.maps?.services?.Places) { if (errorCallback) errorCallback(); return; }
  const ps = new kakao.maps.services.Places(); const keywords = ['방파제', '해수욕장', '항구', '선착장', '해안', '갯바위']; let idx = 0;
  const tryNext = () => {
    if (idx >= keywords.length) { if (errorCallback) errorCallback(); return; }
    ps.keywordSearch(keywords[idx], (data, status) => {
      if (status === kakao.maps.services.Status.OK && data?.[0]) { successCallback(`${data[0].place_name} 인근 ${(parseFloat(data[0].distance)/1000).toFixed(1)}km`); }
      else { idx++; tryNext(); }
    }, { location: new kakao.maps.LatLng(lat, lng), radius: 20000, sort: kakao.maps.services.SortBy.DISTANCE });
  }; tryNext();
};

function getFishingPointSvg(color) {
  return `<svg width="26" height="39" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" class="fishing-marker-svg-anchor">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="${color}"/>
    <circle cx="12" cy="12" r="4" fill="#ffffff"/>
  </svg>`;
}
window.getFishingPointSvg = getFishingPointSvg;

// =========================================================================
// [BACKEND AREA] 백엔드 데이터베이스 실시간 트래킹 모델 및 오버레이 렌더러
// =========================================================================
window.findNearestDepth = function(lat, lng) {
  if (!window.coastalDepthData || window.coastalDepthData.length === 0) return null;
  let minDstSquare = Infinity; let nearestDepth = null;
  const latToMeters = 111000; const lngToMeters = 91000; const maxSearchRadiusMeters = 150;
  
  for (let i = 0; i < window.coastalDepthData.length; i++) {
    const pt = window.coastalDepthData[i];
    const dLatMeters = (pt[0] - lat) * latToMeters; const dLngMeters = (pt[1] - lng) * lngToMeters;
    const dstSquare = dLatMeters * dLatMeters + dLngMeters * dLngMeters;
    if (dstSquare < minDstSquare) { minDstSquare = dstSquare; nearestDepth = pt[2]; }
  }
  if (Math.sqrt(minDstSquare) > maxSearchRadiusMeters) return null;
  return nearestDepth;
};

db.collection('fishing_points').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
  try {
    window.cachedFishingPoints = []; snapshot.forEach(doc => window.cachedFishingPoints.push({ id: doc.id, ...doc.data() }));
    if (typeof window.updateVisibleMarkersOnMap === 'function') window.updateVisibleMarkersOnMap();
    window.renderPointsManagementTab(); window.populateHomeFavoritesDropdown();
  } catch (err) {
    console.error("낚시 포인트 데이터 렌더링 중 오류 발생:", err);
  } finally {
    window.isFishingPointsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
}, () => { window.isFishingPointsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash(); });

db.collection('public_toilets').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
  try {
    window.cachedPublicToilets = []; snapshot.forEach(doc => window.cachedPublicToilets.push({ id: doc.id, ...doc.data() }));
    if (typeof window.updateVisibleMarkersOnMap === 'function') window.updateVisibleMarkersOnMap();
    window.renderPointsManagementTab();
  } catch (err) {
    console.error("화장실 데이터 렌더링 중 오류 발생:", err);
  } finally {
    window.isPublicToiletsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
}, () => { window.isPublicToiletsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash(); });

// =========================================================================
// 전역 초기 부팅 실행 시퀀스
// =========================================================================
window.initHomeDataSequence();
window.loadCoastalDepthData();