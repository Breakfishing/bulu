// =========================================================================
// [UTIL] 위치 기반 연산 및 카카오맵 지오인코딩 헬퍼 엔진 (src/utils/geoUtils.js)
// =========================================================================

// 컴팩트 JSON 격자를 활용한 최단 거리 수심 역추적 연산 함수
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

// 신규 마커 등록 모달용 카카오맵 좌표-주소 실시간 파싱 유틸
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

// 행정 주소가 유실된 연안(바다 위에 마커 생성 등) 구역을 위한 키워드 반경 매칭 백업 유틸
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

// 카테고리 컬러 인덱스 매칭용 낚시 마커 SVG 팩토리 문맥
function getFishingPointSvg(color) {
  return `<svg width="26" height="39" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" class="fishing-marker-svg-anchor">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="${color}"/>
    <circle cx="12" cy="12" r="4" fill="#ffffff"/>
  </svg>`;
}
window.getFishingPointSvg = getFishingPointSvg;