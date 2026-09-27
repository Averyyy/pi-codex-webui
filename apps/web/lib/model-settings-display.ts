import type { ModelSettingsProvider } from "@workspace/runtime-protocol"

export function isModelProviderVisibleByDefault(
  provider: Pick<
    ModelSettingsProvider,
    "authStatus" | "modelCount" | "customModels"
  >
) {
  return (
    provider.authStatus === "configured" ||
    provider.authStatus === "not-required" ||
    provider.modelCount > 0 ||
    provider.customModels.length > 0
  )
}
