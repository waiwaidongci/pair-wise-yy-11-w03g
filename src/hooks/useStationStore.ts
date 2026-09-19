import { useCallback, useEffect, useState } from "react";
import { AppState } from "../rules/types";
import { loadState, persistState, resetState } from "../storage/storage";

/**
 * 单一状态源：所有写操作经 dispatch 落盘；
 * 监听 storage 事件，多标签页/刷新后队列、拒充记录与履历保持一致。
 */
export function useStationStore() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    persistState(state);
  }, [state]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "hydro-station-state-v1" && e.newValue) {
        try {
          setState(JSON.parse(e.newValue) as AppState);
        } catch {
          /* 忽略损坏数据 */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const dispatch = useCallback((fn: (prev: AppState) => AppState, ok?: string) => {
    setState((prev) => {
      try {
        const next = fn(prev);
        setError(null);
        if (ok) {
          setNotice(ok);
          window.setTimeout(() => setNotice(null), 2600);
        }
        return next;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return prev;
      }
    });
  }, []);

  const doReset = useCallback(() => {
    setState(resetState());
    setError(null);
    setNotice("已重置为演示数据");
  }, []);

  return { state, error, notice, dispatch, doReset, setError };
}
