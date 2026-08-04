import type { Locale } from "./i18n"
import type { ProjectFileErrorCode } from "./project-files"

const errorDescriptions: Record<
  ProjectFileErrorCode,
  Record<Locale, string>
> = {
  InvalidPath: {
    "zh-CN": "请求的项目路径无效或不存在。",
    "en-US": "The requested project path is invalid or missing.",
  },
  OutsideProject: {
    "zh-CN": "请求的路径位于项目目录之外。",
    "en-US": "The requested path is outside the project.",
  },
  Unavailable: {
    "zh-CN": "项目目录已不存在。",
    "en-US": "The project directory no longer exists.",
  },
  UnsupportedEntry: {
    "zh-CN": "只能打开普通文件或目录。",
    "en-US": "Only regular files and directories can be opened.",
  },
}

export function projectFileErrorCopy(
  code: ProjectFileErrorCode,
  locale: Locale
) {
  return {
    title: locale === "zh-CN" ? "无法打开路径" : "Unable to open path",
    description: errorDescriptions[code][locale],
  }
}
