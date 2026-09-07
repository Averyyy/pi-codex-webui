import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { APP_VERSION } from "./app"

test("the health response version matches the installed CLI package", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8")
  )
  assert.equal(APP_VERSION, packageJson.version)
})
