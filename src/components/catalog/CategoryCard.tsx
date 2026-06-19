// src/components/catalog/CategoryCard.tsx
// Home page category entry tile — Server Component.
// D-07 Zone B: rounded-2xl card with image, gradient overlay, label + blurb, arrow.

import Link from "next/link"
import Image from "next/image"

interface CategoryCardProps {
  name: string
  slug: string
  blurb?: string
  imageUrl?: string
}

const CATEGORY_IMAGES: Record<string, string> = {
  electronics: "https://picsum.photos/seed/electronics-cat/800/600",
  watches: "https://picsum.photos/seed/watches-cat/800/600",
  phones: "https://picsum.photos/seed/phones-cat/800/600",
}

export function CategoryCard({ name, slug, blurb, imageUrl }: CategoryCardProps) {
  const imgSrc = imageUrl ?? CATEGORY_IMAGES[slug] ?? `https://picsum.photos/seed/${slug}-cat/800/600`

  return (
    <Link
      href={`/${slug}`}
      className="group relative block overflow-hidden rounded-3xl ring-1 ring-zinc-200 dark:ring-zinc-800 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[5/4] w-full bg-zinc-200 dark:bg-zinc-800">
        <Image
          src={imgSrc}
          alt={name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-110"
          sizes="(max-width: 640px) 100vw, 33vw"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

        {/* Content */}
        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="text-2xl font-extrabold tracking-tight text-white drop-shadow">{name}</p>
          {blurb && <p className="mt-0.5 text-sm font-medium text-white/70">{blurb}</p>}
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-white">
            Shop now
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            >
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  )
}
