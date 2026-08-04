import "server-only"

export type ProjectFileManager = {
  command: string
  kind: "finder" | "file-explorer"
}

export function projectFileManager(
  platform: NodeJS.Platform
): ProjectFileManager | null {
  if (platform === "darwin") {
    return { command: "/usr/bin/open", kind: "finder" }
  }
  if (platform === "win32") {
    return { command: "explorer.exe", kind: "file-explorer" }
  }
  return null
}
