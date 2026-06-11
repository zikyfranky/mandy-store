// src/components/catalog/CategoryCard.tsx
// Home page category entry tile — Server Component.
// D-07 Zone B: rounded-2xl card with image, label bar, "Shop now" link.

import Link from "next/link"
import Image from "next/image"

interface CategoryCardProps {
  name: string
  slug: string
  imageUrl?: string
}

const CATEGORY_IMAGES: Record<string, string> = {
  electronics: "https://picsum.photos/seed/electronics-cat/800/600",
  watches: "https://picsum.photos/seed/watches-cat/800/600",
  phones: "https://picsum.photos/seed/phones-cat/800/600",
}

export function CategoryCard({ name, slug, imageUrl }: CategoryCardProps) {
  const imgSrc = imageUrl ?? CATEGORY_IMAGES[slug] ?? `https://picsum.photos/seed/${slug}-cat/800/600`

  return (
    <Link
      href={`/${slug}`}
      className="rounded-2xl overflow-hidden relative block group focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      {/* Image — fills top portion */}
      <div className="relative aspect-[4/3] w-full bg-zinc-200 dark:bg-zinc-800">
        <Image
          src={imgSrc}
          alt={name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, 33vw"
        />
        {/* Gradient overlay + label bar */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 bg-zinc-900/80 text-white px-4 py-3">
          <p className="text-2xl font-semibold leading-tight">{name}</p>
          <p className="text-sm font-semibold text-zinc-300 mt-1 group-hover:text-blue-400 transition-colors">
            Shop now
          </p>
        </div>
      </div>
    </Link>
  )
}
