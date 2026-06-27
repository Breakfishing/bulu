// =========================================================================
// [SERVICE] 백엔드 데이터베이스 실시간 트래킹 모델 및 구독 리스너 엔진 (src/services/dbListener.js)
// =========================================================================
import { db } from './firebase.js';

db.collection('fishing_points').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
  try {
    window.cachedFishingPoints = []; 
    snapshot.forEach(doc => window.cachedFishingPoints.push({ id: doc.id, ...doc.data() }));
    
    if (typeof window.updateVisibleMarkersOnMap === 'function') window.updateVisibleMarkersOnMap();
    if (typeof window.renderPointsManagementTab === 'function') window.renderPointsManagementTab();
    if (typeof window.populateHomeFavoritesDropdown === 'function') window.populateHomeFavoritesDropdown();
  } catch (err) {
    console.error("낚시 포인트 데이터 렌더링 중 오류 발생:", err);
  } finally {
    window.isFishingPointsLoaded = true; 
    if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
}, () => { 
  window.isFishingPointsLoaded = true; 
  if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash(); 
});

db.collection('public_toilets').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
  try {
    window.cachedPublicToilets = []; 
    snapshot.forEach(doc => window.cachedPublicToilets.push({ id: doc.id, ...doc.data() }));
    
    if (typeof window.updateVisibleMarkersOnMap === 'function') window.updateVisibleMarkersOnMap();
    if (typeof window.renderPointsManagementTab === 'function') window.renderPointsManagementTab();
  } catch (err) {
    console.error("화장실 데이터 렌더링 중 오류 발생:", err);
  } finally {
    window.isPublicToiletsLoaded = true; 
    if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash();
  }
}, () => { 
  window.isPublicToiletsLoaded = true; 
  if (typeof window.checkAndHideSplash === 'function') window.checkAndHideSplash(); 
});