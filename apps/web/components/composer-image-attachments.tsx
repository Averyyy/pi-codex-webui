"use client"

import { useRef, useState } from "react"
import { XIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { useI18n } from "@/components/i18n-provider"
import type { Translator } from "@/lib/i18n"
import {
  MAX_PROMPT_IMAGES,
  MAX_PROMPT_IMAGE_BASE64_LENGTH,
  imagesAfterAcceptedSend,
  promptImageBase64Length,
  type ComposerImage,
  type PromptImage,
} from "@/lib/prompt-images"

export type { ComposerImage } from "@/lib/prompt-images"

function readImage(file: File, t: Translator) {
  return new Promise<ComposerImage>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new Error(t("composer.image.readFailed", { name: file.name })))
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(t("composer.image.readFailed", { name: file.name })))
        return
      }
      const prefix = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(reader.result)
      const mimeType = prefix?.[1]
      if (!prefix || !mimeType) {
        reject(new Error(t("composer.image.invalid", { name: file.name })))
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

export function useComposerImages(
  initialImages: ComposerImage[] = [],
  onImagesChange?: (images: ComposerImage[]) => void
) {
  const { t } = useI18n()
  const [images, setImages] = useState<ComposerImage[]>(initialImages)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const imagesRef = useRef<ComposerImage[]>(initialImages)
  const pendingCountRef = useRef(0)
  const revisionRef = useRef(0)

  function updateImages(next: ComposerImage[]) {
    imagesRef.current = next
    setImages(next)
    onImagesChange?.(next)
  }

  async function addImages(files: File[]) {
    setError(null)
    if (
      imagesRef.current.length + pendingCountRef.current + files.length >
      MAX_PROMPT_IMAGES
    ) {
      setError(
        t("composer.image.maximum", {
          count: MAX_PROMPT_IMAGES,
        })
      )
      return
    }
    const oversized = files.find(
      (file) =>
        promptImageBase64Length(file.size) > MAX_PROMPT_IMAGE_BASE64_LENGTH
    )
    if (oversized) {
      setError(t("composer.image.tooLarge", { name: oversized.name }))
      return
    }

    pendingCountRef.current += files.length
    setLoading(true)
    const revision = revisionRef.current
    try {
      const added: ComposerImage[] = []
      for (const file of files) added.push(await readImage(file, t))
      if (revision !== revisionRef.current) return
      const next = [...imagesRef.current, ...added]
      updateImages(next)
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
    updateImages(next)
  }

  function clearImages() {
    revisionRef.current += 1
    updateImages([])
    setError(null)
  }

  function clearAcceptedImages(submitted: ComposerImage[]) {
    const next = imagesAfterAcceptedSend(imagesRef.current, submitted)
    if (next === imagesRef.current) return
    updateImages(next)
    setError(null)
  }

  return {
    images,
    error,
    loading,
    addImages,
    removeImage,
    clearImages,
    clearAcceptedImages,
  }
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
  const { t } = useI18n()
  const removeButtonRefs = useRef(new Map<string, HTMLButtonElement>())

  return (
    <>
      {images.length ? (
        <div className="flex flex-wrap gap-2 px-1 pt-1">
          {images.map((image, index) => (
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
                ref={(button) => {
                  if (button) removeButtonRefs.current.set(image.id, button)
                  else removeButtonRefs.current.delete(image.id)
                }}
                type="button"
                variant="secondary"
                size="icon-xs"
                className="absolute top-1 right-1 rounded-full"
                onClick={(event) => {
                  if (!onRemove) return
                  const nextFocusId =
                    images[index + 1]?.id ?? images[index - 1]?.id
                  const textarea = event.currentTarget
                    .closest("form")
                    ?.querySelector<HTMLTextAreaElement>("textarea")
                  onRemove(image.id)
                  requestAnimationFrame(() => {
                    if (nextFocusId) {
                      removeButtonRefs.current.get(nextFocusId)?.focus()
                    } else {
                      textarea?.focus()
                    }
                  })
                }}
                aria-label={t("composer.image.remove", { name: image.name })}
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
