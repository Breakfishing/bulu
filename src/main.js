// =========================================================================
// [CORE] 엔트리 포인트 및 모듈 통합 제어 메인 엔진 (src/main.js)
// =========================================================================
import './style.css'; 
import { db } from './utils/firebase.js'; 

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

// API 무한 중복 요청을 방지하기 위한 전역 네트워킹 락 상태 변수
window.isFetchingAPI = false;

// 오픈 API 키 컴포넌트
const PUBLIC_PORTAL_KEY = "7440915081950a748b3d8d5d1b9904d246ce8028893a02ec4042b2b192383803";
window.DATA_GO_KR_SERVICE_KEY = PUBLIC_PORTAL_KEY;
const KHOA_API_KEY = PUBLIC_PORTAL_KEY;
const KMA_AUTH_KEY = "RAp21103R7OKdtddNwezzw";

// =========================================================================
// [COMMON UI] 라이프사이클 및 네비게이션 공통 UI 제어 영역 (모듈 임포트 전 배치)
// =========================================================================
window.toggleMapLayer = function(layerType) {
    if (!window.mapObj) return;
    
    window.mapObj.eachLayer((layer) => {
        if (layer.options && layer.options.isCartoLayer) {
            window.mapObj.removeLayer(layer);
        }
    });

    if (layerType === 'carto') {
        const cartoLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
            isCartoLayer: true,
            attribution: '© CartoDB'
        }).addTo(window.mapObj);
        window.isToiletLayerActive = true;
    }
};

window.loadCoastalDepthData = async function() {
  try {
    const response = await fetch('coastal_depth_compact.json');
    if (response.ok) {
      window.coastalDepthData = await response.json();
      console.log(`[수심 데이터 로드 완료] 총 ${window.coastalDepthData.length} 격자 확보`);
      if (window.mapObj) window.toggleMapLayer('carto'); 
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
// 하위 컴포넌트 및 도메인 분리 유틸/서비스 모듈 스레드 가동
// =========================================================================
import './components/splash/splash.css';
import './components/more/more.js';
import './components/map/map.js';
import './components/weather/weatherModal.js';
import './components/pm/pointmanagement.js'; 
import './components/home/home.js';
import './components/navigation/navigation.css';
import './components/modal/markerModal.css';
import './utils/geoUtils.js'; 
import './utils/dbListener.js'; 
import { TIDE_STATIONS } from './utils/constants.js';

// =========================================================================
// 전역 초기 부팅 실행 시퀀스
// =========================================================================
window.initHomeDataSequence();
window.loadCoastalDepthData();