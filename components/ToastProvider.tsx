'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

type Toast = { id: number; text: string };

const ToastContext = createContext<((text: string) => void) | null>(null);

const TOAST_DURATION_MS = 2000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((text: string) => {
    if (!text) return;

    const id = nextId.current++;
    setToasts((current) => [...current, { id, text }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Pops a message up in the bottom-right corner for a couple of seconds,
// instead of the caller having to render and clear its own inline banner.
export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return showToast;
}
