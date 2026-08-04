export class TerminalActionQueue<T> {
  private active = true
  private readonly controller = new AbortController()
  private tail: Promise<void> = Promise.resolve()

  constructor(
    private readonly run: (action: T, signal: AbortSignal) => Promise<void>,
    private readonly reportError: (error: unknown) => void
  ) {}

  enqueue(action: T) {
    if (!this.active) return Promise.resolve()
    this.tail = this.tail.then(async () => {
      if (!this.active) return
      try {
        await this.run(action, this.controller.signal)
      } catch (error) {
        if (this.active) this.reportError(error)
      }
    })
    return this.tail
  }

  dispose() {
    if (!this.active) return
    this.active = false
    this.controller.abort()
  }

  get signal() {
    return this.controller.signal
  }
}
