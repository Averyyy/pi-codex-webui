import { createTranslator, type Locale, type Translator } from "@/lib/i18n"

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

function formatted(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale).format(value)
}

function listPreview(
  values: string[],
  empty: string,
  countLabel: (count: number) => string
) {
  if (!values.length) return empty
  if (values.length === 1) return values[0] ?? empty
  return `${countLabel(values.length)} · ${values[0]}`
}

function searchPresentation(
  args: Record<string, unknown>,
  details: Record<string, unknown>,
  locale: Locale,
  t: Translator
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
      label: t("session.web.query"),
      value: t("session.web.success", {
        value: `${successfulQueries}/${queryCount}`,
      }),
    })
  }
  if (totalResults !== undefined) {
    facts.push({
      label: t("session.web.sources"),
      value: t(
        totalResults === 1
          ? "session.web.sourceCountOne"
          : "session.web.sourceCount",
        {
          count: formatted(totalResults, locale),
        }
      ),
    })
  }
  const curatedFrom = number(details.curatedFrom)
  if (details.curated === true && queryCount !== undefined) {
    facts.push({
      label: t("session.web.filter"),
      value:
        curatedFrom === undefined
          ? t(
              queryCount === 1
                ? "session.web.queryCountOne"
                : "session.web.queryCount",
              { count: queryCount }
            )
          : t(
              curatedFrom === 1
                ? "session.web.queryCountOne"
                : "session.web.queryCount",
              { count: `${queryCount}/${curatedFrom}` }
            ),
    })
  }
  const searchId = string(details.searchId)
  if (searchId)
    facts.push({ label: t("session.web.searchId"), value: searchId })
  const fetchId = string(details.fetchId)
  if (fetchId) facts.push({ label: t("session.web.contentId"), value: fetchId })
  const summary = record(details.summary)
  const summaryModel = summary ? string(summary.model) : undefined
  if (summaryModel) {
    facts.push({ label: t("session.web.summaryModel"), value: summaryModel })
  }
  return {
    label: t("session.web.webSearch"),
    preview: listPreview(inputs, t("session.web.noQuery"), (count) =>
      t(count === 1 ? "session.web.queryCountOne" : "session.web.queryCount", {
        count,
      })
    ),
    inputs,
    facts,
    error: string(details.error),
  }
}

function fetchPresentation(
  args: Record<string, unknown>,
  details: Record<string, unknown>,
  locale: Locale,
  t: Translator
): WebAccessToolPresentation {
  const urls = strings(args.urls)
  const url = string(args.url)
  const inputs = urls.length ? urls : url ? [url] : []
  const facts: WebAccessToolPresentation["facts"] = []
  const successful = number(details.successful)
  const urlCount = number(details.urlCount)
  if (successful !== undefined && urlCount !== undefined) {
    facts.push({
      label: t("session.web.address"),
      value: t("session.web.success", { value: `${successful}/${urlCount}` }),
    })
  }
  const totalChars = number(details.totalChars)
  if (totalChars !== undefined) {
    facts.push({
      label: t("session.web.content"),
      value: t(
        totalChars === 1
          ? "session.web.characterCountOne"
          : "session.web.characterCount",
        { count: formatted(totalChars, locale) }
      ),
    })
  }
  const imageCount = number(details.imageCount)
  if (imageCount !== undefined && imageCount > 0) {
    facts.push({
      label: t("session.web.images"),
      value: t(
        imageCount === 1
          ? "session.web.imageCountOne"
          : "session.web.imageCount",
        { count: formatted(imageCount, locale) }
      ),
    })
  }
  if (details.truncated === true) {
    facts.push({
      label: t("session.web.status"),
      value: t("session.web.truncated"),
    })
  }
  const responseId = string(details.responseId)
  if (responseId) {
    facts.push({ label: t("session.web.contentId"), value: responseId })
  }
  return {
    label: t("session.web.readWeb"),
    preview: listPreview(inputs, t("session.web.noAddress"), (count) =>
      t(
        count === 1
          ? "session.web.addressCountOne"
          : "session.web.addressCount",
        { count }
      )
    ),
    inputs,
    facts,
    error: string(details.error),
  }
}

function storedContentPresentation(
  args: Record<string, unknown>,
  details: Record<string, unknown>,
  locale: Locale,
  t: Translator
): WebAccessToolPresentation {
  const selector =
    string(args.query) ??
    string(args.url) ??
    (number(args.queryIndex) !== undefined
      ? t("session.web.queryIndex", { index: number(args.queryIndex)! })
      : undefined) ??
    (number(args.urlIndex) !== undefined
      ? t("session.web.addressIndex", { index: number(args.urlIndex)! })
      : undefined)
  const responseId = string(args.responseId)
  const facts: WebAccessToolPresentation["facts"] = []
  if (responseId) {
    facts.push({ label: t("session.web.contentId"), value: responseId })
  }
  const resultCount = number(details.resultCount)
  if (resultCount !== undefined) {
    facts.push({
      label: t("session.web.results"),
      value: t(
        resultCount === 1
          ? "session.web.resultCountOne"
          : "session.web.resultCount",
        { count: formatted(resultCount, locale) }
      ),
    })
  }
  const contentLength = number(details.contentLength)
  if (contentLength !== undefined) {
    facts.push({
      label: t("session.web.content"),
      value: t(
        contentLength === 1
          ? "session.web.characterCountOne"
          : "session.web.characterCount",
        { count: formatted(contentLength, locale) }
      ),
    })
  }
  return {
    label: t("session.web.searchContent"),
    preview: selector ?? responseId ?? t("session.web.noContentId"),
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
  rawDetails: unknown,
  locale: Locale
) {
  const details = record(rawDetails) ?? {}
  const t = createTranslator(locale)
  if (name === "web_search") return searchPresentation(args, details, locale, t)
  if (name === "fetch_content")
    return fetchPresentation(args, details, locale, t)
  return storedContentPresentation(args, details, locale, t)
}
