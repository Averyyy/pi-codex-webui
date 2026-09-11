import assert from "node:assert/strict"
import test from "node:test"

import {
  isShellToolName,
  parseShellToolResult,
  shellToolCommand,
} from "./shell-tool-result"

test("recognizes Codex and Pi shell tool names", () => {
  assert.equal(isShellToolName("exec_command"), true)
  assert.equal(isShellToolName("bash"), true)
  assert.equal(isShellToolName("read"), false)
})

test("reads command from cmd or command arguments", () => {
  assert.equal(
    shellToolCommand("exec_command", { cmd: "echo hello-from-pi-client" }),
    "echo hello-from-pi-client"
  )
  assert.equal(
    shellToolCommand("bash", { command: "echo hello-from-grok" }),
    "echo hello-from-grok"
  )
})

test("parses concatenated Codex exec_command results", () => {
  const parsed = parseShellToolResult(
    "Command: echo hello-from-pi-client Chunk ID: 63c2e3 Wall time: 0.2030 seconds Process exited with code 0 Original token count: 6 Output: hello-from-pi-client"
  )
  assert.equal(parsed.command, "echo hello-from-pi-client")
  assert.equal(parsed.exitCode, "0")
  assert.equal(parsed.wallTime, "0.2030 seconds")
  assert.equal(parsed.output, "hello-from-pi-client")
})

test("leaves unstructured shell output alone", () => {
  assert.deepEqual(parseShellToolResult("hello-from-grok\n"), {
    output: "hello-from-grok",
  })
})
