import type { QueryClient } from "@tanstack/react-query";
/** Property prefixes cover Today, workspace, registration, rooms and reporting. */
export function invalidateOperationalQueries(client: QueryClient, propertyId: string) {
  return client.invalidateQueries({ queryKey: ["partner", propertyId] });
}
