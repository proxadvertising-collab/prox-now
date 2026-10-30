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

const SHOP_CATEGORY_LIST = "street_food, drinks, restaurant, fruit, laundry, home_services, barber, other";

export function bookReadPrompt(indexes: readonly number[], brief = false): string {
  const briefLine = brief ? "This is a shorter read. Leave descriptions and deals empty.\n" : "";
  return (
    "You are building a digital book for a local business from these photos only. Never invent anything not visible.\n" +
    "1. Brand: business name (as printed, plus English if different), tagline, contact info (phone, LINE, WhatsApp, Facebook, Instagram, TikTok, website, email), delivery apps (Grab, foodpanda, LINE MAN, Uber Eats), and payment badges. Logo: give the photo index and bounding box [x,y,w,h] as 0-1 fractions of the clearest logo.\n" +
    "2. Style: primary and secondary colors as hex, the closest font style (e.g. rounded sans, bold serif, handwritten), and a 3-5 word vibe.\n" +
    "3. Info: rebuild the full menu grouped into categories. Each item has its name as printed (with typos fixed), an English name if the original is not English, a short description only if one is printed or obvious, a price with currency, and the photo index. Also pull deals and promos (title, provider such as a bank, telco or app, discount, conditions), hours, address, and a Google Maps link or plus code only if visible. Keep the original language and add an English translation.\n" +
    "4. Book: choose the hero photo index for the cover, and give a kind for every photo (logo, menu, hours, deal, product, storefront, other). Set the shop category from: " +
    SHOP_CATEGORY_LIST +
    ".\n" +
    briefLine +
    "Output ONLY JSON. No markdown. No extra keys.\n" +
    '{"brand":{"name":null,"name_en":null,"tagline":null,"phones":[],"line_id":null,"line_qr":false,"whatsapp":null,"facebook":null,"instagram":null,"tiktok":null,"website":null,"email":null,"delivery":[],"payment":[],"logo":{"index":1,"box":[0.1,0.1,0.2,0.2]}},"style":{"primary":null,"secondary":null,"font":null,"vibe":null},"menu":[{"category":"","items":[{"name":"","name_en":null,"note":null,"price":null,"currency":null,"photo":1}]}],"deals":[{"title":"","provider":null,"discount":null,"conditions":null}],"info":{"hours_text":null,"hours":null,"address":null,"maps":null,"language":null},"photos":[{"index":1,"kind":"menu"}],"hero":1,"category":"other"}\n' +
    "logo.box is [x,y,w,h], origin top-left, each value from 0 to 1. " +
    "photos.kind is logo, menu, hours, deal, product, storefront, or other. " +
    "category is one of: " +
    SHOP_CATEGORY_LIST +
    ". delivery uses Grab, foodpanda, LINE MAN, or Uber Eats. payment uses PromptPay QR, cards, or cash only. " +
    "hours.days use d as sun, mon, tue, wed, thu, fri, or sat, and open/close as HH:MM. " +
    "The images are numbered: " +
    numbered(indexes) +
    ". Return one photos entry for each number, with index set to that number."
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
