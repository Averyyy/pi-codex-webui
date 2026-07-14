import { AsyncLocalStorage } from "node:async_hooks"

import type {
  ExtensionInvocation,
  ExtensionOperation,
} from "@pi-web-codex/extension-sdk"
import type {
  Extension,
  LoadExtensionsResult,
} from "@earendil-works/pi-coding-agent"

import type { WebUiAdapterHost } from "./webui-adapter-host.js"

export const extensionInvocation = new AsyncLocalStorage<ExtensionInvocation>()

const instrumented = new WeakSet<Extension>()

function invocation(
  host: WebUiAdapterHost,
  extension: Extension,
  operation: ExtensionOperation
) {
  return {
    owner: host.owner(extension),
    operation,
  } satisfies ExtensionInvocation
}

function instrumentExtension(
  extension: Extension,
  getHost: () => WebUiAdapterHost
) {
  if (instrumented.has(extension)) return
  instrumented.add(extension)

  for (const [name, handlers] of extension.handlers) {
    extension.handlers.set(
      name,
      handlers.map((handler) => (...args) => {
        const host = getHost()
        return extensionInvocation.run(
          invocation(host, extension, { type: "event", name }),
          () => handler(...args)
        )
      })
    )
  }

  for (const [name, command] of extension.commands) {
    const original = command.handler
    command.handler = async (args, context) => {
      const host = getHost()
      const current = invocation(host, extension, { type: "command", name })
      return extensionInvocation.run(current, async () => {
        if (await host.tryHandleCommand(current, args, context)) return
        return original(args, context)
      })
    }
  }

  for (const [name, shortcut] of extension.shortcuts) {
    const original = shortcut.handler
    shortcut.handler = (context) => {
      const host = getHost()
      return extensionInvocation.run(
        invocation(host, extension, { type: "shortcut", name }),
        () => original(context)
      )
    }
  }

  for (const [name, registered] of extension.tools) {
    const definition = registered.definition
    const execute = definition.execute
    definition.execute = async (
      toolCallId,
      params,
      signal,
      onUpdate,
      context
    ) => {
      const host = getHost()
      const current = invocation(host, extension, {
        type: "tool.execute",
        name,
      })
      return extensionInvocation.run(current, async () => {
        host.tryRender(
          invocation(host, extension, { type: "tool.renderCall", name }),
          { toolCallId, params }
        )
        const result = await execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          context
        )
        host.tryRender(
          invocation(host, extension, { type: "tool.renderResult", name }),
          { toolCallId, params, result }
        )
        return result
      })
    }
    if (definition.renderCall) {
      const renderCall = definition.renderCall
      definition.renderCall = (args, theme, context) => {
        const host = getHost()
        return extensionInvocation.run(
          invocation(host, extension, { type: "tool.renderCall", name }),
          () => renderCall(args, theme, context)
        )
      }
    }
    if (definition.renderResult) {
      const renderResult = definition.renderResult
      definition.renderResult = (result, options, theme, context) => {
        const host = getHost()
        return extensionInvocation.run(
          invocation(host, extension, { type: "tool.renderResult", name }),
          () => renderResult(result, options, theme, context)
        )
      }
    }
  }

  for (const [customType, renderer] of extension.messageRenderers) {
    extension.messageRenderers.set(customType, (message, options, theme) => {
      const host = getHost()
      const current = invocation(host, extension, {
        type: "message.render",
        customType,
      })
      return extensionInvocation.run(current, () => {
        host.tryRender(current, { message, options })
        return renderer(message, options, theme)
      })
    })
  }

  for (const [customType, renderer] of extension.entryRenderers ?? []) {
    extension.entryRenderers?.set(customType, (entry, options, theme) => {
      const host = getHost()
      const current = invocation(host, extension, {
        type: "entry.render",
        customType,
      })
      return extensionInvocation.run(current, () => {
        host.tryRender(current, { entry, options })
        return renderer(entry, options, theme)
      })
    })
  }
}

export function createExtensionInstrumentor(getHost: () => WebUiAdapterHost) {
  return (base: LoadExtensionsResult) => {
    for (const extension of base.extensions) {
      instrumentExtension(extension, getHost)
    }
    return base
  }
}
