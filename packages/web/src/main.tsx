import { StrictMode, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Parties } from "./pages/Parties";
import { Bills } from "./pages/Bills";
import { SimulationLog } from "./pages/SimulationLog";
import { Elections } from "./pages/Elections";
import { PartyDetail } from "./pages/PartyDetail";
import { NewsFeed } from "./pages/NewsFeed";
import { Polls } from "./pages/Polls";
import { Media } from "./pages/Media";
import { Questions } from "./pages/Questions";
import { Referendums } from "./pages/Referendums";
import { Motions } from "./pages/Motions";
import { Interpellations } from "./pages/Interpellations";
import { ConfidenceVotes } from "./pages/ConfidenceVotes";
import { ConstitutionalCourt } from "./pages/ConstitutionalCourt";
import { Budget } from "./pages/Budget";
import { About } from "./pages/About";
import { SimulationInfo } from "./pages/SimulationInfo";
import { Impressum } from "./pages/Impressum";
import { Datenschutz } from "./pages/Datenschutz";
import { Login } from "./pages/Login";
import { BillDetail } from "./pages/BillDetail";
import { Notifications } from "./pages/Notifications";
import { MyActivity } from "./pages/MyActivity";
import { MdbList } from "./pages/MdbList";
import { MdbDetail } from "./pages/MdbDetail";
import { Committees } from "./pages/Committees";
import { CommitteeDetail } from "./pages/CommitteeDetail";
import { api, setErrorHandler, type User, type SimulationStatus, type BundestagSeat, onSimStatus, onNotificationRefresh, isSocketConnected } from "./api";
import { UserContext, useUser } from "./userContext";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Menu, Bell, Pencil, Check, X, Play, Pause, Square, Zap, Gauge, Timer, Snail } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import "./locales";
import "./styles.css";

/* ── Navigation dropdown group ──────────────────────────────────── */
interface NavGroupProps {
  label: string;
  children: React.ReactNode;
}

function NavGroup({ label, children }: NavGroupProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const location = useLocation();

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const onEnter = () => { clearTimeout(timeout.current); setOpen(true); };
  const onLeave = () => { timeout.current = setTimeout(() => setOpen(false), 200); };

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <button
        className={cn(
          "flex items-center gap-1 px-2.5 py-1.5 rounded text-[13px] font-medium whitespace-nowrap transition-all duration-150",
          "text-white/70 hover:text-white hover:bg-white/10",
          open && "text-white bg-white/10"
        )}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {label}
        <svg
          className={cn("w-2 h-2 ml-0.5 transition-transform duration-150", open && "rotate-180")}
          viewBox="0 0 8 8" fill="currentColor"
        >
          <polygon points="0,0 8,0 4,5" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+2px)] left-0 min-w-[190px] bg-[#0d1b2e] border border-white/10 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.4)] py-1 z-[200] animate-in fade-in slide-in-from-top-1 duration-100">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Dropdown link styling helper ────────────────────────────────── */
function DropdownLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => cn(
        "block px-3 py-1.5 mx-1 rounded text-[13px] font-medium whitespace-nowrap transition-all duration-100",
        "text-white/70 hover:text-white hover:bg-white/10",
        isActive && "text-white bg-white/15 font-semibold"
      )}
    >
      {children}
    </NavLink>
  );
}

/* ── Mobile nav drawer (shadcn Sheet) ─────────────────────────────── */
function MobileNav({ user }: { user: User | null }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="p-1.5 text-white/70 hover:text-white" aria-label={t("aria.toggleMenu")}>
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="bg-white border-border w-[280px] p-0">
        <SheetHeader className="px-5 pt-4 pb-3 border-b border-border">
          <SheetTitle className="text-foreground font-bold">{t("nav.menu")}</SheetTitle>
        </SheetHeader>
        <nav className="py-2 overflow-y-auto max-h-[calc(100vh-80px)]">
          <MobileLink to="/" end>{t("nav.dashboard")}</MobileLink>
          <MobileGroupLabel>{t("nav.parlament")}</MobileGroupLabel>
          <MobileLink to="/mdb">{t("nav.mdb")}</MobileLink>
          <MobileLink to="/committees">{t("nav.committees")}</MobileLink>
          <MobileLink to="/bills">{t("nav.bills")}</MobileLink>
          <MobileLink to="/motions">{t("nav.motions")}</MobileLink>
          <MobileLink to="/interpellations">{t("nav.interpellations")}</MobileLink>
          <MobileLink to="/confidence-votes">{t("nav.confidenceVotes")}</MobileLink>
          <MobileLink to="/constitutional-court">{t("nav.constitutionalCourt")}</MobileLink>
          <MobileLink to="/budget">{t("nav.budget")}</MobileLink>
          <MobileGroupLabel>{t("nav.partiesAndElections")}</MobileGroupLabel>
          <MobileLink to="/parties">{t("nav.parties")}</MobileLink>
          <MobileLink to="/elections">{t("nav.elections")}</MobileLink>
          <MobileLink to="/polls">{t("nav.polls")}</MobileLink>
          <MobileGroupLabel>{t("nav.participate")}</MobileGroupLabel>
          <MobileLink to="/questions">{t("nav.citizenQuestions")}</MobileLink>
          <MobileLink to="/referendums">{t("nav.referendums")}</MobileLink>
          <MobileGroupLabel>{t("nav.news")}</MobileGroupLabel>
          <MobileLink to="/news">{t("nav.newsTicker")}</MobileLink>
          <MobileLink to="/media">{t("nav.press")}</MobileLink>
          <Separator className="mx-5 my-2" />
          <MobileLink to="/log">{t("nav.protocol")}</MobileLink>
          <MobileLink to="/about">{t("nav.about")}</MobileLink>
          <MobileLink to="/impressum">{t("nav.impressum")}</MobileLink>
          <MobileLink to="/datenschutz">{t("nav.datenschutz")}</MobileLink>
          <Separator className="mx-5 my-2" />
          {user ? (
            <>
              <div className="px-5 py-2 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white">
                  {user.displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm text-foreground font-medium">{user.displayName}</span>
              </div>
              {user.partyId && <MobileLink to={`/parties/${user.partyId}`}>{t("user.myParty")}</MobileLink>}
              <MobileLink to="/questions">{t("user.myQuestions")}</MobileLink>
              <MobileLink to="/my-activity">{t("user.myActivity")}</MobileLink>
              <MobileLogout />
            </>
          ) : (
            <NavLink to="/login" className="block px-5 py-2.5 text-sm font-semibold text-primary hover:text-primary/80">
              {t("nav.login")}
            </NavLink>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileLink({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(
        "block px-5 py-2 text-sm font-medium transition-all duration-100",
        "text-foreground/70 hover:text-foreground hover:bg-muted",
        isActive && "text-primary font-semibold bg-primary/5 border-l-2 border-primary"
      )}
    >
      {children}
    </NavLink>
  );
}

function MobileGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pt-3 pb-1 text-[0.65rem] font-bold text-muted-foreground uppercase tracking-[0.08em]">
      {children}
    </div>
  );
}

function MobileLogout() {
  const { logout } = useUser();
  const { t } = useTranslation();
  return (
    <button
      onClick={logout}
      className="w-full text-left block px-5 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 bg-transparent border-none cursor-pointer"
    >
      {t("user.logout")}
    </button>
  );
}

/* ── User avatar menu ────────────────────────────────────────── */

function UserMenu({ user }: { user: User }) {
  const { logout, updateUser } = useUser();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [seat, setSeat] = useState<BundestagSeat | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(user.displayName);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const location = useLocation();

  useEffect(() => { setOpen(false); setEditing(false); }, [location.pathname]);

  useEffect(() => {
    api.getMySeat().then(r => setSeat(r.seat)).catch(() => {});
  }, [user.id]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setEditing(false); }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const onEnter = () => { clearTimeout(timeout.current); setOpen(true); };
  const onLeave = () => { if (!editing) timeout.current = setTimeout(() => setOpen(false), 200); };

  const startEdit = () => { setEditName(user.displayName); setEditError(null); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setEditError(null); };
  const saveEdit = async () => {
    const trimmed = editName.trim();
    if (trimmed.length < 2 || trimmed.length > 30) { setEditError("2–30 Zeichen erforderlich"); return; }
    if (trimmed === user.displayName) { setEditing(false); return; }
    setSaving(true);
    try {
      const updated = await api.updateDisplayName(trimmed);
      updateUser(updated);
      setEditing(false);
      setEditError(null);
    } catch {
      setEditError("Name bereits vergeben");
    } finally { setSaving(false); }
  };

  const initials = user.displayName
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <button
        className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:bg-white/30 transition-all overflow-hidden"
        onClick={() => setOpen(o => !o)}
        aria-label={t("aria.userMenu")}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
        ) : initials}
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] right-0 min-w-[200px] bg-[#0d1b2e] border border-white/10 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.4)] py-1 z-[200] animate-in fade-in slide-in-from-top-1 duration-100">
          <div className="px-3 py-2 border-b border-white/10">
            {editing ? (
              <div>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => { setEditName(e.target.value); setEditError(null); }}
                    onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    className="w-full bg-white/10 text-white text-sm rounded px-1.5 py-0.5 border border-white/20 outline-none focus:border-white/40"
                    maxLength={30}
                    autoFocus
                    disabled={saving}
                  />
                  <button onClick={saveEdit} disabled={saving} className="p-0.5 text-emerald-400 hover:text-emerald-300 bg-transparent border-none cursor-pointer disabled:opacity-50" aria-label={t("aria.save")}>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={cancelEdit} className="p-0.5 text-white/50 hover:text-white bg-transparent border-none cursor-pointer" aria-label={t("aria.cancel")}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {editError && <div className="text-[11px] text-red-400 mt-0.5">{editError}</div>}
              </div>
            ) : (
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                {user.displayName}
                {seat && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 leading-none">MdB</span>
                )}
                <button onClick={startEdit} className="p-0.5 text-white/40 hover:text-white bg-transparent border-none cursor-pointer ml-auto" aria-label={t("aria.editName")}>
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}
            {user.partyId && (
              <div className="text-xs text-white/50 mt-0.5">{user.partyId}{seat ? ` · ${t("user.seatNumber", { number: seat.seatNumber })}` : ""}</div>
            )}
          </div>
          {user.partyId && (
            <NavLink
              to={`/parties/${user.partyId}`}
              className="block px-3 py-1.5 text-[13px] text-white/70 hover:text-white hover:bg-white/10 no-underline"
            >
              {t("user.myParty")}
            </NavLink>
          )}
          <NavLink
            to="/questions"
            className="block px-3 py-1.5 text-[13px] text-white/70 hover:text-white hover:bg-white/10 no-underline"
          >
            {t("user.myQuestions")}
          </NavLink>
          <NavLink
            to="/my-activity"
            className="block px-3 py-1.5 text-[13px] text-white/70 hover:text-white hover:bg-white/10 no-underline"
          >
            {t("user.myActivity")}
          </NavLink>
          <div className="border-t border-white/10 mt-1 pt-1">
            <button
              onClick={() => { logout(); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[13px] text-red-400 hover:text-red-300 hover:bg-white/10 bg-transparent border-none cursor-pointer"
            >
              {t("user.logout")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Simulation status indicator ───────────────────────────────── */

type SimState = "running" | "paused" | "stopped";

const PRESET_ICON: Record<string, typeof Zap> = {
  "ultra-fast": Zap, fast: Gauge, normal: Timer, slow: Snail,
};

function deriveSimState(status: SimulationStatus, now: number): SimState {
  const started = status.dayStartedAt ? new Date(status.dayStartedAt).getTime() : 0;
  const completed = status.lastRunAt ? new Date(status.lastRunAt).getTime() : 0;
  if (started > completed) {
    if (now - started < 900_000) return "running";
    return completed > 0 ? "paused" : "stopped";
  }
  if (completed > 0 && now - completed < 120_000) return "running";
  if (completed > 0) return "paused";
  return "stopped";
}

function SimStatus() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SimulationStatus | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Subscribe to WebSocket updates
    const unsub = onSimStatus(setStatus);

    // Fallback polling: fetch once on mount, then poll at 10s only when WS is disconnected
    const load = () => api.getSimulationStatus().then(setStatus).catch(() => {});
    load();
    const id = setInterval(() => {
      if (!isSocketConnected()) load();
    }, 10_000);

    return () => { unsub(); clearInterval(id); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const { running, pct } = useMemo(() => {
    if (!status?.dayStartedAt) return { running: false, pct: 0 };
    const started = new Date(status.dayStartedAt).getTime();
    const completed = status.lastRunAt ? new Date(status.lastRunAt).getTime() : 0;
    const heartbeat = status.heartbeatAt ? new Date(status.heartbeatAt).getTime() : 0;

    if (started > completed) {
      // Check heartbeat — if fresh (within 2 min), sim is alive
      const isAlive = heartbeat > 0
        ? (now - heartbeat) < 120_000
        : (now - started) < 1_800_000; // fallback for old server without heartbeat
      if (isAlive) {
        const elapsed = now - started;
        // Progress bar fills over ~5 min then holds at 95%
        return { running: true, pct: Math.min(Math.round((elapsed / 300_000) * 95), 95) };
      }
      return { running: false, pct: 0 };
    }

    const sinceCompleted = now - completed;
    if (sinceCompleted < 2_000) return { running: false, pct: 100 };
    return { running: false, pct: 0 };
  }, [status, now]);

  const simState = useMemo(() => status ? deriveSimState(status, now) : "stopped", [status, now]);

  if (!status) return null;

  const PresetIcon = PRESET_ICON[status.timingPreset] ?? Timer;

  return (
    <div className="shrink-0 flex flex-col items-end gap-0.5 min-w-[60px] md:min-w-[80px]">
      <div className="flex items-center gap-1.5 text-xs text-white/70 tabular-nums whitespace-nowrap">
        <span>{t("day", { number: status.currentDay })}</span>
        {/* State icon */}
        <span className={cn(
          "inline-flex items-center justify-center w-3.5 h-3.5 rounded-full shrink-0",
          simState === "running" && "text-emerald-400",
          simState === "paused" && "text-amber-400",
          simState === "stopped" && "text-white/40",
        )}>
          {simState === "running" && <Play className="w-2.5 h-2.5 fill-current" />}
          {simState === "paused" && <Pause className="w-2.5 h-2.5 fill-current" />}
          {simState === "stopped" && <Square className="w-2.5 h-2.5 fill-current" />}
        </span>
        {/* Mode icon */}
        <PresetIcon className="w-3 h-3 text-white/50 shrink-0" />
      </div>
      <div className="w-full h-[2px] bg-white/15 rounded-sm overflow-hidden">
        <div
          className={cn(
            "h-full rounded-sm",
            running ? "bg-emerald-400 transition-[width] duration-1000 linear" :
            pct === 100 ? "bg-emerald-400" : "bg-transparent"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ── Notification bell ────────────────────────────────────────────── */

function NotificationBell() {
  const { user } = useUser();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) { setCount(0); return; }
    const load = () => api.getUnreadCount().then(r => setCount(r.count)).catch(() => {});
    load();

    // Refresh immediately when server signals new notifications
    const unsub = onNotificationRefresh(load);

    // Fallback polling at 60s (reduced from 30s since WS handles most updates)
    const id = setInterval(load, 60_000);
    return () => { unsub(); clearInterval(id); };
  }, [user]);

  if (!user) return null;

  return (
    <Link to="/notifications" className="relative p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors">
      <Bell className="w-4 h-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full leading-none">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

/* ── Error toast ──────────────────────────────────────────────────── */

function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      className="fixed top-[56px] left-1/2 -translate-x-1/2 z-[1000] min-w-[280px] max-w-[480px] bg-destructive text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium cursor-pointer animate-in fade-in slide-in-from-top-2 duration-200"
      onClick={onDismiss}
    >
      {message}
    </div>
  );
}

/* ── Scroll to #hash after navigation ──────────────────────────── */

function ScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    // Delay slightly to let the target page render
    const timer = setTimeout(() => {
      const el = document.getElementById(hash.slice(1));
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(timer);
  }, [pathname, hash]);
  return null;
}

/* ── App ──────────────────────────────────────────────────────────── */

function App() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const handleError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 6000);
  }, []);

  useEffect(() => {
    // Check if we just came back from an OAuth redirect
    const params = new URLSearchParams(window.location.search);
    const isOAuthReturn = params.get("auth") === "success";
    if (isOAuthReturn) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    const tryAuth = () => api.getAuthMe().then(u => { if (u) setUser(u); });

    tryAuth().catch(() => {
      // On OAuth return, session may not be ready yet — retry once
      if (isOAuthReturn) setTimeout(() => tryAuth().catch(() => {}), 500);
    });
  }, []);

  useEffect(() => {
    setErrorHandler(handleError);
  }, [handleError]);

  const login = useCallback((newUser: User) => {
    setUser(newUser);
  }, []);

  const updateUser = useCallback((newUser: User) => {
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    api.authLogout().catch(() => {});
    setUser(null);
  }, []);

  return (
    <UserContext.Provider value={{ user, login, logout, updateUser }}>
    <BrowserRouter>
      <ScrollToHash />
      <div className="min-h-screen flex flex-col">
        {/* ── Top navigation bar ── */}
        <nav className="sticky top-0 z-50 bg-primary text-white px-4 md:px-6 flex items-center h-12 shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
          <Link to="/" className="font-extrabold text-base text-white no-underline mr-5 whitespace-nowrap shrink-0 tracking-tight hover:opacity-90">
            KAI Bundestag
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-0.5 flex-1 overflow-visible">
            <NavLink
              to="/"
              end
              className={({ isActive }) => cn(
                "relative px-2.5 py-1.5 rounded text-[13px] font-medium whitespace-nowrap transition-all duration-100",
                "text-white/70 hover:text-white hover:bg-white/10",
                isActive && "text-white bg-white/15"
              )}
            >
              {t("nav.dashboard")}
            </NavLink>
            <NavGroup label={t("nav.parlament")}>
              <DropdownLink to="/mdb">{t("nav.mdb")}</DropdownLink>
              <DropdownLink to="/committees">{t("nav.committees")}</DropdownLink>
              <DropdownLink to="/bills">{t("nav.bills")}</DropdownLink>
              <DropdownLink to="/motions">{t("nav.motions")}</DropdownLink>
              <DropdownLink to="/interpellations">{t("nav.interpellations")}</DropdownLink>
              <DropdownLink to="/confidence-votes">{t("nav.confidenceVotes")}</DropdownLink>
              <DropdownLink to="/constitutional-court">{t("nav.constitutionalCourt")}</DropdownLink>
              <DropdownLink to="/budget">{t("nav.budget")}</DropdownLink>
            </NavGroup>
            <NavGroup label={t("nav.partiesAndElections")}>
              <DropdownLink to="/parties">{t("nav.parties")}</DropdownLink>
              <DropdownLink to="/elections">{t("nav.elections")}</DropdownLink>
              <DropdownLink to="/polls">{t("nav.polls")}</DropdownLink>
            </NavGroup>
            <NavGroup label={t("nav.participate")}>
              <DropdownLink to="/questions">{t("nav.citizenQuestions")}</DropdownLink>
              <DropdownLink to="/referendums">{t("nav.referendums")}</DropdownLink>
            </NavGroup>
            <NavGroup label={t("nav.news")}>
              <DropdownLink to="/news">{t("nav.newsTicker")}</DropdownLink>
              <DropdownLink to="/media">{t("nav.press")}</DropdownLink>
            </NavGroup>
          </div>

          {/* Sim status + user area (desktop) */}
          <div className="hidden md:flex items-center ml-auto shrink-0 gap-2.5">
            <SimStatus />
            <NotificationBell />
            <div className="shrink-0 flex items-center">
              {user ? (
                <UserMenu user={user} />
              ) : (
                <NavLink
                  to="/login"
                  className="text-xs text-white/70 no-underline px-3 py-1 border border-white/20 rounded-full whitespace-nowrap transition-all duration-100 hover:text-white hover:border-white/40 hover:bg-white/10"
                >
                  {t("nav.login")}
                </NavLink>
              )}
            </div>
          </div>

          {/* Mobile: sim status + notification bell + hamburger */}
          <div className="md:hidden flex items-center ml-auto gap-2">
            <SimStatus />
            <NotificationBell />
            <MobileNav user={user} />
          </div>
        </nav>

        {/* Error toast */}
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}

        {/* Main content */}
        <main className="mx-auto max-w-[1280px] flex-1 px-6 py-8 max-md:px-4 max-md:py-5 overflow-x-hidden">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/parties" element={<Parties />} />
            <Route path="/parties/:id" element={<PartyDetail />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/bills/:id" element={<BillDetail />} />
            <Route path="/mdb" element={<MdbList />} />
            <Route path="/mdb/:seatId" element={<MdbDetail />} />
            <Route path="/committees" element={<Committees />} />
            <Route path="/committees/:id" element={<CommitteeDetail />} />
            <Route path="/elections" element={<Elections />} />
            <Route path="/news" element={<NewsFeed />} />
            <Route path="/polls" element={<Polls />} />
            <Route path="/media" element={<Media />} />
            <Route path="/questions" element={<Questions />} />
            <Route path="/motions" element={<Motions />} />
            <Route path="/interpellations" element={<Interpellations />} />
            <Route path="/confidence-votes" element={<ConfidenceVotes />} />
            <Route path="/constitutional-court" element={<ConstitutionalCourt />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/referendums" element={<Referendums />} />
            <Route path="/log" element={<SimulationLog />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/my-activity" element={<MyActivity />} />
            <Route path="/login" element={<Login />} />
            <Route path="/about" element={<About />} />
            <Route path="/simulation-info" element={<SimulationInfo />} />
            <Route path="/impressum" element={<Impressum />} />
            <Route path="/datenschutz" element={<Datenschutz />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="border-t border-border bg-card mt-6">
          <div className="max-w-[1280px] mx-auto px-6 py-4 flex justify-between items-center flex-wrap gap-3 max-md:flex-col max-md:text-center">
            <div className="flex gap-5">
              <Link to="/log" className="text-muted-foreground no-underline text-xs hover:text-foreground transition-colors duration-100">{t("nav.protocol")}</Link>
              <Link to="/about" className="text-muted-foreground no-underline text-xs hover:text-foreground transition-colors duration-100">{t("nav.about")}</Link>
              <Link to="/simulation-info" className="text-muted-foreground no-underline text-xs hover:text-foreground transition-colors duration-100">{t("nav.simulation")}</Link>
              <Link to="/impressum" className="text-muted-foreground no-underline text-xs hover:text-foreground transition-colors duration-100">{t("nav.impressum")}</Link>
              <Link to="/datenschutz" className="text-muted-foreground no-underline text-xs hover:text-foreground transition-colors duration-100">{t("nav.datenschutz")}</Link>
            </div>
            <div className="text-[11px] text-muted-foreground">{t("footer.tagline")}</div>
          </div>
        </footer>
      </div>
    </BrowserRouter>
    </UserContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
