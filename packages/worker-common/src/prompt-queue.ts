import { randomUUID } from "node:crypto"

import type {
  QueuedPromptItem,
  QueuedPromptMode,
} from "@workspace/runtime-protocol"

export interface PromptImage {
  type: "image"
  data: string
  mimeType: string
}

export interface QueuedPromptRecord extends QueuedPromptItem {
  images: PromptImage[]
  order: number
  confirmed: boolean
}

function sameTexts(records: QueuedPromptRecord[], texts: readonly string[]) {
  return (
    records.length === texts.length &&
    records.every((record, index) => record.text === texts[index])
  )
}

function sameItems(left: QueuedPromptItem[], right: QueuedPromptItem[]) {
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.id === right[index]?.id &&
        item.text === right[index].text &&
        item.mode === right[index].mode
    )
  )
}

function publicItem(record: QueuedPromptRecord): QueuedPromptItem {
  return { id: record.id, text: record.text, mode: record.mode }
}

export class PromptQueue {
  private records: QueuedPromptRecord[] = []
  private nextOrder = 0

  begin(mode: QueuedPromptMode, text: string, images: PromptImage[]): string {
    const id = randomUUID()
    this.records.push({
      id,
      text,
      mode,
      images,
      order: this.nextOrder++,
      confirmed: false,
    })
    return id
  }

  cancel(id: string) {
    const record = this.records.find((item) => item.id === id)
    if (record?.confirmed) return
    this.records = this.records.filter((item) => item.id !== id)
  }

  reconcile(state: {
    steering: readonly string[]
    followUp: readonly string[]
  }): QueuedPromptItem[] {
    this.reconcileMode("steer", state.steering)
    this.reconcileMode("followUp", state.followUp)
    return this.snapshot()
  }

  snapshot(): QueuedPromptItem[] {
    return this.records
      .filter((record) => record.confirmed)
      .sort((left, right) => left.order - right.order)
      .map(publicItem)
  }

  prepareReplacement(expected: QueuedPromptItem[], next: QueuedPromptItem[]) {
    if (this.records.some((record) => !record.confirmed)) {
      const error = new Error(
        "消息正在加入队列；请等待队列更新后再执行此操作。"
      )
      error.name = "QueueConflict"
      throw error
    }
    if (!sameItems(this.snapshot(), expected)) {
      const error = new Error("消息队列已变化；请根据最新队列重新执行此操作。")
      error.name = "QueueConflict"
      throw error
    }

    const current = new Map(this.records.map((record) => [record.id, record]))
    const nextRecords = next.map((item) => {
      const record = current.get(item.id)
      if (!record?.confirmed) {
        const error = new Error(`Unknown queued prompt ${item.id}.`)
        error.name = "QueueConflict"
        throw error
      }
      return {
        ...record,
        text: item.text,
        mode: item.mode,
        confirmed: true,
      }
    })

    return {
      previous: this.records.map((record) => ({ ...record })),
      next: nextRecords,
    }
  }

  commit(records: QueuedPromptRecord[]) {
    this.records = records
  }

  private reconcileMode(mode: QueuedPromptMode, texts: readonly string[]) {
    const modeRecords = this.records
      .filter((record) => record.mode === mode)
      .sort((left, right) => left.order - right.order)
    const confirmed = modeRecords.filter((record) => record.confirmed)
    const pending = modeRecords.filter((record) => !record.confirmed)
    let nextModeRecords: QueuedPromptRecord[]

    if (texts.length <= confirmed.length) {
      const remaining = confirmed.slice(confirmed.length - texts.length)
      if (!sameTexts(remaining, texts)) {
        throw new Error(`Pi ${mode} queue changed outside FIFO order.`)
      }
      nextModeRecords = [...remaining, ...pending]
    } else {
      if (!sameTexts(confirmed, texts.slice(0, confirmed.length))) {
        throw new Error(`Pi ${mode} queue changed outside append order.`)
      }
      const addedTexts = texts.slice(confirmed.length)
      const added = addedTexts.map((text, index) => {
        const waiting = pending[index]
        if (waiting) return { ...waiting, text, confirmed: true }
        return {
          id: randomUUID(),
          text,
          mode,
          images: [],
          order: this.nextOrder++,
          confirmed: true,
        }
      })
      nextModeRecords = [...confirmed, ...added, ...pending.slice(added.length)]
    }

    this.records = [
      ...this.records.filter((record) => record.mode !== mode),
      ...nextModeRecords,
    ]
  }
}
