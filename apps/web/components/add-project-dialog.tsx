"use client"

import { useId, useState, type FormEvent } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

export interface AddedProject {
  id: string
  name: string
  path: string
}

async function responseJson(response: Response) {
  const body = (await response.json()) as AddedProject & { error?: string }
  if (!response.ok) {
    throw new Error(body.error ?? `操作失败（HTTP ${response.status}）。`)
  }
  return body
}

export function AddProjectDialog({
  open,
  onOpenChange,
  mutationToken,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mutationToken: string
  onAdded: (project: AddedProject) => void
}) {
  const inputId = useId()
  const [projectPath, setProjectPath] = useState("")
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setProjectPath("")
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true)
    setError(null)
    try {
      const project = await responseJson(
        await fetch("/api/v1/projects", {
          method: "POST",
          headers: {
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: projectPath }),
        })
      )
      onAdded(project)
      changeOpen(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <form onSubmit={addProject} className="contents">
          <DialogHeader>
            <DialogTitle>添加项目</DialogTitle>
            <DialogDescription>
              选择本机目录后，Pi Web 才会扫描该目录下的 Pi 对话。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={error !== null}>
              <FieldLabel htmlFor={inputId}>项目目录</FieldLabel>
              <Input
                id={inputId}
                value={projectPath}
                onChange={(event) => setProjectPath(event.target.value)}
                placeholder="/Users/me/Documents/project"
                aria-invalid={error !== null}
                autoFocus
                required
              />
              <FieldError>{error}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={working || !projectPath.trim()}>
              {working ? "正在扫描…" : "添加项目"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
