export const ORIGINAL_NAME = "prox-now-original.jpg";

function namedOriginal(file: File): File {
  if (file.name === ORIGINAL_NAME) return file;
  return new File([file], ORIGINAL_NAME, { type: file.type || "image/jpeg" });
}

export function buildOriginalSave(deps: {
  canShareFiles: boolean;
  file: File;
  share: (file: File) => Promise<void> | void;
  download: (file: File) => void;
}): () => void {
  return () => {
    const file = namedOriginal(deps.file);
    if (!deps.canShareFiles) {
      deps.download(file);
      return;
    }
    try {
      const pending = deps.share(file);
      if (pending && typeof (pending as Promise<void>).then === "function") {
        void (pending as Promise<void>).catch(() => deps.download(file));
      }
    } catch {
      deps.download(file);
    }
  };
}

export function dropOriginalMemory(
  urls: readonly string[],
  revoke: (url: string) => void,
): { file: null; urls: [] } {
  for (const url of urls) revoke(url);
  return { file: null, urls: [] };
}
