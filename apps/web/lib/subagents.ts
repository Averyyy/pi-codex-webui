import type { ResourceCatalog } from "@workspace/runtime-protocol"

export const TINTIN_SUBAGENTS_PACKAGE = "npm:@tintinweb/pi-subagents"

export function hasTintinSubagentsExtension(catalog: ResourceCatalog | null) {
  return (
    catalog?.resources.some(
      (resource) =>
        resource.type === "extension" &&
        resource.packageSource === TINTIN_SUBAGENTS_PACKAGE &&
        resource.enabled &&
        !resource.missing
    ) ?? false
  )
}
