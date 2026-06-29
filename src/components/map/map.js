// =========================================================================
// [MODULE] 지도 메인 코어, GPS 트래킹, 실시간 마커 오버레이 및 모달 시스템
// =========================================================================
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-edgebuffer';
import firebase from 'firebase/compat/app';
import { db } from '../../utils/firebase.js';
import { TIDE_STATIONS } from '../../utils/tideStations.js';
import './map.css';

// 지도 기본 마커 에셋 자원 바인딩
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// --- 전역 공유 변수 및 캐시 레이어 선언 ---
window.cachedFishingPoints = [];
window.cachedPublicToilets = [];
window.userMarker = null;
window.userLatLng = null;
window.isFirstLocation = true;
window.tempLatLng = null;
window.tempTargetVisual = null;
window.cachedActiveAddressStr = "";
window.isToiletLayerActive = false;
window.tempToiletMarker = null;
window.coastalDepthData = [];

window.isFishingPointsLoaded = false;
window.isPublicToiletsLoaded = false;

// --- 모달 전역 변수 컴포넌트 스택 ---
const parkingUnits = ['10분', '30분', '일'];
let currentUnitIndex = 0;
let selectedParkingType = 'none';
let selectedEditPointParkingType = 'none';
const editPointParkingUnits = ['10분', '30분', '일'];
let currentEditPointUnitIndex = 0;
let selectedToiletHoursValue = '모름';

// =========================================================================
// 지도 메인 캔버스 맵 바인딩 영역
// =========================================================================
const busanBounds = L.latLngBounds([34.5, 128.1], [36.69, 129.85]);
const map = L.map('map', {
  center: [35.1796, 129.0756], zoom: 11, minZoom: 11, maxZoom: 18,
  zoomControl: false, attributionControl: false, maxBounds: busanBounds, maxBoundsViscosity: 1.0
});

window.map = map;
window.mapObj = map;

let cloudPointsLayer = L.layerGroup().addTo(map);
let toiletPointsLayer = L.layerGroup().addTo(map);

const myLocationIcon = L.divIcon({
  html: `
    <div class="my-location-marker-inner-wrapper">
      <div class="radar-wave"></div><div class="radar-wave wave-delay-1"></div><div class="radar-wave wave-delay-2"></div>
      <svg width="80" height="80" class="user-heading-cone-bg"><circle cx="40" cy="40" r="40" fill="var(--primary-color)" fill-opacity="0.13" /></svg>
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

const clean2DLayer = L.tileLayer(isInitialDark ? CARTO_DARK_URL : CARTO_LIGHT_URL, { 
  attribution: '&copy; OpenStreetMap &copy; CARTO', 
  subdomains: 'abcd', 
  maxZoom: 18, 
  edgeBufferTiles: 3, 
  keepBuffer: 8, 
  updateWhenIdle: false 
});

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
  attribution: 'Tiles &copy; Esri', 
  edgeBufferTiles: 3, 
  keepBuffer: 8, 
  updateWhenIdle: false 
});

clean2DLayer.addTo(map);

let currentLayerMode = '2D';
const svg2D = `<svg class="app-icon" viewBox="0 0 24 24" style="fill:none; stroke:none;"><text x="50%" y="70%" font-size="15" font-weight="900" fill="var(--text-main)" text-anchor="middle">2D</text></svg>`;
const svg3D = `<svg class="app-icon" viewBox="0 0 24 24" style="fill:none; stroke:none;"><text x="50%" y="70%" font-size="15" font-weight="900" fill="currentColor" text-anchor="middle">3D</text></svg>`;

export function toggleMapLayer() {
  const btn = document.getElementById('btn-layer');
  if (!btn) return;
  if (currentLayerMode === '2D') {
    map.removeLayer(clean2DLayer); satelliteLayer.addTo(map); currentLayerMode = '3D'; btn.innerHTML = svg3D; btn.classList.add('active');
  } else {
    map.removeLayer(satelliteLayer); clean2DLayer.addTo(map); currentLayerMode = '2D'; btn.innerHTML = svg2D; btn.classList.remove('active');
  }
}

// =========================================================================
// 실시간 GPS 및 나침반 오버레이 트래킹 시스템
// =========================================================================
map.on('locationfound', function (e) {
  window.userLatLng = e.latlng;

  if (!window.userMarker) window.userMarker = L.marker(e.latlng, { icon: myLocationIcon }).addTo(map);
  else window.userMarker.setLatLng(e.latlng);

  if (window.isFirstLocation) { map.panTo(e.latlng); window.isFirstLocation = false; }

  const selectEl = document.getElementById("hcHomeFavoriteSelect");
  if (!selectEl || selectEl.value === "my_location" || selectEl.value === "") {
    if (typeof window.updateHomeCardByLocation === 'function') {
      window.updateHomeCardByLocation(e.latlng.lat, e.latlng.lng);
    }
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
    L.DomEvent.on(btnContainer, 'click', function (htmlEvent) { L.DomEvent.stopPropagation(htmlEvent); if (window.userLatLng) map.panTo(window.userLatLng); else alert('GPS 위치를 탐색 중입니다. 잠시만 기다려 주세요.'); });
    return btnContainer;
  }
});
map.addControl(new CenterToMyLocationControl());

L.control.scale({
  position: 'bottomleft',
  metric: true,
  imperial: false
}).addTo(map);

let showProhibited = false;
export function toggleProhibitedZones() {
  showProhibited = !showProhibited; 
  const targetBtn = document.getElementById('btn-prohibited');
  if (targetBtn) targetBtn.classList.toggle('active', showProhibited);
}

export function toggleToiletLayer(element) {
  window.isToiletLayerActive = !window.isToiletLayerActive;
  if (element && element.classList) element.classList.toggle('active', window.isToiletLayerActive);
  window.updateVisibleMarkersOnMap();
}

// =========================================================================
// 실시간 오버레이 마커 렌더링 스레드
// =========================================================================
export function updateVisibleMarkersOnMap() {
  if (!map) return;
  if (cloudPointsLayer) {
    cloudPointsLayer.clearLayers();
    window.cachedFishingPoints.forEach(item => {
      if (!item || item.lat === undefined || item.lng === undefined || isNaN(item.lat) || isNaN(item.lng) || item.lat === null || item.lng === null) return;
      const marker = L.marker([item.lat, item.lng], { icon: L.divIcon({ html: getFishingPointSvg(item.color), className: 'custom-marker-wrapper', iconSize: [26, 39], iconAnchor: [13, 39] }), zIndexOffset: 500 });
      marker.on('click', () => { window.closeModals(); window.renderPointDetailBottomSheet(item.id, item.name, item.category, item.color, item.memo, item.parkingType || 'none', item.parkingUnit || '', item.parkingPrice || '0', item.hasStore || false, item.hasCafe || false, item.hasTackle || false, item.lat, item.lng, item.isFavorite || false, item.address || "주소 정보 없음"); });
      cloudPointsLayer.addLayer(marker);
    });
  }
  if (toiletPointsLayer && window.isToiletLayerActive) {
    toiletPointsLayer.clearLayers();
    let targetToilets = [...window.cachedPublicToilets];
    if (window.userLatLng) targetToilets.sort((a, b) => window.userLatLng.distanceTo([a.lat, a.lng]) - window.userLatLng.distanceTo([b.lat, b.lng]));
    targetToilets.slice(0, 20).forEach(item => {
      if (!item || item.lat === undefined || item.lng === undefined || isNaN(item.lat) || isNaN(item.lng) || item.lat === null || item.lng === null) return;
      
      const toiletHtml = `<svg width="24" height="36" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="#ff9500"/>
        <circle cx="12" cy="12" r="4" fill="#ffffff"/>
      </svg>`;
      
      const marker = L.marker([item.lat, item.lng], { icon: L.divIcon({ html: toiletHtml, className: 'custom-marker-wrapper-toilet', iconSize: [24, 36], iconAnchor: [12, 36] }) });
      marker.on('click', () => { let cleanAddr = item.dbSavedAddress || item.address || '주소 정보 없음'; if (cleanAddr.startsWith('소재지 도로명 주소:')) cleanAddr = cleanAddr.replace('소재지 도로명 주소:', '').trim(); window.renderPointDetailBottomSheet(item.id, item.name || '공중화장실', 'toilet', '#ff9500', item.memo || '', '', '', 0, false, false, false, item.lat, item.lng, false, cleanAddr); });
      toiletPointsLayer.addLayer(marker);
    });
  } else if (toiletPointsLayer) { toiletPointsLayer.clearLayers(); }
}
map.on('moveend zoomend', updateVisibleMarkersOnMap);

export function getFishingPointSvg(color) {
  return `<svg width="26" height="39" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" class="fishing-marker-svg-anchor">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="${color}"/>
    <circle cx="12" cy="12" r="4" fill="#ffffff"/>
  </svg>`;
}

// --- DB 스냅샷 옵저버 리스너 ---
db.collection('fishing_points').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
  try {
    window.cachedFishingPoints = []; snapshot.forEach(doc => window.cachedFishingPoints.push({ id: doc.id, ...doc.data() }));
    window.updateVisibleMarkersOnMap(); 
    if (typeof window.renderPointsManagementTab === 'function') window.renderPointsManagementTab(); 
    if (typeof window.populateHomeFavoritesDropdown === 'function') window.populateHomeFavoritesDropdown();
  } catch (err) {
    console.error("낚시 포인트 데이터 렌더링 중 오류 발생:", err);
  } finally {
    window.isFishingPointsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
}, () => { window.isFishingPointsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash(); });

db.collection('public_toilets').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
  try {
    window.cachedPublicToilets = []; snapshot.forEach(doc => window.cachedPublicToilets.push({ id: doc.id, ...doc.data() }));
    window.updateVisibleMarkersOnMap(); 
    if (typeof window.renderPointsManagementTab === 'function') window.renderPointsManagementTab();
  } catch (err) {
    console.error("화장실 데이터 렌더링 중 오류 발생:", err);
  } finally {
    window.isPublicToiletsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
}, () => { window.isPublicToiletsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash(); });

// =========================================================================
// 실시간 격자 연안 수심 데이터 오버레이 매핑
// =========================================================================
map.on('click', function (e) {
  const backdrop = document.getElementById('modalBackdrop'); if (backdrop && backdrop.classList.contains('active')) return;
  const depth = (typeof window.findNearestDepth === 'function') ? window.findNearestDepth(e.latlng.lat, e.latlng.lng) : null;
  if (depth !== null) L.popup({ className: 'custom-depth-popup', closeButton: false, offset: [0, -10] }).setLatLng(e.latlng).setContent(`<div style="font-weight: 800; font-size: 14px; text-align: center;">${depth}m</div>`).openOn(map);
  else map.closePopup();
});

map.on('contextmenu', function (e) {
  window.tempLatLng = e.latlng; if (window.tempTargetVisual) map.removeLayer(window.tempTargetVisual);
  window.tempTargetVisual = L.circleMarker(e.latlng, { radius: 10, color: 'var(--primary-color)', fillColor: '#fff', fillOpacity: 0.9, weight: 3 }).addTo(map);
  document.querySelectorAll('.modal, .custom-modal-native, .bottom-sheet-modal-native, .bottom-sheet').forEach(m => m.classList.remove('active'));
  document.getElementById('modalBackdrop')?.classList.add('active'); document.getElementById('firstModal')?.classList.add('active');
});

// =========================================================================
// 마커 신규 등록 및 정보 수정 수동 인스턴스 모달 시스템 브릿지 연동
// =========================================================================
export function openPointModal() {
  document.getElementById('firstModal')?.classList.remove('active');
  document.getElementById('modalBackdrop')?.classList.add('active');
  document.getElementById('pointModal')?.classList.add('active');

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
  if (typeof window.fetchAddressForModal === 'function') window.fetchAddressForModal(window.tempLatLng.lat, window.tempLatLng.lng, 'pointAddress');
}

export function openToiletModal() {
  document.getElementById('firstModal')?.classList.remove('active');
  document.getElementById('modalBackdrop')?.classList.add('active');
  document.getElementById('toiletModal')?.classList.add('active');
  window.selectedNewToiletHoursValue = "24시간";

  const chips = document.getElementById('newToiletHoursChips');
  if (chips) { chips.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active')); document.getElementById('chipNewHours24')?.classList.add('active'); }
  document.getElementById('newToiletHoursDetailRow')?.classList.remove('active');
  if (typeof window.fetchAddressForModal === 'function') window.fetchAddressForModal(window.tempLatLng.lat, window.tempLatLng.lng, 'toiletAddress');
}

export function savePointMarker() {
  const name = document.getElementById('pointName')?.value.trim() || ''; if (!name) return alert("포인트 이름을 입력하세요.");
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

  if (document.getElementById('pointName')) document.getElementById('pointName').value = ''; 
  if (document.getElementById('pointMemo')) document.getElementById('pointMemo').value = ''; 
  if (document.getElementById('parkingPrice')) document.getElementById('parkingPrice').value = '';
  document.getElementById('btnNewFacStore')?.classList.remove('active'); document.getElementById('btnNewFacCafe')?.classList.remove('active'); document.getElementById('btnNewFacTackle')?.classList.remove('active');
  selectedParkingType = 'none'; currentUnitIndex = 0; const pUnitBtn = document.getElementById('btnParkingUnit'); if (pUnitBtn) pUnitBtn.innerText = '10분'; document.getElementById('parkingDetailRow')?.classList.remove('active');
  window.cachedActiveAddressStr = "";
}

export function saveToiletMarker() {
  const name = document.getElementById('toiletName')?.value.trim() || '공중화장실';
  const memo = document.getElementById('newToiletMemo')?.value.trim() || '양호';
  let finalHours = window.selectedNewToiletHoursValue;
  if (window.selectedNewToiletHoursValue === '지정시간') {
    finalHours = `${document.getElementById('newToiletStartHour').value.trim() || '09'}:${document.getElementById('newToiletStartMin').value.trim() || '00'} ~ ${document.getElementById('newToiletEndHour').value.trim() || '18'}:${document.getElementById('newToiletEndMin').value.trim() || '00'}`;
  }
  db.collection('public_toilets').add({ name, memo: `${finalHours}||${memo}`, category: 'toilet', lat: window.tempLatLng.lat, lng: window.tempLatLng.lng, createdAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => { window.closeModals(); });
  if (document.getElementById('toiletName')) document.getElementById('toiletName').value = ''; if (document.getElementById('newToiletMemo')) document.getElementById('newToiletMemo').value = '';
}

export function openPointEditModal(docId, name, category, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, address, lat, lng) {
  const docIdInput = document.getElementById('editPointDocId'); if (docIdInput) docIdInput.value = docId;
  const nameInput = document.getElementById('editPointName'); if (nameInput) nameInput.value = name;
  const memoInput = document.getElementById('editPointMemo'); if (memoInput) memoInput.value = memo;
  const pointEditAddrEl = document.getElementById('pointEditAddress'); if (pointEditAddrEl) pointEditAddrEl.innerText = address || "주소 정보 없음";

  if ((!address || address.includes("없음") || address.includes("중...")) && lat && lng && typeof window.searchNearestCoastalLandmark === 'function') {
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
    document.getElementById('editPointParkingDetailRow')?.classList.add('active'); 
    const priceInput = document.getElementById('editPointParkingPrice'); if (priceInput) priceInput.value = pPrice || '0';
    const unitBtn = document.getElementById('btnEditPointParkingUnit'); if (unitBtn) { unitBtn.innerText = pUnit || '10분'; currentEditPointUnitIndex = Math.max(0, editPointParkingUnits.indexOf(pUnit || '10분')); }
  } else { document.getElementById('editPointParkingDetailRow')?.classList.remove('active'); }

  document.getElementById('btnEditFacStore')?.classList.toggle('active', hasStore);
  document.getElementById('btnEditFacCafe')?.classList.toggle('active', hasCafe);
  document.getElementById('btnEditFacTackle')?.classList.toggle('active', hasTackle);

  document.getElementById('modalBackdrop')?.classList.add('active'); document.getElementById('pointEditModal')?.classList.add('active');
}

export function openToiletEditModal(docId, name, memo, address) {
  const docIdInput = document.getElementById('editToiletDocId'); if (docIdInput) docIdInput.value = docId;
  const nameInput = document.getElementById('editToiletName'); if (nameInput) nameInput.value = name || '공중화장실';
  const addrEl = document.getElementById('toiletEditAddress'); if (addrEl) addrEl.innerText = address || "주소 정보 없음";
  const tokens = (memo || '').split('||'); const hoursText = tokens[0] || '모름'; 
  const memoInput = document.getElementById('editToiletMemo'); if (memoInput) memoInput.value = tokens[1] || '';

  const chipsContainer = document.getElementById('editToiletHoursChips');
  if (chipsContainer) {
    chipsContainer.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('active'));
    if (hoursText === '24시간') document.getElementById('chipEditHours24')?.classList.add('active');
    else if (hoursText === '모름') document.getElementById('chipEditHoursUnknown')?.classList.add('active');
    else chipsContainer.querySelectorAll('.chip-btn')[2]?.classList.add('active');
  }

  if (hoursText !== '24시간' && hoursText !== '모름') {
    document.getElementById('editToiletHoursDetailRow')?.classList.add('active'); selectedToiletHoursValue = '지정시간';
    try {
      const times = hoursText.split('~').map(t => t.trim());
      if (times.length === 2) {
        document.getElementById('editToiletStartHour').value = times[0].split(':')[0]; document.getElementById('editToiletStartMin').value = times[0].split(':')[1];
        document.getElementById('editToiletEndHour').value = times[1].split(':')[0]; document.getElementById('editToiletEndMin').value = times[1].split(':')[1];
      }
    } catch {}
  } else { document.getElementById('editToiletHoursDetailRow')?.classList.remove('active'); selectedToiletHoursValue = hoursText; }

  document.getElementById('modalBackdrop')?.classList.add('active'); document.getElementById('toiletEditModal')?.classList.add('active');
}

export function savePointEditData() {
  const docId = document.getElementById('editPointDocId').value; const name = document.getElementById('editPointName').value.trim(); if (!name) return alert("포인트 이름을 입력하세요.");
  db.collection('fishing_points').doc(docId).update({
    name, category: document.getElementById('editPointCategory')?.value || '미분류', color: document.getElementById('editPointCategory')?.options[document.getElementById('editPointCategory').selectedIndex]?.getAttribute('data-color') || '#007aff',
    memo: document.getElementById('editPointMemo').value.trim() || '등록된 메모가 없습니다.', parkingType: selectedEditPointParkingType, parkingUnit: editPointParkingUnits[currentEditPointUnitIndex], parkingPrice: document.getElementById('editPointParkingPrice').value || '0',
    hasStore: document.getElementById('btnEditFacStore')?.classList.contains('active'), hasCafe: document.getElementById('btnEditFacCafe')?.classList.contains('active'), hasTackle: document.getElementById('btnEditFacTackle')?.classList.contains('active')
  }).then(() => window.closeModals());
}

export function saveToiletEditData() {
  const docId = document.getElementById('editToiletDocId').value; let finalHours = selectedToiletHoursValue;
  if (selectedToiletHoursValue === '지정시간') finalHours = `${document.getElementById('editToiletStartHour').value.trim()}:${document.getElementById('editToiletStartMin').value.trim()} ~ ${document.getElementById('editToiletEndHour').value.trim()}:${document.getElementById('editToiletEndMin').value.trim()}`;
  db.collection('public_toilets').doc(docId).update({ name: document.getElementById('editToiletName').value.trim() || '공중화장실', memo: `${finalHours}||${document.getElementById('editToiletMemo').value.trim() || '양호'}` }).then(() => window.closeModals());
}

export function openMarkerDeleteModal(docId, collectionName, displayName, onSuccess) {
  const deleteModal = document.getElementById('deleteConfirmModal'); if (!deleteModal) return;
  document.getElementById('deleteModalTargetName').innerText = displayName;
  document.getElementById('btnDoDelete').onclick = function () { db.collection(collectionName).doc(docId).delete().then(() => { window.closeModals(); if (typeof onSuccess === 'function') onSuccess(); }); };

  document.getElementById('detailModalWrapper')?.classList.remove('active'); document.getElementById('detailModal')?.classList.remove('active');
  document.querySelectorAll('.modal, .custom-modal-native').forEach(m => { if (m !== deleteModal) m.classList.remove('active'); });
  document.getElementById('modalBackdrop')?.classList.add('active'); deleteModal.classList.add('active');
}

// --- 모달 칩 토글 유틸 보조 스택 ---
export function selectNewToiletHours(type, element) { window.selectedNewToiletHoursValue = type; element.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active')); element.classList.add('active'); document.getElementById('newToiletHoursDetailRow')?.classList.toggle('active', type === '지정시간'); }
export function selectParking(type, element) { selectedParkingType = type; element.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active')); element.classList.add('active'); document.getElementById('parkingDetailRow')?.classList.toggle('active', type === 'paid'); }
export function shiftParkingUnit(btn) { currentUnitIndex = (currentUnitIndex + 1) % parkingUnits.length; if (btn) btn.innerText = parkingUnits[currentUnitIndex]; }
export function shiftEditPointParkingUnit(btn) { currentEditPointUnitIndex = (currentEditPointUnitIndex + 1) % editPointParkingUnits.length; if (btn) btn.innerText = editPointParkingUnits[currentEditPointUnitIndex]; }
export function selectEditPointParking(type, element) { selectedEditPointParkingType = type; element.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active')); element.classList.add('active'); document.getElementById('editPointParkingDetailRow')?.classList.toggle('active', type === 'paid'); }
export function selectEditToiletHours(type, element) { selectedToiletHoursValue = type; element.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active')); element.classList.add('active'); document.getElementById('editToiletHoursDetailRow')?.classList.toggle('active', type === '지정시간'); }

// =========================================================================
// 연안 종합 대시보드 바텀시트 정보 매핑 제어 엔진
// =========================================================================
export function renderPointDetailBottomSheet(docId, name, category, color, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, lat, lng, isFavorite, dbSavedAddress) {
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
              if (typeof window.searchNearestCoastalLandmark === 'function') {
                window.searchNearestCoastalLandmark(lat, lng, nearestAddr => { if (addrField) addrField.innerText = nearestAddr; db.collection((category === 'toilet') ? 'public_toilets' : 'fishing_points').doc(docId).update({ [category === 'toilet' ? 'dbSavedAddress' : 'address']: nearestAddr }); }, () => {});
              }
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
    try { if (typeof window.buildTimelineUI === 'function') window.buildTimelineUI(lat, lng, null, []); } catch (err) {}
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
      document.getElementById('weatherModal')?.classList.add('active'); if (typeof window.loadTimelineWithOptimisticUI === 'function') window.loadTimelineWithOptimisticUI(lat, lng);
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
}

export function openPointDetailFromList(pt) {
  window.closeModals(); const mapNavItem = document.querySelector('.nav-item[onclick*="tab-map"]') || document.querySelector('.nav-item');
  if (typeof window.switchTab === 'function') window.switchTab('tab-map', mapNavItem);
  if (map) map.panTo([pt.lat, pt.lng]);

  if (pt.category === 'toilet') {
    if (window.tempToiletMarker) map.removeLayer(window.tempToiletMarker);
    const toiletHtml = `<svg width="24" height="36" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="#ff9500"/><circle cx="12" cy="12" r="4" fill="#ffffff"/></svg>`;
    window.tempToiletMarker = L.marker([pt.lat, pt.lng], { icon: L.divIcon({ html: toiletHtml, className: 'custom-marker-wrapper-toilet temp-list-injected-toilet-node', iconSize: [24, 36], iconAnchor: [12, 36] }), zIndexOffset: 1000 }).addTo(map);
    window.renderPointDetailBottomSheet(pt.id, pt.name || '공중화장실', 'toilet', '#ff9500', pt.memo || '', '', '', 0, false, false, false, pt.lat, pt.lng, false, pt.dbSavedAddress || pt.address || '주소 정보 없음');
  } else {
    window.renderPointDetailBottomSheet(pt.id, pt.name, pt.category, pt.color, pt.memo, pt.parkingType || 'none', pt.parkingUnit || '', pt.parkingPrice || '0', pt.hasStore || false, pt.hasCafe || false, pt.hasTackle || false, pt.lat, pt.lng, pt.isFavorite || false, pt.address || "주소 정보 없음");
  }
}

export function getNearestTideStation(lat, lng) {
  let minDistance = Infinity; let nearestStation = TIDE_STATIONS[0];
  TIDE_STATIONS.forEach(station => {
    const stationLng = station.lng !== undefined ? station.lng : station.mesh;
    const dist = Math.sqrt(Math.pow(station.lat - lat, 2) + Math.pow(stationLng - lng, 2));
    if (dist < minDistance) { minDistance = dist; nearestStation = station; }
  });
  return nearestStation.code;
}

// =========================================================================
// [Vite 호환 가드] 기존 index.html 및 마크업 인라인 바인딩 전역 가드
// =========================================================================
window.toggleMapLayer = toggleMapLayer;
window.toggleProhibitedZones = toggleProhibitedZones;
window.toggleToiletLayer = toggleToiletLayer;
window.updateVisibleMarkersOnMap = updateVisibleMarkersOnMap;
window.getFishingPointSvg = getFishingPointSvg;

window.openPointModal = openPointModal;
window.openToiletModal = openToiletModal;
window.savePointMarker = savePointMarker;
window.saveToiletMarker = saveToiletMarker;
window.openPointEditModal = openPointEditModal;
window.openToiletEditModal = openToiletEditModal;
window.savePointEditData = savePointEditData;
window.saveToiletEditData = saveToiletEditData;
window.openMarkerDeleteModal = openMarkerDeleteModal;

window.selectNewToiletHours = selectNewToiletHours;
window.selectParking = selectParking;
window.shiftParkingUnit = shiftParkingUnit;
window.shiftEditPointParkingUnit = shiftEditPointParkingUnit;
window.selectEditPointParking = selectEditPointParking;
window.selectEditToiletHours = selectEditToiletHours;

window.renderPointDetailBottomSheet = renderPointDetailBottomSheet;
window.openPointDetailFromList = openPointDetailFromList;
window.getNearestTideStation = getNearestTideStation;