/** Redis generation keys are shared between web and standalone workers. */
export function publicCachePrefix() { return `helpkey:${process.env.HELPKEY_ENV ?? process.env.NODE_ENV ?? "development"}:v1`; }
export function generationKeys(parts: Array<string | number>) {
  const prefix = `${publicCachePrefix()}:generation`;
  const family = String(parts[0]);
  return [`${prefix}:all`, `${prefix}:${family}`, ...(parts.length > 1 && ["property", "reviews", "bookable"].includes(family) ? [`${prefix}:${family}:${parts[1]}`] : [])];
}
export function invalidationKeys(patterns: string[]) {
  const prefix = `${publicCachePrefix()}:generation`;
  return [...new Set(patterns.map(pattern => {
    if (pattern === "*") return `${prefix}:all`;
    const [family, ...rest] = pattern.split(":");
    return `${prefix}:${family}${rest.length && !rest.join(":").includes("*") ? `:${rest.join(":")}` : ""}`;
  }))];
}
export const ownedRelease = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
export const ownedRenew = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;
