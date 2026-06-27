import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      // 기상청 오픈 API 우회 프록시 라우터
      '/api-hub': {
        target: 'https://apihub.kma.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-hub/, '')
      },
      // 국립해양조사원 오픈 API 우회 프록시 라우터 (추가된 부분)
      '/api-tide': {
        target: 'http://apis.data.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-tide/, '')
      }
    }
  }
})