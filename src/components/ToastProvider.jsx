import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

/* How long each kind stays up, unless the caller says otherwise. */
const DURATIONS = {
  info: 3200,
  success: 3200,
  warning: 4500,
  error: 5500,
  loading: 8000,
};

/* Errors earn a longer read, so the newest few are kept and the rest dropped. */
const MAX_VISIBLE = 4;

/* Must match the exit animation in login.css / globals.css. */
const EXIT_MS = 180;

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  loading: Loader2,
};

function Toast({ toast, onDismiss }) {
  const Icon = ICONS[toast.variant] ?? Info;

  return (
    <div
      className={`toast toast-${toast.variant}${toast.leaving ? ' is-leaving' : ''}`}
      role={toast.variant === 'error' ? 'alert' : 'status'}
    >
      <span className="toast-icon">
        <Icon size={19} />
      </span>

      <p className="toast-message">{toast.message}</p>

      <button
        type="button"
        className="toast-close"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        <X size={15} />
      </button>

      {/*
       * Depletes over the toast's lifetime so the reader can see how long
       * is left. Paused with the timer while the stack is hovered.
       */}
      {toast.duration !== Infinity && (
        <span
          className="toast-progress"
          style={{ animationDuration: `${toast.duration}ms` }}
        />
      )}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const nextId = useRef(0);
  const timers = useRef(new Map());
  const paused = useRef(false);

  const clearTimer = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer.handle);
      timers.current.delete(id);
    }
  }, []);

  const remove = useCallback((id) => {
    clearTimer(id);

    // let the exit animation play before the node goes away
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast))
    );

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, EXIT_MS);
  }, [clearTimer]);

  const startTimer = useCallback(
    (id, duration) => {
      if (duration === Infinity) return;

      clearTimer(id);
      timers.current.set(id, {
        handle: window.setTimeout(() => remove(id), duration),
        remaining: duration,
        startedAt: Date.now(),
      });
    },
    [clearTimer, remove]
  );

  const show = useCallback(
    (input, variantArg) => {
      /*
       * Accepts a bare string - which is how the whole app called this
       * before - a string plus a variant, or a full options object.
       */
      const options =
        typeof input === 'string' || typeof input === 'number'
          ? { message: String(input) }
          : { ...(input ?? {}) };

      if (variantArg) options.variant = variantArg;

      const message = options.message ?? '';
      if (!message) return null;

      const variant = ICONS[options.variant] ? options.variant : 'info';
      const duration = options.duration ?? DURATIONS[variant];
      const id = nextId.current++;

      setToasts((current) =>
        [{ id, message, variant, duration, leaving: false }, ...current].slice(
          0,
          MAX_VISIBLE
        )
      );

      if (!paused.current) startTimer(id, duration);

      return id;
    },
    [startTimer]
  );

  /*
   * Hovering the stack holds every countdown, so a long message can be read
   * without it vanishing mid-sentence; leaving resumes what was left.
   */
  const pauseAll = useCallback(() => {
    paused.current = true;

    for (const [id, timer] of timers.current) {
      window.clearTimeout(timer.handle);
      const elapsed = Date.now() - timer.startedAt;
      timers.current.set(id, {
        ...timer,
        remaining: Math.max(400, timer.remaining - elapsed),
      });
    }
  }, []);

  const resumeAll = useCallback(() => {
    paused.current = false;

    for (const [id, timer] of timers.current) {
      timers.current.set(id, {
        ...timer,
        handle: window.setTimeout(() => remove(id), timer.remaining),
        startedAt: Date.now(),
      });
    }
  }, [remove]);

  // don't leave timers running after the provider goes away
  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        window.clearTimeout(timer.handle);
      }
      timers.current.clear();
    },
    []
  );

  /*
   * Callable for the plain `showToast('text')` form, with per-variant
   * helpers hung off it so new code can say what kind of message it is.
   */
  const showToast = useMemo(() => {
    const fn = (input, variant) => show(input, variant);

    fn.info = (message, options) => show({ ...options, message, variant: 'info' });
    fn.success = (message, options) =>
      show({ ...options, message, variant: 'success' });
    fn.warning = (message, options) =>
      show({ ...options, message, variant: 'warning' });
    fn.error = (message, options) => show({ ...options, message, variant: 'error' });
    fn.loading = (message, options) =>
      show({ ...options, message, variant: 'loading' });
    fn.dismiss = (id) => remove(id);

    return fn;
  }, [show, remove]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}

      <div
        className="toast-stack"
        aria-live="polite"
        onMouseEnter={pauseAll}
        onMouseLeave={resumeAll}
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Pops a message up in the top-right corner.
 *
 *   showToast('Saved')                     // info
 *   showToast('Saved', 'success')
 *   showToast.error(error.message)
 *   showToast.loading('Working...', { duration: Infinity })
 *
 * Returns the toast's id, which `showToast.dismiss(id)` takes.
 */
export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return showToast;
}
