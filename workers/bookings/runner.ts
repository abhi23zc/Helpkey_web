import { backgroundMode } from "../../lib/background/config";
const mode = backgroundMode();
if (mode !== "queue") void import("./legacy-runner");
if (mode !== "legacy") void import("./queue-runner");
