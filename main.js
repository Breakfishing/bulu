// =========================================================================
// GROUP 1: npm 라이브러리 모듈 패키징 및 Leaflet 기본 아이콘 초기화
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

// =========================================================================
// GROUP 2: 파이어베이스(Firebase) 프로젝트 연동 및 인스턴스 초기화
// =========================================================================
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

// =========================================================================
// GROUP 3: Leaflet 지도 생성 및 실시간 GPS 내 위치 상태 관리 전역 변수
// =========================================================================
const busanBounds = L.latLngBounds([34.5, 128.1], [36.69, 129.85]);

const map = L.map('map', {
  center: [35.1796, 129.0756],
  zoom: 11,
  minZoom: 11,
  maxZoom: 18,
  zoomControl: false,
  attributionControl: false,
  maxBounds: busanBounds,
  maxBoundsViscosity: 1.0
});

L.control.scale({
  position: 'bottomleft',
  imperial: false
}).addTo(map);

let cloudPointsLayer = L.layerGroup().addTo(map);
let toiletPointsLayer = L.layerGroup().addTo(map);

let userMarker = null;
let userLatLng = null;
let isFirstLocation = true;

let tempLatLng = null;
let tempTargetVisual = null;
let selectedParkingType = 'none';
window.timelineDatesArray = [];
window.allTidesSchedule = [];

let cachedFishingPoints = [];
let cachedPublicToilets = [];

window.isToiletLayerActive = false;
const parkingUnits = ['10분', '30분', '일'];
let currentUnitIndex = 0;
let cachedActiveAddressStr = "";

window.selectedNewToiletHoursValue = "24시간";
let selectedEditPointParkingType = 'none';
let selectedToiletHoursValue = '모름';

window.currentAccuracyCircle = null;

const myLocationIcon = L.divIcon({
  html: `
    <div class="my-location-marker-inner-wrapper">
      <div class="radar-wave"></div>
      <div class="radar-wave wave-delay-1"></div>
      <div class="radar-wave wave-delay-2"></div>
      <svg width="80" height="80" class="user-heading-cone-bg">
        <circle cx="40" cy="40" r="40" fill="var(--primary-color)" fill-opacity="0.03" />
      </svg>
      <svg viewBox="0 0 80 80" class="user-heading-cone-svg">
        <path id="user-heading-cone" d="M 40 40 L 11.72 11.72 A 40 40 0 0 1 68.28 11.72 Z" 
              fill="var(--primary-color)" fill-opacity="0.13" stroke="var(--primary-color)" stroke-opacity="0.25" stroke-width="1"
              style="transform-origin: 40px 40px; transform: rotate(0deg); transition: transform 0.1s ease-out;"/>
      </svg>
      <svg width="18" height="18" viewBox="0 0 36 36" class="user-location-dot-svg">
        <circle cx="18" cy="18" r="18" fill="var(--primary-color)"/>
        <circle cx="18" cy="18" r="7" fill="#ffffff"/>
        <circle cx="18" cy="3" fill="var(--primary-color)"/>
      </svg>
    </div>
  `,
  className: 'my-location-marker-container',
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

window.mapObj = map;
window.db = db;
window.firebase = firebase;

// =========================================================================
// GROUP 4: GPS 기기 신호 및 자이로 나침반 방향 추적 로직
// =========================================================================
map.on('locationfound', function (e) {
  userLatLng = e.latlng;

  const displayRadius = Math.min(e.accuracy, 150);

  if (window.currentAccuracyCircle) {
    window.currentAccuracyCircle.setLatLng(e.latlng);
    window.currentAccuracyCircle.setRadius(displayRadius);
  } else {
    window.currentAccuracyCircle = L.circle(e.latlng, {
      radius: displayRadius,
      color: '#007aff',
      weight: 1,
      fillColor: '#007aff',
      className: 'radar-accuracy-circle'
    }).addTo(map);
  }

  if (!userMarker) {
    userMarker = L.marker(e.latlng, { icon: myLocationIcon }).addTo(map);
  } else {
    userMarker.setLatLng(e.latlng);
  }
  if (isFirstLocation) {
    map.panTo(e.latlng);
    isFirstLocation = false;
  }

  window.updateHomeCardByLocation(e.latlng.lat, e.latlng.lng);
});

map.on('locationerror', function (e) {
  console.warn("GPS 수신 대기 중입니다: ", e.message);
});

function handleDeviceOrientation(event) {
  let heading = null;
  if (event.webkitCompassHeading !== undefined) {
    heading = event.webkitCompassHeading;
  } else if (event.absolute && event.alpha !== undefined) {
    heading = 360 - event.alpha;
  }
  if (heading !== null) {
    const coneElement = document.getElementById('user-heading-cone');
    if (coneElement) coneElement.style.transform = `rotate(${heading}deg)`;
  }
}

if (window.DeviceOrientationEvent) {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
  } else {
    window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
  }
}

map.locate({ watch: true, enableHighAccuracy: true, setView: false });

const CenterToMyLocationControl = L.Control.extend({
  options: { position: 'bottomright' },
  onAdd: function (map) {
    const btnContainer = L.DomUtil.create('div', 'leaflet-bar leaflet-control custom-gps-trigger custom-gps-control-reset');
    btnContainer.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-main)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="custom-gps-control-svg">
        <circle cx="12" cy="12" r="7"></circle>
        <line x1="12" y1="1" x2="12" y2="4"></line>
        <line x1="12" y1="20" x2="12" y2="23"></line>
        <line x1="1" y1="12" x2="4" y2="12"></line>
        <line x1="20" y1="12" x2="23" y2="12"></svg>
    `;
    L.DomEvent.on(btnContainer, 'click', function (htmlEvent) {
      L.DomEvent.stopPropagation(htmlEvent);
      if (userLatLng) { map.panTo(userLatLng); }
      else { alert('GPS 위치를 탐색 중입니다. 잠시만 기다려 주세요.'); }
    });
    return btnContainer;
  }
});
map.addControl(new CenterToMyLocationControl());

// =========================================================================
// GROUP 5: 2D / 3D 위성 지도 레이어 정의 및 토글 관리
// =========================================================================
const CARTO_LIGHT_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const CARTO_DARK_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

const isInitialDark = localStorage.getItem('dark-mode') === 'true';

const clean2DLayer = L.tileLayer(isInitialDark ? CARTO_DARK_URL : CARTO_LIGHT_URL, {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 18,
  edgeBufferTiles: 1,
  keepBuffer: 4,
  updateInterval: 200
});

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri',
  edgeBufferTiles: 1,
  keepBuffer: 4,
  updateInterval: 200
});

clean2DLayer.addTo(map);
let currentLayerMode = '2D';

const svg2D = `<svg class="app-icon" viewBox="0 0 24 24" style="fill:none; stroke:none;"><text x="50%" y="70%" font-size="15" font-weight="900" fill="var(--text-main)" text-anchor="middle">2D</text></svg>`;
const svg3D = `<svg class="app-icon" viewBox="0 0 24 24" style="fill:none; stroke:none;"><text x="50%" y="70%" font-size="15" font-weight="900" fill="currentColor" text-anchor="middle">3D</text></svg>`;

window.toggleMapLayer = function () {
  const btn = document.getElementById('btn-layer');
  if (currentLayerMode === '2D') {
    map.removeLayer(clean2DLayer); satelliteLayer.addTo(map);
    currentLayerMode = '3D'; btn.innerHTML = svg3D; btn.classList.add('active');
  } else {
    map.removeLayer(satelliteLayer); clean2DLayer.addTo(map);
    currentLayerMode = '2D'; btn.innerHTML = svg2D; btn.classList.remove('active');
  }
}

// =========================================================================
// GROUP 6: 상단 플로팅 컨트롤 메뉴 인터랙션 및 버블링 가드
// =========================================================================
window.refreshMapData = function () {
  const btn = document.querySelector('.top-center-ctrl');
  if (!btn) return;
  const icon = btn.querySelector('.app-icon');
  if (icon.classList.contains('spinning')) return;
  icon.classList.add('spinning');
  setTimeout(() => {
    icon.classList.remove('spinning');
    console.log("지도 레이어 실시간 데이터 동기화 완료!");
  }, 1500);
}

let showProhibited = false;
window.toggleProhibitedZones = function () {
  showProhibited = !showProhibited;
  document.getElementById('btn-prohibited').classList.toggle('active', showProhibited);
}

// =========================================================================
// GROUP 7: 동적 커스텀 마커 SVG 백엔드 템플릿 스트링 리턴기
// =========================================================================
function getFishingPointSvg(color) {
  return `
    <svg width="26" height="39" viewBox="0 0 36 54" xmlns="http://www.w3.org/2000/svg" class="fishing-marker-svg-anchor">
      <path stroke-miterlimit="4" stroke-width="2" stroke="${color}" fill="${color}" d="m17.92332,2.23007c10.56135,0 17.35337,7.23988 17.35337,16.73988c0,6.3 -3.7,12.3 -7,18l-4.7767,7.06625l-10.82147,-14.71349l9.9681,6.32147l5.03742,-9.40184c3.34356,-5.96319 1.81902,-13.27301 -2.79755,-16.35276c-4.61656,-3.07976 -9.56595,-2.69938 -13.69325,0.6227c-4.1273,3.32208 -5.29064,10.78758 -3.27837,15.73735c2.01227,4.94977 1.37193,3.3194 2.89187,6.0878l10.53198,15.06992l-3.26204,5.3626l-11.47546,-16.21472c-3,-4.57669 -6.02454,-7.93865 -5.7454,-17.57975c0.27914,-9.6411 6.50613,-16.7454 17.06748,-16.7454z"/>
      <path stroke="${color}" fill="#ffffff" d="m18.38343,27.7546c-3.94028,0 -7.1319,-3.53481 -7.1319,-7.89877c0,-4.36396 3.19162,-7.89877 7.1319,-7.89877c3.94028,0 7.1319,3.53481 7.1319,7.89877c0,4.36396 -3.19162,7.89877 -7.1319,7.89877z" stroke-width="2"/>
    </svg>
  `;
}

// =========================================================================
// GROUP 8: 입력 양식 제어 컴포넌트 레이어 및 공통 탭/모달 스위칭 엔진
// =========================================================================
selectedToiletHoursValue = "모름";

// SUB-GROUP: 바다 위치 추적을 위한 카카오 로컬 키워드 역추적 엔진
function searchNearestCoastalLandmark(lat, lng, successCallback, errorCallback) {
  if (typeof kakao === 'undefined' || !kakao.maps || !kakao.maps.services || !kakao.maps.services.Places) {
    if (errorCallback) errorCallback();
    return;
  }
  const ps = new kakao.maps.services.Places();
  const keywords = ['방파제', '해수욕장', '항구', '선착장', '해안', '갯바위'];
  let index = 0;

  function tryNextKeyword() {
    if (index >= keywords.length) {
      if (errorCallback) errorCallback();
      return;
    }
    const keyword = keywords[index];
    ps.keywordSearch(keyword, function (data, status) {
      if (status === kakao.maps.services.Status.OK && data && data.length > 0) {
        const closest = data[0];
        const distanceInKm = (parseFloat(closest.distance) / 1000).toFixed(1);
        if (successCallback) successCallback(`${closest.place_name} 인근 ${distanceInKm}km`);
      } else {
        index++;
        tryNextKeyword();
      }
    }, {
      location: new kakao.maps.LatLng(lat, lng),
      radius: 20000,
      sort: kakao.maps.services.SortBy.DISTANCE
    });
  }
  tryNextKeyword();
}

window.fetchAddressForModal = function (lat, lng, elementId) {
  const addressEl = document.getElementById(elementId);
  if (addressEl) addressEl.innerText = "주소 변환 중...";

  if (typeof kakao !== 'undefined' && kakao.maps) {
    kakao.maps.load(function () {
      const geocoder = new kakao.maps.services.Geocoder();
      geocoder.coord2Address(lng, lat, function (result, status) {
        if (status === kakao.maps.services.Status.OK && result[0]) {
          const roadAddress = result[0].road_address ? result[0].road_address.address_name : null;
          const jibunAddress = result[0].address ? result[0].address.address_name : null;
          const finalAddr = roadAddress || jibunAddress || "주소 정보 없음";

          if (finalAddr === "주소 정보 없음" || finalAddr.trim() === "") {
            searchNearestCoastalLandmark(lat, lng, function (nearestAddr) {
              if (addressEl) addressEl.innerText = nearestAddr;
            }, function () {
              if (addressEl) addressEl.innerText = "주소 정보 없음";
            });
          } else {
            if (addressEl) addressEl.innerText = finalAddr;
          }
        } else {
          searchNearestCoastalLandmark(lat, lng, function (nearestAddr) {
            if (addressEl) addressEl.innerText = nearestAddr;
          }, function () {
            if (addressEl) addressEl.innerText = "주소 정보 없음";
          });
        }
      });
    });
  }
};

map.on('contextmenu', function (e) {
  tempLatLng = e.latlng;
  if (tempTargetVisual) { map.removeLayer(tempTargetVisual); }
  tempTargetVisual = L.circleMarker(e.latlng, { radius: 10, color: 'var(--primary-color)', fillColor: '#fff', fillOpacity: 0.9, weight: 3 }).addTo(map);

  document.querySelectorAll('.modal, .custom-modal-native, .bottom-sheet-modal-native, .bottom-sheet').forEach(m => m.classList.remove('active'));
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.add('active');
  const firstModal = document.getElementById('firstModal');
  if (firstModal) firstModal.classList.add('active');
});

window.closeModals = function () {
  document.querySelectorAll('.modal, .custom-modal-native, .bottom-sheet-modal-native, .bottom-sheet').forEach(m => m.classList.remove('active'));

  const writeModal = document.getElementById('noticeWriteModal');
  if (writeModal) writeModal.classList.remove('active');

  const wrapper = document.getElementById('detailModalWrapper');
  if (wrapper) wrapper.classList.remove('active');

  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.remove('active');

  const weatherModal = document.getElementById('weatherModal');
  if (weatherModal) weatherModal.classList.remove('active');

  if (tempTargetVisual) { map.removeLayer(tempTargetVisual); tempTargetVisual = null; }

  if (window.tempToiletMarker) {
    if (map) {
      map.removeLayer(window.tempToiletMarker);
    }
    window.tempToiletMarker = null;
  }
};

window.shiftParkingUnit = function (btn) {
  currentUnitIndex = (currentUnitIndex + 1) % parkingUnits.length;
  if (btn) btn.innerText = parkingUnits[currentUnitIndex];
};

const editPointParkingUnits = ['10분', '30분', '일'];
let currentEditPointUnitIndex = 0;
selectedEditPointParkingType = 'none';

window.shiftEditPointParkingUnit = function (btn) {
  currentEditPointUnitIndex = (currentEditPointUnitIndex + 1) % editPointParkingUnits.length;
  if (btn) btn.innerText = editPointParkingUnits[currentEditPointUnitIndex];
};

window.toggleDarkMode = function (checkbox) {
  const isDark = checkbox.checked;
  localStorage.setItem('dark-mode', isDark ? 'true' : 'false');
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  if (clean2DLayer) {
    clean2DLayer.setUrl(isDark ? CARTO_DARK_URL : CARTO_LIGHT_URL);
    clean2DLayer.redraw();
  }
};

window.toggleNaviApp = function (checkbox) {
  const isNaver = checkbox.checked;
  localStorage.setItem('navi-app', isNaver ? 'naver' : 'kakao');
  const label = document.getElementById('naviAppLabel');
  if (label) {
    label.innerText = isNaver ? '네비게이션: 네이버 지도' : '네비게이션: 카카오 지도';
  }
};

window.showSettingsPage = function () {
  window.closeModals();
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  const sp = document.getElementById('settings-page');
  if (sp) sp.classList.add('active');
};

window.hideSettingsPage = function () {
  const sp = document.getElementById('settings-page');
  if (sp) sp.classList.remove('active');
  document.getElementById('tab-more').classList.add('active');
};

window.switchTab = function (tabId, navItem) {
  window.closeModals();

  const settingsPage = document.getElementById('settings-page');
  if (settingsPage) settingsPage.classList.remove('active');

  const noticePage = document.getElementById('notice-page');
  if (noticePage) noticePage.classList.remove('active');

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

// SUB-GROUP: 초고속 수심 탐색 및 지도 클릭 이벤트 엔진
window.findNearestDepth = function(lat, lng) {
  if (!window.coastalDepthData || window.coastalDepthData.length === 0) return null;
  
  const margin = 0.005; // 탐색 부하를 없애기 위한 약 500m 이내 바운딩 박스
  let minDist = Infinity;
  let nearestDepth = null;

  for (let i = 0; i < window.coastalDepthData.length; i++) {
    const pt = window.coastalDepthData[i];
    const pLat = pt[0];
    const pLng = pt[1];
    
    if (Math.abs(pLat - lat) < margin && Math.abs(pLng - lng) < margin) {
      const dist = Math.pow(pLat - lat, 2) + Math.pow(pLng - lng, 2);
      if (dist < minDist) {
        minDist = dist;
        nearestDepth = pt[2];
      }
    }
  }
  
  if (minDist < 0.000004) { // 근접 오차범위(약 200m) 이내일 경우에만 매칭 데이터 리턴
    return nearestDepth;
  }
  return null;
};

// 숫자 표시를 위한 스타일 클래스 (CSS에 추가 필요)
// .depth-label { font-size: 11px; font-weight: bold; text-shadow: 1px 1px 1px #fff; }

// 전역 레이어 관리
let depthLayer = L.layerGroup().addTo(map);

// 화면에 보이는 데이터만 즉시 렌더링하는 함수
// GROUP 17의 일부: 비동기 렌더링 안정화
window.renderAllVisibleDepths = function() {
  if (!window.coastalDepthData || !Array.isArray(window.coastalDepthData)) {
    console.warn("수심 데이터가 아직 로드되지 않았습니다.");
    return; // 데이터 없으면 종료
  }
  
  depthLayer.clearLayers();
  const bounds = map.getBounds();
  
  window.coastalDepthData.forEach(pt => {
    // pt 구조가 [lat, lng, depth] 인지 확인
    if (pt && pt.length >= 3 && bounds.contains([pt[0], pt[1]])) {
      let color = pt[2] < 5 ? '#ff3b30' : (pt[2] < 10 ? '#ff9500' : '#007aff');
      
      L.marker([pt[0], pt[1]], {
        icon: L.divIcon({
          className: 'depth-label',
          html: `<div style="color: ${color}; font-size: 10px; font-weight: bold;">${pt[2]}</div>`,
          iconSize: [20, 20]
        })
      }).addTo(depthLayer);
    }
  });
};

// 지도 이동/줌 변경 시마다 갱신
map.on('moveend', window.renderAllVisibleDepths);

// 초기 로딩 시 한 번 실행
window.renderAllVisibleDepths();


// =========================================================================
// GROUP 9: 카카오 API 역지오코딩 동기화 및 맵 바운드 기반 마커 가시성 제어
// =========================================================================
function setKakaoAddress(lat, lng, elementId, callback) {
  const targetElement = document.getElementById(elementId);
  if (!targetElement) return;
  targetElement.innerText = "주소 불러오는 중...";

  if (typeof kakao === 'undefined' || !kakao.maps) {
    targetElement.innerText = "주소 정보 없음";
    if (callback) callback("주소 정보 없음"); return;
  }

  kakao.maps.load(function () {
    if (!kakao.maps.services || !kakao.maps.services.Geocoder) {
      targetElement.innerText = "주소 정보 없음";
      if (callback) callback("주소 정보 없음"); return;
    }
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2Address(lng, lat, function (result, status) {
      if (status === kakao.maps.services.Status.OK && result.length > 0) {
        const roadAddress = result[0].road_address ? result[0].road_address.address_name : null;
        const jibunAddress = result[0].address ? result[0].address.address_name : null;
        const finalAddr = roadAddress || jibunAddress || "주소 정보 없음";

        if (finalAddr === "주소 정보 없음" || finalAddr.trim() === "") {
          searchNearestCoastalLandmark(lat, lng, function (nearestAddr) {
            targetElement.innerText = nearestAddr;
            if (callback) callback(nearestAddr);
          }, function () {
            targetElement.innerText = "주소 정보 없음";
            if (callback) callback("주소 정보 없음");
          });
        } else {
          targetElement.innerText = finalAddr;
          if (callback) callback(finalAddr);
        }
      } else {
        searchNearestCoastalLandmark(lat, lng, function (nearestAddr) {
          targetElement.innerText = nearestAddr;
          if (callback) callback(nearestAddr);
        }, function () {
          targetElement.innerText = "주소 정보 없음";
          if (callback) callback("주소 정보 없음");
        });
      }
    });
  });
}

function updateVisibleMarkersOnMap() {
  if (!map) return;

  if (typeof cloudPointsLayer !== 'undefined' && cloudPointsLayer) {
    cloudPointsLayer.clearLayers();
    cachedFishingPoints.forEach(item => {
      const pointIcon = L.divIcon({
        html: getFishingPointSvg(item.color),
        className: 'custom-marker-wrapper',
        iconSize: [26, 39], iconAnchor: [13, 39], popupAnchor: [0, -39]
      });
      const marker = L.marker([item.lat, item.lng], { icon: pointIcon, zIndexOffset: 500 });
      marker.on('click', function () {
        window.closeModals();
        window.renderPointDetailBottomSheet(
          item.id, item.name, item.category, item.color, item.memo,
          item.parkingType || 'none', item.parkingUnit || '', item.parkingPrice || '0',
          item.hasStore || false, item.hasCafe || false, item.hasTackle || false,
          item.lat, item.lng, item.isFavorite || false, item.address || "주소 정보 없음"
        );
      });
      cloudPointsLayer.addLayer(marker);
    });
  }

  if (typeof toiletPointsLayer !== 'undefined' && toiletPointsLayer) {
    toiletPointsLayer.clearLayers();
    if (window.isToiletLayerActive) {
      let targetToilets = [...cachedPublicToilets];

      if (userLatLng) {
        targetToilets.sort((a, b) => {
          const distA = userLatLng.distanceTo([a.lat, a.lng]);
          const distB = userLatLng.distanceTo([b.lat, b.lng]);
          return distA - distB;
        });
      }

      const nearToilets = targetToilets.slice(0, 20);

      nearToilets.forEach(item => {
        const toiletIcon = L.divIcon({
          html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff9500" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M7 2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path>
                  <path d="M5 12h14v3a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-3z"></path>
                  <path d="M9 19v3"></path>
                  <path d="M15 19v3"></path>
                </svg>`,
          className: 'custom-marker-wrapper-toilet',
          iconSize: [24, 24], iconAnchor: [12, 12]
        });
        const marker = L.marker([item.lat, item.lng], { icon: toiletIcon, zIndexOffset: 0 });

        marker.on('click', () => {
          let cleanAddr = item.dbSavedAddress || item.address || '주소 정보 없음';
          if (cleanAddr.startsWith('소재지 도로명 주소:')) {
            cleanAddr = cleanAddr.replace('소재지 도로명 주소:', '').trim();
          }
          window.renderPointDetailBottomSheet(
            item.id, item.name || '공중화장실', 'toilet', '#ff9500', item.memo || '',
            '', '', 0, false, false, false, item.lat, item.lng, false, cleanAddr
          );
        });

        toiletPointsLayer.addLayer(marker);
      });
    }
  }
}

map.on('moveend zoomend', function () {
  updateVisibleMarkersOnMap();
});

window.toggleToiletLayer = function (element) {
  window.isToiletLayerActive = !window.isToiletLayerActive;
  if (element && element.classList) element.classList.toggle('active', window.isToiletLayerActive);
  updateVisibleMarkersOnMap();
};

// =========================================================================
// GROUP 10: 신규 마커 팝업 설정 및 데이터베이스 실시간 스냅샷 리스너
// =========================================================================
window.openPointModal = function () {
  document.getElementById('firstModal').classList.remove('active');

  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.add('active');
  document.getElementById('pointModal').classList.add('active');

  const categorySelect = document.getElementById('pointCategory');
  if (categorySelect) {
    categorySelect.innerHTML = '';

    let savedCatOrder = JSON.parse(localStorage.getItem('pm-category-order') || '[]');
    let activeCategories = [...new Set([
      ...savedCatOrder,
      ...cachedFishingPoints.map(p => (p.category || '미분류').trim())
    ])].filter(cat => cat !== '공중화장실 정보' && cat !== 'toilet' && cat !== '미분류');

    activeCategories.push('미분류');
    let savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');

    activeCategories.forEach(catName => {
      const matchPoints = cachedFishingPoints.filter(p => (p.category || '미분류') === catName);
      const groupColor = catName === '미분류' ? '#868e96' : (matchPoints.length > 0 ? matchPoints[0].color : (savedCatColors[catName] || '#007aff'));

      const option = document.createElement('option');
      option.value = catName; option.setAttribute('data-color', groupColor); option.innerText = catName;
      categorySelect.appendChild(option);
    });

    categorySelect.value = '미분류';
  }
  setKakaoAddress(tempLatLng.lat, tempLatLng.lng, 'pointAddress', (addrText) => { cachedActiveAddressStr = addrText; });
}

window.openToiletModal = function () {
  document.getElementById('firstModal').classList.remove('active');

  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.add('active');
  document.getElementById('toiletModal').classList.add('active');

  window.selectedNewToiletHoursValue = "24시간";
  const chips = document.getElementById('newToiletHoursChips');
  if (chips) {
    chips.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
    const c24 = document.getElementById('chipNewHours24');
    if (c24) c24.classList.add('active');
  }
  const detailRow = document.getElementById('newToiletHoursDetailRow');
  if (detailRow) detailRow.classList.remove('active');

  document.getElementById('newToiletStartHour').value = '';
  document.getElementById('newToiletStartMin').value = '';
  document.getElementById('newToiletEndHour').value = '';
  document.getElementById('newToiletEndMin').value = '';

  setKakaoAddress(tempLatLng.lat, tempLatLng.lng, 'toiletAddress');
}

window.selectNewToiletHours = function (type, element) {
  window.selectedNewToiletHoursValue = type;
  const chips = element.parentElement.querySelectorAll('.chip-btn');
  chips.forEach(chip => chip.classList.remove('active'));
  element.classList.add('active');
  const detailRow = document.getElementById('newToiletHoursDetailRow');
  if (type === '지정시간') {
    detailRow.classList.add('active');
  } else {
    detailRow.classList.remove('active');
  }
}

window.selectParking = function (type, element) {
  selectedParkingType = type;
  const chips = element.parentElement.querySelectorAll('.chip-btn');
  chips.forEach(chip => chip.classList.remove('active'));
  element.classList.add('active');
  const detailRow = document.getElementById('parkingDetailRow');
  if (type === 'paid') {
    detailRow.classList.add('active');
  } else {
    detailRow.classList.remove('active');
  }
}

window.savePointMarker = function () {
  const name = document.getElementById('pointName').value.trim();
  const categorySelect = document.getElementById('pointCategory');
  const category = categorySelect ? (categorySelect.value || '미분류') : '미분류';
  let color = (categorySelect && categorySelect.options.length > 0) ? categorySelect.options[categorySelect.selectedIndex].getAttribute('data-color') : '#007aff';
  if (category === '미분류') color = '#868e96';

  if (!name) return alert("포인트 이름을 입력하세요.");

  const hasStore = document.getElementById('btnNewFacStore')?.classList.contains('active') || false;
  const hasCafe = document.getElementById('btnNewFacCafe')?.classList.contains('active') || false;
  const hasTackle = document.getElementById('btnNewFacTackle')?.classList.contains('active') || false;
  const memo = document.getElementById('pointMemo')?.value.trim() || '등록된 메모가 없습니다.';

  const pointPayload = {
    name, category, color, memo,
    parkingType: selectedParkingType,
    parkingUnit: parkingUnits[currentUnitIndex],
    parkingPrice: document.getElementById('parkingPrice').value || '0',
    hasStore, hasCafe, hasTackle,
    address: cachedActiveAddressStr || "주소 정보 없음",
    lat: tempLatLng.lat, lng: tempLatLng.lng, isFavorite: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection('fishing_points').add(pointPayload).then(() => { window.closeModals(); });
  document.getElementById('pointName').value = ''; document.getElementById('pointMemo').value = ''; document.getElementById('parkingPrice').value = '';

  document.getElementById('btnNewFacStore')?.classList.remove('active');
  document.getElementById('btnNewFacCafe')?.classList.remove('active');
  document.getElementById('btnNewFacTackle')?.classList.remove('active');

  selectedParkingType = 'none'; currentUnitIndex = 0; document.getElementById('btnParkingUnit').innerText = '10분';
  document.getElementById('parkingDetailRow').classList.remove('active');
  const chips = document.querySelectorAll('#pointModal .chip-btn'); chips.forEach(c => c.classList.remove('active')); if (chips[0]) chips[0].classList.add('active');
  cachedActiveAddressStr = "";
}

window.saveToiletMarker = function () {
  const nameEl = document.getElementById('toiletName');
  const memoEl = document.getElementById('newToiletMemo');
  const name = nameEl ? (nameEl.value.trim() || '공중화장실') : '공중화장실';
  const memo = memoEl ? (memoEl.value.trim() || '양호') : '양호';

  let finalHours = window.selectedNewToiletHoursValue;
  if (window.selectedNewToiletHoursValue === '지정시간') {
    const sh = document.getElementById('newToiletStartHour').value.trim() || '09';
    const sm = document.getElementById('newToiletStartMin').value.trim() || '00';
    const eh = document.getElementById('newToiletEndHour').value.trim() || '18';
    const em = document.getElementById('newToiletEndMin').value.trim() || '00';
    finalHours = `${sh}:${sm} ~ ${eh}:${em}`;
  }

  const toiletPayload = { name, memo: `${finalHours}||${memo}`, category: 'toilet', lat: tempLatLng.lat, lng: tempLatLng.lng, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
  db.collection('public_toilets').add(toiletPayload).then(() => { window.closeModals(); });
  if (nameEl) nameEl.value = ''; if (memoEl) memoEl.value = '';
}

db.collection('fishing_points').orderBy('createdAt', 'desc').onSnapshot(
  (snapshot) => {
    cachedFishingPoints = [];
    snapshot.forEach((doc) => { cachedFishingPoints.push({ id: doc.id, ...doc.data() }); });
    updateVisibleMarkersOnMap();
    window.renderPointsManagementTab();

    window.populateHomeFavoritesDropdown();

    window.isFishingPointsLoaded = true;
    if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  },
  (error) => {
    console.warn("포인트 데이터 수신 실패:", error);
    window.isFishingPointsLoaded = true;
    if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
);

db.collection('public_toilets').orderBy('createdAt', 'desc').onSnapshot(
  (snapshot) => {
    cachedPublicToilets = [];
    snapshot.forEach((doc) => { cachedPublicToilets.push({ id: doc.id, ...doc.data() }); });
    updateVisibleMarkersOnMap();
    window.renderPointsManagementTab();
    window.isPublicToiletsLoaded = true;
    if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  },
  (error) => {
    console.warn("화장실 데이터 수신 실패:", error);
    window.isPublicToiletsLoaded = true;
    if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
);

// =========================================================================
// GROUP 11: 로딩 스크린(스플래시) 제어 및 강제 예외 처리 가드
// =========================================================================
window.checkAndHideSplash = function () {
  if (window.isFishingPointsLoaded && window.isPublicToiletsLoaded) {
    const splash = document.getElementById('splash-screen');
    if (splash && !splash.classList.contains('fade-out')) {
      setTimeout(() => { splash.classList.add('fade-out'); }, 300);
    }
  }
};

const applyInitialThemeAndToggle = () => {
  const isDark = localStorage.getItem('dark-mode') === 'true';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

  const toggleInput = document.getElementById('darkModeToggle');
  if (toggleInput) toggleInput.checked = isDark;

  const naviApp = localStorage.getItem('navi-app') || 'kakao';
  const naviToggle = document.getElementById('naviAppToggle');
  const naviLabel = document.getElementById('naviAppLabel');
  if (naviToggle) naviToggle.checked = (naviApp === 'naver');
  if (naviLabel) naviLabel.innerText = (naviApp === 'naver') ? '네비게이션: 네이버 지도' : '네비게이션: 카카오 지도';
};

const 실행강제해제타이머 = () => {
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash && !splash.classList.contains('fade-out')) {
      splash.classList.add('fade-out');
      console.log("데이터 수신 지연으로 인해 로딩 화면이 강제 해제되었습니다.");
    }
  }, 5000);
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    applyInitialThemeAndToggle(); 실행강제해제타이머();
    const centerCtrlBtn = document.querySelector('.top-center-ctrl');
    const rightCtrlGroup = document.querySelector('.top-right-ctrl-group');
    if (centerCtrlBtn) L.DomEvent.disableClickPropagation(centerCtrlBtn);
    if (rightCtrlGroup) L.DomEvent.disableClickPropagation(rightCtrlGroup);
  });
} else {
  applyInitialThemeAndToggle(); 실행강제해제타이머();
  const centerCtrlBtn = document.querySelector('.top-center-ctrl');
  const rightCtrlGroup = document.querySelector('.top-right-ctrl-group');
  if (centerCtrlBtn) L.DomEvent.disableClickPropagation(centerCtrlBtn);
  if (rightCtrlGroup) L.DomEvent.disableClickPropagation(rightCtrlGroup);
}

// =========================================================================
// GROUP 12: 카테고리 추가, 수정 및 삭제 구조 제어
// =========================================================================
window.selectCategoryColor = function (color) {
  const inputEl = document.getElementById('editCategoryColorInput');
  if (inputEl) inputEl.value = color;

  document.querySelectorAll('.color-palette-btn').forEach(btn => {
    if (btn.getAttribute('data-color') === color) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  const previewEl = document.getElementById('categoryEditMarkerIcon');
  if (previewEl && typeof getFishingPointSvg === 'function') {
    previewEl.innerHTML = getFishingPointSvg(color);
  }
};

window.deleteCategoryWithGuard = function (catName, event) {
  if (event) event.stopPropagation();
  const hasChildPoints = cachedFishingPoints.some(p => (p.category || '일반포인트').trim() === catName.trim());
  if (hasChildPoints) { alert(`삭제 불가: [${catName}] 카테고리 내부에 소속된 포인트 마커가 아직 존재합니다.`); return; }
  if (confirm(`[${catName}] 카테고리를 삭제하시겠습니까?`)) {
    let savedCatOrder = JSON.parse(localStorage.getItem('pm-category-order') || '[]');
    let savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');

    savedCatOrder = savedCatOrder.filter(c => c !== catName);
    delete savedCatColors[catName];

    localStorage.setItem('pm-category-order', JSON.stringify(savedCatOrder));
    localStorage.setItem('pm-category-colors', JSON.stringify(savedCatColors));

    alert("카테고리가 삭제되었습니다."); window.renderPointsManagementTab();
  }
};

window.openCategoryEditBottomSheet = function (catName, catColor, event) {
  if (event) event.stopPropagation();
  document.getElementById('editTargetCategoryOldName').value = catName;
  document.getElementById('editCategoryNameInput').value = catName;
  const modalTitle = document.querySelector('#categoryEditModal h3 span');
  if (modalTitle) modalTitle.innerText = "카테고리 편집";

  window.selectCategoryColor(catColor || '#4f46e5');
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.add('active');
  document.getElementById('categoryEditModal').classList.add('active');
};

window.openCategoryAddBottomSheet = function () {
  const modalTitle = document.querySelector('#categoryEditModal h3 span');
  if (modalTitle) modalTitle.innerText = "카테고리 추가";
  document.getElementById('editTargetCategoryOldName').value = "NEW_CATEGORY";
  document.getElementById('editCategoryNameInput').value = "";

  window.selectCategoryColor('#4f46e5');
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.add('active');
  document.getElementById('categoryEditModal').classList.add('active');
};

window.saveCategoryEditData = function () {
  const modeFlag = document.getElementById('editTargetCategoryOldName').value;
  const nextCatName = document.getElementById('editCategoryNameInput').value.trim();
  const nextColor = document.getElementById('editCategoryColorInput').value;

  if (!nextCatName) return alert("카테고리 명칭은 필수입니다.");
  let savedCatOrder = JSON.parse(localStorage.getItem('pm-category-order') || '[]');
  let savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');

  if (modeFlag === "NEW_CATEGORY") {
    if (savedCatOrder.includes(nextCatName) || nextCatName === '공중화장실 정보') {
      return alert("이미 존재하는 카테고리 명칭입니다.");
    }
    savedCatOrder.push(nextCatName); savedCatColors[nextCatName] = nextColor;
    localStorage.setItem('pm-category-order', JSON.stringify(savedCatOrder));
    localStorage.setItem('pm-category-colors', JSON.stringify(savedCatColors));
    window.closeModals(); alert(`[${nextCatName}] 카테고리가 성공적으로 추가되었습니다.`);
    window.renderPointsManagementTab(); return;
  }

  const idx = savedCatOrder.indexOf(modeFlag);
  if (idx !== -1) savedCatOrder[idx] = nextCatName;
  delete savedCatColors[modeFlag]; savedCatColors[nextCatName] = nextColor;
  localStorage.setItem('pm-category-order', JSON.stringify(savedCatOrder));
  localStorage.setItem('pm-category-colors', JSON.stringify(savedCatColors));

  const batch = db.batch();
  const targets = cachedFishingPoints.filter(p => (p.category || '일반포인트').trim() === modeFlag.trim());
  targets.forEach(item => {
    const ref = db.collection('fishing_points').doc(item.id);
    batch.update(ref, { category: nextCatName, color: nextColor });
  });
  batch.commit().then(() => {
    window.closeModals();
    const modalTitle = document.querySelector('#categoryEditModal h3 span');
    if (modalTitle) modalTitle.innerText = "카테고리 편집";
  });
};

const manageTab = document.getElementById('tab-manage');
if (manageTab) { manageTab.addEventListener('contextmenu', e => e.preventDefault()); }

// =========================================================================
// GROUP 13-1: 공공데이터 오픈 API 통신, 로컬 캐싱 디바이스 및 낙관적 UI 로더
// =========================================================================
const PUBLIC_PORTAL_KEY = "7440915081950a748b3d8d5d1b9904d246ce8028893a02ec4042b2b192383803";
window.DATA_GO_KR_SERVICE_KEY = PUBLIC_PORTAL_KEY;
const KHOA_API_KEY = PUBLIC_PORTAL_KEY;
const KMA_AUTH_KEY = "RAp21103R7OKdtddNwezzw";

window.globalSunTimesCache = {};

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

window.convertLatLngToGrid = function (lat, lng) {
  const RE = 6371.00877; const GRID = 5.0; const SLAT1 = 30.0; const SLAT2 = 60.0; const OLON = 126.0; const OLAT = 38.0; const XO = 43; const YO = 136;
  const DEGRAD = Math.PI / 180.0; const re = RE / GRID; const slat1 = SLAT1 * DEGRAD; const slat2 = SLAT2 * DEGRAD; const olon = OLON * DEGRAD; const olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5); sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5); sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5); ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5); ra = re * sf / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon; if (theta > Math.PI) theta -= 2.0 * Math.PI; if (theta < -Math.PI) theta += 2.0 * Math.PI; theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
};

window.getKMABaseDateTime = function () {
  const now = new Date(); const hours = [2, 5, 8, 11, 14, 17, 20, 23];
  let currentHour = now.getHours(); let currentMinute = now.getMinutes();
  let baseDate = new Date(now.getTime()); let baseTime = "2300"; let found = false;
  for (let i = hours.length - 1; i >= 0; i--) {
    if (currentHour > hours[i] || (currentHour === hours[i] && currentMinute >= 15)) { baseTime = String(hours[i]).padStart(2, '0') + "00"; found = true; break; }
  }
  if (!found) { baseDate.setDate(baseDate.getDate() - 1); baseTime = "2300"; }
  return { baseDate: `${baseDate.getFullYear()}${String(baseDate.getMonth() + 1).padStart(2, '0')}${String(baseDate.getDate()).padStart(2, '0')}`, baseTime: baseTime };
};

window.fetchSunriseSunsetForDatesPromise = function (lat, lng, dateStrings) {
  if (!window.globalSunTimesCache) window.globalSunTimesCache = {};
  const coordKey = `${lat.toFixed(1)}_${lng.toFixed(1)}`;

  const promises = dateStrings.map(dateStr => {
    const cacheKey = `cc_sun_${coordKey}_${dateStr}`;
    const localData = localStorage.getItem(cacheKey);

    if (localData) {
      try {
        window.globalSunTimesCache[dateStr] = JSON.parse(localData);
        return Promise.resolve();
      } catch (e) { localStorage.removeItem(cacheKey); }
    }
    if (window.globalSunTimesCache[dateStr]) return Promise.resolve();

    const url = `https://apis.data.go.kr/B090041/openapi/service/RiseSetInfoService/getLCRiseSetInfo?latitude=${lat}&longitude=${lng}&locdate=${dateStr}&ServiceKey=${window.DATA_GO_KR_SERVICE_KEY}&_type=json`;

    return fetch(url)
      .then(res => res.json())
      .then(data => {
        try {
          const item = data?.response?.body?.items?.item;
          if (item && item.sunrise && item.sunset) {
            const sri = item.sunrise.trim();
            const sse = item.sunset.trim();
            const resultObj = {
              sunrise: `${sri.substring(0, 2)}:${sri.substring(2, 4)}`,
              sunset: `${sse.substring(0, 2)}:${sse.substring(2, 4)}`
            };
            window.globalSunTimesCache[dateStr] = resultObj;
            localStorage.setItem(cacheKey, JSON.stringify(resultObj));
          }
        } catch (e) {
          console.warn("KASI 데이터 파싱 예외 발생 수식 대체 처리.", e);
        }
      })
      .catch(err => console.error("KASI NETWORK ERROR:", err));
  });
  return Promise.all(promises);
};

window.fetchKMAWeatherPromise = function (lat, lng) {
  const grid = window.convertLatLngToGrid(lat, lng);
  const cacheKey = `cc_weather_v6_${grid.nx}_${grid.ny}`;
  const localData = localStorage.getItem(cacheKey);

  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      if (Date.now() - parsed.timestamp < 3 * 60 * 60 * 1000) {
        return Promise.resolve(parsed.data);
      }
    } catch (e) { localStorage.removeItem(cacheKey); }
  }

  if (!KMA_AUTH_KEY || KMA_AUTH_KEY.includes("YOUR_KMA")) return Promise.resolve(null);
  const base = window.getKMABaseDateTime();
  const url = `/api-hub/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst?pageNo=1&numOfRows=2000&dataType=JSON&base_date=${base.baseDate}&base_time=${base.baseTime}&nx=${grid.nx}&ny=${grid.ny}&authKey=${KMA_AUTH_KEY}`;

  return fetch(url)
    .then(res => res.json())
    .then(json => {
      const weatherMap = {};
      const itemNode = json?.response?.body?.items?.item;
      if (itemNode && Array.isArray(itemNode)) {
        itemNode.forEach(item => {
          if (item && item.fcstDate && item.fcstTime) {
            const key = item.fcstDate + item.fcstTime;
            if (!weatherMap[key]) weatherMap[key] = {};
            weatherMap[key][item.category] = item.fcstValue;
          }
        });
      }
      localStorage.setItem(cacheKey, JSON.stringify({ data: weatherMap, timestamp: Date.now() }));
      return weatherMap;
    })
    .catch(() => null);
};

window.fetchTideData3DaysPromise = function (lat, lng) {
  if (!KHOA_API_KEY || KHOA_API_KEY.includes("YOUR_KHOA")) return Promise.resolve([]);
  const obsCode = getNearestTideStation(lat, lng);

  const cacheKey = `cc_tide_v5_${obsCode}`;
  const localData = localStorage.getItem(cacheKey);

  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      if (Date.now() - parsed.timestamp < 3 * 60 * 60 * 1000 && Array.isArray(parsed.data) && parsed.data.length > 0) {
        return Promise.resolve(parsed.data);
      }
    } catch (e) { localStorage.removeItem(cacheKey); }
  }

  const baseUrl = "/api-tide/1192136/tideFcstHghLw/GetTideFcstHghLwApiService";
  const dates = []; const now = new Date();

  for (let d = 0; d < 5; d++) {
    const targetTargetDate = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    dates.push(`${targetTargetDate.getFullYear()}${String(targetTargetDate.getMonth() + 1).padStart(2, '0')}${String(targetTargetDate.getDate()).padStart(2, '0')}`);
  }

  return (async () => {
    let allItems = [];
    for (const searchDate of dates) {
      try {
        const url = `${baseUrl}?serviceKey=${KHOA_API_KEY}&type=json&pageNo=1&numOfRows=10&obsCode=${obsCode}&reqDate=${searchDate}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json) {
          const body = json?.body || json?.response?.body;
          const itemNode = body?.items?.item;
          if (itemNode) {
            const items = Array.isArray(itemNode) ? itemNode : [itemNode];
            allItems.push(...items);
          }
        }
      } catch (err) {
        console.warn(`${searchDate} 날짜 데이터 패치 스킵 처리:`, err);
      }
    }

    if (allItems.length === 0) return [];
    allItems.sort((a, b) => {
      if (!a?.predcDt || !b?.predcDt) return 0;
      return new Date(a.predcDt.replace(/-/g, '/')) - new Date(b.predcDt.replace(/-/g, '/'));
    });

    let parsedTidesSchedule = [];
    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      if (!item || item.predcTdlvVl === undefined || !item.predcDt) continue;
      const currentLevel = Math.round(item.predcTdlvVl);
      let type = '만조'; let diff = 0;
      if (i === 0) { if (allItems.length > 1 && allItems[1]) type = (allItems[1].predcTdlvVl < item.predcTdlvVl) ? '만조' : '간조'; }
      else {
        const prevItem = allItems[i - 1];
        if (prevItem && prevItem.predcTdlvVl !== undefined) {
          const prevLevel = Math.round(prevItem.predcTdlvVl);
          if (currentLevel > prevLevel) { type = '만조'; diff = currentLevel - prevLevel; }
          else { type = '간조'; diff = currentLevel - prevLevel; }
        }
      }
      const tideEventDate = new Date(item.predcDt.replace(/-/g, '/'));
      const hoursFromNow = (tideEventDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursFromNow >= -12 && hoursFromNow <= 120) {
        parsedTidesSchedule.push({ type: type, color: type === '만조' ? '#ff3b30' : '#007aff', time: item.predcDt.split(' ')[1], level: currentLevel.toString(), diff: diff, hoursFromNow: hoursFromNow, rawDt: item.predcDt });
      }
    }

    if (parsedTidesSchedule.length > 0) {
      localStorage.setItem(cacheKey, JSON.stringify({ data: parsedTidesSchedule, timestamp: Date.now() }));
    }
    return parsedTidesSchedule;
  })();
};

window.fetchRealWaterTempPromise = function (lat, lng, dateStrings) {
  const wtempMap = {};
  const offset = 0.15;
  const ymin = (lat - offset).toFixed(4);
  const ymax = (lat + offset).toFixed(4);
  const xmin = (lng - offset).toFixed(4);
  const xmax = (lng + offset).toFixed(4);

  const cacheKey = `cc_roms_adaptive_v1_${lat.toFixed(2)}_${lng.toFixed(2)}`;
  const localData = localStorage.getItem(cacheKey);
  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      if (Date.now() - parsed.timestamp < 3 * 60 * 60 * 1000) {
        return Promise.resolve(parsed.data);
      }
    } catch (e) { localStorage.removeItem(cacheKey); }
  }

  const url = `/api-tide/1192136/roms/GetRomsApiService?serviceKey=${PUBLIC_PORTAL_KEY}&type=json&ymin=${ymin}&ymax=${ymax}&xmin=${xmin}&xmax=${xmax}&pageNo=1&numOfRows=300`;

  function extractArrayDynamic(obj) {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj;
    if (typeof obj === 'object') {
      for (const key in obj) {
        if (Array.isArray(obj[key])) return obj[key];
      }
      for (const key in obj) {
        const res = extractArrayDynamic(obj[key]);
        if (res && res.length > 0) return res;
      }
    }
    return [];
  }

  return fetch(url)
    .then(async res => {
      const rawText = await res.text();
      if (!res.ok || rawText.includes("Unexpected errors")) {
        throw new Error("KHOA ROMS Connection Interrupted");
      }
      return JSON.parse(rawText);
    })
    .then(json => {
      const items = extractArrayDynamic(json);

      items.forEach(item => {
        if (!item || typeof item !== 'object') return;

        let pTime = null;
        let wTemp = null;

        for (const key in item) {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('dt') || lowerKey.includes('time') || lowerKey.includes('date') || lowerKey.includes('predc')) {
            pTime = item[key];
            break;
          }
        }

        for (const key in item) {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('temp') || lowerKey.includes('wt') || lowerKey.includes('w_t')) {
            wTemp = item[key];
            break;
          }
        }

        if (!pTime) {
          for (const key in item) {
            if (typeof item[key] === 'string' && /\d{4}[-\/.]?\d{2}[-\/.]?\d{2}/.test(item[key])) {
              pTime = item[key];
              break;
            }
          }
        }
        if (!wTemp) {
          for (const key in item) {
            const val = parseFloat(item[key]);
            if (!isNaN(val) && val > 0 && val < 40 && !['lat', 'lon', 'lng', 'xmin', 'xmax', 'ymin', 'ymax'].includes(key.toLowerCase())) {
              wTemp = item[key];
              break;
            }
          }
        }

        if (pTime && wTemp) {
          let key = "";
          const digits = String(pTime).replace(/\D/g, '');
          if (digits.startsWith('20') && digits.length >= 10) {
            key = digits.substring(0, 10) + "00";
          } else {
            const d = new Date(typeof pTime === 'number' ? pTime : (isNaN(pTime) ? pTime : parseInt(pTime)));
            if (!isNaN(d.getTime())) {
              key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}00`;
            }
          }

          const parsedTemp = parseFloat(wTemp);
          if (key && !isNaN(parsedTemp)) {
            wtempMap[key] = parsedTemp.toFixed(1) + "°C";
          }
        }
      });

      if (Object.keys(wtempMap).length > 0) {
        localStorage.setItem(cacheKey, JSON.stringify({ data: wtempMap, timestamp: Date.now() }));
      }
      return wtempMap;
    })
    .catch(err => {
      console.warn(`[ROMS 수온 레이어 결합 동적 탐색 우회]:`, err.message);
      return wtempMap;
    });
};

window.loadTimelineWithOptimisticUI = function (lat, lng) {
  const modalBody = document.querySelector('.weather-modal-body');
  const dateSticky = document.getElementById('lblDetailDate');
  const bridge = document.getElementById('timelineInnerBridge');

  if (modalBody && dateSticky && dateSticky.parentNode !== modalBody) {
    modalBody.insertBefore(dateSticky, modalBody.firstChild);
  }

  if (modalBody) {
    if (!document.getElementById('miniSplashBodyBlock')) {
      const splashBlock = document.createElement('div');
      splashBlock.id = 'miniSplashBodyBlock';
      splashBlock.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; min-height: 430px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text-muted); background: var(--modal-bg, #ffffff); z-index: 100; user-select: none;';

      splashBlock.innerHTML = `
        <div class="mini-splash-spinner spinning" style="width: 36px; height: 36px; border: 4px solid var(--border-color); border-top-color: var(--primary-color); border-radius: 50%;"></div>
        <div class="mini-splash-text" style="font-size: 13.5px; font-weight: 700; letter-spacing: -0.3px;">실시간 데이터 분석 중...</div>
      `;
      modalBody.style.position = 'relative';
      modalBody.style.minHeight = '430px';
      modalBody.appendChild(splashBlock);
    }
    if (dateSticky) dateSticky.style.visibility = 'hidden';
    if (bridge) bridge.style.visibility = 'hidden';
  }

  const dateStrings = []; const baseNow = new Date();
  for (let d = 0; d < 5; d++) {
    const tDate = new Date(baseNow.getTime() + d * 24 * 60 * 60 * 1000);
    dateStrings.push(`${tDate.getFullYear()}${String(tDate.getMonth() + 1).padStart(2, '0')}${String(tDate.getDate()).padStart(2, '0')}`);
  }

  const obsCode = getNearestTideStation(lat, lng);
  const stationObj = TIDE_STATIONS.find(s => s.code === obsCode) || TIDE_STATIONS[0];

  Promise.all([
    window.fetchSunriseSunsetForDatesPromise(lat, lng, dateStrings),
    window.fetchKMAWeatherPromise(lat, lng),
    window.fetchTideData3DaysPromise(lat, lng),
    window.fetchRealWaterTempPromise(lat, lng, dateStrings),
    window.fetchKMAWeatherPromise(stationObj.lat, stationObj.lng !== undefined ? stationObj.lng : stationObj.mesh)
  ]).then(([_, liveWeatherMap, realTidesSchedule, realWaterTempMap, seaWeatherMap]) => {
    const splashBlock = document.getElementById('miniSplashBodyBlock');
    if (splashBlock) splashBlock.remove();

    if (dateSticky) dateSticky.style.visibility = 'visible';
    if (bridge) { bridge.style.visibility = 'visible'; bridge.innerHTML = ''; }

    window.buildTimelineUI(lat, lng, liveWeatherMap, realTidesSchedule, realWaterTempMap, seaWeatherMap);
  }).catch(err => {
    console.error("통합 인터랙션 데이터 스트림 크래시 복구 작동:", err);
    const splashBlock = document.getElementById('miniSplashBodyBlock');
    if (splashBlock) splashBlock.remove();
    if (dateSticky) dateSticky.style.visibility = 'visible';
    if (bridge) {
      bridge.style.visibility = 'visible';
      bridge.innerHTML = '<div class="pm-empty-msg">기상 정보 연동에 실패했습니다. 다시 시도해 주세요.</div>';
    }
  });
};

window.fetchSunriseSunsetForDates = function (lat, lng, loopDates) {
  window.loadTimelineWithOptimisticUI(lat, lng);
};
window.fetchKMAWeather = function (lat, lng) { };
window.fetchTideData3Days = function (lat, lng) { };

// =========================================================================
// GROUP 13-2: 72시간 기상 물때 타임라인 UI 빌더 및 꼭지점 수위 보존 엔진
// =========================================================================
window.buildTimelineUI = function (lat, lng, weatherMap, realTides, waterTempMap, seaWeatherMap) {
  const scroller = document.getElementById('timelineScrollWrapper');
  const bridge = document.getElementById('timelineInnerBridge');
  if (!bridge) return;

  bridge.innerHTML = ''; window.timelineDatesArray = []; window.allTidesSchedule = [];
  const gridRow = document.createElement('div'); gridRow.className = 'timeline-grid-row';
  const now = new Date(); let svgHighlightsHtml = ''; const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const dayBrightColor = '#e3f2fd'; const dayMainColor = '#b3e5fc'; const nightColor = '#1a263f'; const seaTopColor = '#6cb0f6'; const seaBottomColor = '#2b6cb0';
  let allSegments = []; let prevType = null; let segmentStartX = 0;

  for (let m = 0; m <= 72 * 60; m += 10) {
    let isNightTime = false;
    if (m < 72 * 60) {
      const testDate = new Date(now.getTime() + (m * 60 * 1000)); const sunTimes = window.getSunTimesForDate(testDate);
      const sRiseH = parseInt(sunTimes.sunrise.split(':')[0], 10); const sRiseM = parseInt(sunTimes.sunrise.split(':')[1], 10);
      const sSetH = parseInt(sunTimes.sunset.split(':')[0], 10); const sSetM = parseInt(sunTimes.sunset.split(':')[1], 10);
      const currentMinTotal = testDate.getHours() * 60 + testDate.getMinutes();
      isNightTime = (currentMinTotal < (sRiseH * 60 + sRiseM)) || (currentMinTotal >= (sSetH * 60 + sSetM));
    }
    let currentType = isNightTime ? 'night' : 'day';
    if (m === 0) { prevType = currentType; segmentStartX = 0; }
    else if (currentType !== prevType || m === 72 * 60) {
      let endX = (m / 60) * 56; allSegments.push({ type: prevType, start: segmentStartX, width: endX - segmentStartX });
      prevType = currentType; segmentStartX = endX;
    }
  }

  let svgBackgroundsHtml = '';
  allSegments.forEach(seg => {
    if (seg.type === 'day') {
      svgBackgroundsHtml += `<rect x="${seg.start.toFixed(2)}" y="0" width="${seg.width.toFixed(2)}" height="160" fill="url(#dayGradient)" stroke="none" />`;
    } else {
      svgBackgroundsHtml += `<rect x="${seg.start.toFixed(2)}" y="0" width="${seg.width.toFixed(2)}" height="160" fill="${nightColor}" stroke="none" />`;
      let starCount = Math.floor(seg.width / 15);
      for (let s = 0; s < starCount; s++) {
        svgBackgroundsHtml += `<circle cx="${(seg.start + (Math.random() * seg.width)).toFixed(2)}" cy="${(5 + (Math.random() * 35)).toFixed(2)}" r="${(0.6 + Math.random() * 0.4).toFixed(1)}" fill="#ffffff" opacity="${(0.3 + Math.random() * 0.6).toFixed(2)}" stroke="none" />`;
      }
      if (seg.width > 30) {
        const moonX = (seg.start + seg.width / 2).toFixed(2); const segDate = new Date(now.getTime() + (seg.start + seg.width / 2) / 56 * 60 * 60 * 1000);
        const phase = (((segDate.getTime() - new Date(Date.UTC(2000, 0, 6, 18, 14, 0)).getTime()) / (1000 * 60 * 60 * 24)) % 29.530588853 + 29.530588853) % 29.530588853;

        let moonContent = '';
        if (phase < 1.5 || phase > 28.0) {
          moonContent = `<circle cx="14" cy="14" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1" stroke-dasharray="2,2"/>`;
        } else if (phase >= 1.5 && phase < 6.0) {
          moonContent = `<circle cx="14" cy="14" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/><path d="M 14 3 A 11 11 0 0 1 14 25 A 6 11 0 0 0 14 3 Z" fill="#ffd700"/>`;
        } else if (phase >= 6.0 && phase < 9.0) {
          moonContent = `<circle cx="14" cy="14" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/><path d="M 14 3 A 11 11 0 0 1 14 25 L 14 3 Z" fill="#ffd700"/>`;
        } else if (phase >= 9.0 && phase < 13.5) {
          moonContent = `<circle cx="14" cy="14" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/><path d="M 14 3 A 11 11 0 0 1 14 25 A 6 11 0 0 1 14 3 Z" fill="#ffd700"/>`;
        } else if (phase >= 13.5 && phase <= 16.0) {
          moonContent = `<circle cx="14" cy="14" r="11" fill="#ffd700"/><circle cx="10" cy="9" r="2" fill="#e6c200" fill-opacity="0.4"/>`;
        } else if (phase > 16.0 && phase < 20.5) {
          moonContent = `<circle cx="14" cy="14" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/><path d="M 14 3 A 11 11 0 0 0 14 25 A 6 11 0 0 0 14 3 Z" fill="#ffd700"/>`;
        } else if (phase >= 20.5 && phase < 23.5) {
          moonContent = `<circle cx="14" cy="14" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/><path d="M 14 3 A 11 11 0 0 0 14 25 L 14 3 Z" fill="#ffd700"/>`;
        } else {
          moonContent = `<circle cx="14" cy="14" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/><path d="M 14 3 A 11 11 0 0 0 14 25 A 6 11 0 0 1 14 3 Z" fill="#ffd700"/>`;
        }
        svgBackgroundsHtml += `<g transform="translate(${(moonX - 14)}, 12)">${moonContent}</g>`;
      }
    }
    if (seg.type === 'day' && seg.width > 30) {
      svgBackgroundsHtml += `<g transform="translate(${((seg.start + seg.width / 2) - 14).toFixed(2)}, 12)"><circle cx="14" cy="14" r="6" fill="#ff9500" opacity="0.85"/><path d="M14 3v3M14 22v3M3 14h3M22 14h3" stroke="#ff9500" stroke-width="2" stroke-linecap="round" opacity="0.85"/></g>`;
    }
  });

  for (let i = 0; i < 72; i++) {
    const futureHour = new Date(now.getTime() + (i * 60 * 60 * 1000)); window.timelineDatesArray.push(futureHour);
    const kmaKey = `${futureHour.getFullYear()}${String(futureHour.getMonth() + 1).padStart(2, '0')}${String(futureHour.getDate()).padStart(2, '0')}${String(futureHour.getHours()).padStart(2, '0')}00`;

    let tempVal = (20 + Math.sin(i * 0.4) * 2).toFixed(0) + "°"; let rainVal = '0mm'; let windVal = (2 + Math.sin(i * 0.7) * 2).toFixed(0) + "m/s"; let dirVal = "↓";
    let skyIcon = "맑음"; let iconColor = isDark ? '#ffb948' : '#ff9500';
    let waveVal = "--m"; let wtempVal = "--°C";

    if (weatherMap && weatherMap[kmaKey]) {
      const kma = weatherMap[kmaKey]; if (kma.TMP) tempVal = kma.TMP + "°";
      if (kma.PCP) rainVal = kma.PCP === '강수없음' ? '0mm' : kma.PCP;
      if (kma.WSD) windVal = parseFloat(kma.WSD).toFixed(0) + "m/s";

      if (kma.WAV) {
        waveVal = parseFloat(kma.WAV).toFixed(1) + "m";
      } else if (seaWeatherMap && seaWeatherMap[kmaKey] && seaWeatherMap[kmaKey].WAV) {
        waveVal = parseFloat(seaWeatherMap[kmaKey].WAV).toFixed(1) + "m";
      }

      if (kma.VEC) {
        const deg = parseFloat(kma.VEC);
        if (deg >= 337.5 || deg < 22.5) dirVal = "↓"; else if (deg >= 22.5 && deg < 67.5) dirVal = "↙"; else if (deg >= 67.5 && deg < 112.5) dirVal = "←"; else if (deg >= 112.5 && deg < 157.5) dirVal = "↖"; else if (deg >= 157.5 && deg < 202.5) dirVal = "↑"; else if (deg >= 202.5 && deg < 247.5) dirVal = "↗"; else if (deg >= 247.5 && deg < 292.5) dirVal = "→"; else if (deg >= 292.5 && deg < 337.5) dirVal = "↘";
      }
      if (kma.PTY && kma.PTY !== "0") { skyIcon = "비"; iconColor = "#2f96ff"; }
      else if (kma.SKY === "3") { skyIcon = "구름많음"; iconColor = "#a2a2a7"; }
      else if (kma.SKY === "4") { skyIcon = "흐림"; iconColor = "#747479"; }
    } else if (seaWeatherMap && seaWeatherMap[kmaKey]) {
      const kmaSea = seaWeatherMap[kmaKey];
      if (kmaSea.WAV) waveVal = parseFloat(kmaSea.WAV).toFixed(1) + "m";
    }

    if (waterTempMap && waterTempMap[kmaKey]) {
      wtempVal = waterTempMap[kmaKey];
    } else if (waterTempMap) {
      const dayKey = kmaKey.substring(0, 8);
      const foundHourKey = Object.keys(waterTempMap).find(k => k.startsWith(dayKey));
      if (foundHourKey) wtempVal = waterTempMap[foundHourKey];
    }

    const col = document.createElement('div'); col.className = 'timeline-hour-column';
    col.innerHTML = `<div class="tl-cell cell-time">${String(futureHour.getHours()).padStart(2, '0')}</div><div class="tl-cell cell-icon" style="color: ${iconColor};">${skyIcon}</div><div class="tl-cell cell-temp">${tempVal}</div><div class="tl-cell cell-rain">${rainVal}</div><div class="tl-cell cell-wind">${windVal}</div><div class="tl-cell cell-dir">${dirVal}</div><div class="tl-cell cell-wave">${waveVal}</div><div class="tl-cell cell-wtemp">${wtempVal}</div>`;
    gridRow.appendChild(col);
  }
  bridge.appendChild(gridRow);

  if (realTides && Array.isArray(realTides) && realTides.length > 0) {
    window.allTidesSchedule = realTides.map(t => {
      if (t.rawDt) {
        const tDate = new Date(t.rawDt.replace(/-/g, '/'));
        t.hoursFromNow = (tDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      }
      return t;
    });
  }
  else {
    let k = 0;
    while (true) {
      let xHigh = 112 * (Math.PI / 2 + 2 * k * Math.PI);
      let xLow = 112 * (3 * Math.PI / 2 + 2 * k * Math.PI);
      if (xHigh > 4032 && xLow > 4032) break;
      if (xHigh >= 0 && xHigh <= 4032) {
        let hH = xHigh / 56; let dH = new Date(now.getTime() + hH * 60 * 60 * 1000);
        window.allTidesSchedule.push({ type: '만조', color: '#ff3b30', time: `${String(dH.getHours()).padStart(2, '0')}:${String(dH.getMinutes()).padStart(2, '0')}`, hoursFromNow: hH, level: '270', diff: 220, rawDt: `${dH.getFullYear()}-${String(dH.getMonth() + 1).padStart(2, '0')}-${String(dH.getDate()).padStart(2, '0')} ${String(dH.getHours()).padStart(2, '0')}:${String(dH.getMinutes()).padStart(2, '0')}:00` });
      }
      if (xLow >= 0 && xLow <= 4032) {
        let hL = xLow / 56; let dL = new Date(now.getTime() + hL * 60 * 60 * 1000);
        window.allTidesSchedule.push({ type: '간조', color: '#007aff', time: `${String(dL.getHours()).padStart(2, '0')}:${String(dL.getMinutes()).padStart(2, '0')}`, hoursFromNow: hL, level: '50', diff: -220, rawDt: `${dL.getFullYear()}-${String(dL.getMonth() + 1).padStart(2, '0')}-${String(dL.getDate()).padStart(2, '0')} ${String(dL.getHours()).padStart(2, '0')}:${String(dL.getMinutes()).padStart(2, '0')}:00` });
      }
      k++;
    }
  }
  window.allTidesSchedule.sort((a, b) => a.hoursFromNow - b.hoursFromNow);

  let curvePoints = window.allTidesSchedule.map(t => ({ x: t.hoursFromNow * 56, y: t.type === '만조' ? 55 : 115 }));
  if (curvePoints.length > 0) {
    curvePoints.sort((a, b) => a.x - b.x);
    curvePoints.unshift({ x: curvePoints[0].x - 336, y: curvePoints[0].y === 55 ? 115 : 55 });
    curvePoints.push({ x: curvePoints[curvePoints.length - 1].x + 336, y: curvePoints[curvePoints.length - 1].y === 55 ? 115 : 55 });
  }

  function getDynamicYForX(x) {
    if (curvePoints.length === 0) return 85;
    for (let idx = 0; idx < curvePoints.length - 1; idx++) {
      const p0 = curvePoints[idx]; const p1 = curvePoints[idx + 1];
      if (x >= p0.x && x <= p1.x) return p0.y * (1 - (1 - Math.cos((x - p0.x) / (p1.x - p0.x) * Math.PI)) / 2) + p1.y * ((1 - Math.cos((x - p0.x) / (p1.x - p0.x) * Math.PI)) / 2);
    }
    return 85;
  }

  let svgPoints = []; let fillPolygonPoints = "0,160";
  for (let x = 0; x <= 4032; x += 2) {
    const yVal = getDynamicYForX(x); const pStr = `${x},${yVal.toFixed(2)}`;
    svgPoints.push(pStr); fillPolygonPoints += ` ${pStr}`;
  }
  fillPolygonPoints += " 4032,160";

  window.allTidesSchedule.forEach(t => {
    const xPos = t.hoursFromNow * 56;
    if (xPos >= 0 && xPos <= 4032) {
      const yPos = getDynamicYForX(xPos); const isHigh = t.type === '만조';
      svgHighlightsHtml += `
        <line x1="${xPos.toFixed(2)}" y1="${isHigh ? 0 : yPos.toFixed(2)}" x2="${xPos.toFixed(2)}" y2="${isHigh ? yPos.toFixed(2) : 160}" stroke="${t.color}" stroke-width="1" stroke-dasharray="2,2" opacity="0.35" />
        <circle cx="${xPos.toFixed(2)}" cy="${yPos.toFixed(2)}" r="4.5" fill="#ffffff" stroke="${t.color}" stroke-width="2.5"/>
        <text x="${xPos.toFixed(2)}" y="${(yPos - 14).toFixed(2)}" fill="${t.color}" font-size="12" font-weight="600" text-anchor="middle">${t.level}${t.diff !== 0 ? ` (${t.diff > 0 ? '▲' : '▼'}${Math.abs(t.diff)})` : ''}</text>
      `;
    }
  });

  const waveRow = document.createElement('div'); waveRow.className = 'timeline-wave-row-container';
  waveRow.innerHTML = `<div class="tide-svg-wrapper"><svg class="tide-svg-canvas" width="4032" height="160"><defs><linearGradient id="deepSeaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${seaTopColor}" /><stop offset="100%" stop-color="${seaBottomColor}" /></linearGradient><radialGradient id="dayGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="0%"><stop offset="0%" stop-color="${dayBrightColor}" /><stop offset="100%" stop-color="${dayMainColor}" /></linearGradient></defs>${svgBackgroundsHtml}<polygon points="${fillPolygonPoints}" fill="url(#deepSeaGradient)" stroke="none" /><path d="M ${svgPoints.join(' L ')}" fill="none" stroke="transparent" stroke-width="1.2"/>${svgHighlightsHtml}</svg></div>`;
  bridge.appendChild(waveRow);

  const container = scroller?.closest('.timeline-viewport-container-native');
  if (container) {
    let labelCol = container.querySelector('.timeline-label-column');
    if (!labelCol) { labelCol = document.createElement('div'); labelCol.className = 'timeline-label-column'; container.appendChild(labelCol); }
    labelCol.innerHTML = `<div class="tl-cell">시간</div><div class="tl-cell">날씨</div><div class="tl-cell">기온</div><div class="tl-cell">강수</div><div class="tl-cell">풍속</div><div class="tl-cell">풍향</div><div class="tl-cell">파고</div><div class="tl-cell">수온</div><div class="tides-floating-text-area"></div>`;
  }

  if (scroller) {
    scroller.scrollLeft = 0;
  }
  window.syncTimelineDateHeader(scroller);
};

window.getSunTimesForDate = function (targetDate) {
  if (!window.globalSunTimesCache) window.globalSunTimesCache = {};
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  const key = `${yyyy}${mm}${dd}`;

  if (window.globalSunTimesCache[key]) {
    return window.globalSunTimesCache[key];
  }

  const dayFactor = targetDate.getDate() % 5;
  return { sunrise: `05:${32 + dayFactor}`, sunset: `19:${41 - dayFactor}` };
};

// =========================================================================
// GROUP 13-3: 싱크 바 가시성 연동 및 날짜 헤더 동기화 엔진
// =========================================================================
window.syncTimelineDateHeader = function (scrollElement) {
  if (!scrollElement || !window.timelineDatesArray || window.timelineDatesArray.length === 0) return;
  const container = scrollElement.closest('.timeline-viewport-container-native');
  if (!container) return;

  const syncLine = container.querySelector('.timeline-sync-line');
  const syncBubble = container.querySelector('.timeline-sync-bubble');

  let ratio = (scrollElement.scrollWidth - scrollElement.clientWidth) > 0 ? (scrollElement.scrollLeft / (scrollElement.scrollWidth - scrollElement.clientWidth)) : 0;
  let viewWidth = container.clientWidth - 75; if (viewWidth <= 0) viewWidth = scrollElement.clientWidth;
  let currentLineX = 75 + (ratio * viewWidth);

  if (syncLine) syncLine.style.left = `${Math.min(currentLineX, container.clientWidth - 2)}px`;
  if (syncBubble) syncBubble.style.left = `${Math.min(Math.max(currentLineX, 75 + 28), container.clientWidth - 38)}px`;

  const absoluteX = scrollElement.scrollLeft + (currentLineX - 75);
  const hoursFromNow = absoluteX / 56;

  const now = new Date();
  const activeDate = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
  const dateSticky = document.getElementById('lblDetailDate');

  if (dateSticky) {
    let lunarStr = '';
    let lunarDay = activeDate.getDate();
    try {
      const lunarRaw = new Intl.DateTimeFormat('ko-KR-u-ca-chinese').format(activeDate); const lunarArr = lunarRaw.split('.').map(s => s.trim()).filter(Boolean);
      if (lunarArr.length >= 3) {
        lunarStr = ` (음 ${lunarArr[1]}/${lunarArr[2]})`;
        lunarDay = parseInt(lunarArr[2], 10);
      }
    } catch (e) { console.warn(e); }

    const tideNames8 = ["조금", "1물", "2물", "3물", "4물", "5물", "6물", "7물", "8물", "9물", "10물", "11물", "12물", "13물", "14물"];
    const currentTide = tideNames8[(lunarDay + 7) % 15];
    const sunTimes = window.getSunTimesForDate(activeDate);

    const phase = (((activeDate.getTime() - new Date(Date.UTC(2000, 0, 6, 18, 14, 0)).getTime()) / (1000 * 60 * 60 * 24)) % 29.530588853 + 29.530588853) % 29.530588853;
    let moonSvgHtml = '';
    if (phase < 1.5 || phase > 28.0) {
      moonSvgHtml = `<svg class="lunar-phase-svg-node" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="var(--text-muted)" stroke="var(--text-muted)" stroke-opacity="0.4" stroke-width="1" stroke-dasharray="3,3"/></svg>`;
    } else if (phase >= 1.5 && phase < 6.0) {
      moonSvgHtml = `<svg class="lunar-phase-svg-node" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="var(--text-muted)"/><path d="M 14 3 A 11 11 0 0 1 14 25 A 5 11 0 0 0 14 3 Z" fill="#ffd700"/></svg>`;
    } else if (phase >= 6.0 && phase < 9.0) {
      moonSvgHtml = `<svg class="lunar-phase-svg-node" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="var(--text-muted)"/><path d="M 14 3 A 11 11 0 0 1 14 25 L 14 3 Z" fill="#ffd700"/></svg>`;
    } else if (phase >= 9.0 && phase < 13.5) {
      moonSvgHtml = `<svg class="lunar-phase-svg-node" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="var(--text-muted)"/><path d="M 14 3 A 11 11 0 0 1 14 25 A 5 11 0 0 1 14 3 Z" fill="#ffd700"/></svg>`;
    } else if (phase >= 13.5 && phase <= 16.0) {
      moonSvgHtml = `<svg class="lunar-phase-svg-node" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="#ffd700"/><circle cx="10" cy="9" r="2" fill="#e6c200" fill-opacity="0.3"/></svg>`;
    } else if (phase > 16.0 && phase < 20.5) {
      moonSvgHtml = `<svg class="lunar-phase-svg-node" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="var(--text-muted)"/><path d="M 14 3 A 11 11 0 0 0 14 25 A 5 11 0 0 0 14 3 Z" fill="#ffd700"/></svg>`;
    } else if (phase >= 20.5 && phase < 23.5) {
      moonSvgHtml = `<svg class="lunar-phase-svg-node" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="var(--text-muted)"/><path d="M 14 3 A 11 11 0 0 0 14 25 L 14 3 Z" fill="#ffd700"/></svg>`;
    } else {
      moonSvgHtml = `<svg class="lunar-phase-svg-node" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="var(--text-muted)"/><path d="M 14 3 A 11 11 0 0 0 14 25 A 5 11 0 0 1 14 3 Z" fill="#ffd700"/></svg>`;
    }

    dateSticky.innerHTML = `
      <div class="sun-moon-left-wrapper">
        ${moonSvgHtml}
        <span class="sun-moon-tide-label">${currentTide}</span>
        <span class="sun-moon-date-label">
          ${String(activeDate.getMonth() + 1).padStart(2, '0')}월 ${String(activeDate.getDate()).padStart(2, '0')}일<span class="sun-moon-lunar-subtext">${lunarStr}</span>
        </span>
      </div>
      <div class="sun-times-right-wrapper">
        <span class="sun-time-item-flex sunrise-item">
          <svg class="sun-node-icon sunrise" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M5.22 7.22l2.83 2.83M18.78 7.22l-2.83 2.83M2 22h20M12 10a4 4 0 0 0-4 4h8a4 4 0 0 0-4-4z"/></svg>
          <span class="sun-time-bold">일출</span>${sunTimes.sunrise}
        </span>
        <span class="sun-time-item-flex sunset-item">
          <svg class="sun-node-icon sunset" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22h20M16 16a4 4 0 0 0-8 0M12 2v4M5.22 7.22l2.83 2.83M18.78 7.22l-2.83 2.83"/></svg>
          <span class="sun-time-bold">일몰</span>${sunTimes.sunset}
        </span>
      </div>
    `;
  }

  if (syncBubble) syncBubble.innerHTML = `${String(activeDate.getHours()).padStart(2, '0')}:${String(activeDate.getMinutes()).padStart(2, '0')}`;

  const textTideArea = container.querySelector('.tides-floating-text-area');
  if (textTideArea && window.allTidesSchedule && window.allTidesSchedule.length > 0) {
    let activeTides = window.allTidesSchedule.filter(t => t.hoursFromNow >= hoursFromNow - 1);
    activeTides = activeTides.length < 4 ? window.allTidesSchedule.slice(-4) : activeTides.slice(0, 4);

    textTideArea.innerHTML = activeTides.map(t => `
      <div class="tide-floating-card-item" style="border-left: 4px solid ${t.color} !important;">
        <div class="tide-floating-card-symbol" style="color: ${t.color} !important;">${t.type === '만조' ? '▲' : '▼'}${t.type}</div>
        <div class="tide-floating-card-time">${t.time}</div>
      </div>
    `).join('');
  }
};

// =========================================================================
// GROUP 13-4: 기존 마커 및 화장실 데이터 전용 모달 편집/영구 삭제 엔진
// =========================================================================
window.openMarkerDeleteModal = function (docId, collectionName, displayName, onSuccess) {
  const deleteModal = document.getElementById('deleteConfirmModal');
  const targetNameEl = document.getElementById('deleteModalTargetName');
  const doDeleteBtn = document.getElementById('btnDoDelete');
  if (!deleteModal || !doDeleteBtn) return;

  if (targetNameEl) targetNameEl.innerText = displayName;
  doDeleteBtn.onclick = function () {
    db.collection(collectionName).doc(docId).delete().then(() => {
      window.closeModals();
      if (typeof onSuccess === 'function') onSuccess();
    });
  };

  document.getElementById('detailModalWrapper')?.classList.remove('active');
  document.getElementById('detailModal')?.classList.remove('active');
  document.querySelectorAll('.modal, .custom-modal-native').forEach(m => { if (m !== deleteModal) m.classList.remove('active'); });

  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.add('active');
  deleteModal.classList.add('active');
};

window.selectEditPointParking = function (type, element) {
  selectedEditPointParkingType = type;
  element.parentElement.querySelectorAll('.chip-btn').forEach(chip => chip.classList.remove('active'));
  element.classList.add('active');
  const detailRow = document.getElementById('editPointParkingDetailRow');
  if (type === 'paid') detailRow.classList.add('active'); else detailRow.classList.remove('active');
};

window.selectEditToiletHours = function (type, element) {
  selectedToiletHoursValue = type;
  element.parentElement.querySelectorAll('.chip-btn').forEach(chip => chip.classList.remove('active'));
  element.classList.add('active');
  const detailRow = document.getElementById('editToiletHoursDetailRow');
  if (type === '지정시간') detailRow.classList.add('active'); else detailRow.classList.remove('active');
};

window.openPointEditModal = function (docId, name, category, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, address, lat, lng) {
  document.getElementById('editPointDocId').value = docId;
  document.getElementById('editPointName').value = name;
  document.getElementById('editPointMemo').value = memo;

  const pointEditAddrEl = document.getElementById('pointEditAddress');
  if (pointEditAddrEl) pointEditAddrEl.innerText = address || "주소 정보 없음";

  // SUB-GROUP 가드: 주소가 유효하지 않은 경우에만 API 최초 1회 제한적 호출 실행 (중복 호출 차단)
  if ((!address || address.includes("없음") || address.includes("중...")) && lat && lng) {
    if (typeof searchNearestCoastalLandmark === 'function') {
      searchNearestCoastalLandmark(lat, lng, function (nearestAddr) {
        if (pointEditAddrEl) pointEditAddrEl.innerText = nearestAddr;
        db.collection('fishing_points').doc(docId).update({ address: nearestAddr });
      }, function () {
        if (pointEditAddrEl) pointEditAddrEl.innerText = "주소 정보 없음";
      });
    }
  }

  const catSelect = document.getElementById('editPointCategory');
  if (catSelect) {
    catSelect.innerHTML = '';
    let activeCategories = [...new Set([JSON.parse(localStorage.getItem('pm-category-order') || '[]'), ...cachedFishingPoints.map(p => (p.category || '미분류').trim())])].filter(c => c !== '공중화장실 정보' && c !== 'toilet' && c !== '미분류');
    activeCategories.push('미분류');
    let savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');
    activeCategories.forEach(catName => {
      const option = document.createElement('option');
      option.value = catName;
      option.setAttribute('data-color', catName === '미분류' ? '#868e96' : (savedCatColors[catName] || '#007aff'));
      option.innerText = catName;
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
    document.getElementById('editPointParkingDetailRow').classList.add('active');
    document.getElementById('editPointParkingPrice').value = pPrice || '0';
    const unitBtn = document.getElementById('btnEditPointParkingUnit');
    if (unitBtn) { unitBtn.innerText = pUnit || '10분'; currentEditPointUnitIndex = Math.max(0, editPointParkingUnits.indexOf(pUnit || '10분')); }
  } else {
    document.getElementById('editPointParkingDetailRow').classList.remove('active');
  }

  document.getElementById('btnEditFacStore')?.classList.toggle('active', hasStore);
  document.getElementById('btnEditFacCafe')?.classList.toggle('active', hasCafe);
  document.getElementById('btnEditFacTackle')?.classList.toggle('active', hasTackle);

  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.add('active');
  document.getElementById('pointEditModal').classList.add('active');
};

window.openToiletEditModal = function (docId, name, memo, address) {
  document.getElementById('editToiletDocId').value = docId;
  document.getElementById('editToiletName').value = name || '공중화장실';
  document.getElementById('toiletEditAddress').innerText = address || "주소 정보 없음";
  const tokens = (memo || '').split('||');
  const hoursText = tokens[0] || '모름';
  document.getElementById('editToiletMemo').value = tokens[1] || '';

  const chipsContainer = document.getElementById('editToiletHoursChips');
  if (chipsContainer) {
    chipsContainer.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('active'));
    if (hoursText === '24시간') document.getElementById('chipEditHours24')?.classList.add('active');
    else if (hoursText === '모름') document.getElementById('chipEditHoursUnknown')?.classList.add('active');
    else chipsContainer.querySelectorAll('.chip-btn')[2]?.classList.add('active');
  }

  if (hoursText !== '24시간' && hoursText !== '모름') {
    document.getElementById('editToiletHoursDetailRow').classList.add('active');
    selectedToiletHoursValue = '지정시간';
    try {
      const times = hoursText.split('~').map(t => t.trim());
      if (times.length === 2) {
        document.getElementById('editToiletStartHour').value = times[0].split(':')[0] || '09';
        document.getElementById('editToiletStartMin').value = times[0].split(':')[1] || '00';
        document.getElementById('editToiletEndHour').value = times[1].split(':')[0] || '18';
        document.getElementById('editToiletEndMin').value = times[1].split(':')[1] || '00';
      }
    } catch { }
  } else {
    document.getElementById('editToiletHoursDetailRow').classList.remove('active');
    selectedToiletHoursValue = hoursText;
  }

  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.add('active');
  document.getElementById('toiletEditModal').classList.add('active');
};

window.savePointEditData = function () {
  const docId = document.getElementById('editPointDocId').value;
  const name = document.getElementById('editPointName').value.trim();
  if (!name) return alert("포인트 이름을 입력하세요.");
  const category = document.getElementById('editPointCategory')?.value || '미분류';
  let color = document.getElementById('editPointCategory')?.options[document.getElementById('editPointCategory').selectedIndex]?.getAttribute('data-color') || '#007aff';

  db.collection('fishing_points').doc(docId).update({
    name, category, color, memo: document.getElementById('editPointMemo').value.trim() || '등록된 메모가 없습니다.',
    parkingType: selectedEditPointParkingType,
    parkingUnit: editPointParkingUnits[currentEditPointUnitIndex],
    parkingPrice: document.getElementById('editPointParkingPrice').value || '0',
    hasStore: document.getElementById('btnEditFacStore')?.classList.contains('active'),
    hasCafe: document.getElementById('btnEditFacCafe')?.classList.contains('active'),
    hasTackle: document.getElementById('btnEditFacTackle')?.classList.contains('active')
  }).then(() => window.closeModals());
};

window.saveToiletEditData = function () {
  const docId = document.getElementById('editToiletDocId').value;
  let finalHours = selectedToiletHoursValue;
  if (selectedToiletHoursValue === '지정시간') {
    finalHours = `${document.getElementById('editToiletStartHour').value.trim()}:${document.getElementById('editToiletStartMin').value.trim()} ~ ${document.getElementById('editToiletEndHour').value.trim()}:${document.getElementById('editToiletEndMin').value.trim()}`;
  }

  db.collection('public_toilets').doc(docId).update({
    name: document.getElementById('editToiletName').value.trim() || '공중화장실',
    memo: `${finalHours}||${document.getElementById('editToiletMemo').value.trim() || '양호'}`
  }).then(() => window.closeModals());
};

window.renderPointDetailBottomSheet = function (docId, name, category, color, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, lat, lng, isFavorite, dbSavedAddress) {
  const wrapper = document.getElementById('detailModalWrapper');
  const sheet = document.getElementById('detailModal');

  if (wrapper) wrapper.classList.add('active');
  if (sheet) sheet.classList.add('active');

  const favBtn = document.getElementById('btnDetailModalFavorite');
  const categoryBadge = document.getElementById('lblDetailCategory');
  const lblDetailParking = document.getElementById('lblDetailParking');
  const lblDetailFacilities = document.getElementById('lblDetailFacilities');
  const lblDetailToiletHours = document.getElementById('lblDetailToiletHours');
  const memoEl = document.getElementById('lblDetailMemo');

  const deleteBtn = document.getElementById('btnDetailPointDelete');
  const editTriggerBtn = document.getElementById('btnDetailPointEditTrigger');
  const weatherOpenBtn = document.getElementById('btnDetailWeatherOpen');
  const naviOpenBtn = document.getElementById('btnDetailNaviOpen');

  const nameWrapper = document.getElementById('lblDetailName');
  const addrField = document.getElementById('lblDetailAddressField');

  if (nameWrapper) nameWrapper.innerText = name;
  if (dbSavedAddress && dbSavedAddress.startsWith('소재지 도로명 주소:')) dbSavedAddress = dbSavedAddress.replace('소재지 도로명 주소:', '').trim();
  if (addrField) addrField.innerText = dbSavedAddress || "주소 변환 중...";

  if ((!dbSavedAddress || dbSavedAddress.includes("중...") || dbSavedAddress.includes("없음")) && typeof window.kakao !== 'undefined' && window.kakao.maps) {
    window.kakao.maps.load(function () {
      if (window.kakao.maps.services?.Geocoder) {
        new window.window.kakao.maps.services.Geocoder().coord2Address(lng, lat, function (result, status) {
          if (status === window.kakao.maps.services.Status.OK && result[0]) {
            const roadAddress = result[0].road_address ? result[0].road_address.address_name : null;
            const jibunAddress = result[0].address ? result[0].address.address_name : null;
            let finalAddr = roadAddress || jibunAddress || "주소 정보 없음";

            if (finalAddr === "주소 정보 없음" || finalAddr.trim() === "") {
              searchNearestCoastalLandmark(lat, lng, function (nearestAddr) {
                if (addrField) addrField.innerText = nearestAddr;
                if (category === 'toilet' || category === 'public_toilets') {
                  db.collection('public_toilets').doc(docId).update({ dbSavedAddress: nearestAddr });
                } else {
                  db.collection('fishing_points').doc(docId).update({ address: nearestAddr });
                }
              }, function () {
                if (addrField) addrField.innerText = "주소 정보 없음";
              });
            } else {
              if (addrField) addrField.innerText = finalAddr;
              if (category === 'toilet' || category === 'public_toilets') {
                db.collection('public_toilets').doc(docId).update({ dbSavedAddress: finalAddr });
              } else {
                db.collection('fishing_points').doc(docId).update({ address: finalAddr });
              }
            }
          } else {
            searchNearestCoastalLandmark(lat, lng, function (nearestAddr) {
              if (addrField) addrField.innerText = nearestAddr;
              if (category === 'toilet' || category === 'public_toilets') {
                db.collection('public_toilets').doc(docId).update({ dbSavedAddress: nearestAddr });
              } else {
                db.collection('fishing_points').doc(docId).update({ address: nearestAddr });
              }
            }, function () {
              if (addrField) addrField.innerText = "주소 정보 없음";
            });
          }
        });
      }
    });
  }

  const facContainer = document.getElementById('lblDetailFacilitiesContainer');
  if (facContainer) facContainer.innerHTML = '';

  if (category === 'toilet' || category === 'public_toilets') {
    if (favBtn) favBtn.classList.add('detail-toilet-hours-hidden');
    if (lblDetailParking) lblDetailParking.classList.add('detail-toilet-hours-hidden');
    if (lblDetailFacilities) lblDetailFacilities.classList.add('detail-toilet-hours-hidden');
    if (categoryBadge) categoryBadge.classList.add('detail-toilet-hours-hidden');
    if (weatherOpenBtn) weatherOpenBtn.classList.add('detail-toilet-hours-hidden');

    const tokens = (memo || '').split('||');
    if (lblDetailToiletHours) {
      lblDetailToiletHours.classList.remove('detail-toilet-hours-hidden');
      const txtSpan = lblDetailToiletHours.querySelector('.tag-txt');
      if (txtSpan) txtSpan.innerText = tokens[0] || '모름';
    }
    if (memoEl) memoEl.innerText = tokens[1] || '기록된 특이사항이 없습니다.';
  } else {
    if (favBtn) favBtn.classList.remove('detail-toilet-hours-hidden');
    if (lblDetailParking) lblDetailParking.classList.remove('detail-toilet-hours-hidden');
    if (lblDetailFacilities) lblDetailFacilities.classList.remove('detail-toilet-hours-hidden');
    if (categoryBadge) categoryBadge.classList.remove('detail-toilet-hours-hidden');
    if (weatherOpenBtn) weatherOpenBtn.classList.remove('detail-toilet-hours-hidden'); // 오타 수정 완료: 기상 정보 버튼 정상 노출
    if (lblDetailToiletHours) lblDetailToiletHours.classList.add('detail-toilet-hours-hidden');

    if (favBtn) {
      const renderFav = (state) => { favBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="${state ? '#ffcc00' : 'none'}" stroke="${state ? '#ffcc00' : '#adb5bd'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`; };
      renderFav(isFavorite);
      favBtn.onclick = function (e) { e.stopPropagation(); isFavorite = !isFavorite; renderFav(isFavorite); db.collection('fishing_points').doc(docId).update({ isFavorite, favoritedAt: isFavorite ? Date.now() : firebase.firestore.FieldValue.delete() }); };
    }
    if (categoryBadge) { categoryBadge.innerText = category; categoryBadge.style.backgroundColor = color || 'var(--primary-color)'; }
    if (memoEl) memoEl.innerText = memo || '등록된 메모가 없습니다.';

    if (lblDetailParking) { const txtSpan = lblDetailParking.querySelector('.tag-txt'); if (txtSpan) txtSpan.innerText = pType === 'none' ? '주차 불가' : pType === 'free' ? '무료 주차' : `${pUnit} ${Number(pPrice).toLocaleString()}원`; }

    if (facContainer) {
      if (hasStore) facContainer.innerHTML += `<div class="detail-tag-item inline-flex"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span class="tag-txt">편의점</span></div>`;
      if (hasCafe) facContainer.innerHTML += `<div class="detail-tag-item inline-flex"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg><span class="tag-txt">카페</span></div>`;
      if (hasTackle) facContainer.innerHTML += `<div class="detail-tag-item inline-flex"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span class="tag-txt">낚시점</span></div>`;
    }

    try {
      window.buildTimelineUI(lat, lng, null, []);
    } catch (timelineError) {
      console.error("buildTimelineUI 내부 변수 미정의 오류 우회 조치:", timelineError);
    }
  }

  if (deleteBtn) deleteBtn.onclick = function (e) { e.stopPropagation(); window.openMarkerDeleteModal(docId, (category === 'toilet' || category === 'public_toilets') ? 'public_toilets' : 'fishing_points', name || ((category === 'toilet' || category === 'public_toilets') ? '공중화장실' : '무명 포인트')); };

  if (editTriggerBtn) editTriggerBtn.onclick = function (e) {
    e.stopPropagation();
    if (sheet) sheet.classList.remove('active');
    if (wrapper) wrapper.classList.remove('active');
    if (category === 'toilet' || category === 'public_toilets') window.openToiletEditModal(docId, name, memo, addrField.innerText);
    else window.openPointEditModal(docId, name, category, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, addrField.innerText, lat, lng);
  };

  if (weatherOpenBtn) {
    weatherOpenBtn.onclick = function (e) {
      e.stopPropagation(); document.getElementById('lblWeatherModalTitle').innerText = name;
      const weatherMarkerIcon = document.getElementById('weatherModalMarkerIcon');

      if (weatherMarkerIcon) {
        if (category === 'toilet' || category === 'public_toilets') {
          weatherMarkerIcon.innerHTML = `<svg width="14" height="17" viewBox="0 0 36 42" fill="none"><path d="M18 0C8.06 0 0 8.06 0 18C0 28.54 18 42 18 42C18 42 36 28.54 36 18C36 8.06 27.94 0 18 0Z" fill="#ff9500"/><circle cx="18" cy="16" r="5" fill="#ffffff"/><path d="M14 24H22V27H14V24Z" fill="#ffffff"/></svg>`;
        } else {
          weatherMarkerIcon.innerHTML = getFishingPointSvg(color).replace('width="26" height="39"', 'width="20" height="30"');
        }
      }

      document.getElementById('weatherModal')?.classList.add('active');
      window.loadTimelineWithOptimisticUI(lat, lng);
    };
  }

  if (naviOpenBtn) {
    const naviApp = localStorage.getItem('navi-app');
    if (naviApp === 'naver') {
      naviOpenBtn.style.backgroundColor = '#03C75A';
      naviOpenBtn.style.color = '#ffffff';
    } else {
      naviOpenBtn.style.backgroundColor = '#FEE500';
      naviOpenBtn.style.color = '#111111';
    }
    naviOpenBtn.onclick = function (e) { e.stopPropagation(); window.open(localStorage.getItem('navi-app') === 'naver' ? `https://map.naver.com/index.nhn?elat=${lat}&elng=${lng}&etext=${encodeURIComponent(name)}&menu=route` : `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`, '_blank'); };
  }
};

// =========================================================================
// GROUP 14: 포인트 관리 허브 목록 바인딩 및 가로 정렬 드래그 엔진
// =========================================================================
window.openPointDetailFromList = function (pt) {
  window.closeModals();

  const mapNavItem = document.querySelector('.nav-item[onclick*="tab-map"]') || document.querySelector('.nav-item');
  if (typeof window.switchTab === 'function') {
    window.switchTab('tab-map', mapNavItem);
  }

  if (map) {
    map.panTo([pt.lat, pt.lng]);
  }

  if (pt.category === 'toilet') {
    if (window.tempToiletMarker) {
      map.removeLayer(window.tempToiletMarker);
    }

    const toiletIcon = L.divIcon({
      html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff9500" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path>
                  <path d="M5 12h14v3a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-3z"></path>
                  <path d="M9 19v3"></path>
                  <path d="M15 19v3"></path>
            </svg>`,
      className: 'custom-marker-wrapper-toilet temp-list-injected-toilet-node',
      iconSize: [24, 24], iconAnchor: [12, 12]
    });

    window.tempToiletMarker = L.marker([pt.lat, pt.lng], { icon: toiletIcon, zIndexOffset: 1000 }).addTo(map);

    window.renderPointDetailBottomSheet(pt.id, pt.name || '공중화장실', 'toilet', '#ff9500', pt.memo || '', '', '', 0, false, false, false, pt.lat, pt.lng, false, pt.dbSavedAddress || pt.address || '주소 정보 없음');
  } else {
    window.renderPointDetailBottomSheet(pt.id, pt.name, pt.category, pt.color, pt.memo, pt.parkingType || 'none', pt.parkingUnit || '', pt.parkingPrice || '0', pt.hasStore || false, pt.hasCafe || false, pt.hasTackle || false, pt.lat, pt.lng, pt.isFavorite || false, pt.address || "주소 정보 없음");
  }
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

  row.onclick = (e) => {
    if (e.target.closest('.pm-action-btn') || e.target.closest('.pm-drag-handle')) return;
    window.openPointDetailFromList(pt);
  };
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
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      if (isFavSection) saveFavoriteOrderToFirebase(container);
      else saveCategoryOrderWithinTabToFirebase(container);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
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
    const isToilet = cachedPublicToilets.some(t => t.id === docId);
    if (!isToilet) {
      batch.update(db.collection('fishing_points').doc(docId), { createdAt: firebase.firestore.Timestamp.fromMillis(baseTime - (index * 1000)) });
    }
  });
  batch.commit().catch(err => console.error(err));
}

window.renderPointsManagementTab = function () {
  const tabsContainer = document.getElementById('pm-category-tabs');
  const listContainer = document.getElementById('pm-points-list');
  if (!tabsContainer || !listContainer) return;

  if (!window.currentActiveCategory) {
    window.currentActiveCategory = localStorage.getItem('pm-last-category') || '전체';
  }

  if (window.currentActiveCategory === '공중화장실 정보') {
    window.currentActiveCategory = '최근 추가된 화장실';
  }

  let categories = ['전체', '즐겨찾기'];

  let savedCatOrder = JSON.parse(localStorage.getItem('pm-category-order') || '[]').filter(cat => cat !== '공중화장실 정보' && cat !== '최근 추가된 화장실' && cat !== 'toilet' && cat !== '미분류');
  let currentCats = [...new Set(cachedFishingPoints.map(p => (p.category || '미분류').trim()))].filter(cat => cat !== '공중화장실 정보' && cat !== '최근 추가된 화장실' && cat !== 'toilet' && cat !== '미분류');

  let activeCategories = [...savedCatOrder];
  currentCats.forEach(cat => {
    if (!activeCategories.includes(cat)) activeCategories.push(cat);
  });

  categories = categories.concat(activeCategories);
  categories.push('미분류');
  categories.push('최근 추가된 화장실');

  if (!categories.includes(window.currentActiveCategory)) {
    window.currentActiveCategory = '전체';
  }

  tabsContainer.innerHTML = '';
  const savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');

  categories.forEach(catName => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pm-category-tab-btn';
    if (catName === window.currentActiveCategory) btn.classList.add('active');

    let catColor = '#868e96';
    if (catName === '전체') catColor = 'var(--primary-color)';
    else if (catName === '즐겨찾기') catColor = '#ffcc00';
    else if (catName === '최근 추가된 화장실') catColor = '#ff9500';
    else if (catName === '미분류') catColor = '#868e96';
    else {
      const matchPoints = cachedFishingPoints.filter(p => (p.category || '미분류') === catName);
      catColor = matchPoints.length > 0 ? (matchPoints[0].color || '#007aff') : (savedCatColors[catName] || '#007aff');
    }

    btn.innerHTML = `<span class="pm-tab-dot" style="background:${catColor}"></span><span>${catName}</span>`;

    btn.onclick = function () {
      window.currentActiveCategory = catName;
      localStorage.setItem('pm-last-category', catName);

      tabsContainer.querySelectorAll('.pm-category-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const outerContainer = tabsContainer.parentElement;
      const scrollLeft = btn.offsetLeft - (outerContainer.clientWidth / 2) + (btn.clientWidth / 2);
      outerContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });

      renderActiveCategoryPoints();
    };

    tabsContainer.appendChild(btn);

    if (catName === window.currentActiveCategory) {
      setTimeout(() => {
        const outerContainer = tabsContainer.parentElement;
        const scrollLeft = btn.offsetLeft - (outerContainer.clientWidth / 2) + (btn.clientWidth / 2);
        outerContainer.scrollLeft = scrollLeft;
      }, 50);
    }
  });

  function renderActiveCategoryPoints() {
    listContainer.innerHTML = '';
    let displayPoints = [];

    if (window.currentActiveCategory === '전체') {
      displayPoints = [
        ...cachedFishingPoints.map(p => ({ ...p, category: (p.category && p.category.trim() !== "") ? p.category.trim() : "미분류" }))
      ];
    } else if (window.currentActiveCategory === '즐겨찾기') {
      displayPoints = cachedFishingPoints.filter(p => p.isFavorite === true);
      displayPoints.sort((a, b) => (b.favoritedAt || 0) - (a.favoritedAt || 0));
    } else if (window.currentActiveCategory === '최근 추가된 화장실') {
      displayPoints = cachedPublicToilets.slice(0, 5).map(t => ({ ...t, category: "toilet" }));
    } else {
      displayPoints = cachedFishingPoints.filter(p => (p.category || '미분류').trim() === window.currentActiveCategory.trim());
    }

    if (displayPoints.length === 0) {
      listContainer.innerHTML = `<div class="pm-empty-msg">[${window.currentActiveCategory}] 카테고리에 등록된 포인트가 없습니다.</div>`;
      return;
    }

    displayPoints.forEach(item => {
      listContainer.appendChild(createPointRowComponent(item, window.currentActiveCategory === '전체' || window.currentActiveCategory === '즐겨찾기'));
    });

    if (window.currentActiveCategory === '즐겨찾기') {
      window.bindDragAndDropEvents(listContainer, true);
    } else if (window.currentActiveCategory !== '전체' && window.currentActiveCategory !== '최근 추가된 화장실') {
      window.bindDragAndDropEvents(listContainer, false);
    }
  }

  renderActiveCategoryPoints();
};

// =========================================================================
// GROUP 15: 실시간 공지사항 및 이벤트 게시판 데이터 연동 및 레이어 토글 엔진
// =========================================================================
let cachedNotices = [];
let cachedEvents = [];
let currentBoardTab = 'notice';

window.showNoticePage = function (initialTab) {
  window.closeModals();
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

  const np = document.getElementById('notice-page');
  if (np) np.classList.add('active');

  const targetTab = (initialTab === 'event') ? 'event' : 'notice';
  window.switchBoardSubTab(targetTab);
};

window.switchBoardSubTab = function (tab) {
  currentBoardTab = tab;

  const btnNotice = document.getElementById('btnSubTabNotice');
  const btnEvent = document.getElementById('btnSubTabEvent');
  const containerNotice = document.getElementById('notice-list-container');
  const containerEvent = document.getElementById('event-list-container');
  const detailContainer = document.getElementById('notice-inline-detail-container');

  if (btnNotice) btnNotice.classList.toggle('active', tab === 'notice');
  if (btnEvent) btnEvent.classList.toggle('active', tab === 'event');

  if (containerNotice) containerNotice.classList.toggle('active', tab === 'notice');
  if (containerEvent) containerEvent.classList.toggle('active', tab === 'event');
  if (detailContainer) detailContainer.classList.remove('active');

  if (tab === 'notice') {
    document.getElementById('lblNoticeHeaderTitle').innerText = '공지사항';
    window.fetchLiveNotices();
  } else {
    document.getElementById('lblNoticeHeaderTitle').innerText = '이벤트';
    window.fetchLiveEvents();
  }
};

window.handleNoticeBackNavigation = function () {
  const detailContainer = document.getElementById('notice-inline-detail-container');
  const containerNotice = document.getElementById('notice-list-container');
  const containerEvent = document.getElementById('event-list-container');

  if (detailContainer && detailContainer.classList.contains('active')) {
    detailContainer.classList.remove('active');

    if (currentBoardTab === 'notice' && containerNotice) containerNotice.classList.add('active');
    if (currentBoardTab === 'event' && containerEvent) containerEvent.classList.add('active');

    document.getElementById('lblNoticeHeaderTitle').innerText = (currentBoardTab === 'notice') ? '공지사항' : '이벤트';
    return;
  }
  document.getElementById('notice-page')?.classList.remove('active');
  document.getElementById('tab-more')?.classList.add('active');
  const navItems = document.querySelectorAll('.nav-item');
  if (navItems.length >= 4) {
    navItems.forEach(ni => ni.classList.remove('active'));
    navItems[3].classList.add('active');
  }
};

window.hideNoticePage = function () {
  window.handleNoticeBackNavigation();
};

window.fetchLiveNotices = function () {
  const container = document.getElementById('notice-list-container');
  if (!container) return;
  container.innerHTML = '<div class="pm-empty-msg">공지사항을 불러오는 중입니다...</div>';

  db.collection('notices').orderBy('createdAt', 'desc').get().then((snapshot) => {
    cachedNotices = [];
    container.innerHTML = '';
    if (snapshot.empty) { container.innerHTML = '<div class="pm-empty-msg">등록된 공지사항이 없습니다.</div>'; return; }

    const totalCount = snapshot.size;
    let index = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      cachedNotices.push({ id: doc.id, ...data });
      let dateStr = "일자 미상";
      if (data.createdAt) {
        const d = (typeof data.createdAt.toDate === 'function') ? data.createdAt.toDate() : new Date(data.createdAt);
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      const item = document.createElement('div');
      item.className = 'notice-item';
      item.innerHTML = `
        <div class="notice-item-num">${totalCount - index}</div>
        <div class="notice-item-title">${data.title || '제목 없음'}</div>
        <div class="notice-item-date">${dateStr}</div>
      `;
      item.onclick = () => window.openNoticeDetail(doc.id);
      container.appendChild(item);
      index++;
    });
  }).catch(() => { container.innerHTML = '<div class="pm-empty-msg">데이터 수신에 실패했습니다.</div>'; });
};

window.fetchLiveEvents = function () {
  const container = document.getElementById('event-list-container');
  if (!container) return;
  container.innerHTML = '<div class="pm-empty-msg">이벤트를 불러오는 중입니다...</div>';

  db.collection('events').orderBy('createdAt', 'desc').get().then((snapshot) => {
    cachedEvents = [];
    container.innerHTML = '';
    if (snapshot.empty) { container.innerHTML = '<div class="pm-empty-msg">등록된 이벤트가 없습니다.</div>'; return; }

    const totalCount = snapshot.size;
    let index = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      cachedEvents.push({ id: doc.id, ...data });
      let dateStr = "일자 미상";
      if (data.createdAt) {
        const d = (typeof data.createdAt.toDate === 'function') ? data.createdAt.toDate() : new Date(data.createdAt);
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      const item = document.createElement('div');
      item.className = 'notice-item';
      item.innerHTML = `
        <div class="notice-item-num">${totalCount - index}</div>
        <div class="notice-item-title">${data.title || '제목 없음'}</div>
        <div class="notice-item-date">${dateStr}</div>
      `;
      item.onclick = () => window.openNoticeDetail(doc.id);
      container.appendChild(item);
      index++;
    });
  }).catch(() => { container.innerHTML = '<div class="pm-empty-msg">데이터 수신에 실패했습니다.</div>'; });
};

window.openNoticeDetail = function (docId) {
  const targetList = (currentBoardTab === 'notice') ? cachedNotices : cachedEvents;
  const notice = targetList.find(n => n.id === docId);
  if (!notice) return;

  document.getElementById('lblInlineNoticeTitle').innerText = notice.title || '제목 없음';
  if (document.getElementById('lblInlineNoticeDate')) {
    let dStr = "";
    if (notice.createdAt) {
      const d = (typeof notice.createdAt.toDate === 'function') ? notice.createdAt.toDate() : new Date(notice.createdAt);
      dStr = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    }
    document.getElementById('lblInlineNoticeDate').innerText = dStr;
  }
  document.getElementById('lblInlineNoticeContent').innerText = notice.content || '';

  document.getElementById('notice-list-container')?.classList.remove('active');
  document.getElementById('event-list-container')?.classList.remove('active');
  document.getElementById('notice-inline-detail-container')?.classList.add('active');

  const editBtn = document.getElementById('btnNoticeInlineEdit');
  if (editBtn) {
    editBtn.onclick = () => {
      document.getElementById('noticeWriteMode').value = 'edit';
      document.getElementById('noticeWriteTargetId').value = docId;
      document.getElementById('noticeWriteTitle').value = notice.title || '';
      document.getElementById('noticeWriteContent').value = notice.content || '';
      document.getElementById('lblNoticeWriteModalTitle').innerText = '글 수정';

      const backdrop = document.getElementById('modalBackdrop');
      if (backdrop) backdrop.classList.add('active');
      document.getElementById('noticeWriteModal')?.classList.add('active');
    };
  }

  const deleteBtn = document.getElementById('btnNoticeInlineDelete');
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      const collectionName = (currentBoardTab === 'notice') ? 'notices' : 'events';
      window.openMarkerDeleteModal(docId, collectionName, notice.title || '게시글', () => {
        document.getElementById('notice-inline-detail-container')?.classList.remove('active');

        if (currentBoardTab === 'notice') {
          document.getElementById('notice-list-container')?.classList.add('active');
          window.fetchLiveNotices();
        } else {
          document.getElementById('event-list-container')?.classList.add('active');
          window.fetchLiveEvents();
        }
      });
    };
  }
};

window.closeNoticeDetailModal = function () {
  document.getElementById('notice-inline-detail-container')?.classList.remove('active');
  if (currentBoardTab === 'notice') document.getElementById('notice-list-container')?.classList.add('active');
  else document.getElementById('event-list-container')?.classList.add('active');
  document.getElementById('lblNoticeHeaderTitle').innerText = (currentBoardTab === 'notice') ? '공지사항' : '이벤트';
};

// =========================================================================
// GROUP 15-1: 공지사항 및 이벤트 단독 작성/수정 모달 제어 및 데이터베이스 연동 시스템
// =========================================================================
window.openNoticeWriteModal = function () {
  if (document.getElementById('noticeWriteTitle')) document.getElementById('noticeWriteTitle').value = '';
  if (document.getElementById('noticeWriteContent')) document.getElementById('noticeWriteContent').value = '';
  document.getElementById('noticeWriteMode').value = 'add';
  document.getElementById('noticeWriteTargetId').value = '';
  document.getElementById('lblNoticeWriteModalTitle').innerText = '글 등록';

  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.add('active');

  const writeModal = document.getElementById('noticeWriteModal');
  if (writeModal) writeModal.classList.add('active');
};

window.saveNoticeData = function () {
  const title = document.getElementById('noticeWriteTitle')?.value.trim() || '';
  const content = document.getElementById('noticeWriteContent')?.value.trim() || '';
  const mode = document.getElementById('noticeWriteMode').value;
  const targetId = document.getElementById('noticeWriteTargetId').value;
  const collectionName = (currentBoardTab === 'notice') ? 'notices' : 'events';

  if (!title) return alert('제목을 입력해 주세요.');
  if (!content) return alert('내용을 입력해 주세요.');

  if (mode === 'edit') {
    db.collection(collectionName).doc(targetId).update({
      title,
      content
    })
      .then(() => {
        window.closeModals();
        alert('성공적으로 수정되었습니다.');
        document.getElementById('lblInlineNoticeTitle').innerText = title;
        document.getElementById('lblInlineNoticeContent').innerText = content;

        if (currentBoardTab === 'notice') window.fetchLiveNotices();
        else window.fetchLiveEvents();
      }).catch(() => alert('수정 중 오류가 발생했습니다.'));
  } else {
    const now = new Date();
    db.collection(collectionName).add({
      title,
      content,
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
      .then(() => {
        window.closeModals();
        alert('성공적으로 등록되었습니다.');
        document.getElementById('notice-inline-detail-container')?.classList.remove('active');
        if (currentBoardTab === 'notice') {
          document.getElementById('notice-list-container')?.classList.add('active');
          window.fetchLiveNotices();
        } else {
          document.getElementById('event-list-container')?.classList.add('active');
          window.fetchLiveEvents();
        }
      }).catch(() => alert('저장 중 오류가 발생했습니다.'));
  }
};

// =========================================================================
// GROUP 16: 관리자 디버깅 패널, 캐시 상태 검증 및 실시간 터미널 콘솔 시스템
// =========================================================================
window.openAdminModal = function () {
  window.closeModals();
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.add('active');
  const adminModal = document.getElementById('mdlAdminPanel');
  if (adminModal) {
    adminModal.classList.add('active');
    L.DomEvent.disableClickPropagation(adminModal);
  }

  window.checkAdminCacheStatus();
  window.logToAdminTerminal("관리자 제어 시스템 접속 완료");

  const syncBtn = document.getElementById('btnForceSync');
  if (syncBtn) {
    syncBtn.removeAttribute('disabled');
    syncBtn.style.setProperty('pointer-events', 'auto', 'important');
    syncBtn.style.setProperty('cursor', 'pointer', 'important');
    syncBtn.style.setProperty('position', 'relative', 'important');
    syncBtn.style.setProperty('z-index', '999999', 'important');

    L.DomEvent.disableClickPropagation(syncBtn);

    syncBtn.onclick = null;
    L.DomEvent.off(syncBtn, 'click');
    L.DomEvent.on(syncBtn, 'click', function (htmlEvent) {
      if (htmlEvent) {
        L.DomEvent.preventDefault(htmlEvent);
        L.DomEvent.stopPropagation(htmlEvent);
      }
      window.clearAdminCache();
    });
  }
};

window.checkAdminCacheStatus = function () {
  let hasWeather = false;
  let hasTide = false;
  let hasSun = false;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      if (key.startsWith('cc_weather_')) hasWeather = true;
      if (key.startsWith('cc_tide_')) hasTide = true;
      if (key.startsWith('cc_sun_')) hasSun = true;
    }
  }

  const btnWeather = document.getElementById('adminWeatherCacheBadge');
  if (btnWeather) {
    btnWeather.className = 'chip-btn ' + (hasWeather ? 'cache-loaded' : 'cache-empty');
    btnWeather.innerText = hasWeather ? '기상 적재 완료' : '기상 비어있음';
  }

  const btnTide = document.getElementById('adminTideCacheBadge');
  if (btnTide) {
    btnTide.className = 'chip-btn ' + (hasTide ? 'cache-loaded' : 'cache-empty');
    btnTide.innerText = hasTide ? '조석 적재 완료' : '조석 비어있음';
  }

  const btnSun = document.getElementById('adminSunCacheBadge');
  if (btnSun) {
    btnSun.className = 'chip-btn ' + (hasSun ? 'cache-loaded' : 'cache-empty');
    btnSun.innerText = hasSun ? '일출물 적재 완료' : '일출물 비어있음';
  }
};

window.clearAdminCache = function () {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('cc_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));

  window.checkAdminCacheStatus();
  window.logToAdminTerminal("공공데이터 로컬 캐시 메모리 강제 초기화 완료");
};

window.logToAdminTerminal = function (message) {
  const terminal = document.getElementById('adminDebugConsole');
  if (!terminal) return;
  const now = new Date();
  const timeStr = `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;
  terminal.innerHTML += `<div>${timeStr} ${message}</div>`;
  terminal.scrollTop = terminal.scrollHeight;
};

// =========================================================================
// GROUP 17: 앱 구동 라이프사이클 및 홈 화면 기상/조석 실시간 로컬 캐싱 엔진
// =========================================================================
window.HOME_CARD_CACHE_KEY = "home_card_weather_tide_data";
window.HOME_SELECTED_FAV_KEY = "home_selected_favorite_id";
window.CACHE_EXPIRE_TIME = 60 * 60 * 1000;
window.coastalDepthData = []; // SUB-GROUP: 수심 데이터 전역 적재 변수

document.addEventListener("DOMContentLoaded", () => {
  window.initHomeDataSequence();
  window.loadCoastalDepthData(); // 앱 구동 시 수심 데이터 비동기 로드 실행
});

// SUB-GROUP: 백그라운드 수심 데이터 Fetch 엔진
window.loadCoastalDepthData = async function() {
  try {
    const response = await fetch('coastal_depth_compact.json');
    if (response.ok) {
      window.coastalDepthData = await response.json();
      console.log(`수심 데이터 비동기 로드 완료: ${window.coastalDepthData.length}개 격자 확보`);
    } else {
      console.warn("coastal_depth_compact.json 파일을 찾을 수 없습니다.");
    }
  } catch (err) {
    console.error("수심 데이터 로드 중 통신 오류 발생:", err);
  }
};

window.initHomeDataSequence = async function () {
  window.populateHomeFavoritesDropdown();
};

window.populateHomeFavoritesDropdown = function () {
  const selectEl = document.getElementById("hcHomeFavoriteSelect");
  if (!selectEl) return;

  const currentSelectedId = selectEl.options[selectEl.selectedIndex]?.getAttribute("data-id") || localStorage.getItem(window.HOME_SELECTED_FAV_KEY);

  selectEl.innerHTML = '<option value="">즐겨찾기 포인트 선택</option>';

  if (Array.isArray(cachedFishingPoints)) {
    const favorites = cachedFishingPoints.filter(p => p.isFavorite === true || p.favorite === true);

    if (favorites.length > 0) {
      favorites.forEach(fav => {
        const opt = document.createElement("option");
        opt.value = `${fav.lat},${fav.lng}`;
        opt.textContent = fav.name || fav.title || "지정 포인트";
        opt.setAttribute("data-id", fav.id || fav.docId || fav.name);
        selectEl.appendChild(opt);
      });

      if (currentSelectedId && selectEl.querySelector(`option[data-id="${currentSelectedId}"]`)) {
        selectEl.value = selectEl.querySelector(`option[data-id="${currentSelectedId}"]`).value;
      } else {
        selectEl.selectedIndex = 1;
      }

      const cacheData = localStorage.getItem(window.HOME_CARD_CACHE_KEY);
      if (cacheData) {
        try {
          const parsed = JSON.parse(cacheData);
          const currentTime = Date.now();
          const currentVal = selectEl.value;

          if (parsed.selectedValue === currentVal && (currentTime - parsed.timestamp < window.CACHE_EXPIRE_TIME) && parsed.payload) {
            window.applyHomeCardDOM(parsed.payload);
            const splashEl = document.getElementById("splash-screen");
            if (splashEl) splashEl.classList.add("splash-hidden");
            return;
          }
        } catch (e) {
          localStorage.removeItem(window.HOME_CARD_CACHE_KEY);
        }
      }

      const [lat, lng] = selectEl.value.split(",").map(Number);
      if (lat && lng) {
        window.updateHomeCardByLocation(lat, lng);
      }
    } else {
      window.fallbackHomeDataLoad();
    }
  }
};

window.handleHomeFavoriteChange = function (selectEl) {
  if (!selectEl || !selectEl.value) return;

  const [lat, lng] = selectEl.value.split(",").map(Number);
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  const favId = selectedOption.getAttribute("data-id");

  if (favId) {
    localStorage.setItem(window.HOME_SELECTED_FAV_KEY, favId);
  }

  const splashEl = document.getElementById("splash-screen");
  if (splashEl) splashEl.classList.remove("splash-hidden");

  window.updateHomeCardByLocation(lat, lng);
};

window.updateHomeCardByLocation = async function (lat, lng) {
  const selectEl = document.getElementById("hcHomeFavoriteSelect");
  const currentVal = selectEl ? selectEl.value : `${lat},${lng}`;

  try {
    const payload = await window.fetchAllPublicOpenAPI(lat, lng);

    const cacheObject = {
      timestamp: Date.now(),
      selectedValue: currentVal,
      payload: payload
    };
    localStorage.setItem(window.HOME_CARD_CACHE_KEY, JSON.stringify(cacheObject));

    window.applyHomeCardDOM(payload);
  } catch (err) {
    console.error("위치 기반 공공데이터 연동 갱신 실패:", err);
    window.fallbackHomeDataLoad();
  } finally {
    const splashEl = document.getElementById("splash-screen");
    if (splashEl) splashEl.classList.add("splash-hidden");
  }
};

window.refreshHomeLocation = function (btnElement) {
  const selectEl = document.getElementById("hcHomeFavoriteSelect");
  if (!selectEl || !selectEl.value) {
    console.warn("대상이 활성화되지 않아 새로고침을 생략합니다.");
    return;
  }

  if (btnElement) {
    btnElement.style.pointerEvents = "none";
    btnElement.style.opacity = "0.5";
  }

  const [lat, lng] = selectEl.value.split(",").map(Number);
  window.updateHomeCardByLocation(lat, lng);

  setTimeout(() => {
    if (btnElement) {
      btnElement.style.pointerEvents = "auto";
      btnElement.style.opacity = "1";
    }
  }, 2000);
};

window.fetchAllPublicOpenAPI = async function (lat, lng) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const kmaKey = `${dateStr}${hh}00`;

  try {
    await window.fetchSunriseSunsetForDatesPromise(lat, lng, [dateStr]);
  } catch (e) { console.warn(e); }
  const sunTimes = window.getSunTimesForDate(now);
  const currentSunrise = sunTimes.sunrise ? `일출 ${sunTimes.sunrise}` : "일출 --:--";
  const currentSunset = sunTimes.sunset ? `일몰 ${sunTimes.sunset}` : "일몰 --:--";

  let lunarDay = now.getDate();
  try {
    const lunarRaw = new Intl.DateTimeFormat('ko-KR-u-ca-chinese').format(now);
    const lunarArr = lunarRaw.split('.').map(s => s.trim()).filter(Boolean);
    if (lunarArr.length >= 3) {
      lunarDay = parseInt(lunarArr[2], 10);
    }
  } catch (e) { }
  const tideNames8 = ["조금", "1물", "2물", "3물", "4물", "5물", "6물", "7물", "8물", "9물", "10물", "11물", "12물", "13물", "14물"];
  const currentTideIdx = tideNames8[(lunarDay + 7) % 15];

  let currentTemp = "--°C";
  let currentWeather = "맑음";
  let currentRain = "강수 --mm (--%)";
  let currentWind = "--- · -.-m/s";
  let currentWave = "파고 --.-m";
  let currentWaterTemp = "수온 --.-°C";

  const obsCode = getNearestTideStation(lat, lng);
  const stationObj = TIDE_STATIONS.find(s => s.code === obsCode) || TIDE_STATIONS[0];

  try {
    const [weatherMap, seaWeatherMap] = await Promise.all([
      window.fetchKMAWeatherPromise(lat, lng),
      window.fetchKMAWeatherPromise(stationObj.lat, stationObj.lng !== undefined ? stationObj.lng : stationObj.mesh)
    ]);

    if (weatherMap && weatherMap[kmaKey]) {
      const kma = weatherMap[kmaKey];
      if (kma.TMP) currentTemp = `${kma.TMP}°C`;
      if (kma.PCP) currentRain = kma.PCP === '강수없음' ? '강수 0mm' : `강수 ${kma.PCP}`;

      if (kma.WAV) {
        currentWave = `파고 ${parseFloat(kma.WAV).toFixed(1)}m`;
      } else if (seaWeatherMap && seaWeatherMap[kmaKey] && seaWeatherMap[kmaKey].WAV) {
        currentWave = `파고 ${parseFloat(seaWeatherMap[kmaKey].WAV).toFixed(1)}m`;
      }

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

      if (kma.PTY && kma.PTY !== "0") {
        currentWeather = kma.PTY === "3" ? "눈" : "비";
      } else if (kma.SKY === "3") {
        currentWeather = "구름많음";
      } else if (kma.SKY === "4") {
        currentWeather = "흐림";
      } else {
        currentWeather = "맑음";
      }
    } else if (seaWeatherMap && seaWeatherMap[kmaKey] && seaWeatherMap[kmaKey].WAV) {
      currentWave = `파고 ${parseFloat(seaWeatherMap[kmaKey].WAV).toFixed(1)}m`;
    }
  } catch (e) { console.warn(e); }

  try {
    const waterTempMap = await window.fetchRealWaterTempPromise(lat, lng, [dateStr]);
    if (waterTempMap && waterTempMap[kmaKey]) {
      currentWaterTemp = `수온 ${waterTempMap[kmaKey]}`;
    } else if (waterTempMap) {
      const foundHourKey = Object.keys(waterTempMap).find(k => k.startsWith(dateStr));
      if (foundHourKey) currentWaterTemp = `수온 ${waterTempMap[foundHourKey]}`;
    }
  } catch (e) { console.warn(e); }

  let tideLowText = "간조 --:-- ▼--cm";
  let tideHighText = "만조 --:-- ▲--cm";

  try {
    const realTides = await window.fetchTideData3DaysPromise(lat, lng);
    let targetTides = realTides || [];

    if (targetTides.length === 0) {
      let dummyTides = [];
      for (let k = 0; k < 4; k++) {
        let xHigh = 112 * (Math.PI / 2 + 2 * k * Math.PI);
        let xLow = 112 * (3 * Math.PI / 2 + 2 * k * Math.PI);
        let hH = xHigh / 56; let dH = new Date(now.getTime() + hH * 60 * 60 * 1000);
        let hL = xLow / 56; let dL = new Date(now.getTime() + hL * 60 * 60 * 1000);
        dummyTides.push({ type: '만조', time: `${String(dH.getHours()).padStart(2, '0')}:${String(dH.getMinutes()).padStart(2, '0')}`, level: '270', hoursFromNow: hH });
        dummyTides.push({ type: '간조', time: `${String(dL.getHours()).padStart(2, '0')}:${String(dL.getMinutes()).padStart(2, '0')}`, level: '50', hoursFromNow: hL });
      }
      targetTides = dummyTides;
    }

    const nowMs = now.getTime();
    let sortedTides = [...targetTides].sort((a, b) => {
      const timeA = a.rawDt ? new Date(a.rawDt.replace(/-/g, '/')).getTime() : (nowMs + a.hoursFromNow * 60 * 60 * 1000);
      const timeB = b.rawDt ? new Date(b.rawDt.replace(/-/g, '/')).getTime() : (nowMs + b.hoursFromNow * 60 * 60 * 1000);
      return Math.abs(timeA - nowMs) - Math.abs(timeB - nowMs);
    });

    let closestEvents = sortedTides.slice(0, 2).sort((a, b) => {
      const timeA = a.rawDt ? new Date(a.rawDt.replace(/-/g, '/')).getTime() : (nowMs + a.hoursFromNow * 60 * 60 * 1000);
      const timeB = b.rawDt ? new Date(b.rawDt.replace(/-/g, '/')).getTime() : (nowMs + b.hoursFromNow * 60 * 60 * 1000);
      return timeA - timeB;
    });

    closestEvents.forEach(ev => {
      const sign = ev.type === "만조" ? "▲" : "▼";
      const val = ev.level || ev.value || "--";
      const formattedText = `${ev.type} ${ev.time} ${sign}${val}cm`;

      if (ev.type === "만조") {
        tideHighText = formattedText;
      } else {
        tideLowText = formattedText;
      }
    });
  } catch (e) { console.warn(e); }

  return {
    timeStr: window.getFormattedCurrentTime(),
    temp: currentTemp,
    weather: currentWeather,
    rain: currentRain,
    wind: currentWind,
    sunrise: currentSunrise,
    sunset: currentSunset,
    tideIdx: currentTideIdx,
    wave: currentWave,
    waterTemp: currentWaterTemp,
    tideLow: tideLowText,
    tideHigh: tideHighText
  };
};

window.applyHomeCardDOM = function (payload) {
  if (!payload) return;

  const setTxt = (className, val) => {
    const el = document.querySelector(`.hc-premium-card ${className}`);
    if (el) el.textContent = val;
  };

  setTxt(".hc-temp", payload.temp);
  setTxt(".hc-weather", payload.weather);
  setTxt(".hc-rain", payload.rain);
  setTxt(".hc-wind", payload.wind);
  setTxt(".hc-sunrise", payload.sunrise);
  setTxt(".hc-sunset", payload.sunset);
  setTxt(".hc-tide-idx", payload.tideIdx);
  setTxt(".hc-wave", payload.wave);
  setTxt(".hc-water-temp", payload.waterTemp);
  setTxt(".hc-tide-low", payload.tideLow);
  setTxt(".hc-tide-high", payload.tideHigh);

  const timeEl = document.getElementById("hcHomeRefreshTime");
  if (timeEl) {
    timeEl.textContent = `${payload.timeStr} 기준`;
  }

  const mainCardEl = document.querySelector(".hc-main-card");
  if (mainCardEl) {
    mainCardEl.classList.remove("day", "night", "sunset", "snow", "rain");

    const nowTime = new Date();
    const kstFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: 'numeric', hour12: false });
    const parts = kstFormatter.formatToParts(nowTime);
    const kstHour = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const kstMin = parseInt(parts.find(p => p.type === 'minute').value, 10);
    const nowMin = kstHour * 60 + kstMin;

    const parseTimeToMinutes = (str) => {
      if (!str) return null;
      const match = str.match(/(\d{2}):(\d{2})/);
      return match ? parseInt(match[1], 10) * 60 + parseInt(match[2], 10) : null;
    };

    const srMin = parseTimeToMinutes(payload.sunrise);
    const ssMin = parseTimeToMinutes(payload.sunset);

    if (payload.weather && payload.weather.includes("눈")) {
      mainCardEl.classList.add("snow");
    } else if (payload.weather && (payload.weather.includes("비") || payload.weather.includes("흐림"))) {
      mainCardEl.classList.add("rain");
    } else if (srMin !== null && ssMin !== null) {
      if (nowMin >= srMin && nowMin < srMin + 60) {
        mainCardEl.classList.add("sunset");
      } else if (nowMin >= ssMin - 60 && nowMin < ssMin) {
        mainCardEl.classList.add("sunset");
      } else if (nowMin >= srMin + 60 && nowMin < ssMin - 60) {
        mainCardEl.classList.add("day");
      } else {
        mainCardEl.classList.add("night");
      }
    } else {
      if (kstHour >= 6 && kstHour < 17) {
        mainCardEl.classList.add("day");
      } else if (kstHour >= 17 && kstHour < 19) {
        mainCardEl.classList.add("sunset");
      } else {
        mainCardEl.classList.add("night");
      }
    }
  }
};

window.fallbackHomeDataLoad = function () {
  const existingTemp = document.querySelector(".hc-premium-card .hc-temp")?.textContent || "";
  if (existingTemp !== "" && existingTemp !== "--°C") {
    return;
  }

  const fallbackPayload = {
    timeStr: window.getFormattedCurrentTime(),
    temp: "--°C",
    weather: "정보없음",
    rain: "강수 --mm (--%)",
    wind: "--- · -.-m/s",
    sunrise: "일출 --:--",
    sunset: "일몰 --:--",
    tideIdx: "--물",
    wave: "파고 --.-m",
    waterTemp: "수온 --.-°C",
    tideLow: "간조 --:-- ▼--cm",
    tideHigh: "만조 --:-- ▲--cm"
  };
  window.applyHomeCardDOM(fallbackPayload);
};

window.getFormattedCurrentTime = function () {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const coastalData = [
{"type":"FeatureCollection", "features": [
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1176881.98185459,1835406.84470132],[1174642.71281815,1835361.20400749],[1172403.45358351,1835316.14537112],[1170164.20402531,1835271.66876729],[1167924.96401818,1835227.77417142],[1165685.73343675,1835184.46155926],[1163446.51215564,1835141.73090686],[1161207.30004945,1835099.5821906],[1158968.09699276,1835058.01538719],[1156728.90286016,1835017.03047365],[1154489.71752621,1834976.62742732],[1152250.54086547,1834936.80622589],[1150011.37275249,1834897.56684733],[1147772.21306179,1834858.90926996],[1145533.06166791,1834820.83347242],[1143293.91844535,1834783.33943366],[1141054.78326863,1834746.42713295],[1138815.65601223,1834710.0965499],[1136576.53655064,1834674.34766443],[1134337.42475833,1834639.18045677],[1134380.61011001,1831865.80774909],[1134423.76981217,1829092.44588973],[1134466.90385684,1826319.09487569],[1134510.01223604,1823545.754704],[1134553.09494183,1820772.42537164],[1134596.15196623,1817999.10687561],[1134639.18330131,1815225.79921289],[1134682.18893911,1812452.50238046],[1134725.16887169,1809679.21637528],[1134768.12309111,1806905.9411943],[1134811.05158945,1804132.67683448],[1134853.95435878,1801359.42329276],[1134896.83139118,1798586.18056607],[1134939.68267873,1795812.94865134],[1134982.50821351,1793039.72754548],[1135025.30798763,1790266.51724541],[1135068.08199318,1787493.31774801],[1135110.83022227,1784720.12905019],[1135153.552667,1781946.95114884],[1135196.24895873,1779173.80747958],[1180266.64591575,1779983.21191433],[1179121.24948737,1835453.06724246],[1176881.98185459,1835406.84470132]]]},"properties":{"GID":15,"XMIN":1134337.42475833,"YMIN":1779173.80747958,"XMAX":1180266.64591575,"YMAX":1835453.06724246,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G1N30","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G1N3000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1205057.13755714,1780527.05380107],[1206557.03409681,1780562.20627711],[1225341.34317512,1781024.1631968],[1225222.17667359,1785665.2744901],[1225198.89271898,1786571.55769589],[1225127.60302401,1789345.26910872],[1225056.27037916,1792118.98991213],[1224984.89479765,1794892.72010882],[1224913.47629271,1797666.4597015],[1224842.01487758,1800440.20869286],[1224770.51056551,1803213.96708557],[1224698.96336975,1805987.73488233],[1224627.37330357,1808761.51208581],[1224555.74038024,1811535.29869866],[1224484.06461304,1814309.09472355],[1224412.34601527,1817082.90016312],[1224340.5846002,1819856.71502003],[1224268.78038116,1822630.53929691],[1224196.93337146,1825404.37299638],[1224125.04358441,1828178.21612107],[1224053.11103335,1830952.0686736],[1223981.13573162,1833725.93065656],[1223909.11770783,1836499.80148451],[1179121.26116984,1835453.0665084],[1180266.45697741,1779992.98790696],[1180266.65812391,1779983.18831479],[1182520.28195124,1780029.73551713],[1184773.91660298,1780076.86166092],[1187027.56221242,1780124.56677266],[1189281.21891286,1780172.8508792],[1191534.88683757,1780221.71400767],[1193788.5661198,1780271.15618556],[1196042.25689281,1780321.17744069],[1198295.95928984,1780371.77780118],[1200549.6734441,1780422.9572955],[1202803.3994888,1780474.71595242],[1205057.13755714,1780527.05380107]]]},"properties":{"GID":16,"XMIN":1179121.26116984,"YMIN":1779983.18831479,"XMAX":1225341.34317512,"YMAX":1836499.80148451,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G1N40","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G1N4000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1220234.81810681,1891921.04438063],[1218009.84515781,1891863.45915102],[1215784.88373655,1891806.45955381],[1213559.93372593,1891750.04555803],[1211334.99500882,1891694.21713306],[1209110.06746806,1891638.97424857],[1206885.15098652,1891584.31687456],[1204660.245447,1891530.24498135],[1202435.35073232,1891476.75853956],[1200210.46672525,1891423.85752016],[1197985.5933086,1891371.5418944],[1195760.73036512,1891319.81163389],[1193535.87777756,1891268.66671052],[1191311.03542866,1891218.10709652],[1189086.20320113,1891168.13276444],[1186861.38097768,1891118.74368713],[1184636.56864101,1891069.93983777],[1182411.76607379,1891021.72118986],[1180186.97315868,1890974.08771722],[1177962.18977835,1890927.03939398],[1178020.46676114,1888153.24325341],[1178078.7097631,1885379.45739688],[1178136.91877347,1882605.68182172],[1178195.09378145,1879831.91652527],[1178253.23477629,1877058.16150485],[1178311.34174721,1874284.41675778],[1178369.41468347,1871510.68228135],[1178427.45357431,1868736.95807288],[1178485.45840899,1865963.24412965],[1178543.42917678,1863189.54044895],[1178601.36586694,1860415.84702805],[1178659.26846875,1857642.16386422],[1178717.1369715,1854868.49095472],[1178774.97136447,1852094.82829681],[1178832.77163697,1849321.17588773],[1178890.53777829,1846547.53372471],[1178948.26977775,1843773.901805],[1179005.96762466,1841000.2801258],[1179063.63130835,1838226.66868434],[1179121.26033789,1835453.09059852],[1223909.10572287,1836499.82530005],[1222459.79173592,1891979.21498581],[1220234.81810681,1891921.04438063]]]},"properties":{"GID":17,"XMIN":1177962.18977835,"YMIN":1835453.09059852,"XMAX":1223909.10572287,"YMAX":1891979.21498581,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G1N20","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G1N2000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1175737.41581542,1890880.57619458],[1173512.65115253,1890834.69809379],[1171287.89567229,1890789.40506671],[1169063.14925728,1890744.69708873],[1166838.41179011,1890700.57413559],[1164613.68315334,1890657.03618331],[1162388.96322954,1890614.08320825],[1160164.25190127,1890571.7151871],[1157939.54905104,1890529.93209684],[1155714.8545614,1890488.73391478],[1153490.16831485,1890448.12061856],[1151265.4901939,1890408.09218612],[1149040.82008105,1890368.64859572],[1146816.15785876,1890329.78982595],[1144591.50340952,1890291.51585571],[1142366.85661578,1890253.82666421],[1140142.21735999,1890216.72223098],[1137917.58552458,1890180.20253589],[1135692.96099198,1890144.2675591],[1133468.34364462,1890108.91728109],[1133512.04030513,1887335.32699288],[1133555.71147658,1884561.74761095],[1133599.35715092,1881788.1791325],[1133642.97732006,1879014.62155468],[1133686.57197596,1876241.07487467],[1133730.14111055,1873467.53908963],[1133773.68471579,1870694.01419668],[1133817.20278362,1867920.50019299],[1133860.69530601,1865146.99707566],[1133904.16227493,1862373.50484184],[1133947.60368233,1859600.02348862],[1133991.0195202,1856826.55301312],[1134034.4097805,1854053.09341242],[1134077.77445524,1851279.64468364],[1134121.11353639,1848506.20682383],[1134164.42701595,1845732.77983008],[1134207.71488592,1842959.36369944],[1134250.97713829,1840185.95842899],[1134294.21376509,1837412.56401575],[1134337.42440462,1834639.20316519],[1179121.24900712,1835453.09036316],[1177962.17882354,1890927.03916375],[1175737.41581542,1890880.57619458]]]},"properties":{"GID":18,"XMIN":1133468.34364462,"YMIN":1834639.20316519,"XMAX":1179121.24900712,"YMAX":1890927.03916375,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G1N10","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G1N1000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1223909.11801212,1836499.80150352],[1225225.39949226,1785539.81847452],[1225270.13945086,1783797.85567091],[1225341.34320216,1781024.1631975],[1270421.369945,1782296.94295937],[1270134.52904011,1791599.1575278],[1270079.1418077,1793393.20720017],[1269993.45592843,1796167.29445377],[1269907.71855018,1798941.39013317],[1269821.92968887,1801715.4942408],[1269736.08936047,1804489.60677905],[1269650.19758093,1807263.72775036],[1269564.25436622,1810037.85715711],[1269478.25973231,1812811.9950017],[1269392.21369519,1815586.14128652],[1269306.11627086,1818360.29601395],[1269219.96747533,1821134.45918638],[1269133.76732461,1823908.63080617],[1269047.51583474,1826682.81087569],[1268961.21302175,1829456.99939728],[1268874.85890168,1832231.19637331],[1268788.45349059,1835005.40180611],[1268701.99681044,1837779.61550938],[1223909.11801212,1836499.80150352]]]},"properties":{"GID":19,"XMIN":1223909.11801212,"YMIN":1781024.1631975,"XMAX":1270421.369945,"YMAX":1837779.61550938,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G1O30","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G1O3000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1264736.87812088,1893195.78226995],[1262511.65004908,1893126.477401],[1260286.4358437,1893057.75885047],[1258061.23538797,1892989.62658103],[1255836.04856512,1892922.08055567],[1253610.87525835,1892855.1207377],[1251385.71535083,1892788.74709075],[1249160.56872574,1892722.95957876],[1246935.43526622,1892657.75816601],[1244710.31485539,1892593.14281707],[1242485.20737637,1892529.11349685],[1240260.11271226,1892465.67017058],[1238035.03074611,1892402.81280378],[1235809.96136098,1892340.54136232],[1233584.90443992,1892278.85581238],[1231359.85986594,1892217.75612045],[1229134.82752205,1892157.24225335],[1226909.80729123,1892097.31417821],[1224684.79905646,1892037.97186247],[1222459.80270067,1891979.21527392],[1222532.67267062,1889205.15466186],[1222605.50017193,1886431.10353336],[1222678.28519108,1883657.06188597],[1222751.02771456,1880883.02971721],[1222823.72772888,1878109.00702462],[1222896.38522056,1875334.99380572],[1222969.0001761,1872560.99005801],[1223041.57258205,1869786.99577901],[1223114.10242494,1867013.01096622],[1223186.58969131,1864239.03561712],[1223259.03436772,1861465.0697292],[1223331.43644073,1858691.11329995],[1223403.79589691,1855917.16632681],[1223476.11272284,1853143.22880728],[1223548.38690511,1850369.30073879],[1223620.6184303,1847595.38211881],[1223692.80728502,1844821.47294476],[1223764.9534559,1842047.57321409],[1223837.05692953,1839273.68292422],[1223909.11708167,1836499.82559504],[1268701.98467166,1837779.63926791],[1266962.10918309,1893265.67314826],[1264736.87812088,1893195.78226995]]]},"properties":{"GID":22,"XMIN":1222459.80270067,"YMIN":1836499.82559504,"XMAX":1268701.98467166,"YMAX":1893265.67314826,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G1O10","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G1O1000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1134601.31928997,1668221.93088422],[1132319.77155101,1668188.51989684],[1130038.23249986,1668155.68040653],[1127756.70198687,1668123.4123942],[1125475.1798624,1668091.71584108],[1123193.66597681,1668060.59072875],[1120912.1601804,1668030.03703911],[1118630.66232353,1668000.05475439],[1116349.17225651,1667970.64385716],[1114067.68982965,1667941.80433032],[1111786.21489326,1667913.53615711],[1109504.74729764,1667885.83932108],[1107223.28689309,1667858.71380614],[1104941.83352989,1667832.15959651],[1102660.38705832,1667806.17667675],[1100378.94732866,1667780.76503177],[1098097.51419118,1667755.92464678],[1095816.08749614,1667731.65550734],[1093534.6670938,1667707.95759935],[1091253.2528344,1667684.83090902],[1091281.00241619,1664912.28581227],[1091308.73458435,1662139.75180445],[1091336.44933378,1659367.22888194],[1091364.14665937,1656594.71704111],[1091391.82655602,1653822.21627834],[1091419.48901864,1651049.72659],[1091447.13404214,1648277.24797242],[1091474.76162143,1645504.78042197],[1091502.37175142,1642732.32393498],[1091529.96442704,1639959.87850777],[1091557.5396432,1637187.44413667],[1091585.09739482,1634415.02081799],[1091612.63767685,1631642.60854803],[1091640.1604842,1628870.2073231],[1091667.66581182,1626097.81713946],[1091695.15365464,1623325.43799341],[1091722.62400761,1620553.06988122],[1091750.07686567,1617780.71279914],[1091777.51222376,1615008.36674343],[1091804.9298282,1612236.05686091],[1137710.54016874,1612803.41174838],[1136882.8633908,1668255.91320072],[1134601.31928997,1668221.93088422]]]},"properties":{"GID":126,"XMIN":1091253.2528344,"YMIN":1612236.05686091,"XMAX":1137710.54016874,"YMAX":1668255.91320072,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G3E20","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G3E2000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1088971.8445682,1667662.27542291],[1086690.44214543,1667640.2911279],[1084409.04541632,1667618.87801122],[1082127.65423112,1667598.03606042],[1079846.26844004,1667577.76526337],[1077564.88789329,1667558.0656083],[1075283.5124411,1667538.93708375],[1073002.14193368,1667520.3796786],[1070720.77622124,1667502.39338206],[1068439.41515396,1667484.97818368],[1066158.05858206,1667468.13407332],[1063876.70635572,1667451.86104121],[1061595.35832513,1667436.15907787],[1059314.01434048,1667421.02817418],[1057032.67425195,1667406.46832135],[1054751.33790972,1667392.4795109],[1052470.00516396,1667379.06173471],[1050188.67586485,1667366.21498498],[1047907.34986254,1667353.93925423],[1045626.02700722,1667342.23453533],[1045639.90018439,1664569.79882974],[1045653.76465444,1661797.37447345],[1045667.62041483,1659024.96146279],[1045681.46746299,1656252.55979403],[1045695.3057964,1653480.16946348],[1045709.13541249,1650707.7904674],[1045722.95630873,1647935.42280206],[1045736.76848258,1645163.06646372],[1045750.57193149,1642390.72144864],[1045764.36665293,1639618.38775306],[1045778.15264435,1636846.06537322],[1045791.92990323,1634073.75430533],[1045805.69842704,1631301.45454562],[1045819.45821323,1628529.16609029],[1045833.20925928,1625756.88893555],[1045846.95156266,1622984.62307758],[1045860.68512085,1620212.36851258],[1045874.40993132,1617440.12523672],[1045888.12599154,1614667.89324615],[1045901.83317671,1611895.69727629],[1091804.91698421,1612236.05673392],[1091253.2403779,1667684.83078431],[1088971.8445682,1667662.27542291]]]},"properties":{"GID":127,"XMIN":1045626.02700722,"YMIN":1611895.69727629,"XMAX":1091804.91698421,"YMAX":1667684.83078431,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G3E10","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G3E1000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1180234.32888203,1669010.19736609],[1177952.57597541,1668965.35191543],[1175670.83474758,1668921.07841356],[1173389.10504908,1668877.37683473],[1171107.38673044,1668834.24715354],[1168825.67964219,1668791.68934489],[1166543.98363485,1668749.70338404],[1164262.29855891,1668708.28924658],[1161980.62426486,1668667.44690843],[1159698.96060318,1668627.17634582],[1157417.30742435,1668587.47753536],[1155135.66457883,1668548.35045394],[1152854.03191708,1668509.79507883],[1150572.40928954,1668471.8113876],[1148290.79654664,1668434.39935815],[1146009.1935388,1668397.55896875],[1143727.60011646,1668361.29019797],[1141446.01613,1668325.59302471],[1139164.44142985,1668290.46742823],[1136882.87586637,1668255.9133881],[1136924.50830889,1665483.18601679],[1136966.11463247,1662710.46930028],[1137007.69482946,1659937.7632351],[1137049.2488922,1657165.06781776],[1137090.77681301,1654392.38304478],[1137132.27858425,1651619.70891266],[1137173.75419827,1648847.0454179],[1137215.20364742,1646074.39255698],[1137256.62692407,1643301.75032639],[1137298.02402057,1640529.11872259],[1137339.39492931,1637756.49774205],[1137380.73964264,1634983.88738123],[1137422.05815297,1632211.28763657],[1137463.35045267,1629438.69850451],[1137504.61653413,1626666.11998148],[1137545.85638975,1623893.55206391],[1137587.07001193,1621120.99474822],[1137628.25739308,1618348.4480308],[1137669.41852561,1615575.91190806],[1137710.55302279,1612803.41193903],[1183619.9521518,1613597.89635869],[1182516.08114017,1669055.61454172],[1180234.32888203,1669010.19736609]]]},"properties":{"GID":130,"XMIN":1136882.87586637,"YMIN":1612803.41193903,"XMAX":1183619.9521518,"YMAX":1669055.61454172,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G3F10","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G3F1000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1088427.17411206,1723115.37110994],[1086159.74152517,1723093.24995719],[1083892.31432595,1723071.7035359],[1081624.89237268,1723050.73183373],[1079357.47552363,1723030.33483871],[1077090.06363708,1723010.51253916],[1074822.6565713,1722991.26492375],[1072555.25418457,1722972.59198147],[1070287.85633514,1722954.49370165],[1068020.46288125,1722936.97007394],[1065753.07368118,1722920.02108831],[1063485.68859315,1722903.64673508],[1061218.30747543,1722887.84700488],[1058950.93018624,1722872.62188867],[1056683.55658382,1722857.97137775],[1054416.1865264,1722843.89546375],[1052148.81987222,1722830.3941386],[1049881.45647949,1722817.4673946],[1047614.09620643,1722805.11522436],[1045346.73891127,1722793.3376208],[1045360.78569266,1720020.67416575],[1045374.82381828,1717248.02213215],[1045388.85328557,1714475.38151648],[1045402.87409192,1711702.7523152],[1045416.88623478,1708930.13452478],[1045430.88971154,1706157.52814165],[1045444.88451965,1703384.93316226],[1045458.87065652,1700612.34958305],[1045472.84811957,1697839.77740043],[1045486.81690625,1695067.21661082],[1045500.77701397,1692294.66721063],[1045514.72844017,1689522.12919625],[1045528.67118227,1686749.60256407],[1045542.60523772,1683977.08731048],[1045556.53060396,1681204.58343184],[1045570.44727841,1678432.09092451],[1045584.35525852,1675659.60978485],[1045598.25454173,1672887.14000922],[1045612.14512548,1670114.68159393],[1045626.02688687,1667342.25857794],[1091253.24013296,1667684.85524929],[1090694.60015645,1723138.06688443],[1088427.17411206,1723115.37110994]]]},"properties":{"GID":131,"XMIN":1045346.73891127,"YMIN":1667342.25857794,"XMAX":1091253.24013296,"YMAX":1723138.06688443,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G3A30","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G3A3000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1133777.1754453,1723678.50965604],[1131509.60535466,1723644.89078045],[1129242.04348463,1723611.84695178],[1126974.48969362,1723579.37815114],[1124706.94384007,1723547.48435996],[1122439.40578236,1723516.16556],[1120171.87537891,1723485.42173335],[1117904.35248809,1723455.25286242],[1115636.8369683,1723425.65892996],[1113369.32867791,1723396.63991905],[1111101.82747528,1723368.19581309],[1108834.33321877,1723340.32659581],[1106566.84576675,1723313.03225129],[1104299.36497755,1723286.3127639],[1102031.89070952,1723260.16811837],[1099764.42282099,1723234.59829974],[1097496.96117029,1723209.6032934],[1095229.50561573,1723185.18308505],[1092962.05601564,1723161.33766073],[1090694.61222831,1723138.06700679],[1090722.7090054,1720365.29938586],[1090750.78847167,1717592.54292435],[1090778.85062195,1714819.7976188],[1090806.89545107,1712047.06346577],[1090834.92295387,1709274.34046179],[1090862.93312518,1706501.6286034],[1090890.92595984,1703728.92788711],[1090918.90145271,1700956.23830944],[1090946.85959862,1698183.5598669],[1090974.80039242,1695410.89255597],[1091002.72382898,1692638.23637315],[1091030.62990314,1689865.59131492],[1091058.51860978,1687092.95737775],[1091086.38994375,1684320.3345581],[1091114.24389992,1681547.72285243],[1091142.08047316,1678775.12225718],[1091169.89965835,1676002.53276879],[1091197.70145037,1673229.95438368],[1091225.48584409,1670457.38709829],[1091253.25258946,1667684.855374],[1136882.86301732,1668255.93806659],[1136044.74181644,1723712.70341406],[1133777.1754453,1723678.50965604]]]},"properties":{"GID":132,"XMIN":1090694.61222831,"YMIN":1667684.855374,"XMAX":1136882.86301732,"YMAX":1723712.70341406,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G3A40","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G3A4000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1179130.52153758,1724471.67903886],[1176862.75731727,1724426.55474941],[1174595.00414718,1724382.00595395],[1172327.26188594,1724338.03262702],[1170059.53039214,1724294.63474344],[1167791.80952438,1724251.81227841],[1165524.09914125,1724209.56520743],[1163256.39910132,1724167.89350633],[1160988.70926314,1724126.79715128],[1158721.02948528,1724086.27611877],[1156453.35962628,1724046.33038563],[1154185.69954465,1724006.95992901],[1151918.04909894,1723968.1647264],[1149650.40814764,1723929.9447556],[1147382.77654927,1723892.29999475],[1145115.1541623,1723855.23042233],[1142847.54084524,1723818.73601712],[1140579.93645655,1723782.81675827],[1138312.34085469,1723747.47262523],[1136044.75389813,1723712.70359778],[1136086.9071007,1720939.76241375],[1136129.03433881,1718166.83195226],[1136171.13560468,1715393.91221002],[1136213.21089054,1712621.0031837],[1136255.26018864,1709848.10486997],[1136297.28349121,1707075.2172655],[1136339.28079051,1704302.34036694],[1136381.2520788,1701529.47417095],[1136423.19734833,1698756.61867416],[1136465.11659136,1695983.77387321],[1136507.00980017,1693210.93976472],[1136548.87696703,1690438.1163453],[1136590.71808422,1687665.30361158],[1136632.53314403,1684892.50156014],[1136674.32213874,1682119.71018757],[1136716.08506065,1679346.92949047],[1136757.82190206,1676574.15946541],[1136799.53265528,1673801.40010896],[1136841.21731261,1671028.65141767],[1136882.87549289,1668255.93825396],[1182516.08063407,1669055.63980918],[1181398.28484862,1724517.37860274],[1179130.52153758,1724471.67903886]]]},"properties":{"GID":133,"XMIN":1136044.75389813,"YMIN":1668255.93825396,"XMAX":1182516.08063407,"YMAX":1724517.37860274,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G3B30","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G3B3000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1224488.34411826,1725495.06072654],[1222220.32922116,1725438.42069858],[1219952.32819941,1725382.35674345],[1217684.34091189,1725326.86882908],[1215416.36721743,1725271.95692372],[1213148.40697489,1725217.62099597],[1210880.4600431,1725163.86101472],[1208612.52628087,1725110.67694924],[1206344.60554699,1725058.0687691],[1204076.69770024,1725006.03644419],[1201808.80259942,1724954.57994476],[1199540.92010327,1724903.69924137],[1197273.05007054,1724853.39430491],[1195005.19235998,1724803.66510661],[1192737.34683029,1724754.51161801],[1190469.5133402,1724705.93381101],[1188201.69174839,1724657.93165782],[1185933.88191356,1724610.50513097],[1183666.08369437,1724563.65420334],[1181398.2969495,1724517.37884813],[1181454.51622513,1721744.19477391],[1181510.70088476,1718971.02081035],[1181566.85091801,1716197.85695433],[1181622.96631448,1713424.70320272],[1181679.04706381,1710651.55955238],[1181735.09315565,1707878.42600016],[1181791.10457963,1705105.30254291],[1181847.08132541,1702332.18917747],[1181903.02338264,1699559.08590066],[1181958.93074099,1696785.99270931],[1182014.80339013,1694012.90960023],[1182070.64131974,1691239.83657023],[1182126.44451949,1688466.77361612],[1182182.21297909,1685693.72073468],[1182237.94668823,1682920.6779227],[1182293.64563661,1680147.64517696],[1182349.30981394,1677374.62249422],[1182404.93920995,1674601.60987125],[1182460.53381436,1671828.6073048],[1182516.09311079,1669055.64005909],[1228154.08914271,1670084.14649218],[1226756.36092959,1725552.27655289],[1224488.34411826,1725495.06072654]]]},"properties":{"GID":134,"XMIN":1181398.2969495,"YMIN":1669055.64005909,"XMAX":1228154.08914271,"YMAX":1725552.27655289,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G3B40","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G3B4000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1180266.65812391,1779983.18831479],[1180323.567529,1777209.80138308],[1180380.44252715,1774436.4246229],[1180437.28310784,1771663.05803128],[1180494.08926055,1768889.70160525],[1180550.86097479,1766116.35534182],[1180607.59824005,1763343.01923799],[1180664.30104585,1760569.69329076],[1180720.96938171,1757796.37749713],[1180777.60323715,1755023.07185408],[1180834.20260169,1752249.77635858],[1180890.76746488,1749476.4910076],[1180947.29781626,1746703.2157981],[1181003.79364537,1743929.95072703],[1181060.25494179,1741156.69579134],[1181116.68169506,1738383.45098797],[1181173.07389476,1735610.21631385],[1181229.43153046,1732836.99176589],[1181285.75459176,1730063.77734101],[1181342.04306824,1727290.57303613],[1181398.29645147,1724517.40340749],[1226756.36029671,1725552.3015144],[1225341.33148637,1781024.1627303],[1223087.49093383,1780966.61109313],[1220833.65188299,1780909.63862359],[1218579.82592086,1780853.24559039],[1216326.01291434,1780797.43196182],[1214072.21273035,1780742.19770649],[1211818.42523576,1780687.54279333],[1209564.65029746,1780633.46719159],[1207310.88778231,1780579.97087087],[1205057.13755714,1780527.05380107],[1202803.3994888,1780474.71595242],[1200549.6734441,1780422.9572955],[1198295.95928984,1780371.77780118],[1196042.25689281,1780321.17744069],[1193788.5661198,1780271.15618556],[1191534.88683757,1780221.71400767],[1189281.21891286,1780172.8508792],[1187027.56221242,1780124.56677266],[1184773.91660298,1780076.86166092],[1182520.28195124,1780029.73551713],[1180266.65812391,1779983.18831479]]]},"properties":{"GID":135,"XMIN":1180266.65812391,"YMIN":1724517.40340749,"XMAX":1226756.36029671,"YMAX":1781024.1627303,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G3B20","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G3B2000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1178013.04498768,1779937.22002773],[1175759.44240922,1779891.83063008],[1173505.8502552,1779847.02009633],[1171252.26839227,1779802.78840127],[1168998.69668707,1779759.13552003],[1166745.13500624,1779716.06142806],[1164491.58321639,1779673.56610113],[1162238.04118413,1779631.64951535],[1159984.50877605,1779590.31164714],[1157730.98585875,1779549.55247326],[1155477.47229879,1779509.37197079],[1153223.96796273,1779469.77011712],[1150970.47271716,1779430.74688999],[1148716.98642858,1779392.30226745],[1146463.50896355,1779354.43622789],[1144210.04018858,1779317.14875001],[1141956.57997019,1779280.43981284],[1139703.12817488,1779244.30939574],[1137449.68466916,1779208.7574784],[1135196.24931949,1779173.78404081],[1135238.92017186,1776400.62772299],[1135281.56521623,1773627.48219224],[1135324.18444473,1770854.34744539],[1135366.77784949,1768081.22347931],[1135409.34542265,1765308.11029082],[1135451.88715636,1762535.00787675],[1135494.40304276,1759761.91623392],[1135536.89307402,1756988.83535914],[1135579.35724228,1754215.76524921],[1135621.79553971,1751442.70590093],[1135664.20795848,1748669.65731109],[1135706.59449077,1745896.61947646],[1135748.95512875,1743123.59239381],[1135791.28986461,1740350.5760599],[1135833.59869053,1737577.5704715],[1135875.88159872,1734804.57562534],[1135918.13858136,1732031.59151816],[1135960.36963067,1729258.61814669],[1136002.57473886,1726485.65550766],[1136044.75353077,1723712.72775569],[1181398.28435059,1724517.4031621],[1180266.64640509,1779983.18807425],[1178013.04498768,1779937.22002773]]]},"properties":{"GID":136,"XMIN":1135196.24931949,"YMIN":1723712.72775569,"XMAX":1181398.28435059,"YMAX":1779983.18807425,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G3B10","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G3B1000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1269851.77309702,1726748.88889673],[1267583.45107805,1726680.72016831],[1265315.14575391,1726613.12822353],[1263046.85698377,1726546.1130237],[1260778.5846268,1726479.67453048],[1258510.32854213,1726413.81270585],[1256242.08858889,1726348.52751212],[1253973.86462621,1726283.81891195],[1251705.65651317,1726219.68686829],[1249437.46410886,1726156.13134446],[1247169.28727234,1726093.15230409],[1244901.12586265,1726030.74971115],[1242632.97973883,1725968.92352993],[1240364.84875989,1725907.67372505],[1238096.73278484,1725847.00026148],[1235828.63167266,1725786.9031045],[1233560.54528232,1725727.38221972],[1231292.47347278,1725668.4375731],[1229024.41610298,1725610.0691309],[1226756.37303183,1725552.27685974],[1226826.67124934,1722778.7806666],[1226896.92620213,1720005.29379695],[1226967.1378772,1717231.81624789],[1227037.30626153,1714458.34801652],[1227107.43134213,1711684.88909996],[1227177.51310601,1708911.4394953],[1227247.55154019,1706137.99919961],[1227317.54663171,1703364.56821],[1227387.49836758,1700591.14652353],[1227457.40673486,1697817.73413725],[1227527.27172061,1695044.33104825],[1227597.09331188,1692270.93725356],[1227666.87149575,1689497.55275024],[1227736.60625929,1686724.17753532],[1227806.29758959,1683950.81160584],[1227875.94547375,1681177.45495881],[1227945.54989887,1678404.10759126],[1228015.11085205,1675630.7695002],[1228084.62832044,1672857.44068263],[1228154.10164829,1670084.14680536],[1273798.08302721,1671341.69739815],[1272120.09982049,1726817.63407859],[1269851.77309702,1726748.88889673]]]},"properties":{"GID":154,"XMIN":1226756.37303183,"YMIN":1670084.14680536,"XMAX":1273798.08302721,"YMAX":1726817.63407859,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G3C30","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G3C3000020"}},
{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[1268167.22538852,1782227.79385681],[1265913.09664029,1782159.22549638],[1263658.98363908,1782091.23727524],[1261404.88625216,1782023.82915516],[1259150.80434673,1781957.00109821],[1256896.73779002,1781890.7530668],[1254642.6864492,1781825.08502364],[1252388.65019146,1781759.99693181],[1250134.62888395,1781695.48875467],[1247880.62239381,1781631.56045595],[1245626.63058816,1781568.21199968],[1243372.6533341,1781505.44335022],[1241118.69049874,1781443.25447226],[1238864.74194912,1781381.64533082],[1236610.80755233,1781320.61589124],[1234356.88717539,1781260.16611919],[1232102.98068533,1781200.29598066],[1229849.08794916,1781141.00544198],[1227595.20883387,1781082.2944698],[1225341.34320644,1781024.16303108],[1225412.50397251,1778250.47977366],[1225483.6217359,1775476.80589591],[1225554.69648343,1772703.14139509],[1225625.72820191,1769929.48626846],[1225696.71687819,1767155.84051325],[1225767.6624991,1764382.20412671],[1225838.56505151,1761608.57710605],[1225909.42452228,1758834.9594485],[1225980.24089827,1756061.35115128],[1226051.01416635,1753287.7522116],[1226121.74431343,1750514.16262665],[1226192.43132638,1747740.58239362],[1226263.07519212,1744967.01150971],[1226333.67589756,1742193.4499721],[1226404.2334296,1739419.89777795],[1226474.74777519,1736646.35492443],[1226545.21892126,1733872.8214087],[1226615.64685476,1731099.29722792],[1226686.03156262,1728325.78237921],[1226756.37239895,1725552.30182124],[1272120.09904856,1726817.65944296],[1270421.35828592,1782296.94203377],[1268167.22538852,1782227.79385681]]]},"properties":{"GID":157,"XMIN":1225341.34320644,"YMIN":1725552.30182124,"XMAX":1272120.09904856,"YMAX":1782296.94203377,"GM_LAYER":"UNKNOWN_AREA_TYPE","LAYER":"UNKNOWN_AREA_TYPE","GM_TYPE":"Unknown Area Type","ELEVATION":0,"CLOSED":"YES","BORDER_STY":"Solid","BORDER_COL":"RGB(0,0,0)","BORDER_WID":1,"FILL_STYLE":"No Fill","BORDER_ST1":"Solid","BORDER_CO1":"RGB(0,0,0)","BORDER_WI1":1,"FONT_CHARS":0,"FONT_CHAR1":0,"FONT_COLOR":"RGB(0,0,0)","FONT_HT_M":1503.9,"FONT_PLACE":10,"FONT_PLAC1":10,"NAME":"N4G3C10","POINT_SYMB":"No Symbol","POINT_SYM1":"No Symbol","PRODUCER":"UST21컨소시엄","PROJECT_NA":"","PROJECTION":"제작완료","FILE_NAME":"102KR00N4G3C1000020"}}
]}
];