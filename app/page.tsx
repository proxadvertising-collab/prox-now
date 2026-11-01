import Link from "next/link";

const cards = [
  { n: "01", title: "Snap", body: "Photograph a menu in any language. No typing." },
  { n: "02", title: "Book", body: "Meta AI turns the photos into the shop's book." },
  { n: "03", title: "Order", body: "Ask, translate, and show the order to staff." },
  { n: "04", title: "Coupon", body: "The owner claims the shop and rewards your snap." },
];

export default function Landing() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-bg text-fg">
      <div className="landing-sky" aria-hidden="true" />
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10">
        <p className="eyebrow">Prox Now</p>
        <h1 className="text-display">
          Snap a menu in any language, and Meta AI builds the shop&apos;s <span className="text-accent">book</span>, so you can ask, translate and order. Owners claim the shop and reward you with a coupon.
        </h1>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/start" className="btn-primary min-h-14 w-auto px-8 no-underline">
            Try it
          </Link>
          <Link href="/judge" className="btn-secondary min-h-14 px-8 no-underline">
            I&apos;m a judge
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <article key={card.title} className="rounded-xl border border-border bg-surface-1 p-5 shadow-card">
              <p className="eyebrow">{card.n}</p>
              <h2 className="mt-2 text-title">{card.title}</h2>
              <p className="mt-2 text-body text-fg-muted">{card.body}</p>
            </article>
          ))}
        </div>
        <p className="text-caption font-semibold text-fg-muted">Built with Meta Muse models</p>
      </div>
    </main>
  );
}
