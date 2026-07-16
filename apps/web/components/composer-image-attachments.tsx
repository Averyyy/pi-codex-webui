"use client"

import { useState } from "react"
import { XIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import type { PromptImage } from "@/lib/prompt-images"

export type ComposerImage = PromptImage & {
  id: string
  name: string
}

function readImage(file: File) {
  return new Promise<ComposerImage>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(reader.error ?? new Error(`无法读取图片 ${file.name}。`))
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`无法读取图片 ${file.name}。`))
        return
      }
      const prefix = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(reader.result)
      const mimeType = prefix?.[1]
      if (!prefix || !mimeType) {
        reject(new Error(`${file.name} 不是浏览器可读取的图片。`))
        return
      }
      resolve({
        type: "image",
        data: reader.result.slice(prefix[0].length),
        mimeType,
        id: crypto.randomUUID(),
        name: file.name,
      })
    }
    reader.readAsDataURL(file)
  })
}

export function useComposerImages() {
  const [images, setImages] = useState<ComposerImage[]>([])
  const [error, setError] = useState<string | null>(null)

  async function addImages(files: File[]) {
    setError(null)
    try {
      const added = await Promise.all(files.map(readImage))
      setImages((current) => [...current, ...added])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  function removeImage(id: string) {
    setImages((current) => current.filter((image) => image.id !== id))
  }

  function clearImages() {
    setImages([])
    setError(null)
  }

  return { images, error, addImages, removeImage, clearImages }
}

export function promptImages(images: ComposerImage[]): PromptImage[] {
  return images.map(({ data, mimeType }) => ({
    type: "image",
    data,
    mimeType,
  }))
}

export function ComposerImagePreviews({
  images,
  error,
  onRemove,
}: {
  images: ComposerImage[]
  error?: string | null
  onRemove?: (id: string) => void
}) {
  return (
    <>
      {images.length ? (
        <div className="flex flex-wrap gap-2 px-1 pt-1">
          {images.map((image) => (
            <div
              key={image.id}
              className="group relative size-16 overflow-hidden rounded-xl border bg-muted"
              title={image.name}
            >
              {/* Session images are local data URLs without stable dimensions. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:${image.mimeType};base64,${image.data}`}
                alt={image.name}
                className="size-full object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon-xs"
                className="absolute top-1 right-1 rounded-full opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                onClick={() => onRemove?.(image.id)}
                aria-label={`移除 ${image.name}`}
              >
                <XIcon />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="px-2 pt-1 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </>
  )
}
