import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { addWorkspaceProject } from "@/lib/catalog"
import {
  decodeProjectDirectoryPickerOutput,
  projectDirectoryPicker,
} from "@/lib/project-directory-picker"
import { validateLocalMutation } from "@/lib/request-security"

export const runtime = "nodejs"

const execFileAsync = promisify(execFile)

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  const picker = projectDirectoryPicker(process.platform)
  if (!picker) {
    return Response.json(
      {
        error: `Selecting project folders is not supported on ${process.platform}.`,
      },
      { status: 501 }
    )
  }

  const { stdout } = await execFileAsync(picker.command, picker.args, {
    encoding: "utf8",
    windowsHide: true,
  })
  const selectedPath = decodeProjectDirectoryPickerOutput(picker, stdout)
  if (selectedPath === null) {
    return new Response(null, { status: 204 })
  }

  return Response.json(await addWorkspaceProject(selectedPath), {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  })
}
