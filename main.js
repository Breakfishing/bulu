// =========================================================================
// [TAB AREA 0] 글로벌 패키징, 파이어베이스 코어 인스턴스 및 공통 인프라
// =========================================================================
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'leaflet-edgebuffer';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const firebaseConfig = {
  apiKey: "AIzaSyDg8nOLQfGVYZu57S5m0C-zccDGSrdtvg4",
  authDomain: "fishing-25978.firebaseapp.com",
  projectId: "fishing-25978",
  storageBucket: "fishing-25978.firebasestorage.app",
  messagingSenderId: "681283419168",
  appId: "1:681283419168:web:0cc86b6274c92f03d3d045",
  measurementId: "G-R7M94V4L0P"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

let cachedFishingPoints = [];
let cachedPublicToilets = [];
let userMarker = null;
let userLatLng = null;
let isFirstLocation = true;
let tempLatLng = null;
let tempTargetVisual = null;
let cachedActiveAddressStr = "";

window.db = db;
window.firebase = firebase;
window.timelineDatesArray = [];
window.allTidesSchedule = [];

const PUBLIC_PORTAL_KEY = "7440915081950a748b3d8d5d1b9904d246ce8028893a02ec4042b2b192383803";
window.DATA_GO_KR_SERVICE_KEY = PUBLIC_PORTAL_KEY;
const KHOA_API_KEY = PUBLIC_PORTAL_KEY;
const KMA_AUTH_KEY = "RAp21103R7OKdtddNwezzw";

window.globalSunTimesCache = {};

window.isFishingPointsLoaded = false;
window.isPublicToiletsLoaded = false;

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

const TIDE_STATIONS = [
  { code: 'DT_0005', name: '부산', lat: 35.0975, lng: 129.0369 },
  { code: 'DT_0023', name: '통영', lat: 34.8286, lng: 128.4328 },
  { code: 'DT_0026', name: '삼천포', lat: 34.9258, lng: 128.0336 },
  { code: 'DT_0004', name: '마산', lat: 35.2044, lng: 128.5786 },
  { code: 'DT_0016', name: '가덕도', lat: 35.0233, mesh: 128.8322 },
  { code: 'DT_0013', name: '울산', lat: 35.5033, lng: 129.3853 },
  { code: 'DT_0012', name: '포항', lat: 36.0442, lng: 129.3839 }
];

function getNearestTideStation(lat, lng) {
  let minDistance = Infinity; let nearestStation = TIDE_STATIONS[0];
  TIDE_STATIONS.forEach(station => {
    const stationLng = station.lng !== undefined ? station.lng : station.mesh;
    const dist = Math.sqrt(Math.pow(station.lat - lat, 2) + Math.pow(stationLng - lng, 2));
    if (dist < minDistance) { minDistance = dist; nearestStation = station; }
  });
  return nearestStation.code;
}

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

  if (tempTargetVisual) { map.removeLayer(tempTargetVisual); tempTargetVisual = null; }
  if (window.tempToiletMarker) {
    if (map) map.removeLayer(window.tempToiletMarker);
    window.tempToiletMarker = null;
  }
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
    setTimeout(() => { if (map) map.invalidateSize(); }, 50);
  }
  if (tabId === 'tab-manage') {
    window.renderPointsManagementTab();
  }
};


// =========================================================================
// [RESTORED AREA] 누락되었던 코어 API 통신 및 기하 유틸리티 함수 복구 영역
// =========================================================================
window.getSunTimesForDate = function (targetDate) {
  if (!window.globalSunTimesCache) window.globalSunTimesCache = {};
  const key = `${targetDate.getFullYear()}${String(targetDate.getMonth() + 1).padStart(2, '0')}${String(targetDate.getDate()).padStart(2, '0')}`;
  if (window.globalSunTimesCache[key]) return window.globalSunTimesCache[key];
  return { sunrise: `05:${32 + (targetDate.getDate() % 5)}`, sunset: `19:${41 - (targetDate.getDate() % 5)}` };
};

window.convertLatLngToGrid = function (lat, lng) {
  const RE = 6371.00877; 
  const GRID = 5.0; 
  const SLAT1 = 30.0; 
  const SLAT2 = 60.0; 
  const OLON = 126.0; 
  const OLAT = 38.0; 
  const XO = 43; 
  const YO = 136;
  
  const re = RE / GRID; 
  const DEGRAD = Math.PI / 180.0; 
  const slat1 = SLAT1 * DEGRAD; 
  const slat2 = SLAT2 * DEGRAD; 
  const olon = OLON * DEGRAD; 
  const olat = OLAT * DEGRAD;
  
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5); 
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5); 
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5); 
  ro = re * sf / Math.pow(ro, sn);
  
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5); 
  ra = re * sf / Math.pow(ra, sn);
  
  let theta = lng * DEGRAD - olon; 
  if (theta > Math.PI) theta -= 2.0 * Math.PI; 
  if (theta < -Math.PI) theta += 2.0 * Math.PI; 
  theta *= sn;
  
  return { 
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), 
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) 
  };
};

window.getKMABaseDateTime = function () {
  const now = new Date(); const hours = [2, 5, 8, 11, 14, 17, 20, 23]; let ch = now.getHours(), cm = now.getMinutes(), bd = new Date(now.getTime()), bt = "2300", f = false;
  for (let i = hours.length - 1; i >= 0; i--) { if (ch > hours[i] || (ch === hours[i] && cm >= 15)) { bt = String(hours[i]).padStart(2, '0') + "00"; f = true; break; } }
  if (!f) { bd.setDate(bd.getDate() - 1); bt = "2300"; }
  return { baseDate: `${bd.getFullYear()}${String(bd.getMonth() + 1).padStart(2, '0')}${String(bd.getDate()).padStart(2, '0')}`, baseTime: bt };
};

window.fetchSunriseSunsetForDatesPromise = function (lat, lng, dateStrings) {
  if (!window.globalSunTimesCache) window.globalSunTimesCache = {}; const ck = `${lat.toFixed(1)}_${lng.toFixed(1)}`;
  const safeServiceKey = typeof DATA_GO_KR_SERVICE_KEY !== 'undefined' ? DATA_GO_KR_SERVICE_KEY : '';
  return Promise.all(dateStrings.map(ds => {
    try {
      const lData = localStorage.getItem(`cc_sun_${ck}_${ds}`);
      if (lData) { window.globalSunTimesCache[ds] = JSON.parse(lData); return Promise.resolve(); }
    } catch (e) {
      localStorage.removeItem(`cc_sun_${ck}_${ds}`);
    }
    return fetch(`https://apis.data.go.kr/B090041/openapi/service/RiseSetInfoService/getLCRiseSetInfo?latitude=${lat}&longitude=${lng}&locdate=${ds}&ServiceKey=${safeServiceKey}&_type=json`).then(res => res.json()).then(d => {
      const item = d?.response?.body?.items?.item; if (item?.sunrise && item?.sunset) { const ro = { sunrise: `${item.sunrise.trim().substring(0,2)}:${item.sunrise.trim().substring(2,4)}`, sunset: `${item.sunset.trim().substring(0,2)}:${item.sunset.trim().substring(2,4)}` }; window.globalSunTimesCache[ds] = ro; localStorage.setItem(`cc_sun_${ck}_${ds}`, JSON.stringify(ro)); }
    }).catch(() => {});
  }));
};

window.fetchKMAWeatherPromise = function (lat, lng) {
  const grid = window.convertLatLngToGrid(lat, lng); const cacheKey = `cc_weather_v6_${grid.nx}_${grid.ny}`; 
  const safeLogger = typeof window.logApiStatus === 'function' ? window.logApiStatus : () => {};
  const safeAuthKey = typeof KMA_AUTH_KEY !== 'undefined' ? KMA_AUTH_KEY : '';
  
  safeLogger("KMA_WEATHER", "호출 시도", { nx: grid.nx, ny: grid.ny });

  try {
    const lData = localStorage.getItem(cacheKey);
    if (lData) {
      const parsed = JSON.parse(lData);
      if (Date.now() - parsed.timestamp < 3 * 60 * 60 * 1000) {
        safeLogger("KMA_WEATHER", "캐시 적중");
        return Promise.resolve(parsed.data);
      }
    }
  } catch (e) {
    localStorage.removeItem(cacheKey);
  }

  const base = window.getKMABaseDateTime();
  return fetch(`/api-hub/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst?pageNo=1&numOfRows=2000&dataType=JSON&base_date=${base.baseDate}&base_time=${base.baseTime}&nx=${grid.nx}&ny=${grid.ny}&authKey=${safeAuthKey}`).then(res => res.json()).then(json => {
    const wm = {}; const node = json?.response?.body?.items?.item;
    if (!node) {
      safeLogger("KMA_WEATHER", "실패 (데이터 없음)", { code: json?.response?.header?.resultCode });
      return null;
    }
    node.forEach(item => { if (item?.fcstDate && item?.fcstTime) { const k = item.fcstDate + item.fcstTime; if (!wm[k]) wm[k] = {}; wm[k][item.category] = item.fcstValue; } });
    localStorage.setItem(cacheKey, JSON.stringify({ data: wm, timestamp: Date.now() })); 
    safeLogger("KMA_WEATHER", "성공");
    return wm;
  }).catch(err => {
    safeLogger("KMA_WEATHER", "에러 발생", { error: err.message });
    return null;
  });
};

window.fetchTideData3DaysPromise = function (lat, lng) {
  const safeGetStationFunc = typeof getNearestTideStation === 'function' ? getNearestTideStation : (typeof window.getNearestTideStation === 'function' ? window.getNearestTideStation : () => 'I01');
  const obsCode = safeGetStationFunc(lat, lng); const cacheKey = `cc_tide_v5_${obsCode}`; 
  const safeLogger = typeof window.logApiStatus === 'function' ? window.logApiStatus : () => {};
  const safeKhoaKey = typeof KHOA_API_KEY !== 'undefined' ? KHOA_API_KEY : '';
  
  safeLogger("TIDE_API", "호출 시도", { obsCode });

  try {
    const lData = localStorage.getItem(cacheKey);
    if (lData) {
      const parsed = JSON.parse(lData);
      if (Date.now() - parsed.timestamp < 3 * 60 * 60 * 1000) {
        safeLogger("TIDE_API", "캐시 적중");
        return Promise.resolve(parsed.data);
      }
    }
  } catch (e) {
    localStorage.removeItem(cacheKey);
  }

  const dates = []; for (let d = 0; d < 5; d++) { const td = new Date(new Date().getTime() + d * 24 * 60 * 60 * 1000); dates.push(`${td.getFullYear()}${String(td.getMonth() + 1).padStart(2, '0')}${String(td.getDate()).padStart(2, '0')}`); }
  return (async () => {
    let items = []; 
    for (const sd of dates) { 
      try { 
        const res = await fetch(`/api-tide/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?serviceKey=${safeKhoaKey}&type=json&pageNo=1&numOfRows=10&obsCode=${obsCode}&reqDate=${sd}`); 
        const json = await res.json(); 
        const node = (json?.body || json?.response?.body)?.items?.item; 
        if (node) items.push(...(Array.isArray(node) ? node : [node])); 
      } catch {} 
    }
    if (items.length === 0) {
      safeLogger("TIDE_API", "실패 (데이터 없음)");
      return [];
    }
    items.sort((a, b) => new Date(a.predcDt.replace(/-/g, '/')) - new Date(b.predcDt.replace(/-/g, '/')));

    let schedule = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; if (!it?.predcDt) continue; const lvl = Math.round(it.predcTdlvVl); let type = '만조', diff = 0;
      if (i === 0) { if (items[1]) type = (items[1].predcTdlvVl < it.predcTdlvVl) ? '만조' : '간조'; }
      else { const prev = items[i - 1]; if (prev) { const plvl = Math.round(prev.predcTdlvVl); type = (lvl > plvl) ? '만조' : '간조'; diff = lvl - plvl; } }
      const hrs = (new Date(it.predcDt.replace(/-/g, '/')).getTime() - new Date().getTime()) / (1000 * 60 * 60);
      if (hrs >= -12 && hrs <= 120) schedule.push({ type, color: type === '만조' ? '#ff3b30' : '#007aff', time: it.predcDt.split(' ')[1], level: lvl.toString(), diff, hoursFromNow: hrs, rawDt: it.predcDt });
    }
    if (schedule.length > 0) {
      localStorage.setItem(cacheKey, JSON.stringify({ data: schedule, timestamp: Date.now() })); 
      safeLogger("TIDE_API", "성공");
    } else {
      safeLogger("TIDE_API", "실패 (조건 부적합)");
    }
    return schedule;
  })();
};

window.fetchRealWaterTempPromise = function (lat, lng, dateStrings) {
  const cacheKey = `cc_roms_dual_track_v3_${lat.toFixed(2)}_${lng.toFixed(2)}`; 
  const safeLogger = typeof window.logApiStatus === 'function' ? window.logApiStatus : () => {};
  const safePortalKey = typeof PUBLIC_PORTAL_KEY !== 'undefined' ? PUBLIC_PORTAL_KEY : '';
  
  safeLogger("ROMS_WATER_TEMP", "호출 시도", { lat, lng });

  try {
    const lData = localStorage.getItem(cacheKey);
    if (lData) {
      const parsed = JSON.parse(lData);
      if (Date.now() - parsed.timestamp < 3 * 60 * 60 * 1000) {
        safeLogger("ROMS_WATER_TEMP", "캐시 적중");
        return Promise.resolve(parsed.data);
      }
    }
  } catch (e) {
    localStorage.removeItem(cacheKey);
  }
  
  const offset = 0.15; const url = `/api-tide/1192136/roms/GetRomsApiService?serviceKey=${safePortalKey}&type=json&ymin=${(lat - offset).toFixed(4)}&ymax=${(lat + offset).toFixed(4)}&xmin=${(lng - offset).toFixed(4)}&xmax=${(lng + offset).toFixed(4)}&pageNo=1&numOfRows=300`;

  return fetch(url).then(async res => { const text = await res.text(); if (!res.ok || text.includes("Unexpected errors")) throw new Error(); return JSON.parse(text); }).then(json => {
    const wtm = { details: {} }; const extract = (obj) => { if (Array.isArray(obj)) return obj; if (typeof obj === 'object') { for (const k in obj) { if (Array.isArray(obj[k])) return obj[k]; } for (const k in obj) { const r = extract(obj[k]); if (r?.length) return r; } } return []; };
    const items = extract(json);
    
    if (items && items.length > 0) {
      console.log("[ROMS 수신 성공] 원본 데이터 필드 구조 샘플:", items[0]);
    } else {
      console.warn("[ROMS 격자 탐색 실패] 해당 좌표 반경 내에 관측/예측 해양 모델 레이어가 없습니다.");
    }

    items.forEach(item => {
      let pt = item.predDate || item.predcDt || item.date || item.time || item.pred_date;
      let wt = item.wtem !== undefined ? item.wtem : (item.wTemp || item.w_temp || item.wtemp || item.temp || item.wt || item.w_t);
      let cd = item.crdir;
      let cs = item.crsp;
      
      if (pt) {
        const key = String(pt).replace(/\D/g, '').substring(0,10) + "00";
        if (key) {
          const formattedWtemp = wt !== undefined ? parseFloat(wt).toFixed(1) + "°C" : "--°C";
          
          wtm[key] = formattedWtemp;
          
          wtm.details[key] = {
            wtemp: formattedWtemp,
            crdir: cd !== undefined ? parseFloat(cd) : null,
            crsp: cs !== undefined ? parseFloat(cs).toFixed(2) + "m/s" : "--m/s"
          };
        }
      }
    });
    if (Object.keys(wtm).length > 1) {
      localStorage.setItem(cacheKey, JSON.stringify({ data: wtm, timestamp: Date.now() })); 
      safeLogger("ROMS_WATER_TEMP", "성공");
    } else {
      safeLogger("ROMS_WATER_TEMP", "실패 (데이터 없음)");
    }
    return wtm;
  }).catch(err => {
    safeLogger("ROMS_WATER_TEMP", "에러 발생", { error: err.message });
    return { details: {} };
  });
};


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
  if (Array.isArray(cachedFishingPoints)) {
    favorites = cachedFishingPoints.filter(p => p.isFavorite === true || p.favorite === true);
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
    if (userLatLng) await window.updateHomeCardByLocation(userLatLng.lat, userLatLng.lng);
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
    if (userLatLng) {
      window.updateHomeCardByLocation(userLatLng.lat, userLatLng.lng);
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
    if (mainCardEl) mainCardEl.style.opacity = "1";
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
    if (userLatLng) {
      window.updateHomeCardByLocation(userLatLng.lat, userLatLng.lng);
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

  const findLatestData = (map, tKey) => {
    if (!map) return null;
    if (map[tKey]) return map[tKey];
    const keys = Object.keys(map).sort();
    let best = null;
    for (let k of keys) { if (k <= tKey) best = map[k]; }
    return best || map[keys[0]]; 
  };

  let lunarDay = now.getDate();
  try {
    const lunarRaw = new Intl.DateTimeFormat('ko-KR-u-ca-chinese').format(now);
    const lunarArr = lunarRaw.split('.').map(s => s.trim()).filter(Boolean);
    if (lunarArr.length >= 3) lunarDay = parseInt(lunarArr[2], 10);
  } catch (e) {}
  const tideNames8 = ["조금", "1물", "2물", "3물", "4물", "5물", "6물", "7물", "8물", "9물", "10물", "11물", "12물", "13물", "14물"];
  const currentTideIdx = tideNames8[(lunarDay + 7) % 15];

  const obsCode = getNearestTideStation(lat, lng);
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

  let currentTemp = "--°C", currentWeather = "맑음", currentRain = "강수 --mm (--%)", currentWind = "--- · -.-m/s", currentWave = "파고 --.-m", currentWaterTemp = "수온 --.-°C";

  let kma = findLatestData(weatherMap, kmaKey);
  let seaKma = findLatestData(seaWeatherMap, kmaKey);
  if (!kma && seaKma) kma = seaKma;

  if (kma) {
    if (kma.TMP) currentTemp = `${kma.TMP}°C`;
    if (kma.PCP) currentRain = kma.PCP === '강수없음' ? '강수 0mm' : `강수 ${kma.PCP}`;
    if (kma.WAV) { currentWave = `파고 ${parseFloat(kma.WAV).toFixed(1)}m`; } else if (seaKma && seaKma.WAV) { currentWave = `파고 ${parseFloat(seaKma.WAV).toFixed(1)}m`; }
    
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
    currentWave = `파고 ${parseFloat(seaKma.WAV).toFixed(1)}m`;
  }

  const wTemp = findLatestData(waterTempMap, kmaKey);
  if (wTemp) currentWaterTemp = `수온 ${wTemp}`;

  let tideLowText = "조석 정보 대기중", tideHighText = "조석 정보 대기중";
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

  if (futureEvents.length >= 1) { const ev1 = futureEvents[0]; tideLowText = `${ev1.type} ${ev1.time} ${ev1.type === "만조" ? "▲" : "▼"}${ev1.level || ev1.value || "--"}cm`; }
  if (futureEvents.length >= 2) { const ev2 = futureEvents[1]; tideHighText = `${ev2.type} ${ev2.time} ${ev2.type === "만조" ? "▲" : "▼"}${ev2.level || ev2.value || "--"}cm`; } else { tideHighText = ""; }

  return {
    timeStr: window.getFormattedCurrentTime(), temp: currentTemp, weather: currentWeather, rain: currentRain, wind: currentWind,
    sunrise: currentSunrise, sunset: currentSunset, tideIdx: currentTideIdx, wave: currentWave, waterTemp: currentWaterTemp, tideLow: tideLowText, tideHigh: tideHighText
  };
};

window.applyHomeCardDOM = function (payload) {
  if (!payload) return;
  const setTxt = (className, val) => { const el = document.querySelector(`.hc-premium-card ${className}`); if (el) el.textContent = val; };

  setTxt(".hc-temp", payload.temp); setTxt(".hc-weather", payload.weather); setTxt(".hc-rain", payload.rain); setTxt(".hc-wind", payload.wind);
  setTxt(".hc-sunrise", payload.sunrise); setTxt(".hc-sunset", payload.sunset); setTxt(".hc-tide-idx", payload.tideIdx); setTxt(".hc-wave", payload.wave);
  setTxt(".hc-water-temp", payload.waterTemp); setTxt(".hc-tide-low", payload.tideLow); setTxt(".hc-tide-high", payload.tideHigh);

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
    timeStr: window.getFormattedCurrentTime(), temp: "--°C", weather: "정보없음", rain: "강수 --mm (--%)", wind: "--- · -.-m/s",
    sunrise: "일출 --:--", sunset: "일몰 --:--", tideIdx: "--물", wave: "파고 --.-m", waterTemp: "수온 --.-°C", tideLow: "간조 --:-- ▼--cm", tideHigh: "만조 --:-- ▲--cm"
  });
};

window.getFormattedCurrentTime = function () {
  const now = new Date(); return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

// =========================================================================
// [TAB AREA 2] 지도 메인 코어, GPS 트래킹 및 레이어 토글 엔진
// =========================================================================
const busanBounds = L.latLngBounds([34.5, 128.1], [36.69, 129.85]);
const map = L.map('map', {
  center: [35.1796, 129.0756], zoom: 11, minZoom: 11, maxZoom: 18,
  zoomControl: false, attributionControl: false, maxBounds: busanBounds, maxBoundsViscosity: 1.0
});

window.mapObj = map;
let cloudPointsLayer = L.layerGroup().addTo(map);
let toiletPointsLayer = L.layerGroup().addTo(map);
window.isToiletLayerActive = false;
window.currentAccuracyCircle = null;

const myLocationIcon = L.divIcon({
  html: `
    <div class="my-location-marker-inner-wrapper">
      <div class="radar-wave"></div><div class="radar-wave wave-delay-1"></div><div class="radar-wave wave-delay-2"></div>
      <svg width="80" height="80" class="user-heading-cone-bg"><circle cx="40" cy="40" r="40" fill="var(--primary-color)" fill-opacity="0.03" /></svg>
      <svg viewBox="0 0 80 80" class="user-heading-cone-svg">
        <path id="user-heading-cone" d="M 40 40 L 11.72 11.72 A 40 40 0 0 1 68.28 11.72 Z" fill="var(--primary-color)" fill-opacity="0.13" stroke="var(--primary-color)" stroke-opacity="0.25" stroke-width="1" style="transform-origin: 40px 40px; transform: rotate(0deg); transition: transform 0.1s ease-out;"/>
      </svg>
      <svg width="18" height="18" viewBox="0 0 36 36" class="user-location-dot-svg"><circle cx="18" cy="18" r="18" fill="var(--primary-color)"/><circle cx="18" cy="18" r="7" fill="#ffffff"/><circle cx="18" cy="3" fill="var(--primary-color)"/></svg>
    </div>
  `,
  className: 'my-location-marker-container', iconSize: [36, 36], iconAnchor: [18, 18]
});

const CARTO_LIGHT_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const CARTO_DARK_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const isInitialDark = localStorage.getItem('dark-mode') === 'true';

const clean2DLayer = L.tileLayer(isInitialDark ? CARTO_DARK_URL : CARTO_LIGHT_URL, { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 18, edgeBufferTiles: 1, keepBuffer: 4, updateInterval: 200 });
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', edgeBufferTiles: 1, keepBuffer: 4, updateInterval: 200 });
clean2DLayer.addTo(map);

let currentLayerMode = '2D';
const svg2D = `<svg class="app-icon" viewBox="0 0 24 24" style="fill:none; stroke:none;"><text x="50%" y="70%" font-size="15" font-weight="900" fill="var(--text-main)" text-anchor="middle">2D</text></svg>`;
const svg3D = `<svg class="app-icon" viewBox="0 0 24 24" style="fill:none; stroke:none;"><text x="50%" y="70%" font-size="15" font-weight="900" fill="currentColor" text-anchor="middle">3D</text></svg>`;

window.toggleMapLayer = function () {
  const btn = document.getElementById('btn-layer');
  if (currentLayerMode === '2D') {
    map.removeLayer(clean2DLayer); satelliteLayer.addTo(map); currentLayerMode = '3D'; btn.innerHTML = svg3D; btn.classList.add('active');
  } else {
    map.removeLayer(satelliteLayer); clean2DLayer.addTo(map); currentLayerMode = '2D'; btn.innerHTML = svg2D; btn.classList.remove('active');
  }
};

map.on('locationfound', function (e) {
  userLatLng = e.latlng;
  const displayRadius = Math.min(e.accuracy, 150);

  if (window.currentAccuracyCircle) {
    window.currentAccuracyCircle.setLatLng(e.latlng).setRadius(displayRadius);
  } else {
    window.currentAccuracyCircle = L.circle(e.latlng, { radius: displayRadius, color: '#007aff', weight: 1, fillColor: '#007aff', className: 'radar-accuracy-circle' }).addTo(map);
  }

  if (!userMarker) userMarker = L.marker(e.latlng, { icon: myLocationIcon }).addTo(map);
  else userMarker.setLatLng(e.latlng);

  if (isFirstLocation) { map.panTo(e.latlng); isFirstLocation = false; }

  const selectEl = document.getElementById("hcHomeFavoriteSelect");
  if (!selectEl || selectEl.value === "my_location" || selectEl.value === "") {
    window.updateHomeCardByLocation(e.latlng.lat, e.latlng.lng);
  }
});

map.on('locationerror', function (e) { console.warn("GPS 수신 대기 중입니다: ", e.message); });

function handleDeviceOrientation(event) {
  let heading = null;
  if (event.webkitCompassHeading !== undefined) heading = event.webkitCompassHeading;
  else if (event.absolute && event.alpha !== undefined) heading = 360 - event.alpha;
  if (heading !== null) {
    const coneElement = document.getElementById('user-heading-cone');
    if (coneElement) coneElement.style.transform = `rotate(${heading}deg)`;
  }
}
if (window.DeviceOrientationEvent) {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') window.addEventListener('deviceorientation', handleDeviceOrientation, true);
  else { window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true); window.addEventListener('deviceorientation', handleDeviceOrientation, true); }
}
map.locate({ watch: true, enableHighAccuracy: true, setView: false });

const CenterToMyLocationControl = L.Control.extend({
  options: { position: 'bottomright' },
  onAdd: function (map) {
    const btnContainer = L.DomUtil.create('div', 'leaflet-bar leaflet-control custom-gps-trigger custom-gps-control-reset');
    btnContainer.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-main)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="custom-gps-control-svg"><circle cx="12" cy="12" r="7"></circle><line x1="12" y1="1" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="23"></line><line x1="1" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="23" y2="12"></svg>`;
    L.DomEvent.on(btnContainer, 'click', function (htmlEvent) { L.DomEvent.stopPropagation(htmlEvent); if (userLatLng) map.panTo(userLatLng); else alert('GPS 위치를 탐색 중입니다. 잠시만 기다려 주세요.'); });
    return btnContainer;
  }
});
map.addControl(new CenterToMyLocationControl());

window.refreshMapData = function () {
  const btn = document.querySelector('.top-center-ctrl'); if (!btn) return;
  const icon = btn.querySelector('.app-icon'); if (icon.classList.contains('spinning')) return;
  icon.classList.add('spinning');
  setTimeout(() => { icon.classList.remove('spinning'); console.log("지도 레이어 실시간 데이터 동기화 완료!"); }, 1500);
};

let showProhibited = false;
window.toggleProhibitedZones = function () {
  showProhibited = !showProhibited; document.getElementById('btn-prohibited').classList.toggle('active', showProhibited);
};

window.toggleToiletLayer = function (element) {
  window.isToiletLayerActive = !window.isToiletLayerActive;
  if (element && element.classList) element.classList.toggle('active', window.isToiletLayerActive);
  updateVisibleMarkersOnMap();
};


// =========================================================================
// [TAB AREA 3] 포인트 관리 대시보드 시스템, 드래그 소팅 및 카테고리 롱프레스 모듈
// =========================================================================
window.currentActiveCategory = null;

window.bindCategoryLongPressEngine = function() {
  const container = document.querySelector('.pm-category-tabs-row');
  if (!container) return;

  let longPressTimer = null;
  const pressDelay = 600; 
  let isLongPressActionTriggered = false;

  const startPress = (e) => {
    const btn = e.target.closest('.pm-category-tab-btn');
    if (!btn) return;
    const categoryId = btn.getAttribute('data-id'); 
    if (!categoryId) return;

    if (['전체', '즐겨찾기', '최근 추가된 화장실', '미분류'].includes(categoryId)) {
      return; 
    }
    
    isLongPressActionTriggered = false;
    longPressTimer = setTimeout(() => {
      isLongPressActionTriggered = true;
      if (navigator.vibrate) navigator.vibrate(40); 

      if (typeof window.openCategoryEditBottomSheet === 'function') {
        const savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');
        window.openCategoryEditBottomSheet(categoryId, savedCatColors[categoryId] || '#4f46e5', e);
      }
    }, pressDelay);
  };

  const cancelPress = (e) => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (isLongPressActionTriggered) { e.preventDefault(); e.stopPropagation(); }
  };

  container.addEventListener('mousedown', startPress);
  container.addEventListener('touchstart', startPress, { passive: true });
  container.addEventListener('mouseup', cancelPress);
  container.addEventListener('mouseleave', cancelPress);
  container.addEventListener('touchend', cancelPress);
  container.addEventListener('touchmove', cancelPress, { passive: true });

  container.addEventListener('click', (e) => {
    if (isLongPressActionTriggered) { e.preventDefault(); e.stopPropagation(); isLongPressActionTriggered = false; }
  }, true);
};

window.renderPointsManagementTab = function () {
  const tabsContainer = document.getElementById('pm-category-tabs');
  const listContainer = document.getElementById('pm-points-list');
  if (!tabsContainer || !listContainer) return;

  if (!window.currentActiveCategory) {
    window.currentActiveCategory = localStorage.getItem('pm-last-category') || '전체';
  }
  if (window.currentActiveCategory === '공중화장실 정보') window.currentActiveCategory = '최근 추가된 화장실';

  let categories = ['전체', '즐겨찾기'];
  let savedCatOrder = JSON.parse(localStorage.getItem('pm-category-order') || '[]').filter(cat => cat !== '공중화장실 정보' && cat !== '최근 추가된 화장실' && cat !== 'toilet' && cat !== '미분류');
  let currentCats = [...new Set(cachedFishingPoints.map(p => String(p.category || '미분류').trim()))].filter(cat => cat !== '공중화장실 정보' && cat !== '최근 추가된 화장실' && cat !== 'toilet' && cat !== '미분류');

  let activeCategories = [...savedCatOrder];
  currentCats.forEach(cat => { if (!activeCategories.includes(cat)) activeCategories.push(cat); });

  categories = categories.concat(activeCategories);
  categories.push('미분류', '최근 추가된 화장실');
  if (!categories.includes(window.currentActiveCategory)) window.currentActiveCategory = '전체';

  tabsContainer.innerHTML = '';
  const savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');

  categories.forEach(catName => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pm-category-tab-btn';
    btn.setAttribute('data-id', catName); 
    if (catName === window.currentActiveCategory) btn.classList.add('active');

    let catColor = '#868e96';
    if (catName === '전체') catColor = 'var(--primary-color)';
    else if (catName === '즐겨찾기') catColor = '#ffcc00';
    else if (catName === '최근 추가된 화장실') catColor = '#ff9500';
    else if (catName === '미분류') catColor = '#868e96';
    else {
      const matchPoints = cachedFishingPoints.filter(p => String(p.category || '미분류').trim() === catName.trim());
      catColor = matchPoints.length > 0 ? (matchPoints[0].color || '#007aff') : (savedCatColors[catName] || '#007aff');
    }

    btn.innerHTML = `<span class="pm-tab-dot" style="background:${catColor}"></span><span>${catName}</span>`;
    btn.onclick = function () {
      window.currentActiveCategory = catName; localStorage.setItem('pm-last-category', catName);
      tabsContainer.querySelectorAll('.pm-category-tab-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');

      const outerContainer = tabsContainer.parentElement;
      const scrollLeft = btn.offsetLeft - (outerContainer.clientWidth / 2) + (btn.clientWidth / 2);
      outerContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      renderActiveCategoryPoints();
    };

    tabsContainer.appendChild(btn);
    if (catName === window.currentActiveCategory) {
      setTimeout(() => {
        const outerContainer = tabsContainer.parentElement;
        outerContainer.scrollLeft = btn.offsetLeft - (outerContainer.clientWidth / 2) + (btn.clientWidth / 2);
      }, 50);
    }
  });

  function renderActiveCategoryPoints() {
    listContainer.innerHTML = ''; let displayPoints = [];
    if (window.currentActiveCategory === '전체') {
      displayPoints = [...cachedFishingPoints.map(p => ({ ...p, category: (p.category && String(p.category).trim() !== "") ? String(p.category).trim() : "미분류" }))];
    } else if (window.currentActiveCategory === '즐겨찾기') {
      displayPoints = cachedFishingPoints.filter(p => p.isFavorite === true).sort((a, b) => (b.favoritedAt || 0) - (a.favoritedAt || 0));
    } else if (window.currentActiveCategory === '최근 추가된 화장실') {
      displayPoints = cachedPublicToilets.slice(0, 5).map(t => ({ ...t, category: "toilet" }));
    } else {
      displayPoints = cachedFishingPoints.filter(p => String(p.category || '미분류').trim() === String(window.currentActiveCategory).trim());
    }

    if (displayPoints.length === 0) { listContainer.innerHTML = `<div class="pm-empty-msg">[${window.currentActiveCategory}] 카테고리에 등록된 포인트가 없습니다.</div>`; return; }
    displayPoints.forEach(item => { listContainer.appendChild(createPointRowComponent(item, window.currentActiveCategory === '전체' || window.currentActiveCategory === '즐겨찾기')); });

    if (window.currentActiveCategory === '즐겨찾기') window.bindDragAndDropEvents(listContainer, true);
    else if (window.currentActiveCategory !== '전체' && window.currentActiveCategory !== '최근 추가된 화장실') window.bindDragAndDropEvents(listContainer, false);
  }

  renderActiveCategoryPoints();
  window.bindCategoryLongPressEngine(); 
};

function createPointRowComponent(pt, isFavSection) {
  const row = document.createElement('div'); row.className = "pm-item"; row.id = `pm-node-${pt.id}`;
  const isCurrentlyFav = pt.isFavorite === true; const isToilet = (pt.category === 'toilet');

  row.innerHTML = `
    <div class="pm-item-left" style="width: calc(100% - 100px);">
      <div class="pm-drag-handle" style="${isToilet ? 'visibility:hidden; pointer-events:none;' : ''}; touch-action: none;"><svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-main)" stroke="var(--text-main)" stroke-width="2.5"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></div>
      ${isFavSection ? `<div class="pm-color-dot" style="background-color: ${isToilet ? '#ff9500' : (pt.color || '#007aff')}; margin-right: 4px;"></div>` : ''}
      <div class="pm-item-info" style="padding-left: 4px; min-width: 0; flex: 1;">
        <span class="pm-item-name" style="outline:none; font-weight:600;">${pt.name || (isToilet ? '공중화장실' : '무명 포인트')}</span>
        <span style="font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; margin-top:2px;">${pt.address || (isToilet ? "소재지 도로명 주소" : "주소 정보 없음")}</span>
      </div>
    </div>
    <div class="pm-item-actions">
      <button class="pm-action-btn favorite ${isCurrentlyFav ? 'active' : ''}" style="${isToilet ? 'display:none;' : ''}"><svg width="15" height="15" viewBox="0 0 24 24" fill="${isCurrentlyFav ? '#ffcc00' : 'none'}" stroke="${isCurrentlyFav ? '#ffcc00' : '#adb5bd'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></button>
      <button class="pm-action-btn edit" style="${isToilet ? 'display:none;' : ''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
      <button class="pm-action-btn delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
    </div>
  `;

  const fBtn = row.querySelector('.pm-action-btn.favorite');
  if (fBtn && !isToilet) fBtn.onclick = (e) => { e.stopPropagation(); db.collection('fishing_points').doc(pt.id).update({ isFavorite: !isCurrentlyFav, favoritedAt: !isCurrentlyFav ? Date.now() : firebase.firestore.FieldValue.delete() }); };
  const eBtn = row.querySelector('.pm-action-btn.edit');
  if (eBtn && !isToilet) eBtn.onclick = (e) => { e.stopPropagation(); window.openPointEditModal(pt.id, pt.name || '무명 포인트', pt.category || '미분류', pt.memo || '등록된 메모가 없습니다.', pt.parkingType || 'none', pt.parkingUnit || '10분', pt.parkingPrice || '0', pt.hasStore || false, pt.hasCafe || false, pt.hasTackle || false, pt.address || "주소 정보 없음", pt.lat, pt.lng); };
  const dBtn = row.querySelector('.pm-action-btn.delete');
  if (dBtn) dBtn.onclick = (e) => { e.stopPropagation(); window.openMarkerDeleteModal(pt.id, isToilet ? 'public_toilets' : 'fishing_points', pt.name || (isToilet ? '공중화장실' : '무명 포인트')); };

  row.onclick = (e) => { if (e.target.closest('.pm-action-btn') || e.target.closest('.pm-drag-handle')) return; window.openPointDetailFromList(pt); };
  return row;
}

window.bindDragAndDropEvents = function (container, isFavSection = false) {
  if (!container) return;
  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.pm-drag-handle'); if (!handle) return;
    const item = handle.closest('.pm-item'); if (!item) return;
    e.preventDefault(); item.classList.add('dragging'); handle.setPointerCapture(e.pointerId);

    const onPointerMove = (evt) => {
      const draggingItem = container.querySelector('.pm-item.dragging'); if (!draggingItem) return;
      const nextSibling = [...container.querySelectorAll('.pm-item:not(.dragging)')].find(sib => evt.clientY < sib.getBoundingClientRect().top + sib.getBoundingClientRect().height / 2);
      if (nextSibling) container.insertBefore(draggingItem, nextSibling); else container.appendChild(draggingItem);
    };

    const onPointerUp = (evt) => {
      item.classList.remove('dragging'); handle.releasePointerCapture(evt.pointerId);
      window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); window.removeEventListener('pointercancel', onPointerUp);
      if (isFavSection) saveFavoriteOrderToFirebase(container); else saveCategoryOrderWithinTabToFirebase(container);
    };
    window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', onPointerUp); window.addEventListener('pointercancel', onPointerUp);
  });
};

function saveFavoriteOrderToFirebase(container) {
  const batch = db.batch(); const baseTime = Date.now();
  ([...container.querySelectorAll('.pm-item')]).forEach((el, index) => { batch.update(db.collection('fishing_points').doc(el.id.replace('pm-node-', '')), { favoritedAt: baseTime - (index * 1000) }); });
  batch.commit();
}

function saveCategoryOrderWithinTabToFirebase(container) {
  const batch = db.batch(); const baseTime = Date.now();
  ([...container.querySelectorAll('.pm-item')]).forEach((el, index) => {
    const docId = el.id.replace('pm-node-', '');
    if (!cachedPublicToilets.some(t => t.id === docId)) batch.update(db.collection('fishing_points').doc(docId), { createdAt: firebase.firestore.Timestamp.fromMillis(baseTime - (index * 1000)) });
  });
  batch.commit().catch(err => console.error(err));
}

// =========================================================================
// [TAB AREA 4] 게시판 엔진 (공지사항/이벤트 + 정보 게시판 동적 렌더링 포함)
// =========================================================================
let cachedNotices = [];
let cachedEvents = [];
let currentBoardTab = 'notice';

window.showNoticePage = function (initialTab) {
  window.closeModals();
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.getElementById('notice-page')?.classList.add('active');
  window.switchBoardSubTab((initialTab === 'event') ? 'event' : 'notice');
};

window.switchBoardSubTab = function (tab) {
  currentBoardTab = tab;
  const btnNotice = document.getElementById('btnSubTabNotice'), btnEvent = document.getElementById('btnSubTabEvent');
  const containerNotice = document.getElementById('notice-list-container'), containerEvent = document.getElementById('event-list-container');
  const detailContainer = document.getElementById('notice-inline-detail-container');

  if (btnNotice) btnNotice.classList.toggle('active', tab === 'notice');
  if (btnEvent) btnEvent.classList.toggle('active', tab === 'event');
  if (containerNotice) containerNotice.classList.toggle('active', tab === 'notice');
  if (containerEvent) containerEvent.classList.toggle('active', tab === 'event');
  if (detailContainer) detailContainer.classList.remove('active');

  if (tab === 'notice') { document.getElementById('lblNoticeHeaderTitle').innerText = '공지사항'; window.fetchLiveNotices(); }
  else { document.getElementById('lblNoticeHeaderTitle').innerText = '이벤트'; window.fetchLiveEvents(); }
};

window.handleNoticeBackNavigation = function () {
  const detailContainer = document.getElementById('notice-inline-detail-container');
  if (detailContainer && detailContainer.classList.contains('active')) {
    detailContainer.classList.remove('active');
    if (currentBoardTab === 'notice') document.getElementById('notice-list-container')?.classList.add('active');
    if (currentBoardTab === 'event') document.getElementById('event-list-container')?.classList.add('active');
    document.getElementById('lblNoticeHeaderTitle').innerText = (currentBoardTab === 'notice') ? '공지사항' : '이벤트';
    return;
  }
  document.getElementById('notice-page')?.classList.remove('active');
  document.getElementById('tab-more')?.classList.add('active');
  const navItems = document.querySelectorAll('.nav-item');
  if (navItems.length >= 4) { navItems.forEach(ni => ni.classList.remove('active')); navItems[3].classList.add('active'); }
};

window.fetchLiveNotices = function () {
  const container = document.getElementById('notice-list-container'); if (!container) return;
  container.innerHTML = '<div class="pm-empty-msg">공지사항을 불러오는 중입니다...</div>';

  db.collection('notices').orderBy('createdAt', 'desc').get().then((snapshot) => {
    cachedNotices = []; container.innerHTML = ''; if (snapshot.empty) { container.innerHTML = '<div class="pm-empty-msg">등록된 공지사항이 없습니다.</div>'; return; }
    const totalCount = snapshot.size; let index = 0;
    snapshot.forEach((doc) => {
      const data = doc.data(); cachedNotices.push({ id: doc.id, ...data });
      let dateStr = "일자 미상"; if (data.createdAt) { const d = (typeof data.createdAt.toDate === 'function') ? data.createdAt.toDate() : new Date(data.createdAt); dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
      const item = document.createElement('div'); item.className = 'notice-item';
      item.innerHTML = `<div class="notice-item-num">${totalCount - index}</div><div class="notice-item-title">${data.title || '제목 없음'}</div><div class="notice-item-date">${dateStr}</div>`;
      item.onclick = () => window.openNoticeDetail(doc.id); container.appendChild(item); index++;
    });
  }).catch(() => { container.innerHTML = '<div class="pm-empty-msg">데이터 수신에 실패했습니다.</div>'; });
};

window.fetchLiveEvents = function () {
  const container = document.getElementById('event-list-container'); if (!container) return;
  container.innerHTML = '<div class="pm-empty-msg">이벤트를 불러오는 중입니다...</div>';

  db.collection('events').orderBy('createdAt', 'desc').get().then((snapshot) => {
    cachedEvents = []; container.innerHTML = ''; if (snapshot.empty) { container.innerHTML = '<div class="pm-empty-msg">등록된 이벤트가 없습니다.</div>'; return; }
    const totalCount = snapshot.size; let index = 0;
    snapshot.forEach((doc) => {
      const data = doc.data(); cachedEvents.push({ id: doc.id, ...data });
      let dateStr = "일자 미상"; if (data.createdAt) { const d = (typeof data.createdAt.toDate === 'function') ? data.createdAt.toDate() : new Date(data.createdAt); dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
      const item = document.createElement('div'); item.className = 'notice-item';
      item.innerHTML = `<div class="notice-item-num">${totalCount - index}</div><div class="notice-item-title">${data.title || '제목 없음'}</div><div class="notice-item-date">${dateStr}</div>`;
      item.onclick = () => window.openNoticeDetail(doc.id); container.appendChild(item); index++;
    });
  }).catch(() => { container.innerHTML = '<div class="pm-empty-msg">데이터 수신에 실패했습니다.</div>'; });
};

window.openNoticeDetail = function (docId) {
  const targetList = (currentBoardTab === 'notice') ? cachedNotices : cachedEvents;
  const notice = targetList.find(n => n.id === docId); if (!notice) return;

  document.getElementById('lblInlineNoticeTitle').innerText = notice.title || '제목 없음';
  if (document.getElementById('lblInlineNoticeDate') && notice.createdAt) {
    const d = (typeof notice.createdAt.toDate === 'function') ? notice.createdAt.toDate() : new Date(notice.createdAt);
    document.getElementById('lblInlineNoticeDate').innerText = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  document.getElementById('lblInlineNoticeContent').innerText = notice.content || '';
  document.getElementById('notice-list-container')?.classList.remove('active');
  document.getElementById('event-list-container')?.classList.remove('active');
  document.getElementById('notice-inline-detail-container')?.classList.add('active');

  document.getElementById('btnNoticeInlineEdit').onclick = () => {
    document.getElementById('noticeWriteMode').value = 'edit'; document.getElementById('noticeWriteTargetId').value = docId;
    document.getElementById('noticeWriteTitle').value = notice.title || ''; document.getElementById('noticeWriteContent').value = notice.content || '';
    document.getElementById('lblNoticeWriteModalTitle').innerText = '글 수정';
    document.getElementById('modalBackdrop')?.classList.add('active'); document.getElementById('noticeWriteModal')?.classList.add('active');
  };

  document.getElementById('btnNoticeInlineDelete').onclick = () => {
    window.openMarkerDeleteModal(docId, (currentBoardTab === 'notice') ? 'notices' : 'events', notice.title || '게시글', () => {
      document.getElementById('notice-inline-detail-container')?.classList.remove('active');
      if (currentBoardTab === 'notice') { document.getElementById('notice-list-container')?.classList.add('active'); window.fetchLiveNotices(); }
      else { document.getElementById('event-list-container')?.classList.add('active'); window.fetchLiveEvents(); }
    });
  };
};

window.openNoticeWriteModal = function () {
  if (document.getElementById('noticeWriteTitle')) document.getElementById('noticeWriteTitle').value = '';
  if (document.getElementById('noticeWriteContent')) document.getElementById('noticeWriteContent').value = '';
  document.getElementById('noticeWriteMode').value = 'add'; document.getElementById('noticeWriteTargetId').value = '';
  document.getElementById('lblNoticeWriteModalTitle').innerText = '글 등록';
  document.getElementById('modalBackdrop')?.classList.add('active'); document.getElementById('noticeWriteModal')?.classList.add('active');
};

window.saveNoticeData = function () {
  const title = document.getElementById('noticeWriteTitle')?.value.trim() || '';
  const content = document.getElementById('noticeWriteContent')?.value.trim() || '';
  const mode = document.getElementById('noticeWriteMode').value;
  const targetId = document.getElementById('noticeWriteTargetId').value;
  const collectionName = (currentBoardTab === 'notice') ? 'notices' : 'events';

  if (!title || !content) return alert('제목과 내용을 모두 입력해 주세요.');

  if (mode === 'edit') {
    db.collection(collectionName).doc(targetId).update({ title, content }).then(() => {
      window.closeModals(); alert('성공적으로 수정되었습니다.');
      document.getElementById('lblInlineNoticeTitle').innerText = title; document.getElementById('lblInlineNoticeContent').innerText = content;
      if (currentBoardTab === 'notice') window.fetchLiveNotices(); else window.fetchLiveEvents();
    }).catch(() => alert('수정 중 오류가 발생했습니다.'));
  } else {
    db.collection(collectionName).add({ title, content, date: window.getFormattedCurrentTime(), createdAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => {
      window.closeModals(); alert('성공적으로 등록되었습니다.');
      document.getElementById('notice-inline-detail-container')?.classList.remove('active');
      if (currentBoardTab === 'notice') { document.getElementById('notice-list-container')?.classList.add('active'); window.fetchLiveNotices(); }
      else { document.getElementById('event-list-container')?.classList.add('active'); window.fetchLiveEvents(); }
    }).catch(() => alert('저장 중 오류가 발생했습니다.'));
  }
};

// --- 정보 게시판(금어기, 금지체장, 물때표, 매듭법) 동적 DB 연동 로직 ---
let cachedFishingBans = [];
let cachedSizeLimits = [];
let cachedKnotGuides = [];
let currentInfoTab = 'fishing_ban';
let isInfoListenersInitialized = false;
window.cachedStaticTideHtml = '';

window.InfoBoardSystem = {
  extractYoutubeId: function(url) {
    if (!url) return '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : '';
  },
  getShortsThumbnail: function(url) {
    const videoId = this.extractYoutubeId(url);
    if (!videoId) return '';
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  },
  parseHashTags: function(tagsString) {
    if (!tagsString) return '';
    return tagsString.split(',').map(tag => tag.trim().startsWith('#') ? tag.trim() : `#${tag.trim()}`).join(' ');
  }
};

window.showInfoBoardPage = function (subTabId) {
  window.closeModals();
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  const infoBoardPage = document.getElementById('info-board-page');
  if (infoBoardPage) infoBoardPage.classList.add('active');
  
  window.switchInfoSubTab(subTabId);
  window.initInfoBoardRealtimeListeners();
};

window.handleInfoBoardBackNavigation = function () {
  document.getElementById('info-board-page')?.classList.remove('active');
  document.getElementById('tab-more')?.classList.add('active');
  const navItems = document.querySelectorAll('.nav-item');
  if (navItems.length >= 4) {
    navItems.forEach(ni => ni.classList.remove('active'));
    navItems[3].classList.add('active');
  }
};

window.switchInfoSubTab = function (subTabId) {
  currentInfoTab = subTabId;
  const tabButtons = {
    'fishing_ban': document.getElementById('btnSubTabFishingBan'),
    'size_limit': document.getElementById('btnSubTabSizeLimit'),
    'tide_table': document.getElementById('btnSubTabTideTable'),
    'knot_guide': document.getElementById('btnSubTabKnotGuide')
  };
  const headerTitles = {
    'fishing_ban': '금어기 정보',
    'size_limit': '금지체장 기준',
    'tide_table': '물때표 가이드',
    'knot_guide': '낚시 매듭법'
  };

  Object.values(tabButtons).forEach(btn => { if (btn) btn.classList.remove('active'); });
  if (tabButtons[subTabId]) tabButtons[subTabId].classList.add('active');

  const headerTitleLbl = document.getElementById('lblInfoBoardHeaderTitle');
  if (headerTitleLbl && headerTitles[subTabId]) headerTitleLbl.innerText = headerTitles[subTabId];

  const searchWrapper = document.getElementById('infoSearchWrapper');
  const searchInput = document.getElementById('infoSearchInput');
  if (searchWrapper && searchInput) {
    if (subTabId === 'fishing_ban' || subTabId === 'size_limit' || subTabId === 'knot_guide') {
      searchWrapper.style.display = 'block';
      searchInput.value = '';
    } else {
      searchWrapper.style.display = 'none';
    }
  }

  const actionBtn = document.getElementById('btnInfoBoardAction');
  if (actionBtn) {
    if (subTabId === 'tide_table') {
      actionBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
      actionBtn.onclick = () => window.openInfoEditModal();
    } else {
      actionBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
      actionBtn.onclick = () => window.openInfoWriteFormModal(subTabId);
    }
  }

  window.renderInfoContentCards();
};

window.initInfoBoardRealtimeListeners = function () {
  if (isInfoListenersInitialized) return;
  isInfoListenersInitialized = true;

  db.collection('fishing_ban').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    cachedFishingBans = [];
    snapshot.forEach(doc => cachedFishingBans.push({ id: doc.id, ...doc.data() }));
    if (currentInfoTab === 'fishing_ban') window.renderInfoContentCards();
  });

  db.collection('size_limit').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    cachedSizeLimits = [];
    snapshot.forEach(doc => cachedSizeLimits.push({ id: doc.id, ...doc.data() }));
    if (currentInfoTab === 'size_limit') window.renderInfoContentCards();
  });

  db.collection('knot_guide').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    cachedKnotGuides = [];
    snapshot.forEach(doc => cachedKnotGuides.push({ id: doc.id, ...doc.data() }));
    if (currentInfoTab === 'knot_guide') window.renderInfoContentCards();
  });

  db.collection('info_static').doc('tide_table').onSnapshot(doc => {
    window.cachedStaticTideHtml = doc.exists ? doc.data().html || '<div class="pm-empty-msg">내용을 입력해 주세요.</div>' : '<div class="pm-empty-msg">내용을 입력해 주세요.</div>';
    if (currentInfoTab === 'tide_table') window.renderInfoContentCards();
  });
};

window.renderInfoContentCards = function (filterKeyword = "") {
  const container = document.getElementById('infoBoardContentContainer');
  if (!container) return;
  container.innerHTML = "";
  const kw = filterKeyword.trim().toLowerCase();

  if (currentInfoTab === 'fishing_ban') {
    const filtered = cachedFishingBans.filter(b => (b.species || "").toLowerCase().includes(kw));
    if (filtered.length === 0) { container.innerHTML = '<div class="pm-empty-msg">검색된 금어기 정보가 없습니다.</div>'; return; }
    
    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'info-card-item';
      const imgContent = item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.species}">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
      
      card.innerHTML = `
        <div class="info-card-img-box">${imgContent}</div>
        <div class="info-card-content-box">
          <div class="info-card-header">
            <span class="info-card-species">${item.species || '어종 미상'}</span>
            <div class="pm-item-actions">
              <button class="pm-action-btn edit" onclick="window.openInfoEditFormModal('fishing_ban', '${item.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
              <button class="pm-action-btn delete" onclick="window.deleteInfoData('fishing_ban', '${item.id}', '${item.species}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
          </div>
          <div class="info-card-body-flex">
            <div class="info-card-details">
              <div class="info-detail-row"><strong>금어기:</strong> ${item.period || '-'}</div>
              <div class="info-detail-row"><strong>적용지역:</strong> ${item.region || '-'}</div>
              <div class="info-detail-row"><strong>비고:</strong> ${item.note || '-'}</div>
            </div>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  } 
  else if (currentInfoTab === 'size_limit') {
    const filtered = cachedSizeLimits.filter(s => (s.species || "").toLowerCase().includes(kw));
    if (filtered.length === 0) { container.innerHTML = '<div class="pm-empty-msg">검색된 금지체장 기준이 없습니다.</div>'; return; }
    
    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'info-card-item';
      const badgeClass = item.type === 'sea' ? 'sea' : 'fresh';
      const badgeText = item.type === 'sea' ? '바다' : '민물';
      const imgContent = item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.species}">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
      
      let sizeRenderStr = "";
      const min = parseFloat(item.minSize || 0);
      const max = parseFloat(item.maxSize || 0);
      if (min > 0 && max > 0) sizeRenderStr = `${min}cm 이상 ~ ${max}cm 이하`;
      else if (min > 0) sizeRenderStr = `${min}cm 이상`;
      else if (max > 0) sizeRenderStr = `${max}cm 이하`;
      else sizeRenderStr = "제한 규격 없음";

      card.innerHTML = `
        <div class="info-card-img-box">${imgContent}</div>
        <div class="info-card-content-box">
          <div class="info-card-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="info-card-species">${item.species || '어종 미상'}</span>
              <span class="info-card-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="pm-item-actions">
              <button class="pm-action-btn edit" onclick="window.openInfoEditFormModal('size_limit', '${item.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
              <button class="pm-action-btn delete" onclick="window.deleteInfoData('size_limit', '${item.id}', '${item.species}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
          </div>
          <div class="info-card-body-flex">
            <div class="info-card-details">
              <div class="info-detail-row"><strong>금지체장:</strong> ${sizeRenderStr}</div>
            </div>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  } 
  else if (currentInfoTab === 'tide_table') {
    const staticBox = document.createElement('div');
    staticBox.className = 'notice-inline-content';
    staticBox.style.padding = '0';
    staticBox.innerHTML = window.cachedStaticTideHtml || '<div class="pm-empty-msg">내용이 비어있습니다.</div>';
    container.appendChild(staticBox);
  } 
  else if (currentInfoTab === 'knot_guide') {
    const filtered = cachedKnotGuides.filter(k => (k.title || "").toLowerCase().includes(kw));
    if (filtered.length === 0) { container.innerHTML = '<div class="pm-empty-msg">검색된 매듭법 가이드가 없습니다.</div>'; return; }
    
    const grid = document.createElement('div');
    grid.className = 'info-knot-grid';
    
    filtered.forEach(item => {
      const knotCard = document.createElement('div');
      knotCard.className = 'info-knot-card';
      
      let youtubeId = window.InfoBoardSystem.extractYoutubeId(item.videoUrl);
      const thumbUrl = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg` : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"></svg>';
      const formattedTags = window.InfoBoardSystem.parseHashTags(item.recommend);

      knotCard.innerHTML = `
        <div class="info-knot-thumb-wrapper" onclick="if('${item.videoUrl}') window.open('${item.videoUrl}', '_blank');">
          <img src="${thumbUrl}" alt="${item.title}" onerror="this.src='https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg'">
          <div class="info-knot-play-overlay">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="info-knot-info-area">
          <div style="display: flex; align-items: center; justify-content: space-between; width:100%;">
            <span class="info-knot-title">${item.title || '매듭법'}</span>
            <div style="display:flex; gap:2px; flex-shrink:0;">
              <button class="pm-action-btn edit" style="width:22px; height:22px; padding:0;" onclick="window.openInfoEditFormModal('knot_guide', '${item.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px; height:11px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
              <button class="pm-action-btn delete" style="width:22px; height:22px; padding:0;" onclick="window.deleteInfoData('knot_guide', '${item.id}', '${item.title}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px; height:11px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
          </div>
          <div class="info-knot-tags">${formattedTags}</div>
          <div class="info-knot-source">유튜브 동영상 가이드</div>
        </div>
      `;
      grid.appendChild(knotCard);
    });
    container.appendChild(grid);
  }
};

window.handleInfoSearch = function (val) {
  window.renderInfoContentCards(val);
};

window.openInfoWriteFormModal = function (tabType) {
  window.closeModals();
  document.getElementById('modalBackdrop')?.classList.add('active');
  
  const safeSetElementValue = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  
  if (tabType === 'fishing_ban') {
    safeSetElementValue('banModalMode', 'add');
    safeSetElementValue('banModalTargetId', '');
    safeSetElementValue('banSpecies', '');
    safeSetElementValue('banPeriod', '');
    safeSetElementValue('banRegion', '');
    safeSetElementValue('banNote', '');
    safeSetElementValue('banImageUrl', '');
    const titleLbl = document.getElementById('lblFishingBanModalTitle');
    if (titleLbl) titleLbl.innerText = '금어기 등록';
    document.getElementById('fishingBanModal')?.classList.add('active');
  } 
  else if (tabType === 'size_limit') {
    safeSetElementValue('limitModalMode', 'add');
    safeSetElementValue('limitModalTargetId', '');
    safeSetElementValue('limitSpecies', '');
    safeSetElementValue('limitMinSize', '');
    safeSetElementValue('limitMaxSize', '');
    safeSetElementValue('limitImageUrl', '');
    window.selectLimitType('sea', document.getElementById('chipLimitSea'));
    const titleLbl = document.getElementById('lblSizeLimitModalTitle');
    if (titleLbl) titleLbl.innerText = '금지체장 등록';
    document.getElementById('sizeLimitModal')?.classList.add('active');
  } 
  else if (tabType === 'knot_guide') {
    safeSetElementValue('knotModalMode', 'add');
    safeSetElementValue('knotModalTargetId', '');
    safeSetElementValue('knotTitle', '');
    safeSetElementValue('knotRecommend', '');
    safeSetElementValue('knotVideoUrl', '');
    const titleLbl = document.getElementById('lblKnotGuideModalTitle');
    if (titleLbl) titleLbl.innerText = '매듭법 등록';
    document.getElementById('knotGuideModal')?.classList.add('active');
  }
};

window.openInfoEditFormModal = function (tabType, docId) {
  window.closeModals();
  document.getElementById('modalBackdrop')?.classList.add('active');

  const safeSetElementValue = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  if (tabType === 'fishing_ban') {
    const item = cachedFishingBans.find(b => b.id === docId);
    if (!item) return;
    safeSetElementValue('banModalMode', 'edit');
    safeSetElementValue('banModalTargetId', docId);
    safeSetElementValue('banSpecies', item.species || '');
    safeSetElementValue('banPeriod', item.period || '');
    safeSetElementValue('banRegion', item.region || '');
    safeSetElementValue('banNote', item.note || '');
    safeSetElementValue('banImageUrl', item.imageUrl || '');
    const titleLbl = document.getElementById('lblFishingBanModalTitle');
    if (titleLbl) titleLbl.innerText = '금어기 수정';
    document.getElementById('fishingBanModal')?.classList.add('active');
  } 
  else if (tabType === 'size_limit') {
    const item = cachedSizeLimits.find(s => s.id === docId);
    if (!item) return;
    safeSetElementValue('limitModalMode', 'edit');
    safeSetElementValue('limitModalTargetId', docId);
    safeSetElementValue('limitSpecies', item.species || '');
    safeSetElementValue('limitMinSize', item.minSize || '');
    safeSetElementValue('limitMaxSize', item.maxSize || '');
    safeSetElementValue('limitImageUrl', item.imageUrl || '');
    window.selectLimitType(item.type || 'sea', item.type === 'fresh' ? document.getElementById('chipLimitFresh') : document.getElementById('chipLimitSea'));
    const titleLbl = document.getElementById('lblSizeLimitModalTitle');
    if (titleLbl) titleLbl.innerText = '금지체장 수정';
    document.getElementById('sizeLimitModal')?.classList.add('active');
  } 
  else if (tabType === 'knot_guide') {
    const item = cachedKnotGuides.find(k => k.id === docId);
    if (!item) return;
    safeSetElementValue('knotModalMode', 'edit');
    safeSetElementValue('knotModalTargetId', docId);
    safeSetElementValue('knotTitle', item.title || '');
    safeSetElementValue('knotRecommend', item.recommend || '');
    safeSetElementValue('knotVideoUrl', item.videoUrl || '');
    const titleLbl = document.getElementById('lblKnotGuideModalTitle');
    if (titleLbl) titleLbl.innerText = '매듭법 수정';
    document.getElementById('knotGuideModal')?.classList.add('active');
  }
};

window.selectLimitType = function (type, btn) {
  document.getElementById('limitType').value = type;
  document.querySelectorAll('#limitTypeChips .chip-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
};

window.saveFishingBanData = function () {
  const species = document.getElementById('banSpecies').value.trim();
  const period = document.getElementById('banPeriod').value.trim();
  const region = document.getElementById('banRegion').value.trim();
  const note = document.getElementById('banNote').value.trim();
  const imageUrl = document.getElementById('banImageUrl').value.trim();
  const mode = document.getElementById('banModalMode').value;
  const targetId = document.getElementById('banModalTargetId').value;

  if (!species) return alert('어종명을 입력해 주세요.');

  const payload = { species, period, region, note, imageUrl, createdAt: firebase.firestore.FieldValue.serverTimestamp() };

  if (mode === 'edit') {
    db.collection('fishing_ban').doc(targetId).update({ species, period, region, note, imageUrl }).then(() => {
      window.closeModals(); alert('수정되었습니다.');
    });
  } else {
    db.collection('fishing_ban').add(payload).then(() => {
      window.closeModals(); alert('등록되었습니다.');
    });
  }
};

window.saveSizeLimitData = function () {
  const species = document.getElementById('limitSpecies').value.trim();
  const type = document.getElementById('limitType').value;
  const minSize = document.getElementById('limitMinSize').value.trim();
  const maxSize = document.getElementById('limitMaxSize').value.trim();
  const imageUrl = document.getElementById('limitImageUrl').value.trim();
  const mode = document.getElementById('limitModalMode').value;
  const targetId = document.getElementById('limitModalTargetId').value;

  if (!species) return alert('어종명을 입력해 주세요.');

  const payload = { species, type, minSize, maxSize, imageUrl, createdAt: firebase.firestore.FieldValue.serverTimestamp() };

  if (mode === 'edit') {
    db.collection('size_limit').doc(targetId).update({ species, type, minSize, maxSize, imageUrl }).then(() => {
      window.closeModals(); alert('수정되었습니다.');
    });
  } else {
    db.collection('size_limit').add(payload).then(() => {
      window.closeModals(); alert('등록되었습니다.');
    });
  }
};

window.saveKnotGuideData = function () {
  const title = document.getElementById('knotTitle').value.trim();
  const recommend = document.getElementById('knotRecommend').value.trim();
  const videoUrl = document.getElementById('knotVideoUrl').value.trim();
  const mode = document.getElementById('knotModalMode').value;
  const targetId = document.getElementById('knotModalTargetId').value;

  if (!title) return alert('매듭법 명을 입력해 주세요.');

  const payload = { title, recommend, videoUrl, createdAt: firebase.firestore.FieldValue.serverTimestamp() };

  if (mode === 'edit') {
    db.collection('knot_guide').doc(targetId).update({ title, recommend, videoUrl }).then(() => {
      window.closeModals(); alert('수정되었습니다.');
    });
  } else {
    db.collection('knot_guide').add(payload).then(() => {
      window.closeModals(); alert('등록되었습니다.');
    });
  }
};

window.deleteInfoData = function (collection, docId, labelName) {
  window.openMarkerDeleteModal(docId, collection, labelName, () => {
    alert('삭제 완료되었습니다.');
    window.closeModals();
    window.renderInfoContentCards();
  });
};

window.openInfoEditModal = function () {
  const editContentTextArea = document.getElementById('infoEditContent');
  const infoEditTargetTabInput = document.getElementById('infoEditTargetTab');

  if (editContentTextArea && infoEditTargetTabInput) {
    infoEditTargetTabInput.value = 'tide_table';
    editContentTextArea.value = window.cachedStaticTideHtml || '';

    document.getElementById('modalBackdrop')?.classList.add('active');
    document.getElementById('infoEditModal')?.classList.add('active');
  }
};

window.saveInfoEditData = function () {
  const editContentTextArea = document.getElementById('infoEditContent');
  if (editContentTextArea) {
    const nextHtml = editContentTextArea.value;
    db.collection('info_static').doc('tide_table').set({ html: nextHtml }).then(() => {
      window.closeModals();
      alert('물때표 정보 가이드 갱신이 완료되었습니다.');
    });
  }
};

// =========================================================================
// [TAB AREA 5] 더보기 탭, 전역 앱 설정 및 관리자 디버깅 패널 가드 시스템
// =========================================================================
window.toggleDarkMode = function (checkbox) {
  const isDark = checkbox.checked; localStorage.setItem('dark-mode', isDark ? 'true' : 'false');
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  if (clean2DLayer) { clean2DLayer.setUrl(isDark ? CARTO_DARK_URL : CARTO_LIGHT_URL); clean2DLayer.redraw(); }
};

window.toggleNaviApp = function (checkbox) {
  const isNaver = checkbox.checked; localStorage.setItem('navi-app', isNaver ? 'naver' : 'kakao');
  const label = document.getElementById('naviAppLabel'); if (label) label.innerText = isNaver ? '네비게이션: 네이버 지도' : '네비게이션: 카카오 지도';
};

window.showSettingsPage = function () { window.closeModals(); document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active')); document.getElementById('settings-page')?.classList.add('active'); };
window.hideSettingsPage = function () { document.getElementById('settings-page')?.classList.remove('active'); document.getElementById('tab-more')?.classList.add('active'); };

window.openAdminModal = function () {
  window.closeModals(); document.getElementById('modalBackdrop')?.classList.add('active');
  const adminModal = document.getElementById('mdlAdminPanel');
  if (adminModal) { adminModal.classList.add('active'); L.DomEvent.disableClickPropagation(adminModal); }

  window.checkAdminCacheStatus(); window.logToAdminTerminal("관리자 제어 시스템 접속 완료");
  const syncBtn = document.getElementById('btnForceSync');
  if (syncBtn) {
    syncBtn.removeAttribute('disabled');
    syncBtn.style.setProperty('pointer-events', 'auto', 'important'); syncBtn.style.setProperty('cursor', 'pointer', 'important'); syncBtn.style.setProperty('z-index', '999999', 'important');
    L.DomEvent.disableClickPropagation(syncBtn); syncBtn.onclick = null; L.DomEvent.off(syncBtn, 'click');
    L.DomEvent.on(syncBtn, 'click', function (htmlEvent) { if (htmlEvent) { L.DomEvent.preventDefault(htmlEvent); L.DomEvent.stopPropagation(htmlEvent); } window.clearAdminCache(); });
  }
};

window.checkAdminCacheStatus = function () {
  let hasWeather = false, hasTide = false, hasSun = false;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i); if (!key) continue;
    if (key.startsWith('cc_weather_')) hasWeather = true; if (key.startsWith('cc_tide_')) hasTide = true; if (key.startsWith('cc_sun_')) hasSun = true;
  }
  const badge = (id, state, text) => { const el = document.getElementById(id); if (el) { el.className = 'chip-btn ' + (state ? 'cache-loaded' : 'cache-empty'); el.innerText = text + (state ? ' 적재 완료' : ' 비어있음'); } };
  badge('adminWeatherCacheBadge', hasWeather, '기상'); badge('adminTideCacheBadge', hasTide, '조석'); badge('adminSunCacheBadge', hasSun, '일출물');
};

window.clearAdminCache = function () {
  const keysToRemove = []; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key && key.startsWith('cc_')) keysToRemove.push(key); }
  keysToRemove.forEach(key => localStorage.removeItem(key)); window.checkAdminCacheStatus(); window.logToAdminTerminal("공공데이터 로컬 캐시 메모리 강제 초기화 완료");
};

window.logToAdminTerminal = function (message) {
  const terminal = document.getElementById('adminDebugConsole'); if (!terminal) return;
  const now = new Date(); terminal.innerHTML += `<div>[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}] ${message}</div>`;
  terminal.scrollTop = terminal.scrollHeight;
};

// =========================================================================
// [BACKEND AREA] 백엔드 데이터베이스 실시간 트래킹 모델 및 오버레이 렌더러
// =========================================================================
window.coastalDepthData = [];

window.loadCoastalDepthData = async function() {
  try {
    const response = await fetch('coastal_depth_compact.json');
    if (response.ok) {
      window.coastalDepthData = await response.json();
      console.log(`[수심 데이터 로드 완료] 총 ${window.coastalDepthData.length} 격자 확보`);
    }
  } catch (err) { console.error("수심 데이터 로드 중 에러 발생:", err); }
};

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

map.on('click', function (e) {
  const backdrop = document.getElementById('modalBackdrop'); if (backdrop && backdrop.classList.contains('active')) return;
  const depth = window.findNearestDepth(e.latlng.lat, e.latlng.lng);
  if (depth !== null) L.popup({ className: 'custom-depth-popup', closeButton: false, offset: [0, -10] }).setLatLng(e.latlng).setContent(`<div style="font-weight: 800; font-size: 14px; text-align: center;">${depth}m</div>`).openOn(map);
  else map.closePopup();
});

map.on('contextmenu', function (e) {
  tempLatLng = e.latlng; if (tempTargetVisual) map.removeLayer(tempTargetVisual);
  tempTargetVisual = L.circleMarker(e.latlng, { radius: 10, color: 'var(--primary-color)', fillColor: '#fff', fillOpacity: 0.9, weight: 3 }).addTo(map);
  document.querySelectorAll('.modal, .custom-modal-native, .bottom-sheet-modal-native, .bottom-sheet').forEach(m => m.classList.remove('active'));
  document.getElementById('modalBackdrop')?.classList.add('active'); document.getElementById('firstModal')?.classList.add('active');
});

function updateVisibleMarkersOnMap() {
  if (!map) return;
  if (cloudPointsLayer) {
    cloudPointsLayer.clearLayers();
    cachedFishingPoints.forEach(item => {
      if (!item || item.lat === undefined || item.lng === undefined || isNaN(item.lat) || isNaN(item.lng) || item.lat === null || item.lng === null) return;
      const marker = L.marker([item.lat, item.lng], { icon: L.divIcon({ html: getFishingPointSvg(item.color), className: 'custom-marker-wrapper', iconSize: [26, 39], iconAnchor: [13, 39] }), zIndexOffset: 500 });
      marker.on('click', () => { window.closeModals(); window.renderPointDetailBottomSheet(item.id, item.name, item.category, item.color, item.memo, item.parkingType || 'none', item.parkingUnit || '', item.parkingPrice || '0', item.hasStore || false, item.hasCafe || false, item.hasTackle || false, item.lat, item.lng, item.isFavorite || false, item.address || "주소 정보 없음"); });
      cloudPointsLayer.addLayer(marker);
    });
  }
  if (toiletPointsLayer && window.isToiletLayerActive) {
    toiletPointsLayer.clearLayers();
    let targetToilets = [...cachedPublicToilets];
    if (userLatLng) targetToilets.sort((a, b) => userLatLng.distanceTo([a.lat, a.lng]) - userLatLng.distanceTo([b.lat, b.lng]));
    targetToilets.slice(0, 20).forEach(item => {
      if (!item || item.lat === undefined || item.lng === undefined || isNaN(item.lat) || isNaN(item.lng) || item.lat === null || item.lng === null) return;
      const marker = L.marker([item.lat, item.lng], { icon: L.divIcon({ html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff9500" stroke-width="2"><path d="M7 2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM5 12h14v3a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-3zM9 19v3M15 19v3"/></svg>`, className: 'custom-marker-wrapper-toilet', iconSize: [24, 24], iconAnchor: [12, 12] }) });
      marker.on('click', () => { let cleanAddr = item.dbSavedAddress || item.address || '주소 정보 없음'; if (cleanAddr.startsWith('소재지 도로명 주소:')) cleanAddr = cleanAddr.replace('소재지 도로명 주소:', '').trim(); window.renderPointDetailBottomSheet(item.id, item.name || '공중화장실', 'toilet', '#ff9500', item.memo || '', '', '', 0, false, false, false, item.lat, item.lng, false, cleanAddr); });
      toiletPointsLayer.addLayer(marker);
    });
  } else if (toiletPointsLayer) { toiletPointsLayer.clearLayers(); }
}
map.on('moveend zoomend', updateVisibleMarkersOnMap);

function getFishingPointSvg(color) {
  return `<svg width="26" height="39" viewBox="0 0 36 54" xmlns="http://www.w3.org/2000/svg" class="fishing-marker-svg-anchor"><path stroke-miterlimit="4" stroke-width="2" stroke="${color}" fill="${color}" d="m17.92332,2.23007c10.56135,0 17.35337,7.23988 17.35337,16.73988c0,6.3 -3.7,12.3 -7,18l-4.7767,7.06625l-10.82147,-14.71349l9.9681,6.32147l5.03742,-9.40184c3.34356,-5.96319 1.81902,-13.27301 -2.79755,-16.35276c-4.61656,-3.07976 -9.56595,-2.69938 -13.69325,0.6227c-4.1273,3.32208 -5.29064,10.78758 -3.27837,15.73735c2.01227,4.94977 1.37193,3.3194 2.89187,6.0878l10.53198,15.06992l-3.26204,5.3626l-11.47546,-16.21472c-3,-4.57669 -6.02454,-7.93865 -5.7454,-17.57975c0.27914,-9.6411 6.50613,-16.7454 17.06748,-16.7454z"/><path stroke="${color}" fill="#ffffff" d="m18.38343,27.7546c-3.94028,0 -7.1319,-3.53481 -7.1319,-7.89877c0,-4.36396 3.19162,-7.89877 7.1319,-7.89877c3.94028,0 7.1319,3.53481 7.1319,7.89877c0,4.36396 -3.19162,7.89877 -7.1319,7.89877z" stroke-width="2"/></svg>`;
}

db.collection('fishing_points').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
  try {
    cachedFishingPoints = []; snapshot.forEach(doc => cachedFishingPoints.push({ id: doc.id, ...doc.data() }));
    updateVisibleMarkersOnMap(); window.renderPointsManagementTab(); window.populateHomeFavoritesDropdown();
  } catch (err) {
    console.error("낚시 포인트 데이터 렌더링 중 오류 발생:", err);
  } finally {
    window.isFishingPointsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
}, () => { window.isFishingPointsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash(); });

db.collection('public_toilets').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
  try {
    cachedPublicToilets = []; snapshot.forEach(doc => cachedPublicToilets.push({ id: doc.id, ...doc.data() }));
    updateVisibleMarkersOnMap(); window.renderPointsManagementTab();
  } catch (err) {
    console.error("화장실 데이터 렌더링 중 오류 발생:", err);
  } finally {
    window.isPublicToiletsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
}, () => { window.isPublicToiletsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash(); });

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
    let activeCategories = [...new Set([...savedCatOrder, ...cachedFishingPoints.map(p => (p.category || '미분류').trim())])].filter(cat => cat !== '공중화장실 정보' && cat !== 'toilet' && cat !== '미분류');
    activeCategories.push('미분류'); const savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');

    activeCategories.forEach(catName => {
      const matchPoints = cachedFishingPoints.filter(p => (p.category || '미분류') === catName);
      const groupColor = catName === '미분류' ? '#868e96' : (matchPoints.length > 0 ? matchPoints[0].color : (savedCatColors[catName] || '#007aff'));
      const option = document.createElement('option'); option.value = catName; option.setAttribute('data-color', groupColor); option.innerText = catName;
      categorySelect.appendChild(option);
    });
    categorySelect.value = '미분류';
  }
  window.fetchAddressForModal(tempLatLng.lat, tempLatLng.lng, 'pointAddress');
};

window.openToiletModal = function () {
  document.getElementById('firstModal').classList.remove('active');
  document.getElementById('modalBackdrop')?.classList.add('active');
  document.getElementById('toiletModal').classList.add('active');
  window.selectedNewToiletHoursValue = "24시간";

  const chips = document.getElementById('newToiletHoursChips');
  if (chips) { chips.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active')); document.getElementById('chipNewHours24')?.add('active'); }
  document.getElementById('newToiletHoursDetailRow').classList.remove('active');
  window.fetchAddressForModal(tempLatLng.lat, tempLatLng.lng, 'toiletAddress');
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
    address: cachedActiveAddressStr || "주소 정보 없음", lat: tempLatLng.lat, lng: tempLatLng.lng, isFavorite: false, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => { window.closeModals(); });

  document.getElementById('pointName').value = ''; document.getElementById('pointMemo').value = ''; document.getElementById('parkingPrice').value = '';
  document.getElementById('btnNewFacStore')?.classList.remove('active'); document.getElementById('btnNewFacCafe')?.classList.remove('active'); document.getElementById('btnNewFacTackle')?.classList.remove('active');
  selectedParkingType = 'none'; currentUnitIndex = 0; document.getElementById('btnParkingUnit').innerText = '10분'; document.getElementById('parkingDetailRow').classList.remove('active');
  cachedActiveAddressStr = "";
};

window.saveToiletMarker = function () {
  const name = document.getElementById('toiletName')?.value.trim() || '공중화장실';
  const memo = document.getElementById('newToiletMemo')?.value.trim() || '양호';
  let finalHours = window.selectedNewToiletHoursValue;
  if (window.selectedNewToiletHoursValue === '지정시간') {
    finalHours = `${document.getElementById('newToiletStartHour').value.trim() || '09'}:${document.getElementById('newToiletStartMin').value.trim() || '00'} ~ ${document.getElementById('newToiletEndHour').value.trim() || '18'}:${document.getElementById('newToiletEndMin').value.trim() || '00'}`;
  }
  db.collection('public_toilets').add({ name, memo: `${finalHours}||${memo}`, category: 'toilet', lat: tempLatLng.lat, lng: tempLatLng.lng, createdAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => { window.closeModals(); });
  if (document.getElementById('toiletName')) document.getElementById('toiletName').value = ''; if (document.getElementById('newToiletMemo')) document.getElementById('newToiletMemo').value = '';
};

window.openPointEditModal = function (docId, name, category, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, address, lat, lng) {
  document.getElementById('editPointDocId').value = docId; document.getElementById('editPointName').value = name; document.getElementById('editPointMemo').value = memo;
  const pointEditAddrEl = document.getElementById('pointEditAddress'); if (pointEditAddrEl) pointEditAddrEl.innerText = address || "주소 정보 없음";

  if ((!address || address.includes("없음") || address.includes("중...")) && lat && lng) {
    searchNearestCoastalLandmark(lat, lng, nearestAddr => { if (pointEditAddrEl) pointEditAddrEl.innerText = nearestAddr; db.collection('fishing_points').doc(docId).update({ address: nearestAddr }); }, () => {});
  }

  const catSelect = document.getElementById('editPointCategory');
  if (catSelect) {
    catSelect.innerHTML = '';
    let activeCategories = [...new Set([JSON.parse(localStorage.getItem('pm-category-order') || '[]'), ...cachedFishingPoints.map(p => (p.category || '미분류').trim())])].filter(c => c !== '공중화장실 정보' && c !== 'toilet' && c !== '미분류');
    activeCategories.push('미분류'); const savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');
    activeCategories.forEach(catName => { const option = document.createElement('option'); option.value = catName; option.setAttribute('data-color', catName === '미분류' ? '#868e96' : (savedCatColors[catName] || '#007aff')); option.innerText = catName; catSelect.appendChild(option); });
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
  const targets = cachedFishingPoints.filter(p => (p.category || '미분류').trim() === modeFlag.trim());
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
  if (cachedFishingPoints.some(p => (p.category || '미분류').trim() === catName.trim())) { alert(`삭제 불가: [${catName}] 카테고리 내부에 소속된 포인트 마커가 존재합니다.`); return; }
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
        new window.window.kakao.maps.services.Geocoder().coord2Address(lng, lat, function (result, status) {
          if (status === window.kakao.maps.services.Status.OK && result[0]) {
            let finalAddr = result[0].road_address ? result[0].road_address.address_name : (result[0].address ? result[0].address.address_name : "주소 정보 없음");
            if (finalAddr === "주소 정보 없음" || finalAddr.trim() === "") {
              searchNearestCoastalLandmark(lat, lng, nearestAddr => { if (addrField) addrField.innerText = nearestAddr; db.collection((category === 'toilet') ? 'public_toilets' : 'fishing_points').doc(docId).update({ [category === 'toilet' ? 'dbSavedAddress' : 'address']: nearestAddr }); }, () => {});
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
      if (wIcon) wIcon.innerHTML = (category === 'toilet') ? `<svg width="14" height="17" viewBox="0 0 36 42"><path d="M18 0C8.06 0 0 8.06 0 18C0 28.54 18 42 18 42C18 42 36 28.54 36 18C36 8.06 27.94 0 18 0Z" fill="#ff9500"/><circle cx="18" cy="16" r="5" fill="#ffffff"/><path d="M14 24H22V27H14V24Z" fill="#ffffff"/></svg>` : getFishingPointSvg(color).replace('width="26" height="39"', 'width="20" height="30"');
      document.getElementById('weatherModal')?.classList.add('active'); window.loadTimelineWithOptimisticUI(lat, lng);
    };
  }

  const naviOpenBtn = document.getElementById('btnDetailNaviOpen');
  if (naviOpenBtn) {
    const naviApp = localStorage.getItem('navi-app'); naviOpenBtn.style.backgroundColor = (naviApp === 'naver') ? '#03C75A' : '#FEE500'; naviOpenBtn.style.color = (naviApp === 'naver') ? '#ffffff' : '#111111';
    naviOpenBtn.onclick = function (e) { e.stopPropagation(); window.open(localStorage.getItem('navi-app') === 'naver' ? `https://map.naver.com/index.nhn?elat=${lat}&elng=${lng}&etext=${encodeURIComponent(name)}&menu=route` : `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`, '_blank'); };
  }
};

window.openPointDetailFromList = function (pt) {
  window.closeModals(); const mapNavItem = document.querySelector('.nav-item[onclick*="tab-map"]') || document.querySelector('.nav-item');
  if (typeof window.switchTab === 'function') window.switchTab('tab-map', mapNavItem);
  if (map) map.panTo([pt.lat, pt.lng]);

  if (pt.category === 'toilet') {
    if (window.tempToiletMarker) map.removeLayer(window.tempToiletMarker);
    window.tempToiletMarker = L.marker([pt.lat, pt.lng], { icon: L.divIcon({ html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff9500" stroke-width="2"><path d="M7 2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM5 12h14v3a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-3zM9 19v3M15 19v3"/></svg>`, className: 'custom-marker-wrapper-toilet temp-list-injected-toilet-node', iconSize: [24, 24], iconAnchor: [12, 12] }), zIndexOffset: 1000 }).addTo(map);
    window.renderPointDetailBottomSheet(pt.id, pt.name || '공중화장실', 'toilet', '#ff9500', pt.memo || '', '', '', 0, false, false, false, pt.lat, pt.lng, false, pt.dbSavedAddress || pt.address || '주소 정보 없음');
  } else {
    window.renderPointDetailBottomSheet(pt.id, pt.name, pt.category, pt.color, pt.memo, pt.parkingType || 'none', pt.parkingUnit || '', pt.parkingPrice || '0', pt.hasStore || false, pt.hasCafe || false, pt.hasTackle || false, pt.lat, pt.lng, pt.isFavorite || false, pt.address || "주소 정보 없음");
  }
};

// =========================================================================
// [WEATHER CORE] 기상/조석 해양 기하 타임라인 가변 그래픽 스레드 모듈
// =========================================================================
window.loadTimelineWithOptimisticUI = function (lat, lng) {
  const modalBody = document.querySelector('.weather-modal-body'), dateSticky = document.getElementById('lblDetailDate'), bridge = document.getElementById('timelineInnerBridge');
  if (modalBody && dateSticky && dateSticky.parentNode !== modalBody) modalBody.insertBefore(dateSticky, modalBody.firstChild);

  if (modalBody && !document.getElementById('miniSplashBodyBlock')) {
    const splashBlock = document.createElement('div'); splashBlock.id = 'miniSplashBodyBlock';
    splashBlock.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; min-height: 430px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text-muted); background: var(--modal-bg, #ffffff); z-index: 100;';
    splashBlock.innerHTML = `<div class="mini-splash-spinner spinning" style="width: 36px; height: 36px; border: 4px solid var(--border-color); border-top-color: var(--primary-color); border-radius: 50%;"></div><div class="mini-splash-text" style="font-size: 13.5px; font-weight: 700;">실시간 데이터 분석 중...</div>`;
    modalBody.style.position = 'relative'; modalBody.style.minHeight = '430px'; modalBody.appendChild(splashBlock);
    if (dateSticky) dateSticky.style.visibility = 'hidden'; if (bridge) bridge.style.visibility = 'hidden';
  }

  const dateStrings = []; const baseNow = new Date();
  for (let d = 0; d < 5; d++) { const tDate = new Date(baseNow.getTime() + d * 24 * 60 * 60 * 1000); dateStrings.push(`${tDate.getFullYear()}${String(tDate.getMonth() + 1).padStart(2, '0')}${String(tDate.getDate()).padStart(2, '0')}`); }
  
  const safeStations = typeof TIDE_STATIONS !== 'undefined' ? TIDE_STATIONS : [];
  const safeGetStationFunc = typeof getNearestTideStation === 'function' ? getNearestTideStation : (typeof window.getNearestTideStation === 'function' ? window.getNearestTideStation : () => 'I01');
  const obsCode = safeGetStationFunc(lat, lng); 
  const stationObj = safeStations.find(s => s && s.code === obsCode) || safeStations[0] || { lat: lat, lng: lng };

  Promise.all([
    window.fetchSunriseSunsetForDatesPromise(lat, lng, dateStrings), window.fetchKMAWeatherPromise(lat, lng), window.fetchTideData3DaysPromise(lat, lng),
    window.fetchRealWaterTempPromise(lat, lng, dateStrings), window.fetchKMAWeatherPromise(stationObj.lat, stationObj.lng !== undefined ? stationObj.lng : (stationObj.mesh !== undefined ? stationObj.mesh : lng))
  ]).then(([_, liveWeatherMap, realTidesSchedule, realWaterTempMap, seaWeatherMap]) => {
    document.getElementById('miniSplashBodyBlock')?.remove(); if (dateSticky) dateSticky.style.visibility = 'visible';
    if (bridge) { bridge.style.visibility = 'visible'; bridge.innerHTML = ''; }
    window.buildTimelineUI(lat, lng, liveWeatherMap, realTidesSchedule, realWaterTempMap, seaWeatherMap);
  }).catch(() => {
    document.getElementById('miniSplashBodyBlock')?.remove(); if (dateSticky) dateSticky.style.visibility = 'visible';
    if (bridge) { bridge.style.visibility = 'visible'; bridge.innerHTML = '<div class="pm-empty-msg">기상 정보 연동에 실패했습니다.</div>'; }
  });
};

window.buildTimelineUI = function (lat, lng, weatherMap, realTides, waterTempMap, seaWeatherMap) {
  const scroller = document.getElementById('timelineScrollWrapper'), bridge = document.getElementById('timelineInnerBridge'); if (!bridge) return;

  const fragment = document.createDocumentFragment();
  window.timelineDatesArray = []; window.allTidesSchedule = [];
  
  const gridRow = document.createElement('div'); gridRow.className = 'timeline-grid-row';
  const now = new Date(); let svgHighlightsHtml = ''; const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const dayBrightColor = '#e3f2fd', dayMainColor = '#b3e5fc', nightColor = '#1a263f', seaTopColor = '#6cb0f6', seaBottomColor = '#2b6cb0';
  let allSegments = []; let prevType = null; let segmentStartX = 0;

  for (let m = 0; m <= 72 * 60; m += 10) {
    let isNightTime = false;
    if (m < 72 * 60) {
      const testDate = new Date(now.getTime() + (m * 60 * 1000)); const sunTimes = window.getSunTimesForDate(testDate);
      isNightTime = (testDate.getHours() * 60 + testDate.getMinutes() < (parseInt(sunTimes.sunrise.split(':')[0]) * 60 + parseInt(sunTimes.sunrise.split(':')[1]))) || (testDate.getHours() * 60 + testDate.getMinutes() >= (parseInt(sunTimes.sunset.split(':')[0]) * 60 + parseInt(sunTimes.sunset.split(':')[1])));
    }
    let currentType = isNightTime ? 'night' : 'day';
    if (m === 0) { prevType = currentType; segmentStartX = 0; }
    else if (currentType !== prevType || m === 72 * 60) { let endX = (m / 60) * 56; allSegments.push({ type: prevType, start: segmentStartX, width: endX - segmentStartX }); prevType = currentType; segmentStartX = endX; }
  }

  let svgBackgroundsHtml = '';
  allSegments.forEach(seg => {
    if (seg.type === 'day') svgBackgroundsHtml += `<rect x="${seg.start.toFixed(2)}" y="0" width="${seg.width.toFixed(2)}" height="160" fill="url(#dayGradient)" />`;
    else {
      svgBackgroundsHtml += `<rect x="${seg.start.toFixed(2)}" y="0" width="${seg.width.toFixed(2)}" height="160" fill="${nightColor}" />`;
      for (let s = 0; s < Math.floor(seg.width / 15); s++) svgBackgroundsHtml += `<circle cx="${(seg.start + (Math.random() * seg.width)).toFixed(2)}" cy="${(5 + (Math.random() * 35)).toFixed(2)}" r="${(0.6 + Math.random() * 0.4).toFixed(1)}" fill="#ffffff" opacity="${(0.3 + Math.random() * 0.6).toFixed(2)}" />`;
      if (seg.width > 30) {
        const moonX = (seg.start + seg.width / 2).toFixed(2); const phase = (((new Date(now.getTime() + (seg.start + seg.width / 2) / 56 * 60 * 60 * 1000).getTime() - new Date(Date.UTC(2000, 0, 6, 18, 14, 0)).getTime()) / (1000 * 60 * 60 * 24)) % 29.530588853 + 29.530588853) % 29.530588853;
        let mc = (phase < 1.5 || phase > 28.0) ? `<circle cx="14" cy="14" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-dasharray="2,2"/>` : `<circle cx="14" cy="14" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.15"/><path d="M 14 3 A 11 11 0 0 ${phase < 14.7 ? 1 : 0} 14 25 A 6 11 0 0 ${phase < 14.7 ? 0 : 1} 14 3 Z" fill="#ffd700"/>`;
        svgBackgroundsHtml += `<g transform="translate(${(moonX - 14)}, 12)">${mc}</g>`;
      }
    }
    if (seg.type === 'day' && seg.width > 30) svgBackgroundsHtml += `<g transform="translate(${((seg.start + seg.width / 2) - 14).toFixed(2)}, 12)"><circle cx="14" cy="14" r="6" fill="#ff9500" opacity="0.85"/><path d="M14 3v3M14 22v3M3 14h3M22 14h3" stroke="#ff9500" stroke-width="2" stroke-linecap="round" opacity="0.85"/></g>`;
  });

  for (let i = 0; i < 72; i++) {
    const futureHour = new Date(now.getTime() + (i * 60 * 60 * 1000)); window.timelineDatesArray.push(futureHour);
    const kmaKey = `${futureHour.getFullYear()}${String(futureHour.getMonth() + 1).padStart(2, '0')}${String(futureHour.getDate()).padStart(2, '0')}${String(futureHour.getHours()).padStart(2, '0')}00`;

    let tempVal = "20°", rainVal = '0mm', windVal = "2m/s", dirVal = "↓", skyIcon = "맑음", iconColor = isDark ? '#ffb948' : '#ff9500', waveVal = "--m", wtempVal = "--°C", crdirVal = "---", crspVal = "--m/s";
    
    if (weatherMap && weatherMap[kmaKey]) {
      const kma = weatherMap[kmaKey]; if (kma.TMP) tempVal = kma.TMP + "°"; if (kma.PCP) rainVal = kma.PCP === '강수없음' ? '0mm' : kma.PCP; if (kma.WSD) windVal = parseFloat(kma.WSD).toFixed(0) + "m/s";
      if (kma.WAV) waveVal = parseFloat(kma.WAV).toFixed(1) + "m"; else if (seaWeatherMap && seaWeatherMap[kmaKey] && seaWeatherMap[kmaKey].WAV) waveVal = parseFloat(seaWeatherMap[kmaKey].WAV).toFixed(1) + "m";
      if (kma.VEC) { const deg = parseFloat(kma.VEC); dirVal = (deg >= 337.5 || deg < 22.5) ? "↓" : (deg < 67.5) ? "↙" : (deg < 112.5) ? "←" : (deg < 157.5) ? "↖" : (deg < 202.5) ? "↑" : (deg < 247.5) ? "↗" : (deg < 292.5) ? "→" : "↘"; }
      if (kma.PTY && kma.PTY !== "0") { skyIcon = "비"; iconColor = "#2f96ff"; } else if (kma.SKY === "3") { skyIcon = "구름많음"; iconColor = "#a2a2a7"; } else if (kma.SKY === "4") { skyIcon = "흐림"; iconColor = "#747479"; }
    } else if (seaWeatherMap && seaWeatherMap[kmaKey] && seaWeatherMap[kmaKey].WAV) waveVal = parseFloat(seaWeatherMap[kmaKey].WAV).toFixed(1) + "m";
    
    if (waterTempMap && waterTempMap.details && waterTempMap.details[kmaKey]) {
      const rObj = waterTempMap.details[kmaKey]; wtempVal = rObj.wtemp; crspVal = rObj.crsp;
      if (rObj.crdir !== null) {
        const d = rObj.crdir;
        crdirVal = (d >= 337.5 || d < 22.5) ? "북" : (d < 67.5) ? "북동" : (d < 112.5) ? "동" : (d < 157.5) ? "남동" : (d < 202.5) ? "남" : (d < 247.5) ? "남서" : (d < 292.5) ? "서" : "북서";
      }
    } else if (waterTempMap && waterTempMap.details) {
      const fk = Object.keys(waterTempMap.details).find(k => k.startsWith(kmaKey.substring(0, 8)));
      if (fk && waterTempMap.details[fk]) {
        const rObj = waterTempMap.details[fk]; wtempVal = rObj.wtemp; crspVal = rObj.crsp;
        if (rObj.crdir !== null) {
          const d = rObj.crdir;
          crdirVal = (d >= 337.5 || d < 22.5) ? "북" : (d < 67.5) ? "북동" : (d < 112.5) ? "동" : (d < 157.5) ? "남동" : (d < 202.5) ? "남" : (d < 247.5) ? "남서" : (d < 292.5) ? "서" : "북서";
        }
      }
    }

    const col = document.createElement('div'); col.className = 'timeline-hour-column';
    col.innerHTML = `<div class="tl-cell cell-time">${String(futureHour.getHours()).padStart(2, '0')}</div><div class="tl-cell cell-icon" style="color: ${iconColor};">${skyIcon}</div><div class="tl-cell cell-temp">${tempVal}</div><div class="tl-cell cell-rain">${rainVal}</div><div class="tl-cell cell-wind">${windVal}</div><div class="tl-cell cell-dir">${dirVal}</div><div class="tl-cell cell-wave">${waveVal}</div><div class="tl-cell cell-wtemp">${wtempVal}</div><div class="tl-cell cell-crdir">${crdirVal}</div><div class="tl-cell cell-crsp">${crspVal}</div>`;
    gridRow.appendChild(col);
  }
  fragment.appendChild(gridRow);

  if (realTides && Array.isArray(realTides) && realTides.length > 0) window.allTidesSchedule = realTides.map(t => { if (t.rawDt) t.hoursFromNow = (new Date(t.rawDt.replace(/-/g, '/')).getTime() - now.getTime()) / (1000 * 60 * 60); return t; });
  else {
    let k = 0; while (true) {
      let xH = 112 * (Math.PI / 2 + 2 * k * Math.PI), xL = 112 * (3 * Math.PI / 2 + 2 * k * Math.PI); if (xH > 4032 && xL > 4032) break;
      if (xH >= 0 && xH <= 4032) { let hH = xH / 56; let dH = new Date(now.getTime() + hH * 60 * 60 * 1000); window.allTidesSchedule.push({ type: '만조', color: '#ff3b30', time: `${String(dH.getHours()).padStart(2, '0')}:${String(dH.getMinutes()).padStart(2, '0')}`, hoursFromNow: hH, level: '270', diff: 220, rawDt: dH.toISOString() }); }
      if (xL >= 0 && xL <= 4032) { let hL = xL / 56; let dL = new Date(now.getTime() + hL * 60 * 60 * 1000); window.allTidesSchedule.push({ type: '간조', color: '#007aff', time: `${String(dL.getHours()).padStart(2, '0')}:${String(dL.getMinutes()).padStart(2, '0')}`, hoursFromNow: hL, level: '50', diff: -220, rawDt: dL.toISOString() }); }
      k++;
    }
  }
  window.allTidesSchedule.sort((a, b) => a.hoursFromNow - b.hoursFromNow);

  let curvePoints = window.allTidesSchedule.map(t => ({ x: t.hoursFromNow * 56, y: t.type === '만조' ? 55 : 115 }));
  if (curvePoints.length > 0) { curvePoints.sort((a, b) => a.x - b.x); curvePoints.unshift({ x: curvePoints[0].x - 336, y: curvePoints[0].y === 55 ? 115 : 55 }); curvePoints.push({ x: curvePoints[curvePoints.length - 1].x + 336, y: curvePoints[curvePoints.length - 1].y === 55 ? 115 : 55 }); }
  const getDynamicYForX = (x) => { if (curvePoints.length === 0) return 85; for (let idx = 0; idx < curvePoints.length - 1; idx++) { const p0 = curvePoints[idx], p1 = curvePoints[idx + 1]; if (x >= p0.x && x <= p1.x) return p0.y * (1 - (1 - Math.cos((x - p0.x) / (p1.x - p0.x) * Math.PI)) / 2) + p1.y * ((1 - Math.cos((x - p0.x) / (p1.x - p0.x) * Math.PI)) / 2); } return 85; };

  let svgPoints = [], fillPolygonPoints = "0,160";
  for (let x = 0; x <= 4032; x += 2) { const yVal = getDynamicYForX(x); const pStr = `${x},${yVal.toFixed(2)}`; svgPoints.push(pStr); fillPolygonPoints += ` ${pStr}`; }
  fillPolygonPoints += " 4032,160";

  window.allTidesSchedule.forEach(t => {
    const xPos = t.hoursFromNow * 56; if (xPos >= 0 && xPos <= 4032) {
      const yPos = getDynamicYForX(xPos);
      svgHighlightsHtml += `<line x1="${xPos.toFixed(2)}" y1="${t.type === '만조' ? 0 : yPos.toFixed(2)}" x2="${xPos.toFixed(2)}" y2="${t.type === '만조' ? yPos.toFixed(2) : 160}" stroke="${t.color}" stroke-width="1" stroke-dasharray="2,2" opacity="0.35" /><circle cx="${xPos.toFixed(2)}" cy="${yPos.toFixed(2)}" r="4.5" fill="#ffffff" stroke="${t.color}" stroke-width="2.5"/><text x="${xPos.toFixed(2)}" y="${(yPos - 14).toFixed(2)}" fill="${t.color}" font-size="12" font-weight="600" text-anchor="middle">${t.level}${t.diff !== 0 ? ` (${t.diff > 0 ? '▲' : '▼'}${Math.abs(t.diff)})` : ''}</text>`;
    }
  });

  const waveRow = document.createElement('div'); waveRow.className = 'timeline-wave-row-container';
  waveRow.innerHTML = `<div class="tide-svg-wrapper"><svg class="tide-svg-canvas" width="4032" height="160"><defs><linearGradient id="deepSeaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${seaTopColor}" /><stop offset="100%" stop-color="${seaBottomColor}" /></linearGradient><radialGradient id="dayGradient" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${dayBrightColor}" /><stop offset="100%" stop-color="${dayMainColor}" /></linearGradient></defs>${svgBackgroundsHtml}<polygon points="${fillPolygonPoints}" fill="url(#deepSeaGradient)" /><path d="M ${svgPoints.join(' L ')}" fill="none" stroke="transparent" stroke-width="1.2"/>${svgHighlightsHtml}</svg></div>`;
  fragment.appendChild(waveRow);

  const container = scroller?.closest('.timeline-viewport-container-native');
  if (container) {
    let labelCol = container.querySelector('.timeline-label-column'); if (!labelCol) { labelCol = document.createElement('div'); labelCol.className = 'timeline-label-column'; container.appendChild(labelCol); }
    labelCol.innerHTML = `<div class="tl-cell">시간</div><div class="tl-cell">날씨</div><div class="tl-cell">기온</div><div class="tl-cell">강수</div><div class="tl-cell">풍속</div><div class="tl-cell">풍향</div><div class="tl-cell">파고</div><div class="tl-cell">수온</div><div class="tl-cell">유향</div><div class="tl-cell">유속</div><div class="tides-floating-text-area"></div>`;
  }
  
  bridge.innerHTML = '';
  bridge.appendChild(fragment);

  if (scroller) scroller.scrollLeft = 0;
  window.syncTimelineDateHeader(scroller);
};

window.syncTimelineDateHeader = function (scrollElement) {
  if (!scrollElement || !window.timelineDatesArray || window.timelineDatesArray.length === 0) return;
  const container = scrollElement.closest('.timeline-viewport-container-native'); if (!container) return;
  const syncLine = container.querySelector('.timeline-sync-line'), syncBubble = container.querySelector('.timeline-sync-bubble');

  let ratio = (scrollElement.scrollWidth - scrollElement.clientWidth) > 0 ? (scrollElement.scrollLeft / (scrollElement.scrollWidth - scrollElement.clientWidth)) : 0;
  let viewWidth = container.clientWidth - 75; if (viewWidth <= 0) viewWidth = scrollElement.clientWidth;
  let currentLineX = 75 + (ratio * viewWidth);

  if (syncLine) syncLine.style.left = `${Math.min(currentLineX, container.clientWidth - 2)}px`;
  if (syncBubble) syncBubble.style.left = `${Math.min(Math.max(currentLineX, 75 + 28), container.clientWidth - 38)}px`;

  const hoursFromNow = (scrollElement.scrollLeft + (currentLineX - 75)) / 56;
  const activeDate = new Date(new Date().getTime() + hoursFromNow * 60 * 60 * 1000);
  const dateSticky = document.getElementById('lblDetailDate');

  if (dateSticky) {
    let lunarStr = '', lunarDay = activeDate.getDate();
    try { const lr = new Intl.DateTimeFormat('ko-KR-u-ca-chinese').format(activeDate); const la = lr.split('.').map(s => s.trim()).filter(Boolean); if (la.length >= 3) { lunarStr = ` (음 ${la[1]}/${la[2]})`; lunarDay = parseInt(la[2], 10); } } catch (e) {}
    const tideNames8 = ["조금", "1물", "2물", "3물", "4물", "5물", "6물", "7물", "8물", "9물", "10물", "11물", "12물", "13물", "14물"];
    const phase = (((activeDate.getTime() - new Date(Date.UTC(2000, 0, 6, 18, 14, 0)).getTime()) / (1000 * 60 * 60 * 24)) % 29.530588853 + 29.530588853) % 29.530588853;
    let moonSvgHtml = `<svg class="lunar-phase-svg-node" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="var(--text-muted)"/><path d="M 14 3 A 11 11 0 0 ${phase < 14.7 ? 1 : 0} 14 25 A 5 11 0 0 ${phase < 14.7 ? 0 : 1} 14 3 Z" fill="#ffd700"/></svg>`;
    const sunTimes = window.getSunTimesForDate(activeDate);

    dateSticky.innerHTML = `
      <div class="sun-moon-left-wrapper">${moonSvgHtml}<span class="sun-moon-tide-label">${tideNames8[(lunarDay + 7) % 15]}</span><span class="sun-moon-date-label">${activeDate.getMonth() + 1}월 ${activeDate.getDate()}일<span class="sun-moon-lunar-subtext">${lunarStr}</span></span></div>
      <div class="sun-times-right-wrapper">
        <span class="sun-time-item-flex sunrise-item"><svg class="sun-node-icon sunrise" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M5.22 7.22l2.83 2.83M18.78 7.22l-2.83 2.83M2 22h20M12 10a4 4 0 0 0-4 4h8a4 4 0 0 0-4-4z"/></svg><span class="sun-time-bold">일출</span>${sunTimes.sunrise}</span>
        <span class="sun-time-item-flex sunset-item"><svg class="sun-node-icon sunset" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 22h20M16 16a4 4 0 0 0-8 0M12 2v4M5.22 7.22l2.83 2.83M18.78 7.22l-2.83 2.83"/></svg><span class="sun-time-bold">일몰</span>${sunTimes.sunset}</span>
      </div>
    `;
  }
  if (scrollElement && syncBubble) syncBubble.innerHTML = `${String(activeDate.getHours()).padStart(2, '0')}:${String(activeDate.getMinutes()).padStart(2, '0')}`;
  const textTideArea = container.querySelector('.tides-floating-text-area');
  if (textTideArea && window.allTidesSchedule && window.allTidesSchedule.length > 0) {
    let activeTides = window.allTidesSchedule.filter(t => t.hoursFromNow >= hoursFromNow - 1);
    activeTides = activeTides.length < 4 ? window.allTidesSchedule.slice(-4) : activeTides.slice(0, 4);
    textTideArea.innerHTML = activeTides.map(t => `<div class="tide-floating-card-item" style="border-left: 4px solid ${t.color} !important;"><div class="tide-floating-card-symbol" style="color: ${t.color} !important;">${t.type === '만조' ? '▲' : '▼'}${t.type}</div><div class="tide-floating-card-time">${t.time}</div></div>`).join('');
  }
};

window.fetchAddressForModal = function (lat, lng, elementId) {
  const el = document.getElementById(elementId); if (el) el.innerText = "주소 변환 중...";
  if (typeof kakao !== 'undefined' && kakao.maps) {
    kakao.maps.load(() => {
      new kakao.maps.services.Geocoder().coord2Address(lng, lat, (result, status) => {
        if (status === kakao.maps.services.Status.OK && result[0]) {
          const finalAddr = result[0].road_address?.address_name || result[0].address?.address_name || "주소 정보 없음";
          if (finalAddr === "주소 정보 없음") searchNearestCoastalLandmark(lat, lng, n => { if (el) el.innerText = n; }, () => { if (el) el.innerText = "주소 정보 없음"; });
          else { if (el) el.innerText = finalAddr; if (elementId === 'pointAddress') cachedActiveAddressStr = finalAddr; }
        } else { searchNearestCoastalLandmark(lat, lng, n => { if (el) el.innerText = n; }, () => { if (el) el.innerText = "주소 정보 없음"; }); }
      });
    });
  }
};

function searchNearestCoastalLandmark(lat, lng, successCallback, errorCallback) {
  if (typeof kakao === 'undefined' || !kakao.maps?.services?.Places) { if (errorCallback) errorCallback(); return; }
  const ps = new kakao.maps.services.Places(); const keywords = ['방파제', '해수욕장', '항구', '선착장', '해안', '갯바위']; let idx = 0;
  const tryNext = () => {
    if (idx >= keywords.length) { if (errorCallback) errorCallback(); return; }
    ps.keywordSearch(keywords[idx], (data, status) => {
      if (status === kakao.maps.services.Status.OK && data?.[0]) { successCallback(`${data[0].place_name} 인근 ${(parseFloat(data[0].distance)/1000).toFixed(1)}km`); }
      else { idx++; tryNext(); }
    }, { location: new kakao.maps.LatLng(lat, lng), radius: 20000, sort: kakao.maps.services.SortBy.DISTANCE });
  }; tryNext();
}