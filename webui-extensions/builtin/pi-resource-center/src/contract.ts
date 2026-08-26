export const RESOURCE_CATEGORIES = [
  {
    value: "packages",
    label: "Packages",
    description: "Installed Pi packages and their resources.",
  },
  {
    value: "skills",
    label: "Skills",
    description: "Global and project skills.",
  },
  {
    value: "extensions",
    label: "Extensions",
    description: "Loaded Pi extensions.",
  },
  {
    value: "prompts",
    label: "Prompts",
    description: "Available prompt templates.",
  },
  {
    value: "themes",
    label: "Themes",
    description: "Installed terminal themes.",
  },
] as const

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number]["value"]

export interface ResourceCenterState {
  categories: typeof RESOURCE_CATEGORIES
}

export type ResourceCenterResult =
  | { commandArgs: ResourceCategory }
  | { cancelled: true }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseResourceCenterState(
  value: unknown
): ResourceCenterState {
  if (
    !isRecord(value) ||
    !Array.isArray(value.categories) ||
    value.categories.length !== RESOURCE_CATEGORIES.length ||
    value.categories.some((category, index) => {
      const expected = RESOURCE_CATEGORIES[index]
      return (
        !expected ||
        !isRecord(category) ||
        category.value !== expected.value ||
        category.label !== expected.label ||
        category.description !== expected.description
      )
    })
  ) {
    throw new TypeError("Invalid resource-center state.")
  }
  return value as unknown as ResourceCenterState
}

export function parseResourceCenterResult(
  value: unknown
): ResourceCenterResult {
  if (!isRecord(value)) {
    throw new TypeError("Invalid resource-center result.")
  }
  if (value.cancelled === true) return { cancelled: true }
  if (
    typeof value.commandArgs === "string" &&
    RESOURCE_CATEGORIES.some(
      (category) => category.value === value.commandArgs
    )
  ) {
    return { commandArgs: value.commandArgs as ResourceCategory }
  }
  throw new TypeError("Invalid resource-center result.")
}
