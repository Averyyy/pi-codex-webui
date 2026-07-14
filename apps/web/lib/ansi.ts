// ANSI control bytes are intentionally matched so Web text does not expose them.
/* eslint-disable no-control-regex */
const ANSI_ESCAPE_SEQUENCE =
  /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\)|[@-_])|\u009B[0-?]*[ -/]*[@-~]/g
/* eslint-enable no-control-regex */

export function stripAnsi(value: string) {
  return value.replace(ANSI_ESCAPE_SEQUENCE, "")
}
