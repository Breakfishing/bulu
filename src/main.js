// =========================================================================
// [CORE] 엔트리 포인트 및 모듈 통합 제어 메인 엔진 (src/main.js)
// =========================================================================
import './style.css'; 
import { db } from './utils/firebase.js'; 

// 하위 컴포넌트 모듈 스레드 가동
import './components/more/more.js';
import './components/map/map.js';
import './components/weather/weatherModal.js';
import './components/home/home.js'; // 분리된 홈 레이어 가동 모듈 스레드

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

// 오픈 API 키 컴포넌트
const PUBLIC_PORTAL_KEY = "7440915081950a748b3d8d5d1b9904d246ce8028893a02ec4042b2b192383803";
window.DATA_GO_KR_SERVICE_KEY = PUBLIC_PORTAL_KEY;
const KHOA_API_KEY = PUBLIC_PORTAL_KEY;
const KMA_AUTH_KEY = "RAp21103R7OKdtddNwezzw";

// =========================================================================
// [COMMON UI] 라이프사이클 및 네비게이션 공통 UI 제어 영역
// =========================================================================

// [초기 부팅 시점 자동 실행]
window.loadCoastalDepthData = async function() {
  try {
    const response = await fetch('coastal_depth_compact.json');
    if (response.ok) {
      window.coastalDepthData = await response.json();
      console.log(`[수심 데이터 로드 완료] 총 ${window.coastalDepthData.length} 격자 확보`);
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
// [TAB AREA 3] 포인트 관리 대시보드 시스템, 드래그 소팅 및 카테고리 관리 총괄 엔진
// =========================================================================
window.currentActiveCategory = null;

window.openCategoryManageModal = function () {
  window.closeModals();
  const backdrop = document.getElementById('modalBackdrop');
  const modal = document.getElementById('categoryManageModal');
  if (backdrop) backdrop.classList.add('active');
  if (modal) modal.classList.add('active');

  const listContainer = document.getElementById('pm-category-manage-list') || document.querySelector('#categoryManageModal .pm-list-group');
  if (!listContainer) return;

  listContainer.innerHTML = '';
  
  let savedCatOrder = [];
  try {
    const rawOrder = localStorage.getItem('pm-category-order');
    if (rawOrder) {
      savedCatOrder = JSON.parse(rawOrder).filter(cat => cat && typeof cat === 'string' && cat.trim() !== '' && !['전체', '즐겨찾기', '공중화장실 정보', '최근 추가된 화장실', 'toilet', '미분류'].includes(cat.trim()));
    }
  } catch (e) {
    savedCatOrder = [];
  }

  let currentCats = [...new Set(window.cachedFishingPoints.map(p => p.category ? String(p.category).trim() : ''))]
    .filter(cat => cat !== '' && !['전체', '즐겨찾기', '공중화장실 정보', '최근 추가된 화장실', 'toilet', '미분류'].includes(cat));

  let finalCatOrder = [...savedCatOrder];
  currentCats.forEach(cat => { 
    if (!finalCatOrder.includes(cat)) finalCatOrder.push(cat); 
  });
  
  finalCatOrder = [...new Set(finalCatOrder)].filter(cat => cat && typeof cat === 'string' && cat.trim() !== '');

  let savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');

  if (finalCatOrder.length === 0) {
    listContainer.innerHTML = '<div class="pm-empty-msg">등록된 커스텀 카테고리가 없습니다.</div>';
  } else {
    finalCatOrder.forEach(catName => {
      const row = document.createElement('div');
      row.className = 'pm-item'; 
      row.setAttribute('data-name', catName);
      
      const matchPoints = window.cachedFishingPoints.filter(p => String(p.category || '미분류').trim() === catName.trim());
      const color = matchPoints.length > 0 ? (matchPoints[0].color || '#007aff') : (savedCatColors[catName] || '#007aff');

      row.innerHTML = `
        <div class="pm-item-left">
          <div class="pm-drag-handle pm-category-drag-handle" style="touch-action: none;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-main)" stroke="var(--text-main)" stroke-width="2.5">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </div>
          <div class="pm-color-dot" style="background-color: ${color}; flex-shrink: 0;"></div>
          <div class="pm-item-info" style="flex: 1; min-width: 0;">
            <span class="pm-item-name">${catName}</span>
          </div>
        </div>
        <div class="pm-item-actions">
          <button class="pm-action-btn edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
          <button class="pm-action-btn delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </div>
      `;

      const eBtn = row.querySelector('.edit');
      if (eBtn) {
        eBtn.onclick = (e) => {
          e.stopPropagation();
          window.openCategoryEditBottomSheet(catName, color, e);
          
          setTimeout(() => {
            const editModal = document.getElementById('categoryEditModal') || document.querySelector('.bottom-sheet-modal-native.active') || document.querySelector('.bottom-sheet.active');
            if (editModal) {
              const saveBtns = editModal.querySelectorAll('.modal-btn.save, .btn-main');
              const cancelBtns = editModal.querySelectorAll('.modal-btn.cancel, .btn-sub');
              
              saveBtns.forEach(btn => {
                if (!btn.dataset.hooked) {
                  btn.addEventListener('click', () => {
                    setTimeout(() => { window.openCategoryManageModal(); }, 150);
                  }, { once: true });
                  btn.dataset.hooked = 'true';
                }
              });
              
              cancelBtns.forEach(btn => {
                if (!btn.dataset.hooked) {
                  btn.addEventListener('click', () => {
                    setTimeout(() => { window.openCategoryManageModal(); }, 150);
                  }, { once: true });
                  btn.dataset.hooked = 'true';
                }
              });
            }
          }, 250);
        };
      }

      const dBtn = row.querySelector('.delete');
      if (dBtn) {
        dBtn.onclick = (e) => {
          e.stopPropagation();
          if (typeof window.deleteCategoryWithGuard === 'function') {
            window.deleteCategoryWithGuard(catName, e);
            setTimeout(() => { window.openCategoryManageModal(); }, 100);
          }
        };
      }

      listContainer.appendChild(row);
    });
  }

  const addBtnRow = modal.querySelector('.category-manage-add-row') || document.querySelector('.category-manage-add-row');
  if (addBtnRow) {
    const addBtn = addBtnRow.querySelector('.btn-main');
    if (addBtn) {
      if (finalCatOrder.length >= 10) {
        addBtn.disabled = true;
        addBtn.style.opacity = '0.4';
        addBtn.style.pointerEvents = 'none';
        
        if (!addBtn.dataset.limitHooked) {
          addBtn.addEventListener('click', function (evt) {
            evt.preventDefault();
            evt.stopPropagation();
            return false;
          }, true);
          addBtn.dataset.limitHooked = 'true';
        }
      } else {
        addBtn.disabled = false;
        addBtn.style.opacity = '1';
        addBtn.style.pointerEvents = 'auto';
      }
    }
  }

  window.bindCategoryDragAndDropEvents(listContainer);
};

window.bindCategoryDragAndDropEvents = function (container) {
  if (!container) return;
  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.pm-category-drag-handle');
    if (!handle) return;
    const item = handle.closest('.pm-item');
    if (!item) return;
    e.preventDefault();
    item.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);

    const onPointerMove = (evt) => {
      const draggingItem = container.querySelector('.pm-item.dragging');
      if (!draggingItem) return;
      const nextSibling = [...container.querySelectorAll('.pm-item:not(.dragging)')].find(sib => evt.clientY < sib.getBoundingClientRect().top + sib.getBoundingClientRect().height / 2);
      if (nextSibling) container.insertBefore(draggingItem, nextSibling);
      else container.appendChild(draggingItem);
    };

    const onPointerUp = (evt) => {
      item.classList.remove('dragging');
      handle.releasePointerCapture(evt.pointerId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      // 교정: exportAttribute -> 표준 getAttribute 사용
      const newOrder = [...container.querySelectorAll('.pm-item')].map(el => el.getAttribute('data-name'));
      localStorage.setItem('pm-category-order', JSON.stringify(newOrder));

      if (typeof window.renderPointsManagementTab === 'function') {
        window.renderPointsManagementTab();
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  });
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
  let currentCats = [...new Set(window.cachedFishingPoints.map(p => String(p.category || '미분류').trim()))].filter(cat => cat !== '공중화장실 정보' && cat !== '최근 추가된 화장실' && cat !== 'toilet' && cat !== '미분류');

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
      const matchPoints = window.cachedFishingPoints.filter(p => String(p.category || '미분류').trim() === catName.trim());
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
      displayPoints = [...window.cachedFishingPoints.map(p => ({ ...p, category: (p.category && String(p.category).trim() !== "") ? String(p.category).trim() : "미분류" }))];
    } else if (window.currentActiveCategory === '즐겨찾기') {
      displayPoints = window.cachedFishingPoints.filter(p => p.isFavorite === true).sort((a, b) => (b.favoritedAt || 0) - (a.favoritedAt || 0));
    } else if (window.currentActiveCategory === '최근 추가된 화장실') {
      displayPoints = window.cachedPublicToilets.slice(0, 5).map(t => ({ ...t, category: "toilet" }));
    } else {
      displayPoints = window.cachedFishingPoints.filter(p => String(p.category || '미분류').trim() === String(window.currentActiveCategory).trim());
    }

    if (displayPoints.length === 0) { listContainer.innerHTML = `<div class="pm-empty-msg">[${window.currentActiveCategory}] 카테고리에 등록된 포인트가 없습니다.</div>`; return; }
    displayPoints.forEach(item => { listContainer.appendChild(createPointRowComponent(item, window.currentActiveCategory === '전체' || window.currentActiveCategory === '즐겨찾기')); });

    if (window.currentActiveCategory === '즐겨찾기') window.bindDragAndDropEvents(listContainer, true);
    else if (window.currentActiveCategory !== '전체' && window.currentActiveCategory !== '최근 추가된 화장실') window.bindDragAndDropEvents(listContainer, false);
  }

  renderActiveCategoryPoints();
};

function createPointRowComponent(pt, isFavSection) {
  const row = document.createElement('div'); row.className = "pm-item"; row.id = `pm-node-${pt.id}`;
  const isCurrentlyFav = pt.isFavorite === true; const isToilet = (pt.category === 'toilet');

  row.innerHTML = `
    <div class="pm-item-left" style="width: calc(100% - 100px);">
      <div class="pm-drag-handle" style="${isToilet ? 'visibility:hidden; pointer-events:none;' : ''}; touch-action: none;"><svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-main)" stroke="var(--text-main)" stroke-width="2.5"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></svg></div>
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
  
  // 교정: exportAttribute -> 표준 getAttribute 사용
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
  // 교정: exportAttribute -> 표준 getAttribute 사용
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

  if ((!dbSavedAddress || dbSavedAddress.includes("중...")) && typeof window.kakao !== 'undefined' && window.kakao.maps) {
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

// =========================================================================
// 주소 역변환 및 해안 랜드마크 탐색 유틸리티 (인스턴스 바인딩 보존)
// =========================================================================
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

// 실시간 DB 스트리밍 및 공통 컴포넌트 데이터 바인딩 시퀀스
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

function saveCategoryOrderWithinTabToFirebase(container) {
  const batch = db.batch(); const baseTime = Date.now();
  ([...container.querySelectorAll('.pm-item')]).forEach((el, index) => {
    const docId = el.id.replace('pm-node-', '');
    if (!window.cachedPublicToilets.some(t => t.id === docId)) batch.update(db.collection('fishing_points').doc(docId), { createdAt: firebase.firestore.Timestamp.fromMillis(baseTime - (index * 1000)) });
  });
  batch.commit().catch(err => console.error(err));
}

// =========================================================================
// 전역 초기 부팅 실행 시퀀스
// =========================================================================
window.initHomeDataSequence();
window.loadCoastalDepthData();