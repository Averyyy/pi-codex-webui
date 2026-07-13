import * as codingAgent from "@earendil-works/pi-coding-agent"
import * as tui from "@earendil-works/pi-tui"
import { startWorker } from "@workspace/worker-common"

delete process.env.PI_SERVER_MODE
delete process.env.PI_SERVER_URL
delete process.env.PI_SERVER_AUTH_TOKEN

startWorker(codingAgent, tui)
