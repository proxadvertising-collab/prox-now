type NavShutter = () => void;

let current: NavShutter | null = null;

/** LiveCamera registers this while /snap is open. */
export function listenNavShutter(handler: NavShutter): () => void {
  current = handler;
  return () => {
    if (current === handler) current = null;
  };
}

/** Fire the camera listener. False when /snap has not registered one. */
export function pressNavShutter(): boolean {
  if (!current) return false;
  current();
  return true;
}

export function navSnapMode(pathname: string): "shutter" | "link" {
  if (pathname === "/snap" || pathname.startsWith("/snap/") || pathname.startsWith("/snap?")) return "shutter";
  return "link";
}

/** On /snap the nav button shoots when the live camera is open, and opens the picker otherwise. */
export function navShutterAction(pathname: string, liveOpen: boolean): "link" | "shoot" | "pick" {
  if (navSnapMode(pathname) === "link") return "link";
  return liveOpen ? "shoot" : "pick";
}
