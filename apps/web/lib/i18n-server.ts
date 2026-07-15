import "server-only"

import { cache } from "react"

import { loadConfig } from "@/lib/config"

import { createTranslator } from "./i18n"

export const getLocalizedConfig = cache(async () => {
  const config = await loadConfig()
  return { config, t: createTranslator(config.appearance.language) }
})
