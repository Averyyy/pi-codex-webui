import { APP_NAME, APP_VERSION, DEFAULT_HOST, DEFAULT_PORT } from "@/lib/app"

export const runtime = "nodejs"

export function GET() {
  return Response.json({
    status: "ok",
    name: APP_NAME,
    version: APP_VERSION,
    host: process.env.HOSTNAME ?? DEFAULT_HOST,
    port: Number(process.env.PORT ?? DEFAULT_PORT),
  })
}
