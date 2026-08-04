import assert from "node:assert/strict"
import test from "node:test"

import { parseWebUiExtensionCatalog } from "./webui-extensions/catalog-schema"

const catalog = {
  revision: 3,
  projectId: null,
  projectTrusted: false,
  groups: [
    {
      id: "example",
      name: "Example",
      preference: {
        enabled: true,
        rendering: "native",
        selectedAdapter: null,
      },
      candidates: [
        {
          key: "builtin:example#example",
          source: "builtin",
          packageName: "example-webui",
          packageVersion: "1.0.0",
          target: { packageName: "example" },
          runtimes: ["pi"],
          client: {
            digest: "digest",
            file: "client.mjs",
            url: "/client.mjs",
          },
        },
      ],
    },
  ],
  diagnostics: [],
  statuses: [],
}

test("WebUI extension catalogs validate before entering client state", () => {
  assert.deepEqual(parseWebUiExtensionCatalog(catalog), catalog)
  assert.throws(() => parseWebUiExtensionCatalog({ ...catalog, revision: "3" }))
  assert.throws(() =>
    parseWebUiExtensionCatalog({
      ...catalog,
      groups: [{ ...catalog.groups[0], candidates: [{ key: "broken" }] }],
    })
  )
})
