import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Quitamos todo lo de esbuild y optimizeDeps para evitar el error en Vercel
})