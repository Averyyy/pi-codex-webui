import type { ComposerImage } from "@/lib/prompt-images"

export const NEW_CONVERSATION_DRAFT_ID = "new-conversation"
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

  read(sessionId: string): SessionComposerDraft {
    return this.drafts.get(sessionId) ?? { text: "", images: [] }
  }

  setText(sessionId: string, text: string) {
    const current = this.read(sessionId)
    this.write(sessionId, { ...current, text })
  }

  setImages(sessionId: string, images: ComposerImage[]) {
    const current = this.read(sessionId)
    this.write(sessionId, { ...current, images })
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
      this.write(sessionId, {
        text: draft.text,
        images: draft.images.map((image) => ({ ...image })),
      })
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
  storage: Pick<Storage, "setItem" | "removeItem"> = window.sessionStorage
) {
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
