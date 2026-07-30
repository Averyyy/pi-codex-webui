import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import {
  INTERCOM_ACTIONS,
  parseIntercomState,
  type IntercomAction,
  type IntercomState,
} from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.5 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .root { display: grid; grid-template-columns: minmax(220px, .8fr) minmax(300px, 1.2fr); gap: 16px; width: min(840px, 85vw); max-width: 100%; }
  .pane { display: grid; align-content: start; gap: 10px; min-width: 0; }
  h3 { margin: 0; font-size: 13px; }
  pre { min-height: 150px; max-height: 330px; overflow: auto; margin: 0; padding: 12px; border-radius: 10px; background: color-mix(in srgb, currentColor 6%, transparent); color: inherit; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.55 ui-monospace, monospace; }
  form { display: grid; gap: 10px; }
  label { display: grid; gap: 5px; color: color-mix(in srgb, currentColor 70%, transparent); font-size: 12px; }
  input, textarea, select { width: 100%; border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 9px; background: transparent; color: inherit; padding: 9px 10px; font: inherit; }
  textarea { min-height: 96px; resize: vertical; }
  input:focus-visible, textarea:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .row, .actions { display: flex; gap: 8px; align-items: end; }
  .row > * { flex: 1; }
  .actions { justify-content: flex-end; flex-wrap: wrap; }
  button { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 9px; background: transparent; color: inherit; cursor: pointer; padding: 8px 11px; }
  button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
  button:disabled { cursor: wait; opacity: .55; }
  .primary { background: currentColor; color: Canvas; }
  .primary:hover:not(:disabled) { background: currentColor; opacity: .86; }
  .error { color: #dc2626; }
  .output { min-height: 70px; }
  @media (max-width: 700px) { .root { grid-template-columns: 1fr; width: min(520px, 85vw); } }
`

function addStyle(root: ShadowRoot) {
  const style = document.createElement("style")
  style.textContent = styles
  root.append(style)
  return style
}

function field(
  labelText: string,
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
) {
  const label = document.createElement("label")
  label.append(labelText, control)
  return label
}

function actionLabel(action: IntercomAction) {
  return (
    {
      send: "发送消息",
      ask: "询问并等待",
      reply: "回复待处理询问",
      pending: "查看待处理询问",
      status: "连接状态",
      list: "刷新全部会话",
      "list-cwd": "按目录列出会话",
      cancel: "取消已发送询问",
    } satisfies Record<IntercomAction, string>
  )[action]
}

export default defineClientExtension((web) => {
  web.registerView({
    id: "intercom.dialog",
    mount({ shadowRoot, state, invoke, close, signal }) {
      let current: IntercomState = parseIntercomState(state)
      let busy = false
      const style = addStyle(shadowRoot)
      const root = document.createElement("section")
      root.className = "root"

      const peersPane = document.createElement("section")
      peersPane.className = "pane"
      const peersTitle = document.createElement("h3")
      peersTitle.textContent = "在线 Pi 会话"
      const peers = document.createElement("pre")
      peersPane.append(peersTitle, peers)

      const composePane = document.createElement("section")
      composePane.className = "pane"
      const composeTitle = document.createElement("h3")
      composeTitle.textContent = "会话操作"
      const form = document.createElement("form")
      const action = document.createElement("select")
      for (const value of INTERCOM_ACTIONS) {
        const option = document.createElement("option")
        option.value = value
        option.textContent = actionLabel(value)
        action.append(option)
      }
      const to = document.createElement("input")
      to.placeholder = "名称、完整 ID 或短 ID"
      const message = document.createElement("textarea")
      message.placeholder = "消息内容"
      message.value = current.draft ?? ""
      const cwd = document.createElement("input")
      cwd.placeholder = "可选；默认为当前目录"
      const replyTo = document.createElement("input")
      replyTo.placeholder = "仅回复指定询问时需要"
      const messageId = document.createElement("input")
      messageId.placeholder = "仅取消操作需要"
      const firstRow = document.createElement("div")
      firstRow.className = "row"
      firstRow.append(field("操作", action), field("目标会话", to))
      const secondRow = document.createElement("div")
      secondRow.className = "row"
      secondRow.append(field("目录过滤", cwd), field("回复消息 ID", replyTo))
      const thirdRow = document.createElement("div")
      thirdRow.className = "row"
      thirdRow.append(field("取消消息 ID", messageId))
      const actions = document.createElement("div")
      actions.className = "actions"
      const closeButton = document.createElement("button")
      closeButton.type = "button"
      closeButton.textContent = "关闭"
      closeButton.addEventListener("click", () => close(), { signal })
      const pendingButton = document.createElement("button")
      pendingButton.type = "button"
      pendingButton.textContent = "待处理"
      const submit = document.createElement("button")
      submit.type = "submit"
      submit.className = "primary"
      submit.textContent = "执行"
      actions.append(closeButton, pendingButton, submit)
      const output = document.createElement("pre")
      output.className = "output"
      form.append(
        firstRow,
        field("消息", message),
        secondRow,
        thirdRow,
        actions,
        output
      )
      composePane.append(composeTitle, form)
      root.append(peersPane, composePane)
      shadowRoot.append(root)

      const controls = [
        action,
        to,
        message,
        cwd,
        replyTo,
        messageId,
        pendingButton,
        submit,
      ]
      const render = (next: unknown) => {
        current = parseIntercomState(next)
        peers.textContent = current.peers
        output.textContent =
          current.error ?? current.output ?? "选择操作并执行。"
        output.classList.toggle("error", Boolean(current.error))
      }
      const setBusy = (value: boolean) => {
        busy = value
        for (const control of controls) control.disabled = value
        submit.textContent = value ? "执行中…" : "执行"
      }
      const run = async (forcedAction?: IntercomAction) => {
        if (busy) return
        setBusy(true)
        try {
          const next = await invoke("intercom.execute", {
            action: forcedAction ?? action.value,
            to: to.value,
            message: message.value,
            cwd: cwd.value,
            replyTo: replyTo.value,
            messageId: messageId.value,
          })
          render(next)
          if (
            !current.error &&
            ((forcedAction ?? action.value) === "send" ||
              (forcedAction ?? action.value) === "reply")
          ) {
            message.value = ""
          }
        } catch (error) {
          output.textContent =
            error instanceof Error ? error.message : String(error)
          output.classList.add("error")
        } finally {
          setBusy(false)
        }
      }
      form.addEventListener(
        "submit",
        (event) => {
          event.preventDefault()
          void run()
        },
        { signal }
      )
      pendingButton.addEventListener("click", () => void run("pending"), {
        signal,
      })
      render(current)
      return {
        update: render,
        dispose() {
          root.remove()
          style.remove()
        },
      }
    },
  })
})
