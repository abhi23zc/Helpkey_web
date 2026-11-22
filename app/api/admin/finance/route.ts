import { financeRoute } from "@/lib/finance/routes";
export const GET = financeRoute(true, false);
export const POST = financeRoute(true, true);
