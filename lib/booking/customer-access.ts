/** Legacy manual records never grant personal access through their operator UID. */
export function customerOwnsBooking(
  b:
    | {
        guestId?: unknown;
        source?: unknown;
        identityVersion?: unknown;
        linkedCustomerId?: unknown;
      }
    | null
    | undefined,
  uid: string,
) {
  return (
    typeof uid === "string" &&
    uid.length > 0 &&
    !!b &&
    b.guestId === uid &&
    (b.source !== "manual_partner" ||
      (b.identityVersion === 2 && b.linkedCustomerId === uid))
  );
}
