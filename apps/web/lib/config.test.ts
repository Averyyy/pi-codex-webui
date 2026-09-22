import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { PATCH as patchSettings } from "../app/api/v1/settings/route"
import { getMutationToken } from "./request-security"
import {
  getManagedInstancePort,
  InstancePortConfigurationError,
  loadConfig,
  ManagedInstancePortError,
  patchConfig,
} from "./config"

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

test("managed instances project and persist their bound port per config root", async () => {
  const firstRoot = await mkdtemp(path.join(tmpdir(), "pi-web-codex-instance-"))
  const secondRoot = await mkdtemp(
    path.join(tmpdir(), "pi-web-codex-instance-")
  )
  const previousRoot = process.env.PI_WEB_CODEX_CONFIG_DIR
  const previousPort = process.env.PI_WEB_CODEX_INSTANCE_PORT

  try {
    process.env.PI_WEB_CODEX_INSTANCE_PORT = "1818"
    process.env.PI_WEB_CODEX_CONFIG_DIR = firstRoot

    const firstInitial = await loadConfig()
    assert.equal(firstInitial.server.port, 1818)

    const firstSaved = await patchConfig(0, {
      developer: {
        runtime: {
          default: "pi",
          profiles: {
            pi: { kind: "pi", enabled: true },
            "pi-client-default": {
              kind: "pi-client",
              enabled: true,
              serverUrl: "http://127.0.0.1:4217",
              authTokenRef: null,
            },
          },
        },
      },
    })
    assert.equal(firstSaved.server.port, 1818)
    const firstClientProfile =
      firstSaved.developer.runtime.profiles["pi-client-default"]
    assert.ok(firstClientProfile?.kind === "pi-client")
    assert.equal(firstClientProfile.serverUrl, "http://127.0.0.1:4217")

    const persisted = JSON.parse(
      await readFile(path.join(firstRoot, "config.json"), "utf8")
    ) as { server: { port: number } }
    assert.equal(persisted.server.port, 1818)

    process.env.PI_WEB_CODEX_INSTANCE_PORT = "1819"
    process.env.PI_WEB_CODEX_CONFIG_DIR = secondRoot
    const secondInitial = await loadConfig()
    assert.equal(secondInitial.server.port, 1819)
    const secondSaved = await patchConfig(0, {
      server: { openBrowser: false },
    })
    assert.equal(secondSaved.server.port, 1819)
    assert.equal(secondSaved.server.openBrowser, false)

    process.env.PI_WEB_CODEX_INSTANCE_PORT = "1818"
    process.env.PI_WEB_CODEX_CONFIG_DIR = firstRoot
    const firstRestarted = await loadConfig()
    assert.equal(firstRestarted.server.port, 1818)
    assert.equal(firstRestarted.revision, 1)
    const restartedClientProfile =
      firstRestarted.developer.runtime.profiles["pi-client-default"]
    assert.ok(restartedClientProfile?.kind === "pi-client")
    assert.equal(restartedClientProfile.serverUrl, "http://127.0.0.1:4217")
  } finally {
    restoreEnv("PI_WEB_CODEX_CONFIG_DIR", previousRoot)
    restoreEnv("PI_WEB_CODEX_INSTANCE_PORT", previousPort)
    await Promise.all([
      rm(firstRoot, { recursive: true, force: true }),
      rm(secondRoot, { recursive: true, force: true }),
    ])
  }
})

test("managed instances reject port changes and malformed port contracts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-codex-instance-"))
  const previousRoot = process.env.PI_WEB_CODEX_CONFIG_DIR
  const previousPort = process.env.PI_WEB_CODEX_INSTANCE_PORT

  try {
    process.env.PI_WEB_CODEX_CONFIG_DIR = root
    process.env.PI_WEB_CODEX_INSTANCE_PORT = "1818"
    const current = await loadConfig()

    await assert.rejects(
      () => patchConfig(current.revision, { server: { port: 1819 } }),
      (error: unknown) => {
        assert.ok(error instanceof ManagedInstancePortError)
        assert.equal(error.managedPort, 1818)
        assert.equal(error.requestedPort, 1819)
        return true
      }
    )

    for (const invalid of ["", "0", "65536", "18.18", " 1818"]) {
      process.env.PI_WEB_CODEX_INSTANCE_PORT = invalid
      assert.throws(
        () => getManagedInstancePort(),
        (error: unknown) => error instanceof InstancePortConfigurationError
      )
    }
  } finally {
    restoreEnv("PI_WEB_CODEX_CONFIG_DIR", previousRoot)
    restoreEnv("PI_WEB_CODEX_INSTANCE_PORT", previousPort)
    await rm(root, { recursive: true, force: true })
  }
})

test("settings API reports managed port changes as an explicit validation error", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-codex-instance-"))
  const previousRoot = process.env.PI_WEB_CODEX_CONFIG_DIR
  const previousPort = process.env.PI_WEB_CODEX_INSTANCE_PORT

  try {
    process.env.PI_WEB_CODEX_CONFIG_DIR = root
    process.env.PI_WEB_CODEX_INSTANCE_PORT = "1818"
    const current = await loadConfig()
    const host = "127.0.0.1:1818"
    const response = await patchSettings(
      new Request(`http://${host}/api/v1/settings`, {
        method: "PATCH",
        headers: {
          host,
          origin: `http://${host}`,
          "content-type": "application/json",
          "if-match": `"revision-${current.revision}"`,
          "x-pi-web-codex-mutation-token": getMutationToken(),
        },
        body: JSON.stringify({ server: { port: 1819 } }),
      })
    )

    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), {
      error:
        "The server port is managed by the CLI for this instance (1818); requested port 1819 is not allowed.",
      code: "ManagedInstancePort",
    })
  } finally {
    restoreEnv("PI_WEB_CODEX_CONFIG_DIR", previousRoot)
    restoreEnv("PI_WEB_CODEX_INSTANCE_PORT", previousPort)
    await rm(root, { recursive: true, force: true })
  }
})

test("unmanaged development settings keep their configured port", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-codex-instance-"))
  const previousRoot = process.env.PI_WEB_CODEX_CONFIG_DIR
  const previousPort = process.env.PI_WEB_CODEX_INSTANCE_PORT

  try {
    process.env.PI_WEB_CODEX_CONFIG_DIR = root
    delete process.env.PI_WEB_CODEX_INSTANCE_PORT

    const initial = await loadConfig()
    assert.equal(initial.server.port, 1816)
    const saved = await patchConfig(initial.revision, {
      server: { port: 1820 },
    })
    assert.equal(saved.server.port, 1820)
    assert.equal((await loadConfig()).server.port, 1820)
  } finally {
    restoreEnv("PI_WEB_CODEX_CONFIG_DIR", previousRoot)
    restoreEnv("PI_WEB_CODEX_INSTANCE_PORT", previousPort)
    await rm(root, { recursive: true, force: true })
  }
})
