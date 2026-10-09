import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About us · Ascend Services",
  description:
    "Ascend Services connects people who want to serve with communities that need practical help.",
};

const STORIES = [
  {
    src: "/ministry/meal.jpg",
    alt: "A meal prepared and shared around a table",
    title: "For people who need a hand",
    body: "A meal, a ride, a repair, an errand. The ordinary work of a week can become too much. Ascend Services is a place to ask, without having to figure out who to call.",
  },
  {
    src: "/ministry/hands.jpg",
    alt: "Hands working together on a community project",
    title: "For people who want to serve",
        body: "If you have time and a willingness to show up, we will match you with a need that fits. Serving starts with a passkey so you are signed in, then a background check, then an open door onto the Help Wanted board.",
  },
  {
    src: "/ministry/garden.jpg",
    alt: "A community garden tended by several people",
    title: "Rooted in ministries",
    body: "We are not a general marketplace. We work through churches and ministries, so the help stays personal, local, and accountable to a community that already knows one another.",
  },
] as const;

export default function AboutPage() {
  return (
    <main>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ascend-sky-deep">
            About us
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-ascend-navy sm:text-5xl">
            A bridge between willing hands and real needs
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ascend-navy/80">
            Ascend Services is a ministry platform. On one side are people who
            want to serve. On the other are people in the community who need
            practical help. We exist to introduce them, carefully, through the
            churches and ministries we walk with.
          </p>
          <p className="mt-4 leading-relaxed text-ascend-navy/80">
            A request stays private until a validated server accepts it. A
            server is welcomed only after a background check. The work in
            between is simple on purpose: meals, repairs, rides, yards, and the
            other quiet jobs that keep a household going.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/request" className="ascend-gradient rounded-full px-5 py-3 text-sm font-semibold text-white">
              Request help
            </Link>
            <Link href="/serve" className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-ascend-navy ring-1 ring-ascend-navy/10">
              I want to serve
            </Link>
          </div>
        </div>
        <figure className="overflow-hidden rounded-[2rem] shadow-lg ring-1 ring-ascend-navy/10">
          <Image
            src="/ministry/hero.jpg"
            alt="Community members on a porch sharing groceries and a plant"
            width={1200}
            height={800}
            className="h-80 w-full object-cover sm:h-[28rem]"
            priority
          />
        </figure>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-16 md:grid-cols-3">
        {STORIES.map((story) => (
          <article key={story.title} className="overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-ascend-navy/5">
            <Image src={story.src} alt={story.alt} width={800} height={520} className="h-48 w-full object-cover" />
            <div className="p-5">
              <h2 className="font-display text-2xl text-ascend-navy">{story.title}</h2>
              <p className="mt-2 text-ascend-navy/80">{story.body}</p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
