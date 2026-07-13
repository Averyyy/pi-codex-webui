import * as codingAgent from "@earendil-works/pi-coding-agent"
import { startWorker, type CodingAgentModule } from "@workspace/worker-common"

if (!process.env.PI_SERVER_URL) {
  throw new Error("PI_SERVER_URL is required by the Pi Client worker.")
}
process.env.PI_SERVER_MODE = "true"

startWorker(codingAgent as unknown as CodingAgentModule)
