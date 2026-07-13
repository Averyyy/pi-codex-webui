import { createHash } from "node:crypto"
import path from "node:path"

import {
  CONFIG_DIR_NAME,
  DefaultPackageManager,
  hasTrustRequiringProjectResources,
  ProjectTrustStore,
  SettingsManager,
  type PackageSource,
  type PathMetadata,
  type ResolvedResource,
} from "@earendil-works/pi-coding-agent"
import {
  resourceCatalogSchema,
  type HostToWorkerMessage,
  type PackageView,
  type ResourceCatalog,
  type ResourceView,
} from "@workspace/runtime-protocol"

import { createSettingsManager } from "./settings.js"

type ResourceMessage = Extract<
  HostToWorkerMessage,
  {
    type:
      | "resources.catalog"
      | "resources.set-enabled"
      | "packages.install"
      | "packages.remove"
      | "packages.update"
      | "project.trust.set"
  }
>

type ResourceType = "extensions" | "skills" | "prompts" | "themes"
type SettingsScope = "global" | "project"

interface ResourceRecord {
  view: ResourceView
  resource: ResolvedResource
  resourceType: ResourceType
  inheritedEnabled?: boolean
}

interface ResourceState {
  catalog: ResourceCatalog
  records: ResourceRecord[]
  settingsManager: SettingsManager
  packageManager: DefaultPackageManager
}

const resourceTypes: Array<{
  plural: ResourceType
  singular: ResourceView["type"]
}> = [
  { plural: "extensions", singular: "extension" },
  { plural: "skills", singular: "skill" },
  { plural: "prompts", singular: "prompt" },
  { plural: "themes", singular: "theme" },
]

function id(parts: string[]) {
  return createHash("sha256").update(parts.join("\0")).digest("hex")
}

function resourceName(type: ResourceType, resourcePath: string) {
  const name = path.basename(resourcePath)
  return type === "skills" && name === "SKILL.md"
    ? path.basename(path.dirname(resourcePath))
    : name
}

function resourceSource(metadata: PathMetadata): ResourceView["source"] {
  if (metadata.origin === "package") return "package"
  return metadata.source === "auto" ? "directory" : "explicit-path"
}

function resourceKey(type: ResourceType, resourcePath: string) {
  return `${type}:${path.resolve(resourcePath)}`
}

function packageView(
  source: string,
  scope: "user" | "project",
  filtered: boolean,
  installedPath?: string
): PackageView {
  const viewScope = scope === "user" ? "global" : "project"
  return {
    id: id(["package", viewScope, source]),
    source,
    scope: viewScope,
    filtered,
    installedPath,
    missing: installedPath === undefined,
  }
}

export function projectTrustedForWeb(cwd: string, agentDir: string) {
  if (!hasTrustRequiringProjectResources(cwd)) return true
  const stored = new ProjectTrustStore(agentDir).get(cwd)
  if (stored !== null) return stored
  const globalSettings = createSettingsManager(cwd, agentDir, false)
  return globalSettings.getDefaultProjectTrust() === "always"
}

async function resolveState(
  cwd: string,
  agentDir: string
): Promise<ResourceState> {
  const trustRequired = hasTrustRequiringProjectResources(cwd)
  const projectTrusted = projectTrustedForWeb(cwd, agentDir)
  const settingsManager = createSettingsManager(cwd, agentDir, projectTrusted)
  const packageManager = new DefaultPackageManager({
    cwd,
    agentDir,
    settingsManager,
  })
  const resolved = await packageManager.resolve(async () => "skip")

  const globalSettings = SettingsManager.inMemory(
    settingsManager.getGlobalSettings(),
    { projectTrusted: false }
  )
  const globalPackageManager = new DefaultPackageManager({
    cwd,
    agentDir,
    settingsManager: globalSettings,
  })
  const globalResolved = await globalPackageManager.resolve(async () => "skip")
  const globalEnabled = new Map<string, boolean>()
  for (const { plural } of resourceTypes) {
    for (const resource of globalResolved[plural]) {
      globalEnabled.set(resourceKey(plural, resource.path), resource.enabled)
    }
  }

  const records: ResourceRecord[] = []
  for (const { plural, singular } of resourceTypes) {
    for (const resource of globalResolved[plural]) {
      records.push({
        view: {
          id: id(["resource", "global", plural, path.resolve(resource.path)]),
          type: singular,
          name: resourceName(plural, resource.path),
          scope: "global",
          source: resourceSource(resource.metadata),
          sourcePath: resource.path,
          packageSource:
            resource.metadata.origin === "package"
              ? resource.metadata.source
              : undefined,
          enabled: resource.enabled,
          inherited: false,
          overridden: false,
          missing: false,
          reloadRequired: false,
        },
        resource,
        resourceType: plural,
      })
    }
    for (const resource of resolved[plural]) {
      const inherited = resource.metadata.scope === "user"
      const inheritedEnabled = globalEnabled.get(
        resourceKey(plural, resource.path)
      )
      records.push({
        view: {
          id: id(["resource", "project", plural, path.resolve(resource.path)]),
          type: singular,
          name: resourceName(plural, resource.path),
          scope: "project",
          source: resourceSource(resource.metadata),
          sourcePath: resource.path,
          packageSource:
            resource.metadata.origin === "package"
              ? resource.metadata.source
              : undefined,
          enabled: resource.enabled,
          inherited,
          overridden:
            inherited &&
            inheritedEnabled !== undefined &&
            inheritedEnabled !== resource.enabled,
          missing: false,
          reloadRequired: false,
        },
        resource,
        resourceType: plural,
        inheritedEnabled,
      })
    }
  }

  const packages = packageManager
    .listConfiguredPackages()
    .map((configured) =>
      packageView(
        configured.source,
        configured.scope,
        configured.filtered,
        configured.installedPath
      )
    )

  return {
    catalog: resourceCatalogSchema.parse({
      cwd,
      projectTrusted,
      trustRequired,
      resources: records.map(({ view }) => view),
      packages,
    }),
    records,
    settingsManager,
    packageManager,
  }
}

function patternTarget(pattern: string) {
  return /^[!+-]/.test(pattern) ? pattern.slice(1) : pattern
}

function setTopLevelPaths(
  settingsManager: SettingsManager,
  scope: SettingsScope,
  type: ResourceType,
  paths: string[]
) {
  if (scope === "project") {
    if (type === "extensions") settingsManager.setProjectExtensionPaths(paths)
    else if (type === "skills") settingsManager.setProjectSkillPaths(paths)
    else if (type === "prompts") {
      settingsManager.setProjectPromptTemplatePaths(paths)
    } else settingsManager.setProjectThemePaths(paths)
  } else if (type === "extensions") settingsManager.setExtensionPaths(paths)
  else if (type === "skills") settingsManager.setSkillPaths(paths)
  else if (type === "prompts") settingsManager.setPromptTemplatePaths(paths)
  else settingsManager.setThemePaths(paths)
}

function setTopLevelResource(
  state: ResourceState,
  record: ResourceRecord,
  scope: SettingsScope,
  enabled: boolean,
  inherit: boolean,
  agentDir: string
) {
  const settings =
    scope === "project"
      ? state.settingsManager.getProjectSettings()
      : state.settingsManager.getGlobalSettings()
  const baseDir =
    record.resource.metadata.baseDir ??
    (scope === "project"
      ? path.join(state.catalog.cwd, CONFIG_DIR_NAME)
      : agentDir)
  const pattern =
    scope === "project" && record.view.inherited
      ? record.resource.path
      : path.relative(baseDir, record.resource.path)
  const current = settings[record.resourceType] ?? []
  const updated = current.filter((entry) => patternTarget(entry) !== pattern)
  if (!inherit) updated.push(`${enabled ? "+" : "-"}${pattern}`)
  setTopLevelPaths(state.settingsManager, scope, record.resourceType, updated)
}

function packageOperationSource(
  configured: PackageView,
  cwd: string,
  agentDir: string
) {
  if (!configured.installedPath) return configured.source
  const scopeBase =
    configured.scope === "project" ? path.join(cwd, CONFIG_DIR_NAME) : agentDir
  return path.resolve(scopeBase, configured.source) ===
    path.resolve(configured.installedPath)
    ? configured.installedPath
    : configured.source
}

function packageSourceForProject(
  state: ResourceState,
  record: ResourceRecord,
  agentDir: string
) {
  const source = record.resource.metadata.source
  const configured = state.catalog.packages.find(
    (pkg) => pkg.scope === "global" && pkg.source === source
  )
  return configured
    ? packageOperationSource(configured, state.catalog.cwd, agentDir)
    : source
}

function setPackageResource(
  state: ResourceState,
  record: ResourceRecord,
  scope: SettingsScope,
  enabled: boolean,
  inherit: boolean,
  agentDir: string
) {
  const settings =
    scope === "project"
      ? state.settingsManager.getProjectSettings()
      : state.settingsManager.getGlobalSettings()
  const source =
    scope === "project" && record.view.inherited
      ? packageSourceForProject(state, record, agentDir)
      : record.resource.metadata.source
  const packages = [...(settings.packages ?? [])]
  let packageIndex = packages.findIndex(
    (entry) => (typeof entry === "string" ? entry : entry.source) === source
  )
  if (packageIndex === -1) {
    if (inherit) return
    packages.push({ source, autoload: false })
    packageIndex = packages.length - 1
  }

  const current = packages[packageIndex]
  if (current === undefined) throw new Error(`Missing package ${source}.`)
  const configured: Exclude<PackageSource, string> =
    typeof current === "string" ? { source: current } : { ...current }
  const baseDir =
    record.resource.metadata.baseDir ?? path.dirname(record.resource.path)
  const pattern = path.relative(baseDir, record.resource.path)
  const entries = (configured[record.resourceType] ?? []).filter(
    (entry) => patternTarget(entry) !== pattern
  )
  if (!inherit) entries.push(`${enabled ? "+" : "-"}${pattern}`)
  configured[record.resourceType] = entries.length ? entries : undefined
  const hasFilters = resourceTypes.some(
    ({ plural }) => configured[plural] !== undefined
  )
  if (!hasFilters) {
    if (configured.autoload === false) packages.splice(packageIndex, 1)
    else packages[packageIndex] = configured.source
  } else {
    packages[packageIndex] = configured
  }

  if (scope === "project") state.settingsManager.setProjectPackages(packages)
  else state.settingsManager.setPackages(packages)
}

async function setResourceEnabled(
  message: Extract<ResourceMessage, { type: "resources.set-enabled" }>
) {
  const { cwd, agentDir, resourceId, resourceType, writeScope, enabled } =
    message.payload
  const state = await resolveState(cwd, agentDir)
  if (writeScope === "project" && !state.catalog.projectTrusted) {
    throw new Error("Trust this project before changing project resources.")
  }
  const record = state.records.find(
    ({ view }) =>
      view.id === resourceId &&
      view.type === resourceType &&
      view.scope === writeScope
  )
  if (!record) {
    throw new Error(
      `Unknown ${writeScope} ${resourceType} resource ${resourceId}.`
    )
  }

  const inherit =
    writeScope === "project" &&
    record.view.inherited &&
    record.inheritedEnabled === enabled
  if (record.resource.metadata.origin === "package") {
    setPackageResource(state, record, writeScope, enabled, inherit, agentDir)
  } else {
    setTopLevelResource(state, record, writeScope, enabled, inherit, agentDir)
  }
  await state.settingsManager.flush()
  return (await resolveState(cwd, agentDir)).catalog
}

async function mutatePackage(
  message: Extract<
    ResourceMessage,
    { type: "packages.install" | "packages.remove" | "packages.update" }
  >
) {
  const { cwd, agentDir } = message.payload
  const state = await resolveState(cwd, agentDir)
  if (message.type === "packages.install") {
    if (message.payload.scope === "project" && !state.catalog.projectTrusted) {
      throw new Error("Trust this project before installing project packages.")
    }
    await state.packageManager.installAndPersist(message.payload.source, {
      local: message.payload.scope === "project",
    })
  } else {
    const configured = state.catalog.packages.find(
      ({ id: packageId }) => packageId === message.payload.packageId
    )
    if (!configured) {
      throw new Error(`Unknown package ${message.payload.packageId}.`)
    }
    if (configured.scope === "project" && !state.catalog.projectTrusted) {
      throw new Error("Trust this project before changing project packages.")
    }
    const source = packageOperationSource(configured, cwd, agentDir)
    if (message.type === "packages.remove") {
      await state.packageManager.removeAndPersist(source, {
        local: configured.scope === "project",
      })
    } else {
      await state.packageManager.update(source)
    }
  }
  await state.settingsManager.flush()
  return (await resolveState(cwd, agentDir)).catalog
}

export async function handleResourceMessage(message: ResourceMessage) {
  const { cwd, agentDir } = message.payload
  if (message.type === "resources.catalog") {
    return (await resolveState(cwd, agentDir)).catalog
  }
  if (message.type === "resources.set-enabled") {
    return setResourceEnabled(message)
  }
  if (
    message.type === "packages.install" ||
    message.type === "packages.remove" ||
    message.type === "packages.update"
  ) {
    return mutatePackage(message)
  }
  new ProjectTrustStore(agentDir).set(cwd, message.payload.trusted)
  return (await resolveState(cwd, agentDir)).catalog
}

export function isResourceMessage(
  message: HostToWorkerMessage
): message is ResourceMessage {
  return (
    message.type === "resources.catalog" ||
    message.type === "resources.set-enabled" ||
    message.type === "packages.install" ||
    message.type === "packages.remove" ||
    message.type === "packages.update" ||
    message.type === "project.trust.set"
  )
}
