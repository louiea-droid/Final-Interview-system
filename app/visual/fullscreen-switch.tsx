'use client';

import { useEffect } from 'react';

/**
 * Browsers only allow requestFullscreen() from a user gesture, so the page
 * can't go fullscreen on load by itself. This renders nothing — it tries
 * immediately (works in kiosk/allowed contexts) and otherwise the very first
 * click, keypress, or touch anywhere switches the page to fullscreen.
 */
export default function FullscreenSwitch() {
  useEffect(() => {
    const enter = (e?: Event) => {
      // Escape is the browser's own "exit fullscreen" key — don't fight it
      if (e instanceof KeyboardEvent && e.key === 'Escape') return;
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };

    // attempt on load; silently rejected unless the browser permits it
    enter();

    document.addEventListener('click', enter);
    document.addEventListener('keydown', enter);
    document.addEventListener('touchstart', enter);

    return () => {
      document.removeEventListener('click', enter);
      document.removeEventListener('keydown', enter);
      document.removeEventListener('touchstart', enter);
    };
  }, []);

  return null;
}
