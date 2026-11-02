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

export const FIXTURE_SHOPS: FixtureShop[] = [
  { id: "mala-mafia", slug: "mala-mafia", name: "Farm to Go (demo)", category: "food", lat: 12.56850, lng: 99.95750 }, // TODO_REAL_COORDS
  { id: "coconut-shake-stand", slug: "coconut-shake-stand", name: "Coconut shake stand", nameLocal: "มะพร้าวปั่นนมสด", category: "drink", lat: 12.56835, lng: 99.95790 }, // TODO_REAL_COORDS
  { id: "krua-mae-yen", slug: "krua-mae-yen", name: "Krua Mae Yen", category: "food", lat: 12.56870, lng: 99.95810 }, // TODO_REAL_COORDS
  { id: "pak-kapi", slug: "pak-kapi", name: "Pak Kapi", nameLocal: "ปากกะปิ", category: "food", lat: 12.56820, lng: 99.95730 }, // TODO_REAL_COORDS
  { id: "thuk-jai-chieo", slug: "thuk-jai-chieo", name: "Thuk Jai Chieo", category: "food", lat: 12.56860, lng: 99.95840 }, // TODO_REAL_COORDS
  { id: "clean-together", slug: "clean-together", name: "Clean Together", nameLocal: "คลีนทูเกเตอร์", category: "service", lat: 12.56805, lng: 99.95770 }, // TODO_REAL_COORDS
  { id: "baan-air", slug: "baan-air", name: "Baan Air", nameLocal: "บ้านแอร์", category: "stay", lat: 12.56885, lng: 99.95720 }, // TODO_REAL_COORDS
  { id: "beegee-barber", slug: "beegee-barber", name: "BEEGEE Barber", category: "barber", lat: 12.56845, lng: 99.95700 }, // TODO_REAL_COORDS
];

export function shopBySlug(slug: string): FixtureShop | undefined {
  return FIXTURE_SHOPS.find((shop) => shop.slug === slug);
}
