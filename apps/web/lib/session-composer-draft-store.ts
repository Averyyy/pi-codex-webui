import type { ComposerImage } from "@/lib/prompt-images"

export const NEW_CONVERSATION_DRAFT_ID = "new-conversation"

export interface SessionComposerDraft {
  text: string
  images: ComposerImage[]
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

  private write(sessionId: string, draft: SessionComposerDraft) {
    if (!draft.text && draft.images.length === 0) {
      this.drafts.delete(sessionId)
      return
    }
    this.drafts.set(sessionId, draft)
  }
}
