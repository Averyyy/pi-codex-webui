export function shouldScrollToSessionTail(hash: string) {
  return hash.length === 0
}

export interface SavedSessionScroll {
  top: number
  following: boolean
  anchorId: string | null
  anchorOffset: number
}

export function captureSessionScroll(
  container: HTMLElement,
  following?: boolean
): SavedSessionScroll {
  const bounds = container.getBoundingClientRect()
  const anchor = [
    ...container.querySelectorAll<HTMLElement>(
      '[id^="entry-"], [id^="live-message-"]'
    ),
  ].find((element) => {
    const rect = element.getBoundingClientRect()
    return (
      rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom
    )
  })
  return {
    top: container.scrollTop,
    following:
      following ??
      container.scrollHeight - container.clientHeight - container.scrollTop <=
        1,
    anchorId: anchor?.id ?? null,
    anchorOffset: anchor ? anchor.getBoundingClientRect().top - bounds.top : 0,
  }
}

export function restoreSessionScroll(
  container: HTMLElement,
  position: SavedSessionScroll
) {
  if (position.following) {
    container.scrollTop = container.scrollHeight
    return
  }
  const anchor = position.anchorId
    ? document.getElementById(position.anchorId)
    : null
  if (anchor && container.contains(anchor)) {
    container.scrollTop +=
      anchor.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      position.anchorOffset
  } else container.scrollTop = position.top
}
