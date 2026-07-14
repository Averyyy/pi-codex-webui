import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"

export default defineWorkerExtension((web) => {
  web.registerCommandAdapter({
    id: "greeter.open",
    probe: (target) =>
      target.commands.has("greet")
        ? { compatible: true }
        : { compatible: false, reason: "Missing greet command." },
    async handle(request, context) {
      await context.openView({
        viewId: "greeter.dialog",
        placement: "session.dialog",
        blocking: true,
        title: "Hello from an external adapter",
        state: {
          message: request.args.trim() || "Hello from Pi.",
        },
      })
      return { handled: true }
    },
  })
})
