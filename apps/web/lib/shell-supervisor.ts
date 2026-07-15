import "server-only"

import { spawn, type IPty } from "node-pty"

const MAX_SNAPSHOT_LENGTH = 2 * 1024 * 1024
const DISCONNECT_GRACE_MS = 5_000
const encoder = new TextEncoder()

export type ShellEvent =
  | { type: "snapshot"; data: string; exitCode: number | null }
  | { type: "data"; data: string }
  | { type: "exit"; exitCode: number; signal: number | null }

type Subscriber = (event: ShellEvent) => void

type ShellSession = {
  cwd: string
  process: IPty | null
  output: string
  exitCode: number | null
  subscribers: Set<Subscriber>
  closeTimer: NodeJS.Timeout | undefined
  stopped: boolean
}

declare global {
  var piWebCodexShellSupervisor: ShellSupervisor | undefined
}

export function shellCommand(
  platform: NodeJS.Platform,
  environment: Readonly<Record<string, string | undefined>>
) {
  if (platform === "win32") {
    return {
      file: environment.ComSpec ?? environment.COMSPEC ?? "cmd.exe",
      args: [] as string[],
    }
  }
  return {
    file: environment.SHELL ?? "/bin/sh",
    args: ["-l"],
  }
}

function shellEnvironment() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  )
  environment.TERM = "xterm-256color"
  environment.COLORTERM = "truecolor"
  return environment
}

function serialize(event: ShellEvent) {
  return encoder.encode(
    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  )
}

export class ShellSupervisor {
  private readonly sessions = new Map<string, ShellSession>()

  start(sessionId: string, cwd: string, columns: number, rows: number) {
    const existing = this.sessions.get(sessionId)
    if (existing?.process) {
      existing.process.resize(columns, rows)
      if (existing.subscribers.size === 0) {
        this.scheduleStop(sessionId, existing)
      } else {
        this.keepAlive(existing)
      }
      return
    }

    const command = shellCommand(process.platform, process.env)
    const terminal = spawn(command.file, command.args, {
      cols: columns,
      rows,
      cwd,
      env: shellEnvironment(),
      name: "xterm-256color",
    })
    const session: ShellSession = existing ?? {
      cwd,
      process: null,
      output: "",
      exitCode: null,
      subscribers: new Set(),
      closeTimer: undefined,
      stopped: false,
    }
    session.cwd = cwd
    session.process = terminal
    session.output = ""
    session.exitCode = null
    session.stopped = false
    this.sessions.set(sessionId, session)

    terminal.onData((data) => {
      session.output += data
      if (session.output.length > MAX_SNAPSHOT_LENGTH) {
        session.output = `\u001bc${session.output.slice(-MAX_SNAPSHOT_LENGTH)}`
      }
      this.publish(session, { type: "data", data })
    })
    terminal.onExit(({ exitCode, signal }) => {
      if (session.stopped) return
      session.process = null
      session.exitCode = exitCode
      this.publish(session, { type: "exit", exitCode, signal: signal ?? null })
    })
    this.scheduleStop(sessionId, session)
  }

  input(sessionId: string, data: string) {
    this.requireProcess(sessionId).write(data)
  }

  resize(sessionId: string, columns: number, rows: number) {
    this.requireProcess(sessionId).resize(columns, rows)
  }

  stop(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    this.sessions.delete(sessionId)
    session.stopped = true
    if (session.closeTimer) clearTimeout(session.closeTimer)
    session.closeTimer = undefined
    session.process?.kill()
    session.process = null
    return true
  }

  stream(sessionId: string, signal: AbortSignal) {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    this.keepAlive(session)
    let subscriber: Subscriber | undefined
    let heartbeat: NodeJS.Timeout | undefined
    let removeAbortListener: (() => void) | undefined

    const cleanup = () => {
      if (heartbeat) clearInterval(heartbeat)
      if (subscriber) session.subscribers.delete(subscriber)
      removeAbortListener?.()
      subscriber = undefined
      heartbeat = undefined
      removeAbortListener = undefined
      if (session.subscribers.size === 0) this.scheduleStop(sessionId, session)
    }

    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        if (signal.aborted) {
          controller.close()
          return
        }
        controller.enqueue(encoder.encode(": connected\n\n"))
        controller.enqueue(
          serialize({
            type: "snapshot",
            data: session.output,
            exitCode: session.exitCode,
          })
        )
        subscriber = (event) => controller.enqueue(serialize(event))
        session.subscribers.add(subscriber)
        heartbeat = setInterval(
          () => controller.enqueue(encoder.encode(": heartbeat\n\n")),
          15_000
        )
        const close = () => {
          cleanup()
          controller.close()
        }
        signal.addEventListener("abort", close, { once: true })
        removeAbortListener = () => signal.removeEventListener("abort", close)
      },
      cancel: cleanup,
    })
  }

  private publish(session: ShellSession, event: ShellEvent) {
    for (const subscriber of session.subscribers) subscriber(event)
  }

  private requireProcess(sessionId: string) {
    const terminal = this.sessions.get(sessionId)?.process
    if (!terminal) throw new Error("Shell terminal is not running.")
    return terminal
  }

  private keepAlive(session: ShellSession) {
    if (session.closeTimer) clearTimeout(session.closeTimer)
    session.closeTimer = undefined
  }

  private scheduleStop(sessionId: string, session: ShellSession) {
    this.keepAlive(session)
    session.closeTimer = setTimeout(
      () => this.stop(sessionId),
      DISCONNECT_GRACE_MS
    )
  }
}

export function getShellSupervisor() {
  globalThis.piWebCodexShellSupervisor ??= new ShellSupervisor()
  return globalThis.piWebCodexShellSupervisor
}
