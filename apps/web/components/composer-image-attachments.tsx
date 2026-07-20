"use client"

import { useRef, useState } from "react"
import { XIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import {
  MAX_PROMPT_IMAGES,
  MAX_PROMPT_IMAGE_BASE64_LENGTH,
  promptImageBase64Length,
  type PromptImage,
} from "@/lib/prompt-images"

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
  const [loading, setLoading] = useState(false)
  const imagesRef = useRef<ComposerImage[]>([])
  const pendingCountRef = useRef(0)
  const revisionRef = useRef(0)

  async function addImages(files: File[]) {
    setError(null)
    if (
      imagesRef.current.length + pendingCountRef.current + files.length >
      MAX_PROMPT_IMAGES
    ) {
      setError(`每条消息最多添加 ${MAX_PROMPT_IMAGES} 张图片。`)
      return
    }
    const oversized = files.find(
      (file) =>
        promptImageBase64Length(file.size) > MAX_PROMPT_IMAGE_BASE64_LENGTH
    )
    if (oversized) {
      setError(`图片 ${oversized.name} 太大，无法添加。`)
      return
    }

    pendingCountRef.current += files.length
    setLoading(true)
    const revision = revisionRef.current
    try {
      const added: ComposerImage[] = []
      for (const file of files) added.push(await readImage(file))
      if (revision !== revisionRef.current) return
      const next = [...imagesRef.current, ...added]
      imagesRef.current = next
      setImages(next)
    } catch (failure) {
      if (revision === revisionRef.current) {
        setError(failure instanceof Error ? failure.message : String(failure))
      }
    } finally {
      pendingCountRef.current -= files.length
      if (pendingCountRef.current === 0) setLoading(false)
    }
  }

  function removeImage(id: string) {
    const next = imagesRef.current.filter((image) => image.id !== id)
    imagesRef.current = next
    setImages(next)
  }

  function clearImages() {
    revisionRef.current += 1
    imagesRef.current = []
    setImages([])
    setError(null)
  }

  return { images, error, loading, addImages, removeImage, clearImages }
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
  disabled = false,
}: {
  images: ComposerImage[]
  error?: string | null
  onRemove?: (id: string) => void
  disabled?: boolean
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
                className="absolute top-1 right-1 rounded-full"
                onClick={() => onRemove?.(image.id)}
                aria-label={`移除 ${image.name}`}
                disabled={disabled}
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
