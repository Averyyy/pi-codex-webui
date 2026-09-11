const COMMAND_DESCRIPTION_MAX_LENGTH = 72

export function composerCommandDescription(value: string) {
  const firstLine = value.replace(/\r\n/g, "\n").split("\n", 1)[0] ?? ""
  const sentence = firstLine.split(/(?<=[.!?。！？])\s+/, 1)[0] ?? firstLine
  const text = sentence.replace(/\s+/g, " ").trim()
  if (!text) return value.trim()
  const characters = Array.from(text)
  if (characters.length <= COMMAND_DESCRIPTION_MAX_LENGTH) return text
  return `${characters
    .slice(0, COMMAND_DESCRIPTION_MAX_LENGTH - 1)
    .join("")
    .trimEnd()}…`
}
