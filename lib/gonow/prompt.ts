import type { PlaceContext } from "./context";

function placeLine(place: PlaceContext): string {
  const bits = [
    "shop_id=" + place.shopId,
    place.name,
    place.category,
    place.distanceM + "m",
    place.walkMinutes + " min walk",
    place.open,
  ];
  if (place.hoursText) bits.push("hours " + place.hoursText);
  if (place.items.length > 0) {
    bits.push(
      "menu " +
        place.items.map((item) => (item.price ? item.name + " " + item.price : item.name)).join(", "),
    );
  }
  for (const post of place.posts) {
    const fact = post.caption ? "live snap " + post.ageMinutes + " min ago: " + post.caption : "live snap " + post.ageMinutes + " min ago";
    bits.push(fact);
  }
  return bits.join(" | ");
}

export function goNowPrompt(question: string, places: readonly PlaceContext[]): string {
  return (
    "You help someone decide where to go right now. Use only the places listed below. " +
    "Never invent a shop, a price, a snap, or a shop_id. " +
    "Each reason must be one short line and must cite a real fact from that place, such as a live snap age or a menu price. " +
    "Pick at most 3 places that fit the question. If none fit, return an empty picks array.\n" +
    "Question: " +
    question +
    "\n" +
    "Output ONLY this JSON. No markdown. No extra keys.\n" +
    '{"picks":[{"shop_id":"","reason":"","walk_minutes":1}]}\n' +
    "walk_minutes is a whole number of minutes on foot.\n" +
    "Places:\n" +
    places.map(placeLine).join("\n")
  );
}
