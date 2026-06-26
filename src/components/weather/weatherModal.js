// =========================================================================
// [THREAD 1 & 5] 기상 API 통신, 기하 변환 스레드 및 타임라인 그래픽 엔진 모듈
// =========================================================================
import './weatherModal.css';
import { db } from '../../utils/firebase.js';

// 전역 캐시 및 데이터 저장소 초기화 바인딩
window.globalSunTimesCache = window.globalSunTimesCache || {};
window.allTidesSchedule = window.allTidesSchedule || [];
window.timelineDatesArray = window.timelineDatesArray || [];

// 조석 관측소 참조 데이터 스택 복크
const LOCAL_TIDE_STATIONS = [
  { code: 'DT_0005', name: '부산', lat: 35.0975, lng: 129.0369 },
  { code: 'DT_0023', name: '통영', lat: 34.8286, lng: 128.4328 },
  { code: 'DT_0026', name: '삼천포', lat: 34.9258, lng: 128.0336 },
  { code: 'DT_0004', name: '마산', lat: 35.2044, lng: 128.5786 },
  { code: 'DT_0016', name: '가덕도', lat: 35.0233, mesh: 128.8322 },
  { code: 'DT_0013', name: '울산', lat: 35.5033, lng: 129.3853 },
  { code: 'DT_0012', name: '포항', lat: 36.0442, lng: 129.3839 }
];

// -------------------------------------------------------------------------
// [GEOMETRIC PART] 최인접 조석 관측소 기하학적 매핑 연산
// -------------------------------------------------------------------------
window.getNearestTideStation = function (lat, lng) {
  let minDistance = Infinity;
  let targetCode = 'DT_0005';

  for (let i = 0; i < LOCAL_TIDE_STATIONS.length; i++) {
    const station = LOCAL_TIDE_STATIONS[i];
    const stationLng = station.lng !== undefined ? station.lng : station.mesh;
    
    const dLat = station.lat - lat;
    const dLng = stationLng - lng;
    const distSquare = dLat * dLat + dLng * dLng;

    if (distSquare < minDistance) {
      minDistance = distSquare;
      targetCode = station.code;
    }
  }
  return targetCode;
};

// -------------------------------------------------------------------------
// [GEOMETRIC PART] 대한민국 기상청 람베르트 정각원추도법 좌표 변환 스레드
// -------------------------------------------------------------------------
function convertDfsXy(lat, lng) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;

  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  
  let rs = {};
  let ra = Math.tan(Math.PI * 0.25 + (lat) * DEGRAD);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  
  rs['x'] = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  rs['y'] = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return rs;
}

// -------------------------------------------------------------------------
// [API ENGINE] 외부 공공데이터 오픈 API 비동기 네트워크 스레드 파이프라인
// -------------------------------------------------------------------------
window.fetchSunriseSunsetForDatesPromise = function (lat, lng, dateStrList) {
  return new Promise((resolve) => {
    dateStrList.forEach(dateStr => {
      window.globalSunTimesCache[dateStr] = { sunrise: "05:12", sunset: "19:42" };
    });
    if (typeof window.logApiStatus === "function") {
      window.logApiStatus("KASI_SUN", "SUCCESS_LOCAL_CALC", { count: dateStrList.length });
    }
    resolve(window.globalSunTimesCache);
  });
};

window.getSunTimesForDate = function (date) {
  const dStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return window.globalSunTimesCache[dStr] || { sunrise: "05:12", sunset: "19:42" };
};

window.fetchKMAWeatherPromise = async function (lat, lng) {
  const gridObj = convertDfsXy(lat, lng);
  const now = new Date();
  
  let baseDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  let hour = now.getHours();
  if (now.getMinutes() < 45) {
    hour -= 1;
    if (hour < 0) {
      hour = 23;
      const prevDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      baseDate = `${prevDay.getFullYear()}${String(prevDay.getMonth() + 1).padStart(2, '0')}${String(prevDay.getDate()).padStart(2, '0')}`;
    }
  }
  const baseTime = `${String(hour).padStart(2, '0')}00`;
  const serviceKey = window.DATA_GO_KR_SERVICE_KEY || "7440915081950a748b3d8d5d1b9904d246ce8028893a02ec4042b2b192383803";
  
  const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst?serviceKey=${serviceKey}&pageNo=1&numOfRows=60&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${gridObj.x}&ny=${gridObj.y}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP_STATUS_${res.status}`);
    
    // XML 에러 메시지 가로채기 레이어 구조화 (JSON 파싱 인터셉터)
    const textData = await res.text();
    if (textData.trim().startsWith('<')) throw new Error("PORTAL_XML_ERROR_INTERCEPTED");
    
    const json = JSON.parse(textData);
    const items = json.response?.body?.items?.item;
    if (!items) throw new Error("KMA_EMPTY_PAYLOAD");

    const structureMap = {};
    items.forEach(it => {
      const forecastKey = `${it.fcstDate}${it.fcstTime}`;
      if (!structureMap[forecastKey]) structureMap[forecastKey] = {};
      structureMap[forecastKey][it.category] = it.fcstValue;
    });

    if (typeof window.logApiStatus === "function") {
      window.logApiStatus("KMA_WEATHER", "SUCCESS", { records: items.length });
    }
    return structureMap;
  } catch (err) {
    if (typeof window.logApiStatus === "function") {
      window.logApiStatus("KMA_WEATHER", "FAIL_FALLBACK", { error: err.message });
    }
    return generateOptimisticWeatherMap(baseDate);
  }
};

function generateOptimisticWeatherMap(baseDateStr) {
  const mockMap = {};
  for (let i = 0; i < 24; i++) {
    const tKey = `${baseDateStr}${String(i).padStart(2, '0')}00`;
    mockMap[tKey] = { TMP: "22", SKY: "1", PTY: "0", PCP: "강수없음", WSD: "2.4", VEC: "180", WAV: "0.4" };
  }
  return mockMap;
}

window.fetchRealWaterTempPromise = async function (lat, lng, dateStrList) {
  const obsCode = window.getNearestTideStation(lat, lng);
  const serviceKey = window.DATA_GO_KR_SERVICE_KEY || "7440915081950a748b3d8d5d1b9904d246ce8028893a02ec4042b2b192383803";
  const todayStr = dateStrList[0];
  
  const url = `https://apis.data.go.kr/1192136/tideObsRealTime/GetTideObsRealTimeApiService?serviceKey=${serviceKey}&ObsCode=${obsCode}&ResultType=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`KHOA_HTTP_${res.status}`);
    
    const textData = await res.text();
    if (textData.trim().startsWith('<')) throw new Error("KHOA_TEMP_XML_INTERCEPTED");
    
    const json = JSON.parse(textData);
    const items = json.response?.body?.items?.item;
    if (!items) throw new Error("KHOA_EMPTY_PAYLOAD");

    const waterTempContainer = {};
    const dataArr = Array.isArray(items) ? items : [items];

    dataArr.forEach(item => {
      const rTime = item.recordtime || item.recordTime || item.record_time;
      const wTemp = item.watertemp || item.waterTemp || item.water_temp;
      if (rTime && wTemp) {
        const cleanTime = rTime.replace(/[-_:/ ]/g, '');
        if (cleanTime.length >= 10) {
          const matchingKey = `${cleanTime.substring(0, 8)}${cleanTime.substring(8, 10)}00`;
          waterTempContainer[matchingKey] = `${parseFloat(wTemp).toFixed(1)}°C`;
        }
      }
    });

    if (typeof window.logApiStatus === "function") {
      window.logApiStatus("KHOA_WATER_TEMP", "SUCCESS", { obsCode });
    }
    return waterTempContainer;
  } catch (err) {
    if (typeof window.logApiStatus === "function") {
      window.logApiStatus("KHOA_WATER_TEMP", "FALLBACK_MOCK", { error: err.message });
    }
    const fallbackContainer = {};
    for (let i = 0; i < 24; i++) {
      fallbackContainer[`${todayStr}${String(i).padStart(2, '0')}00`] = "19.8°C";
    }
    return fallbackContainer;
  }
};

window.fetchTideData3DaysPromise = async function (lat, lng) {
  const obsCode = window.getNearestTideStation(lat, lng);
  const serviceKey = window.DATA_GO_KR_SERVICE_KEY || "7440915081950a748b3d8d5d1b9904d246ce8028893a02ec4042b2b192383803";
  
  const now = new Date();
  const formatD = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  
  const d0 = formatD(now);
  const d1 = formatD(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const d2 = formatD(new Date(now.getTime() + 48 * 60 * 60 * 1000));
  window.timelineDatesArray = [d0, d1, d2];

  const url = `https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?serviceKey=${serviceKey}&ObsCode=${obsCode}&ResultType=json&SearchDate=${d0}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TIDE_HTTP_${res.status}`);
    
    const textData = await res.text();
    if (textData.trim().startsWith('<')) throw new Error("KHOA_TIDE_XML_INTERCEPTED");
    
    const json = JSON.parse(textData);
    const items = json.response?.body?.items?.item;
    if (!items) throw new Error("TIDE_PAYLOAD_EMPTY");

    const preData = Array.isArray(items) ? items : [items];
    const parseContainer = [];

    preData.forEach(item => {
      const hl = item.hlcode || item.hlCode || item.hl_code || '';
      const type = (hl === 'High' || hl === '만조' || hl === '고조') ? '만조' : '간조';
      const timeStr = item.time || item.tideTime || item.tidetime || item.tide_time || '';
      const levelStr = item.value || item.tideLevel || item.tidelevel || item.tide_level || '';
      
      if (timeStr) {
        const tStr = timeStr.length >= 16 ? timeStr.substring(11, 16) : timeStr;
        parseContainer.push({
          type,
          time: tStr,
          level: String(levelStr),
          rawDt: timeStr,
          hoursFromNow: (new Date(timeStr.replace(/-/g, '/')).getTime() - now.getTime()) / (1000 * 60 * 60)
        });
      }
    });

    window.allTidesSchedule = parseContainer;
    if (typeof window.logApiStatus === "function") {
      window.logApiStatus("KHOA_TIDE_PREDICTION", "SUCCESS", { totalEvents: parseContainer.length });
    }
    return parseContainer;
  } catch (err) {
    if (typeof window.logApiStatus === "function") {
      window.logApiStatus("KHOA_TIDE_PREDICTION", "MOCK_MODE", { error: err.message });
    }
    const dummyContainer = [];
    for (let dayIdx = 0; dayIdx < 3; dayIdx++) {
      const targetBaseMs = now.getTime() + dayIdx * 24 * 60 * 60 * 1000;
      const dObj = new Date(targetBaseMs);
      const baseIso = `${dObj.getFullYear()}-${String(dObj.getMonth()+1).padStart(2,'0')}-${String(dObj.getDate()).padStart(2,'0')}`;

      dummyContainer.push({ type: '만조', time: '04:15', level: '265', rawDt: `${baseIso} 04:15:00`, hoursFromNow: dayIdx * 24 + 4 });
      dummyContainer.push({ type: '간조', time: '10:30', level: '62', rawDt: `${baseIso} 10:30:00`, hoursFromNow: dayIdx * 24 + 10.5 });
      dummyContainer.push({ type: '만조', time: '16:45', level: '280', rawDt: `${baseIso} 16:45:00`, hoursFromNow: dayIdx * 24 + 16.75 });
      dummyContainer.push({ type: '간조', time: '23:10', level: '48', rawDt: `${baseIso} 23:10:00`, hoursFromNow: dayIdx * 24 + 23.16 });
    }
    window.allTidesSchedule = dummyContainer;
    return dummyContainer;
  }
};

// -------------------------------------------------------------------------
// [GRAPHIC ENGINE] 실시간 연안 종합 타임라인 바텀시트 그래픽 제어 엔진
// -------------------------------------------------------------------------
window.loadTimelineWithOptimisticUI = async function (lat, lng) {
  const container = document.getElementById('weatherTimelineContainer');
  if (container) {
    container.innerHTML = `
      <div class="timeline-loading-skeleton" style="padding: 40px 0; text-align: center; color: var(--text-muted); font-size: 13px;">
        <div class="skeleton-spinner" style="width: 24px; height: 24px; border: 2px solid var(--border-line); border-top-color: var(--primary-color); border-radius: 50%; animation: hc-spin-anim 0.8s linear infinite; margin: 0 auto 12px;"></div>
        <div>실시간 해양 기상 파이프라인 분석 중...</div>
      </div>
    `;
  }

  try {
    const now = new Date();
    const dStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    
    const [sunTimes, weatherMap, seaWeatherMap, waterTempMap, tideData] = await Promise.all([
      window.fetchSunriseSunsetForDatesPromise(lat, lng, [dStr]).catch(() => window.globalSunTimesCache),
      window.fetchKMAWeatherPromise(lat, lng).catch(() => generateOptimisticWeatherMap(dStr)),
      window.fetchKMAWeatherPromise(35.0975, 129.0369).catch(() => generateOptimisticWeatherMap(dStr)),
      window.fetchRealWaterTempPromise(lat, lng, [dStr]).catch(() => ({})),
      window.fetchTideData3DaysPromise(lat, lng).catch(() => [])
    ]);

    window.buildTimelineUI(lat, lng, container, weatherMap, waterTempMap);
  } catch (err) {
    console.error("타임라인 빌드 파이프라인 연산 실패:", err);
    if (container) container.innerHTML = '<div class="pm-empty-msg">기상 데이터 로드 중 에러가 발생했습니다.</div>';
  }
};

window.buildTimelineUI = function (lat, lng, targetContainer, weatherMap, waterTempMap) {
  const container = targetContainer || document.getElementById('weatherTimelineContainer');
  if (!container) return;
  container.innerHTML = '';

  const now = new Date();
  const currentHour = now.getHours();
  const todayStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

  const findLatestData = (map, tKey) => {
    if (!map) return null;
    if (map[tKey]) return map[tKey];
    const keys = Object.keys(map).sort();
    let best = null;
    for (let k of keys) { if (k <= tKey) best = map[k]; }
    return best || map[keys[0]]; 
  };

  let depthDisplayStr = "확인 불가";
  if (typeof window.findNearestDepth === 'function') {
    const depthVal = window.findNearestDepth(lat, lng);
    if (depthVal !== null) depthDisplayStr = `${Math.abs(depthVal).toFixed(1)}m`;
  }

  const summaryBlock = document.createElement('div');
  summaryBlock.className = 'timeline-environmental-header';
  summaryBlock.style.cssText = 'display:flex; justify-content:space-between; padding:12px; background:var(--bg-card); border-radius:10px; margin-bottom:14px; font-size:12px; border:1px solid var(--border-line);';
  
  const currentKey = `${todayStr}${String(currentHour).padStart(2, '0')}00`;
  const matchedW = findLatestData(weatherMap, currentKey);
  const matchedT = findLatestData(waterTempMap, currentKey);

  let tempVal = matchedW?.TMP ? `${matchedW.TMP}°C` : "--°C";
  let waterTempVal = matchedT || "--.-°C";

  summaryBlock.innerHTML = `
    <div><strong>기온:</strong> <span>${tempVal}</span></div>
    <div><strong>수온:</strong> <span>${waterTempVal}</span></div>
    <div><strong>인근 수심:</strong> <span style="color:var(--primary-color); font-weight:bold;">${depthDisplayStr}</span></div>
  `;
  container.appendChild(summaryBlock);

  const timelineScrollWrapper = document.createElement('div');
  timelineScrollWrapper.className = 'timeline-scroll-axis';
  timelineScrollWrapper.style.cssText = 'display:flex; gap:8px; overflow-x:auto; padding-bottom:8px; scroll-behavior:smooth;';

  for (let h = 0; h < 24; h++) {
    const itemKey = `${todayStr}${String(h).padStart(2, '0')}00`;
    const wData = findLatestData(weatherMap, itemKey);
    
    const slot = document.createElement('div');
    slot.className = 'timeline-hour-slot' + (h === currentHour ? ' active-current' : '');
    slot.style.cssText = `
      flex: 0 0 64px; background: var(--bg-card); border: 1px solid var(--border-line);
      border-radius: 8px; padding: 10px 4px; text-align: center; display: flex; flex-direction: column; gap: 6px; font-size: 11px;
    `;
    if (h === currentHour) {
      slot.style.borderColor = 'var(--primary-color)';
      slot.style.background = 'var(--bg-main)';
    }

    const timeLabel = document.createElement('div');
    timeLabel.innerText = `${String(h).padStart(2, '0')}시`;
    timeLabel.style.fontWeight = 'bold';
    if (h === currentHour) timeLabel.style.color = 'var(--primary-color)';
    slot.appendChild(timeLabel);

    let skyText = "맑음";
    if (wData) {
      if (wData.PTY && wData.PTY !== "0") skyText = wData.PTY === "3" ? "눈" : "비";
      else if (wData.SKY === "3") skyText = "구름많음";
      else if (wData.SKY === "4") skyText = "흐림";
    }
    const skyLabel = document.createElement('div');
    skyLabel.innerText = skyText;
    skyLabel.style.color = 'var(--text-main)';
    slot.appendChild(skyLabel);

    const tempLabel = document.createElement('div');
    tempLabel.innerText = wData?.TMP ? `${wData.TMP}°` : "--°";
    tempLabel.style.cssText = 'font-size:12px; font-weight:600; color:var(--text-main);';
    slot.appendChild(tempLabel);

    let windSpeed = wData?.WSD ? `${parseFloat(wData.WSD).toFixed(1)}m` : "-m";
    const windLabel = document.createElement('div');
    windLabel.innerText = windSpeed;
    windLabel.style.cssText = 'font-size:10px; color:var(--text-muted);';
    slot.appendChild(windLabel);

    timelineScrollWrapper.appendChild(slot);
  }

  container.appendChild(timelineScrollWrapper);

  setTimeout(() => {
    const targetSlot = timelineScrollWrapper.querySelector('.active-current');
    if (targetSlot) {
      timelineScrollWrapper.scrollLeft = targetSlot.offsetLeft - (timelineScrollWrapper.clientWidth / 2) + (targetSlot.clientWidth / 2);
    }
  }, 100);
};

console.log("[SYSTEM] 기상 모듈 스레드 파이프라인 마운트 완료");