import { backgroundMode } from "../../lib/background/config";
import { disabledWorker } from "./disabled";
if (backgroundMode() === "legacy") disabledWorker("background-recovery");
else void import("./recovery-service");
