// UI preferences live for this browser tab, independently of route mounts.
// Only explicit session/round identities are used; no message text is stored.
const states = new Map<string, boolean>()
const listeners = new Set<() => void>()

export function readConversationDisclosure(key: string) {
  return states.get(key)
}

export function setConversationDisclosure(key: string, open: boolean) {
  if (states.get(key) === open) return
  states.set(key, open)
  for (const listener of listeners) listener()
}

export function subscribeConversationDisclosures(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function serverConversationDisclosure() {
  return undefined
}
