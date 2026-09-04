# Final Interview System

A React single-page app, built with Vite, backed by Firebase.

## Stack

- **Vite** + `@vitejs/plugin-react` - dev server and bundler. `npm run dev`,
  `npm run build`, `npm run preview`.
- **React Router** (`react-router-dom`) - routing lives in `src/main.jsx`,
  not in the filesystem. There is no `app/` directory and no server.
- **Local backend** - `src/lib/localBackend.js` (candidates in localStorage,
  photos as downscaled data URLs) and `src/lib/localAuth.js` (sign-in
  stand-in). No network, no accounts. Both are written to be swapped for a
  real service later.
- **Tailwind v4** (`src/styles/tailwind.css`, utilities only - no preflight)
  alongside the hand-written CSS in `src/styles/globals.css`.
- Plain **JSX**, no TypeScript.

## Layout

```
index.html          page shell, favicon, Google Fonts
src/main.jsx        entry point and all routes
src/pages/          one component per route
src/components/     shared UI
src/lib/            firebase client, helpers
src/styles/         globals.css, tailwind.css, display.css, fonts.css
src/fonts/          local display faces (Magneton, StyleFormal)
public/visual/      board artwork (logo, petals, background video)
```

## Things worth knowing

- **There is no server.** Anything in the bundle is public, so the local
  sign-in is a convenience and not a security boundary - the credentials are
  in the bundle and the session is a localStorage flag. Anything real needs
  an identity provider plus rules on the data.
- `/visual` is the public board; it reads candidates live through
  `subscribeCandidates`, which also fires on changes made in another tab.
- `/admin/*` sits behind `src/components/RequireAuth.jsx`.
- `resetLocalData()` in `localBackend.js` clears stored data and restores the
  sample candidates.
