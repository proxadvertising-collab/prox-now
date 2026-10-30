import { menuCacheKey } from "./device";

export const MENU_BATCH_MAX = 25;
export const MENU_BATCH_WAIT_MS = 40;

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };
type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type Waiter = { resolve: (value: string | null) => void };

export type MenuBatcher = {
  request(name: string, lang: string): Promise<string | null>;
};

export function chunkNames(names: readonly string[], max = MENU_BATCH_MAX): string[][] {
  const out: string[][] = [];
  for (let index = 0; index < names.length; index += max) out.push(names.slice(index, index + max));
  return out;
}

export function readTranslations(body: unknown, count: number): string[] | null {
  if (!body || typeof body !== "object") return null;
  const list = (body as { translations?: unknown }).translations;
  if (!Array.isArray(list) || list.length !== count) return null;
  return list.map((item) => (typeof item === "string" ? item.trim() : ""));
}

export function createMenuBatcher(deps: {
  fetcher: Fetcher;
  store: () => Store | null;
  schedule?: (run: () => void) => void;
}): MenuBatcher {
  const schedule = deps.schedule ?? ((run: () => void) => void setTimeout(run, MENU_BATCH_WAIT_MS));
  const queues = new Map<string, Map<string, Waiter[]>>();
  const inFlight = new Map<string, Promise<string | null>>();

  async function send(lang: string, names: string[], waiters: Map<string, Waiter[]>) {
    let results: string[] | null = null;
    try {
      const response = await deps.fetcher("/api/order/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texts: names, to: lang }),
      });
      results = response.ok ? readTranslations(await response.json().catch(() => null), names.length) : null;
    } catch {
      results = null;
    }
    const store = deps.store();
    names.forEach((name, index) => {
      const text = results?.[index] ?? "";
      if (text && store) {
        try {
          store.setItem(menuCacheKey(name, lang), text);
        } catch {
          // Storage full or private mode.
        }
      }
      for (const waiter of waiters.get(name) ?? []) waiter.resolve(text || null);
      inFlight.delete(lang + "\n" + name);
    });
  }

  function flush(lang: string) {
    const waiters = queues.get(lang);
    queues.delete(lang);
    if (!waiters || waiters.size === 0) return;
    for (const names of chunkNames([...waiters.keys()])) void send(lang, names, waiters);
  }

  return {
    request(rawName: string, rawLang: string) {
      const name = rawName.trim();
      const lang = rawLang.trim().toLowerCase().split("-")[0] || "en";
      if (!name || lang === "en") return Promise.resolve(null);
      const cached = deps.store()?.getItem(menuCacheKey(name, lang));
      if (cached) return Promise.resolve(cached);
      const key = lang + "\n" + name;
      const running = inFlight.get(key);
      if (running) return running;
      let queue = queues.get(lang);
      const first = !queue;
      if (!queue) {
        queue = new Map();
        queues.set(lang, queue);
      }
      const target = queue;
      const promise = new Promise<string | null>((resolve) => {
        const list = target.get(name) ?? [];
        list.push({ resolve });
        target.set(name, list);
      });
      inFlight.set(key, promise);
      if (first) schedule(() => flush(lang));
      return promise;
    },
  };
}

let shared: MenuBatcher | null = null;

export function menuBatcher(): MenuBatcher {
  if (!shared) {
    shared = createMenuBatcher({
      fetcher: (input, init) => fetch(input, init),
      store: () => (typeof window === "undefined" ? null : window.localStorage),
    });
  }
  return shared;
}
