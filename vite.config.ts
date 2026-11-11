import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['./src/legacy/viewer-app.ts'] 
  },
  esbuild: {
    // Esto le dice a Vite que ignore el chequeo de tipos en el archivo legacy
    tsconfigRaw: {
      compilerOptions: {
        target: 'esnext',
        useDefineForClassFields: true,
        module: 'esnext',
        lib: ['esnext', 'dom', 'dom.iterable'],
        skipLibCheck: true,
        moduleResolution: 'bundler',
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
        strict: false, // Desactiva el modo estricto
        noImplicitAny: false,
        noUnusedLocals: false,
        noUnusedParameters: false,
        noFallthroughCasesInSwitch: false
      }
    }
  }
})