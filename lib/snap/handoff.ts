let pending: File | null = null;
const listeners = new Set<(file: File) => void>();

export function snapRoute(pathname: string): "/snap" | null {
  return pathname === "/snap" ? null : "/snap";
}

export function stageSnapFile(file: File): void {
  if (listeners.size > 0) {
    pending = null;
    for (const listener of listeners) listener(file);
    return;
  }
  pending = file;
}

export function takeSnapFile(): File | null {
  const file = pending;
  pending = null;
  return file;
}

export function subscribeSnapFile(listener: (file: File) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetSnapHandoff(): void {
  pending = null;
  listeners.clear();
}
