import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      // 기상청 오픈 API 우회 프록시 라우터 (기존 코드 보존)
      '/api-hub': {
        target: 'https://apihub.kma.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-hub/, '')
      },
      // 공공데이터포털 기상청 단기예보 우회 프록시 라우터 (CORS 및 403 방지 신규 추가)
      '/api-kma': {
        target: 'https://apis.data.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-kma/, '')
      },
      // 국립해양조사원 오픈 API 우회 프록시 라우터 (올바른 KHOA 도메인 주소로 수정)
      '/api-tide': {
        target: 'https://www.khoa.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-tide/, '')
      }
    }
  }
})