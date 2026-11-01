import { requestHandler } from "@/lib/stay/request-route";
export const POST = requestHandler(true);
export { requestHistoryHandler as GET } from "@/lib/stay/request-route";
