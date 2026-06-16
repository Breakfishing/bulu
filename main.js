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

window.fetchAddressForModal = function(lat, lng, elementId) {
  const addressEl = document.getElementById(elementId);
  if (addressEl) addressEl.innerText = "주소 변환 중...";

  if (typeof kakao !== 'undefined' && kakao.maps) {
    kakao.maps.load(function() {
      const geocoder = new kakao.maps.services.Geocoder();
      geocoder.coord2Address(lng, lat, function(result, status) {
        if (status === kakao.maps.services.Status.OK && result[0]) {
          const roadAddress = result[0].road_address ? result[0].road_address.address_name : null;
          const jibunAddress = result[0].address ? result[0].address.address_name : null;
          const finalAddr = roadAddress || jibunAddress || "주소 정보 없음";
          if (addressEl) addressEl.innerText = finalAddr;
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

// =========================================================================
// GROUP 9: 카카오 API 역지오코딩 동기화 및 맵 바운드 기반 마커 가시성 제어
// =========================================================================
function setKakaoAddress(lat, lng, elementId, callback) {
  const targetElement = document.getElementById(elementId);
  if (!targetElement) return;
  targetElement.innerText = "주소 불러오는 중...";
  
  if (typeof kakao === 'undefined' || !kakao.maps) {
    targetElement.innerText = "주소 정보 없음";
    if(callback) callback("주소 정보 없음"); return;
  }

  kakao.maps.load(function() {
    if (!kakao.maps.services || !kakao.maps.services.Geocoder) {
      targetElement.innerText = "주소 정보 없음";
      if(callback) callback("주소 정보 없음"); return;
    }
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2Address(lng, lat, function(result, status) {
      if (status === kakao.maps.services.Status.OK && result.length > 0) {
        const roadAddress = result[0].road_address ? result[0].road_address.address_name : null;
        const jibunAddress = result[0].address ? result[0].address.address_name : null;
        const finalAddr = roadAddress || jibunAddress || "주소 정보 없음";
        targetElement.innerText = finalAddr;
        if (callback) callback(finalAddr);
      } else {
        targetElement.innerText = "주소 정보 없음";
        if(callback) callback("주소 정보 없음");
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
      marker.on('click', function() {
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

map.on('moveend zoomend', function() {
  updateVisibleMarkersOnMap();
});

window.toggleToiletLayer = function(element) {
  window.isToiletLayerActive = !window.isToiletLayerActive;
  if (element && element.classList) element.classList.toggle('active', window.isToiletLayerActive);
  updateVisibleMarkersOnMap();
};

// =========================================================================
// GROUP 10: 신규 마커 팝업 설정 및 데이터베이스 실시간 스냅샷 리스너
// =========================================================================
window.openPointModal = function() {
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

window.openToiletModal = function() {
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

window.selectNewToiletHours = function(type, element) {
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

window.selectParking = function(type, element) {
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

window.savePointMarker = function() {
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
  const chips = document.querySelectorAll('#pointModal .chip-btn'); chips.forEach(c => c.classList.remove('active')); if(chips[0]) chips[0].classList.add('active');
  cachedActiveAddressStr = "";
}

window.saveToiletMarker = function() {
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
window.checkAndHideSplash = function() {
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
window.selectCategoryColor = function(color) {
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

window.deleteCategoryWithGuard = function(catName, event) {
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

window.openCategoryEditBottomSheet = function(catName, catColor, event) {
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

window.openCategoryAddBottomSheet = function() {
  const modalTitle = document.querySelector('#categoryEditModal h3 span'); 
  if (modalTitle) modalTitle.innerText = "카테고리 추가";
  document.getElementById('editTargetCategoryOldName').value = "NEW_CATEGORY"; 
  document.getElementById('editCategoryNameInput').value = ""; 
  
  window.selectCategoryColor('#4f46e5');
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.add('active');
  document.getElementById('categoryEditModal').classList.add('active');
};

window.saveCategoryEditData = function() {
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
    const dist = Math.sqrt(Math.pow(station.lat - lat, 2) + Math.pow(station.lng - lng, 2));
    if (dist < minDistance) { minDistance = dist; nearestStation = station; }
  });
  return nearestStation.code;
}

window.convertLatLngToGrid = function(lat, lng) {
  const RE = 6371.00877; const GRID = 5.0; const SLAT1 = 30.0; const SLAT2 = 60.0; const OLON = 126.0; const OLAT = 38.0; const XO = 43; const YO = 136;
  const DEGRAD = Math.PI / 180.0; const re = RE / GRID; const slat1 = SLAT1 * DEGRAD; const slat2 = SLAT2 * DEGRAD; const olon = OLON * DEGRAD; const olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5); sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5); sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5); ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5); ra = re * sf / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon; if (theta > Math.PI) theta -= 2.0 * Math.PI; if (theta < -Math.PI) theta += 2.0 * Math.PI; theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
};

window.getKMABaseDateTime = function() {
  const now = new Date(); const hours = [2, 5, 8, 11, 14, 17, 20, 23];
  let currentHour = now.getHours(); let currentMinute = now.getMinutes();
  let baseDate = new Date(now.getTime()); let baseTime = "2300"; let found = false;
  for (let i = hours.length - 1; i >= 0; i--) {
    if (currentHour > hours[i] || (currentHour === hours[i] && currentMinute >= 15)) { baseTime = String(hours[i]).padStart(2, '0') + "00"; found = true; break; }
  }
  if (!found) { baseDate.setDate(baseDate.getDate() - 1); baseTime = "2300"; }
  return { baseDate: `${baseDate.getFullYear()}${String(baseDate.getMonth() + 1).padStart(2, '0')}${String(baseDate.getDate()).padStart(2, '0')}`, baseTime: baseTime };
};

window.fetchSunriseSunsetForDatesPromise = function(lat, lng, dateStrings) {
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
      .catch(err => console.error("KASI 네트워크 통신 유실:", err));
  });
  return Promise.all(promises);
};

window.fetchKMAWeatherPromise = function(lat, lng) {
  const grid = window.convertLatLngToGrid(lat, lng);
  const cacheKey = `cc_weather_${grid.nx}_${grid.ny}`;
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
  const url = `/api-hub/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst?pageNo=1&numOfRows=1000&dataType=JSON&base_date=${base.baseDate}&base_time=${base.baseTime}&nx=${grid.nx}&ny=${grid.ny}&authKey=${KMA_AUTH_KEY}`;

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

window.fetchTideData3DaysPromise = function(lat, lng) {
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

window.loadTimelineWithOptimisticUI = function(lat, lng) {
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

  Promise.all([
    window.fetchSunriseSunsetForDatesPromise(lat, lng, dateStrings),
    window.fetchKMAWeatherPromise(lat, lng),
    window.fetchTideData3DaysPromise(lat, lng)
  ]).then(([_, liveWeatherMap, realTidesSchedule]) => {
    const splashBlock = document.getElementById('miniSplashBodyBlock');
    if (splashBlock) splashBlock.remove();
    
    if (dateSticky) dateSticky.style.visibility = 'visible';
    if (bridge) { bridge.style.visibility = 'visible'; bridge.innerHTML = ''; }
    
    window.buildTimelineUI(lat, lng, liveWeatherMap, realTidesSchedule);
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

window.fetchSunriseSunsetForDates = function(lat, lng, loopDates) {
  window.loadTimelineWithOptimisticUI(lat, lng);
};
window.fetchKMAWeather = function(lat, lng) {};
window.fetchTideData3Days = function(lat, lng) {};

// =========================================================================
// GROUP 13-2: 72시간 기상 물때 타임라인 UI 빌더 및 꼭지점 수위 보존 엔진
// =========================================================================
window.buildTimelineUI = function(lat, lng, weatherMap, realTides) {
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

    if (weatherMap && weatherMap[kmaKey]) {
      const kma = weatherMap[kmaKey]; if (kma.TMP) tempVal = kma.TMP + "°";
      if (kma.PCP) rainVal = kma.PCP === '강수없음' ? '0mm' : kma.PCP;
      if (kma.WSD) windVal = parseFloat(kma.WSD).toFixed(0) + "m/s";
      if (kma.VEC) {
        const deg = parseFloat(kma.VEC);
        if (deg >= 337.5 || deg < 22.5) dirVal = "↓"; else if (deg >= 22.5 && deg < 67.5) dirVal = "↙"; else if (deg >= 67.5 && deg < 112.5) dirVal = "←"; else if (deg >= 112.5 && deg < 157.5) dirVal = "↖"; else if (deg >= 157.5 && deg < 202.5) dirVal = "↑"; else if (deg >= 202.5 && deg < 247.5) dirVal = "↗"; else if (deg >= 247.5 && deg < 292.5) dirVal = "→"; else if (deg >= 292.5 && deg < 337.5) dirVal = "↘";
      }
      if (kma.PTY && kma.PTY !== "0") { skyIcon = "비"; iconColor = "#2f96ff"; }
      else if (kma.SKY === "3") { skyIcon = "구름많음"; iconColor = "#a2a2a7"; }
      else if (kma.SKY === "4") { skyIcon = "흐림"; iconColor = "#747479"; }
    }

    const col = document.createElement('div'); col.className = 'timeline-hour-column';
    col.innerHTML = `<div class="tl-cell cell-time">${String(futureHour.getHours()).padStart(2, '0')}</div><div class="tl-cell cell-icon" style="color: ${iconColor};">${skyIcon}</div><div class="tl-cell cell-temp">${tempVal}</div><div class="tl-cell cell-rain">${rainVal}</div><div class="tl-cell cell-wind">${windVal}</div><div class="tl-cell cell-dir">${dirVal}</div><div class="tl-cell cell-wave">${(0.5 + Math.sin(i * 0.2) * 0.3).toFixed(1)}m</div><div class="tl-cell cell-wtemp">${(19 + Math.cos(i * 0.3) * 1).toFixed(1)}°</div>`;
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
        window.allTidesSchedule.push({ type: '만조', color: '#ff3b30', time: `${String(dH.getHours()).padStart(2, '0')}:${String(dH.getMinutes()).padStart(2, '0')}`, hoursFromNow: hH, level: '270', diff: 220, rawDt: `${dH.getFullYear()}-${String(dH.getMonth()+1).padStart(2,'0')}-${String(dH.getDate()).padStart(2,'0')} ${String(dH.getHours()).padStart(2,'0')}:${String(dH.getMinutes()).padStart(2, '0')}:00` });
      }
      if (xLow >= 0 && xLow <= 4032) {
        let hL = xLow / 56; let dL = new Date(now.getTime() + hL * 60 * 60 * 1000);
        window.allTidesSchedule.push({ type: '간조', color: '#007aff', time: `${String(dL.getHours()).padStart(2, '0')}:${String(dL.getMinutes()).padStart(2, '0')}`, hoursFromNow: hL, level: '50', diff: -220, rawDt: `${dL.getFullYear()}-${String(dL.getMonth()+1).padStart(2,'0')}-${String(dL.getDate()).padStart(2,'0')} ${String(dL.getHours()).padStart(2,'0')}:${String(dL.getMinutes()).padStart(2, '0')}:00` });
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

window.getSunTimesForDate = function(targetDate) {
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
window.syncTimelineDateHeader = function(scrollElement) {
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
window.openMarkerDeleteModal = function(docId, collectionName, displayName, onSuccess) {
  const deleteModal = document.getElementById('deleteConfirmModal');
  const targetNameEl = document.getElementById('deleteModalTargetName');
  const doDeleteBtn = document.getElementById('btnDoDelete');
  if (!deleteModal || !doDeleteBtn) return;
  
  if (targetNameEl) targetNameEl.innerText = displayName;
  doDeleteBtn.onclick = function() {
    db.collection(collectionName).doc(docId).delete().then(() => { 
      window.closeModals(); 
      if (typeof onSuccess === 'function') onSuccess(); 
    });
  };
  
  document.getElementById('detailModalWrapper')?.classList.remove('active');
  document.getElementById('detailModal')?.classList.remove('active');
  document.querySelectorAll('.modal, .custom-modal-native').forEach(m => { if(m !== deleteModal) m.classList.remove('active'); });
  
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.classList.add('active');
  deleteModal.classList.add('active');
};

window.selectEditPointParking = function(type, element) {
  selectedEditPointParkingType = type;
  element.parentElement.querySelectorAll('.chip-btn').forEach(chip => chip.classList.remove('active'));
  element.classList.add('active');
  const detailRow = document.getElementById('editPointParkingDetailRow');
  if (type === 'paid') detailRow.classList.add('active'); else detailRow.classList.remove('active');
};

window.selectEditToiletHours = function(type, element) {
  selectedToiletHoursValue = type;
  element.parentElement.querySelectorAll('.chip-btn').forEach(chip => chip.classList.remove('active'));
  element.classList.add('active');
  const detailRow = document.getElementById('editToiletHoursDetailRow');
  if (type === '지정시간') detailRow.classList.add('active'); else detailRow.classList.remove('active');
};

window.openPointEditModal = function(docId, name, category, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, address) {
  document.getElementById('editPointDocId').value = docId; 
  document.getElementById('editPointName').value = name;
  document.getElementById('pointEditAddress').innerText = address || "주소 정보 없음"; 
  document.getElementById('editPointMemo').value = memo;

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

window.openToiletEditModal = function(docId, name, memo, address) {
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

window.savePointEditData = function() {
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

window.saveToiletEditData = function() {
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

window.renderPointDetailBottomSheet = function(docId, name, category, color, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, lat, lng, isFavorite, dbSavedAddress) {
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
    window.kakao.maps.load(function() {
      if (window.kakao.maps.services?.Geocoder) {
        new window.window.kakao.maps.services.Geocoder().coord2Address(lng, lat, function(result, status) {
          if (status === window.kakao.maps.services.Status.OK && result[0]) {
            let finalAddr = result[0].address ? result[0].address.address_name : '주소 없음';
            if (addrField) addrField.innerText = finalAddr;
            db.collection(category === 'toilet' ? 'public_toilets' : 'fishing_points').doc(docId).update({ dbSavedAddress: finalAddr });
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
    if (weatherOpenBtn) weatherOpenBtn.classList.remove('detail-toilet-hours-hidden');
    if (lblDetailToiletHours) lblDetailToiletHours.classList.add('detail-toilet-hours-hidden'); 

    if (favBtn) {
      const renderFav = (state) => { favBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="${state ? '#ffcc00' : 'none'}" stroke="${state ? '#ffcc00' : '#adb5bd'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`; };
      renderFav(isFavorite); 
      favBtn.onclick = function(e) { e.stopPropagation(); isFavorite = !isFavorite; renderFav(isFavorite); db.collection('fishing_points').doc(docId).update({ isFavorite, favoritedAt: isFavorite ? Date.now() : firebase.firestore.FieldValue.delete() }); };
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

  if (deleteBtn) deleteBtn.onclick = function(e) { e.stopPropagation(); window.openMarkerDeleteModal(docId, (category === 'toilet' || category === 'public_toilets') ? 'public_toilets' : 'fishing_points', name || ((category === 'toilet' || category === 'public_toilets') ? '공중화장실' : '무명 포인트')); };
  
  if (editTriggerBtn) editTriggerBtn.onclick = function(e) { 
    e.stopPropagation(); 
    if (sheet) sheet.classList.remove('active'); 
    if (wrapper) wrapper.classList.remove('active'); 
    if (category === 'toilet' || category === 'public_toilets') window.openToiletEditModal(docId, name, memo, addrField.innerText); 
    else window.openPointEditModal(docId, name, category, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, addrField.innerText); 
  };

  if (weatherOpenBtn) {
    weatherOpenBtn.onclick = function(e) {
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

      const dateStrings = [];
      const baseNow = new Date();
      for (let d = 0; d < 4; d++) {
        const tDate = new Date(baseNow.getTime() + d * 24 * 60 * 60 * 1000);
        const yyyy = tDate.getFullYear();
        const mm = String(tDate.getMonth() + 1).padStart(2, '0');
        const dd = String(tDate.getDate()).padStart(2, '0');
        dateStrings.push(`${yyyy}${mm}${dd}`);
      }

      window.fetchSunriseSunsetForDates(lat, lng, dateStrings, function() {
        window.fetchKMAWeather(lat, lng, function(liveWeatherMap) { 
          window.fetchTideData3Days(lat, lng, function(realTidesSchedule) { 
            window.buildTimelineUI(lat, lng, liveWeatherMap, realTidesSchedule); 
          }); 
        });
      });
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
    naviOpenBtn.onclick = function(e) { e.stopPropagation(); window.open(localStorage.getItem('navi-app') === 'naver' ? `https://map.naver.com/index.nhn?elat=${lat}&elng=${lng}&etext=${encodeURIComponent(name)}&menu=route` : `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`, '_blank'); };
  }
};

// =========================================================================
// GROUP 14: 포인트 관리 허브 목록 바인딩 및 가로 정렬 드래그 엔진 - 개편 및 오류수정 완료
// =========================================================================
window.openPointDetailFromList = function(pt) {
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
  if (eBtn && !isToilet) eBtn.onclick = (e) => { e.stopPropagation(); window.openPointEditModal(pt.id, pt.name || '무명 포인트', pt.category || '미분류', pt.memo || '등록된 메모가 없습니다.', pt.parkingType || 'none', pt.parkingUnit || '10분', pt.parkingPrice || '0', pt.hasStore || false, pt.hasCafe || false, pt.hasTackle || false, pt.address || "주소 정보 없음"); };
  
  const dBtn = row.querySelector('.pm-action-btn.delete'); 
  if (dBtn) dBtn.onclick = (e) => { e.stopPropagation(); window.openMarkerDeleteModal(pt.id, isToilet ? 'public_toilets' : 'fishing_points', pt.name || (isToilet ? '공중화장실' : '무명 포인트')); };
  
  row.onclick = (e) => { 
    if (e.target.closest('.pm-action-btn') || e.target.closest('.pm-drag-handle')) return; 
    window.openPointDetailFromList(pt); 
  };
  return row;
}

window.bindDragAndDropEvents = function(container, isFavSection = false) {
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
  [...container.querySelectorAll('.pm-item')].forEach((el, index) => { batch.update(db.collection('fishing_points').doc(el.id.replace('pm-node-', '')), { favoritedAt: baseTime - (index * 1000) }); });
  batch.commit();
}

function saveCategoryOrderWithinTabToFirebase(container) {
  const batch = db.batch(); const baseTime = Date.now();
  [...container.querySelectorAll('.pm-item')].forEach((el, index) => { 
    const docId = el.id.replace('pm-node-', '');
    const isToilet = cachedPublicToilets.some(t => t.id === docId);
    if (!isToilet) {
      batch.update(db.collection('fishing_points').doc(docId), { createdAt: firebase.firestore.Timestamp.fromMillis(baseTime - (index * 1000)) }); 
    }
  });
  batch.commit().catch(err => console.error(err));
}

window.renderPointsManagementTab = function() {
  const tabsContainer = document.getElementById('pm-category-tabs');
  const listContainer = document.getElementById('pm-points-list');
  if (!tabsContainer || !listContainer) return;

  if (!window.currentActiveCategory) {
    window.currentActiveCategory = localStorage.getItem('pm-last-category') || '전체';
  }

  let categories = ['전체', '즐겨찾기'];
  
  let savedCatOrder = JSON.parse(localStorage.getItem('pm-category-order') || '[]').filter(cat => cat !== '공중화장실 정보' && cat !== 'toilet' && cat !== '미분류');
  let currentCats = [...new Set(cachedFishingPoints.map(p => (p.category || '미분류').trim()))].filter(cat => cat !== '공중화장실 정보' && cat !== 'toilet' && cat !== '미분류');
  
  let activeCategories = [...savedCatOrder];
  currentCats.forEach(cat => {
    if (!activeCategories.includes(cat)) activeCategories.push(cat);
  });
  
  categories = categories.concat(activeCategories);
  categories.push('미분류');
  categories.push('공중화장실 정보');

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
    else if (catName === '공중화장실 정보') catColor = '#ff9500';
    else if (catName === '미분류') catColor = '#868e96';
    else {
      const matchPoints = cachedFishingPoints.filter(p => (p.category || '미분류') === catName);
      catColor = matchPoints.length > 0 ? (matchPoints[0].color || '#007aff') : (savedCatColors[catName] || '#007aff');
    }

    btn.innerHTML = `<span class="pm-tab-dot" style="background:${catColor}"></span><span>${catName}</span>`;

    btn.onclick = function() {
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
        ...cachedFishingPoints.map(p => ({ ...p, category: (p.category && p.category.trim() !== "") ? p.category.trim() : "미분류" })),
        ...cachedPublicToilets.map(t => ({ ...t, category: "toilet" }))
      ];
    } else if (window.currentActiveCategory === '즐겨찾기') {
      displayPoints = cachedFishingPoints.filter(p => p.isFavorite === true);
      displayPoints.sort((a, b) => (b.favoritedAt || 0) - (a.favoritedAt || 0));
    } else if (window.currentActiveCategory === '공중화장실 정보') {
      displayPoints = cachedPublicToilets.map(t => ({ ...t, category: "toilet" }));
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
    } else if (window.currentActiveCategory !== '전체' && window.currentActiveCategory !== '공중화장실 정보') {
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
window.openNoticeWriteModal = function() {
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

window.saveNoticeData = function() {
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
window.openAdminModal = function() {
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
    L.DomEvent.on(syncBtn, 'click', function(htmlEvent) {
      if (htmlEvent) {
        L.DomEvent.preventDefault(htmlEvent);
        L.DomEvent.stopPropagation(htmlEvent);
      }
      window.clearAdminCache();
    });
  }
};

window.checkAdminCacheStatus = function() {
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

window.clearAdminCache = function() {
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

window.logToAdminTerminal = function(message) {
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

document.addEventListener("DOMContentLoaded", () => {
  window.initHomeDataSequence();
});

window.initHomeDataSequence = async function() {
  window.populateHomeFavoritesDropdown();
};

window.populateHomeFavoritesDropdown = function() {
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

window.handleHomeFavoriteChange = function(selectEl) {
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

window.updateHomeCardByLocation = async function(lat, lng) {
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

window.refreshHomeLocation = function(btnElement) {
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

window.fetchAllPublicOpenAPI = async function(lat, lng) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const kmaKey = `${dateStr}${hh}00`;

  try {
    await window.fetchSunriseSunsetForDatesPromise(lat, lng, [dateStr]);
  } catch(e) { console.warn(e); }
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
  } catch (e) {}
  const tideNames8 = ["조금", "1물", "2물", "3물", "4물", "5물", "6물", "7물", "8물", "9물", "10물", "11물", "12물", "13물", "14물"];
  const currentTideIdx = tideNames8[(lunarDay + 7) % 15];

  let currentTemp = "--°C";
  let currentWeather = "맑음";
  let currentRain = "강수 --mm (--%)";
  let currentWind = "--- · -.-m/s";
  let currentWave = "파고 --.-m";
  let currentWaterTemp = "수온 --.-°C";

  try {
    const weatherMap = await window.fetchKMAWeatherPromise(lat, lng);
    if (weatherMap && weatherMap[kmaKey]) {
      const kma = weatherMap[kmaKey];
      if (kma.TMP) currentTemp = `${kma.TMP}°C`;
      if (kma.PCP) currentRain = kma.PCP === '강수없음' ? '강수 0mm' : `강수 ${kma.PCP}`;
      
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
    }
  } catch(e) { console.warn(e); }

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
  } catch(e) { console.warn(e); }

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

window.applyHomeCardDOM = function(payload) {
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

window.fallbackHomeDataLoad = function() {
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

window.getFormattedCurrentTime = function() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};