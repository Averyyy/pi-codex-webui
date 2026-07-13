import * as codingAgent from "@earendil-works/pi-coding-agent"
import * as tui from "@earendil-works/pi-tui"
import {
  startWorker,
  type CodingAgentModule,
  type TuiModule,
} from "@workspace/worker-common"

if (!process.env.PI_SERVER_URL) {
  throw new Error("PI_SERVER_URL is required by the Pi Client worker.")
}
process.env.PI_SERVER_MODE = "true"

startWorker(
  codingAgent as unknown as CodingAgentModule,
  tui as unknown as TuiModule
)
