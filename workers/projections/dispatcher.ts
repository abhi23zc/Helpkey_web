import { disabledWorker } from "../shared/disabled";
import { db } from "../media/firebase";
import { projectionConnection, projectionJobId, projectionQueue } from "./queue";
import { projectionSchema } from "../../lib/background/jobs";
import { positiveInteger, recoveryInterval, backgroundMode } from "../../lib/background/config";
import { poll } from "../shared/poll";
import { dispatchOutbox } from "../shared/outbox";

const redis = projectionConnection(), queue = projectionQueue(redis);
let nextRecovery = 0;
if (backgroundMode() !== "queue") void poll({ name: "projection-dispatcher", redis, minimum: 2_000, maximum: positiveInteger("PROJECTION_IDLE_INTERVAL_MS", 30_000), task: async () => {
  const common = { db, queue, collection: "projectionOutbox", parse: (value: unknown) => projectionSchema.parse(value), id: (data: Record<string, unknown>) => projectionJobId(projectionSchema.parse(data)), name: (data: Record<string, unknown>) => String(data.kind), batchSize: positiveInteger("PROJECTION_DISPATCH_BATCH_SIZE", 50, 200) };
  if (Date.now() >= nextRecovery) { const result = await dispatchOutbox({ ...common, recover: true }); nextRecovery = Date.now() + (result.hasMore ? 0 : recoveryInterval()); }
  return dispatchOutbox({ ...common, recover: false });
} }).finally(async () => { await queue.close(); await redis.quit(); });

else { console.info("Frequent dispatcher disabled in queue mode"); void queue.close().then(() => redis.quit()).then(() => disabledWorker("dispatcher")); }
