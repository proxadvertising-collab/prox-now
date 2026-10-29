function numbered(indexes: readonly number[]): string {
  return indexes.join(", ");
}

export function facePrompt(indexes: readonly number[]): string {
  return (
    "Find every human face in each photo. The photos are real pictures for a shop page.\n" +
    "Output ONLY JSON. No markdown. No extra keys.\n" +
    '{"pages":[{"index":1,"faces":[[0.1,0.1,0.2,0.2]]}]}\n' +
    "faces are normalized [x1,y1,x2,y2] boxes, origin top-left, each value from 0 to 1. " +
    "Include every real human face, including partial faces. Use an empty array when there is no face. " +
    "Do not describe the person. One pages entry per image. " +
    "The images are numbered: " +
    numbered(indexes) +
    ". index must be one of those numbers."
  );
}

export function bookReadPrompt(indexes: readonly number[]): string {
  return (
    "Read the REAL text in these photos for a shop book. Copy text exactly as printed. " +
    "Do not translate. Do not convert currency. Do not invent items, prices, hours, or dishes. " +
    "If a word is unreadable, use null and leave that item out only when the name itself cannot be read. " +
    "A price may be empty. Still list every dish, including dishes with no price. " +
    "Do not drop a dish because it has no price. " +
    "Do not redraw, clean, or describe a logo. The photograph is the logo.\n" +
    "Output ONLY this JSON. No markdown. No extra keys.\n" +
    '{"pages":[{"index":1,"kind_guess":"menu","is_menu":true,"language":"th","section":null,"items":[{"name":"","price":null,"currency":null,"note":null}],"hours":{"days":[{"d":"mon","open":"08:00","close":"17:00"}],"raw":null}}],"shop_language":null,"tagline_facts":[]}\n' +
    "kind_guess is storefront, logo, hours, menu, qr, or other. " +
    "is_menu is true only when the photo is a menu or a price list. " +
    "price is the printed text, or null when no price is printed. " +
    "hours.days use d as sun, mon, tue, wed, thu, fri, or sat, and open/close as HH:MM in 24-hour local time. " +
    "Omit hours when the photo shows none. " +
    "tagline_facts are short facts that are actually visible. No praise and no claims. " +
    "shop_language is a short language code such as th or en, or null.\n" +
    "The images are numbered: " +
    numbered(indexes) +
    ". Return one pages entry for each number, with index set to that number."
  );
}

export function logoFixPrompt(): string {
  return (
    "This photo contains one shop logo. Find the logo mark, not the whole storefront.\n" +
    "Output ONLY JSON. No markdown. No extra keys.\n" +
    '{"box":[0.1,0.1,0.4,0.4],"rotation":0,"colors":["#112233","#AABBCC"],"mood":"bold"}\n' +
    "box is [x1,y1,x2,y2] around the logo after it is straightened, origin top-left, each value from 0 to 1. " +
    "rotation is the degrees to rotate the photo so the logo is upright, from -180 to 180. " +
    "colors are 2 or 3 brand hex colours actually visible in the logo. " +
    "mood is bold, elegant, playful, or street."
  );
}

export function imageLabel(index: number): string {
  return "Image " + index + ":";
}
