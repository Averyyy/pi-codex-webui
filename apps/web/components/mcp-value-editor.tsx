"use client"

import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import type { McpConfiguredValueView } from "@workspace/runtime-protocol"

import { useI18n } from "@/components/i18n-provider"

export function McpValueEditor({
  label,
  values,
  onChange,
}: {
  label: string
  values: McpConfiguredValueView[]
  onChange: (values: McpConfiguredValueView[]) => void
}) {
  const { t } = useI18n()

  function update(
    index: number,
    patch: Partial<McpConfiguredValueView>,
    keyChanged = false
  ) {
    onChange(
      values.map((value, itemIndex) =>
        itemIndex === index
          ? {
              ...value,
              ...patch,
              ...(keyChanged && value.secret ? { configured: false } : {}),
            }
          : value
      )
    )
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() =>
            onChange([
              ...values,
              { key: "", value: "", secret: false, configured: false },
            ])
          }
        >
          <PlusIcon />
          {t("settings.valueEditor.add")}
        </Button>
      </div>
      {values.map((value, index) => (
        <div
          key={index}
          className="grid gap-2 rounded-lg border bg-muted/20 p-2 sm:grid-cols-[minmax(7rem,0.8fr)_minmax(9rem,1fr)_auto_auto] sm:items-center"
        >
          <Input
            aria-label={`${label} key ${index + 1}`}
            placeholder={t("settings.valueEditor.key")}
            value={value.key}
            onChange={(event) =>
              update(index, { key: event.target.value }, true)
            }
          />
          <Input
            aria-label={`${label} value ${index + 1}`}
            type={value.secret ? "password" : "text"}
            placeholder={
              value.secret && value.configured
                ? t("settings.valueEditor.savedKeep")
                : t("settings.valueEditor.value")
            }
            value={value.value}
            onChange={(event) =>
              update(index, {
                value: event.target.value,
                ...(value.secret ? { configured: false } : {}),
              })
            }
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              aria-label={`${label} secret ${index + 1}`}
              checked={value.secret}
              onCheckedChange={(secret) =>
                update(index, {
                  secret,
                  configured: secret ? value.configured : false,
                })
              }
            />
            {t("settings.valueEditor.secret")}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("settings.valueEditor.remove", {
              name: value.key || label,
            })}
            onClick={() =>
              onChange(values.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      {values.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("settings.valueEditor.empty")}
        </p>
      ) : null}
    </div>
  )
}
