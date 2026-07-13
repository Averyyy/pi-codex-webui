import "server-only"

import { randomUUID } from "node:crypto"
import { mkdir, open, readFile, rename, rm } from "node:fs/promises"
import path from "node:path"

import { getAppPaths } from "./app-paths"

function secretPath(reference: string) {
  return path.join(getAppPaths().secrets, `${reference}.secret`)
}

export async function readSecret(reference: string) {
  return readFile(secretPath(reference), "utf8")
}

export async function writeSecret(value: string, reference = randomUUID()) {
  const { secrets } = getAppPaths()
  await mkdir(secrets, { recursive: true, mode: 0o700 })
  const destination = secretPath(reference)
  const temporary = `${destination}.${randomUUID()}.tmp`
  const file = await open(temporary, "wx", 0o600)
  try {
    await file.writeFile(value, "utf8")
    await file.sync()
  } finally {
    await file.close()
  }

  try {
    await rename(temporary, destination)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
  return reference
}

export async function removeSecret(reference: string) {
  await rm(secretPath(reference), { force: true })
}
