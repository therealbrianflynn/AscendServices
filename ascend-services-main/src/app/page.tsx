import Image from "next/image";
import Link from "next/link";

import { BrandLogo } from "./brand-logo";

const ways = [
  {
    title: "A meal and a welcome",
    text: "Soup on the table, groceries at the door, and someone who stays long enough to ask how you are.",
    image: "/ministry/meal.jpg",
    alt: "Hands passing a bowl of soup across a sunlit kitchen table",
  },
  {
    title: "Work done side by side",
    text: "Yards, gardens, and the ordinary jobs that are lighter when a neighbor picks up the other end.",
    image: "/ministry/garden.jpg",
    alt: "Neighbors planting and watering a backyard garden together",
  },
  {
    title: "A steady pair of hands",
    text: "Small repairs, a ride, an errand, or a quiet cup of tea while something gets fixed.",
    image: "/ministry/hands.jpg",
    alt: "One person repairing a lamp while another offers a cup of tea",
  },
] as const;

const steps = [
  {
    n: "01",
    title: "Tell us what you need",
    text: "No account. Share the kind of help, your neighborhood, and a way to reach you.",
  },
  {
    n: "02",
    title: "A volunteer steps in",
    text: "Someone whose skills match your request claims it and is introduced to you.",
  },
  {
    n: "03",
    title: "You can follow along",
    text: "A private link shows where your request stands, from the first note to the visit.",
  },
] as const;

export default function Home() {
  return (
    <main>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-12 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-14 lg:py-16">
        <div className="justify-self-center rounded-[2rem] bg-white px-6 py-5 shadow-[0_24px_50px_-28px_rgba(22,48,87,0.55)] ring-1 ring-white sm:px-10 sm:py-7">
          <BrandLogo height={176} priority />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ascend-sky-deep">
            A ministry of neighbors
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.1] text-ascend-navy sm:text-5xl">
            Practical help, offered with care
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-ascend-navy/80">
            Ascend Services is where a need meets someone ready to serve. Ask
            for a hand with the ordinary things of life, or offer your time.
            Nobody has to carry it alone.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/request"
              className="ascend-gradient rounded-full px-5 py-3 text-sm font-semibold text-white shadow-md"
            >
              Request help
            </Link>
            <Link
              href="/signin"
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-ascend-navy shadow-sm ring-1 ring-ascend-navy/10"
            >
              I want to serve
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6">
        <figure className="overflow-hidden rounded-[2rem] shadow-[0_28px_60px_-30px_rgba(22,48,87,0.6)] ring-1 ring-ascend-navy/10">
          <Image
            src="/ministry/hero.jpg"
            alt="Neighbors on a front porch handing groceries to an older woman, while a child holds a potted plant"
            width={1600}
            height={900}
            priority
            className="h-72 w-full object-cover sm:h-[28rem]"
          />
          <figcaption className="bg-white px-6 py-4 text-sm text-ascend-navy/70">
            Showing up is the ministry — a bag of groceries, a plant for the porch, a person at the door.
          </figcaption>
        </figure>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display text-3xl font-semibold text-ascend-navy sm:text-4xl">
          Ways we serve
        </h2>
        <p className="mt-3 max-w-2xl text-lg text-ascend-navy/75">
          Every request is a person. Every volunteer is a neighbor. This is the
          care the ministry is built to give.
        </p>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {ways.map((way) => (
            <li
              key={way.title}
              className="overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-ascend-navy/5"
            >
              <Image
                src={way.image}
                alt={way.alt}
                width={800}
                height={600}
                className="h-52 w-full object-cover"
              />
              <div className="p-5">
                <h3 className="font-display text-2xl font-semibold text-ascend-navy">
                  {way.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ascend-navy/75">
                  {way.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="overflow-hidden rounded-[2rem] bg-ascend-navy px-6 py-10 text-white shadow-xl sm:px-10">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            How a request finds a person
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map((step) => (
              <li key={step.n}>
                <p className="font-display text-3xl text-ascend-sun">{step.n}</p>
                <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/75">{step.text}</p>
              </li>
            ))}
          </ol>
          <Link
            href="/request"
            className="mt-8 inline-block rounded-full bg-ascend-sun px-5 py-3 text-sm font-semibold text-ascend-navy"
          >
            Start a request
          </Link>
        </div>
      </section>
    </main>
  );
}
