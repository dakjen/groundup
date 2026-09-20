import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Two HTML entries: the same app, different link-preview tags —
  // / counts down to the public launch, /waitlist to the insider launch
  build: { rollupOptions: { input: { main: 'index.html', waitlist: 'waitlist.html' } } },
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
