export const PROMPT_TEMPLATE_MESSAGE_TYPES = [
  "skill-loaded",
  "prompt-template-subagent",
  "prompt-template-deterministic",
  "prompt-template-deterministic-complete",
] as const

export const PROMPT_TEMPLATE_STATUS_KEYS = [
  "prompt-subagent",
  "prompt-loop",
  "prompt-chain",
] as const

export type PromptTemplateMessageType =
  (typeof PROMPT_TEMPLATE_MESSAGE_TYPES)[number]
export type PromptTemplateStatusKey =
  (typeof PROMPT_TEMPLATE_STATUS_KEYS)[number]

interface UsageSummary {
  turns: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
  model?: string
}

interface ParallelResult {
  agent: string
  text: string
  toolCalls: string[]
  isError: boolean
  errorText?: string
}

export interface SkillLoadedState {
  kind: "skill"
  skillName: string
  skillPath: string
  skillContent: string
}

export interface SubagentState {
  kind: "subagent"
  agent: string
  context?: "fresh" | "fork"
  task?: string
  model?: string
  text: string
  toolCalls: string[]
  usage: UsageSummary
  parallelResults: ParallelResult[]
}

export interface CapturedOutputState {
  text: string
  totalChars: number
  totalLines: number
  truncated: boolean
}

export interface DeterministicState {
  kind: "deterministic"
  command: string
  cwd: string
  resolvedScriptPath?: string
  nonInteractive: boolean
  exitCode: number
  signal?: string
  stdout: CapturedOutputState
  stderr: CapturedOutputState
  durationMs: number
  timedOut: boolean
}

export interface DeterministicCompleteState {
  kind: "deterministic-complete"
  promptName: string
  exitCode: number
  timedOut: boolean
  status: "succeeded" | "failed"
}

export type PromptTemplateMessageState =
  | SkillLoadedState
  | SubagentState
  | DeterministicState
  | DeterministicCompleteState

export interface PromptTemplateStatusState {
  key: PromptTemplateStatusKey
  label: string
  text: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function messageFromPayload(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.message)) return undefined
  return payload.message
}

function textContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .filter(
      (part): part is Record<string, unknown> =>
        isRecord(part) && part.type === "text" && typeof part.text === "string"
    )
    .map((part) => part.text)
    .join("\n")
}

function messages(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function assistantText(value: unknown) {
  const items = messages(value)
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const message = items[index]
    if (message?.role !== "assistant") continue
    const text = textContent(message.content)
    if (text.trim()) return text
  }
  return ""
}

function formatToolCall(name: string, args: Record<string, unknown>) {
  const path = args.path ?? args.file_path
  switch (name) {
    case "bash": {
      const command = String(args.command ?? "")
        .replaceAll(/[\n\t]/g, " ")
        .trim()
      return `$ ${command.length > 100 ? `${command.slice(0, 100)}…` : command}`
    }
    case "read":
    case "write":
    case "edit":
      return `[${name}: ${String(path ?? "")}]`
    case "grep":
      return `[grep: /${String(args.pattern ?? "")}/ in ${String(path ?? ".")}]`
    case "find":
      return `[find: ${String(args.pattern ?? "")} in ${String(path ?? ".")}]`
    case "ls":
      return `[ls: ${String(path ?? ".")}]`
    default: {
      const encoded = JSON.stringify(args)
      const preview = encoded.length > 80 ? `${encoded.slice(0, 80)}…` : encoded
      return `[${name}: ${preview}]`
    }
  }
}

function toolCalls(value: unknown) {
  const calls: string[] = []
  for (const message of messages(value)) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      continue
    }
    for (const part of message.content) {
      if (
        !isRecord(part) ||
        part.type !== "toolCall" ||
        typeof part.name !== "string"
      ) {
        continue
      }
      calls.push(
        formatToolCall(
          part.name,
          isRecord(part.arguments) ? part.arguments : {}
        )
      )
    }
  }
  return calls
}

function usageSummary(value: unknown): UsageSummary {
  const summary: UsageSummary = {
    turns: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  }
  for (const message of messages(value)) {
    if (message.role !== "assistant") continue
    summary.turns += 1
    if (typeof message.model === "string") summary.model = message.model
    if (!isRecord(message.usage)) continue
    if (isFiniteNumber(message.usage.input)) {
      summary.input += message.usage.input
    }
    if (isFiniteNumber(message.usage.output)) {
      summary.output += message.usage.output
    }
    if (isFiniteNumber(message.usage.cacheRead)) {
      summary.cacheRead += message.usage.cacheRead
    }
    if (isFiniteNumber(message.usage.cacheWrite)) {
      summary.cacheWrite += message.usage.cacheWrite
    }
    if (
      isRecord(message.usage.cost) &&
      isFiniteNumber(message.usage.cost.total)
    ) {
      summary.cost += message.usage.cost.total
    }
  }
  return summary
}

function skillLoadedState(
  message: Record<string, unknown>
): SkillLoadedState | undefined {
  if (!isRecord(message.details)) return undefined
  const { skillName, skillPath, skillContent } = message.details
  if (
    typeof skillName !== "string" ||
    typeof skillPath !== "string" ||
    typeof skillContent !== "string"
  ) {
    return undefined
  }
  return { kind: "skill", skillName, skillPath, skillContent }
}

function subagentState(message: Record<string, unknown>): SubagentState {
  const details = isRecord(message.details) ? message.details : {}
  const parallelValues = Array.isArray(details.parallelResults)
    ? details.parallelResults
    : []
  const parallelResults = parallelValues.flatMap<ParallelResult>(
    (value, index) => {
      if (!isRecord(value)) return []
      const resultMessages = messages(value.messages)
      return [
        {
          agent: optionalString(value.agent) ?? `task-${index + 1}`,
          text: assistantText(resultMessages),
          toolCalls: toolCalls(resultMessages),
          isError: value.isError === true,
          ...(optionalString(value.errorText)
            ? { errorText: value.errorText as string }
            : {}),
        },
      ]
    }
  )
  const sessionMessages = parallelResults.length
    ? parallelValues.flatMap((value) =>
        isRecord(value) ? messages(value.messages) : []
      )
    : messages(details.messages)
  const context =
    details.context === "fresh" || details.context === "fork"
      ? details.context
      : undefined
  const model = optionalString(details.model)
  return {
    kind: "subagent",
    agent:
      parallelResults.length > 0
        ? "parallel"
        : (optionalString(details.agent) ?? "delegate"),
    ...(context ? { context } : {}),
    ...(optionalString(details.task) ? { task: details.task as string } : {}),
    ...(model ? { model } : {}),
    text: textContent(message.content),
    toolCalls: toolCalls(sessionMessages),
    usage: usageSummary(sessionMessages),
    parallelResults,
  }
}

function deterministicCommand(
  execution: Record<string, unknown>,
  resolvedScriptPath: string | undefined
) {
  if (execution.kind === "run" && typeof execution.command === "string") {
    return execution.command
  }
  if (
    execution.kind === "command" &&
    typeof execution.command === "string" &&
    Array.isArray(execution.args) &&
    execution.args.every((arg) => typeof arg === "string")
  ) {
    return [execution.command, ...execution.args].join(" ")
  }
  if (
    execution.kind === "script" &&
    typeof execution.path === "string" &&
    Array.isArray(execution.args) &&
    execution.args.every((arg) => typeof arg === "string")
  ) {
    return [resolvedScriptPath ?? execution.path, ...execution.args].join(" ")
  }
  return undefined
}

function capturedOutput(
  details: Record<string, unknown>,
  name: "stdout" | "stderr"
): CapturedOutputState | undefined {
  const text = details[name]
  const totalChars = details[`${name}TotalChars`]
  const totalLines = details[`${name}TotalLines`]
  const truncated = details[`${name}Truncated`]
  if (
    typeof text !== "string" ||
    !isFiniteNumber(totalChars) ||
    !isFiniteNumber(totalLines) ||
    typeof truncated !== "boolean"
  ) {
    return undefined
  }
  return { text, totalChars, totalLines, truncated }
}

function deterministicState(
  message: Record<string, unknown>
): DeterministicState | undefined {
  if (!isRecord(message.details)) return undefined
  const details = message.details
  if (!isRecord(details.execution)) return undefined
  const execution = details.execution
  const resolvedScriptPath = optionalString(details.resolvedScriptPath)
  const command = deterministicCommand(execution, resolvedScriptPath)
  const stdout = capturedOutput(details, "stdout")
  const stderr = capturedOutput(details, "stderr")
  if (
    !command ||
    typeof details.cwd !== "string" ||
    typeof details.nonInteractive !== "boolean" ||
    !isFiniteNumber(details.exitCode) ||
    !stdout ||
    !stderr ||
    !isFiniteNumber(details.durationMs) ||
    typeof details.timedOut !== "boolean"
  ) {
    return undefined
  }
  const signal = optionalString(details.signal)
  return {
    kind: "deterministic",
    command,
    cwd: details.cwd,
    ...(resolvedScriptPath ? { resolvedScriptPath } : {}),
    nonInteractive: details.nonInteractive,
    exitCode: details.exitCode,
    ...(signal ? { signal } : {}),
    stdout,
    stderr,
    durationMs: details.durationMs,
    timedOut: details.timedOut,
  }
}

function deterministicCompleteState(
  message: Record<string, unknown>
): DeterministicCompleteState | undefined {
  if (!isRecord(message.details)) return undefined
  const { promptName, exitCode, timedOut, status } = message.details
  if (
    typeof promptName !== "string" ||
    !isFiniteNumber(exitCode) ||
    typeof timedOut !== "boolean" ||
    (status !== "succeeded" && status !== "failed")
  ) {
    return undefined
  }
  return {
    kind: "deterministic-complete",
    promptName,
    exitCode,
    timedOut,
    status,
  }
}

export function promptTemplateMessageState(
  customType: PromptTemplateMessageType,
  payload: unknown
): PromptTemplateMessageState | undefined {
  const message = messageFromPayload(payload)
  if (!message) return undefined
  switch (customType) {
    case "skill-loaded":
      return skillLoadedState(message)
    case "prompt-template-subagent":
      return subagentState(message)
    case "prompt-template-deterministic":
      return deterministicState(message)
    case "prompt-template-deterministic-complete":
      return deterministicCompleteState(message)
  }
}

const statusLabels: Record<PromptTemplateStatusKey, string> = {
  "prompt-subagent": "Subagent",
  "prompt-loop": "Prompt loop",
  "prompt-chain": "Prompt chain",
}

// Status strings can contain Pi theme escape sequences.
/* eslint-disable no-control-regex */
const ANSI_ESCAPE_SEQUENCE =
  /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\)|[@-_])|\u009B[0-?]*[ -/]*[@-~]/g
/* eslint-enable no-control-regex */

export function promptTemplateStatusState(
  key: PromptTemplateStatusKey,
  payload: unknown
): PromptTemplateStatusState | undefined {
  if (
    !isRecord(payload) ||
    typeof payload.statusText !== "string" ||
    payload.statusText.length === 0
  ) {
    return undefined
  }
  const text = payload.statusText.replace(ANSI_ESCAPE_SEQUENCE, "").trim()
  return text ? { key, label: statusLabels[key], text } : undefined
}

function isUsageSummary(value: unknown): value is UsageSummary {
  return (
    isRecord(value) &&
    isFiniteNumber(value.turns) &&
    isFiniteNumber(value.input) &&
    isFiniteNumber(value.output) &&
    isFiniteNumber(value.cacheRead) &&
    isFiniteNumber(value.cacheWrite) &&
    isFiniteNumber(value.cost) &&
    (value.model === undefined || typeof value.model === "string")
  )
}

function isCapturedOutput(value: unknown): value is CapturedOutputState {
  return (
    isRecord(value) &&
    typeof value.text === "string" &&
    isFiniteNumber(value.totalChars) &&
    isFiniteNumber(value.totalLines) &&
    typeof value.truncated === "boolean"
  )
}

function isParallelResult(value: unknown): value is ParallelResult {
  return (
    isRecord(value) &&
    typeof value.agent === "string" &&
    typeof value.text === "string" &&
    Array.isArray(value.toolCalls) &&
    value.toolCalls.every((call) => typeof call === "string") &&
    typeof value.isError === "boolean" &&
    (value.errorText === undefined || typeof value.errorText === "string")
  )
}

export function parsePromptTemplateMessageState(
  value: unknown
): PromptTemplateMessageState {
  if (!isRecord(value)) {
    throw new TypeError("Invalid prompt-template message state.")
  }
  if (
    value.kind === "skill" &&
    typeof value.skillName === "string" &&
    typeof value.skillPath === "string" &&
    typeof value.skillContent === "string"
  ) {
    return value as unknown as SkillLoadedState
  }
  if (
    value.kind === "subagent" &&
    typeof value.agent === "string" &&
    typeof value.text === "string" &&
    Array.isArray(value.toolCalls) &&
    value.toolCalls.every((call) => typeof call === "string") &&
    isUsageSummary(value.usage) &&
    Array.isArray(value.parallelResults) &&
    value.parallelResults.every(isParallelResult) &&
    (value.context === undefined ||
      value.context === "fresh" ||
      value.context === "fork") &&
    (value.task === undefined || typeof value.task === "string") &&
    (value.model === undefined || typeof value.model === "string")
  ) {
    return value as unknown as SubagentState
  }
  if (
    value.kind === "deterministic" &&
    typeof value.command === "string" &&
    typeof value.cwd === "string" &&
    (value.resolvedScriptPath === undefined ||
      typeof value.resolvedScriptPath === "string") &&
    typeof value.nonInteractive === "boolean" &&
    isFiniteNumber(value.exitCode) &&
    (value.signal === undefined || typeof value.signal === "string") &&
    isCapturedOutput(value.stdout) &&
    isCapturedOutput(value.stderr) &&
    isFiniteNumber(value.durationMs) &&
    typeof value.timedOut === "boolean"
  ) {
    return value as unknown as DeterministicState
  }
  if (
    value.kind === "deterministic-complete" &&
    typeof value.promptName === "string" &&
    isFiniteNumber(value.exitCode) &&
    typeof value.timedOut === "boolean" &&
    (value.status === "succeeded" || value.status === "failed")
  ) {
    return value as unknown as DeterministicCompleteState
  }
  throw new TypeError("Invalid prompt-template message state.")
}

export function parsePromptTemplateStatusState(
  value: unknown
): PromptTemplateStatusState {
  if (
    !isRecord(value) ||
    !(PROMPT_TEMPLATE_STATUS_KEYS as readonly unknown[]).includes(value.key) ||
    typeof value.label !== "string" ||
    typeof value.text !== "string"
  ) {
    throw new TypeError("Invalid prompt-template status state.")
  }
  return value as unknown as PromptTemplateStatusState
}
