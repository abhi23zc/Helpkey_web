export function searchableTokens(values: unknown[]) {
  return [
    ...new Set(
      values
        .flatMap((value) =>
          String(value ?? "")
            .toLowerCase()
            .trim()
            .split(/\s+/),
        )
        .filter(Boolean),
    ),
  ].slice(0, 40);
}
