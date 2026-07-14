import type {
  ClientExtensionInitializer,
  CommandAdapterRegistration,
  ExternalViewRenderer,
  RendererAdapterRegistration,
  WorkerActionRegistration,
  WorkerExtensionInitializer,
} from "./index.js"

function registerUnique<T extends { id: string }>(
  registry: Map<string, T>,
  registration: T
) {
  if (registry.has(registration.id)) {
    throw new Error(`Duplicate test registration: ${registration.id}`)
  }
  registry.set(registration.id, registration)
}

export async function loadWorkerExtensionForTest(
  initialize: WorkerExtensionInitializer
) {
  const commands = new Map<string, CommandAdapterRegistration>()
  const actions = new Map<string, WorkerActionRegistration>()
  const renderers = new Map<string, RendererAdapterRegistration>()
  await initialize({
    registerCommandAdapter: (registration) =>
      registerUnique(commands, registration),
    registerAction: (registration) => registerUnique(actions, registration),
    registerRendererAdapter: (registration) =>
      registerUnique(renderers, registration),
  })
  return { commands, actions, renderers }
}

export async function loadClientExtensionForTest(
  initialize: ClientExtensionInitializer
) {
  const views = new Map<string, ExternalViewRenderer>()
  await initialize({
    registerView: (registration) => registerUnique(views, registration),
  })
  return { views }
}
