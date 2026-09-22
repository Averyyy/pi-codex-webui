import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  DEFAULT_INSTANCE_ID,
  DEFAULT_PORT,
  clearInstanceDaemon,
  findInstance,
  findInstanceByPort,
  instanceConfigDirectory,
  instanceDirectory,
  instanceIdForPort,
  makeInstance,
  readRegistry,
  registryFile,
  registryLockFile,
  registryRecoveryFile,
  registrySummary,
  setInstanceDaemon,
  updateRegistry,
  validateRegistry,
  withRegistryLock,
} from "../bin/instance-registry.mjs"

function deferred() {
  let resolve
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

async function temporaryRegistry() {
  return mkdtemp(path.join(tmpdir(), "pi-web-codex-registry-test-"))
}

test("instance registry validates IDs, ports, config roots, and record invariants", async () => {
  const root = await temporaryRegistry()
  const configRoot = path.join(root, "default-config")
  try {
    const defaultInstance = makeInstance({
      id: DEFAULT_INSTANCE_ID,
      port: DEFAULT_PORT,
      configRoot,
    })
    const alternateInstance = makeInstance({
      id: "1818",
      port: 1818,
      configRoot: path.join(root, "alternate-config"),
    })
    assert.equal(defaultInstance.status, "stopped")
    assert.equal(defaultInstance.daemon, null)
    assert.equal(instanceIdForPort(DEFAULT_PORT), DEFAULT_INSTANCE_ID)
    assert.equal(instanceIdForPort(1818), "1818")
    assert.equal(
      instanceDirectory(root, "1818"),
      path.join(root, "instances", "1818")
    )
    assert.equal(
      instanceConfigDirectory(root, "1818"),
      path.join(root, "instances", "1818", "config")
    )

    const registry = validateRegistry({
      version: 1,
      defaultId: DEFAULT_INSTANCE_ID,
      instances: [defaultInstance, alternateInstance],
    })
    assert.deepEqual(
      findInstance(registry, DEFAULT_INSTANCE_ID),
      defaultInstance
    )
    assert.deepEqual(findInstanceByPort(registry, 1818), alternateInstance)
    assert.deepEqual(registrySummary(registry), {
      defaultInstanceId: DEFAULT_INSTANCE_ID,
      instances: [
        {
          id: DEFAULT_INSTANCE_ID,
          port: DEFAULT_PORT,
          status: "stopped",
          configDir: defaultInstance.configRoot,
        },
        {
          id: "1818",
          port: 1818,
          status: "stopped",
          configDir: alternateInstance.configRoot,
        },
      ],
    })

    for (const id of ["", ".", "..", "a/b", "a\\b", "a\0b"]) {
      assert.throws(
        () => makeInstance({ id, port: 1820, configRoot }),
        /Invalid .* instance ID/
      )
    }
    for (const port of [0, -1, 1.5, 65_536, Number.NaN]) {
      assert.throws(
        () => makeInstance({ id: "invalid-port", port, configRoot }),
        /Port must be an integer between 1 and 65535/
      )
    }
    for (const invalidRoot of ["relative/config", "", "."]) {
      assert.throws(
        () =>
          makeInstance({
            id: "invalid-root",
            port: 1820,
            configRoot: invalidRoot,
          }),
        /Instance config root must be an absolute path/
      )
    }

    assert.throws(
      () =>
        validateRegistry({
          version: 1,
          defaultId: DEFAULT_INSTANCE_ID,
          instances: [
            defaultInstance,
            { ...alternateInstance, id: DEFAULT_INSTANCE_ID },
          ],
        }),
      /duplicates ID/
    )
    assert.throws(
      () =>
        validateRegistry({
          version: 1,
          defaultId: DEFAULT_INSTANCE_ID,
          instances: [
            defaultInstance,
            { ...alternateInstance, port: DEFAULT_PORT },
          ],
        }),
      /duplicates port/
    )
    assert.throws(
      () =>
        validateRegistry({
          version: 1,
          defaultId: DEFAULT_INSTANCE_ID,
          instances: [
            defaultInstance,
            { ...alternateInstance, configRoot: defaultInstance.configRoot },
          ],
        }),
      /reuses config directory|duplicates config root/
    )
    assert.throws(
      () =>
        validateRegistry({
          version: 1,
          defaultId: DEFAULT_INSTANCE_ID,
          instances: [{ ...defaultInstance, status: "running", daemon: null }],
        }),
      /missing daemon metadata/
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("instance records persist by ID and keep the default selection stable", async () => {
  const root = await temporaryRegistry()
  try {
    const defaultConfig = path.join(root, "config-default")
    const alternateConfig = path.join(root, "config-1818")
    const persisted = await updateRegistry(root, (registry) => ({
      ...registry,
      instances: [
        makeInstance({
          id: DEFAULT_INSTANCE_ID,
          port: DEFAULT_PORT,
          configRoot: defaultConfig,
        }),
        makeInstance({ id: "1818", port: 1818, configRoot: alternateConfig }),
      ],
    }))
    assert.equal(persisted.defaultId, DEFAULT_INSTANCE_ID)
    assert.equal(
      findInstance(persisted, DEFAULT_INSTANCE_ID)?.configRoot,
      defaultConfig
    )
    assert.equal(
      findInstanceByPort(persisted, 1818)?.configRoot,
      alternateConfig
    )

    const running = await updateRegistry(root, (registry) => ({
      ...registry,
      instances: registry.instances.map((instance) =>
        instance.id === "1818"
          ? setInstanceDaemon(instance, {
              pid: process.pid,
              controlUrl: "http://127.0.0.1:49181",
              controlToken: "registry-test-token",
              startedAt: new Date().toISOString(),
            })
          : instance
      ),
    }))
    assert.equal(findInstance(running, "1818")?.status, "running")

    const stopped = await updateRegistry(root, (registry) => ({
      ...registry,
      instances: registry.instances.map((instance) =>
        instance.id === "1818" ? clearInstanceDaemon(instance) : instance
      ),
    }))
    assert.equal(findInstance(stopped, "1818")?.status, "stopped")
    assert.equal(findInstance(stopped, "1818")?.daemon, null)

    const reloaded = await readRegistry(root)
    assert.deepEqual(registrySummary(reloaded), {
      defaultInstanceId: DEFAULT_INSTANCE_ID,
      instances: [
        {
          id: DEFAULT_INSTANCE_ID,
          port: DEFAULT_PORT,
          status: "stopped",
          configDir: defaultConfig,
        },
        {
          id: "1818",
          port: 1818,
          status: "stopped",
          configDir: alternateConfig,
        },
      ],
    })
    assert.deepEqual(
      JSON.parse(await readFile(registryFile(root), "utf8")),
      reloaded
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("registry lock serializes concurrent updates and recovers a dead owner", async () => {
  const root = await temporaryRegistry()
  try {
    await mkdir(root, { recursive: true })
    await writeFile(
      registryLockFile(root),
      `${JSON.stringify({ pid: 99_999_999, token: "stale-owner" })}\n`
    )

    const firstEntered = deferred()
    let secondEntered = false
    const releaseFirst = deferred()
    const first = withRegistryLock(root, async () => {
      firstEntered.resolve()
      await releaseFirst.promise
    })
    let second
    try {
      let firstEntryTimer
      const firstEntryTimeout = new Promise((_, reject) => {
        firstEntryTimer = setTimeout(
          () =>
            reject(new Error("Timed out waiting for the first registry lock.")),
          1_000
        )
      })
      try {
        await Promise.race([
          firstEntered.promise,
          first.then(() => {
            throw new Error("The first registry lock released before entering.")
          }),
          firstEntryTimeout,
        ])
      } finally {
        clearTimeout(firstEntryTimer)
      }

      second = withRegistryLock(root, async () => {
        secondEntered = true
      })

      await new Promise((resolve) => setTimeout(resolve, 250))
      assert.equal(secondEntered, false)
      releaseFirst.resolve()
      await Promise.all([first, second])
      assert.equal(secondEntered, true)
    } finally {
      releaseFirst.resolve()
      await Promise.allSettled([first, ...(second ? [second] : [])])
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("concurrent registry transactions retain every instance", async () => {
  const root = await temporaryRegistry()
  try {
    const transactions = Array.from({ length: 20 }, (_, index) =>
      updateRegistry(root, (registry) => ({
        ...registry,
        instances: [
          ...registry.instances,
          makeInstance({
            id: index === 0 ? DEFAULT_INSTANCE_ID : `instance-${index}`,
            port: DEFAULT_PORT + index,
            configRoot: path.join(root, `config-${index}`),
          }),
        ],
      }))
    )
    const results = await Promise.allSettled(transactions)
    const failures = results.filter((result) => result.status === "rejected")
    assert.equal(
      failures.length,
      0,
      failures.map((result) => result.reason?.message).join("\n")
    )

    const registry = await readRegistry(root)
    assert.equal(registry.instances.length, 20)
    assert.deepEqual(
      registry.instances.map((instance) => instance.port).sort((a, b) => a - b),
      Array.from({ length: 20 }, (_, index) => DEFAULT_PORT + index)
    )
    assert.equal(
      new Set(registry.instances.map((instance) => instance.configRoot)).size,
      20
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("a held recovery marker is diagnosed without being removed", async () => {
  const root = await temporaryRegistry()
  try {
    const recovery = registryRecoveryFile(root)
    const marker = `${JSON.stringify({ pid: process.pid, token: "held-recovery" })}\n`
    await mkdir(root, { recursive: true })
    await writeFile(recovery, marker)

    await assert.rejects(
      () => updateRegistry(root, (registry) => registry),
      /recovery marker may be stale/
    )
    assert.equal(await readFile(recovery, "utf8"), marker)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
