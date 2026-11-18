import { useCallback, useEffect, useState } from "react";

/** Small transient message in the bottom-right corner. */
export function useToast(ms = 4000) {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), ms);
    return () => window.clearTimeout(id);
  }, [message, ms]);
  const toast = message ? <div className="toast">{message}</div> : null;
  return { toast, show: useCallback((m: string) => setMessage(m), []) };
}
