import type { ComponentProps } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { stripAnsi } from "@/lib/ansi"

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ className, ...props }: ComponentProps<"a">) => (
          <a
            {...props}
            className={`break-all text-primary underline underline-offset-4 ${className ?? ""}`}
            target="_blank"
            rel="noreferrer"
          />
        ),
        blockquote: ({ className, ...props }: ComponentProps<"blockquote">) => (
          <blockquote
            {...props}
            className={`border-l-2 pl-4 text-muted-foreground ${className ?? ""}`}
          />
        ),
        code: ({ className, ...props }: ComponentProps<"code">) => (
          <code
            {...props}
            className={`rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] ${className ?? ""}`}
          />
        ),
        h1: ({ className, ...props }: ComponentProps<"h1">) => (
          <h1
            {...props}
            className={`mt-6 mb-3 text-xl font-semibold ${className ?? ""}`}
          />
        ),
        h2: ({ className, ...props }: ComponentProps<"h2">) => (
          <h2
            {...props}
            className={`mt-5 mb-2 text-lg font-semibold ${className ?? ""}`}
          />
        ),
        h3: ({ className, ...props }: ComponentProps<"h3">) => (
          <h3
            {...props}
            className={`mt-4 mb-2 font-semibold ${className ?? ""}`}
          />
        ),
        ol: ({ className, ...props }: ComponentProps<"ol">) => (
          <ol
            {...props}
            className={`my-3 list-decimal space-y-1 pl-6 ${className ?? ""}`}
          />
        ),
        p: ({ className, ...props }: ComponentProps<"p">) => (
          <p
            {...props}
            className={`my-3 leading-7 break-words first:mt-0 last:mb-0 ${className ?? ""}`}
          />
        ),
        pre: ({ className, ...props }: ComponentProps<"pre">) => (
          <pre
            {...props}
            className={`my-4 overflow-x-auto rounded-xl border bg-muted/50 p-4 text-xs leading-5 [&_code]:bg-transparent [&_code]:p-0 ${className ?? ""}`}
          />
        ),
        table: ({ className, ...props }: ComponentProps<"table">) => (
          <div className="my-4 overflow-x-auto">
            <table
              {...props}
              className={`w-full border-collapse text-sm [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left ${className ?? ""}`}
            />
          </div>
        ),
        ul: ({ className, ...props }: ComponentProps<"ul">) => (
          <ul
            {...props}
            className={`my-3 list-disc space-y-1 pl-6 ${className ?? ""}`}
          />
        ),
      }}
    >
      {stripAnsi(children)}
    </ReactMarkdown>
  )
}
