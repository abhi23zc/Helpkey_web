"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { PartnerShell } from "./partner-shell";
import { pmsButton, pmsCard, pmsInput } from "./pms-settings-page";
type Department = {
  role: string;
  units?: {
    id: string;
    label: string;
    roomTypeId: string;
    status: string;
    revision: number;
    occupied: boolean;
  }[];
  rooms?: { id: string; name: string }[];
  blocks?: {
    id: string;
    unitId: string | null;
    reason: string;
    startAt: string;
    endAt: string;
  }[];
  nextCursor?: string | null;
  hasMore?: boolean;
  lookup?: boolean;
  bookings?: {
    id: string;
    reference: string;
    guestName: string;
    room: string;
    balancePaise: number;
    status: string;
    receipts: { id: string; amountPaise: number; method: string }[];
  }[];
};
const rupees = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n / 100,
  );
function DepartmentView({ propertyId }: { propertyId: string }) {
  const base = `/api/partner/properties/${propertyId}/pms/department`;
  const [searchInput, setSearchInput] = useState("");
  const [cursor, setCursor] = useState<string>();
  const [previousPages, setPreviousPages] = useState<(string | undefined)[]>(
    [],
  );
  const [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const request = useRef({ body: "", key: "" });
  const query = useQuery({
    queryKey: ["partner", propertyId, "department", search, cursor],
    queryFn: ({ signal }) =>
      apiFetch<Department>(
        `${base}?${new URLSearchParams({ q: search, ...(cursor ? { cursor } : {}) })}`,
        {
          signal,
        },
      ),
    refetchInterval: 15_000,
  });
  async function send(body: {
    action: string;
    input: Record<string, unknown>;
  }) {
    setBusy(true);
    setError("");
    setNotice("");
    const text = JSON.stringify(body);
    if (request.current.body !== text)
      request.current = { body: text, key: crypto.randomUUID() };
    const payload =
      body.action === "maintenance"
        ? { ...body, input: { ...body.input, requestId: request.current.key } }
        : body;
    try {
      await apiFetch(base, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.current.key,
        },
        body: JSON.stringify(payload),
      });
      request.current = { body: "", key: "" };
      setNotice("Saved. Hotel operations have been refreshed.");
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending)
    return <p role="status">Loading permitted hotel operations…</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert" className={pmsCard}>
        {query.error?.message || "Unable to load operations."}{" "}
        <button className={pmsButton} onClick={() => void query.refetch()}>
          Retry
        </button>
      </div>
    );
  const data = query.data;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">
        {data.role === "cashier"
          ? "Cashier payments"
          : data.role === "housekeeper"
            ? "Housekeeping"
            : "Room maintenance"}
      </h1>
      <p className="text-sm text-slate-500">
        Only information and actions permitted for your hotel role are shown.
      </p>
      {error && (
        <p
          className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {data.role === "cashier" ? (
        <>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
              setCursor(undefined);
              setPreviousPages([]);
            }}
          >
            <label className="grow text-sm">
              Booking reference or ID
              <input
                value={searchInput}
                maxLength={180}
                onChange={(e) => setSearchInput(e.target.value)}
                className={`${pmsInput} mt-2`}
                placeholder="Enter the complete booking reference or ID"
              />
            </label>
            <button className={pmsButton} disabled={busy || query.isFetching}>
              Find reservation
            </button>
            <button
              type="button"
              className={pmsButton}
              disabled={busy}
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setCursor(undefined);
                setPreviousPages([]);
              }}
            >
              Outstanding balances
            </button>
          </form>
          <p className="text-xs text-slate-500">
            {data.lookup
              ? "Exact reservation lookup, including older and settled stays."
              : "Outstanding balances across hotel history. Pages inspect up to 50 reservations; settled stays are omitted."}
          </p>
          {data.bookings?.map((b) => (
            <section className={pmsCard} key={b.id}>
              <h2 className="font-bold">
                {b.guestName} · {b.reference}
              </h2>
              <p className="mt-1 text-sm">
                Room {b.room} · {b.status.replaceAll("_", " ")} · Balance{" "}
                {rupees(b.balancePaise)}
              </p>
              <form
                className="mt-4 grid gap-3 sm:grid-cols-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void send({
                    action: "payment",
                    input: {
                      bookingId: b.id,
                      operation: {
                        action: "collect",
                        amountPaise: Math.round(Number(f.get("amount")) * 100),
                        method: f.get("method"),
                        reference: f.get("reference"),
                        reason: "Collected at the hotel",
                      },
                    },
                  });
                }}
              >
                <label className="text-sm">
                  Amount (₹)
                  <input
                    required
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={b.balancePaise / 100}
                    className={pmsInput}
                  />
                </label>
                <label className="text-sm">
                  Method
                  <select name="method" className={pmsInput}>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card_terminal">Card terminal</option>
                  </select>
                </label>
                <label className="text-sm">
                  Reference
                  <input
                    name="reference"
                    className={pmsInput}
                    placeholder="Required for UPI/card"
                  />
                </label>
                <button
                  className={`${pmsButton} self-end`}
                  disabled={
                    busy ||
                    b.balancePaise <= 0 ||
                    ![
                      "confirmed",
                      "checked_in",
                      "checked_out",
                      "completed",
                    ].includes(b.status)
                  }
                >
                  Record collection
                </button>
              </form>
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-semibold">
                  Collection receipts and corrections
                </summary>
                <p className="my-2 text-slate-500">
                  Reverse only an erroneous, unused property collection. This
                  does not refund money.
                </p>
                {b.receipts.map((r) => (
                  <form
                    key={r.id}
                    className="my-2 flex flex-wrap gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const reason = new FormData(e.currentTarget).get(
                        "reason",
                      );
                      void send({
                        action: "payment",
                        input: {
                          bookingId: b.id,
                          operation: {
                            action: "reverse",
                            receiptId: r.id,
                            reason,
                          },
                        },
                      });
                    }}
                  >
                    <span className="self-center">
                      {rupees(r.amountPaise)} · {r.method}
                    </span>
                    <input
                      required
                      minLength={3}
                      name="reason"
                      className={pmsInput + " !w-auto"}
                      placeholder="Correction reason"
                    />
                    <button className={pmsButton} disabled={busy}>
                      Reverse receipt
                    </button>
                  </form>
                ))}
              </details>
            </section>
          ))}
          {data.bookings?.length === 0 && (
            <p className={pmsCard}>
              {data.lookup
                ? "No reservation found for that reference or ID in this hotel."
                : data.hasMore
                  ? "No outstanding balances on this page. Continue to the next page."
                  : "No outstanding balances on this page."}
            </p>
          )}
          {!data.lookup && (
            <nav className="flex flex-wrap gap-3" aria-label="Balance pages">
              {previousPages.length > 0 && (
                <button
                  type="button"
                  className={pmsButton}
                  disabled={busy || query.isFetching}
                  onClick={() => {
                    setCursor(previousPages.at(-1));
                    setPreviousPages((p) => p.slice(0, -1));
                  }}
                >
                  Previous page
                </button>
              )}
              {data.nextCursor && (
                <button
                  type="button"
                  className={pmsButton}
                  disabled={busy || query.isFetching}
                  onClick={() => {
                    setPreviousPages((p) => [...p, cursor]);
                    setCursor(data.nextCursor!);
                  }}
                >
                  Next page
                </button>
              )}
            </nav>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.units?.map((u) => (
              <section className={pmsCard} key={u.id}>
                <h2 className="text-lg font-bold">Room {u.label}</h2>
                <p className="mt-1 text-sm">
                  {u.occupied ? "Occupied" : "Vacant"} · Cleaning: {u.status}
                </p>
                {data.role === "housekeeper" ? (
                  <form
                    className="mt-3 space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void send({
                        action: "housekeeping",
                        input: {
                          unitId: u.id,
                          revision: u.revision,
                          status: f.get("status"),
                          note: f.get("note"),
                        },
                      });
                    }}
                  >
                    <label className="block text-sm">
                      Cleaning status
                      <select
                        key={u.status}
                        defaultValue={u.status}
                        name="status"
                        className={pmsInput}
                      >
                        {["unknown", "dirty", "clean", "inspected"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      Operational note
                      <input
                        maxLength={500}
                        name="note"
                        className={pmsInput}
                        placeholder="Optional cleaning note"
                      />
                    </label>
                    <button disabled={busy} className={pmsButton}>
                      Update cleaning status
                    </button>
                  </form>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    Use the maintenance form to block this room for repairs.
                  </p>
                )}
              </section>
            ))}
          </div>
          {data.units?.length === 0 && (
            <p className={pmsCard}>
              No registered room numbers. Ask the owner to complete the room
              register.
            </p>
          )}
          {data.role !== "housekeeper" && (
            <section className={pmsCard}>
              <h2 className="font-bold">Schedule maintenance</h2>
              <p className="mt-1 text-sm text-slate-500">
                Blocks the numbered room and shared sellable inventory.
                Conflicting reservations cannot be overwritten. Enter times in
                your device’s local timezone.
              </p>
              <form
                className="mt-4 grid gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget),
                    u = data.units?.find((u) => u.id === f.get("unitId"));
                  if (!u) return;
                  void send({
                    action: "maintenance",
                    input: {
                      unitId: u.id,
                      roomTypeId: u.roomTypeId,
                      quantity: 1,
                      startAt: new Date(String(f.get("start"))).toISOString(),
                      endAt: new Date(String(f.get("end"))).toISOString(),
                      reason: f.get("reason"),
                    },
                  });
                }}
              >
                <label className="text-sm">
                  Room
                  <select required name="unitId" className={pmsInput}>
                    <option value="">Choose a room</option>
                    {data.units?.map((u) => (
                      <option value={u.id} key={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Reason
                  <input
                    required
                    minLength={3}
                    maxLength={500}
                    name="reason"
                    className={pmsInput}
                  />
                </label>
                <label className="text-sm">
                  Start
                  <input
                    type="datetime-local"
                    name="start"
                    required
                    className={pmsInput}
                  />
                </label>
                <label className="text-sm">
                  End
                  <input
                    type="datetime-local"
                    name="end"
                    required
                    className={pmsInput}
                  />
                </label>
                <button className={pmsButton} disabled={busy}>
                  Block room for maintenance
                </button>
              </form>
              <h3 className="mt-5 font-semibold">Active maintenance blocks</h3>
              {data.blocks?.map((b) => (
                <div
                  className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"
                  key={b.id}
                >
                  <span>
                    {data.units?.find((u) => u.id === b.unitId)?.label ||
                      "Room-type block"}{" "}
                    · {b.reason} · {new Date(b.startAt).toLocaleString()} –{" "}
                    {new Date(b.endAt).toLocaleString()}
                  </span>
                  <button
                    disabled={busy}
                    className={pmsButton}
                    onClick={() =>
                      void send({ action: "release", input: { blockId: b.id } })
                    }
                  >
                    Release block
                  </button>
                </div>
              ))}
              {data.blocks?.length === 0 && (
                <p className="mt-2 text-sm text-slate-500">
                  No active maintenance blocks.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
export function PmsDepartmentPage() {
  return (
    <PartnerShell>
      {({ selectedProperty }) =>
        selectedProperty ? (
          <DepartmentView
            key={selectedProperty.id}
            propertyId={selectedProperty.id}
          />
        ) : (
          <p>No assigned hotel.</p>
        )
      }
    </PartnerShell>
  );
}
