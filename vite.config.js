import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    /*
     * Vite's own default. The app used to run on 3000 under Next.js, and a
     * stale dev server there made every start print a "port in use" notice.
     */
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
});
