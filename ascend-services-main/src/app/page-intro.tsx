import Image from "next/image";

export function PageIntro({
  eyebrow,
  title,
  children,
  image,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  image?: { src: string; alt: string };
}) {
  return (
    <div className="mb-10 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ascend-sky-deep">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ascend-navy">
          {title}
        </h1>
        <div className="mt-3 max-w-2xl text-lg leading-relaxed text-ascend-navy/80">
          {children}
        </div>
      </div>
      {image ? (
        <div className="overflow-hidden rounded-3xl shadow-lg ring-1 ring-ascend-navy/10">
          <Image
            src={image.src}
            alt={image.alt}
            width={800}
            height={600}
            className="h-48 w-full object-cover lg:h-56"
          />
        </div>
      ) : null}
    </div>
  );
}
