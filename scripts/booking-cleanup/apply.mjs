/** One atomic transaction; recovery after a lost response checks the committed state. */
export async function applyFirestore(db, backup, targets, encode, same) {
  const originals = new Map(backup.documents.map((d) => [d.path, d]));
  return db.runTransaction(async (tx) => {
    const current = await tx.get(db.collection("bookings"));
    if (current.docs.some((d) => !targets.includes(d.id)))
      throw Error("Unexpected new booking; cleanup aborted");
    const snapshots = await tx.getAll(
      ...backup.documents.map((d) => db.doc(d.path)),
    );
    const alreadyDone =
      backup.plan.deletes.every(
        (p) => !snapshots.find((s) => s.ref.path === p)?.exists,
      ) &&
      backup.plan.repairs.every((p) => {
        const d = snapshots.find((s) => s.ref.path === p.path);
        return (
          d?.exists &&
          Object.entries(p.patch).every(([k, v]) => same(d.get(k), v))
        );
      });
    if (alreadyDone) return;
    for (const s of snapshots)
      if (
        !s.exists ||
        !same(encode(s.updateTime), originals.get(s.ref.path).version)
      )
        throw Error("Document changed after backup: " + s.ref.path);
    for (const p of backup.plan.repairs) tx.update(db.doc(p.path), p.patch);
    for (const p of backup.plan.deletes) tx.delete(db.doc(p));
  });
}
