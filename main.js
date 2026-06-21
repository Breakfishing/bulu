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

// 모달 디스플레이 강제 제어를 위한 글로벌 스타일 가드
(function() {
  const style = document.createElement('style');
  style.innerHTML = `
    #infoEditModal, #fishingBanModal, #sizeLimitModal, #knotGuideModal, #weatherModal {
      display: none !important;
      z-index: 999999 !important;
    }
    #infoEditModal.active, #fishingBanModal.active, #sizeLimitModal.active, #knotGuideModal.active, #weatherModal.active {
      display: block !important;
    }
    #weatherModal.active {
      display: flex !important;
    }
  `;
  document.head.appendChild(style);
})();

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
  
  const weatherModal = document.getElementById('weatherModal');
  if (weatherModal) {
    weatherModal.classList.remove('active');
    weatherModal.style.setProperty('display', 'none', 'important');
  }

  // 화면 중앙 고정형 상세 정보 모달 인스턴스 제거 및 지도 잠금 해제
  const liveFixedModal = document.getElementById('live-floating-detail-modal');
  if (liveFixedModal) {
    liveFixedModal.remove();
  }

  if (window.mapObj) {
    window.mapObj.closePopup();
    window.mapObj.dragging.enable();
    window.mapObj.touchZoom.enable();
    window.mapObj.scrollWheelZoom.enable();
    window.mapObj.doubleClickZoom.enable();
    if (window.mapObj.boxZoom) window.mapObj.boxZoom.enable();
    if (window.mapObj.keyboard) window.mapObj.keyboard.enable();
  }

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
// [TAB AREA 4] 파이어베이스 실시간 동기화 파이프라인 및 레이어 마커 렌더링
// =========================================================================
db.collection('fishing_points').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
  cachedFishingPoints = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    cachedFishingPoints.push({
      id: doc.id,
      docId: doc.id,
      name: data.name || '',
      title: data.name || '',
      category: data.category || '미분류',
      memo: data.memo || '',
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lng),
      color: data.color || '#007aff',
      isFavorite: data.isFavorite || false,
      favoritedAt: data.favoritedAt || 0,
      parkingType: data.parkingType || 'none',
      parkingUnit: data.parkingUnit || '10분',
      parkingPrice: data.parkingPrice || '0',
      hasStore: data.hasStore || false,
      hasCafe: data.hasCafe || false,
      hasTackle: data.hasTackle || false,
      address: data.address || ''
    });
  });
  
  window.isFishingPointsLoaded = true;
  updateVisibleMarkersOnMap();
  if (document.getElementById('tab-manage')?.classList.contains('active')) {
    window.renderPointsManagementTab();
  }
  window.populateHomeFavoritesDropdown();
}, err => {
  console.error("낚시 포인트 실시간 동기화 실패:", err);
  window.isFishingPointsLoaded = true;
  window.checkAndHideSplash();
});

db.collection('public_toilets').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
  cachedPublicToilets = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    cachedPublicToilets.push({
      id: doc.id,
      docId: doc.id,
      name: data.name || '공중화장실',
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lng),
      address: data.address || '',
      memo: data.memo || '',
      category: 'toilet'
    });
  });

  window.isPublicToiletsLoaded = true;
  updateVisibleMarkersOnMap();
  if (document.getElementById('tab-manage')?.classList.contains('active')) {
    window.renderPointsManagementTab();
  }
  window.checkAndHideSplash();
}, err => {
  console.error("화장실 실시간 동기화 실패:", err);
  window.isPublicToiletsLoaded = true;
  window.checkAndHideSplash();
});

function updateVisibleMarkersOnMap() {
  if (!map) return;
  cloudPointsLayer.clearLayers();
  toiletPointsLayer.clearLayers();

  cachedFishingPoints.forEach(pt => {
    if (!pt.lat || !pt.lng) return;

    const markerHtml = `
      <div class="custom-pin-wrapper" id="map-pin-${pt.id}">
        <div class="custom-pin-body" style="background-color: ${pt.color || '#007aff'};">
          <div class="custom-pin-circle"></div>
        </div>
        <div class="custom-pin-pulse" style="background-color: ${pt.color || '#007aff'};"></div>
        <div class="custom-pin-label-card">${pt.name}</div>
      </div>
    `;

    const customIcon = L.divIcon({
      html: markerHtml,
      className: 'custom-leaflet-div-icon',
      iconSize: [30, 42],
      iconAnchor: [15, 42]
    });

    const marker = L.marker([pt.lat, pt.lng], { icon: customIcon });
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      window.spawnFixedCenterModal(pt);
    });
    cloudPointsLayer.addLayer(marker);
  });

  if (window.isToiletLayerActive) {
    cachedPublicToilets.forEach(t => {
      if (!t.lat || !t.lng) return;

      const toiletHtml = `
        <div class="custom-pin-wrapper toilet-mode" id="map-toilet-pin-${t.id}">
          <div class="custom-pin-body" style="background-color: #ff9500;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 22v-6.5m0 0a1.5 1.5 0 1 0-3 0V22m3-6.5h4m0 0a1.5 1.5 0 1 1 3 0V22m-3-6.5V22M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
            </svg>
          </div>
          <div class="custom-pin-pulse" style="background-color: #ff9500;"></div>
          <div class="custom-pin-label-card">화장실</div>
        </div>
      `;

      const toiletIcon = L.divIcon({
        html: toiletHtml,
        className: 'custom-leaflet-div-icon toilet-icon-adjust',
        iconSize: [26, 36],
        iconAnchor: [13, 36]
      });

      const marker = L.marker([t.lat, t.lng], { icon: toiletIcon });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        window.spawnFixedCenterModal(t);
      });
      toiletPointsLayer.addLayer(marker);
    });
    toiletPointsLayer.addTo(map);
  } else {
    map.removeLayer(toiletPointsLayer);
  }
}


// =========================================================================
// [TAB AREA 5] 화면 중앙 고정형 상세 모달 엔진 및 맵 뷰포트 피드백 시스템
// =========================================================================
window.spawnFixedCenterModal = function (item) {
  window.closeModals();

  if (!map || !item || !item.lat || !item.lng) return;

  // 지도 드래깅 및 모든 상호작용 잠금
  map.dragging.disable();
  map.touchZoom.disable();
  map.scrollWheelZoom.disable();
  map.doubleClickZoom.disable();
  if (map.boxZoom) map.boxZoom.disable();
  if (map.keyboard) map.keyboard.disable();

  // 지도를 먼저 터치 좌표 기준으로 중심 세팅한 뒤, 모달 하단으로 마커 위치 오프셋 피드백 정밀 연산
  map.setView([item.lat, item.lng], map.getZoom(), { animate: false });
  const projectedCenter = map.getSize().divideBy(2);
  const targetMarkerContainerPoint = L.point(projectedCenter.x, projectedCenter.y - 150);
  const calculatedCenterLatLng = map.containerPointToLatLng(targetMarkerContainerPoint);
  map.setView(calculatedCenterLatLng, map.getZoom(), { animate: true, duration: 0.35 });

  const isToilet = (item.category === 'toilet');
  
  const modalDiv = document.createElement('div');
  modalDiv.id = 'live-floating-detail-modal';
  modalDiv.className = 'fixed-viewport-center-detail-card-native active';
  
  // 주차 인프라 및 편의점 텍스트 연산
  let parkingText = "정보 없음";
  if (item.parkingType === 'free') parkingText = "무료 주차 가능";
  else if (item.parkingType === 'paid') {
    parkingText = `유료 주차 (${item.parkingUnit || '10분'}당 ${item.parkingPrice || '0'}원)`;
  } else if (item.parkingType === 'none') {
    parkingText = "주차 불가능 / 공간 없음";
  }

  let facilityBadges = '';
  if (item.hasStore) facilityBadges += `<span class="fd-badge">편의점</span>`;
  if (item.hasCafe) facilityBadges += `<span class="fd-badge">카페</span>`;
  if (item.hasTackle) facilityBadges += `<span class="fd-badge">낚시점</span>`;
  if (!facilityBadges && !isToilet) facilityBadges = `<span class="fd-badge empty">주변 편의시설 없음</span>`;

  modalDiv.innerHTML = `
    <div class="fd-card-header">
      <div class="fd-header-title-block">
        <span class="fd-category-dot" style="background-color: ${isToilet ? '#ff9500' : (item.color || '#007aff')}"></span>
        <h3 class="fd-main-title">${item.name || (isToilet ? '공중화장실' : '지정 포인트')}</h3>
      </div>
      <button type="button" class="fd-close-x-btn" onclick="window.closeModals();">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <div class="fd-card-body-scroll">
      <div class="fd-info-row address">
        <span class="fd-label">위치 주소</span>
        <span class="fd-value">${item.address || '등록된 도로명/지번 주소가 없습니다.'}</span>
      </div>
      
      ${isToilet ? `
        <div class="fd-info-row type-toilet">
          <span class="fd-label">구분</span>
          <span class="fd-value" style="color:#ff9500; font-weight:600;">상시 개방 공중화장실</span>
        </div>
      ` : `
        <div class="fd-info-row parking">
          <span class="fd-label">주차 인프라</span>
          <span class="fd-value">${parkingText}</span>
        </div>
        <div class="fd-info-row facilities">
          <span class="fd-label">편의 시설</span>
          <div class="fd-badge-container">${facilityBadges}</div>
        </div>
      `}

      <div class="fd-info-row memo">
        <span class="fd-label">종합 메모 및 현장 팁</span>
        <div class="fd-memo-box-inside">${item.memo ? item.memo.replace(/\n/g, '<br>') : '현장 리포트 및 안내 메모가 비어 있습니다.'}</div>
      </div>
    </div>
    <div class="fd-card-footer-actions">
      ${isToilet ? '' : `
        <button type="button" class="fd-footer-btn edit-trigger" id="fd-edit-btn-node">정보 수정</button>
      `}
      <button type="button" class="fd-footer-btn close-trigger" onclick="window.closeModals();">확인</button>
    </div>
  `;

  document.body.appendChild(modalDiv);

  const editBtn = modalDiv.querySelector('#fd-edit-btn-node');
  if (editBtn) {
    editBtn.onclick = function() {
      window.openPointEditModal(
        item.id, item.name, item.category, item.memo, item.parkingType,
        item.parkingUnit, item.parkingPrice, item.hasStore, item.hasCafe, item.hasTackle,
        item.address, item.lat, item.lng
      );
    };
  }
};

window.openPointDetailFromList = function (item) {
  if (!item) return;
  window.switchTab('tab-map', document.querySelector('.nav-item[onclick*="tab-map"]'));
  setTimeout(() => {
    window.spawnFixedCenterModal(item);
  }, 150);
};


// =========================================================================
// [TAB AREA 6] 검색 엔지니어링, 역지오코딩 인프라 및 신규 등록 모달 바인딩
// =========================================================================
window.searchLocationKeyword = function () {
  const query = document.getElementById('search-input')?.value?.trim();
  if (!query) return;

  fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`, {
    headers: { 'Authorization': 'KakaoAK 1993cc603348123bf061ff3ca171c7b5' }
  }).then(res => res.json()).then(data => {
    const docs = data?.documents;
    if (docs && docs.length > 0) {
      const first = docs[0];
      const lat = parseFloat(first.y);
      const lng = parseFloat(first.x);
      if (map) {
        map.setView([lat, lng], 15);
        L.popup().setLatLng([lat, lng]).setContent(`<div style="padding:4px; font-weight:600;">${first.place_name}</div>`).openOn(map);
      }
    } else {
      alert('검색 결과가 존재하지 않습니다.');
    }
  }).catch(err => {
    console.error("카카오 로컬 키워드 검색 실패:", err);
  });
};

window.openPointEditModal = function (id, name, cat, memo, pType, pUnit, pPrice, hStore, hCafe, hTackle, addr, lat, lng) {
  window.closeModals();
  const m = document.getElementById('infoEditModal');
  if (!m) return;

  m.setAttribute('data-target-id', id);
  m.setAttribute('data-target-lat', lat);
  m.setAttribute('data-target-lng', lng);

  const nameInput = document.getElementById('edit-point-name');
  const catInput = document.getElementById('edit-point-category');
  const memoInput = document.getElementById('edit-point-memo');
  const addrInput = document.getElementById('edit-point-address');
  
  if (nameInput) nameInput.value = name || '';
  if (catInput) catInput.value = cat || '미분류';
  if (memoInput) memoInput.value = memo || '';
  if (addrInput) addrInput.value = addr || '';

  const pTypeSelect = document.getElementById('edit-parking-type');
  if (pTypeSelect) {
    pTypeSelect.value = pType || 'none';
    const row = document.getElementById('edit-paid-parking-row');
    if (row) row.style.display = pTypeSelect.value === 'paid' ? 'flex' : 'none';
  }

  const pUnitInput = document.getElementById('edit-parking-unit');
  const pPriceInput = document.getElementById('edit-parking-price');
  if (pUnitInput) pUnitInput.value = pUnit || '10분';
  if (pPriceInput) pPriceInput.value = pPrice || '0';

  const chkStore = document.getElementById('edit-facility-store');
  const chkCafe = document.getElementById('edit-facility-cafe');
  const chkTackle = document.getElementById('edit-facility-tackle');
  
  if (chkStore) chkStore.checked = !!hStore;
  if (chkCafe) chkCafe.checked = !!hCafe;
  if (chkTackle) chkTackle.checked = !!hTackle;

  m.classList.add('active');
};

window.toggleEditParkingRow = function (selectEl) {
  if (!selectEl) return;
  const row = document.getElementById('edit-paid-parking-row');
  if (row) row.style.display = selectEl.value === 'paid' ? 'flex' : 'none';
};

window.savePointEditChanges = function () {
  const m = document.getElementById('infoEditModal');
  if (!m) return;
  const id = m.getAttribute('data-target-id');
  if (!id) return;

  const name = document.getElementById('edit-point-name')?.value?.trim();
  const category = document.getElementById('edit-point-category')?.value?.trim() || '미분류';
  const memo = document.getElementById('edit-point-memo')?.value || '';
  const address = document.getElementById('edit-point-address')?.value?.trim() || '';
  const parkingType = document.getElementById('edit-parking-type')?.value || 'none';
  const parkingUnit = document.getElementById('edit-parking-unit')?.value || '10분';
  const parkingPrice = document.getElementById('edit-parking-price')?.value || '0';

  const hasStore = document.getElementById('edit-facility-store')?.checked || false;
  const hasCafe = document.getElementById('edit-facility-cafe')?.checked || false;
  const hasTackle = document.getElementById('edit-facility-tackle')?.checked || false;

  if (!name) { alert('포인트 명칭을 입력해 주세요.'); return; }

  const catColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');
  const targetColor = catColors[category] || '#007aff';

  db.collection('fishing_points').doc(id).update({
    name, category, memo, address, parkingType, parkingUnit, parkingPrice,
    hasStore, hasCafe, hasTackle, color: targetColor
  }).then(() => {
    window.closeModals();
  }).catch(err => {
    console.error("포인트 데이터 수정 실패:", err);
  });
};

window.openMarkerDeleteModal = function (id, collectionName, name) {
  if (confirm(`[${name}] 항목을 정말로 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) {
    db.collection(collectionName).doc(id).delete().then(() => {
      window.closeModals();
    }).catch(err => {
      console.error("데이터 삭제 처리 실패:", err);
    });
  }
};

map.on('contextmenu', function (e) {
  window.closeModals();
  tempLatLng = e.latlng;

  if (tempTargetVisual) { map.removeLayer(tempTargetVisual); }
  tempTargetVisual = L.circleMarker(e.latlng, { radius: 9, color: '#e11d48', fillColor: '#f43f5e', fillOpacity: 0.8, weight: 3, className: 'temp-placement-marker-node' }).addTo(map);

  fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${e.latlng.lng}&y=${e.latlng.lat}`, {
    headers: { 'Authorization': 'KakaoAK 1993cc603348123bf061ff3ca171c7b5' }
  }).then(res => res.json()).then(json => {
    const node = json?.documents?.[0];
    let resolvedAddress = "부산광역시 해안 중심대";
    if (node) {
      resolvedAddress = node.road_address?.address_name || node.address?.address_name || resolvedAddress;
    }
    cachedActiveAddressStr = resolvedAddress;

    const creatorHtml = `
      <div class="custom-native-sheet-creator-inside">
        <h4 style="margin:0 0 10px 0; font-size:14px; font-weight:700;">새로운 포인트 생성</h4>
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px; word-break:break-all;">주소: ${resolvedAddress}</div>
        <div style="display:flex; gap:6px; margin-bottom:8px;">
          <button type="button" class="sheet-sub-btn" onclick="window.triggerDirectMarkerRegistration('fishing_points');" style="flex:1; background:var(--primary-color); color:#ffffff; border:none; padding:9px; border-radius:6px; font-size:12px; font-weight:600;">낚시 포인트 추가</button>
          <button type="button" class="sheet-sub-btn" onclick="window.triggerDirectMarkerRegistration('public_toilets');" style="flex:1; background:#ff9500; color:#ffffff; border:none; padding:9px; border-radius:6px; font-size:12px; font-weight:600;">공중화장실 추가</button>
        </div>
        <button type="button" class="sheet-sub-btn cancel" onclick="window.closeModals();" style="width:100%; background:var(--border-color); color:var(--text-main); border:none; padding:7px; border-radius:6px; font-size:11px;">취소</button>
      </div>
    `;

    const dynamicSheet = document.createElement('div');
    dynamicSheet.id = 'dynamic-creation-bottom-sheet';
    dynamicSheet.className = 'bottom-sheet-modal-native active';
    dynamicSheet.style.position = 'fixed';
    dynamicSheet.style.bottom = '0';
    dynamicSheet.style.left = '0';
    dynamicSheet.style.width = '100%';
    dynamicSheet.style.background = 'var(--bg-card)';
    dynamicSheet.style.borderTopLeftRadius = '16px';
    dynamicSheet.style.borderTopRightRadius = '16px';
    dynamicSheet.style.padding = '16px';
    dynamicSheet.style.boxShadow = '0 -4px 20px rgba(0,0,0,0.15)';
    dynamicSheet.style.zIndex = '100000';
    dynamicSheet.innerHTML = creatorHtml;
    document.body.appendChild(dynamicSheet);
  }).catch(() => {
    cachedActiveAddressStr = "부산광역시 해안 구역";
  });
});

window.triggerDirectMarkerRegistration = function (collectionName) {
  if (!tempLatLng) return;
  const resolvedAddr = cachedActiveAddressStr || "부산광역시 해안선 구역";

  if (collectionName === 'public_toilets') {
    db.collection('public_toilets').add({
      name: "공중화장실",
      lat: tempLatLng.lat,
      lng: tempLatLng.lng,
      address: resolvedAddr,
      memo: "사용자 제보 공중화장실 인프라 정보",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      window.closeModals();
    });
  } else {
    const pName = prompt("새로운 낚시 포인트 이름을 입력해 주세요:", "새로운 포인트");
    if (pName === null) return;
    const finalName = pName.trim() || "무명 포인트";

    db.collection('fishing_points').add({
      name: finalName,
      lat: tempLatLng.lat,
      lng: tempLatLng.lng,
      category: "미분류",
      memo: "새롭게 탐색 및 등록된 필드 포인트",
      address: resolvedAddr,
      parkingType: "none",
      parkingUnit: "10분",
      parkingPrice: "0",
      hasStore: false,
      hasCafe: false,
      hasTackle: false,
      color: "#007aff",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      window.closeModals();
    });
  }
};

