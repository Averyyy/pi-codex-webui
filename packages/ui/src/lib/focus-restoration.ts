type FocusTarget = { focus: () => void; isConnected: boolean }
type FocusTargetRef = { current: FocusTarget | null }

export function rememberFocusTarget(
  targetRef: FocusTargetRef,
  target: FocusTarget | null
) {
  targetRef.current = target?.isConnected ? target : null
  return targetRef.current !== null
}

export function restorePendingFocus(
  pending: { current: boolean },
  target: FocusTarget | null
) {
  if (!pending.current || !target?.isConnected) return false

  pending.current = false
  target.focus()
  return true
}

export function restoreFocusTarget(targetRef: FocusTargetRef) {
  const target = targetRef.current
  targetRef.current = null
  if (!target?.isConnected) return false

  target.focus()
  return true
}
