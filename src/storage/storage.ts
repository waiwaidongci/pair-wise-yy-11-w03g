// 存储层：localStorage 持久化 + 订阅通知。只负责存取，不含业务判定。

import { AppState, Cylinder } from "../rules/types";
import { emptyState } from "../rules/engine";
import { seedState } from "./seed";

const STORAGE_KEY = "hydro-station-state-v1";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedState(emptyState());
      persistState(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed.cylinders || !parsed.tests) return seedState(emptyState());
    return parsed;
  } catch {
    return seedState(emptyState());
  }
}

export function persistState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState(): AppState {
  const seeded = seedState(emptyState());
  persistState(seeded);
  return seeded;
}

export function cylinderName(cyl: Cylinder | undefined): string {
  return cyl ? `${cyl.code}（${cyl.volume} ${cyl.material}）` : "未知气瓶";
}
