// =========================================================================
// [MODULE] 게시판 컴포넌트 엔진 (공지사항/이벤트 + 정보 게시판)
// =========================================================================
import { db } from '../../utils/firebase.js'; 
import './board.css'; 

let cachedNotices = [];
let cachedEvents = [];
let currentBoardTab = 'notice';

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

    const todayStr = '2026-06-24';
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

// --- 정보 게시판(금어기, 금지체장, 물때표, 매듭법) 동적 DB 연동 로직 ---
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
    if (filtered.length === 0) { container.innerHTML = '<div class="pm-empty-msg">검색된 금어기 정보가 없습니다.</div>'; return; }
    
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
    if (filtered.length === 0) { container.innerHTML = '<div class="pm-empty-msg">검색된 금지체장 기준이 없습니다.</div>'; return; }
    
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
      else sizeRenderStr = "제한 규격 없음";

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