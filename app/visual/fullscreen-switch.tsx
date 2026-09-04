'use client';

import { useEffect } from 'react';

/**
 * Browsers only allow requestFullscreen() from a user gesture, so the page
 * can't go fullscreen on load by itself. This renders nothing — it tries
 * immediately (works in kiosk/allowed contexts) and otherwise the very
 * first click or tap anywhere switches the page to fullscreen. Once
 * fullscreen, the next click or tap exits it again — a plain key press
 * (other than the browser's own Escape) only ever enters, so idly typing
 * while presenting can't accidentally drop out of fullscreen.
 */
export default function FullscreenSwitch() {
  useEffect(() => {
    // Phones don't get the tap-to-fullscreen behavior at all — it's meant
    // for kiosk/TV displays, and on a phone a tap-anywhere fullscreen
    // toggle just gets in the way. This also sidesteps iPhone Safari
    // having no Fullscreen API for regular elements in the first place
    // (document.documentElement.requestFullscreen is undefined there).
    if (/Android|iPhone|iPod|Mobi/i.test(navigator.userAgent)) return;

    const enter = () => {
      if (!document.documentElement.requestFullscreen) return;
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };

    const toggle = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      } else {
        enter();
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      // Escape is the browser's own "exit fullscreen" key — don't fight it
      if (e.key === 'Escape') return;
      enter();
    };

    // attempt on load; silently rejected unless the browser permits it
    enter();

    document.addEventListener('click', toggle);
    document.addEventListener('touchstart', toggle);
    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('click', toggle);
      document.removeEventListener('touchstart', toggle);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  return null;
}
