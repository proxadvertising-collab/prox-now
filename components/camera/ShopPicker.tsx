export function ShopPicker({
  shops,
  heading,
  newLabel,
  onPick,
  onNew,
}: {
  shops: readonly { id: string; name: string; distanceM: number }[];
  heading: string;
  newLabel: string;
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="seed-picker">
      <p className="mb-3 text-center text-lg font-bold text-white">{heading}</p>
      {shops.map((shop) => (
        <button key={shop.id} type="button" onClick={() => onPick(shop.id)}>
          {shop.name} · {Math.round(shop.distanceM)} m
        </button>
      ))}
      <button type="button" className="seed-picker-new mt-4" onClick={onNew}>
        {newLabel}
      </button>
    </div>
  );
}
