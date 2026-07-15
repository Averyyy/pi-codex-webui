const WEB_ACCESS_TOOLS = [
  "web_search",
  "fetch_content",
  "get_search_content",
] as const

export type WebAccessToolName = (typeof WEB_ACCESS_TOOLS)[number]

export interface WebAccessToolPresentation {
  label: string
  preview: string
  inputs: string[]
  facts: Array<{ label: string; value: string }>
  error?: string
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function string(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function count(value: number, unit: string) {
  return `${new Intl.NumberFormat("zh-CN").format(value)} ${unit}`
}

function listPreview(values: string[], empty: string, unit: string) {
  if (!values.length) return empty
  if (values.length === 1) return values[0] ?? empty
  return `${values.length} ${unit} · ${values[0]}`
}

function searchPresentation(
  args: Record<string, unknown>,
  details: Record<string, unknown>
): WebAccessToolPresentation {
  const queries = strings(args.queries)
  const query = string(args.query)
  const inputs = queries.length ? queries : query ? [query] : []
  const facts: WebAccessToolPresentation["facts"] = []
  const successfulQueries = number(details.successfulQueries)
  const queryCount = number(details.queryCount)
  const totalResults = number(details.totalResults)
  if (successfulQueries !== undefined && queryCount !== undefined) {
    facts.push({
      label: "查询",
      value: `${successfulQueries}/${queryCount} 成功`,
    })
  }
  if (totalResults !== undefined) {
    facts.push({ label: "来源", value: count(totalResults, "个") })
  }
  const curatedFrom = number(details.curatedFrom)
  if (details.curated === true && queryCount !== undefined) {
    facts.push({
      label: "筛选",
      value:
        curatedFrom === undefined
          ? `${queryCount} 个查询`
          : `${queryCount}/${curatedFrom} 个查询`,
    })
  }
  const searchId = string(details.searchId)
  if (searchId) facts.push({ label: "搜索 ID", value: searchId })
  const fetchId = string(details.fetchId)
  if (fetchId) facts.push({ label: "内容 ID", value: fetchId })
  const summary = record(details.summary)
  const summaryModel = summary ? string(summary.model) : undefined
  if (summaryModel) facts.push({ label: "摘要模型", value: summaryModel })
  return {
    label: "网络搜索",
    preview: listPreview(inputs, "未提供查询", "个查询"),
    inputs,
    facts,
    error: string(details.error),
  }
}

function fetchPresentation(
  args: Record<string, unknown>,
  details: Record<string, unknown>
): WebAccessToolPresentation {
  const urls = strings(args.urls)
  const url = string(args.url)
  const inputs = urls.length ? urls : url ? [url] : []
  const facts: WebAccessToolPresentation["facts"] = []
  const successful = number(details.successful)
  const urlCount = number(details.urlCount)
  if (successful !== undefined && urlCount !== undefined) {
    facts.push({ label: "地址", value: `${successful}/${urlCount} 成功` })
  }
  const totalChars = number(details.totalChars)
  if (totalChars !== undefined) {
    facts.push({ label: "内容", value: count(totalChars, "字符") })
  }
  const imageCount = number(details.imageCount)
  if (imageCount !== undefined && imageCount > 0) {
    facts.push({ label: "图像", value: count(imageCount, "张") })
  }
  if (details.truncated === true) {
    facts.push({ label: "状态", value: "已截断" })
  }
  const responseId = string(details.responseId)
  if (responseId) facts.push({ label: "内容 ID", value: responseId })
  return {
    label: "读取网页",
    preview: listPreview(inputs, "未提供地址", "个地址"),
    inputs,
    facts,
    error: string(details.error),
  }
}

function storedContentPresentation(
  args: Record<string, unknown>,
  details: Record<string, unknown>
): WebAccessToolPresentation {
  const selector =
    string(args.query) ??
    string(args.url) ??
    (number(args.queryIndex) !== undefined
      ? `查询 #${number(args.queryIndex)}`
      : undefined) ??
    (number(args.urlIndex) !== undefined
      ? `地址 #${number(args.urlIndex)}`
      : undefined)
  const responseId = string(args.responseId)
  const facts: WebAccessToolPresentation["facts"] = []
  if (responseId) facts.push({ label: "内容 ID", value: responseId })
  const resultCount = number(details.resultCount)
  if (resultCount !== undefined) {
    facts.push({ label: "结果", value: count(resultCount, "个") })
  }
  const contentLength = number(details.contentLength)
  if (contentLength !== undefined) {
    facts.push({ label: "内容", value: count(contentLength, "字符") })
  }
  return {
    label: "搜索内容",
    preview: selector ?? responseId ?? "未提供内容 ID",
    inputs: selector ? [selector] : [],
    facts,
    error: string(details.error),
  }
}

export function isWebAccessToolName(name: string): name is WebAccessToolName {
  return (WEB_ACCESS_TOOLS as readonly string[]).includes(name)
}

export function webAccessToolPresentation(
  name: WebAccessToolName,
  args: Record<string, unknown>,
  rawDetails?: unknown
) {
  const details = record(rawDetails) ?? {}
  if (name === "web_search") return searchPresentation(args, details)
  if (name === "fetch_content") return fetchPresentation(args, details)
  return storedContentPresentation(args, details)
}
