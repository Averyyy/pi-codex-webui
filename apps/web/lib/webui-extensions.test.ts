import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { readWebUiAsset } from "./webui-extensions/asset-resolver.js"
import { discoverWebUiExtensions } from "./webui-extensions/discovery.js"

async function writeAdapter(
  packageRoot: string,
  options: { name: string; extensionId: string; host?: string }
) {
  await mkdir(path.join(packageRoot, "dist"), { recursive: true })
  await Promise.all([
    writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: options.name,
        version: "1.0.0",
        type: "module",
        piWebCodex: {
          apiVersion: 1,
          host: {
            version: options.host ?? ">=0.1.0 <1.0.0",
            protocolVersion: 1,
          },
          extensions: [
            {
              id: options.extensionId,
              target: { packageName: "pi-target" },
              runtimes: ["pi"],
              worker: "./dist/worker.mjs",
              client: "./dist/client.mjs",
              contributes: {
                commandAdapters: [
                  { command: "target", handler: "target.open" },
                ],
              },
            },
          ],
        },
      })
    ),
    writeFile(
      path.join(packageRoot, "dist", "worker.mjs"),
      "export default () => {}\n"
    ),
    writeFile(
      path.join(packageRoot, "dist", "client.mjs"),
      "export default () => {}\n"
    ),
  ])
}

test("registry discovery unifies built-in, external, development, and trusted project packages", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-webui-discovery-"))
  const previous = {
    builtin: process.env.PI_WEB_CODEX_BUILTIN_EXTENSION_ROOT,
    config: process.env.PI_WEB_CODEX_CONFIG_DIR,
    development: process.env.PI_WEB_CODEX_WEBUI_EXTENSION_PATHS,
  }
  const builtinRoot = path.join(root, "builtin")
  const configRoot = path.join(root, "config")
  const developmentRoot = path.join(root, "development")
  const projectRoot = path.join(root, "project")
  try {
    process.env.PI_WEB_CODEX_BUILTIN_EXTENSION_ROOT = builtinRoot
    process.env.PI_WEB_CODEX_CONFIG_DIR = configRoot
    process.env.PI_WEB_CODEX_WEBUI_EXTENSION_PATHS = developmentRoot
    await Promise.all([
      writeAdapter(path.join(builtinRoot, "builtin-adapter"), {
        name: "pi-builtin-webui",
        extensionId: "builtin",
      }),
      writeAdapter(
        path.join(
          configRoot,
          "webui-extensions",
          "node_modules",
          "pi-external-webui"
        ),
        { name: "pi-external-webui", extensionId: "external" }
      ),
      writeAdapter(developmentRoot, {
        name: "pi-development-webui",
        extensionId: "development",
      }),
      writeAdapter(
        path.join(projectRoot, ".pi", "webui-extensions", "project-adapter"),
        { name: "pi-project-webui", extensionId: "project" }
      ),
      writeAdapter(path.join(builtinRoot, "future-adapter"), {
        name: "pi-future-webui",
        extensionId: "future",
        host: ">=2.0.0",
      }),
    ])

    const untrusted = await discoverWebUiExtensions({
      cwd: projectRoot,
      projectTrusted: false,
    })
    assert.deepEqual(untrusted.extensions.map((item) => item.source).sort(), [
      "builtin",
      "development",
      "external",
    ])
    assert.equal(untrusted.diagnostics.length, 1)
    assert.match(
      untrusted.diagnostics[0]?.message ?? "",
      /requires pi-web-codex/
    )

    const trusted = await discoverWebUiExtensions({
      cwd: projectRoot,
      projectTrusted: true,
    })
    assert.deepEqual(trusted.extensions.map((item) => item.source).sort(), [
      "builtin",
      "development",
      "external",
      "project",
    ])
    const builtin = trusted.extensions.find(
      (item) => item.extension.id === "builtin"
    )
    assert.match(builtin?.client.digest ?? "", /^[a-f0-9]{16}$/)
    assert.equal(
      (
        await readWebUiAsset(
          "builtin",
          builtin?.client.digest ?? "",
          builtin?.client.file ?? ""
        )
      )?.toString("utf8"),
      "export default () => {}\n"
    )
  } finally {
    if (previous.builtin === undefined) {
      delete process.env.PI_WEB_CODEX_BUILTIN_EXTENSION_ROOT
    } else process.env.PI_WEB_CODEX_BUILTIN_EXTENSION_ROOT = previous.builtin
    if (previous.config === undefined) {
      delete process.env.PI_WEB_CODEX_CONFIG_DIR
    } else process.env.PI_WEB_CODEX_CONFIG_DIR = previous.config
    if (previous.development === undefined) {
      delete process.env.PI_WEB_CODEX_WEBUI_EXTENSION_PATHS
    } else {
      process.env.PI_WEB_CODEX_WEBUI_EXTENSION_PATHS = previous.development
    }
    await rm(root, { recursive: true, force: true })
  }
})
