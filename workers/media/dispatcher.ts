import { disabledWorker } from "../shared/disabled";
import { db } from "./firebase";
import { connection, mediaQueue } from "./queue";
import { publicationSchema, safeJobId } from "../../lib/background/jobs";
import { positiveInteger, recoveryInterval, backgroundMode } from "../../lib/background/config";
import { poll } from "../shared/poll";
import { dispatchOutbox } from "../shared/outbox";

const redis = connection(), queue = mediaQueue(redis);
let nextRecovery = 0;
if (backgroundMode() !== "queue") void poll({ name: "media-dispatcher", redis, minimum: 2_000, maximum: positiveInteger("MEDIA_IDLE_INTERVAL_MS", 30_000), task: async () => {
  const common = { db, queue, collection: "mediaPublicationOutbox", parse: (value: unknown) => publicationSchema.parse(value), id: (_data: Record<string, unknown>, id: string) => safeJobId("media", id), name: (data: Record<string, unknown>) => String(data.operation), batchSize: positiveInteger("MEDIA_DISPATCH_BATCH_SIZE", 50, 200) };
  if (Date.now() >= nextRecovery) { const result = await dispatchOutbox({ ...common, recover: true }); nextRecovery = Date.now() + (result.hasMore ? 0 : recoveryInterval()); }
  return dispatchOutbox({ ...common, recover: false });
} }).finally(async () => { await queue.close(); await redis.quit(); });

else { console.info("Frequent dispatcher disabled in queue mode"); void queue.close().then(() => redis.quit()).then(() => disabledWorker("dispatcher")); }
