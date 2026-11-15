"use client";
// OWNER: Teammate B (Phone & Create). Seller form to start a new flock.
// Keep the props interface (CreateFlockProps) exactly the same.
// Visual language matches Teammate A's "Your bookings" page and the join screen.
import { useId, useState, type ReactNode } from "react";
import { Bus, CircleDollarSign, Clock3, Loader2, PlusCircle, ShieldCheck, Shirt, TriangleAlert, Users, Utensils, type LucideIcon } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { CreateFlockProps, CreateFlockValues } from "@/lib/types";
import { buildCurve, fmtUsd, priceAt } from "@/lib/flock-math";

/* ───────────────────────── data ───────────────────────── */

type NumKey = Exclude<keyof CreateFlockValues, "title" | "imageUrl">;
type Draft = { title: string; imageUrl: string } & Record<NumKey, string>;

const PRESETS: { label: string; icon: LucideIcon; values: Partial<Draft> }[] = [
  {
    label: "Van to PDX",
    icon: Bus,
    values: { title: "Van to PDX", fixedCost: "300", unitCost: "0", minBuyers: "6", maxBuyers: "12", bonusPerBuyer: "2", deadlineMinutes: "120", imageUrl: "/img/van.svg" },
  },
  {
    label: "Club hoodies",
    icon: Shirt,
    values: { title: "Club hoodies", fixedCost: "120", unitCost: "14", minBuyers: "10", maxBuyers: "40", bonusPerBuyer: "1", imageUrl: "/img/hoodie.svg" },
  },
  {
    label: "Group dinner",
    icon: Utensils,
    values: { title: "Group dinner", fixedCost: "200", unitCost: "25", minBuyers: "8", maxBuyers: "20", bonusPerBuyer: "2", imageUrl: "/img/tacos.svg" },
  },
];

const DEFAULTS: Draft = {
  title: "Van to PDX",
  imageUrl: "/img/van.svg",
  fixedCost: "300",
  unitCost: "0",
  minBuyers: "6",
  maxBuyers: "12",
  deadlineMinutes: "120",
  bonusPerBuyer: "2",
};

const card = "rounded-xl border border-slate-200 bg-white/90 shadow-sm";

function toNum(s: string): number {
  return s.trim() === "" ? NaN : Number(s);
}

function validate(d: Draft): Partial<Record<keyof Draft, string>> {
  const n = (k: NumKey) => toNum(d[k]);
  const e: Partial<Record<keyof Draft, string>> = {};
  if (!d.title.trim()) e.title = "Give the flock a name.";
  if (!(n("fixedCost") > 0)) e.fixedCost = "Setup cost must be more than $0.";
  if (!(n("unitCost") >= 0)) e.unitCost = "Per-item cost can't be negative.";
  if (!Number.isInteger(n("minBuyers")) || n("minBuyers") < 1) e.minBuyers = "Minimum must be a whole number, 1 or more.";
  if (!Number.isInteger(n("maxBuyers")) || n("maxBuyers") < 1) e.maxBuyers = "Maximum must be a whole number.";
  else if (n("maxBuyers") > 60) e.maxBuyers = "Maximum can be at most 60.";
  else if (!e.minBuyers && n("maxBuyers") < n("minBuyers")) e.maxBuyers = "Maximum must be at least the minimum.";
  if (!Number.isInteger(n("deadlineMinutes")) || n("deadlineMinutes") <= 0) e.deadlineMinutes = "Deadline must be at least 1 minute.";
  if (!(n("bonusPerBuyer") >= 0)) e.bonusPerBuyer = "Bonus can't be negative.";
  return e;
}

function fmtDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.round(minutes % 60);
  return [d && `${d}d`, h && `${h}h`, (m || (!d && !h)) && `${m}m`].filter(Boolean).join(" ");
}

/* ───────────────────────── field ───────────────────────── */

function Field({
  label,
  hint,
  error,
  prefix,
  suffix,
  children,
  id,
}: {
  label: string;
  hint?: string;
  error?: string;
  prefix?: string;
  suffix?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby": string; className: string }) => ReactNode;
  id: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <div
        className={`mt-1 flex min-h-11 items-center rounded-lg border bg-white focus-within:ring-2 ${
          error ? "border-rose-300 focus-within:ring-rose-200" : "border-slate-200 focus-within:border-sky-300 focus-within:ring-sky-100"
        }`}
      >
        {prefix && <span className="pl-3 text-sm text-slate-500">{prefix}</span>}
        {children({
          id,
          "aria-invalid": !!error,
          "aria-describedby": `${id}-help`,
          className: "min-w-0 flex-1 bg-transparent px-3 py-2 text-base tabular-nums outline-none sm:text-sm",
        })}
        {suffix && <span className="pr-3 text-sm text-slate-500">{suffix}</span>}
      </div>
      <p id={`${id}-help`} className={`mt-1 text-xs ${error ? "text-rose-800" : "text-slate-600"}`}>
        {error ?? hint}
      </p>
    </div>
  );
}

/* ───────────────────────── preview ───────────────────────── */

function PricePreview({ v, valid }: { v: CreateFlockValues; valid: boolean }) {
  const gradient = useId();
  const max = Math.min(60, Math.max(2, Math.floor(v.maxBuyers) || 2));
  const min = Math.min(max, Math.max(1, Math.floor(v.minBuyers) || 1));
  const F = v.fixedCost > 0 ? v.fixedCost : 1;
  const c = v.unitCost >= 0 ? v.unitCost : 0;
  const data = buildCurve(F, c, max).map((p) => ({ ...p, filled: p.n >= min ? p.price : null }));
  const alone = priceAt(F, c, 1);
  const atMin = priceAt(F, c, min);
  const atMax = priceAt(F, c, max);
  const bonus = v.bonusPerBuyer >= 0 ? v.bonusPerBuyer : 0;
  const bond = bonus * Math.max(0, min - 1);

  return (
    <article className={`overflow-hidden ${card}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">Price preview</h2>
          <p className="mt-1 text-sm text-slate-600">Updates as you type</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${
            valid ? "border-sky-200 bg-sky-50 text-sky-900" : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {valid ? "Ready to launch" : "Needs fixes"}
        </span>
      </header>

      <div className="grid gap-5 p-5">
        <section aria-label="Price curve" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-3xl font-bold tabular-nums text-emerald-800">{fmtUsd(atMin)}</p>
            <p className="text-sm text-slate-600">Per person at minimum</p>
          </div>
          <div className="mt-2 h-40 min-w-0 rounded-xl bg-slate-50 py-1">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 240, height: 160 }}>
              <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#18826a" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#18826a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#d7e2ec" strokeDasharray="3 6" />
                <XAxis dataKey="n" type="number" domain={[1, max]} allowDecimals={false} tickCount={5} axisLine={false} tickLine={false} tick={{ fill: "#52647a", fontSize: 12 }} />
                <YAxis tickFormatter={(x) => `$${Math.round(x)}`} width={46} tickCount={4} axisLine={false} tickLine={false} tick={{ fill: "#52647a", fontSize: 12 }} />
                <Area type="monotone" dataKey="filled" fill={`url(#${gradient})`} stroke="none" isAnimationActive={false} />
                <Line type="monotone" dataKey="price" stroke="#5c83bb" strokeDasharray="5 6" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="filled" stroke="#18826a" strokeWidth={3} dot={false} isAnimationActive={false} />
                <ReferenceLine x={min} stroke="#b45309" strokeDasharray="4 4" label={{ value: "Min", position: "insideTopRight", fill: "#92400e", fontSize: 11 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-sm text-slate-600">Price by number of paid spots. Solid line is the range once the flock is confirmed.</p>
        </section>

        <dl className="space-y-2 border-t border-slate-200 pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Alone</dt>
            <dd className="tabular-nums">{fmtUsd(alone)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">At minimum ({min})</dt>
            <dd className="tabular-nums">{fmtUsd(atMin)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">At maximum ({max})</dt>
            <dd className="tabular-nums text-emerald-800">{fmtUsd(atMax)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Deadline</dt>
            <dd className="tabular-nums">{fmtDuration(v.deadlineMinutes)} from launch</dd>
          </div>
        </dl>

        <section aria-label="Bond" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck size={16} className="text-amber-700" aria-hidden="true" /> Bond you lock
            </p>
            <strong className="tabular-nums text-amber-800">{fmtUsd(bond)}</strong>
          </div>
          <p className="mt-1 text-xs text-slate-700 tabular-nums">
            Bonus × (min − 1) = {fmtUsd(bonus)} × {Math.max(0, min - 1)}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            If the flock misses its minimum, the bond pays every buyer a bonus on top of a full refund, so joining carries no risk and the flock fills faster.
          </p>
        </section>
      </div>
    </article>
  );
}

/* ───────────────────────── main ───────────────────────── */

export default function CreateFlockForm({ loggedIn, busy, error, onLogin, onSubmit }: CreateFlockProps) {
  const uid = useId();
  const [d, setD] = useState<Draft>(DEFAULTS);
  const [preset, setPreset] = useState<string | null>("Van to PDX");
  const errors = validate(d);
  const valid = Object.keys(errors).length === 0;

  const values: CreateFlockValues = {
    title: d.title.trim(),
    imageUrl: d.imageUrl,
    fixedCost: toNum(d.fixedCost),
    unitCost: toNum(d.unitCost),
    minBuyers: toNum(d.minBuyers),
    maxBuyers: toNum(d.maxBuyers),
    deadlineMinutes: toNum(d.deadlineMinutes),
    bonusPerBuyer: toNum(d.bonusPerBuyer),
  };

  const update = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setD((cur) => ({ ...cur, [k]: e.target.value }));
    setPreset(null);
  };
  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setD((cur) => ({ ...cur, ...p.values }));
    setPreset(p.label);
  };

  const num = (k: NumKey, step = "1") =>
    function renderNumberInput(props: { id: string; "aria-invalid": boolean; "aria-describedby": string; className: string }) {
      return <input {...props} type="number" inputMode={step === "1" ? "numeric" : "decimal"} step={step} min={0} value={d[k]} onChange={update(k)} />;
    };

  const submit = () => {
    if (!loggedIn) return onLogin();
    if (valid && !busy) onSubmit(values);
  };

  return (
    <main className="min-h-[100dvh] w-full overflow-x-clip tabular-nums bg-[#f4f7fb] bg-[radial-gradient(ellipse_at_top_left,#e2efff,transparent_55%)] px-4 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[calc(1.75rem+env(safe-area-inset-bottom))] text-slate-950 sm:px-8">
      <div className="mx-auto max-w-md space-y-6 lg:max-w-6xl">
        <header className="flex items-center gap-3 border-b border-slate-200 pb-5">
          <span className="rounded-lg bg-sky-300/10 p-2 text-sky-800">
            <PlusCircle size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Start a flock</h1>
            <p className="text-sm text-slate-600">Set the costs and group size. The price drops for everyone as people join.</p>
          </div>
        </header>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start"
        >
          {/* Left column on desktop; on phones its children interleave with the preview via `order`. */}
          <div className="contents lg:flex lg:flex-col lg:gap-6">
            <section aria-label="Flock details" className={`order-1 overflow-hidden ${card}`}>
              <div className="border-b border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-800">Start from a preset</h2>
                <div role="group" aria-label="Presets" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      aria-pressed={preset === p.label}
                      onClick={() => applyPreset(p)}
                      className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-center text-xs leading-tight font-semibold sm:flex-row sm:gap-1.5 text-slate-700 hover:bg-white/70 aria-pressed:bg-white aria-pressed:text-slate-950 aria-pressed:shadow-sm sm:text-sm"
                    >
                      <p.icon size={14} className="shrink-0" aria-hidden="true" />
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 p-5">
                <Field id={`${uid}-title`} label="Name" hint="What people see on the board and on their phone." error={errors.title}>
                  {(props) => <input {...props} type="text" maxLength={80} value={d.title} onChange={update("title")} />}
                </Field>

                <fieldset className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                  <legend className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <CircleDollarSign size={16} className="text-slate-700" aria-hidden="true" /> Pricing
                  </legend>
                  <Field id={`${uid}-fixed`} label="Setup cost" prefix="$" hint="Split across everyone, such as a van rental or venue fee." error={errors.fixedCost}>
                    {num("fixedCost", "0.01")}
                  </Field>
                  <Field id={`${uid}-unit`} label="Per-item cost" prefix="$" hint="Added for each person. Use 0 for a shared ride." error={errors.unitCost}>
                    {num("unitCost", "0.01")}
                  </Field>
                </fieldset>

                <fieldset className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                  <legend className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Users size={16} className="text-slate-700" aria-hidden="true" /> Group size
                  </legend>
                  <Field id={`${uid}-min`} label="Minimum people" suffix="people" hint="Below this by the deadline, everyone is refunded." error={errors.minBuyers}>
                    {num("minBuyers")}
                  </Field>
                  <Field id={`${uid}-max`} label="Maximum people" suffix="people" hint="Up to 60." error={errors.maxBuyers}>
                    {num("maxBuyers")}
                  </Field>
                </fieldset>

                <fieldset className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                  <legend className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Clock3 size={16} className="text-slate-700" aria-hidden="true" /> Deadline and guarantee
                  </legend>
                  <Field
                    id={`${uid}-deadline`}
                    label="Deadline"
                    suffix="min"
                    hint={errors.deadlineMinutes ? undefined : `Closes ${fmtDuration(values.deadlineMinutes)} after launch.`}
                    error={errors.deadlineMinutes}
                  >
                    {num("deadlineMinutes")}
                  </Field>
                  <Field id={`${uid}-bonus`} label="Bonus per buyer if it fails" prefix="$" hint="Paid from your bond on top of each refund." error={errors.bonusPerBuyer}>
                    {num("bonusPerBuyer", "0.01")}
                  </Field>
                </fieldset>
              </div>
            </section>

            <section aria-label="Launch" className={`order-3 p-5 ${card}`}>
              {error && (
                <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span className="[overflow-wrap:anywhere]">{error}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={busy || (loggedIn && !valid)}
                aria-busy={busy}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-sky-200 px-4 text-base font-semibold text-slate-950 transition hover:bg-sky-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                    Launching on Monad…
                  </>
                ) : loggedIn ? (
                  "Launch flock"
                ) : (
                  "Sign in to launch"
                )}
              </button>
              <p className="mt-2 text-center text-xs text-slate-600">
                {!loggedIn
                  ? "Sign in with email. No wallet or gas fees required."
                  : valid
                    ? `Locks a ${fmtUsd(values.bonusPerBuyer * Math.max(0, values.minBuyers - 1))} bond from your test wallet.`
                    : `Fix ${Object.keys(errors).length} ${Object.keys(errors).length === 1 ? "field" : "fields"} to launch.`}
              </p>
            </section>
          </div>

          <aside className="order-2 min-w-0 lg:sticky lg:top-6">
            <PricePreview v={values} valid={valid} />
          </aside>
        </form>
      </div>
    </main>
  );
}
