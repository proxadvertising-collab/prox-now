let nowCache = 0;
let timer: number | null = null;
const listeners = new Set<() => void>();

export function subscribeClock(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined" && timer === null) {
    if (nowCache === 0) nowCache = Date.now();
    timer = window.setInterval(() => {
      nowCache = Date.now();
      for (const item of listeners) item();
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null && typeof window !== "undefined") {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function getClock(): number {
  if (nowCache === 0 && typeof window !== "undefined") nowCache = Date.now();
  return nowCache;
}

export function getServerClock(): number {
  return 0;
}
