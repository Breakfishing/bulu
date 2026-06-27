// =========================================================================
// [THREAD 1 & 5] 기상 API 통신, 기하 변환 스레드 및 타임라인 그래픽 엔진 모듈
// =========================================================================
import './weatherModal.css';
import { db } from '../../utils/firebase.js';
import { TIDE_STATIONS } from '../../utils/constants.js';

// 전역 캐시 및 데이터 저장소 초기화 바인딩
window.globalSunTimesCache = window.globalSunTimesCache || {};
window.allTidesSchedule = window.allTidesSchedule || [];
window.timelineDatesArray = window.timelineDatesArray || [];

// 네트워크 중복 호출 방지를 위한 인플라이트 프로미스 레지스트리
window.weatherInFlightPromises = window.weatherInFlightPromises || {};

// 백업본 코어 인증키 상수 선언 및 바인딩
const PUBLIC_PORTAL_KEY = "7440915081950a748b3d8d5d1b9904d246ce8028893a02ec4042b2b192383803";
window.DATA_GO_KR_SERVICE_KEY = PUBLIC_PORTAL_KEY;
const KHOA_API_KEY = PUBLIC_PORTAL_KEY;
const KMA_AUTH_KEY = "RAp21103R7OKdtddNwezzw";

// -------------------------------------------------------------------------
// [GEOMETRIC PART] 최인접 조석 관측소 기하학적 매핑 연산
// -------------------------------------------------------------------------
window.getNearestTideStation = function (lat, lng) {
  let minDistance = Infinity; 
  let nearestStation = TIDE_STATIONS[0];
  TIDE_STATIONS.forEach(station => {
    const stationLng = station.lng !== undefined ? station.lng : station.mesh;
    const dist = Math.sqrt(Math.pow(station.lat - lat, 2) + Math.pow(stationLng - lng, 2));
    if (dist < minDistance) { minDistance = dist; nearestStation = station; }
  });
  return nearestStation.code;
};

// -------------------------------------------------------------------------
// [GEOMETRIC PART] 대한민국 기상청 람베르트 정각원추도법 좌표 변환 스레드
// -------------------------------------------------------------------------
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

window.getSunTimesForDate = function (targetDate) {
  if (!window.globalSunTimesCache) window.globalSunTimesCache = {};
  const key = `${targetDate.getFullYear()}${String(targetDate.getMonth() + 1).padStart(2, '0')}${String(targetDate.getDate()).padStart(2, '0')}`;
  if (window.globalSunTimesCache[key]) return window.globalSunTimesCache[key];
  return { sunrise: `05:${32 + (targetDate.getDate() % 5)}`, sunset: `19:${41 - (targetDate.getDate() % 5)}` };
};

window.getKMABaseDateTime = function () {
  const now = new Date(); 
  const hours = [2, 5, 8, 11, 14, 17, 20, 23]; 
  let ch = now.getHours(), cm = now.getMinutes(), bd = new Date(now.getTime()), bt = "2300", f = false;
  for (let i = hours.length - 1; i >= 0; i--) { 
    if (ch > hours[i] || (ch === hours[i] && cm >= 15)) { 
      bt = String(hours[i]).padStart(2, '0') + "00"; 
      f = true; 
      break; 
    } 
  }
  if (!f) { bd.setDate(bd.getDate() - 1); bt = "2300"; }
  return { baseDate: `${bd.getFullYear()}${String(bd.getMonth() + 1).padStart(2, '0')}${String(bd.getDate()).padStart(2, '0')}`, baseTime: bt };
};

window.fetchSunriseSunsetForDatesPromise = function (lat, lng, dateStrings) {
  if (!window.globalSunTimesCache) window.globalSunTimesCache = {}; 
  const ck = `${lat.toFixed(1)}_${lng.toFixed(1)}`;
  const safeServiceKey = typeof PUBLIC_PORTAL_KEY !== 'undefined' ? PUBLIC_PORTAL_KEY : '';
  return Promise.all(dateStrings.map(ds => {
    try {
      const lData = localStorage.getItem(`cc_sun_${ck}_${ds}`);
      if (lData) { window.globalSunTimesCache[ds] = JSON.parse(lData); return Promise.resolve(); }
    } catch (e) {
      localStorage.removeItem(`cc_sun_${ck}_${ds}`);
    }
    return fetch(`/api-tide/B090041/openapi/service/RiseSetInfoService/getLCRiseSetInfo?latitude=${lat}&longitude=${lng}&locdate=${ds}&ServiceKey=${safeServiceKey}&_type=json`)
      .then(async res => {
        if (!res.ok) return fetch(`https://apis.data.go.kr/B090041/openapi/service/RiseSetInfoService/getLCRiseSetInfo?latitude=${lat}&longitude=${lng}&locdate=${ds}&ServiceKey=${safeServiceKey}&_type=json`);
        return res;
      })
      .then(res => res.json())
      .then(d => {
        const item = d?.response?.body?.items?.item; 
        if (item?.sunrise && item?.sunset) { 
          const ro = { sunrise: `${item.sunrise.trim().substring(0,2)}:${item.sunrise.trim().substring(2,4)}`, sunset: `${item.sunset.trim().substring(0,2)}:${item.sunset.trim().substring(2,4)}` }; 
          window.globalSunTimesCache[ds] = ro; 
          localStorage.setItem(`cc_sun_${ck}_${ds}`, JSON.stringify(ro)); 
        }
      }).catch(() => {});
  }));
};

window.fetchKMAWeatherPromise = function (lat, lng) {
  const grid = window.convertLatLngToGrid(lat, lng); 
  const cacheKey = `cc_weather_v6_${grid.nx}_${grid.ny}`; 
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
  const flightKey = `kma_${grid.nx}_${grid.ny}_${base.baseDate}_${base.baseTime}`;

  if (window.weatherInFlightPromises[flightKey]) {
    safeLogger("KMA_WEATHER", "동일 격자 In-Flight 결합 처리");
    return window.weatherInFlightPromises[flightKey];
  }

  const weatherPromise = fetch(`/api-hub/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst?pageNo=1&numOfRows=2000&dataType=JSON&base_date=${base.baseDate}&base_time=${base.baseTime}&nx=${grid.nx}&ny=${grid.ny}&authKey=${safeAuthKey}`)
    .then(res => res.json())
    .then(json => {
      const wm = {}; 
      const node = json?.response?.body?.items?.item;
      if (!node) {
        safeLogger("KMA_WEATHER", "실패 (데이터 없음)", { code: json?.response?.header?.resultCode });
        return null;
      }
      node.forEach(item => { if (item?.fcstDate && item?.fcstTime) { const k = item.fcstDate + item.fcstTime; if (!wm[k]) wm[k] = {}; wm[k][item.category] = item.fcstValue; } });
      localStorage.setItem(cacheKey, JSON.stringify({ data: wm, timestamp: Date.now() })); 
      safeLogger("KMA_WEATHER", "성공");
      return wm;
    })
    .catch(err => {
      safeLogger("KMA_WEATHER", "에러 발생", { error: err.message });
      return null;
    })
    .finally(() => {
      delete window.weatherInFlightPromises[flightKey];
    });

  window.weatherInFlightPromises[flightKey] = weatherPromise;
  return weatherPromise;
};

window.fetchTideData3DaysPromise = function (lat, lng) {
  const safeGetStationFunc = typeof window.getNearestTideStation === 'function' ? window.getNearestTideStation : () => 'DT_0005';
  const obsCode = safeGetStationFunc(lat, lng); 
  const cacheKey = `cc_tide_v5_${obsCode}`; 
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

  if (window.weatherInFlightPromises[`tide_${obsCode}`]) {
    safeLogger("TIDE_API", "In-Flight 결합 처리");
    return window.weatherInFlightPromises[`tide_${obsCode}`];
  }

  const dates = []; 
  for (let d = 0; d < 5; d++) { 
    const td = new Date(new Date().getTime() + d * 24 * 60 * 60 * 1000); 
    dates.push(`${td.getFullYear()}${String(td.getMonth() + 1).padStart(2, '0')}${String(td.getDate()).padStart(2, '0')}`); 
  }

  const tidePromise = (async () => {
    let items = []; 
    
    // 루프 대기를 제거하고 5일치 조석 스케줄을 동시 병렬 요청(Promise.all)하도록 고속화 정립
    const requests = dates.map(async (sd) => {
      try {
        let res = await fetch(`/api-tide/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?serviceKey=${safeKhoaKey}&type=json&pageNo=1&numOfRows=10&obsCode=${obsCode}&reqDate=${sd}`); 
        if (!res.ok) {
          res = await fetch(`https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?serviceKey=${safeKhoaKey}&type=json&pageNo=1&numOfRows=10&obsCode=${obsCode}&reqDate=${sd}`);
        }
        const json = await res.json(); 
        const node = (json?.body || json?.response?.body)?.items?.item; 
        if (node) {
          return Array.isArray(node) ? node : [node];
        }
      } catch (err) {
        console.error(`[TIDE_API] 날짜별 요청 실패 (${sd}):`, err.message);
      }
      return [];
    });

    const responses = await Promise.all(requests);
    responses.forEach(dayItems => {
      items.push(...dayItems);
    });

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
  })().finally(() => {
    delete window.weatherInFlightPromises[`tide_${obsCode}`];
  });

  window.weatherInFlightPromises[`tide_${obsCode}`] = tidePromise;
  return tidePromise;
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

  const flightKey = `roms_${lat.toFixed(2)}_${lng.toFixed(2)}`;
  if (window.weatherInFlightPromises[flightKey]) {
    safeLogger("ROMS_WATER_TEMP", "In-Flight 결합 처리");
    return window.weatherInFlightPromises[flightKey];
  }
  
  const offset = 0.15; 
  const targetPath = `/1192136/roms/GetRomsApiService?serviceKey=${safePortalKey}&type=json&ymin=${(lat - offset).toFixed(4)}&ymax=${(lat + offset).toFixed(4)}&xmin=${(lng - offset).toFixed(4)}&xmax=${(lng + offset).toFixed(4)}&pageNo=1&numOfRows=300`;

  const romsPromise = fetch(`/api-tide${targetPath}`).then(async res => {
    if (!res.ok) return fetch(`https://apis.data.go.kr${targetPath}`);
    return res;
  }).then(async res => { 
    const text = await res.text(); 
    if (!res.ok || text.includes("Unexpected errors") || text.trim().startsWith("<")) throw new Error(); 
    return JSON.parse(text); 
  }).then(json => {
    const wtm = { details: {} }; 
    const extract = (obj) => { if (Array.isArray(obj)) return obj; if (typeof obj === 'object') { for (const k in obj) { if (Array.isArray(obj[k])) return obj[k]; } for (const k in obj) { const r = extract(obj[k]); if (r?.length) return r; } } return []; };
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
  }).finally(() => {
    delete window.weatherInFlightPromises[flightKey];
  });

  window.weatherInFlightPromises[flightKey] = romsPromise;
  return romsPromise;
};

// -------------------------------------------------------------------------
// [WEATHER CORE] 기상/조석 해양 기하 타임라인 가변 그래픽 스레드 모듈
// -------------------------------------------------------------------------
window.loadTimelineWithOptimisticUI = async function (lat, lng) {
  const modalBody = document.querySelector('.weather-modal-body'), dateSticky = document.getElementById('lblDetailDate'), bridge = document.getElementById('timelineInnerBridge');
  if (modalBody && dateSticky && dateSticky.parentNode !== modalBody) modalBody.insertBefore(dateSticky, modalBody.firstChild);

  if (modalBody && !document.getElementById('miniSplashBodyBlock')) {
    const splashBlock = document.createElement('div'); splashBlock.id = 'miniSplashBodyBlock';
    splashBlock.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; min-height: 430px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text-muted); background: var(--modal-bg, #ffffff); z-index: 100;';
    
    // [교정] 회전 애니메이션(hc-spin-anim) 속성을 인라인 스타일에 직접 주입하여 정상 작동 보장
    splashBlock.innerHTML = `<div class="mini-splash-spinner spinning" style="width: 36px; height: 36px; border: 4px solid var(--border-color); border-top-color: var(--primary-color); border-radius: 50%; animation: hc-spin-anim 0.8s linear infinite;"></div><div class="mini-splash-text" style="font-size: 13.5px; font-weight: 700;">실시간 데이터 분석 중...</div>`;
    
    modalBody.style.position = 'relative'; modalBody.style.minHeight = '430px'; modalBody.appendChild(splashBlock);
    if (dateSticky) dateSticky.style.visibility = 'hidden'; if (bridge) bridge.style.visibility = 'hidden';
  }

  const dateStrings = []; const baseNow = new Date();
  for (let d = 0; d < 5; d++) { const tDate = new Date(baseNow.getTime() + d * 24 * 60 * 60 * 1000); dateStrings.push(`${tDate.getFullYear()}${String(tDate.getMonth() + 1).padStart(2, '0')}${String(tDate.getDate()).padStart(2, '0')}`); }
  
  const safeStations = typeof TIDE_STATIONS !== 'undefined' ? TIDE_STATIONS : [];
  const safeGetStationFunc = typeof window.getNearestTideStation === 'function' ? window.getNearestTideStation : () => 'DT_0005';
  const obsCode = safeGetStationFunc(lat, lng); 
  const stationObj = safeStations.find(s => s && s.code === obsCode) || safeStations[0] || { lat: lat, lng: lng };

  try {
    const [_, liveWeatherMap, realTidesSchedule, realWaterTempMap, seaWeatherMap] = await Promise.all([
      window.fetchSunriseSunsetForDatesPromise(lat, lng, dateStrings),
      window.fetchKMAWeatherPromise(lat, lng),
      window.fetchTideData3DaysPromise(lat, lng),
      window.fetchRealWaterTempPromise(lat, lng, dateStrings),
      window.fetchKMAWeatherPromise(stationObj.lat, stationObj.lng !== undefined ? stationObj.lng : (stationObj.mesh !== undefined ? stationObj.mesh : lng))
    ]);

    document.getElementById('miniSplashBodyBlock')?.remove(); 
    if (dateSticky) dateSticky.style.visibility = 'visible';
    if (bridge) { bridge.style.visibility = 'visible'; bridge.innerHTML = ''; }
    
    window.buildTimelineUI(lat, lng, liveWeatherMap, realTidesSchedule, realWaterTempMap, seaWeatherMap);

    // [중요] 타임라인 UI 렌더링이 완료된 후 전역 스플래시 해제 및 상태 동기화
    window.isWeatherLoaded = true;
    if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();

  } catch (error) {
    console.error("[기상 모듈] 데이터 연동 중 치명적 에러:", error);
    document.getElementById('miniSplashBodyBlock')?.remove(); 
    if (dateSticky) dateSticky.style.visibility = 'visible';
    if (bridge) { bridge.style.visibility = 'visible'; bridge.innerHTML = '<div class="pm-empty-msg">기상 정보 연동에 실패했습니다.</div>'; }
    
    // 에러가 나더라도 스플래시는 걷어내어 앱 전체가 멈추는 것을 방지
    window.isWeatherLoaded = true;
    if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
};

window.buildTimelineUI = function (lat, lng, weatherMap, realTides, waterTempMap, seaWeatherMap) {
  const scroller = document.getElementById('timelineScrollWrapper'), bridge = document.getElementById('timelineInnerBridge'); if (!bridge) return;

  const fragment = document.createDocumentFragment();
  window.timelineDatesArray = []; window.allTidesSchedule = [];
  
  const gridRow = document.createElement('div'); gridRow.className = 'timeline-grid-row';
  const now = new Date(); let svgHighlightsHtml = ''; const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const dayBrightColor = '#e3f2fd', dayMainColor = '#b3e5fc', nightColor = '#0a0f1a', seaTopColor = '#5792cc', seaBottomColor = '#3f86d1';
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
      if (xL >= 0 && xL <= 4032) { let hL = xL / 56; let dL = new Date(now.getTime() + hL * 60 * 60 * 1000); window.allTidesSchedule.push({ type: '간조', color: '#007aff', time: `${String(dH.getHours()).padStart(2, '0')}:${String(dH.getMinutes()).padStart(2, '0')}`, hoursFromNow: hL, level: '50', diff: -220, rawDt: dL.toISOString() }); }
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

console.log("[SYSTEM] 기상 모듈 스레드 파이프라인 마운트 완료");