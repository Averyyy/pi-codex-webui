import type {
  ClientExtensionInitializer,
  CommandAdapterRegistration,
  ExternalViewRenderer,
  RendererAdapterRegistration,
  ToolExecutionAdapterRegistration,
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
  const toolExecutions = new Map<string, ToolExecutionAdapterRegistration>()
  const actions = new Map<string, WorkerActionRegistration>()
  const renderers = new Map<string, RendererAdapterRegistration>()
  await initialize({
    registerCommandAdapter: (registration) =>
      registerUnique(commands, registration),
    registerToolExecutionAdapter: (registration) =>
      registerUnique(toolExecutions, registration),
    registerAction: (registration) => registerUnique(actions, registration),
    registerRendererAdapter: (registration) =>
      registerUnique(renderers, registration),
  })
  return { commands, toolExecutions, actions, renderers }
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
