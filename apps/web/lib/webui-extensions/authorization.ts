import type { WebUiExtensionCandidateView } from "@/lib/webui-extensions/types"

export function isExtensionCandidateAvailable(
  candidate: WebUiExtensionCandidateView | null,
  projectTrusted: boolean,
  catalogInvalidated = false
) {
  if (!candidate) return false
  if (candidate.source !== "project") return true
  return projectTrusted && !catalogInvalidated
}
