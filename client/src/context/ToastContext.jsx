import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (message, type = 'info', ms = 3000) => {
      const id = ++toastId;
      setToasts((list) => [...list, { id, message, type }]);
      const timer = setTimeout(() => remove(id), ms);
      timers.current.set(id, timer);
    },
    [remove]
  );

  const success = useCallback((m) => show(m, 'success'), [show]);
  const error = useCallback((m) => show(m, 'error', 5000), [show]);
  const info = useCallback((m) => show(m, 'info'), [show]);

  return (
    <ToastContext.Provider value={{ success, error, info, show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className={`toast-enter cursor-pointer rounded-md border px-4 py-2 text-sm shadow-lg ${
              t.type === 'success'
                ? 'border-positive/40 bg-surface text-positive'
                : t.type === 'error'
                ? 'border-negative/40 bg-surface text-negative'
                : 'border-border bg-surface text-text'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
