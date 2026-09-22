import assert from "node:assert/strict"
import test from "node:test"

import {
  beginUpdatePreparation,
  cancelUpdatePreparation,
  isUpdateMaintenanceActive,
  markUpdatePrepared,
  resetUpdateMaintenanceForTests,
  updateMaintenanceError,
} from "./update-maintenance"

test.afterEach(() => {
  resetUpdateMaintenanceForTests()
})

test("update preparation owns a synchronous gate and cannot cancel another operation", () => {
  const operationId = beginUpdatePreparation()
  assert.equal(isUpdateMaintenanceActive(), true)
  assert.match(updateMaintenanceError() ?? "", /preparing for an update/)
  assert.throws(
    () => beginUpdatePreparation(),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "UpdatePreparationConflict"
  )
  assert.throws(
    () => cancelUpdatePreparation("different-operation"),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "UpdatePreparationConflict"
  )
  markUpdatePrepared(operationId)
  assert.equal(cancelUpdatePreparation(operationId), true)
  assert.equal(isUpdateMaintenanceActive(), false)
})
