import type { ComposerImage } from "@/lib/prompt-images"

export const NEW_CONVERSATION_DRAFT_ID = "new-conversation"
export const SESSION_DRAFT_STORAGE_PREFIX = "pi-web-codex:session-draft.v1:"
export const UPDATE_DRAFT_HANDOFF_STORAGE_KEY =
  "pi-web-codex:update-draft-handoff.v1"
export const UPDATE_DRAFT_HANDOFF_VERSION = 1 as const

export interface SessionComposerDraft {
  text: string
  images: ComposerImage[]
}

export interface SessionComposerDraftHandoff {
  version: typeof UPDATE_DRAFT_HANDOFF_VERSION
  drafts: Record<string, SessionComposerDraft>
}

export class DraftHandoffError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DraftHandoffError"
  }
}

export function draftAfterAcceptedSend(current: string, submitted: string) {
  return current === submitted ? "" : current
}

export class SessionComposerDraftStore {
  private readonly drafts = new Map<string, SessionComposerDraft>()
  private readonly loaded = new Set<string>()
  private readonly storageErrorListeners = new Set<() => void>()
  private readonly storageErrors = new Map<string, string>()
  private storageErrorNotificationScheduled = false

  constructor(
    private readonly storage: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem"
    > | null = null
  ) {}

  subscribeStorageError(listener: () => void) {
    this.storageErrorListeners.add(listener)
    return () => {
      this.storageErrorListeners.delete(listener)
    }
  }

  getStorageError() {
    return this.storageErrors.values().next().value ?? null
  }

  private notifyStorageErrorListeners() {
    if (this.storageErrorNotificationScheduled) return
    this.storageErrorNotificationScheduled = true
    queueMicrotask(() => {
      this.storageErrorNotificationScheduled = false
      for (const listener of this.storageErrorListeners) listener()
    })
  }

  private reportStorageError(key: string, action: string, failure: unknown) {
    this.storageErrors.set(
      key,
      `Could not ${action} the composer draft in this tab: ${
        failure instanceof Error ? failure.message : String(failure)
      }`
    )
    this.notifyStorageErrorListeners()
  }

  private clearStorageError(key: string) {
    if (!this.storageErrors.delete(key)) return
    this.notifyStorageErrorListeners()
  }

  private storageKey(sessionId: string, field: "text" | "images") {
    return `${SESSION_DRAFT_STORAGE_PREFIX}${encodeURIComponent(sessionId)}:${field}`
  }

  read(sessionId: string): SessionComposerDraft {
    if (!this.loaded.has(sessionId)) {
      this.loaded.add(sessionId)
      if (this.storage) {
        let text: string | null = null
        let images: ComposerImage[] = []
        const textKey = this.storageKey(sessionId, "text")
        const imagesKey = this.storageKey(sessionId, "images")
        try {
          text = this.storage.getItem(textKey)
          this.clearStorageError(textKey)
        } catch (failure) {
          this.reportStorageError(textKey, "read", failure)
        }
        try {
          const rawImages = this.storage.getItem(imagesKey)
          if (rawImages !== null) {
            const parsed: unknown = JSON.parse(rawImages)
            if (!Array.isArray(parsed) || !parsed.every(isComposerImage)) {
              throw new DraftHandoffError("Saved composer images are invalid.")
            }
            images = parsed.map((image) => ({ ...image }))
          }
          this.clearStorageError(imagesKey)
        } catch (failure) {
          this.reportStorageError(imagesKey, "read", failure)
        }
        if (text || images.length > 0) {
          this.drafts.set(sessionId, { text: text ?? "", images })
        }
      }
    }
    return this.drafts.get(sessionId) ?? { text: "", images: [] }
  }

  setText(sessionId: string, text: string) {
    const current = this.read(sessionId)
    this.write(sessionId, { ...current, text })
    if (!this.storage) return
    const key = this.storageKey(sessionId, "text")
    try {
      if (text) this.storage.setItem(key, text)
      else this.storage.removeItem(key)
      this.clearStorageError(key)
    } catch (failure) {
      this.reportStorageError(key, "save", failure)
    }
  }

  setImages(sessionId: string, images: ComposerImage[]) {
    const current = this.read(sessionId)
    this.write(sessionId, { ...current, images })
    if (!this.storage) return
    const key = this.storageKey(sessionId, "images")
    try {
      if (images.length > 0) this.storage.setItem(key, JSON.stringify(images))
      else this.storage.removeItem(key)
      this.clearStorageError(key)
    } catch (failure) {
      this.reportStorageError(key, "save", failure)
    }
  }

  isPersistedIn(storage: Pick<Storage, "getItem">) {
    this.clearStorageError("verification")
    if (storage !== this.storage || this.storageErrors.size > 0) return false
    try {
      for (const sessionId of this.loaded) {
        const draft = this.read(sessionId)
        const savedText = storage.getItem(this.storageKey(sessionId, "text"))
        const savedImages = storage.getItem(
          this.storageKey(sessionId, "images")
        )
        if (
          savedText !== (draft.text || null) ||
          savedImages !==
            (draft.images.length > 0 ? JSON.stringify(draft.images) : null)
        ) {
          return false
        }
      }
      return true
    } catch (failure) {
      this.reportStorageError("verification", "verify", failure)
      return false
    }
  }

  toUpdateHandoff(): SessionComposerDraftHandoff {
    return {
      version: UPDATE_DRAFT_HANDOFF_VERSION,
      drafts: Object.fromEntries(
        Array.from(this.drafts.entries()).map(([sessionId, draft]) => [
          sessionId,
          {
            text: draft.text,
            images: draft.images.map((image) => ({ ...image })),
          },
        ])
      ),
    }
  }

  restoreUpdateHandoff(handoff: SessionComposerDraftHandoff) {
    for (const [sessionId, draft] of Object.entries(handoff.drafts)) {
      this.setText(sessionId, draft.text)
      this.setImages(
        sessionId,
        draft.images.map((image) => ({ ...image }))
      )
    }
  }

  private write(sessionId: string, draft: SessionComposerDraft) {
    if (!draft.text && draft.images.length === 0) {
      this.drafts.delete(sessionId)
      return
    }
    this.drafts.set(sessionId, draft)
  }
}

function isComposerImage(value: unknown): value is ComposerImage {
  if (typeof value !== "object" || value === null) return false
  const image = value as Record<string, unknown>
  return (
    image.type === "image" &&
    typeof image.data === "string" &&
    image.data.length > 0 &&
    typeof image.mimeType === "string" &&
    image.mimeType.length > 0 &&
    typeof image.id === "string" &&
    image.id.length > 0 &&
    typeof image.name === "string"
  )
}

export function parseUpdateDraftHandoff(
  value: unknown
): SessionComposerDraftHandoff {
  if (typeof value !== "object" || value === null) {
    throw new DraftHandoffError("The saved composer draft handoff is invalid.")
  }
  const candidate = value as Record<string, unknown>
  if (
    candidate.version !== UPDATE_DRAFT_HANDOFF_VERSION ||
    typeof candidate.drafts !== "object" ||
    candidate.drafts === null ||
    Array.isArray(candidate.drafts)
  ) {
    throw new DraftHandoffError("The saved composer draft handoff is invalid.")
  }

  const drafts: Record<string, SessionComposerDraft> = {}
  for (const [sessionId, rawDraft] of Object.entries(candidate.drafts)) {
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new DraftHandoffError(
        "The saved composer draft handoff is invalid."
      )
    }
    if (typeof rawDraft !== "object" || rawDraft === null) {
      throw new DraftHandoffError(
        "The saved composer draft handoff is invalid."
      )
    }
    const draft = rawDraft as Record<string, unknown>
    if (
      typeof draft.text !== "string" ||
      !Array.isArray(draft.images) ||
      !draft.images.every(isComposerImage)
    ) {
      throw new DraftHandoffError(
        "The saved composer draft handoff is invalid."
      )
    }
    drafts[sessionId] = {
      text: draft.text,
      images: draft.images.map((image) => ({ ...image })),
    }
  }
  return {
    version: UPDATE_DRAFT_HANDOFF_VERSION,
    drafts,
  }
}

export function writeUpdateDraftHandoff(
  store: SessionComposerDraftStore,
  storage: Pick<
    Storage,
    "getItem" | "setItem" | "removeItem"
  > = window.sessionStorage
) {
  if (store.isPersistedIn(storage)) {
    try {
      storage.removeItem(UPDATE_DRAFT_HANDOFF_STORAGE_KEY)
    } catch (failure) {
      throw new DraftHandoffError(
        `Could not clear the composer draft handoff: ${
          failure instanceof Error ? failure.message : String(failure)
        }`
      )
    }
    return
  }
  const handoff = store.toUpdateHandoff()
  if (Object.keys(handoff.drafts).length === 0) {
    try {
      storage.removeItem(UPDATE_DRAFT_HANDOFF_STORAGE_KEY)
    } catch (failure) {
      throw new DraftHandoffError(
        `Could not clear the composer draft handoff: ${
          failure instanceof Error ? failure.message : String(failure)
        }`
      )
    }
    return
  }
  try {
    storage.setItem(UPDATE_DRAFT_HANDOFF_STORAGE_KEY, JSON.stringify(handoff))
  } catch (failure) {
    throw new DraftHandoffError(
      `Could not preserve composer drafts for the update: ${
        failure instanceof Error ? failure.message : String(failure)
      }`
    )
  }
}

export function readUpdateDraftHandoff(
  storage: Pick<Storage, "getItem"> = window.sessionStorage
) {
  let raw: string | null
  try {
    raw = storage.getItem(UPDATE_DRAFT_HANDOFF_STORAGE_KEY)
  } catch (failure) {
    throw new DraftHandoffError(
      `Could not read the composer draft handoff: ${
        failure instanceof Error ? failure.message : String(failure)
      }`
    )
  }
  if (!raw) return null
  try {
    return parseUpdateDraftHandoff(JSON.parse(raw) as unknown)
  } catch (failure) {
    throw new DraftHandoffError(
      failure instanceof Error
        ? failure.message
        : "The saved composer draft handoff is invalid."
    )
  }
}

export function clearUpdateDraftHandoff(
  storage: Pick<Storage, "removeItem"> = window.sessionStorage
) {
  try {
    storage.removeItem(UPDATE_DRAFT_HANDOFF_STORAGE_KEY)
  } catch (failure) {
    throw new DraftHandoffError(
      `Composer drafts were restored but the handoff could not be cleared: ${
        failure instanceof Error ? failure.message : String(failure)
      }`
    )
  }
}

export function restoreUpdateDraftHandoff(
  store: SessionComposerDraftStore,
  storage: Pick<Storage, "getItem" | "removeItem"> = window.sessionStorage
) {
  const handoff = readUpdateDraftHandoff(storage)
  if (!handoff) return false
  store.restoreUpdateHandoff(handoff)
  clearUpdateDraftHandoff(storage)
  return true
}
