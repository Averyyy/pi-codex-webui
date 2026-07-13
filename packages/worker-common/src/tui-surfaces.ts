import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, watch, type FSWatcher } from "node:fs"

import type {
  ExtensionUIContext,
  KeybindingsManager,
  TerminalInputHandler,
} from "@earendil-works/pi-coding-agent"
import type {
  Component,
  EditorComponent,
  EditorTheme,
  OverlayHandle,
  OverlayOptions,
  StdinBuffer,
  Terminal as PiTerminal,
  TUI,
} from "@earendil-works/pi-tui"
import { SerializeAddon } from "@xterm/addon-serialize"
import HeadlessModule, {
  type Terminal as HeadlessTerminal,
} from "@xterm/headless"
import type {
  TuiSurfaceAction,
  TuiSurfaceEvent,
  TuiSurfaceMode,
  TuiSurfacePlacement,
  TuiSurfaceSnapshot,
} from "@workspace/runtime-protocol"

type TuiModule = typeof import("@earendil-works/pi-tui")
const HeadlessTerminalConstructor = (
  HeadlessModule as unknown as { Terminal: typeof HeadlessTerminal }
).Terminal
type SurfaceComponent = Component & { dispose?(): void }
type SurfaceFactory = (tui: TUI) => SurfaceComponent

type Surface = {
  id: string
  slot: string | null
  mode: TuiSurfaceMode
  placement?: TuiSurfacePlacement
  terminal: WebVirtualTerminal
  tui: TUI
  component: SurfaceComponent
  cancel?: () => void
}

type FooterData = {
  getGitBranch(): string | null
  getExtensionStatuses(): ReadonlyMap<string, string>
  getAvailableProviderCount(): number
  onBranchChange(callback: () => void): () => void
}

function gitValue(cwd: string, args: string[]) {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
  return result.status === 0 ? result.stdout.trim() || null : null
}

export function createFooterData(
  cwd: string,
  statuses: ReadonlyMap<string, string>,
  availableProviderCount: () => number
): FooterData {
  return {
    getGitBranch: () =>
      gitValue(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]) ??
      (gitValue(cwd, ["rev-parse", "--is-inside-work-tree"])
        ? "detached"
        : null),
    getExtensionStatuses: () => statuses,
    getAvailableProviderCount: availableProviderCount,
    onBranchChange(callback) {
      const head = gitValue(cwd, [
        "rev-parse",
        "--path-format=absolute",
        "--git-path",
        "HEAD",
      ])
      if (!head || !existsSync(head)) return () => {}
      const watcher: FSWatcher = watch(head, callback)
      return () => watcher.close()
    },
  }
}

class WebVirtualTerminal implements PiTerminal {
  private inputHandler?: (data: string) => void
  private resizeHandler?: () => void
  private readonly state: HeadlessTerminal
  private readonly serializer = new SerializeAddon()
  private writes = Promise.resolve()
  private revision = 0
  private title: string | undefined
  private progress = false

  constructor(
    readonly surfaceId: string,
    public columns: number,
    public rows: number,
    private readonly emit: (event: TuiSurfaceEvent) => void,
    private readonly inputBuffer: StdinBuffer,
    private readonly transformInput: (data: string) => string | undefined
  ) {
    this.state = new HeadlessTerminalConstructor({
      cols: columns,
      rows,
      scrollback: 0,
      allowProposedApi: true,
    })
    this.state.loadAddon(this.serializer as never)
    this.inputBuffer.on("data", (data) => this.forwardInput(data))
    this.inputBuffer.on("paste", (data) =>
      this.forwardInput(`\x1b[200~${data}\x1b[201~`)
    )
  }

  get kittyProtocolActive() {
    return false
  }

  start(onInput: (data: string) => void, onResize: () => void) {
    this.inputHandler = onInput
    this.resizeHandler = onResize
  }

  stop() {
    this.inputHandler = undefined
    this.resizeHandler = undefined
  }

  dispose() {
    this.stop()
    this.inputBuffer.destroy()
    this.serializer.dispose()
    this.state.dispose()
  }

  drainInput() {
    return Promise.resolve()
  }

  write(data: string) {
    this.revision += 1
    const revision = this.revision
    this.writes = this.writes.then(
      () =>
        new Promise<void>((resolve) => {
          this.state.write(data, resolve)
        })
    )
    this.emit({
      version: 1,
      kind: "write",
      surfaceId: this.surfaceId,
      revision,
      data,
    })
  }

  moveBy(lines: number) {
    this.write(lines < 0 ? `\x1b[${-lines}A` : `\x1b[${lines}B`)
  }

  hideCursor() {
    this.write("\x1b[?25l")
  }

  showCursor() {
    this.write("\x1b[?25h")
  }

  clearLine() {
    this.write("\x1b[K")
  }

  clearFromCursor() {
    this.write("\x1b[J")
  }

  clearScreen() {
    this.write("\x1b[2J\x1b[H")
  }

  setTitle(title: string) {
    this.title = title
    this.emit({ version: 1, kind: "title", surfaceId: this.surfaceId, title })
  }

  setProgress(active: boolean) {
    this.progress = active
    this.emit({
      version: 1,
      kind: "progress",
      surfaceId: this.surfaceId,
      active,
    })
  }

  sendInput(data: string) {
    this.inputBuffer.process(data)
  }

  private forwardInput(data: string) {
    const transformed = this.transformInput(data)
    if (transformed !== undefined) this.inputHandler?.(transformed)
  }

  resize(columns: number, rows: number) {
    if (columns === this.columns && rows === this.rows) return
    this.columns = columns
    this.rows = rows
    this.state.resize(columns, rows)
    this.resizeHandler?.()
  }

  async snapshot(
    mode: TuiSurfaceMode,
    placement?: TuiSurfacePlacement
  ): Promise<TuiSurfaceSnapshot> {
    await this.writes
    return {
      version: 1,
      surfaceId: this.surfaceId,
      mode,
      placement,
      title: this.title,
      progress: this.progress,
      columns: this.columns,
      rows: this.rows,
      revision: this.revision,
      data: this.serializer.serialize({ scrollback: 0 }),
    }
  }

  initialSnapshot(
    mode: TuiSurfaceMode,
    placement?: TuiSurfacePlacement
  ): TuiSurfaceSnapshot {
    return {
      version: 1,
      surfaceId: this.surfaceId,
      mode,
      placement,
      title: this.title,
      progress: this.progress,
      columns: this.columns,
      rows: this.rows,
      revision: 0,
      data: "",
    }
  }
}

export class TuiSurfaceManager {
  private readonly surfaces = new Map<string, Surface>()
  private readonly slots = new Map<string, string>()
  private readonly inputHandlers = new Set<TerminalInputHandler>()

  constructor(
    private readonly tuiModule: TuiModule,
    private readonly theme: ExtensionUIContext["theme"],
    private readonly keybindings: KeybindingsManager,
    private readonly footerData: FooterData,
    private readonly emit: (event: TuiSurfaceEvent) => void
  ) {}

  set(
    slot: string,
    mode: TuiSurfaceMode,
    placement: TuiSurfacePlacement | undefined,
    factory: SurfaceFactory
  ) {
    this.remove(slot)
    const id = randomUUID()
    const terminal = this.createTerminal(id)
    const tui = new this.tuiModule.TUI(terminal)
    const component = factory(tui)
    this.attach({
      id,
      slot,
      mode,
      placement,
      terminal,
      tui,
      component,
    })
    return id
  }

  setFooter(
    factory: (
      tui: TUI,
      theme: ExtensionUIContext["theme"],
      data: FooterData
    ) => SurfaceComponent
  ) {
    return this.set("footer", "inline", "footer", (tui) =>
      factory(tui, this.theme, this.footerData)
    )
  }

  setEditor(
    factory: (
      tui: TUI,
      theme: EditorTheme,
      keybindings: KeybindingsManager
    ) => EditorComponent,
    editorTheme: EditorTheme
  ) {
    return this.set("editor", "editor", undefined, (tui) => {
      const editor = factory(tui, editorTheme, this.keybindings)
      editor.onSubmit = (value) => {
        const surfaceId = this.slots.get("editor")
        if (surfaceId) {
          this.emit({ version: 1, kind: "submit", surfaceId, value })
        }
      }
      return editor
    })
  }

  custom<T>(
    factory: (
      tui: TUI,
      theme: ExtensionUIContext["theme"],
      keybindings: KeybindingsManager,
      done: (result: T) => void
    ) => SurfaceComponent | Promise<SurfaceComponent>,
    options?: {
      overlay?: boolean
      overlayOptions?: OverlayOptions | (() => OverlayOptions)
      onHandle?: (handle: OverlayHandle) => void
    }
  ) {
    return new Promise<T>((resolve, reject) => {
      const id = randomUUID()
      const terminal = this.createTerminal(id)
      const tui = new this.tuiModule.TUI(terminal)
      let finished = false
      let attached = false
      const finish = (result: T) => {
        if (finished) return
        finished = true
        if (attached) this.close(id)
        resolve(result)
      }
      Promise.resolve()
        .then(() => factory(tui, this.theme, this.keybindings, finish))
        .then(
          (component) => {
            if (finished) {
              component.dispose?.()
              terminal.dispose()
              return
            }
            const surface: Surface = {
              id,
              slot: null,
              mode: options?.overlay ? "overlay" : "dialog",
              placement: undefined,
              terminal,
              tui,
              component,
              cancel: () => finish(undefined as T),
            }
            this.attach(surface, options)
            attached = true
          },
          (error) => {
            terminal.dispose()
            reject(error)
          }
        )
    })
  }

  onInput(handler: TerminalInputHandler) {
    this.inputHandlers.add(handler)
    return () => this.inputHandlers.delete(handler)
  }

  remove(slot: string) {
    const id = this.slots.get(slot)
    if (id) this.close(id)
  }

  component<T extends SurfaceComponent>(slot: string) {
    const id = this.slots.get(slot)
    return (id ? this.surfaces.get(id)?.component : undefined) as T | undefined
  }

  requestRender(slot: string) {
    const id = this.slots.get(slot)
    if (id) this.surfaces.get(id)?.tui.requestRender()
  }

  async snapshots() {
    return Promise.all(
      [...this.surfaces.values()].map((surface) =>
        surface.terminal.snapshot(surface.mode, surface.placement)
      )
    )
  }

  action(surfaceId: string, action: TuiSurfaceAction) {
    const surface = this.surfaces.get(surfaceId)
    if (!surface) throw new Error(`Unknown TUI surface ${surfaceId}.`)
    if (action.action === "resize") {
      surface.terminal.resize(action.columns, action.rows)
      return
    }
    if (action.action === "close") {
      if (!surface.cancel) {
        throw new Error("Only custom dialog and overlay surfaces can close.")
      }
      surface.cancel()
      return
    }

    surface.terminal.sendInput(action.data)
  }

  dispose() {
    for (const surface of [...this.surfaces.values()]) {
      if (surface.cancel) surface.cancel()
      else this.close(surface.id)
    }
    this.inputHandlers.clear()
  }

  private createTerminal(surfaceId: string) {
    return new WebVirtualTerminal(
      surfaceId,
      80,
      24,
      this.emit,
      new this.tuiModule.StdinBuffer({ timeout: 10 }),
      (input) => {
        let data = input
        for (const handler of this.inputHandlers) {
          const result = handler(data)
          if (result?.consume) return undefined
          if (result?.data !== undefined) data = result.data
        }
        return data
      }
    )
  }

  private attach(
    surface: Surface,
    overlay?: {
      overlayOptions?: OverlayOptions | (() => OverlayOptions)
      onHandle?: (handle: OverlayHandle) => void
    }
  ) {
    this.surfaces.set(surface.id, surface)
    if (surface.slot) this.slots.set(surface.slot, surface.id)
    this.emit({
      version: 1,
      kind: "open",
      surface: surface.terminal.initialSnapshot(
        surface.mode,
        surface.placement
      ),
    })
    if (surface.mode === "overlay") {
      const overlayOptions =
        typeof overlay?.overlayOptions === "function"
          ? overlay.overlayOptions()
          : overlay?.overlayOptions
      overlay?.onHandle?.(
        surface.tui.showOverlay(surface.component, overlayOptions)
      )
    } else {
      surface.tui.addChild(surface.component)
      surface.tui.setFocus(surface.component)
    }
    surface.tui.start()
  }

  private close(surfaceId: string) {
    const surface = this.surfaces.get(surfaceId)
    if (!surface) return
    const value =
      surface.mode === "editor" && "getText" in surface.component
        ? (surface.component as EditorComponent).getText()
        : undefined
    surface.tui.stop()
    surface.component.dispose?.()
    surface.terminal.dispose()
    this.surfaces.delete(surfaceId)
    if (surface.slot) this.slots.delete(surface.slot)
    this.emit({ version: 1, kind: "close", surfaceId, value })
  }
}
