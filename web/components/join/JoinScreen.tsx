"use client";
// OWNER: Teammate B (Phone & Create). The screen every audience member sees after scanning the QR.
// Keep the props interface (JoinScreenProps) exactly the same.
// Visual language matches Teammate A's "Your bookings" page (components/receipt/BuyerProfile + TripCard).
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Bus,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  CircleDollarSign,
  Clock3,
  History,
  House,
  Loader2,
  Mountain,
  Shirt,
  TrainFront,
  TriangleAlert,
  Users,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { FlockState, JoinScreenProps } from "@/lib/types";
import { fmtUsd } from "@/lib/flock-math";

/* ───────────────────────── helpers ───────────────────────── */

const card = "rounded-xl border border-slate-200 bg-white/90 shadow-sm";
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

/** Ticks once per second on the client only (avoids SSR hydration mismatch). */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Animates a number from its previous value to `value`. */
function useCountUp(value: number, durationMs = 700): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const v = from + (value - from) * (1 - Math.pow(1 - p, 3));
      fromRef.current = v;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  return display;
}

function fmtDate(ms: number, now: number | null): string {
  return now === null ? "—" : dateFormat.format(ms);
}

function remaining(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m left` : `${minutes} min left`;
}

function ago(at: number, now: number | null): string {
  if (now === null) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** Picks a line icon from the flock title, like the bookings list does. */
function iconFor(title: string): LucideIcon {
  const t = title.toLowerCase();
  if (/van|bus|shuttle|ride|pdx/.test(t)) return t.includes("ski") ? Mountain : Bus;
  if (/cabin|house|lodge|stay|airbnb/.test(t)) return House;
  if (/hoodie|shirt|merch|tee/.test(t)) return Shirt;
  if (/taco|dinner|food|lunch|pizza|meal/.test(t)) return Utensils;
  if (/train|rail/.test(t)) return TrainFront;
  if (/ski|hood|hike|mountain/.test(t)) return Mountain;
  return Users;
}

/** Strips trailing emoji from titles so the formal layout stays text-only. */
function cleanTitle(title: string): string {
  return title.replace(/[\p{Extended_Pictographic}‍️]/gu, "").replace(/\s{2,}/g, " ").trim();
}

type Category = "current" | "upcoming" | "past";
const CATEGORIES = [
  { id: "current", label: "Current", icon: Clock3, hint: "Still filling or awaiting settlement" },
  { id: "upcoming", label: "Upcoming", icon: CalendarDays, hint: "Paid and confirmed. Trip ahead." },
  { id: "past", label: "Past", icon: History, hint: "Finished or canceled bookings" },
] as const;

function categoryOf(f: FlockState, now: number): Category {
  if (f.status === "success") return "upcoming";
  if (f.status === "failed" || (now >= f.deadline && f.n < f.minBuyers)) return "past";
  return "current";
}

/** Loads the public flock list so the phone can show Current / Upcoming / Past like the bookings page. */
function useFlockList(): FlockState[] | null {
  const [list, setList] = useState<FlockState[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/flocks")
        .then((r) => (r.ok ? r.json() : { flocks: [] }))
        .then((d: { flocks?: FlockState[] }) => alive && setList(Array.isArray(d.flocks) ? d.flocks : []))
        .catch(() => alive && setList([]));
    load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return list;
}

/* ───────────────────────── sidebar ───────────────────────── */

function MoneyCard({
  flock,
  me,
  loggedIn,
  busy,
  canJoin,
  onLogin,
  onJoin,
}: Pick<JoinScreenProps, "flock" | "me" | "loggedIn" | "busy" | "onLogin" | "onJoin"> & { canJoin: boolean }) {
  const returned = useCountUp(Math.max(0, me.rebatesSoFar));
  const joined = me.joined;
  return (
    <section aria-label="Money overview" className={`${card} p-4`}>
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <CircleDollarSign size={16} aria-hidden="true" /> {joined ? "Your price" : "You owe"}
      </div>
      <motion.p
        key={joined ? flock.price : flock.nextPrice}
        initial={{ color: "#065f46" }}
        animate={{ color: "#020617" }}
        transition={{ duration: 0.8 }}
        className="mt-1 text-3xl font-semibold tabular-nums"
      >
        {fmtUsd(joined ? flock.price : flock.nextPrice)}
      </motion.p>

      {!joined && (
        <>
          <p className="mt-3 flex items-start justify-between gap-2 text-sm text-amber-800">
            <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{cleanTitle(flock.title)}</span>
            <span className="ml-auto whitespace-nowrap tabular-nums">{fmtUsd(flock.nextPrice)}</span>
            <ArrowUpRight size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          </p>
          {flock.status === "open" && (
            <>
              <button
                type="button"
                onClick={loggedIn ? onJoin : onLogin}
                disabled={busy || (loggedIn && !canJoin)}
                aria-busy={busy}
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-sky-200 px-4 text-base font-semibold text-slate-950 transition hover:bg-sky-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                    Confirming payment…
                  </>
                ) : !loggedIn ? (
                  "Sign in with email to join"
                ) : canJoin ? (
                  `Join for ${fmtUsd(flock.nextPrice)}`
                ) : (
                  "Joining is closed"
                )}
              </button>
              <p className="mt-2 text-center text-xs text-slate-600">
                {loggedIn ? "Settles in about one second on Monad." : "No wallet or gas fees required."}
              </p>
            </>
          )}
        </>
      )}

      <dl className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-sm">
        {joined ? (
          <>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Paid at join</dt>
              <dd className="tabular-nums">{fmtUsd(me.paidAtJoin ?? 0)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Money returned</dt>
              <dd className="tabular-nums text-emerald-800">{fmtUsd(returned)}</dd>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Price alone</dt>
              <dd className="tabular-nums text-slate-500 line-through">{fmtUsd(flock.soloPrice)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">You save</dt>
              <dd className="tabular-nums text-emerald-800">{fmtUsd(Math.max(0, flock.soloPrice - flock.nextPrice))}</dd>
            </div>
          </>
        )}
        {loggedIn && (
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Test wallet</dt>
            <dd className="tabular-nums">{fmtUsd(me.balance)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function FlockNav({ flock, now }: Pick<JoinScreenProps, "flock"> & { now: number | null }) {
  const fetched = useFlockList();
  const t = now ?? flock.deadline - 1;
  const all = [flock, ...(fetched ?? []).filter((f) => f.id !== flock.id)];
  const [category, setCategory] = useState<Category>(() => categoryOf(flock, Date.now()));
  const visible = all.filter((f) => categoryOf(f, t) === category);
  const hint = CATEGORIES.find((c) => c.id === category)?.hint;

  return (
    <nav aria-label="Choose flock" className="space-y-3">
      <div role="group" aria-label="Flock category" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1">
        {CATEGORIES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={category === id}
            onClick={() => setCategory(id)}
            className="flex min-h-10 items-center justify-center gap-1 rounded-lg px-1 py-2 text-xs font-semibold text-slate-700 hover:bg-white/70 aria-pressed:bg-white aria-pressed:text-slate-950 aria-pressed:shadow-sm"
          >
            <Icon size={12} className="shrink-0" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <p className="px-1 text-xs text-slate-600">{hint}</p>
      <ul className="space-y-1">
        {visible.map((f) => {
          const Icon = iconFor(f.title);
          const here = f.id === flock.id;
          return (
            <li key={f.id}>
              <a
                href={`/f/${f.id}`}
                aria-current={here ? "page" : undefined}
                onClick={here ? (e) => e.preventDefault() : undefined}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-white/70 aria-[current=page]:border-sky-200/60 aria-[current=page]:bg-sky-300/10 aria-[current=page]:text-slate-950"
              >
                <Icon size={17} className="shrink-0 text-sky-800" aria-hidden="true" />
                <span className="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]">{cleanTitle(f.title)}</span>
              </a>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-3 py-2.5 text-sm text-slate-600">{fetched === null ? "Loading…" : "No flocks in this category."}</li>
        )}
      </ul>
    </nav>
  );
}

/* ───────────────────────── trip card ───────────────────────── */

function PriceCurve({ flock }: Pick<JoinScreenProps, "flock">) {
  const gradient = useId();
  const data = flock.curve.map((p) => ({ ...p, reached: p.n <= flock.n ? p.price : null }));
  return (
    <div className="mt-2 h-40 min-w-0 rounded-xl bg-slate-50 py-1">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 240, height: 160 }}>
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#18826a" stopOpacity={0.42} />
              <stop offset="100%" stopColor="#18826a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#d7e2ec" strokeDasharray="3 6" />
          <XAxis
            dataKey="n"
            type="number"
            domain={[1, Math.max(2, flock.maxBuyers)]}
            allowDecimals={false}
            tickCount={5}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#52647a", fontSize: 12 }}
          />
          <YAxis tickFormatter={(v) => `$${v}`} width={42} tickCount={4} axisLine={false} tickLine={false} tick={{ fill: "#52647a", fontSize: 12 }} />
          <Area type="monotone" dataKey="reached" fill={`url(#${gradient})`} stroke="none" isAnimationActive={false} />
          <Line type="monotone" dataKey="price" stroke="#5c83bb" strokeDasharray="5 6" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="reached" stroke="#18826a" strokeWidth={3} dot={false} isAnimationActive={false} />
          {flock.n > 0 && (
            <ReferenceDot x={flock.n} y={flock.price} r={5} fill="#18826a" stroke="#eafff9" style={{ filter: "drop-shadow(0 0 5px #18826a)" }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function AgendaRow({ title, tag, sub, amount, tone }: { title: string; tag: string; sub: string; amount?: string; tone?: "money" }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm">
          <span className="font-semibold">{title}</span> <span className="ml-1 text-xs text-slate-600">{tag}</span>
        </p>
        <p className="mt-0.5 text-xs text-slate-600">{sub}</p>
      </div>
      {amount && <span className={`shrink-0 text-sm tabular-nums ${tone === "money" ? "font-semibold text-emerald-800" : "text-slate-900"}`}>{amount}</span>}
    </li>
  );
}

function TripCard({ flock, me, error, now }: Pick<JoinScreenProps, "flock" | "me" | "error"> & { now: number | null }) {
  const Icon = iconFor(flock.title);
  const t = now ?? flock.deadline - 1;
  const needed = Math.max(0, flock.minBuyers - flock.n);
  const spotsLeft = Math.max(0, flock.maxBuyers - flock.n);
  const open = flock.status === "open" && t < flock.deadline && flock.n < flock.maxBuyers;
  const canceled = flock.status === "failed" || (t >= flock.deadline && needed > 0);
  const confirmed = flock.status === "success";
  const status = canceled
    ? "Canceled"
    : confirmed
      ? "Confirmed"
      : !open
        ? "Awaiting settlement"
        : needed
          ? "Still filling"
          : "Minimum reached";
  const mine = flock.buyers?.find((b) => me.address && b.address?.toLowerCase() === me.address.toLowerCase());
  const paidOutcome = flock.status === "failed" ? "Refund sent" : canceled ? "Refund pending" : confirmed ? "Paid to organizer" : "Held until settlement";
  const feed = flock.feed ?? [];

  return (
    <article className={`overflow-hidden ${card}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
        <div className="min-w-0">
          <h2 className="flex items-start gap-2 text-xl font-semibold leading-snug">
            <Icon size={20} className="mt-1 shrink-0 text-sky-800" aria-hidden="true" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{cleanTitle(flock.title)}</span>
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
            <Clock3 size={14} aria-hidden="true" />
            <span>Payment deadline</span>
            <time dateTime={new Date(flock.deadline).toISOString()}>{fmtDate(flock.deadline, now)}</time>
            {open && now !== null && <span className="ml-2 text-amber-800">· {remaining(flock.deadline - now)}</span>}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${
            canceled ? "border-rose-200 bg-rose-50 text-rose-800" : "border-sky-200 bg-sky-50 text-sky-900"
          }`}
        >
          {status}
        </span>
      </header>

      {error && (
        <section role="alert" className="flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="[overflow-wrap:anywhere]">{error}</span>
        </section>
      )}

      {me.joined && (
        <section aria-label="Your payment status" className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div>
            <p className="text-sm font-semibold">{paidOutcome}</p>
            <p className="text-xs text-slate-600">
              {canceled ? "Includes the missed-minimum bonus" : confirmed ? "Final price locked in" : `Spot #${me.myIndex ?? "—"} · released or refunded at settlement`}
            </p>
          </div>
          <strong className="tabular-nums text-emerald-800">{fmtUsd(flock.price + (canceled ? flock.bonusPerBuyer : 0))}</strong>
        </section>
      )}

      <div className="grid gap-5 p-5">
        <section aria-label={`Price curve for ${flock.title}`} className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-3xl font-bold tabular-nums text-emerald-800">{fmtUsd(flock.n ? flock.price : flock.soloPrice)}</p>
            <p className="text-sm text-slate-600">{canceled ? "Price before cancellation" : "Price per person"}</p>
          </div>
          <PriceCurve flock={flock} />
          <p className="mt-2 text-sm text-slate-600">Price by number of paid spots</p>
          <p className="mt-4 text-sm font-medium">
            {flock.n}/{flock.maxBuyers} paid
            {open && (
              <>
                {" "}
                · {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
                {needed > 0 && (
                  <span className="text-amber-800">
                    {" "}
                    · {needed} more {needed === 1 ? "payment" : "payments"} to confirm
                  </span>
                )}
              </>
            )}
          </p>
          {open && needed > 0 && me.joined && (
            <p className="mt-1 text-sm text-emerald-800">{fmtUsd(flock.price + flock.bonusPerBuyer)} back to you if canceled, including the bonus.</p>
          )}
          {canceled ? (
            <p className="mt-1 text-sm text-rose-800">
              Missed the {flock.minBuyers}-person minimum. {flock.status === "failed" ? "Paid guests were refunded with a bonus." : "Refunds are pending settlement."}
            </p>
          ) : (
            open && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
                <Clock3 size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Cancels if fewer than {flock.minBuyers} people pay by the deadline. Refund plus {fmtUsd(flock.bonusPerBuyer)} bonus.
                </span>
              </p>
            )
          )}
          {flock.status !== "open" && (
            <a
              href={`/receipt/${flock.id}`}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-white text-sm font-semibold text-sky-800 hover:bg-sky-50"
            >
              View receipt <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          )}
        </section>

        <section aria-label="Trip agenda" className="min-w-0 border-t border-slate-200 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays size={16} className="text-slate-700" aria-hidden="true" /> Trip agenda
          </h3>
          <ul className="mt-1 divide-y divide-slate-200">
            <AgendaRow title="Group funding deadline" tag={open ? "Open" : "Closed"} sub={fmtDate(flock.deadline, now)} />
            {me.joined && (
              <AgendaRow
                title="Your join payment"
                tag="Paid"
                sub={`${mine ? fmtDate(mine.joinedAt, now) : "Confirmed"} · Spot #${me.myIndex ?? "—"}`}
                amount={fmtUsd(me.paidAtJoin ?? 0)}
              />
            )}
            {me.joined && me.rebatesSoFar > 0 && (
              <AgendaRow title="Price-drop rebates" tag="Received" sub="Sent back as later guests joined" amount={`+${fmtUsd(me.rebatesSoFar)}`} tone="money" />
            )}
            <AgendaRow
              title="Settlement"
              tag={flock.status === "open" ? "Scheduled" : "Complete"}
              sub={
                confirmed
                  ? "Funds released to the organizer"
                  : canceled
                    ? "Every guest refunded plus bonus"
                    : `Released at ${flock.minBuyers}+ guests, otherwise refunded plus bonus`
              }
            />
          </ul>
        </section>

        <details className="group min-w-0 border-t border-slate-200 pt-4">
          <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>
              Activity <span className="ml-1 font-normal text-slate-600 tabular-nums">{feed.length}</span>
            </span>
            <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
          </summary>
          {feed.length ? (
            <ul className="mt-2 max-h-64 divide-y divide-slate-200 overflow-y-auto">
              {feed.slice(0, 12).map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="[overflow-wrap:anywhere]">{cleanTitle(e.text)}</p>
                    <p className="text-xs text-slate-600">{ago(e.at, now)}</p>
                  </div>
                  {(e.rebatePerBuyer ?? 0) > 0 && <span className="shrink-0 tabular-nums text-emerald-800">+{fmtUsd(e.rebatePerBuyer ?? 0)}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No activity yet.</p>
          )}
        </details>

        <details className="group min-w-0 border-t border-slate-200 pt-4">
          <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            How pricing works
            <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-2 space-y-2 text-sm text-slate-600">
            <li>The price per person is the setup cost divided by the number of paid guests, plus any per-item cost.</li>
            <li>Each new guest lowers the price, and earlier guests receive the difference back immediately.</li>
            <li>If the minimum is not reached by the deadline, every guest is refunded in full plus a bonus paid by the organizer.</li>
          </ul>
        </details>
      </div>
    </article>
  );
}

/* ───────────────────────── main ───────────────────────── */

export default function JoinScreen({ flock, me, loggedIn, busy, error, lastRebateToast, onLogin, onJoin, onLogout }: JoinScreenProps) {
  const now = useNow();
  const canJoin = flock.status === "open" && flock.n < flock.maxBuyers && (now === null || now < flock.deadline);

  // Toast: show whenever lastRebateToast changes to a new non-null value, auto-hide after 2.5s.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!lastRebateToast) {
      setToast(null);
      return;
    }
    setToast(lastRebateToast);
    try {
      // Chrome blocks (and logs a console error for) vibrate before the user has tapped the page.
      const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      if (!ua || ua.hasBeenActive) navigator.vibrate?.(60);
    } catch {
      /* vibrate unsupported */
    }
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [lastRebateToast]);

  return (
    <main className="min-h-[100dvh] w-full overflow-x-clip tabular-nums bg-[#f4f7fb] bg-[radial-gradient(ellipse_at_top_left,#e2efff,transparent_55%)] px-4 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[calc(1.75rem+env(safe-area-inset-bottom))] text-slate-950 sm:px-8">
      <div className="mx-auto max-w-md space-y-6 lg:max-w-6xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-sky-300/10 p-2 text-sky-800">
              <Wallet size={20} aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Join a flock</h1>
          </div>
          {loggedIn && onLogout && (
            <button type="button" onClick={onLogout} className="min-h-11 text-sm text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline">
              Sign out
            </button>
          )}
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-5 lg:sticky lg:top-6">
            <MoneyCard flock={flock} me={me} loggedIn={loggedIn} busy={busy} canJoin={canJoin} onLogin={onLogin} onJoin={onJoin} />
            <FlockNav flock={flock} now={now} />
          </aside>
          <section aria-label="Flock details" className="min-w-0">
            <TripCard flock={flock} me={me} error={error} now={now} />
          </section>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            role="status"
            aria-live="polite"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg"
          >
            <CircleCheck size={18} className="shrink-0 text-emerald-700" aria-hidden="true" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{cleanTitle(toast)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
