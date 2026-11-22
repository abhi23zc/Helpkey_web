import { financeRoute } from "@/lib/finance/routes";
export const GET = financeRoute(false, false, true);
export const POST = financeRoute(false, true, true);
