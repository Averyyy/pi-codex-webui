const FTS_TRIGRAM_MIN_CODE_POINTS = 3

export interface SessionSearchPlan {
  normalizedQuery: string
  indexedTerms: string[]
  exactSubstringTerms: string[]
  matchQuery: string | null
}

export function normalizeSessionSearchQuery(query: string) {
  return query.replaceAll("\0", " ").trim().replace(/\s+/gu, " ")
}

function sessionSearchTerms(query: string) {
  return query.split(/[\s"]+/u).filter(Boolean)
}

function caseInsensitiveSubstringRange(text: string, term: string) {
  const textCodePoints = [...text]
  const termCodePoints = [...term]
  const normalizedTerm = term.toLowerCase()
  if (termCodePoints.length === 0) return null

  for (
    let start = 0;
    start + termCodePoints.length <= textCodePoints.length;
    start += 1
  ) {
    const end = start + termCodePoints.length
    if (
      textCodePoints.slice(start, end).join("").toLowerCase() === normalizedTerm
    ) {
      return { textCodePoints, start, end }
    }
  }
  return null
}

export function sessionSearchContainsExactSubstring(
  text: string,
  term: string
) {
  return caseInsensitiveSubstringRange(text, term) !== null
}

export function exactSubstringSearchSnippet(text: string, term: string) {
  const range = caseInsensitiveSubstringRange(text, term)
  if (!range) return [...text].slice(0, 160).join("")

  const contextStart = Math.max(0, range.start - 64)
  const contextEnd = Math.min(range.textCodePoints.length, range.end + 96)
  return [
    contextStart > 0 ? "…" : "",
    range.textCodePoints.slice(contextStart, range.start).join(""),
    "【",
    range.textCodePoints.slice(range.start, range.end).join(""),
    "】",
    range.textCodePoints.slice(range.end, contextEnd).join(""),
    contextEnd < range.textCodePoints.length ? "…" : "",
  ].join("")
}

export function createSessionSearchPlan(query: string): SessionSearchPlan {
  const normalizedQuery = normalizeSessionSearchQuery(query)
  if (!normalizedQuery) {
    return {
      normalizedQuery,
      indexedTerms: [],
      exactSubstringTerms: [],
      matchQuery: null,
    }
  }

  const terms = sessionSearchTerms(normalizedQuery)
  const indexedTerms: string[] = []
  const exactSubstringTerms: string[] = []
  for (const term of terms) {
    if ([...term].length >= FTS_TRIGRAM_MIN_CODE_POINTS) {
      indexedTerms.push(term)
    } else {
      exactSubstringTerms.push(term)
    }
  }

  return {
    normalizedQuery,
    indexedTerms,
    exactSubstringTerms,
    matchQuery:
      indexedTerms.length > 0
        ? indexedTerms
            .map((term) => `"${term.replaceAll('"', '""')}"`)
            .join(" AND ")
        : null,
  }
}
