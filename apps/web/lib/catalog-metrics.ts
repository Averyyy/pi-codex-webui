import "server-only"

export type CatalogMetricFields = Record<
  string,
  string | number | boolean | null | undefined
>

export function emitCatalogMetric(
  operation: string,
  fields: CatalogMetricFields
) {
  if (process.env.PI_WEB_CODEX_CATALOG_DIAGNOSTICS !== "1") return
  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  )
  console.info(
    JSON.stringify({
      event: "pi-web-codex.catalog",
      operation,
      timestamp: new Date().toISOString(),
      ...safeFields,
    })
  )
}
