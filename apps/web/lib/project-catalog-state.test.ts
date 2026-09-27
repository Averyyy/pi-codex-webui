import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { readProjectCatalogState } from "./project-catalog-state"

test("project catalog state scopes trust to the nearest decision and reads BOM files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-project-catalog-state-"))
  const cwd = path.join(root, "workspace", "project")
  const agentDir = path.join(root, "agent")
  await mkdir(cwd, { recursive: true })
  await mkdir(agentDir, { recursive: true })
  const previousHome = process.env.HOME
  process.env.HOME = root
  try {
    await writeFile(
      path.join(agentDir, "trust.json"),
      `\uFEFF${JSON.stringify({
        [path.join(root, "workspace")]: true,
        [cwd]: false,
      })}`
    )
    const initial = await readProjectCatalogState(cwd, agentDir)
    assert.match(initial.trustScope, /"trusted":false/)

    await mkdir(path.join(root, "unrelated"), { recursive: true })
    await writeFile(
      path.join(agentDir, "trust.json"),
      JSON.stringify({
        [path.join(root, "workspace")]: true,
        [cwd]: false,
        [path.join(root, "unrelated")]: true,
      })
    )
    const unrelatedTrustChange = await readProjectCatalogState(cwd, agentDir)
    assert.equal(unrelatedTrustChange.trustScope, initial.trustScope)
    assert.equal(
      unrelatedTrustChange.resourceFingerprint,
      initial.resourceFingerprint
    )

    await writeFile(
      path.join(agentDir, "trust.json"),
      JSON.stringify({ [path.join(root, "workspace")]: true })
    )
    const inherited = await readProjectCatalogState(cwd, agentDir)
    assert.match(inherited.trustScope, /"trusted":true/)
    assert.notEqual(inherited.resourceFingerprint, initial.resourceFingerprint)

    await mkdir(path.join(cwd, ".pi", "extensions"), { recursive: true })
    const trustRequired = await readProjectCatalogState(cwd, agentDir)
    assert.match(trustRequired.trustScope, /"trustRequired":true/)
    assert.notEqual(trustRequired.trustScope, inherited.trustScope)
  } finally {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    await rm(root, { recursive: true, force: true })
  }
})

test("models.json credential, header, and command changes advance auth version", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-model-config-version-"))
  const cwd = path.join(root, "workspace")
  const agentDir = path.join(root, "agent")
  await Promise.all([
    mkdir(cwd, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
  ])
  const modelsPath = path.join(agentDir, "models.json")
  try {
    const config = {
      providers: {
        fixture: {
          api: "openai-completions",
          baseUrl: "https://example.test/v1",
          apiKey: "inline-key-one",
          headers: { Authorization: "Bearer header-one" },
          command: "credential-helper-one",
        },
      },
    }
    await writeFile(modelsPath, JSON.stringify(config))
    let previous = await readProjectCatalogState(cwd, agentDir)

    for (const update of [
      (value: typeof config) => {
        value.providers.fixture.apiKey = "inline-key-two"
      },
      (value: typeof config) => {
        value.providers.fixture.headers.Authorization = "Bearer header-two"
      },
      (value: typeof config) => {
        value.providers.fixture.command = "credential-helper-two"
      },
    ]) {
      const next = structuredClone(config)
      update(next)
      await writeFile(modelsPath, JSON.stringify(next))
      const current = await readProjectCatalogState(cwd, agentDir)
      assert.notEqual(current.version, previous.version)
      assert.notEqual(current.authVersion, previous.authVersion)
      previous = current
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
