/** Preserve explicit legacy metadata when producing the standard companion envelope. */
export function legacyApiError(record: Record<string, unknown>, status: number) {
  const explicit = typeof record.code === "string" && /^[A-Z][A-Z0-9_]*$/.test(record.code) ? record.code : null;
  const code = explicit ?? (typeof record.error === "string" ? record.error : `HTTP_${status}`);
  return {
    code,
    message: typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : code,
    ...(record.fieldErrors && typeof record.fieldErrors === "object" && !Array.isArray(record.fieldErrors) ? { fieldErrors: record.fieldErrors } : {}),
  };
}
