"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  TrendingDown,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Toaster, toast } from "sonner";
import {
  api,
  configured,
  supabase,
  imageUrl,
  uploadImage,
} from "@/lib/supabase";
import {
  dateTime,
  detectMarket,
  Listing,
  markets,
  Product,
  rupiah,
  margin,
  suggestedPrice,
} from "@/lib/domain";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import dynamic from "next/dynamic";
const ImportProducts = dynamic(() => import("./import-products"), {
  loading: () => <div className="skeleton h-64" />,
});
const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/changes", label: "Price changes", icon: Activity },
  { href: "/runs", label: "Scrape logs", icon: BarChart3 },
];
const colors = [
  "#218f73",
  "#dc9651",
  "#678ed5",
  "#c7789e",
  "#7e76b7",
  "#82a664",
];
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div
        className="mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "var(--soft)", color: "var(--accent)" }}
      >
        <Radar size={26} />
      </div>
      <h3 className="font-bold text-base mb-2">{title}</h3>
      <p className="muted mb-5 max-w-md mx-auto">{text}</p>
      {action}
    </div>
  );
}
function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="muted">—</span>;
  return (
    <span className={"badge " + (value > 0 ? "red" : "")}>
      {value > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{" "}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
function PageTitle({
  label,
  title,
  description,
  actions,
}: {
  label: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
      <div>
        <div className="eyebrow mb-2">{label}</div>
        <h1 className="text-[28px] font-bold tracking-tight mb-2">{title}</h1>
        <p className="muted">{description}</p>
      </div>
      <div className="flex gap-2 flex-wrap">{actions}</div>
    </div>
  );
}
export default function App() {
  const pathname = usePathname(),
    router = useRouter();
  const [session, setSession] = useState<any>(undefined);
  const [dark, setDark] = useState(false);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    const d = localStorage.getItem("priceradar-theme") === "dark";
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    if (!configured) {
      setSession(null);
      return;
    }
    supabase()
      .auth.getSession()
      .then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase().auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  function toggleTheme() {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    localStorage.setItem("priceradar-theme", d ? "dark" : "light");
  }
  if (!configured)
    return (
      <>
        <SetupScreen />
        <Toaster richColors />
      </>
    );
  if (session === undefined)
    return (
      <div className="min-h-screen grid place-items-center">
        <Radar className="animate-pulse" size={45} />
      </div>
    );
  if (!session || recovery)
    return (
      <>
        <Auth recovery={recovery} onRecovered={() => setRecovery(false)} />
        <Toaster richColors />
      </>
    );
  const active = pathname.startsWith("/products")
    ? "/products"
    : pathname === "/"
      ? "/dashboard"
      : pathname;
  const links = nav.map((n) => (
    <Link
      href={n.href}
      key={n.href}
      className={"nav-item " + (active === n.href ? "active" : "")}
    >
      <n.icon size={18} />
      {n.label}
    </Link>
  ));
  return (
    <>
      <aside className="sidebar">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-3 mb-11"
        >
          <span
            className="p-2 rounded-xl"
            style={{ background: "var(--accent)", color: "var(--panel)" }}
          >
            <Radar size={24} />
          </span>
          <span className="text-xl font-bold tracking-tight">
            PriceRadar<span style={{ color: "var(--accent)" }}> ID</span>
          </span>
        </Link>
        <div className="eyebrow px-4 mb-4">Workspace</div>
        {links}
        <Link href="/products/import" className="nav-item">
          <Upload size={18} />
          Bulk import
        </Link>
        <div className="mt-auto">
          <div
            className="p-4 rounded-xl mb-5"
            style={{ background: "var(--soft)" }}
          >
            <ShieldCheck
              size={22}
              className="mb-3"
              style={{ color: "var(--accent)" }}
            />
            <div className="font-semibold mb-1 text-xs">
              Your margin matters.
            </div>
            <p className="text-xs muted leading-relaxed">
              A clearer view of the market. A smarter price for every product.
            </p>
          </div>
          <div
            className="border-t pt-5 flex items-center gap-2"
            style={{ borderColor: "var(--line)" }}
          >
            <div className="avatar">
              {session.user.email?.[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">
                {session.user.email}
              </div>
              <div className="text-[10px] muted mt-1">Seller workspace</div>
            </div>
            <button
              aria-label="Sign out"
              className="icon-btn"
              onClick={() => supabase().auth.signOut()}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="flex items-center gap-2 text-xs muted">
            <span className="hide-mobile">Workspace</span>
            <ChevronRight size={12} className="hide-mobile" />
            <span className="font-semibold" style={{ color: "var(--ink)" }}>
              {pathname.includes("import")
                ? "Bulk import"
                : nav.find((n) => n.href === active)?.label || "Overview"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge gray hide-mobile">Asia/Jakarta · WIB</span>
            <button
              className="icon-btn"
              aria-label="Toggle dark mode"
              onClick={toggleTheme}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Link
              href="/dashboard#alerts"
              className="icon-btn"
              aria-label="View price alerts"
            >
              <Bell size={17} />
            </Link>
            <button
              className="icon-btn md:hidden"
              aria-label="Sign out"
              onClick={() => supabase().auth.signOut()}
            >
              <LogOut size={17} />
            </button>
            <div className="avatar hide-mobile">
              {session.user.email?.[0].toUpperCase()}
            </div>
          </div>
        </header>
        <div className="content">
          {pathname === "/products/import" ? (
            <ImportProducts userId={session.user.id} />
          ) : pathname.startsWith("/products/") ? (
            <ProductDetail id={pathname.split("/")[2]} />
          ) : pathname === "/products" ? (
            <Products userId={session.user.id} />
          ) : pathname === "/changes" ? (
            <Changes />
          ) : pathname === "/runs" ? (
            <Runs />
          ) : (
            <Dashboard />
          )}
        </div>
      </main>
      <nav className="mobile-nav">{links}</nav>
      <Toaster richColors position="top-right" />
    </>
  );
}
function SetupScreen() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="panel p-9 max-w-xl">
        <div className="flex items-center gap-3 mb-8">
          <Radar size={32} style={{ color: "var(--accent)" }} />
          <h1 className="text-2xl font-bold">PriceRadar ID</h1>
        </div>
        <span className="badge mb-4">Your workspace is almost ready</span>
        <h2 className="text-2xl font-bold mb-3">
          Connect your Supabase project
        </h2>
        <p className="muted leading-relaxed mb-6">
          Your products and prices belong in your own database. Follow the
          included Supabase guide to finish setup.
        </p>
        <ol className="list-decimal pl-5 space-y-4">
          <li>Create a Supabase project and run the database migrations.</li>
          <li>
            Copy your project URL and publishable key into{" "}
            <code>.env.local</code>.
          </li>
          <li>Deploy the Edge Functions and enable the two schedules.</li>
          <li>
            Restart the app, create your account, and import your products.
          </li>
        </ol>
        <div
          className="mt-7 p-4 rounded-lg text-sm"
          style={{ background: "var(--soft)" }}
        >
          Open <strong>docs/SUPABASE_SETUP.md</strong> in the repository for the
          complete beginner-friendly guide.
        </div>
        <p className="muted text-xs mt-5">
          The app never substitutes demo data for your real workspace. Mock
          scraping is enabled only when you select it in Supabase.
        </p>
      </div>
    </main>
  );
}
const authSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "Use at least 8 characters."),
});
function Auth({
  recovery,
  onRecovered,
}: {
  recovery: boolean;
  onRecovered: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof authSchema>>({
    resolver: zodResolver(authSchema),
  });
  async function submit(v: z.infer<typeof authSchema>) {
    setBusy(true);
    try {
      const { error } = recovery
        ? await supabase().auth.updateUser({ password: v.password })
        : mode === "signup"
          ? await supabase().auth.signUp({
              ...v,
              options: {
                emailRedirectTo: window.location.origin + "/dashboard",
              },
            })
          : await supabase().auth.signInWithPassword(v);
      if (error) throw error;
      if (recovery) {
        toast.success("Password updated");
        onRecovered();
      } else if (mode === "signup")
        toast.success(
          "Account created. Check your email to confirm your address.",
        );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const email = z.email().parse(new FormData(e.currentTarget).get("email"));
      const { error } = await supabase().auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/dashboard",
      });
      if (error) throw error;
      toast.success("If this account exists, a reset email is on its way.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen grid md:grid-cols-2">
      <section
        className="p-10 md:p-20 flex flex-col justify-between"
        style={{ background: "#123f35", color: "#fff" }}
      >
        <div className="flex gap-3 items-center text-xl font-bold">
          <Radar size={30} />
          PriceRadar ID
        </div>
        <div className="py-16">
          <div className="text-xs tracking-widest text-emerald-300 mb-5">
            BUILT FOR INDONESIAN SELLERS
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight">
            Know your market.
            <br />
            Protect your margin.
          </h1>
          <p className="mt-6 text-emerald-100/70 max-w-md leading-relaxed">
            All your competitor prices, in one calm workspace. Track the right
            products and make your next pricing decision with confidence.
          </p>
          <div className="flex gap-2 flex-wrap mt-8">
            {["Shopee", "Tokopedia", "TikTok Shop", "Lazada"].map((m) => (
              <span
                key={m}
                className="border border-white/20 rounded-full px-3 py-1 text-xs"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
        <p className="text-emerald-100/50 text-xs">
          Your products. Your data. Your advantage.
        </p>
      </section>
      <section className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <span className="badge mb-4">SELLER WORKSPACE</span>
          <h2 className="text-3xl font-bold mb-3">
            {recovery
              ? "Choose a new password"
              : mode === "signup"
                ? "Start tracking smarter"
                : mode === "reset"
                  ? "Reset your password"
                  : "Welcome back"}
          </h2>
          <p className="muted mb-8">
            {mode === "signup"
              ? "Create your own secure price intelligence workspace."
              : mode === "reset"
                ? "We’ll email you a secure password reset link."
                : "Sign in to see what’s moving in your market."}
          </p>
          <form
            onSubmit={
              mode === "reset" && !recovery ? reset : handleSubmit(submit)
            }
            className="space-y-5"
          >
            <div>
              <label htmlFor="auth-email">Email address</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@yourstore.com"
                required
                id="auth-email"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>
            {(mode !== "reset" || recovery) && (
              <div>
                <label htmlFor="auth-password">Password</label>
                <input
                  type="password"
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  required
                  id="auth-password"
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.password.message}
                  </p>
                )}
              </div>
            )}
            <Button className="w-full" disabled={busy}>
              {busy
                ? "Please wait…"
                : recovery
                  ? "Update password"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "reset"
                      ? "Send reset link"
                      : "Sign in"}
              <ArrowRight size={16} />
            </Button>
          </form>
          {!recovery && (
            <div className="text-center text-sm mt-6 space-y-4">
              <p className="muted">
                {mode === "signup"
                  ? "Already have an account?"
                  : "New to PriceRadar?"}{" "}
                <button
                  className="font-semibold"
                  style={{ color: "var(--accent)" }}
                  onClick={() =>
                    setMode(mode === "signup" ? "login" : "signup")
                  }
                >
                  {mode === "signup" ? "Sign in" : "Create an account"}
                </button>
              </p>
              <button
                className="muted text-xs"
                onClick={() => setMode(mode === "reset" ? "login" : "reset")}
              >
                {mode === "reset" ? "Back to sign in" : "Forgot password?"}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [count, setCount] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api<{ data: T; count: number }>(path);
      setData(r.data);
      setCount(r.count || 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<{ data: T; count: number }>(path)
      .then((r) => {
        if (active) {
          setData(r.data);
          setCount(r.count || 0);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);
  return { data, count, loading, error, reload };
}
function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (error)
    return (
      <div className="error-box flex justify-between items-center gap-4">
        <span>{error}</span>
        <Button className="secondary" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  if (loading)
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        {[1, 2, 3, 4].map((n) => (
          <div className="skeleton h-32" key={n} />
        ))}
      </div>
    );
  return null;
}
async function scrape(body: object = {}) {
  try {
    await api("scrape", { method: "POST", body: JSON.stringify(body) });
    toast.success("Scrape queued. The worker processes jobs every minute.");
  } catch (e) {
    toast.error((e as Error).message);
  }
}
function Dashboard() {
  const { data: d, loading, error, reload } = useData<any>("dashboard");
  return (
    <>
      <PageTitle
        label="Your market, at a glance"
        title="Overview"
        description="A little clarity for your next pricing decision."
        actions={
          <>
            <Button className="secondary" onClick={reload}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button onClick={() => scrape()}>
              <Radar size={16} />
              Scrape all now
            </Button>
          </>
        }
      />
      <LoadState loading={loading} error={error} retry={reload} />
      {!loading && d && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {[
              {
                label: "Total products",
                value: d.products,
                icon: Package,
                note: "In your product catalog",
              },
              {
                label: "Listings tracked",
                value: d.listings,
                icon: Radar,
                note: "Confirmed & active listings",
              },
              {
                label: "Price drops today",
                value: d.drops,
                icon: TrendingDown,
                note: `${d.rises} price rises today`,
              },
              {
                label: "Below your COGS",
                value: d.below,
                icon: Wallet,
                note: "Products needing attention",
              },
            ].map((m, i) => (
              <div key={m.label} className="panel metric">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold muted">{m.label}</span>
                  <m.icon
                    size={17}
                    style={{
                      color:
                        i === 3 && d.below ? "var(--red)" : "var(--accent)",
                    }}
                  />
                </div>
                <div
                  className="metric-number"
                  style={{
                    color: i === 3 && d.below ? "var(--red)" : undefined,
                  }}
                >
                  {m.value.toLocaleString("id-ID")}
                </div>
                <p className="muted text-[11px]">{m.note}</p>
              </div>
            ))}
          </div>
          <div className="grid xl:grid-cols-[1fr_300px] gap-5 mb-6">
            <section className="panel p-6">
              <div className="flex justify-between mb-6">
                <div>
                  <h2 className="font-bold">Market price pulse</h2>
                  <p className="muted text-xs mt-1">
                    Daily average of tracked observations · IDR
                  </p>
                </div>
                <span className="badge gray h-fit">Last 14 days</span>
              </div>
              {d.trend.length ? (
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={d.trend}>
                      <defs>
                        <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor="#218f73"
                            stopOpacity={0.22}
                          />
                          <stop
                            offset="100%"
                            stopColor="#218f73"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--line)" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10, fill: "var(--muted)" }}
                        tickFormatter={(v) =>
                          new Date(v).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            timeZone: "Asia/Jakarta",
                          })
                        }
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                        tick={{ fontSize: 10, fill: "var(--muted)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v: any) => rupiah(Number(v))}
                        contentStyle={{
                          background: "var(--panel)",
                          border: "1px solid var(--line)",
                          borderRadius: 8,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="avg_price"
                        name="Average price"
                        stroke="#218f73"
                        strokeWidth={2.5}
                        fill="url(#green)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty
                  title="Your market pulse starts here"
                  text="Add confirmed listings and run your first scrape to see price trends."
                  action={
                    <Link href="/products" className="btn secondary">
                      Add products
                      <ArrowRight size={14} />
                    </Link>
                  }
                />
              )}
            </section>
            <aside className="panel p-6 flex flex-col">
              <span className="eyebrow mb-5">Daily price tracking</span>
              <div
                className="w-12 h-12 rounded-full grid place-items-center mb-4"
                style={{ background: "var(--soft)", color: "var(--accent)" }}
              >
                <Radar size={24} />
              </div>
              <h3 className="font-bold text-lg mb-2">
                A fresh start, every day.
              </h3>
              <p className="muted text-xs leading-relaxed mb-6">
                Your confirmed listings are scheduled for a daily check at
                midnight, Jakarta time.
              </p>
              <div
                className="border-t pt-5 mt-auto"
                style={{ borderColor: "var(--line)" }}
              >
                <div className="flex justify-between text-xs mb-3">
                  <span className="muted">Daily schedule</span>
                  <strong>00:00 WIB</strong>
                </div>
                <div className="flex justify-between text-xs mb-3">
                  <span className="muted">Last run</span>
                  <span className="badge">
                    {d.last_run?.status || "No runs yet"}
                  </span>
                </div>
                {d.last_run && (
                  <p className="muted text-[10px]">
                    {dateTime(d.last_run.started_at)} · {d.last_run.success}/
                    {d.last_run.total} succeeded
                  </p>
                )}
                <Link
                  href="/runs"
                  className="flex items-center gap-2 text-xs font-semibold mt-5"
                  style={{ color: "var(--accent)" }}
                >
                  View scrape logs
                  <ArrowRight size={14} />
                </Link>
              </div>
            </aside>
          </div>
          <section className="panel mb-6">
            <div className="p-5 flex justify-between items-center">
              <div>
                <h2 className="font-bold">Biggest movers</h2>
                <p className="muted text-xs mt-1">
                  Products with the largest change in market minimum · 24h
                </p>
              </div>
              <Link
                href="/products"
                className="text-xs font-semibold"
                style={{ color: "var(--accent)" }}
              >
                All products →
              </Link>
            </div>
            {d.movers.length ? (
              <ProductTable rows={d.movers} />
            ) : (
              <Empty
                title="No price movements yet"
                text="Changes appear after you have observations at least 24 hours apart."
              />
            )}
          </section>
          <section id="alerts" className="panel p-6">
            <h2 className="font-bold flex gap-2 items-center mb-4">
              <Bell size={17} />
              Margin watch
            </h2>
            {d.alerts.length ? (
              <div className="grid md:grid-cols-2 gap-3">
                {d.alerts.map((p: Product) => (
                  <Link
                    href={"/products/" + p.id}
                    key={p.id}
                    className="p-4 rounded-lg flex justify-between gap-3"
                    style={{ background: "var(--bg)" }}
                  >
                    <div>
                      <p className="font-semibold text-sm">{p.name}</p>
                      <p className="text-xs muted mt-1">
                        {Number(p.margin_pct) < 0
                          ? "Market minimum is below your COGS."
                          : "Competitor minimum dropped more than 10%."}
                      </p>
                    </div>
                    <Delta value={p.change_24h} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="muted text-sm">
                No margin alerts. We’ll flag prices below your COGS and drops
                over 10% here.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
function ProductTable({
  rows,
  selected,
  onSelect,
  onEdit,
}: {
  rows: Product[];
  selected?: Set<string>;
  onSelect?: (id: string) => void;
  onEdit?: (p: Product, key: string, value: string) => void;
}) {
  const cols = useMemo<ColumnDef<Product>[]>(
    () => [
      ...(onSelect
        ? [
            {
              id: "selection",
              header: () => null,
              cell: ({ row }: any) => (
                <input
                  type="checkbox"
                  aria-label={"Select " + row.original.name}
                  className="!w-4"
                  checked={selected?.has(row.original.id)}
                  onChange={() => onSelect(row.original.id)}
                />
              ),
            },
          ]
        : []),
      {
        accessorKey: "name",
        header: "Product",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            {imageUrl(row.original.image_path) ? (
              <img
                className="row-image"
                alt=""
                src={imageUrl(row.original.image_path)}
              />
            ) : (
              <div className="row-image grid place-items-center">
                <Package size={17} className="muted" />
              </div>
            )}
            <div>
              <ProductName
                product={row.original}
                onSave={
                  onEdit ? (v) => onEdit(row.original, "name", v) : undefined
                }
              />
              <div className="text-[10px] muted mt-1">
                {row.original.sku} · {row.original.category || "Uncategorized"}
                {!row.original.is_active ? " · Inactive" : ""}
              </div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "cogs",
        header: "Your COGS",
        cell: ({ row }) =>
          onEdit ? (
            <Editable
              value={row.original.cogs}
              currency
              onSave={(v) => onEdit(row.original, "cogs", v)}
            />
          ) : (
            rupiah(row.original.cogs)
          ),
      },
      {
        accessorKey: "min_price",
        header: "Market minimum",
        cell: ({ row }) => (
          <div className="font-semibold">
            {rupiah(row.original.min_price)}
            <div className="muted text-[10px] mt-1 font-normal capitalize">
              {row.original.cheapest_marketplace || "No confirmed prices"}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "change_24h",
        header: "24h change",
        cell: ({ row }) => <Delta value={row.original.change_24h} />,
      },
      {
        accessorKey: "margin_pct",
        header: "Margin at min",
        cell: ({ row }) => (
          <span
            style={{
              color:
                Number(row.original.margin_pct) < 0 ? "var(--red)" : undefined,
            }}
          >
            {row.original.margin_pct == null
              ? "—"
              : Number(row.original.margin_pct).toFixed(1) + "%"}
          </span>
        ),
      },
      ...(onEdit
        ? [
            {
              id: "selling",
              header: "My price",
              cell: ({ row }: any) => (
                <Editable
                  value={row.original.my_selling_price}
                  currency
                  onSave={(v) => onEdit(row.original, "my_selling_price", v)}
                />
              ),
            },
            {
              id: "target",
              header: "Target %",
              cell: ({ row }: any) => (
                <Editable
                  value={row.original.target_margin_pct}
                  onSave={(v) => onEdit(row.original, "target_margin_pct", v)}
                />
              ),
            },
          ]
        : []),
      {
        id: "link",
        header: "",
        cell: ({ row }) => (
          <Link
            href={"/products/" + row.original.id}
            aria-label={"View " + row.original.name}
            className="icon-btn"
          >
            <ArrowRight size={14} />
          </Link>
        ),
      },
    ],
    [onSelect, selected, onEdit],
  );
  const table = useReactTable({
    data: rows,
    columns: cols,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <div className="table-wrap">
      <table>
        <thead>
          {table.getHeaderGroups().map((h) => (
            <tr key={h.id}>
              {h.headers.map((c) => (
                <th key={c.id}>
                  {flexRender(c.column.columnDef.header, c.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id}>
              {r.getVisibleCells().map((c) => (
                <td key={c.id}>
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Editable({
  value,
  onSave,
  currency = false,
}: {
  value: number | null;
  onSave: (v: string) => void;
  currency?: boolean;
}) {
  const [edit, setEdit] = useState(false),
    [v, setV] = useState(String(value ?? ""));
  useEffect(() => setV(String(value ?? "")), [value]);
  return edit ? (
    <input
      autoFocus
      className="input-cell w-28"
      type="number"
      min={0}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setEdit(false);
        if (v !== String(value ?? "")) onSave(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setV(String(value ?? ""));
          setEdit(false);
        }
      }}
    />
  ) : (
    <button
      className="hover:underline"
      title="Click to edit"
      onClick={() => setEdit(true)}
    >
      {currency ? rupiah(value) : (value ?? "—")}
    </button>
  );
}
function Products({ userId }: { userId: string }) {
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [market, setMarket] = useState(""),
    [below, setBelow] = useState(false),
    [dropped, setDropped] = useState(false),
    [sort, setSort] = useState("created_at"),
    [page, setPage] = useState(0),
    [add, setAdd] = useState(false),
    [selected, setSelected] = useState(new Set<string>()),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const params = new URLSearchParams({
    search: query,
    market,
    below: String(below),
    dropped: String(dropped),
    page: String(page),
    sort,
    asc: String(sort === "name" || sort === "sku"),
  });
  const {
    data: rows,
    count,
    loading,
    error,
    reload,
  } = useData<Product[]>("products?" + params);
  function select(id: string) {
    setSelected((old) => {
      const s = new Set(old);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }
  async function edit(p: Product, key: string, value: string) {
    try {
      await api("products/" + p.id, {
        method: "PATCH",
        body: JSON.stringify({
          [key]: key === "name" ? value : value === "" ? null : Number(value),
        }),
      });
      toast.success("Product updated");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function bulk(action: string) {
    try {
      if (action === "scrape") await scrape({ product_ids: [...selected] });
      else
        for (const id of selected)
          await api("products/" + id, {
            method: action === "delete" ? "DELETE" : "PATCH",
            ...(action === "delete"
              ? {}
              : { body: JSON.stringify({ is_active: false }) }),
          });
      setSelected(new Set());
      setConfirm(false);
      await reload();
      if (action !== "scrape") toast.success("Products updated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function exportCSV() {
    try {
      const all: Product[] = [];
      let i = 0,
        total = 1;
      while (all.length < total) {
        const p = new URLSearchParams(params);
        p.set("page", String(i++));
        const r = await api<{ data: Product[]; count: number }>(
          "products?" + p,
        );
        total = r.count;
        if (!r.data.length) break;
        all.push(...r.data);
      }
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.json_to_sheet(
        all.map((p) => ({
          sku: p.sku,
          name: p.name,
          category: p.category,
          cogs: p.cogs,
          my_selling_price: p.my_selling_price,
          min_price: p.min_price,
          change_24h: p.change_24h,
          margin_pct: p.margin_pct,
        })),
      );
      XLSX.writeFile(
        { SheetNames: ["Products"], Sheets: { Products: sheet } },
        "priceradar-products.csv",
        { bookType: "csv" },
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <>
      <PageTitle
        label="Your catalog"
        title="Products"
        description="The right products. The right competitors. All in one place."
        actions={
          <>
            <Button className="secondary" onClick={exportCSV}>
              <Download size={15} />
              Export CSV
            </Button>
            <Link className="btn secondary" href="/products/import">
              <Upload size={15} />
              Bulk import
            </Link>
            <Button onClick={() => setAdd(true)}>
              <Plus size={16} />
              Add product
            </Button>
          </>
        }
      />
      <div className="panel">
        <div
          className="p-4 flex gap-3 flex-wrap border-b"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="relative min-w-48 flex-1">
            <Search size={15} className="absolute top-3.5 left-3 muted" />
            <input
              className="!pl-9"
              placeholder="Search by product or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter marketplace"
            className="!w-auto"
            value={market}
            onChange={(e) => {
              setMarket(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All marketplaces</option>
            {markets.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select
            aria-label="Sort products"
            className="!w-auto"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(0);
            }}
          >
            {[
              ["created_at", "Newest first"],
              ["name", "Name A–Z"],
              ["sku", "SKU A–Z"],
              ["cogs", "Highest COGS"],
              ["min_price", "Highest market price"],
              ["change_24h", "Biggest price rise"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="px-4 py-3 flex flex-wrap items-center gap-4 text-xs">
          <label className="flex gap-2 items-center !mb-0 cursor-pointer">
            <input
              type="checkbox"
              className="!w-4"
              checked={below}
              onChange={(e) => {
                setBelow(e.target.checked);
                setPage(0);
              }}
            />
            Below COGS
          </label>
          <label className="flex gap-2 items-center !mb-0 cursor-pointer">
            <input
              type="checkbox"
              className="!w-4"
              checked={dropped}
              onChange={(e) => {
                setDropped(e.target.checked);
                setPage(0);
              }}
            />
            Price dropped
          </label>
          <span className="muted ml-auto">
            {count} products · click prices to edit
          </span>
        </div>
        {selected.size > 0 && (
          <div
            className="flex gap-3 items-center p-3 text-xs"
            style={{ background: "var(--soft)" }}
          >
            <strong>{selected.size} selected</strong>
            <button onClick={() => bulk("scrape")}>Scrape</button>
            <button onClick={() => bulk("deactivate")}>Deactivate</button>
            <button className="text-red-500" onClick={() => setConfirm(true)}>
              Delete
            </button>
            <button className="ml-auto" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        )}
        <div className="p-3">
          <LoadState loading={loading} error={error} retry={reload} />
        </div>
        {!loading &&
          rows &&
          (rows.length ? (
            <ProductTable
              rows={rows}
              selected={selected}
              onSelect={select}
              onEdit={edit}
            />
          ) : (
            <Empty
              title={
                query || market || below || dropped
                  ? "No products match"
                  : "Meet your product catalog"
              }
              text="Import a spreadsheet or add your first product to start tracking the market."
              action={
                <Button onClick={() => setAdd(true)}>
                  <Plus size={15} />
                  Add product
                </Button>
              }
            />
          ))}
        <div
          className="p-4 border-t flex justify-between items-center text-xs"
          style={{ borderColor: "var(--line)" }}
        >
          <button
            onClick={() => {
              setSelected(new Set(rows?.map((p) => p.id) || []));
            }}
          >
            Select this page
          </button>
          <div className="flex gap-3 items-center">
            <span className="muted">
              Page {page + 1} of {Math.max(1, Math.ceil(count / 50))}
            </span>
            <button
              aria-label="Previous page"
              className="icon-btn"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              aria-label="Next page"
              className="icon-btn"
              disabled={(page + 1) * 50 >= count}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
      <ProductForm
        open={add}
        setOpen={setAdd}
        userId={userId}
        onSaved={reload}
      />
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete selected products?"
      >
        <p className="muted mb-6">
          This permanently deletes {selected.size} products, their listings, and
          all price history. This cannot be undone.
        </p>
        <Button className="danger" onClick={() => bulk("delete")}>
          Delete {selected.size} products
        </Button>
      </Dialog>
    </>
  );
}
function ProductForm({
  open,
  setOpen,
  userId,
  onSaved,
  product,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  userId: string;
  onSaved: () => void;
  product?: Product;
}) {
  const [busy, setBusy] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [cogs, setCogs] = useState(product?.cogs ? String(product.cogs) : "");
  useEffect(() => {
    if (open) {
      setCogs(product?.cogs ? String(product.cogs) : "");
      setFile(null);
    }
  }, [open, product]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const path = file
        ? await uploadImage(file, userId)
        : (product?.image_path ?? null);
      const payload = {
        sku: form.get("sku"),
        name: form.get("name"),
        category: form.get("category"),
        cogs: Number(cogs),
        target_margin_pct: Number(form.get("target_margin_pct")),
        my_selling_price: form.get("my_selling_price")
          ? Number(form.get("my_selling_price"))
          : null,
        notes: form.get("notes"),
        image_path: path,
      };
      await api("products" + (product ? "/" + product.id : ""), {
        method: product ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      toast.success("Product saved");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={product ? "Edit product" : "Add a product"}
    >
      <form
        onSubmit={submit}
        className="space-y-4"
        onPaste={(e) => {
          const f = [...e.clipboardData.files].find((f) =>
            f.type.startsWith("image/"),
          );
          if (f) {
            e.preventDefault();
            setFile(f);
          }
        }}
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="product-sku">SKU</label>
            <input
              required
              id="product-sku"
              name="sku"
              defaultValue={product?.sku}
              maxLength={100}
            />
          </div>
          <div>
            <label htmlFor="product-category">Category</label>
            <input
              id="product-category"
              name="category"
              defaultValue={product?.category}
              maxLength={100}
            />
          </div>
        </div>
        <div>
          <label htmlFor="product-name">Product name</label>
          <input
            required
            id="product-name"
            name="name"
            defaultValue={product?.name}
            maxLength={300}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="product-cogs">COGS / modal (Rp)</label>
            <input
              id="product-cogs"
              inputMode="numeric"
              required
              value={cogs ? Number(cogs).toLocaleString("id-ID") : ""}
              onChange={(e) => setCogs(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <label htmlFor="product-target_margin_pct">Target margin (%)</label>
            <input
              type="number"
              id="product-target_margin_pct"
              name="target_margin_pct"
              min={0}
              max={99}
              step="0.1"
              defaultValue={product?.target_margin_pct ?? 20}
              required
            />
          </div>
        </div>
        <div>
          <label htmlFor="product-my_selling_price">
            My selling price (Rp, optional)
          </label>
          <input
            type="number"
            id="product-my_selling_price"
            name="my_selling_price"
            min={1}
            defaultValue={product?.my_selling_price ?? ""}
          />
        </div>
        <div
          className="dropzone !p-5"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setFile(e.dataTransfer.files[0] || null);
          }}
        >
          <label className="cursor-pointer">
            <Upload size={20} className="mx-auto mb-2" />
            {file ? file.name : "Drop, choose, or paste a product image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <span className="muted text-xs">
            JPG, PNG, WebP · up to 5 MB · public product photos only
          </span>
        </div>
        <div>
          <label htmlFor="product-notes">Notes</label>
          <textarea
            id="product-notes"
            name="notes"
            maxLength={5000}
            defaultValue={product?.notes}
            rows={2}
          />
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Saving…" : "Save product"}
        </Button>
      </form>
    </Dialog>
  );
}
function ProductDetail({ id }: { id: string }) {
  const {
      data: ps,
      loading,
      error,
      reload,
    } = useData<Product[]>("products/" + id),
    { data: listings, reload: reloadListings } = useData<Listing[]>(
      "listings?product=" + id,
    );
  const [days, setDays] = useState("30");
  const { data: history, reload: reloadHistory } = useData<any[]>(
    "history?product=" + id + "&days=" + days,
  );
  const [listingOpen, setListingOpen] = useState(false),
    [editOpen, setEditOpen] = useState(false),
    [uid, setUid] = useState("");
  const [strategy, setStrategy] = useState("target"),
    [undercut, setUndercut] = useState(2),
    [floor, setFloor] = useState(10);
  useEffect(() => {
    supabase()
      .auth.getUser()
      .then(({ data }) => setUid(data.user?.id || ""));
  }, []);
  const refresh = () => {
    reload();
    reloadListings();
    reloadHistory();
  };
  const product = ps?.[0];
  const chart = useMemo(() => {
    const map = new Map<string, any>();
    for (const h of history || []) {
      const row = map.get(h.day) || { day: h.day };
      row[h.listing_id] = Number(h.price);
      map.set(h.day, row);
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [history]);
  if (loading || error)
    return <LoadState loading={loading} error={error} retry={reload} />;
  if (!product)
    return (
      <Empty
        title="Product not found"
        text="It may have been deleted or belong to another workspace."
      />
    );
  const suggestion = suggestedPrice(
      strategy,
      Number(product.cogs),
      product.min_price,
      product.median_price,
      Number(product.target_margin_pct),
      undercut,
    ),
    suggestionMargin = suggestion
      ? margin(suggestion, Number(product.cogs))
      : null;
  return (
    <>
      <Link
        href="/products"
        className="flex gap-1 items-center muted text-xs mb-5"
      >
        <ChevronLeft size={14} />
        Back to products
      </Link>
      <PageTitle
        label={product.sku + " · " + (product.category || "Uncategorized")}
        title={product.name}
        description={
          product.notes || "Compare your costs with the prices that matter."
        }
        actions={
          <>
            <Button className="secondary" onClick={() => setEditOpen(true)}>
              <Settings2 size={15} />
              Edit product
            </Button>
            <Button className="secondary" onClick={refresh}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button onClick={() => scrape({ product_ids: [id] })}>
              <Radar size={15} />
              Scrape product
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          ["Your COGS", rupiah(product.cogs)],
          ["Market minimum", rupiah(product.min_price)],
          ["Market median", rupiah(product.median_price)],
          ["My selling price", rupiah(product.my_selling_price)],
        ].map(([l, v]) => (
          <div key={l} className="panel metric">
            <div className="muted text-xs">{l}</div>
            <div className="text-xl font-bold mt-3">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid xl:grid-cols-[1fr_300px] gap-5 mb-6">
        <section className="panel p-6">
          <div className="flex justify-between mb-5">
            <h2 className="font-bold">Price history</h2>
            <select
              aria-label="History range"
              className="!w-auto !py-1"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            >
              {["7", "30", "90"].map((d) => (
                <option value={d} key={d}>
                  {d} days
                </option>
              ))}
            </select>
          </div>
          {chart.length ? (
            <>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                    />
                    <YAxis
                      tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                    />
                    <Tooltip
                      formatter={(v: any) => rupiah(Number(v))}
                      contentStyle={{
                        background: "var(--panel)",
                        border: "1px solid var(--line)",
                      }}
                    />
                    {listings?.map((l, i) => (
                      <Line
                        key={l.id}
                        dataKey={l.id}
                        name={
                          l.marketplace +
                          " · " +
                          (l.shop_name || l.id.slice(0, 5))
                        }
                        stroke={colors[i % colors.length]}
                        dot={false}
                        connectNulls={false}
                        strokeWidth={2}
                      />
                    ))}
                    <ReferenceLine
                      y={Number(product.cogs)}
                      stroke="#d04c4c"
                      strokeDasharray="5 5"
                      label={{ value: "COGS", fill: "#d04c4c", fontSize: 10 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-3 text-[10px] muted mt-4">
                {listings?.map((l, i) => (
                  <span key={l.id} className="flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: colors[i % colors.length] }}
                    />
                    {l.marketplace} · {l.shop_name || l.id.slice(0, 5)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <Empty
              title="No price history yet"
              text="Add a confirmed listing, then scrape it to start your chart."
            />
          )}
        </section>
        <aside className="panel p-6">
          <h2 className="font-bold mb-1">Find your next price</h2>
          <p className="muted text-xs mb-5">
            A suggestion, with your margin in view.
          </p>
          <label htmlFor="pricing-strategy">Pricing strategy</label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
          >
            <option value="target">Target margin</option>
            <option value="min">Match lowest</option>
            <option value="undercut">Undercut lowest</option>
            <option value="median">Match median</option>
          </select>
          {strategy === "undercut" && (
            <div className="mt-4">
              <label>Undercut by (%)</label>
              <input
                type="number"
                min={0}
                max={99}
                value={undercut}
                onChange={(e) =>
                  setUndercut(Math.max(0, Math.min(99, Number(e.target.value))))
                }
              />
            </div>
          )}
          <div className="mt-4">
            <label>Minimum margin warning (%)</label>
            <input
              type="number"
              min={0}
              max={99}
              value={floor}
              onChange={(e) => setFloor(Number(e.target.value))}
            />
          </div>
          <div
            className="mt-5 p-4 rounded-lg"
            style={{ background: "var(--soft)" }}
          >
            <div className="text-[10px] muted mb-2">
              SUGGESTED SELLING PRICE
            </div>
            <div className="text-2xl font-bold">
              {rupiah(suggestion == null ? null : Math.ceil(suggestion))}
            </div>
            <p className="text-xs mt-2">
              {suggestionMargin === null
                ? "Add a market price first."
                : suggestionMargin.toFixed(1) + "% margin"}
            </p>
          </div>
          {suggestionMargin !== null && suggestionMargin < floor && (
            <p className="text-xs text-red-500 mt-3">
              {suggestionMargin < 0
                ? "This price is below your COGS."
                : "This price is below your margin floor."}
            </p>
          )}
          <Button
            className="w-full mt-4"
            disabled={!suggestion}
            onClick={async () => {
              try {
                await api("products/" + id, {
                  method: "PATCH",
                  body: JSON.stringify({
                    my_selling_price: Math.ceil(suggestion!),
                  }),
                });
                toast.success("Selling price updated");
                reload();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Use this price
          </Button>
        </aside>
      </div>
      <section className="panel">
        <div className="p-5 flex justify-between items-center gap-3">
          <div>
            <h2 className="font-bold">Marketplace listings</h2>
            <p className="text-xs muted mt-1">
              Only confirmed, active listings are tracked. Always verify the
              product and variant.
            </p>
          </div>
          <Button onClick={() => setListingOpen(true)}>
            <Plus size={15} />
            Add listing
          </Button>
        </div>
        {listings?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Listing",
                    "Price / 24h",
                    "Match",
                    "Tracking",
                    "Last checked",
                    "Actions",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => {
                  const delta = l.delta_24h;
                  return (
                    <tr key={l.id}>
                      <td>
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold capitalize inline-flex items-center gap-2"
                        >
                          {l.marketplace}
                          <ExternalLink size={12} />
                        </a>
                        <p className="text-xs muted max-w-56 truncate mt-1">
                          {l.title || l.shop_name || l.url}
                        </p>
                      </td>
                      <td>
                        {rupiah(l.last_price)}
                        <div className="mt-1">
                          <Delta value={delta} />
                        </div>
                      </td>
                      <td>
                        <select
                          aria-label="Match status"
                          className="!w-auto !py-1 text-xs"
                          value={l.match_status}
                          onChange={async (e) => {
                            try {
                              await api("listings/" + l.id, {
                                method: "PATCH",
                                body: JSON.stringify({
                                  match_status: e.target.value,
                                }),
                              });
                              refresh();
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          {["suggested", "confirmed", "rejected"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label="Enable tracking"
                          className="!w-4"
                          type="checkbox"
                          checked={l.is_active}
                          onChange={async (e) => {
                            try {
                              await api("listings/" + l.id, {
                                method: "PATCH",
                                body: JSON.stringify({
                                  is_active: e.target.checked,
                                }),
                              });
                              refresh();
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        />
                      </td>
                      <td className="text-xs">
                        <div>
                          {l.last_scraped_at
                            ? dateTime(l.last_scraped_at)
                            : "Not yet checked"}
                        </div>
                        <span className="muted">{l.last_status || "—"}</span>
                      </td>
                      <td>
                        <Button
                          className="secondary !py-1.5 !text-xs"
                          disabled={
                            l.match_status !== "confirmed" || !l.is_active
                          }
                          onClick={() => scrape({ listing_id: l.id })}
                        >
                          Scrape now
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Connect your first competitor"
            text="Paste a marketplace product URL or search for candidates. You decide which matches to trust."
            action={
              <Button onClick={() => setListingOpen(true)}>
                Add a listing
              </Button>
            }
          />
        )}
      </section>
      <ListingForm
        open={listingOpen}
        setOpen={setListingOpen}
        product={product}
        onSaved={refresh}
      />
      <ProductForm
        open={editOpen}
        setOpen={setEditOpen}
        product={product}
        userId={uid}
        onSaved={refresh}
      />
    </>
  );
}
function ListingForm({
  open,
  setOpen,
  product,
  onSaved,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  product: Product;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState("url"),
    [busy, setBusy] = useState(false),
    [candidates, setCandidates] = useState<any[]>([]),
    [market, setMarket] = useState("shopee"),
    [keyword, setKeyword] = useState(product.name),
    [confirmed, setConfirmed] = useState(false);
  async function save(url: string, status: string, title = "") {
    setBusy(true);
    try {
      detectMarket(url);
      await api("listings", {
        method: "POST",
        body: JSON.stringify({
          product_id: product.id,
          url,
          title,
          match_status: status,
        }),
      });
      toast.success("Listing added as " + status);
      onSaved();
      if (tab === "url") setOpen(false);
      else setCandidates((c) => c.filter((x) => x.url !== url));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Add marketplace listings">
      <div className="flex gap-2 mb-5">
        <Button
          className={tab === "url" ? "" : "secondary"}
          onClick={() => setTab("url")}
        >
          Paste URL
        </Button>
        <Button
          className={tab === "search" ? "" : "secondary"}
          onClick={() => setTab("search")}
        >
          Search candidates
        </Button>
      </div>
      {tab === "url" ? (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save(
              String(new FormData(e.currentTarget).get("url")),
              confirmed ? "confirmed" : "suggested",
            );
          }}
        >
          <div>
            <label htmlFor="listing-url">Marketplace product URL</label>
            <input
              id="listing-url"
              name="url"
              type="url"
              required
              placeholder="https://shopee.co.id/…"
            />
            <p className="text-xs muted mt-2">
              Shopee, Tokopedia, TikTok Shop, Lazada, Blibli, Bukalapak
            </p>
          </div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="!w-4 mt-0.5"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I checked this is the same product, variant, and pack size.
              Confirm this match.
            </span>
          </label>
          <Button className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Add listing"}
          </Button>
        </form>
      ) : (
        <>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await api("search", {
                  method: "POST",
                  body: JSON.stringify({ marketplace: market, keyword }),
                });
                setCandidates(r.data);
                if (!r.data.length)
                  toast.info(
                    "No candidates found. Try a different keyword or paste a URL.",
                  );
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <select
              aria-label="Search marketplace"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
            >
              {markets.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input
              aria-label="Search keywords"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              required
              minLength={2}
            />
            <Button disabled={busy} className="w-full">
              <Search size={15} />
              {busy ? "Searching…" : "Find candidates"}
            </Button>
          </form>
          <p className="muted text-xs my-4">
            Search needs a live scraping provider. Candidates are never
            confirmed automatically.
          </p>
          <div className="space-y-3">
            {candidates.map((c) => (
              <div key={c.url} className="panel p-3">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-sm"
                >
                  {c.title} ↗
                </a>
                <div className="flex gap-2 mt-3">
                  {["confirmed", "suggested", "rejected"].map((s) => (
                    <Button
                      key={s}
                      className="secondary !py-1 !text-xs"
                      disabled={busy}
                      onClick={() => save(c.url, s, c.title)}
                    >
                      {s === "confirmed"
                        ? "Confirm"
                        : s === "rejected"
                          ? "Reject"
                          : "Save suggested"}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Dialog>
  );
}
function Changes() {
  const [page, setPage] = useState(0);
  const { data, loading, error, reload } = useData<any[]>(
    "changes?page=" + page,
  );
  return (
    <>
      <PageTitle
        label="Every move, recorded"
        title="Price changes"
        description="A chronological view of the market. Green means a lower competitor price."
        actions={
          <Button className="secondary" onClick={reload}>
            <RefreshCw size={15} />
            Refresh
          </Button>
        }
      />
      <LoadState loading={loading} error={error} retry={reload} />
      <section className="panel">
        {data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Product",
                    "Marketplace",
                    "Previous price",
                    "New price",
                    "Change",
                    "Observed (WIB)",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <Link
                        className="font-semibold hover:underline"
                        href={"/products/" + h.product_id}
                      >
                        {h.product_name}
                      </Link>
                      <div className="text-xs muted mt-1">{h.sku}</div>
                    </td>
                    <td className="capitalize">{h.marketplace}</td>
                    <td className="muted">{rupiah(h.old_price)}</td>
                    <td className="font-semibold">
                      {rupiah(h.price)}
                      {h.suspicious && (
                        <span className="badge red ml-2">Suspicious</span>
                      )}
                    </td>
                    <td>
                      <Delta value={h.change_pct} />
                    </td>
                    <td className="text-xs muted">{dateTime(h.scraped_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && (
            <Empty
              title="Quiet market, for now"
              text="Changes appear here when a new price differs from its previous observation."
            />
          )
        )}
        <div className="p-4 flex gap-3 justify-end items-center">
          <span className="text-xs muted">Page {page + 1}</span>
          <Button
            className="secondary"
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            className="secondary"
            disabled={(data?.length || 0) < 50}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </section>
    </>
  );
}
function Runs() {
  const { data, loading, error, reload } = useData<any[]>("runs");
  const [open, setOpen] = useState<string | null>(null),
    [jobs, setJobs] = useState<any[]>([]),
    [jobLoading, setJobLoading] = useState(false);
  async function expand(id: string) {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    setJobs([]);
    setJobLoading(true);
    try {
      setJobs((await api("runs/" + id)).data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setJobLoading(false);
    }
  }
  return (
    <>
      <PageTitle
        label="Behind the prices"
        title="Scrape logs"
        description="See what ran, what succeeded, and what needs another look."
        actions={
          <>
            <Button className="secondary" onClick={reload}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button onClick={() => scrape()}>
              <Radar size={15} />
              Scrape all now
            </Button>
          </>
        }
      />
      <LoadState loading={loading} error={error} retry={reload} />
      <section className="panel">
        {data?.length ? (
          <div>
            {data.map((r) => (
              <div
                className="border-b last:border-0"
                style={{ borderColor: "var(--line)" }}
                key={r.id}
              >
                <button
                  className="w-full p-5 flex items-center justify-between gap-3 text-left"
                  onClick={() => expand(r.id)}
                >
                  <div>
                    <div className="font-semibold">
                      {r.trigger === "cron"
                        ? "Scheduled daily scrape"
                        : "Manual scrape"}{" "}
                      <span
                        className={
                          "badge ml-2 " +
                          (["failed", "partial"].includes(r.status)
                            ? "red"
                            : "")
                        }
                      >
                        {r.status}
                      </span>
                    </div>
                    <div className="muted text-xs mt-2">
                      {dateTime(r.started_at)}
                      {r.finished_at
                        ? " → " + dateTime(r.finished_at)
                        : " · processing / waiting for worker"}
                    </div>
                  </div>
                  <div className="text-xs text-right">
                    <span style={{ color: "var(--accent)" }}>
                      {r.success} succeeded
                    </span>
                    <span className="text-red-500 ml-3">{r.failed} failed</span>
                    <div className="muted mt-2">
                      {r.total} total jobs · {open === r.id ? "Hide" : "View"}{" "}
                      details
                    </div>
                  </div>
                </button>
                {open === r.id && (
                  <div className="px-5 pb-5">
                    {jobLoading ? (
                      <div className="skeleton h-16" />
                    ) : (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              {["Listing", "Status", "Attempts", "Error"].map(
                                (h) => (
                                  <th key={h}>{h}</th>
                                ),
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {jobs.map((j) => (
                              <tr key={j.id}>
                                <td className="text-xs">
                                  <a
                                    href={j.listings?.url}
                                    rel="noopener noreferrer"
                                    target="_blank"
                                  >
                                    {j.listings?.title ||
                                      j.listings?.marketplace ||
                                      j.listing_id}{" "}
                                    ↗
                                  </a>
                                </td>
                                <td>
                                  <span
                                    className={
                                      "badge " +
                                      (j.status === "failed" ? "red" : "gray")
                                    }
                                  >
                                    {j.status}
                                  </span>
                                </td>
                                <td>{j.attempts}/3</td>
                                <td className="text-xs text-red-500 !whitespace-normal max-w-sm">
                                  {j.error || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {jobs.length === 500 && (
                          <p className="muted text-xs mt-3">
                            Showing the first 500 jobs. Use Supabase to inspect
                            the full run.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          !loading && (
            <Empty
              title="Your first run is ahead"
              text="Add a confirmed listing, then choose “Scrape all now”. Jobs are processed every minute once scheduling is configured."
            />
          )
        )}
      </section>
    </>
  );
}

function ProductName({
  product,
  onSave,
}: {
  product: Product;
  onSave?: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  useEffect(() => setName(product.name), [product.name]);
  if (editing)
    return (
      <input
        aria-label="Edit product name"
        className="input-cell"
        value={name}
        autoFocus
        maxLength={300}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (name.trim() && name !== product.name) onSave?.(name.trim());
          else setName(product.name);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setName(product.name);
            setEditing(false);
          }
        }}
      />
    );
  return (
    <div className="flex gap-2 items-center">
      <Link
        className="font-semibold hover:underline"
        href={"/products/" + product.id}
      >
        {product.name}
      </Link>
      {onSave && (
        <button
          className="muted text-[10px]"
          aria-label={"Edit name of " + product.name}
          onClick={() => setEditing(true)}
        >
          edit
        </button>
      )}
    </div>
  );
}
