/** Centre radar stays off the camera, the book, and while an order is open. */
export function navRadar(pathname: string, onBook: boolean, orderCount: number): boolean {
  if (orderCount > 0 || onBook) return false;
  if (pathname === "/snap" || pathname.startsWith("/snap/") || pathname.startsWith("/snap?")) return false;
  if (pathname.startsWith("/book")) return false;
  return true;
}
