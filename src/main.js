// =========================================================================
// [CORE] 엔트리 포인트 및 모듈 통합 제어 메인 엔진 (src/main.js)
// =========================================================================
import './style.css'; 
import { db } from './utils/firebase.js'; 

// =========================================================================
// [1. PHASE ONE] 핵심 전역 상태 레이어 및 컴포넌트 변수 선언
// =========================================================================
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

// 오픈 API 키 컴포넌트
const PUBLIC_PORTAL_KEY = "7440915081950a748b3d8d5d1b9904d246ce8028893a02ec4042b2b192383803";
window.DATA_GO_KR_SERVICE_KEY = PUBLIC_PORTAL_KEY;
const KHOA_API_KEY = PUBLIC_PORTAL_KEY;
const KMA_AUTH_KEY = "RAp21103R7OKdtddNwezzw";

// =========================================================================
// [2. PHASE TWO] 라이프사이클 및 네비게이션 공통 UI 제어 영역 (최상단 배치로 가드 구축)
// =========================================================================
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
    if (typeof window.renderPointsManagementTab === 'function') {
      window.renderPointsManagementTab();
    }
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

window.loadCoastalDepthData = async function() {
  try {
    const response = await fetch('coastal_depth_compact.json');
    if (response.ok) {
      window.coastalDepthData = await response.json();
      console.log(`[수심 데이터 로드 완료] 총 ${window.coastalDepthData.length} 격자 확보`);
    }
  } catch (err) { console.error("수심 데이터 로드 중 에러 발생:", err); }
};
window.findNearestDepth = findNearestDepth;

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
        window.loadCoastalDepthData();
      }
    }, 350);
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
    let activeCategories = [...new Set([...savedCatOrder, ...window.cachedFishingPoints.map(p => String(p.category || '미분류').trim())])].filter(cat => cat !== '공중화장실 정보' && cat !== 'toilet' && cat !== '미분류');
    activeCategories.push('미분류'); const savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');

    activeCategories.forEach(catName => {
      const matchPoints = window.cachedFishingPoints.filter(p => String(p.category || '미분류').trim() === catName.trim());
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
    parkingType: selectedParkingType, parkingUnit: parkingUnits[currentUnitIndex] || '10분', parkingPrice: document.getElementById('parkingPrice')?.value || '0',
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
  document.getElementById('detailModalWrapper')?.classList.remove('active'); 
  document.getElementById('detailModal')?.classList.remove('active');
  document.querySelectorAll('.modal, .custom-modal-native').forEach(m => { if (m.id !== 'pointEditModal') m.classList.remove('active'); });
  document.getElementById('modalBackdrop')?.classList.add('active'); 
  document.getElementById('pointEditModal')?.classList.add('active');

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
    let activeCategories = [...new Set([...savedCatOrder, ...window.cachedFishingPoints.map(p => String(p.category || '미분류').trim())])].filter(cat => cat !== '공중화장실 정보' && cat !== 'toilet' && cat !== '미분류');
    activeCategories.push('미분류'); const savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');

    activeCategories.forEach(catName => {
      const matchPoints = window.cachedFishingPoints.filter(p => String(p.category || '미분류').trim() === catName.trim());
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
}

export function openToiletEditModal(docId, name, memo, address) {
  document.getElementById('detailModalWrapper')?.classList.remove('active'); 
  document.getElementById('detailModal')?.classList.remove('active');
  document.querySelectorAll('.modal, .custom-modal-native').forEach(m => { if (m.id !== 'toiletEditModal') m.classList.remove('active'); });
  document.getElementById('modalBackdrop')?.classList.add('active'); 
  document.getElementById('toiletEditModal')?.classList.add('active');

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
}

export function savePointEditData() {
  const docId = document.getElementById('editPointDocId').value; 
  const name = document.getElementById('editPointName').value.trim(); 
  if (!name) return alert("포인트 이름을 입력하세요.");

  const editCatEl = document.getElementById('editPointCategory');
  const category = editCatEl?.value || '미분류';
  const color = (editCatEl && editCatEl.selectedIndex >= 0) ? (editCatEl.options[editCatEl.selectedIndex]?.getAttribute('data-color') || '#007aff') : '#868e96';
  const memo = document.getElementById('editPointMemo').value.trim() || '등록된 메모가 없습니다.';

  // DOM 구조에서 실제로 활성화된(.active) 요소를 찾아 상태 유실 현상을 완벽히 차단합니다.
  let actualParkingType = 'none';
  const chipsContainer = document.getElementById('editPointParkingChips');
  if (chipsContainer) {
    const chips = chipsContainer.querySelectorAll('.chip-btn');
    if (chips[2]?.classList.contains('active')) {
      actualParkingType = 'paid';
    } else if (chips[1]?.classList.contains('active') || document.getElementById('chipEditParkingFree')?.classList.contains('active')) {
      actualParkingType = 'free';
    }
  }

  const unitBtn = document.getElementById('btnEditPointParkingUnit');
  const actualParkingUnit = unitBtn ? unitBtn.innerText.trim() : '10분';
  const parkingPrice = document.getElementById('editPointParkingPrice')?.value || '0';

  const hasStore = document.getElementById('btnEditFacStore')?.classList.contains('active') || false;
  const hasCafe = document.getElementById('btnEditFacCafe')?.classList.contains('active') || false;
  const hasTackle = document.getElementById('btnEditFacTackle')?.classList.contains('active') || false;

  db.collection('fishing_points').doc(docId).update({
    name, category, color, memo,
    parkingType: actualParkingType,
    parkingUnit: actualParkingUnit,
    parkingPrice,
    hasStore, hasCafe, hasTackle
  }).then(() => {
    window.closeModals();
  });
}

export function saveToiletEditData() {
  const docId = document.getElementById('editToiletDocId').value; let finalHours = selectedToiletHoursValue;
  if (selectedToiletHoursValue === '지정시간') {
    finalHours = `${document.getElementById('editToiletStartHour').value.trim()}:${document.getElementById('editToiletStartMin').value.trim()} ~ ${document.getElementById('editToiletEndHour').value.trim()}:${document.getElementById('editToiletEndMin').value.trim()}`;
  }
  db.collection('public_toilets').doc(docId).update({ name: document.getElementById('editToiletName').value.trim() || '공중화장실', memo: `${finalHours}||${document.getElementById('editToiletMemo').value.trim() || '양호'}` }).then(() => window.closeModals());
}

export function openMarkerDeleteModal(docId, collectionName, displayName, onSuccess) {
  const deleteModal = document.getElementById('deleteConfirmModal'); if (!deleteModal) return;
  
  // 기존 HTML 구조의 클래스명을 그대로 추적하여 텍스트를 안전하게 변경합니다.
  const textEl = deleteModal.querySelector('.delete-modal-text');
  if (textEl) {
    textEl.innerText = `'${displayName}' 데이터를 삭제하시겠습니까?`;
  }

  document.getElementById('btnDoDelete').onclick = function () { db.collection(collectionName).doc(docId).delete().then(() => { window.closeModals(); if (typeof onSuccess === 'function') onSuccess(); }); };

  document.getElementById('detailModalWrapper')?.classList.remove('active'); 
  document.getElementById('detailModal')?.classList.remove('active');
  document.querySelectorAll('.modal, .custom-modal-native').forEach(m => { if (m !== deleteModal) m.classList.remove('active'); });
  document.getElementById('modalBackdrop')?.classList.add('active'); 
  deleteModal.classList.add('active');
}

window.selectNewToiletHours = function (type, element) { window.selectedNewToiletHoursValue = type; element.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active')); element.classList.add('active'); document.getElementById('newToiletHoursDetailRow')?.classList.toggle('active', type === '지정시간'); };
window.selectParking = function (type, element) { selectedParkingType = type; element.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active')); element.classList.add('active'); document.getElementById('parkingDetailRow')?.classList.toggle('active', type === 'paid'); };
window.shiftParkingUnit = function (btn) { currentUnitIndex = (currentUnitIndex + 1) % parkingUnits.length; if (btn) btn.innerText = parkingUnits[currentUnitIndex]; };
window.shiftEditPointParkingUnit = function (btn) { currentEditPointUnitIndex = (currentEditPointUnitIndex + 1) % editPointParkingUnits.length; if (btn) btn.innerText = editPointParkingUnits[currentEditPointUnitIndex]; };
window.selectEditPointParking = function (type, element) { selectedEditPointParkingType = type; element.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active')); element.classList.add('active'); document.getElementById('editPointParkingDetailRow')?.classList.toggle('active', type === 'paid'); };
window.selectEditToiletHours = function (type, element) { selectedToiletHoursValue = type; element.parentElement.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active')); element.classList.add('active'); document.getElementById('editToiletHoursDetailRow')?.classList.toggle('active', type === '지정시간'); };

// =========================================================================
// 연안 종합 대시보드 바텀시트 정보 매핑 제어 엔진
// =========================================================================
export function renderPointDetailBottomSheet(docId, name, category, color, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, lat, lng, isFavorite, dbSavedAddress) {
  if (category !== 'toilet' && window.cachedFishingPoints) {
    const freshPt = window.cachedFishingPoints.find(p => p.id === docId);
    if (freshPt) {
      name = freshPt.name || name;
      category = freshPt.category || category;
      color = freshPt.color || color;
      memo = freshPt.memo || memo;
      pType = freshPt.parkingType || 'none';
      pUnit = freshPt.parkingUnit || '';
      pPrice = freshPt.parkingPrice || '0';
      hasStore = freshPt.hasStore || false;
      hasCafe = freshPt.hasCafe || false;
      hasTackle = freshPt.hasTackle || false;
      dbSavedAddress = freshPt.address || dbSavedAddress;
    }
  }

  const wrapper = document.getElementById('detailModalWrapper'); const sheet = document.getElementById('detailModal');
  if (wrapper) wrapper.classList.add('active'); if (sheet) sheet.classList.add('active');

  if (dbSavedAddress && dbSavedAddress.startsWith('소재지 도로명 주소:')) dbSavedAddress = dbSavedAddress.replace('소재지 도로명 주소:', '').trim();
  document.getElementById('lblDetailName').innerText = name;
  const addrField = document.getElementById('lblDetailAddressField'); if (addrField) addrField.innerText = dbSavedAddress || "주소 변환 중";

  if ((!dbSavedAddress || dbSavedAddress.includes("중") || dbSavedAddress.includes("없음")) && typeof window.kakao !== 'undefined' && window.kakao.maps) {
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

  document.getElementById('btnDetailPointDelete').onclick = function (e) { 
    e.stopPropagation(); 
    if (typeof window.closeModals === 'function') window.closeModals();
    window.openMarkerDeleteModal(docId, (category === 'toilet') ? 'public_toilets' : 'fishing_points', name || '지정 포인트'); 
  };

  document.getElementById('btnDetailPointEditTrigger').onclick = function (e) { 
    e.stopPropagation(); 
    const currentAddrText = addrField ? addrField.innerText : (dbSavedAddress || "주소 정보 없음");
    
    if (typeof window.closeModals === 'function') window.closeModals();
    
    if (category === 'toilet') {
      window.openToiletEditModal(docId, name, memo, currentAddrText); 
    } else {
      window.openPointEditModal(docId, name, category, memo, pType, pUnit, pPrice, hasStore, hasCafe, hasTackle, currentAddrText, lat, lng); 
    }
  };

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
    const toiletHtml = `<svg width="24" height="36" viewBox="0 0 24 36"  xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="#ff9500"/><circle cx="12" cy="12" r="4" fill="#ffffff"/></svg>`;
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
// [3. PHASE THREE] 하위 컴포넌트 및 모듈 스레드 가동 (함수 선언 완료 후 안전 로드)
// =========================================================================
import './utils/geoUtils.js'; 
import './components/more/more.js';
import './components/map/map.js';
import './components/weather/weatherModal.js';
import './components/home/home.js'; 
import './components/management/management.js'; 

// =========================================================================
// [4. PHASE FOUR] 백엔드 데이터베이스 실시간 트래킹 모델 및 오버레이 리스너
// =========================================================================
db.collection('fishing_points').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
  try {
    window.cachedFishingPoints = []; snapshot.forEach(doc => window.cachedFishingPoints.push({ id: doc.id, ...doc.data() }));
    if (typeof window.updateVisibleMarkersOnMap === 'function') window.updateVisibleMarkersOnMap();
    if (typeof window.renderPointsManagementTab === 'function') window.renderPointsManagementTab(); 
    if (typeof window.populateHomeFavoritesDropdown === 'function') window.populateHomeFavoritesDropdown();
  } catch (err) {
    console.error("낚시 포인트 데이터 렌더링 중 내부 파싱 오류:", err);
  } finally {
    window.isFishingPointsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
}, (error) => {
  console.error("[FIREBASE ERROR][fishing_points] 데이터를 가져오지 못했습니다. 상세 원인:", error);
  window.isFishingPointsLoaded = true; 
  if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
});

db.collection('public_toilets').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
  try {
    window.cachedPublicToilets = []; snapshot.forEach(doc => window.cachedPublicToilets.push({ id: doc.id, ...doc.data() }));
    if (typeof window.updateVisibleMarkersOnMap === 'function') window.updateVisibleMarkersOnMap();
    if (typeof window.renderPointsManagementTab === 'function') window.renderPointsManagementTab();
  } catch (err) {
    console.error("화장실 데이터 렌더링 중 내부 파싱 오류:", err);
  } finally {
    window.isPublicToiletsLoaded = true; if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
}, (error) => {
  console.error("[FIREBASE ERROR][public_toilets] 데이터를 가져오지 못했습니다. 상세 원인:", error);
  window.isPublicToiletsLoaded = true; 
  if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
});

// =========================================================================
// [LAYOUT CORE] 전역 하단 내비게이션 바 및 메인 탭 전환(switchTab) 제어 엔진
// =========================================================================
export function switchTab(tabId, element) {
  // 1. 모든 메인 탭 콘텐츠 레이어의 활성화 클래스 초기화
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });

  // 2. 인자로 전달된 대상 탭 구역 활성화
  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.add('active');
  }

  // 3. 하단 내비게이션 버튼들의 active 상태 갱신
  if (element) {
    document.querySelectorAll('#bottom-nav .nav-item').forEach(item => {
      item.classList.remove('active');
    });
    element.classList.add('active');
  }

  // 4. 지도 탭으로 복귀 시 카카오/Leaflet 지도 API 크기 재조정 연동 가드
  if (tabId === 'tab-map') {
    setTimeout(() => {
      if (window.map) {
        if (typeof window.map.relayout === 'function') {
          window.map.relayout();
        }
        if (typeof window.map.invalidateSize === 'function') {
          window.map.invalidateSize();
        }
      }
    }, 100);
  }
}

// 브라우저 인라인 onclick 선언부와 매핑하기 위한 전역 스코프 바인딩 가드
window.switchTab = switchTab;
// =========================================================================
// [CORE OVERRIDE GUARD] 타 모듈에 의한 글로벌 스코프 변조 원천 차단 시퀀스
// =========================================================================
window.openPointEditModal = openPointEditModal;
window.openToiletEditModal = openToiletEditModal;
window.savePointEditData = savePointEditData;
window.saveToiletEditData = saveToiletEditData;
window.openMarkerDeleteModal = openMarkerDeleteModal;

if (typeof window.initHomeDataSequence === 'function') {
  window.initHomeDataSequence();
}