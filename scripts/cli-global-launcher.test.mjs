import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  ensureCanonicalGlobal,
  packageVersion,
  updateRunningServer,
} from "../bin/global-launcher.mjs"

const APP_NAME = "pi-web-codex"

async function temporaryPackage(version) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-global-launcher-"))
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: APP_NAME, version })
  )
  return root
}

test("global bridge never downgrades an existing canonical install", async () => {
  const calls = []
  const result = await ensureCanonicalGlobal({
    packageRoot: "C:\\extension",
    version: "1.0.0",
    env: {},
    resolveGlobal: async () => ({
      root: "C:\\global\\node_modules",
      prefix: "C:\\global",
      packageRoot: "C:\\global\\node_modules\\pi-web-codex",
    }),
    verifyRuntime: async () => ({
      root: "C:\\global\\node_modules\\pi-web-codex",
      version: "1.1.0",
      cliPath: "C:\\global\\node_modules\\pi-web-codex\\bin\\pi-web-codex.mjs",
    }),
    npmCommand: async (...args) => calls.push(args),
  })

  assert.equal(result.version, "1.1.0")
  assert.equal(result.installed, false)
  assert.equal(calls.length, 0)
})

test("global bridge bootstraps a missing package at the exact official version", async () => {
  const calls = []
  let verifyCalls = 0
  const result = await ensureCanonicalGlobal({
    packageRoot: "C:\\extension",
    version: "1.0.0",
    env: {},
    resolveGlobal: async () => ({
      root: "C:\\global\\node_modules",
      prefix: "C:\\global",
      packageRoot: "C:\\global\\node_modules\\pi-web-codex",
    }),
    verifyRuntime: async (_root, expected) => {
      verifyCalls += 1
      if (verifyCalls === 1)
        throw Object.assign(new Error("missing"), { code: "ENOENT" })
      return {
        root: _root,
        version: expected,
        cliPath: "C:\\global\\pi-web-codex.mjs",
      }
    },
    npmCommand: async (...args) => calls.push(args),
  })

  assert.equal(result.version, "1.0.0")
  assert.equal(result.installed, true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0][0], [
    "install",
    "--global",
    "--prefix",
    "C:\\global",
    "--force",
    "--ignore-scripts",
    "--omit=peer",
    "--no-audit",
    "--no-fund",
    "--registry",
    "https://registry.npmjs.org",
    "pi-web-codex@1.0.0",
  ])
  assert.equal(
    calls[0][1].env.npm_config_registry,
    "https://registry.npmjs.org"
  )
  assert.deepEqual(calls[0][0].slice(0, 4), [
    "install",
    "--global",
    "--prefix",
    "C:\\global",
  ])
})

test("running old servers use the authenticated update API and exact health target", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-running-update-"))
  try {
    await mkdir(path.join(root, "secrets"), { recursive: true })
    await writeFile(path.join(root, "secrets", "mutation-token"), "token\n")
    const requests = []
    let healthVersion = "1.0.0"
    const fetcher = async (url, init) => {
      requests.push({ url, init })
      if (url.endsWith("/api/v1/update")) {
        if (init?.method !== "POST") {
          return Response.json({
            supported: true,
            currentVersion: "1.1.0",
            latestVersion: "1.1.0",
            available: false,
            phase: "succeeded",
            error: null,
            operationId: "op-1",
          })
        }
        return Response.json(
          {
            supported: true,
            currentVersion: "1.0.0",
            latestVersion: "1.1.0",
            available: true,
            phase: "installing",
            error: null,
            operationId: "op-1",
          },
          { status: 202 }
        )
      }
      healthVersion = "1.1.0"
      return Response.json({ name: APP_NAME, version: healthVersion })
    }
    const health = await updateRunningServer({
      configRootPath: root,
      url: "http://127.0.0.1:1816",
      targetVersion: "1.1.0",
      fetchImpl: fetcher,
      sleep: async () => {},
    })

    assert.equal(health.version, "1.1.0")
    assert.equal(
      requests[0].init.headers["X-Pi-Web-Codex-Mutation-Token"],
      "token"
    )
    assert.equal(requests[0].init.headers.Origin, "http://127.0.0.1:1816")
    assert.deepEqual(JSON.parse(requests[0].init.body), { version: "1.1.0" })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("running update surfaces a supervisor failure before waiting for health", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-failed-update-"))
  try {
    await mkdir(path.join(root, "secrets"), { recursive: true })
    await writeFile(path.join(root, "secrets", "mutation-token"), "token\n")
    await assert.rejects(
      updateRunningServer({
        configRootPath: root,
        url: "http://127.0.0.1:1816",
        targetVersion: "1.1.0",
        fetchImpl: async (url, init) => {
          if (init?.method === "POST") {
            return Response.json(
              {
                supported: true,
                currentVersion: "1.0.0",
                latestVersion: "1.1.0",
                available: true,
                phase: "installing",
                error: null,
                operationId: "op-1",
              },
              { status: 202 }
            )
          }
          if (url.endsWith("/api/v1/update")) {
            return Response.json({
              supported: true,
              currentVersion: "1.0.0",
              latestVersion: "1.1.0",
              available: true,
              phase: "failed",
              error: "candidate health failed",
              operationId: "op-1",
            })
          }
          throw new Error("health must not be queried after known failure")
        },
      }),
      /update failed: candidate health failed/
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("legacy running servers return an actionable error without being stopped", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-legacy-update-"))
  try {
    await mkdir(path.join(root, "secrets"), { recursive: true })
    await writeFile(path.join(root, "secrets", "mutation-token"), "token\n")
    await assert.rejects(
      updateRunningServer({
        configRootPath: root,
        url: "http://127.0.0.1:1816",
        targetVersion: "1.1.0",
        fetchImpl: async () => new Response("not found", { status: 404 }),
      }),
      /cannot perform a coordinated update.*service was left untouched/
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("a live instance lock blocks global mutation when health is unavailable", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-live-lock-"))
  const extension = await temporaryPackage("1.1.0")
  try {
    await mkdir(path.join(root, "locks"), { recursive: true })
    await writeFile(
      path.join(root, "locks", "instance.lock"),
      JSON.stringify({ pid: process.pid })
    )
    await assert.rejects(
      import("../bin/global-launcher.mjs").then(({ launchGlobalWebHost }) =>
        launchGlobalWebHost({
          packageRoot: extension,
          env: { PI_WEB_CODEX_CONFIG_DIR: root },
          fetchImpl: async () => {
            throw new TypeError("connection refused")
          },
          resolveGlobal: async () => ({
            root: path.join(root, "global", "node_modules"),
            prefix: path.join(root, "global"),
            packageRoot: path.join(root, "global", "node_modules", APP_NAME),
          }),
          verifyRuntime: async () => ({
            root: path.join(root, "global", "node_modules", APP_NAME),
            version: "1.0.0",
            cliPath: path.join(root, "global", "pi-web-codex.mjs"),
          }),
        })
      ),
      /owns.*health is unavailable.*[Rr]efusing to modify/
    )
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(extension, { recursive: true, force: true })
  }
})

test("a running service must match the verified canonical global version", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-identity-"))
  const extension = await temporaryPackage("1.1.0")
  try {
    const globalPackageRoot = path.join(
      root,
      "global",
      "node_modules",
      APP_NAME
    )
    await assert.rejects(
      import("../bin/global-launcher.mjs").then(({ launchGlobalWebHost }) =>
        launchGlobalWebHost({
          packageRoot: extension,
          env: { PI_WEB_CODEX_CONFIG_DIR: root },
          fetchImpl: async (url) =>
            Response.json({ name: APP_NAME, version: "1.0.0" }),
          resolveGlobal: async () => ({
            root: path.dirname(globalPackageRoot),
            prefix: path.join(root, "global"),
            packageRoot: globalPackageRoot,
          }),
          verifyRuntime: async () => ({
            root: globalPackageRoot,
            version: "0.9.0",
            cliPath: path.join(globalPackageRoot, "bin", "pi-web-codex.mjs"),
          }),
        })
      ),
      /reports version 1\.0\.0.*canonical global package is 0\.9\.0/
    )
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(extension, { recursive: true, force: true })
  }
})

test("extension package manifests expose the exact stable version", async () => {
  const root = await temporaryPackage("1.2.3")
  try {
    assert.equal(await packageVersion(root), "1.2.3")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
