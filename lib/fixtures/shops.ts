export type FixtureShop = {
  id: string;
  slug: string;
  name: string;
  nameLocal?: string;
  category: string;
  lat: number;
  lng: number;
};

export const DEMO_CENTER = { lat: 12.5684, lng: 99.9577 };

// Street-side points around the demo centre, about 150 to 900 m out.
export const FIXTURE_SHOPS: FixtureShop[] = [
  { id: "mala-mafia", slug: "mala-mafia", name: "Farm to Go (demo)", category: "food", lat: 12.56898, lng: 99.95895 },
  { id: "coconut-shake-stand", slug: "coconut-shake-stand", name: "Coconut shake stand", nameLocal: "มะพร้าวปั่นนมสด", category: "drink", lat: 12.56745, lng: 99.96 },
  { id: "krua-mae-yen", slug: "krua-mae-yen", name: "Krua Mae Yen", category: "food", lat: 12.57063, lng: 99.95438 },
  { id: "pak-kapi", slug: "pak-kapi", name: "Pak Kapi", nameLocal: "ปากกะปิ", category: "food", lat: 12.56641, lng: 99.95715 },
  { id: "thuk-jai-chieo", slug: "thuk-jai-chieo", name: "Thuk Jai Chieo", category: "food", lat: 12.56366, lng: 99.95917 },
  { id: "clean-together", slug: "clean-together", name: "Clean Together", nameLocal: "คลีนทูเกเตอร์", category: "service", lat: 12.57455, lng: 99.95861 },
  { id: "baan-air", slug: "baan-air", name: "Baan Air", nameLocal: "บ้านแอร์", category: "stay", lat: 12.57042, lng: 99.95092 },
  { id: "beegee-barber", slug: "beegee-barber", name: "BEEGEE Barber", category: "barber", lat: 12.56079, lng: 99.95491 },
];

export function shopBySlug(slug: string): FixtureShop | undefined {
  return FIXTURE_SHOPS.find((shop) => shop.slug === slug);
}
