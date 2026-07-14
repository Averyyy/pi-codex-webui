export interface GreetingState {
  message: string
}

export function parseGreetingState(value: unknown): GreetingState {
  if (
    typeof value !== "object" ||
    value === null ||
    !("message" in value) ||
    typeof value.message !== "string"
  ) {
    throw new TypeError("Minimal greeter received invalid state.")
  }
  return { message: value.message }
}
