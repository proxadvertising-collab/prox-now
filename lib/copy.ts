const en = {
  "snap.cta": "Snap a shop",
  "post.go": "Go now",
  "inbox.keep": "Keep it",
  "inbox.pass": "Pass",
  "inbox.undo": "Undo",
  "reading.title": "Reading the sign…",
  "reading.blur": "Blurring faces",
  "reading.translate": "Translating the text",
  "reading.match": "Finding your shop",
  "confirm.q": "Is this the place?",
  "confirm.yes": "Yes, that's it",
  "confirm.no": "Not this one",
  "loc.ask": "Use my location",
  "loc.why": "Only to show shops near you and match your photo.",
  "demo.try": "Try demo mode",
  "demo.banner": "Demo mode · pretend location: Soi 102, Hua Hin",
  "auth.google": "Continue with Google",
  "auth.email": "Send me a code",
  "timer.left": "{t} left",
  "timer.over": "Time's up",
  "coupon.landed": "Nice shot! A coupon is in your wallet.",
  "coupon.show": "Show this at the counter",
  "coupon.used": "Used",
  "empty.map": "Nobody's snapped this street yet. Be the first.",
  "empty.wallet": "No coupons yet. Snap a shop you're at.",
  "empty.inbox": "All caught up. New photos land here after 2 hours.",
  "err.net": "Lost the signal. Try again.",
  "err.cam": "Camera is blocked. Let's turn it on in Settings.",
  "err.loc": "We can't see where you are. Pick a shop from the list instead.",
  "nav.map": "Map",
  "nav.wallet": "Wallet",
  "nav.snap": "Snap",
  "nav.shop": "Shop",
  "nav.you": "You",
} as const;

const th: { [K in keyof typeof en]: string } = {
  "snap.cta": "ถ่ายร้านเลย",
  "post.go": "ไปเลย",
  "inbox.keep": "เก็บไว้",
  "inbox.pass": "ไม่เอา",
  "inbox.undo": "ยกเลิก",
  "reading.title": "กำลังอ่านป้ายร้าน…",
  "reading.blur": "กำลังเบลอใบหน้า",
  "reading.translate": "กำลังแปลข้อความ",
  "reading.match": "กำลังหาร้านของคุณ",
  "confirm.q": "ใช่ร้านนี้ไหม",
  "confirm.yes": "ใช่เลย",
  "confirm.no": "ไม่ใช่ร้านนี้",
  "loc.ask": "ใช้ตำแหน่งของฉัน",
  "loc.why": "ใช้เพื่อแสดงร้านใกล้คุณและจับคู่รูปเท่านั้น",
  "demo.try": "ลองโหมดเดโม",
  "demo.banner": "โหมดเดโม · ตำแหน่งสมมติ: ซอย 102 หัวหิน",
  "auth.google": "ดำเนินการต่อด้วย Google",
  "auth.email": "ส่งรหัสให้ฉัน",
  "timer.left": "เหลือ {t}",
  "timer.over": "หมดเวลาแล้ว",
  "coupon.landed": "ภาพสวย! คูปองเข้ากระเป๋าแล้ว",
  "coupon.show": "แสดงที่หน้าร้าน",
  "coupon.used": "ใช้แล้ว",
  "empty.map": "ยังไม่มีใครถ่ายถนนนี้ เป็นคนแรกเลย",
  "empty.wallet": "ยังไม่มีคูปอง ลองถ่ายร้านที่คุณชอบดูสิ",
  "empty.inbox": "ไม่มีอะไรค้างแล้ว",
  "err.net": "สัญญาณหลุด ลองอีกครั้ง",
  "err.cam": "กล้องถูกปิดอยู่ มาเปิดในการตั้งค่ากัน",
  "err.loc": "ยังไม่รู้ตำแหน่งของคุณ เลือกร้านจากรายการแทนได้",
  "nav.map": "แผนที่",
  "nav.wallet": "กระเป๋า",
  "nav.snap": "ถ่าย",
  "nav.shop": "ร้าน",
  "nav.you": "ฉัน",
};

export const copy = { en, th };

export type CopyKey = keyof typeof en;

export function t(
  lang: keyof typeof copy,
  key: CopyKey,
  vars?: Record<string, string>,
): string {
  const table: Record<CopyKey, string> = copy[lang];
  let text = table[key];
  if (!vars) return text;
  for (const name of Object.keys(vars)) {
    text = text.split("{" + name + "}").join(vars[name]);
  }
  return text;
}
