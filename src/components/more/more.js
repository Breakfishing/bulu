// =========================================================================
// [MODULE] 더보기 탭 통합 제어 엔진 (게시판 / 정보망 / 라인 정보 / 앱 설정)
// =========================================================================
import { db } from '../../utils/firebase.js'; 
import firebase from 'firebase/compat/app'; // Timestamp 및 FieldValue 처리를 위한 코어 바인딩
import './more.css'; 

let cachedNotices = [];
let cachedEvents = [];
let currentBoardTab = 'notice';

// -------------------------------------------------------------------------
// [SUB-THREAD 1] 공지사항 및 이벤트 게시판 제어 스레드
// -------------------------------------------------------------------------
export function showNoticePage(initialTab) {
  window.closeModals();
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.getElementById('notice-page')?.classList.add('active');
  window.switchBoardSubTab((initialTab === 'event') ? 'event' : 'notice');
}

export function switchBoardSubTab(tab) {
  currentBoardTab = tab;
  const btnNotice = document.getElementById('btnSubTabNotice'), btnEvent = document.getElementById('btnSubTabEvent');
  const containerNotice = document.getElementById('notice-list-container'), containerEvent = document.getElementById('event-list-container');
  const detailContainer = document.getElementById('notice-inline-detail-container');

  if (btnNotice) btnNotice.classList.toggle('active', tab === 'notice');
  if (btnEvent) btnEvent.classList.toggle('active', tab === 'event');
  if (containerNotice) containerNotice.classList.toggle('active', tab === 'notice');
  if (containerEvent) containerEvent.classList.toggle('active', tab === 'event');
  if (detailContainer) detailContainer.classList.remove('active');

  const eventRow = document.getElementById('noticeWriteEventRow');
  if (eventRow) {
    eventRow.style.display = (tab === 'event') ? 'block' : 'none';
  }

  if (tab === 'notice') { document.getElementById('lblNoticeHeaderTitle').innerText = '공지사항'; window.fetchLiveNotices(); }
  else { document.getElementById('lblNoticeHeaderTitle').innerText = '이벤트'; window.fetchLiveEvents(); }
}

export function handleNoticeBackNavigation() {
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
}

export function fetchLiveNotices() {
  const container = document.getElementById('notice-list-container'); if (!container) return;
  container.innerHTML = '<div class="pm-empty-msg">공지사항을 불러오는 중입니다...</div>';

  db.collection('notices').get().then((snapshot) => {
    cachedNotices = []; container.innerHTML = ''; if (snapshot.empty) { container.innerHTML = '<div class="pm-empty-msg">등록된 공지사항이 없습니다.</div>'; return; }
    
    snapshot.forEach((doc) => {
      cachedNotices.push({ id: doc.id, ...doc.data() });
    });

    cachedNotices.sort((a, b) => {
      const aPinned = a.isPinned === true ? 1 : 0;
      const bPinned = b.isPinned === true ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aTime = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime()) : 0;
      const bTime = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime()) : 0;
      return bTime - aTime;
    });

    const totalCount = cachedNotices.length;
    cachedNotices.forEach((data, index) => {
      let dateStr = "일자 미상"; if (data.createdAt) { const d = (typeof data.createdAt.toDate === 'function') ? data.createdAt.toDate() : new Date(data.createdAt); dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
      const item = document.createElement('div'); 
      item.className = 'notice-item' + (data.isPinned ? ' pinned-item' : '');
      
      const numDisplay = data.isPinned ? '<span class="pinned-badge">고정</span>' : (totalCount - index);
      item.innerHTML = `<div class="notice-item-num">${numDisplay}</div><div class="notice-item-title">${data.title || '제목 없음'}</div><div class="notice-item-date">${dateStr}</div>`;
      item.onclick = () => window.openNoticeDetail(data.id); container.appendChild(item);
    });
  }).catch(() => { container.innerHTML = '<div class="pm-empty-msg">데이터 수신에 실패했습니다.</div>'; });
}

export function fetchLiveEvents() {
  const container = document.getElementById('event-list-container'); if (!container) return;
  container.innerHTML = '<div class="pm-empty-msg">이벤트를 불러오는 중입니다...</div>';

  db.collection('events').get().then((snapshot) => {
    cachedEvents = []; container.innerHTML = ''; if (snapshot.empty) { container.innerHTML = '<div class="pm-empty-msg">등록된 이벤트가 없습니다.</div>'; return; }
    
    snapshot.forEach((doc) => {
      cachedEvents.push({ id: doc.id, ...doc.data() });
    });

    cachedEvents.sort((a, b) => {
      const aPinned = a.isPinned === true ? 1 : 0;
      const bPinned = b.isPinned === true ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aTime = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime()) : 0;
      const bTime = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime()) : 0;
      return bTime - aTime;
    });

    const todayStr = '2026-06-27';
    const totalCount = cachedEvents.length;

    cachedEvents.forEach((data, index) => {
      let dateStr = "일자 미상"; if (data.createdAt) { const d = (typeof data.createdAt.toDate === 'function') ? data.createdAt.toDate() : new Date(data.createdAt); dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
      
      let statusText = "진행중";
      let statusClass = "ongoing";
      if (data.startDate && data.endDate) {
        if (todayStr > data.endDate) {
          statusText = "종료됨";
          statusClass = "ended";
        } else if (todayStr < data.startDate) {
          statusText = "예정됨";
          statusClass = "upcoming";
        }
      }

      const item = document.createElement('div'); 
      item.className = 'notice-item' + (data.isPinned ? ' pinned-item' : '');
      
      const numDisplay = data.isPinned ? '<span class="pinned-badge">고정</span>' : (totalCount - index);
      item.innerHTML = `
        <div class="notice-item-num">${numDisplay}</div>
        <div class="notice-item-title">
          <span class="event-status-badge ${statusClass}">${statusText}</span>
          ${data.title || '제목 없음'}
        </div>
        <div class="notice-item-date">${dateStr}</div>
      `;
      item.onclick = () => window.openNoticeDetail(data.id); container.appendChild(item);
    });
  }).catch(() => { container.innerHTML = '<div class="pm-empty-msg">데이터 수신에 실패했습니다.</div>'; });
}

export function openNoticeDetail(docId) {
  const targetList = (currentBoardTab === 'notice') ? cachedNotices : cachedEvents;
  const notice = targetList.find(n => n.id === docId); if (!notice) return;

  document.getElementById('lblInlineNoticeTitle').innerText = notice.title || '제목 없음';
  if (document.getElementById('lblInlineNoticeDate') && notice.createdAt) {
    const d = (typeof notice.createdAt.toDate === 'function') ? notice.createdAt.toDate() : new Date(notice.createdAt);
    let displayDate = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    if (currentBoardTab === 'event' && notice.startDate && notice.endDate) {
      displayDate += ` (기간: ${notice.startDate} ~ ${notice.endDate})`;
    }
    document.getElementById('lblInlineNoticeDate').innerText = displayDate;
  }
  document.getElementById('lblInlineNoticeContent').innerText = notice.content || '';
  document.getElementById('notice-list-container')?.classList.remove('active');
  document.getElementById('event-list-container')?.classList.remove('active');
  document.getElementById('notice-inline-detail-container')?.classList.add('active');

  document.getElementById('btnNoticeInlineEdit').onclick = () => {
    document.getElementById('noticeWriteMode').value = 'edit'; document.getElementById('noticeWriteTargetId').value = docId;
    document.getElementById('noticeWriteTitle').value = notice.title || ''; document.getElementById('noticeWriteContent').value = notice.content || '';
    
    const pinCheckbox = document.getElementById('noticeWritePinned');
    if (pinCheckbox) pinCheckbox.checked = notice.isPinned === true;

    if (currentBoardTab === 'event') {
      document.getElementById('eventStartDate').value = notice.startDate || '';
      document.getElementById('eventEndDate').value = notice.endDate || '';
      document.getElementById('noticeWriteEventRow').style.display = 'block';
    } else {
      document.getElementById('noticeWriteEventRow').style.display = 'none';
    }

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
}

export function openNoticeWriteModal() {
  if (document.getElementById('noticeWriteTitle')) document.getElementById('noticeWriteTitle').value = '';
  if (document.getElementById('noticeWriteContent')) document.getElementById('noticeWriteContent').value = '';
  
  const pinCheckbox = document.getElementById('noticeWritePinned');
  if (pinCheckbox) pinCheckbox.checked = false;

  if (currentBoardTab === 'event') {
    document.getElementById('eventStartDate').value = '';
    document.getElementById('eventEndDate').value = '';
    document.getElementById('noticeWriteEventRow').style.display = 'block';
  } else {
    document.getElementById('noticeWriteEventRow').style.display = 'none';
  }

  document.getElementById('noticeWriteMode').value = 'add'; document.getElementById('noticeWriteTargetId').value = '';
  document.getElementById('lblNoticeWriteModalTitle').innerText = '글 등록';
  document.getElementById('modalBackdrop')?.classList.add('active'); document.getElementById('noticeWriteModal')?.classList.add('active');
}

export function saveNoticeData() {
  const title = document.getElementById('noticeWriteTitle')?.value.trim() || '';
  const content = document.getElementById('noticeWriteContent')?.value.trim() || '';
  const mode = document.getElementById('noticeWriteMode').value;
  const targetId = document.getElementById('noticeWriteTargetId').value;
  const collectionName = (currentBoardTab === 'notice') ? 'notices' : 'events';
  
  const pinCheckbox = document.getElementById('noticeWritePinned');
  const isPinned = pinCheckbox ? pinCheckbox.checked : false;

  if (!title || !content) return alert('제목과 내용을 모두 입력해 주세요.');

  let payload = { title, content, isPinned };

  if (currentBoardTab === 'event') {
    const startDate = document.getElementById('eventStartDate').value;
    const endDate = document.getElementById('eventEndDate').value;
    if (!startDate || !endDate) return alert('이벤트 시작일과 종료일을 모두 입력해 주세요.');
    payload.startDate = startDate;
    payload.endDate = endDate;
  }

  if (mode === 'edit') {
    db.collection(collectionName).doc(targetId).update(payload).then(() => {
      window.closeModals(); alert('성공적으로 수정되었습니다.');
      document.getElementById('lblInlineNoticeTitle').innerText = title; document.getElementById('lblInlineNoticeContent').innerText = content;
      if (currentBoardTab === 'notice') window.fetchLiveNotices(); else window.fetchLiveEvents();
    }).catch(() => alert('수정 중 오류가 발생했습니다.'));
  } else {
    payload.date = window.getFormattedCurrentTime();
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    
    db.collection(collectionName).add(payload).then(() => {
      window.closeModals(); alert('성공적으로 등록되었습니다.');
      document.getElementById('notice-inline-detail-container')?.classList.remove('active');
      if (currentBoardTab === 'notice') { document.getElementById('notice-list-container')?.classList.add('active'); window.fetchLiveNotices(); }
      else { document.getElementById('event-list-container')?.classList.add('active'); window.fetchLiveEvents(); }
    }).catch(() => alert('저장 중 오류가 발생했습니다.'));
  }
}

// -------------------------------------------------------------------------
// [SUB-THREAD 2] 정보망 게시판 (금어기, 금지체장, 물때표, 매듭법) 연동 스레드
// -------------------------------------------------------------------------
let cachedFishingBans = [];
let cachedSizeLimits = [];
let cachedKnotGuides = [];
let currentInfoTab = 'fishing_ban';
let isInfoListenersInitialized = false;
window.cachedStaticTideHtml = '';

export const InfoBoardSystem = {
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

export function showInfoBoardPage(subTabId) {
  window.closeModals();
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  const infoBoardPage = document.getElementById('info-board-page');
  if (infoBoardPage) infoBoardPage.classList.add('active');
  
  window.switchInfoSubTab(subTabId);
  window.initInfoBoardRealtimeListeners();
}

export function handleInfoBoardBackNavigation() {
  document.getElementById('info-board-page')?.classList.remove('active');
  document.getElementById('tab-more')?.classList.add('active');
  const navItems = document.querySelectorAll('.nav-item');
  if (navItems.length >= 4) {
    navItems.forEach(ni => ni.classList.remove('active'));
    navItems[3].classList.add('active');
  }
}

export function switchInfoSubTab(subTabId) {
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
}

export function initInfoBoardRealtimeListeners() {
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
}

export function toggleBanPeriodType(type, element) {
  const periodTypeInput = document.getElementById('banPeriodType');
  if (periodTypeInput) periodTypeInput.value = type;

  document.querySelectorAll('#fishingBanModal .chip-btn').forEach(b => {
    if (b.id === 'btnBanPeriodTypeMonth' || b.id === 'btnBanPeriodTypeDetail') {
      b.classList.remove('active');
    }
  });
  if (element) element.classList.add('active');

  const monthRow = document.getElementById('banMonthRow');
  const detailRow = document.getElementById('banDetailPeriodRow');

  if (type === 'month') {
    if (monthRow) monthRow.style.display = 'block';
    if (detailRow) detailRow.style.display = 'none';
  } else {
    if (monthRow) monthRow.style.display = 'none';
    if (detailRow) detailRow.style.display = 'flex';
  }
}

export function renderInfoContentCards(filterKeyword = "") {
  const container = document.getElementById('infoBoardContentContainer');
  if (!container) return;
  container.innerHTML = "";
  const kw = filterKeyword.trim().toLowerCase();

  if (currentInfoTab === 'fishing_ban') {
    const filtered = cachedFishingBans.filter(b => (b.species || "").toLowerCase().includes(kw));
    if (filtered.length === 0) { container.innerHTML = '<div class="pm-empty-msg">검색된 어종이 없습니다.</div>'; return; }
    
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
    if (filtered.length === 0) { container.innerHTML = '<div class="pm-empty-msg">검색된 어종이 없습니다.</div>'; return; }
    
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
      else sizeRenderStr = "금지 체장 없음";

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
      
      let youtubeId = InfoBoardSystem.extractYoutubeId(item.videoUrl);
      const thumbUrl = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg` : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"></svg>';
      const formattedTags = InfoBoardSystem.parseHashTags(item.tags || item.recommend || '');
      
      const sourceText = (item.source && item.source.trim() !== "") ? `${item.source.trim()} · 유튜브` : '유튜브 동영상';

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
          <div class="info-knot-source">${sourceText}</div>
        </div>
      `;
      grid.appendChild(knotCard);
    });
    container.appendChild(grid);
  }
}

export function handleInfoSearch(val) {
  window.renderInfoContentCards(val);
}

export function openInfoWriteFormModal(tabType) {
  window.closeModals();
  document.getElementById('modalBackdrop')?.classList.add('active');
  
  if (tabType === 'fishing_ban') {
    document.getElementById('banModalMode').value = 'add';
    document.getElementById('banModalTargetId').value = '';
    document.getElementById('banSpecies').value = '';
    if (document.getElementById('banMonthInput')) document.getElementById('banMonthInput').value = '';
    if (document.getElementById('banStartMonth')) document.getElementById('banStartMonth').value = '';
    if (document.getElementById('banStartDay')) document.getElementById('banStartDay').value = '';
    if (document.getElementById('banEndMonth')) document.getElementById('banEndMonth').value = '';
    if (document.getElementById('banEndDay')) document.getElementById('banEndDay').value = '';
    document.getElementById('banRegion').value = '';
    document.getElementById('banNote').value = '';
    document.getElementById('banImageUrl').value = '';
    window.toggleBanPeriodType('month', document.getElementById('btnBanPeriodTypeMonth'));
    document.getElementById('lblFishingBanModalTitle').innerText = '금어기 등록';
    document.getElementById('fishingBanModal')?.classList.add('active');
  } 
  else if (tabType === 'size_limit') {
    document.getElementById('limitModalMode').value = 'add';
    document.getElementById('limitModalTargetId').value = '';
    document.getElementById('limitSpecies').value = '';
    document.getElementById('limitMinSize').value = '';
    document.getElementById('limitMaxSize').value = '';
    document.getElementById('limitImageUrl').value = '';
    window.selectLimitType('sea', document.getElementById('chipLimitSea'));
    document.getElementById('lblSizeLimitModalTitle').innerText = '금지체장 등록';
    document.getElementById('sizeLimitModal')?.classList.add('active');
  } 
  else if (tabType === 'knot_guide') {
    document.getElementById('knotModalMode').value = 'add';
    document.getElementById('knotModalTargetId').value = '';
    document.getElementById('knotTitle').value = '';
    if (document.getElementById('knotTags')) document.getElementById('knotTags').value = '';
    if (document.getElementById('knotSource')) document.getElementById('knotSource').value = '';
    document.getElementById('knotVideoUrl').value = '';
    document.getElementById('lblKnotGuideModalTitle').innerText = '매듭법 등록';
    document.getElementById('knotGuideModal')?.classList.add('active');
  }
}

export function openInfoEditFormModal(tabType, docId) {
  window.closeModals();
  document.getElementById('modalBackdrop')?.classList.add('active');

  if (tabType === 'fishing_ban') {
    const item = cachedFishingBans.find(b => b.id === docId);
    if (!item) return;
    document.getElementById('banModalMode').value = 'edit';
    document.getElementById('banModalTargetId').value = docId;
    document.getElementById('banSpecies').value = item.species || '';
    if (document.getElementById('banMonthInput')) document.getElementById('banMonthInput').value = item.monthInput || '';
    if (document.getElementById('banStartMonth')) document.getElementById('banStartMonth').value = item.startMonth || '';
    if (document.getElementById('banStartDay')) document.getElementById('banStartDay').value = item.startDay || '';
    if (document.getElementById('banEndMonth')) document.getElementById('banEndMonth').value = item.endMonth || '';
    if (document.getElementById('banEndDay')) document.getElementById('banEndDay').value = item.endDay || '';
    document.getElementById('banRegion').value = item.region || '';
    document.getElementById('banNote').value = item.note || '';
    document.getElementById('banImageUrl').value = item.imageUrl || '';
    
    const pType = item.periodType || 'month';
    window.toggleBanPeriodType(pType, pType === 'detail' ? document.getElementById('btnBanPeriodTypeDetail') : document.getElementById('btnBanPeriodTypeMonth'));
    
    document.getElementById('lblFishingBanModalTitle').innerText = '금어기 수정';
    document.getElementById('fishingBanModal')?.classList.add('active');
  } 
  else if (tabType === 'size_limit') {
    const item = cachedSizeLimits.find(s => s.id === docId);
    if (!item) return;
    document.getElementById('limitModalMode').value = 'edit';
    document.getElementById('limitModalTargetId').value = docId;
    document.getElementById('limitSpecies').value = item.species || '';
    document.getElementById('limitMinSize').value = item.minSize || '';
    document.getElementById('limitMaxSize').value = item.maxSize || '';
    document.getElementById('limitImageUrl').value = item.imageUrl || '';
    window.selectLimitType(item.type || 'sea', item.type === 'fresh' ? document.getElementById('chipLimitFresh') : document.getElementById('chipLimitSea'));
    document.getElementById('lblSizeLimitModalTitle').innerText = '금지체장 수정';
    document.getElementById('sizeLimitModal')?.classList.add('active');
  } 
  else if (tabType === 'knot_guide') {
    const item = cachedKnotGuides.find(k => k.id === docId);
    if (!item) return;
    document.getElementById('knotModalMode').value = 'edit';
    document.getElementById('knotModalTargetId').value = docId;
    document.getElementById('knotTitle').value = item.title || '';
    if (document.getElementById('knotTags')) document.getElementById('knotTags').value = item.tags || item.recommend || '';
    if (document.getElementById('knotSource')) document.getElementById('knotSource').value = item.source || '';
    document.getElementById('knotVideoUrl').value = item.videoUrl || '';
    document.getElementById('lblKnotGuideModalTitle').innerText = '매듭법 수정';
    document.getElementById('knotGuideModal')?.classList.add('active');
  }
}

export function selectLimitType(type, btn) {
  document.getElementById('limitType').value = type;
  document.querySelectorAll('#limitTypeChips .chip-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

export function saveFishingBanData() {
  const species = document.getElementById('banSpecies').value.trim();
  const periodType = document.getElementById('banPeriodType')?.value || 'month';
  const monthInput = document.getElementById('banMonthInput')?.value.trim() || '';
  const startMonth = document.getElementById('banStartMonth')?.value.trim() || '';
  const startDay = document.getElementById('banStartDay')?.value.trim() || '';
  const endMonth = document.getElementById('banEndMonth')?.value.trim() || '';
  const endDay = document.getElementById('banEndDay')?.value.trim() || '';
  const region = document.getElementById('banRegion').value.trim();
  const note = document.getElementById('banNote').value.trim();
  const imageUrl = document.getElementById('banImageUrl').value.trim();
  const mode = document.getElementById('banModalMode').value;
  const targetId = document.getElementById('banModalTargetId').value;

  if (!species) return alert('어종명을 입력해 주세요.');

  let period = '';
  if (periodType === 'month') {
    period = monthInput ? `${monthInput}월` : '';
  } else {
    period = (startMonth && startDay && endMonth && endDay) ? `${startMonth}월 ${startDay}일 ~ ${endMonth}월 ${endDay}일` : '';
  }

  const payload = { 
    species, period, periodType, monthInput, startMonth, startDay, endMonth, endDay, region, note, imageUrl, 
    createdAt: firebase.firestore.FieldValue.serverTimestamp() 
  };

  if (mode === 'edit') {
    db.collection('fishing_ban').doc(targetId).update({ 
      species, period, periodType, monthInput, startMonth, startDay, endMonth, endDay, region, note, imageUrl 
    }).then(() => {
      window.closeModals(); alert('수정되었습니다.');
    }).catch(() => alert('수정 중 오류가 발생했습니다.'));
  } else {
    db.collection('fishing_ban').add(payload).then(() => {
      window.closeModals(); alert('등록되었습니다.');
    }).catch(() => alert('저장 중 오류가 발생했습니다.'));
  }
}

export function saveSizeLimitData() {
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
    }).catch(() => alert('수정 중 오류가 발생했습니다.'));
  } else {
    db.collection('size_limit').add(payload).then(() => {
      window.closeModals(); alert('등록되었습니다.');
    }).catch(() => alert('저장 중 오류가 발생했습니다.'));
  }
}

export function saveKnotGuideData() {
  const title = document.getElementById('knotTitle').value.trim();
  const tags = document.getElementById('knotTags')?.value.trim() || '';
  const source = document.getElementById('knotSource')?.value.trim() || '';
  const videoUrl = document.getElementById('knotVideoUrl').value.trim();
  const mode = document.getElementById('knotModalMode').value;
  const targetId = document.getElementById('knotModalTargetId').value;

  if (!title) return alert('매듭법 명을 입력해 주세요.');

  const payload = { title, tags, recommend: tags, source, videoUrl, createdAt: firebase.firestore.FieldValue.serverTimestamp() };

  if (mode === 'edit') {
    db.collection('knot_guide').doc(targetId).update({ title, tags, recommend: tags, source, videoUrl }).then(() => {
      window.closeModals(); alert('수정되었습니다.');
    }).catch(() => alert('수정 중 오류가 발생했습니다.'));
  } else {
    db.collection('knot_guide').add(payload).then(() => {
      window.closeModals(); alert('등록되었습니다.');
    }).catch(() => alert('저장 중 오류가 발생했습니다.'));
  }
}

export function deleteInfoData(collection, docId, labelName) {
  window.openMarkerDeleteModal(docId, collection, labelName, () => {
    alert('삭제 완료되었습니다.');
    window.closeModals();
    window.renderInfoContentCards();
  });
}

export function openInfoEditModal() {
  const editContentTextArea = document.getElementById('infoEditContent');
  const infoEditTargetTabInput = document.getElementById('infoEditTargetTab');

  if (editContentTextArea && infoEditTargetTabInput) {
    infoEditTargetTabInput.value = 'tide_table';
    editContentTextArea.value = window.cachedStaticTideHtml || '';

    document.getElementById('modalBackdrop')?.classList.add('active');
    document.getElementById('infoEditModal')?.classList.add('active');
  }
}

export function saveInfoEditData() {
  const editContentTextArea = document.getElementById('infoEditContent');
  if (editContentTextArea) {
    const nextHtml = editContentTextArea.value;
    db.collection('info_static').doc('tide_table').set({ html: nextHtml }).then(() => {
      window.closeModals();
      alert('물때표 정보 가이드 갱신이 완료되었습니다.');
    }).catch(() => alert('저장 중 오류가 발생했습니다.'));
  }
}

// -------------------------------------------------------------------------
// [SUB-THREAD 3] 라인 정보 전용 페이지 및 서브 탭 제어 스레드
// -------------------------------------------------------------------------
export function showLinePage(initialTab) {
  window.closeModals();
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.getElementById('line-page')?.classList.add('active');
  window.switchLineSubTab(initialTab || 'carbon_nylon');
}

export function switchLineSubTab(subTabId) {
  const buttons = {
    'carbon_nylon': document.getElementById('btnSubTabLineCarbonNylon'),
    'pe': document.getElementById('btnSubTabLinePE')
  };
  const sections = {
    'carbon_nylon': document.getElementById('line-carbon-nylon-container'),
    'pe': document.getElementById('line-pe-container')
  };

  Object.values(buttons).forEach(btn => btn?.classList.remove('active'));
  Object.values(sections).forEach(sec => sec?.classList.remove('active'));

  if (buttons[subTabId]) buttons[subTabId].classList.add('active');
  if (sections[subTabId]) sections[subTabId].classList.add('active');
}

// -------------------------------------------------------------------------
// [SUB-THREAD 4] 더보기 탭 전역 앱 설정 및 관리자 디버깅 패널 스레드
// -------------------------------------------------------------------------
export function toggleDarkMode(checkbox) {
  const isDark = checkbox.checked; localStorage.setItem('dark-mode', isDark ? 'true' : 'false');
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  if (window.clean2DLayer) { 
    const CARTO_LIGHT_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    const CARTO_DARK_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    window.clean2DLayer.setUrl(isDark ? CARTO_DARK_URL : CARTO_LIGHT_URL); 
    window.clean2DLayer.redraw(); 
  }
}

export function applyNaviAppUI(app) {
  const label = document.getElementById('naviAppLabel');
  if (label) {
    label.style.background = 'none';
    label.style.color = 'var(--text-main)';
    label.style.padding = '0';
    label.style.borderRadius = '0';
    label.style.display = 'inline';
    label.style.border = 'none';

    if (app === 'naver') label.innerText = '네비게이션: 네이버 지도';
    else if (app === 'kakao') label.innerText = '네비게이션: 카카오 지도';
    else if (app === 'tmap') label.innerText = '네비게이션: TMAP';
  }

  const checkbox = document.getElementById('naviAppToggle');
  if (checkbox) {
    const switchBtn = checkbox.parentElement;
    if (switchBtn) {
      switchBtn.style.transition = 'all 0.25s ease';
      const slider = switchBtn.querySelector('.slider');
      if (slider) slider.style.display = 'none';

      if (app === 'naver') { switchBtn.style.background = '#03C75A'; switchBtn.style.borderColor = '#03C75A'; switchBtn.style.borderRadius = '26px'; } 
      else if (app === 'kakao') { switchBtn.style.background = '#FEE500'; switchBtn.style.borderColor = '#FEE500'; switchBtn.style.borderRadius = '26px'; } 
      else if (app === 'tmap') { switchBtn.style.background = 'linear-gradient(135deg, #007BC7, #6F359E)'; switchBtn.style.borderColor = 'transparent'; switchBtn.style.borderRadius = '26px'; }
    }
  }
}

export function toggleNaviApp(checkbox) {
  let currentApp = localStorage.getItem('navi-app') || 'naver';
  let nextApp = 'naver';

  if (currentApp === 'naver') nextApp = 'kakao';
  else if (currentApp === 'kakao') nextApp = 'tmap';
  else if (currentApp === 'tmap') nextApp = 'naver';

  localStorage.setItem('navi-app', nextApp);
  window.applyNaviAppUI(nextApp);
}

export function showSettingsPage() { window.closeModals(); document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active')); document.getElementById('settings-page')?.classList.add('active'); }
export function hideSettingsPage() { document.getElementById('settings-page')?.classList.remove('active'); document.getElementById('tab-more')?.classList.add('active'); }

export function openAdminModal() {
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
}

// =========================================================================
// [Vite 호환 가드] 기존 마크업 레이어들과 온전하게 매핑하기 위한 글로벌 할당
// =========================================================================
window.showNoticePage = showNoticePage;
window.switchBoardSubTab = switchBoardSubTab;
window.handleNoticeBackNavigation = handleNoticeBackNavigation;
window.fetchLiveNotices = fetchLiveNotices;
window.fetchLiveEvents = fetchLiveEvents;
window.openNoticeDetail = openNoticeDetail;
window.openNoticeWriteModal = openNoticeWriteModal;
window.saveNoticeData = saveNoticeData;

window.InfoBoardSystem = InfoBoardSystem;
window.showInfoBoardPage = showInfoBoardPage;
window.handleInfoBoardBackNavigation = handleInfoBoardBackNavigation;
window.switchInfoSubTab = switchInfoSubTab;
window.initInfoBoardRealtimeListeners = initInfoBoardRealtimeListeners;
window.toggleBanPeriodType = toggleBanPeriodType;
window.renderInfoContentCards = renderInfoContentCards;
window.handleInfoSearch = handleInfoSearch;
window.openInfoWriteFormModal = openInfoWriteFormModal;
window.openInfoEditFormModal = openInfoEditFormModal;
window.selectLimitType = selectLimitType;
window.saveFishingBanData = saveFishingBanData;
window.saveSizeLimitData = saveSizeLimitData;
window.saveKnotGuideData = saveKnotGuideData;
window.deleteInfoData = deleteInfoData;
window.openInfoEditModal = openInfoEditModal;
window.saveInfoEditData = saveInfoEditData;

window.showLinePage = showLinePage;
window.switchLineSubTab = switchLineSubTab;

window.toggleDarkMode = toggleDarkMode;
window.applyNaviAppUI = applyNaviAppUI;
window.toggleNaviApp = toggleNaviApp;
window.showSettingsPage = showSettingsPage;
window.hideSettingsPage = hideSettingsPage;
window.openAdminModal = openAdminModal;