// =========================================================================
// [포인트 관리] 대시보드 시스템, 드래그 소팅 및 카테고리 관리 통합 모듈
// =========================================================================
import './management.css';
import { db } from '../../utils/firebase.js';

window.currentActiveCategory = null;

// 카테고리 수정 모달 닫기 연동 함수 추가
window.closeCategoryEditModal = function () {
  window.closeModals();
};

// 카테고리 관리 모달 오픈 및 리스트 빌드
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

  // index.html 모달의 하단 고정 가로 그리드 버튼 배치 구조(.modal-action-row-grid .modal-btn.save)에 맞춰 타겟팅 세정
  const addBtn = modal.querySelector('.modal-action-row-grid .modal-btn.save');
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

  window.bindCategoryDragAndDropEvents(listContainer);
};

// 카테고리 관리 창 내 드래그 앤 드롭 이벤트를 처리하는 스레드 (물리 트래킹 가속 최적화)
window.bindCategoryDragAndDropEvents = function (container) {
  if (!container) return;
  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.pm-category-drag-handle');
    if (!handle) return;
    const item = handle.closest('.pm-item');
    if (!item) return;
    
    e.preventDefault();
    item.classList.add('dragging');
    container.setPointerCapture(e.pointerId);

    const onPointerMove = (evt) => {
      const draggingItem = container.querySelector('.pm-item.dragging');
      if (!draggingItem) return;
      
      const siblings = [...container.querySelectorAll('.pm-item:not(.dragging)')];
      const nextSibling = siblings.find(sib => evt.clientY < sib.getBoundingClientRect().top + sib.getBoundingClientRect().height / 2);
      
      if (nextSibling) {
        if (draggingItem.nextSibling !== nextSibling) {
          container.insertBefore(draggingItem, nextSibling);
        }
      } else {
        if (container.lastChild !== draggingItem) {
          container.appendChild(draggingItem);
        }
      }
    };

    const onPointerUp = (evt) => {
      item.classList.remove('dragging');
      try { container.releasePointerCapture(evt.pointerId); } catch(err) {}
      
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);

      const newOrder = [...container.querySelectorAll('.pm-item')].map(el => el.getAttribute('data-name'));
      localStorage.setItem('pm-category-order', JSON.stringify(newOrder));

      if (typeof window.renderPointsManagementTab === 'function') {
        window.renderPointsManagementTab();
      }
    };

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
  });
};

// 포인트 관리 탭 메인 렌더링 컨트롤러
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

    if (displayPoints.length === 0) { listContainer.innerHTML = `<div class="pm-empty-msg">카테고리에 등록된 포인트가 없습니다.</div>`; return; }
    displayPoints.forEach(item => { listContainer.appendChild(createPointRowComponent(item, window.currentActiveCategory === '전체' || window.currentActiveCategory === '즐겨찾기')); });

    if (window.currentActiveCategory === '즐겨찾기') window.bindDragAndDropEvents(listContainer, true);
    else if (window.currentActiveCategory !== '전체' && window.currentActiveCategory !== '최근 추가된 화장실') window.bindDragAndDropEvents(listContainer, false);
  }

  renderActiveCategoryPoints();
};

// 포인트 및 화장실 아이템 행 컴포넌트 동적 빌더
// =========================================================================
// [포인트 관리] 포인트 및 화장실 아이템 행 컴포넌트 동적 빌더 (모달 연동 교정)
// =========================================================================
function createPointRowComponent(pt, isFavSection) {
  const row = document.createElement('div'); 
  row.className = "pm-item"; 
  row.id = `pm-node-${pt.id}`;
  
  const isCurrentlyFav = pt.isFavorite === true; 
  const isToilet = (pt.category === 'toilet');
  
  // 화장실 데이터와 일반 포인트 데이터의 주소 필드 병합 예외 처리
  const cleanAddress = pt.dbSavedAddress || pt.address || (isToilet ? "소재지 도로명 주소" : "주소 정보 없음");

  row.innerHTML = `
    <div class="pm-item-left" style="width: calc(100% - 100px);">
      <div class="pm-drag-handle" style="${isToilet ? 'visibility:hidden; pointer-events:none;' : ''}; touch-action: none;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-main)" stroke="var(--text-main)" stroke-width="2.5">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </div>
      ${isFavSection ? `<div class="pm-color-dot" style="background-color: ${isToilet ? '#ff9500' : (pt.color || '#007aff')}; margin-right: 4px;"></div>` : ''}
      <div class="pm-item-info" style="padding-left: 4px; min-width: 0; flex: 1;">
        <span class="pm-item-name" style="outline:none; font-weight:600;">${pt.name || (isToilet ? '공중화장실' : '무명 포인트')}</span>
        <span style="font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; margin-top:2px;">${cleanAddress}</span>
      </div>
    </div>
    <div class="pm-item-actions">
      <button class="pm-action-btn favorite ${isCurrentlyFav ? 'active' : ''}" style="${isToilet ? 'display:none;' : ''}"><svg width="15" height="15" viewBox="0 0 24 24" fill="${isCurrentlyFav ? '#ffcc00' : 'none'}" stroke="${isCurrentlyFav ? '#ffcc00' : '#adb5bd'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></button>
      <button class="pm-action-btn edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
      <button class="pm-action-btn delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
    </div>
  `;

  // 즐겨찾기 버튼 클릭 이벤트 핸들러
  const fBtn = row.querySelector('.pm-action-btn.favorite');
  if (fBtn && !isToilet) {
    fBtn.onclick = (e) => { 
      e.stopPropagation(); 
      db.collection('fishing_points').doc(pt.id).update({ 
        isFavorite: !isCurrentlyFav, 
        favoritedAt: !isCurrentlyFav ? Date.now() : firebase.firestore.FieldValue.delete() 
      }); 
    };
  }
  
  // 수정 버튼 클릭 이벤트 핸들러 (유형별 모달 바인딩 라우팅 분기 처리)
  const eBtn = row.querySelector('.pm-action-btn.edit');
  if (eBtn) {
    eBtn.onclick = (e) => { 
      e.stopPropagation(); 
      if (isToilet) {
        // 공중화장실 전용 수정 모달 연동
        window.openToiletEditModal(pt.id, pt.name || '공중화장실', pt.memo || '', cleanAddress);
      } else {
        // 일반 낚시 포인트 전용 수정 모달 연동
        window.openPointEditModal(pt.id, pt.name || '무명 포인트', pt.category || '미분류', pt.memo || '등록된 메모가 없습니다.', pt.parkingType || 'none', pt.parkingUnit || '10분', pt.parkingPrice || '0', pt.hasStore || false, pt.hasCafe || false, pt.hasTackle || false, cleanAddress, pt.lat, pt.lng); 
      }
    };
  }
  
  // 삭제 버튼 클릭 이벤트 핸들러 (컬렉션 분기 매핑 완결)
  const dBtn = row.querySelector('.pm-action-btn.delete');
  if (dBtn) {
    dBtn.onclick = (e) => { 
      e.stopPropagation(); 
      window.openMarkerDeleteModal(pt.id, isToilet ? 'public_toilets' : 'fishing_points', pt.name || (isToilet ? '공중화장실' : '무명 포인트')); 
    };
  }

  // 행 자체 클릭 시 지도 이동 및 바텀시트 디테일 뷰 오픈
  row.onclick = (e) => { 
    if (e.target.closest('.pm-action-btn') || e.target.closest('.pm-drag-handle')) return; 
    window.openPointDetailFromList(pt); 
  };
  
  return row;
}

// 일반 포인트 리스트 내 아이템 드래그 앤 드롭 정렬 핸들러 (연동 래깅 완전 교정)
window.bindDragAndDropEvents = function (container, isFavSection = false) {
  if (!container) return;
  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.pm-drag-handle'); if (!handle) return;
    const item = handle.closest('.pm-item'); if (!item) return;
    
    e.preventDefault(); 
    item.classList.add('dragging'); 
    container.setPointerCapture(e.pointerId);

    const onPointerMove = (evt) => {
      const draggingItem = container.querySelector('.pm-item.dragging'); if (!draggingItem) return;
      
      const siblings = [...container.querySelectorAll('.pm-item:not(.dragging)')];
      const nextSibling = siblings.find(sib => evt.clientY < sib.getBoundingClientRect().top + sib.getBoundingClientRect().height / 2);
      
      if (nextSibling) {
        if (draggingItem.nextSibling !== nextSibling) {
          container.insertBefore(draggingItem, nextSibling);
        }
      } else {
        if (container.lastChild !== draggingItem) {
          container.appendChild(draggingItem);
        }
      }
    };

    const onPointerUp = (evt) => {
      item.classList.remove('dragging'); 
      try { container.releasePointerCapture(evt.pointerId); } catch(err) {}
      
      container.removeEventListener('pointermove', onPointerMove); 
      container.removeEventListener('pointerup', onPointerUp); 
      container.removeEventListener('pointercancel', onPointerUp);
      
      if (isFavSection) saveFavoriteOrderToFirebase(container); 
      else saveCategoryOrderWithinTabToFirebase(container);
    };
    
    container.addEventListener('pointermove', onPointerMove); 
    container.addEventListener('pointerup', onPointerUp); 
    container.addEventListener('pointercancel', onPointerUp);
  });
};

// 즐겨찾기 목록 정렬 시퀀스 파이어베이스 배치 업데이트 스레드
function saveFavoriteOrderToFirebase(container) {
  const batch = db.batch(); const baseTime = Date.now();
  ([...container.querySelectorAll('.pm-item')]).forEach((el, index) => { batch.update(db.collection('fishing_points').doc(el.id.replace('pm-node-', '')), { favoritedAt: baseTime - (index * 1000) }); });
  batch.commit();
}

// 일반 카테고리 탭 내부 정렬 시퀀스 파이어베이스 배치 업데이트 스레드
function saveCategoryOrderWithinTabToFirebase(container) {
  const batch = db.batch(); const baseTime = Date.now();
  ([...container.querySelectorAll('.pm-item')]).forEach((el, index) => {
    const docId = el.id.replace('pm-node-', '');
    if (!window.cachedPublicToilets.some(t => t.id === docId)) batch.update(db.collection('fishing_points').doc(docId), { createdAt: firebase.firestore.Timestamp.fromMillis(baseTime - (index * 1000)) });
  });
  batch.commit().catch(err => console.error("순서 저장 중 파이어베이스 배치 트랜잭션 실패:", err));
}

// =========================================================================
// [포인트 관리] 카테고리 생성, 수정, 삭제 및 모달 레이어 트랜지션 제어 그룹
// =========================================================================

// 카테고리 정보 수정 바텀시트 호출 핸들러
window.openCategoryEditBottomSheet = function (catName, catColor, event) {
  if (event) event.stopPropagation();
  
  // 기존 카테고리 관리 모달 활성 클래스 제거 (숨김 처리)
  document.getElementById('categoryManageModal')?.classList.remove('active');
  
  document.getElementById('editTargetCategoryOldName').value = catName; 
  document.getElementById('editCategoryNameInput').value = catName;
  
  const modalTitle = document.querySelector('#categoryEditModal h3 span'); 
  if (modalTitle) modalTitle.innerText = "카테고리 수정";
  
  window.selectCategoryColor(catColor || '#4f46e5'); 
  document.getElementById('modalBackdrop')?.classList.add('active'); 
  document.getElementById('categoryEditModal').classList.add('active');
};

// 신규 카테고리 추가 바텀시트 호출 핸들러
window.openCategoryAddBottomSheet = function () {
  // 기존 카테고리 관리 모달 활성 클래스 제거 (숨김 처리)
  document.getElementById('categoryManageModal')?.classList.remove('active');

  const modalTitle = document.querySelector('#categoryEditModal h3 span'); 
  if (modalTitle) modalTitle.innerText = "카테고리 추가";
  
  document.getElementById('editTargetCategoryOldName').value = "NEW_CATEGORY"; 
  document.getElementById('editCategoryNameInput').value = "";
  
  window.selectCategoryColor('#4f46e5'); 
  document.getElementById('modalBackdrop')?.classList.add('active'); 
  document.getElementById('categoryEditModal').classList.add('active');
};

// 카테고리 수정/생성 폼 데이터 컴포넌트 연동 세션
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
    localStorage.setItem('pm-category-order', JSON.stringify(savedCatOrder)); 
    localStorage.setItem('pm-category-colors', JSON.stringify(savedCatColors));
    
    alert(`[${nextCatName}] 카테고리가 추가되었습니다.`); 
    window.openCategoryManageModal();
    return;
  }

  if (nextCatName !== modeFlag && (savedCatOrder.includes(nextCatName) || systemCategories.includes(nextCatName))) {
    return alert("이미 존재하는 카테고리 명칭이거나 사용할 수 없는 이름입니다.");
  }

  const idx = savedCatOrder.indexOf(modeFlag); 
  if (idx !== -1) savedCatOrder[idx] = nextCatName;

  delete savedCatColors[modeFlag]; savedCatColors[nextCatName] = nextColor;
  localStorage.setItem('pm-category-order', JSON.stringify(savedCatOrder)); 
  localStorage.setItem('pm-category-colors', JSON.stringify(savedCatColors));

  const batch = db.batch(); 
  const targets = window.cachedFishingPoints.filter(p => (p.category || '미분류').trim() === modeFlag.trim());
  targets.forEach(item => batch.update(db.collection('fishing_points').doc(item.id), { category: nextCatName, color: nextColor }));
  
  batch.commit().then(() => { 
    if (window.currentActiveCategory === modeFlag) {
      window.currentActiveCategory = nextCatName;
      localStorage.setItem('pm-last-category', nextCatName);
    }
    window.openCategoryManageModal();
  }).catch(err => {
    console.error(err);
    alert("카테고리 데이터 동기화 중 오류가 발생했습니다.");
  });
};

// 소속 인스턴스 검증 기반 카테고리 안전 삭제 모델 인터페이스
window.deleteCategoryWithGuard = function (catName, event) {
  if (event) event.stopPropagation();
  if (window.cachedFishingPoints.some(p => (p.category || '미분류').trim() === catName.trim())) { 
    alert(`삭제 불가: [${catName}] 카테고리 내부에 소속된 포인트 마커가 존재합니다.`); 
    return; 
  }
  if (confirm(`[${catName}] 카테고리를 삭제하시겠습니까?`)) {
    let savedCatOrder = JSON.parse(localStorage.getItem('pm-category-order') || '[]'); 
    let savedCatColors = JSON.parse(localStorage.getItem('pm-category-colors') || '{}');
    savedCatOrder = savedCatOrder.filter(c => c !== catName); 
    delete savedCatColors[catName];
    localStorage.setItem('pm-category-order', JSON.stringify(savedCatOrder)); 
    localStorage.setItem('pm-category-colors', JSON.stringify(savedCatColors));
    alert("카테고리가 삭제되었습니다."); 
    window.renderPointsManagementTab();
  }
};

// 카테고리 색상 선택 및 실시간 마커 아이콘 프리뷰 동기화 엔진
window.selectCategoryColor = function (color) {
  if (document.getElementById('editCategoryColorInput')) document.getElementById('editCategoryColorInput').value = color;
  document.querySelectorAll('.color-palette-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-color') === color));
  const previewEl = document.getElementById('categoryEditMarkerIcon'); 
  if (previewEl && typeof window.getFishingPointSvg === 'function') previewEl.innerHTML = window.getFishingPointSvg(color);
};

// 카테고리 추가/수정 바텀시트 닫기(취소) 연동 함수 교정 (상단 선언부 대체 가능)
window.closeCategoryEditModal = function () {
  document.getElementById('categoryEditModal')?.classList.remove('active');
  window.openCategoryManageModal();
};