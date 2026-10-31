import Link from "next/link";

const cards = [
  { title: "Snap", body: "Photograph a menu in any language. No typing." },
  { title: "Book", body: "Meta AI turns the photos into the shop's book." },
  { title: "Order", body: "Ask, translate, and show the order to staff." },
  { title: "Coupon", body: "The owner claims the shop and rewards your snap." },
];

export default function Landing() {
  return (
    <main className="min-h-dvh bg-[#FFF6EE] text-[#1A120B]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10">
        <p className="text-sm font-bold tracking-wide text-[#C2410C]">Prox Now</p>
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          Snap a menu in any language, and Meta AI builds the shop&apos;s book, so you can ask, translate and order. Owners claim the shop and reward you with a coupon.
        </h1>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/start"
            className="inline-flex min-h-14 items-center justify-center rounded-full bg-[#E4572E] px-8 text-lg font-bold text-white no-underline"
          >
            Try it
          </Link>
          <Link
            href="/judge"
            className="inline-flex min-h-14 items-center justify-center rounded-full border-2 border-[#1A120B] px-8 text-lg font-bold text-[#1A120B] no-underline"
          >
            I&apos;m a judge
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <article key={card.title} className="rounded-3xl bg-white p-5 shadow-[0_10px_30px_rgb(26_18_11/0.08)]">
              <h2 className="text-2xl font-bold">{card.title}</h2>
              <p className="mt-2 text-base leading-snug text-[#5C4636]">{card.body}</p>
            </article>
          ))}
        </div>
        <p className="text-sm font-semibold text-[#5C4636]">Built with Meta Muse models</p>
      </div>
    </main>
  );
}
