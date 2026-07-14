import { createElement, type ComponentType } from "react"
import { createRoot } from "react-dom/client"

import type { ExternalViewRenderer } from "./index.js"

export interface ReactViewProps<State> {
  state: State
  shadowRoot: ShadowRoot
  signal: AbortSignal
  invoke(action: string, input?: unknown): Promise<unknown>
  close(result?: unknown): void
}

export function defineReactView<State>(options: {
  id: string
  parseState(value: unknown): State
  component: ComponentType<ReactViewProps<State>>
}): ExternalViewRenderer {
  return {
    id: options.id,
    mount(context) {
      const root = createRoot(context.container)
      const render = (value: unknown) => {
        root.render(
          createElement(options.component, {
            state: options.parseState(value),
            shadowRoot: context.shadowRoot,
            signal: context.signal,
            invoke: context.invoke,
            close: context.close,
          })
        )
      }
      render(context.state)
      return {
        update: render,
        dispose: () => root.unmount(),
      }
    },
  }
}
