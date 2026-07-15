import "server-only"

export type ProjectFileManager = {
  command: string
  label: string
}

export function projectFileManager(
  platform: NodeJS.Platform
): ProjectFileManager | null {
  if (platform === "darwin") {
    return { command: "/usr/bin/open", label: "在 Finder 中打开" }
  }
  if (platform === "win32") {
    return { command: "explorer.exe", label: "在文件资源管理器中打开" }
  }
  return null
}
