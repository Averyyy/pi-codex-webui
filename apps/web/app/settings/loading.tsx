export default function SettingsLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-72 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="h-48 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
    </div>
  )
}
