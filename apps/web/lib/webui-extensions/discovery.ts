import "server-only"

import { readFile, readdir, realpath } from "node:fs/promises"
import path from "node:path"

import { satisfies, valid, validRange } from "semver"

import rootPackage from "../../../../package.json"

import {
  getBuiltinWebUiExtensionsRoot,
  getDevelopmentWebUiExtensionPaths,
  getExternalWebUiExtensionsRoot,
  getProjectWebUiExtensionsRoot,
} from "../app-paths"
import { registerWebUiAsset, webUiAssetDigest } from "./asset-resolver"
import { adapterPackageSchema } from "./manifest"
import type {
  DiscoveredWebUiExtension,
  WebUiExtensionAsset,
  WebUiExtensionDiagnostic,
  WebUiExtensionSource,
} from "./types"

interface DiscoveryOptions {
  cwd?: string
  projectTrusted?: boolean
}

interface PackageLocation {
  path: string
  source: WebUiExtensionSource
  manifestRequired: boolean
}

async function directories(root: string) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  const result: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const entryPath = path.join(root, entry.name)
    if (!entry.name.startsWith("@")) {
      result.push(entryPath)
      continue
    }
    const scoped = await readdir(entryPath, { withFileTypes: true })
    for (const child of scoped) {
      if (child.isDirectory() || child.isSymbolicLink()) {
        result.push(path.join(entryPath, child.name))
      }
    }
  }
  return result
}

async function packageLocations(options: DiscoveryOptions) {
  const locations: PackageLocation[] = []
  for (const packagePath of await directories(
    getBuiltinWebUiExtensionsRoot()
  )) {
    locations.push({
      path: packagePath,
      source: "builtin",
      manifestRequired: true,
    })
  }
  for (const packagePath of await directories(
    getExternalWebUiExtensionsRoot()
  )) {
    locations.push({
      path: packagePath,
      source: "external",
      manifestRequired: false,
    })
  }
  for (const packagePath of getDevelopmentWebUiExtensionPaths()) {
    locations.push({
      path: packagePath,
      source: "development",
      manifestRequired: true,
    })
  }
  if (options.cwd && options.projectTrusted) {
    for (const packagePath of await directories(
      getProjectWebUiExtensionsRoot(options.cwd)
    )) {
      locations.push({
        path: packagePath,
        source: "project",
        manifestRequired: true,
      })
    }
  }
  return locations
}

async function containedFile(packageRoot: string, relativePath: string) {
  const [root, file] = await Promise.all([
    realpath(packageRoot),
    realpath(path.resolve(packageRoot, relativePath)),
  ])
  const relative = path.relative(root, file)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Adapter entrypoint escapes its package: ${relativePath}`)
  }
  return file
}

async function asset(
  packageRoot: string,
  extensionId: string,
  relativePath: string
): Promise<WebUiExtensionAsset> {
  const assetPath = await containedFile(packageRoot, relativePath)
  const content = await readFile(assetPath)
  const digest = webUiAssetDigest(content)
  const file = path.basename(assetPath)
  const url = `/api/v1/webui-extensions/${extensionId}/assets/${digest}/${encodeURIComponent(file)}`
  registerWebUiAsset(extensionId, digest, file, assetPath)
  return { digest, file, path: assetPath, url }
}

async function discoverPackage(
  location: PackageLocation
): Promise<DiscoveredWebUiExtension[] | null> {
  const packageJsonPath = path.join(location.path, "package.json")
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(packageJsonPath, "utf8"))
  } catch (error) {
    if (
      !location.manifestRequired &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null
    }
    throw error
  }
  if (
    !location.manifestRequired &&
    (typeof raw !== "object" || raw === null || !("piWebCodex" in raw))
  ) {
    return null
  }
  const parsed = adapterPackageSchema.parse(raw)
  if (!valid(parsed.version)) {
    throw new Error(`Invalid adapter package version: ${parsed.version}`)
  }
  if (
    !validRange(parsed.piWebCodex.host.version) ||
    !satisfies(rootPackage.version, parsed.piWebCodex.host.version)
  ) {
    throw new Error(
      `Adapter requires pi-web-codex ${parsed.piWebCodex.host.version}; host is ${rootPackage.version}.`
    )
  }
  for (const extension of parsed.piWebCodex.extensions) {
    if (extension.target.version && !validRange(extension.target.version)) {
      throw new Error(
        `Invalid target version range for ${extension.id}: ${extension.target.version}`
      )
    }
    for (const testedVersion of extension.target.testedVersions ?? []) {
      if (!valid(testedVersion)) {
        throw new Error(
          `Invalid tested target version for ${extension.id}: ${testedVersion}`
        )
      }
    }
  }
  return Promise.all(
    parsed.piWebCodex.extensions.map(async (extension) => {
      const [workerPath, client, style] = await Promise.all([
        containedFile(location.path, extension.worker),
        asset(location.path, extension.id, extension.client),
        extension.style
          ? asset(location.path, extension.id, extension.style)
          : undefined,
      ])
      return {
        key: `${location.source}:${parsed.name}#${extension.id}`,
        source: location.source,
        packageRoot: await realpath(location.path),
        packageName: parsed.name,
        packageVersion: parsed.version,
        manifest: parsed.piWebCodex,
        extension,
        workerPath,
        client,
        style,
      }
    })
  )
}

export async function discoverWebUiExtensions(options: DiscoveryOptions = {}) {
  const extensions: DiscoveredWebUiExtension[] = []
  const diagnostics: WebUiExtensionDiagnostic[] = []
  const roots = new Set<string>()
  const keys = new Set<string>()
  for (const location of await packageLocations(options)) {
    let canonical: string
    try {
      canonical = await realpath(location.path)
    } catch (error) {
      diagnostics.push({
        path: location.path,
        message: error instanceof Error ? error.message : String(error),
      })
      continue
    }
    if (roots.has(canonical)) continue
    roots.add(canonical)
    try {
      const discovered = await discoverPackage(location)
      for (const extension of discovered ?? []) {
        if (keys.has(extension.key)) {
          throw new Error(`Duplicate adapter key: ${extension.key}`)
        }
        keys.add(extension.key)
        extensions.push(extension)
      }
    } catch (error) {
      diagnostics.push({
        path: location.path,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { extensions, diagnostics }
}
