"use client"
// src/components/admin/ImageUploadField.tsx
// Product editor "Images" card (ADMN-01, D-03) — UI-SPEC Surface 3 §2.
// Required alt text is enforced client-side as a UX hint AND independently
// server-side in src/lib/blob/upload.ts (T-05-10) — the client check never weakens
// the server contract. Calls uploadProductImage/deleteProductImage directly.

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { inputClass } from "@/components/admin/formStyles"
import { uploadProductImage, deleteProductImage } from "@/lib/blob/upload"

export type ImageUploadFieldImage = {
  id: string
  url: string
  altText: string | null
  isPrimary: boolean
}

interface ImageUploadFieldProps {
  productId: string
  images: ImageUploadFieldImage[]
}

type PendingUpload = {
  key: string
  file: File
  previewUrl: string
  altText: string
  error: string | null
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function BuildingLibraryIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mx-auto mb-2" aria-hidden="true">
      <path fillRule="evenodd" d="M12 2.25a.75.75 0 0 1 .329.076l9 4.5A.75.75 0 0 1 21 8.25v.75a.75.75 0 0 1-.75.75H3.75A.75.75 0 0 1 3 9v-.75a.75.75 0 0 1 .671-.746l9-4.5A.75.75 0 0 1 12 2.25Zm-6.75 8.25a.75.75 0 0 0-.75.75v6.75H3a.75.75 0 0 0 0 1.5h18a.75.75 0 0 0 0-1.5h-1.5v-6.75a.75.75 0 0 0-1.5 0v6.75h-2.25v-6.75a.75.75 0 0 0-1.5 0v6.75h-2.25v-6.75a.75.75 0 0 0-1.5 0v6.75H8.25v-6.75a.75.75 0 0 0-1.5 0v6.75H5.25v-6.75Z" clipRule="evenodd" />
    </svg>
  )
}

export function ImageUploadField({ productId, images }: ImageUploadFieldProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingUpload[]>([])
  const [primaryId, setPrimaryId] = useState<string | null>(
    images.find((i) => i.isPrimary)?.id ?? images[0]?.id ?? null
  )
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const next: PendingUpload[] = Array.from(fileList).map((file) => ({
      key: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      altText: "",
      error: null,
    }))
    setPending((prev) => [...prev, ...next])
  }

  function updatePendingAlt(key: string, altText: string) {
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, altText, error: null } : p)))
  }

  function removePending(key: string) {
    setPending((prev) => prev.filter((p) => p.key !== key))
  }

  function uploadOne(item: PendingUpload) {
    if (!item.altText.trim()) {
      setPending((prev) =>
        prev.map((p) => (p.key === item.key ? { ...p, error: "Alt text is required for every image" } : p))
      )
      return
    }
    setBannerError(null)
    startTransition(async () => {
      try {
        const result = await uploadProductImage({
          productId,
          file: item.file,
          altText: item.altText.trim(),
          position: images.length,
        })
        if (!result.success) {
          setBannerError(result.error)
          setPending((prev) => prev.map((p) => (p.key === item.key ? { ...p, error: result.error } : p)))
        } else {
          removePending(item.key)
          router.refresh()
        }
      } catch (err) {
        console.error("[ImageUploadField] upload failed:", err)
        setBannerError(
          "The image couldn't be uploaded. Check the file (max 5MB, JPG/PNG/WebP) and try again."
        )
      }
    })
  }

  function handleRemoveSaved(imageId: string) {
    setBannerError(null)
    startTransition(async () => {
      const result = await deleteProductImage(imageId)
      if (!result.success) {
        setBannerError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      {bannerError && (
        <div role="alert" className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-4">
          <p className="text-sm font-semibold text-stock-out">Image upload failed</p>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">{bannerError}</p>
        </div>
      )}

      {(images.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {images.map((image, i) => (
            <div key={image.id} className="space-y-2">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                <Image
                  src={image.url}
                  alt={image.altText ?? ""}
                  fill
                  className="object-cover"
                  sizes="200px"
                />
                <span className="absolute top-1 left-1 rounded-full bg-black/50 text-white text-xs font-semibold px-2 py-0.5">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveSaved(image.id)}
                  disabled={isPending}
                  aria-label="Remove image"
                  className="absolute top-1 right-1 min-h-11 min-w-11 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  <TrashIcon />
                </button>
              </div>
              <p className="text-sm text-muted truncate" title={image.altText ?? ""}>
                {image.altText || "No alt text"}
              </p>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="radio"
                  name="primary-image"
                  checked={primaryId === image.id}
                  onChange={() => setPrimaryId(image.id)}
                  className="text-brand focus-visible:ring-2 focus-visible:ring-brand"
                />
                Set as primary
              </label>
            </div>
          ))}

          {pending.map((item) => (
            <div key={item.key} className="space-y-2">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not an optimizable remote asset */}
                <img src={item.previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePending(item.key)}
                  aria-label="Remove pending image"
                  className="absolute top-1 right-1 min-h-11 min-w-11 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  <TrashIcon />
                </button>
              </div>
              <div>
                <label htmlFor={`alt-${item.key}`} className="sr-only">
                  Alt text
                </label>
                <input
                  id={`alt-${item.key}`}
                  type="text"
                  placeholder="Describe this image"
                  value={item.altText}
                  onChange={(e) => updatePendingAlt(item.key, e.target.value)}
                  aria-invalid={!!item.error}
                  aria-describedby={item.error ? `alt-error-${item.key}` : undefined}
                  className={inputClass(!!item.error)}
                />
                {item.error && (
                  <p id={`alt-error-${item.key}`} role="alert" className="text-sm font-semibold text-stock-out mt-1">
                    {item.error}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => uploadOne(item)}
                disabled={isPending}
                className="w-full rounded-lg bg-brand hover:bg-brand-strong text-white px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {isPending ? "Uploading…" : "Upload"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click()
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          handleFiles(e.dataTransfer.files)
        }}
        className="rounded-xl border-2 border-dashed border-border p-6 text-center cursor-pointer hover:border-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <BuildingLibraryIcon />
        <p className="text-sm font-semibold text-foreground">
          Drag images here or click to upload
        </p>
        <p className="text-sm text-muted mt-1">JPG, PNG, or WebP, up to 5MB each</p>
      </div>
    </div>
  )
}
