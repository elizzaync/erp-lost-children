import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// El build final se sirve por Flask (bridge/server.py) como estático, igual que
// hoy sirve js/ y modules/. `base: './'` genera rutas relativas para que
// funcione detrás de la IP pública de Contabo sin depender de un dominio raíz.
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@domain': fileURLToPath(new URL('./src/domain', import.meta.url)),
      '@store': fileURLToPath(new URL('./src/store', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
      '@shell': fileURLToPath(new URL('./src/shell', import.meta.url)),
    },
  },
  build: {
    // Salida a dist/ dentro de frontend/. El Dockerfile copia esto a donde
    // Flask lo sirve. Sourcemaps para poder depurar producción.
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 4300,
    // En desarrollo, Vite corre en :4300 y proxya la API/WS al Flask local
    // (:7793), así el frontend nuevo habla con el backend real sin CORS ni
    // tocar server.py. En producción no se usa: Flask sirve el build.
    proxy: {
      '/personas': 'http://localhost:7793',
      '/articulos': 'http://localhost:7793',
      '/gastos': 'http://localhost:7793',
      '/entregas': 'http://localhost:7793',
      '/asistencia': 'http://localhost:7793',
      '/alimentacion': 'http://localhost:7793',
      '/fondos': 'http://localhost:7793',
      '/auth': 'http://localhost:7793',
      '/timmy': 'http://localhost:7793',
      '/health': 'http://localhost:7793',
      '/ws': { target: 'ws://localhost:7793', ws: true },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
