// =========================================================================
// [UTILITY] 카카오맵 API 연동 주소 역변환 및 해안 랜드마크 탐색 엔진
// =========================================================================

// 지도 위 위경도 좌표를 기반으로 텍스트 주소를 매핑하는 역지오코딩 유틸리티
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

// 행정구역 주소가 없는 해상/해안가 좌표일 경우 최인접 항구, 방파제 명칭을 추적하는 탐색기
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