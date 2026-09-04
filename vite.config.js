import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // '' as the prefix loads every key, including the unprefixed ADMIN_* ones
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };

  return {
    plugins: [react()],

    /*
     * Vite only exposes VITE_* to the browser, so the admin credentials from
     * .env.local are mapped in by hand. Deliberately only these two -
     * ADMIN_SESSION_SECRET is left out because nothing here needs it and
     * anything defined this way is readable in the built bundle.
     */
    define: {
      'import.meta.env.ADMIN_USERNAME': JSON.stringify(env.ADMIN_USERNAME ?? ''),
      'import.meta.env.ADMIN_PASSWORD': JSON.stringify(env.ADMIN_PASSWORD ?? ''),
    },

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
  };
});
