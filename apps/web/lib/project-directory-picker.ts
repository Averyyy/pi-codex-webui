import "server-only"

export type ProjectDirectoryPicker = {
  command: string
  args: string[]
  output: "line" | "raw"
}

const MACOS_PICKER_SCRIPT = [
  'tell application "Finder"',
  "activate",
  "try",
  'set selectedFolder to choose folder with prompt "选择项目文件夹"',
  "return POSIX path of selectedFolder",
  "on error number -128",
  'return ""',
  "end try",
  "end tell",
].join("\n")

const WINDOWS_PICKER_SCRIPT = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  "$dialog.Description = '选择项目文件夹'",
  "$dialog.ShowNewFolderButton = $false",
  "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
  "  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
  "  [Console]::Write($dialog.SelectedPath)",
  "}",
].join("\n")

export function projectDirectoryPicker(
  platform: NodeJS.Platform
): ProjectDirectoryPicker | null {
  if (platform === "darwin") {
    return {
      command: "/usr/bin/osascript",
      args: ["-e", MACOS_PICKER_SCRIPT],
      output: "line",
    }
  }
  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-STA",
        "-Command",
        WINDOWS_PICKER_SCRIPT,
      ],
      output: "raw",
    }
  }
  return null
}

export function decodeProjectDirectoryPickerOutput(
  picker: ProjectDirectoryPicker,
  stdout: string
) {
  const output =
    picker.output === "line" && stdout.endsWith("\n")
      ? stdout.slice(0, -1)
      : stdout
  return output || null
}
