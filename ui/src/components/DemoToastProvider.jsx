import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const DEMO_TOAST_MESSAGE =
  "Demo mode: Navigation is inactive. Use the Ask AI button to begin a conversation with our AI Agent.";

const DemoToastContext = createContext(() => {});

export function DemoToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);

  const hideToast = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message) => {
      hideToast();
      const content = typeof message === 'string' && message.trim() ? message.trim() : DEMO_TOAST_MESSAGE;
      setToast({ content, id: Date.now() });
    },
    [hideToast],
  );

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    timeoutRef.current = setTimeout(() => {
      hideToast();
    }, 6000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [toast, hideToast]);

  useEffect(() => hideToast, [hideToast]);

  useEffect(() => {
    const handleClick = (event) => {
      const target = event.target?.closest?.('[data-demo-toast]');
      if (!target) {
        return;
      }

      const isDisabled = target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true';
      if (isDisabled) {
        return;
      }

      const rawMessage = target.getAttribute('data-demo-toast');
      const message = rawMessage && rawMessage !== 'true' ? rawMessage : undefined;
      showToast(message);
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [showToast]);

  const contextValue = useMemo(() => showToast, [showToast]);

  return (
    <DemoToastContext.Provider value={contextValue}>
      {children}
      <div
        className={`demo-toast${toast ? ' demo-toast--visible' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="demo-toast__content">{toast?.content}</div>
        <button type="button" className="demo-toast__close" aria-label="Dismiss demo message" onClick={hideToast}>
          ×
        </button>
      </div>
    </DemoToastContext.Provider>
  );
}

export function useDemoToast() {
  return useContext(DemoToastContext);
}

export const DEMO_TOAST_TEXT = DEMO_TOAST_MESSAGE;
