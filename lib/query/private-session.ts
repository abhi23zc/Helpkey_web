/** Remove browser drafts as well as in-memory queries when an account changes. */
export function clearPrivateStorage(
  storage: Pick<Storage, "length" | "key" | "removeItem">,
) {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
  for (const key of keys)
    if (
      key &&
      (key.startsWith("arrival-draft:") ||
        key.startsWith("offer-prompt:") ||
        key === "helpkey-private-account")
    )
      storage.removeItem(key);
}
export function bindPrivateStorage(storage: Storage, uid: string | undefined) {
  if (storage.getItem("helpkey-private-account") !== (uid || null))
    clearPrivateStorage(storage);
  if (uid) storage.setItem("helpkey-private-account", uid);
}
