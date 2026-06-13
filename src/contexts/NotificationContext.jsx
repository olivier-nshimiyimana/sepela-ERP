import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import SepelaNotificationStack from "../components/SepelaNotificationStack";

const NotificationContext = createContext(null);

let toastSeq = 0;

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    ({ type = "success", message, duration = 6000 }) => {
      const id = ++toastSeq;
      setToasts((prev) => [...prev, { id, type, message }]);

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [dismiss]
  );

  const notifySuccess = useCallback(
    (message) => pushToast({ type: "success", message }),
    [pushToast]
  );

  const notifyError = useCallback(
    (message) => pushToast({ type: "error", message, duration: 8000 }),
    [pushToast]
  );

  const value = useMemo(
    () => ({
      notifySuccess,
      notifyError,
      dismiss,
    }),
    [notifySuccess, notifyError, dismiss]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <SepelaNotificationStack toasts={toasts} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return ctx;
}
