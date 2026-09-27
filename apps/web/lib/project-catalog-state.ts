import "server-only"

import { createHash } from "node:crypto"
import { homedir } from "node:os"
import { readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"

const PROJECT_CONFIG_DIRECTORY = ".pi"
const TRUST_REQUIRING_PROJECT_RESOURCES = [
  "settings.json",
  "extensions",
  "skills",
  "prompts",
  "themes",
  "SYSTEM.md",
  "APPEND_SYSTEM.md",
] as const

interface TrustDecision {
  path: string
  decision: boolean
}

export interface ProjectCatalogState {
  canonicalCwd: string
  canonicalAgentDir: string
  trustScope: string
  version: string
  authVersion: string
  resourceFingerprint: string
}

function digest(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex")
}

async function canonicalOrResolved(input: string) {
  try {
    return await realpath(input)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT" || code === "ENOTDIR") return path.resolve(input)
    throw error
  }
}

async function readOptionalFile(filePath: string) {
  try {
    const contents = await readFile(filePath)
    return { contents, digest: digest(contents) }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { contents: null, digest: "missing" }
    }
    throw error
  }
}

async function pathExists(target: string) {
  try {
    await stat(target)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT" || code === "ENOTDIR") return false
    throw error
  }
}

async function trustRequiringResourcesExist(cwd: string) {
  const configRoot = path.join(cwd, PROJECT_CONFIG_DIRECTORY)
  for (const name of TRUST_REQUIRING_PROJECT_RESOURCES) {
    if (await pathExists(path.join(configRoot, name))) return true
  }

  const home = await canonicalOrResolved(process.env.HOME || homedir())
  const userSkills = path.join(home, ".agents", "skills")
  let current = cwd
  for (;;) {
    const skills = path.join(current, ".agents", "skills")
    if (skills !== userSkills && (await pathExists(skills))) {
      return true
    }
    const parent = path.dirname(current)
    if (parent === current) return false
    current = parent
  }
}

function parseTrustDecision(
  contents: Buffer | null,
  canonicalCwd: string
): TrustDecision | null {
  if (contents === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(contents.toString("utf8").replace(/^\uFEFF/, ""))
  } catch (error) {
    throw new Error(
      `Failed to read project trust store: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid project trust store: expected an object.")
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== true && value !== false && value !== null) {
      throw new Error(
        `Invalid project trust store decision for ${JSON.stringify(key)}.`
      )
    }
  }

  let current = canonicalCwd
  for (;;) {
    const decision = (parsed as Record<string, unknown>)[current]
    if (decision === true || decision === false) {
      return { path: current, decision }
    }
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export async function readProjectCatalogState(
  cwd: string,
  agentDir: string
): Promise<ProjectCatalogState> {
  const [canonicalCwd, canonicalAgentDir] = await Promise.all([
    realpath(cwd),
    canonicalOrResolved(agentDir),
  ])
  const projectSettingsPath = path.join(
    canonicalCwd,
    PROJECT_CONFIG_DIRECTORY,
    "settings.json"
  )
  const trustPath = path.join(canonicalAgentDir, "trust.json")
  const [models, auth, globalSettings, projectSettings, trust] =
    await Promise.all([
      readOptionalFile(path.join(canonicalAgentDir, "models.json")),
      readOptionalFile(path.join(canonicalAgentDir, "auth.json")),
      readOptionalFile(path.join(canonicalAgentDir, "settings.json")),
      readOptionalFile(projectSettingsPath),
      readOptionalFile(trustPath),
    ])
  const trustRequired = await trustRequiringResourcesExist(canonicalCwd)
  const decision = parseTrustDecision(trust.contents, canonicalCwd)
  const trustScope = JSON.stringify({
    trustRequired,
    decision: decision
      ? { path: decision.path, trusted: decision.decision }
      : "default-policy",
  })
  const version = digest(
    JSON.stringify({
      models: models.digest,
      auth: auth.digest,
      globalSettings: globalSettings.digest,
      projectSettings: projectSettings.digest,
      trustScope,
    })
  )
  const authVersion = digest(
    JSON.stringify({
      // models.json may contain provider API keys, headers, or auth commands.
      models: models.digest,
      auth: auth.digest,
      globalSettings: globalSettings.digest,
      projectSettings: projectSettings.digest,
      trustScope,
    })
  )
  const resourceFingerprint = digest(
    JSON.stringify({
      globalSettings: globalSettings.digest,
      projectSettings: projectSettings.digest,
      trustScope,
    })
  )
  return {
    canonicalCwd,
    canonicalAgentDir,
    trustScope,
    version,
    authVersion,
    resourceFingerprint,
  }
}
