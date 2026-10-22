import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { writeProjection } from "@/lib/background/enqueue";
export type ProjectionKind = import("@/lib/background/jobs").ProjectionJob["kind"];
export const enqueueProjection = (...args: Parameters<typeof writeProjection> extends [unknown, ...infer Rest] ? Rest : never) => writeProjection(adminDb, ...args);
