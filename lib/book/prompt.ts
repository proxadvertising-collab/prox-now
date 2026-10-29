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

export function improvePrompt(
  kind: string,
  existing: readonly { id: string; extracted: unknown }[],
): string {
  const lines = existing.map((page) => "id=" + page.id + " " + JSON.stringify(page.extracted ?? {})).join("\n");
  return (
    "Compare this new shop photo with the existing " +
    kind +
    " pages.\n" +
    "same info = skip. newer or different (new prices, new hours, new logo) = replace that page. a new item = add.\n" +
    "Output ONLY JSON. No markdown. No extra keys.\n" +
    '{"action":"skip","pageId":null}\n' +
    "action is skip, replace, or add. pageId is the existing id when action is replace.\n" +
    "Existing pages:\n" +
    (lines || "(none)")
  );
}

export function bookReadPrompt(indexes: readonly number[], brief = false): string {
  const rules =
    "Read the REAL text in these photos for a shop book. Copy text exactly as printed. " +
    "Do not translate. Do not convert currency. Do not invent items, prices, hours, dishes, or contact details. " +
    "Fill a field only when that text is visible in the photo. If it is not visible, use null or an empty array. " +
    "If a word is unreadable, use null and leave that item out only when the name itself cannot be read. " +
    "A price may be empty. Still list every dish, including dishes with no price. " +
    "Do not drop a dish because it has no price. " +
    "Do not redraw, clean, or describe a logo. The photograph is the logo. " +
    "When a dish shows two names, put the printed local name in name and the printed English name in name_en. " +
    "Put a short printed description in note. tags may include spicy or vegan only when the photo shows that mark.\n";
  const tail =
    "kind_guess is storefront, logo, hours, menu, qr, or other. " +
    "is_menu is true only when the photo is a menu or a price list. " +
    "price is the printed text, or null when no price is printed. " +
    "hours.days use d as sun, mon, tue, wed, thu, fri, or sat, and open/close as HH:MM in 24-hour local time. " +
    "Omit hours when the photo shows none. " +
    "tagline_facts are short facts that are actually visible. No praise and no claims. " +
    "shop_language is a short language code such as th or en, or null. " +
    "shop_name is the real shop name printed on the logo or sign, or null. " +
    "colors are up to 3 hex colours actually visible in the logo.\n" +
    "The images are numbered: " +
    numbered(indexes) +
    ". Return one pages entry for each number, with index set to that number.";
  if (brief) {
    return (
      rules +
      "This is a shorter read. Skip contacts and tags. Leave name_en null.\n" +
      "Output ONLY this JSON. No markdown. No extra keys.\n" +
      '{"pages":[{"index":1,"kind_guess":"menu","is_menu":true,"language":"th","section":null,"items":[{"name":"","name_en":null,"price":null,"currency":null,"note":null}],"hours":{"days":[{"d":"mon","open":"08:00","close":"17:00"}],"raw":null}}],"shop_language":null,"tagline_facts":[],"shop_name":null,"colors":[]}\n' +
      tail
    );
  }
  return (
    rules +
    "Also copy contact details printed or shown as a logo anywhere in the photo: phone numbers, a LINE ID, whether a LINE QR is visible, a WhatsApp number, Facebook, Instagram, TikTok, website, email, delivery apps shown (Grab, foodpanda, LINE MAN, Robinhood, ShopeeFood, Uber Eats), payment marks shown (PromptPay QR, cards, cash only), hours text, address text, and a Wi-Fi name when a sign shows one. Never guess a handle or a number.\n" +
    "Output ONLY this JSON. No markdown. No extra keys.\n" +
    '{"pages":[{"index":1,"kind_guess":"menu","is_menu":true,"language":"th","section":null,"items":[{"name":"","name_en":null,"price":null,"currency":null,"note":null,"tags":[]}],"hours":{"days":[{"d":"mon","open":"08:00","close":"17:00"}],"raw":null},"contacts":{"phones":[],"line_id":null,"line_qr":false,"whatsapp":null,"facebook":null,"instagram":null,"tiktok":null,"website":null,"email":null,"delivery":[],"payment":[],"hours_text":null,"address":null,"wifi":null}}],"shop_language":null,"tagline_facts":[],"shop_name":null,"colors":[]}\n' +
    "contacts.delivery uses only Grab, foodpanda, LINE MAN, Robinhood, ShopeeFood, or Uber Eats. " +
    "contacts.payment uses only PromptPay QR, cards, or cash only. " +
    "line_qr is true only when a LINE QR code is visible.\n" +
    tail
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
