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
import { Admin } from "./pages/Admin";
import { AdminCosts } from "./pages/AdminCosts";
import { AdminAnalytics } from "./pages/AdminAnalytics";
import { About } from "./pages/About";
import { Login } from "./pages/Login";
import { BillDetail } from "./pages/BillDetail";
import { Notifications } from "./pages/Notifications";
import { MyActivity } from "./pages/MyActivity";
import { api, setErrorHandler, setUserToken, type User, type SimulationStatus, type BundestagSeat } from "./api";
import { UserContext, useUser, loadStoredToken, saveToken, clearToken } from "./userContext";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Menu, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
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
          "flex items-center gap-1 px-3 py-2 rounded text-sm font-medium whitespace-nowrap transition-all duration-150",
          "text-[#b0b0c0] hover:text-white hover:bg-white/[0.06]",
          open && "text-white bg-white/[0.06]"
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
        <div className="absolute top-[calc(100%+4px)] left-0 min-w-[200px] bg-[#1e1e36] border border-white/[0.08] rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.35)] py-1.5 z-[200] animate-in fade-in slide-in-from-top-1.5 duration-150">
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
        "block px-4 py-2 text-sm font-medium whitespace-nowrap transition-all duration-150",
        "text-[#b0b0c0] hover:text-white hover:bg-white/[0.06]",
        isActive && "text-white bg-white/10 border-l-2 border-[#ffd700]"
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

  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="md:hidden ml-auto p-1.5 text-[#b0b0c0] hover:text-white" aria-label="Toggle menu">
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="bg-[#1a1a2e] border-white/[0.08] w-[280px] p-0">
        <SheetHeader className="px-5 pt-4 pb-3 border-b border-white/[0.08]">
          <SheetTitle className="text-white font-bold">Menu</SheetTitle>
        </SheetHeader>
        <nav className="py-2">
          <MobileLink to="/" end>Dashboard</MobileLink>
          <MobileGroupLabel>Parlament</MobileGroupLabel>
          <MobileLink to="/bills">Gesetze</MobileLink>
          <MobileLink to="/motions">Antr&auml;ge</MobileLink>
          <MobileLink to="/interpellations">Anfragen</MobileLink>
          <MobileLink to="/confidence-votes">Vertrauensvoten</MobileLink>
          <MobileLink to="/constitutional-court">Verfassungsgericht</MobileLink>
          <MobileLink to="/budget">Haushalt</MobileLink>
          <MobileGroupLabel>Parteien &amp; Wahlen</MobileGroupLabel>
          <MobileLink to="/parties">Parteien</MobileLink>
          <MobileLink to="/elections">Wahlen</MobileLink>
          <MobileLink to="/polls">Umfragen</MobileLink>
          <MobileGroupLabel>Mitmachen</MobileGroupLabel>
          <MobileLink to="/questions">B&uuml;rgerfragen</MobileLink>
          <MobileLink to="/referendums">Volksabstimmungen</MobileLink>
          <MobileGroupLabel>Nachrichten</MobileGroupLabel>
          <MobileLink to="/news">Newsticker</MobileLink>
          <MobileLink to="/media">Presse</MobileLink>
          <Separator className="bg-white/[0.08] mx-5 my-2" />
          <MobileLink to="/log">Protokoll</MobileLink>
          <MobileLink to="/about">&Uuml;ber</MobileLink>
          <MobileLink to="/admin">Admin</MobileLink>
          <Separator className="bg-white/[0.08] mx-5 my-2" />
          {user ? (
            <>
              <div className="px-5 py-2 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[#ffd700] flex items-center justify-center text-xs font-bold text-[#1a1a2e]">
                  {user.displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm text-white font-medium">{user.displayName}</span>
              </div>
              {user.partyId && <MobileLink to={`/parties/${user.partyId}`}>My Party</MobileLink>}
              <MobileLink to="/questions">My Questions</MobileLink>
              <MobileLink to="/my-activity">My Activity</MobileLink>
              <MobileLogout />
            </>
          ) : (
            <NavLink to="/login" className="block px-5 py-2.5 text-sm font-semibold text-[#ffd700] hover:text-[#ffe44d]">
              Anmelden
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
        "block px-5 py-2.5 text-sm font-medium transition-all duration-150",
        "text-[#b0b0c0] hover:text-white hover:bg-white/[0.06]",
        isActive && "text-white bg-white/[0.06] border-l-2 border-[#ffd700]"
      )}
    >
      {children}
    </NavLink>
  );
}

function MobileGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pt-3 pb-1.5 text-[0.7rem] font-bold text-[#666] uppercase tracking-[0.08em]">
      {children}
    </div>
  );
}

function MobileLogout() {
  const { logout } = useUser();
  return (
    <button
      onClick={logout}
      className="w-full text-left block px-5 py-2.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-white/[0.06] bg-transparent border-none cursor-pointer"
    >
      Logout
    </button>
  );
}

/* ── User avatar menu ────────────────────────────────────────── */

function UserMenu({ user }: { user: User }) {
  const { logout } = useUser();
  const [open, setOpen] = useState(false);
  const [seat, setSeat] = useState<BundestagSeat | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const location = useLocation();

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    api.getMySeat().then(r => setSeat(r.seat)).catch(() => {});
  }, [user.id]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const onEnter = () => { clearTimeout(timeout.current); setOpen(true); };
  const onLeave = () => { timeout.current = setTimeout(() => setOpen(false), 200); };

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
        className="w-8 h-8 rounded-full bg-[#ffd700] flex items-center justify-center text-xs font-bold text-[#1a1a2e] cursor-pointer hover:ring-2 hover:ring-[#ffd700]/50 transition-all"
        onClick={() => setOpen(o => !o)}
        aria-label="User menu"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 min-w-[200px] bg-[#1e1e36] border border-white/[0.08] rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.35)] py-1.5 z-[200] animate-in fade-in slide-in-from-top-1.5 duration-150">
          <div className="px-4 py-2 border-b border-white/[0.08]">
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              {user.displayName}
              {seat && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 leading-none">MdB</span>
              )}
            </div>
            {user.partyId && (
              <div className="text-xs text-[#b0b0c0] mt-0.5">{user.partyId}{seat ? ` · Seat #${seat.seatNumber}` : ""}</div>
            )}
          </div>
          {user.partyId && (
            <NavLink
              to={`/parties/${user.partyId}`}
              className="block px-4 py-2 text-sm text-[#b0b0c0] hover:text-white hover:bg-white/[0.06] no-underline"
            >
              My Party
            </NavLink>
          )}
          <NavLink
            to="/questions"
            className="block px-4 py-2 text-sm text-[#b0b0c0] hover:text-white hover:bg-white/[0.06] no-underline"
          >
            My Questions
          </NavLink>
          <NavLink
            to="/my-activity"
            className="block px-4 py-2 text-sm text-[#b0b0c0] hover:text-white hover:bg-white/[0.06] no-underline"
          >
            My Activity
          </NavLink>
          <div className="border-t border-white/[0.08] mt-1 pt-1">
            <button
              onClick={() => { logout(); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/[0.06] bg-transparent border-none cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Simulation status indicator ───────────────────────────────── */

function SimStatus() {
  const [status, setStatus] = useState<SimulationStatus | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const load = () => api.getSimulationStatus().then(setStatus).catch(() => {});
    load();
    const id = setInterval(load, 3_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const { running, pct } = useMemo(() => {
    if (!status?.dayStartedAt) return { running: false, pct: 0 };
    const started = new Date(status.dayStartedAt).getTime();
    const completed = status.lastRunAt ? new Date(status.lastRunAt).getTime() : 0;

    if (started > completed) {
      const elapsed = now - started;
      return { running: true, pct: Math.min(Math.round((elapsed / 30_000) * 95), 95) };
    }

    const sinceCompleted = now - completed;
    if (sinceCompleted < 2_000) return { running: false, pct: 100 };
    return { running: false, pct: 0 };
  }, [status, now]);

  if (!status) return null;

  return (
    <div className="ml-auto shrink-0 flex flex-col items-end gap-0.5 min-w-[80px]">
      <div className="flex items-center gap-1.5 text-xs text-[#b0b0c0] tabular-nums whitespace-nowrap">
        <span className={cn(
          "w-[7px] h-[7px] rounded-full shrink-0",
          running ? "bg-[#28a745] shadow-[0_0_4px_#28a745] animate-pulse" : "bg-[#6c757d]"
        )} />
        <span>Tag {status.currentDay}</span>
      </div>
      <div className="w-full h-[3px] bg-white/[0.12] rounded-sm overflow-hidden">
        <div
          className={cn(
            "h-full rounded-sm",
            running ? "bg-[#28a745] transition-[width] duration-1000 linear" :
            pct === 100 ? "bg-[#28a745]" : "bg-transparent"
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
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [user]);

  if (!user) return null;

  return (
    <Link to="/notifications" className="relative p-1.5 rounded-md text-[#b0b0c0] hover:text-white hover:bg-white/[0.08] transition-colors">
      <Bell className="w-4 h-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-blue-500 rounded-full leading-none">
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
      className="fixed top-[70px] left-1/2 -translate-x-1/2 z-[1000] min-w-[300px] max-w-[500px] bg-[#dc3545] text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium cursor-pointer animate-in fade-in slide-in-from-top-2 duration-300"
      onClick={onDismiss}
    >
      {message}
    </div>
  );
}

/* ── App ──────────────────────────────────────────────────────────── */

function App() {
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const handleError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 6000);
  }, []);

  useEffect(() => {
    const stored = loadStoredToken();
    if (stored) {
      setUserToken(stored);
      setToken(stored);
      api.getMe().then(u => setUser(u)).catch(() => {
        clearToken();
        setUserToken(null);
        setToken(null);
      });
    }
  }, []);

  useEffect(() => {
    setErrorHandler(handleError);
  }, [handleError]);

  const login = useCallback((newToken: string, newUser: User) => {
    saveToken(newToken);
    setUserToken(newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUserToken(null);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <UserContext.Provider value={{ user, token, login, logout }}>
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        {/* ── Top navigation bar ── */}
        <nav className="sticky top-0 z-50 bg-[#1a1a2e] text-white px-4 md:px-8 flex items-center h-14 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <Link to="/" className="font-bold text-[1.15rem] text-white no-underline mr-6 whitespace-nowrap shrink-0 tracking-tight hover:opacity-90">
            KI Bundestag
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1 flex-1 overflow-visible">
            <NavLink
              to="/"
              end
              className={({ isActive }) => cn(
                "relative px-3 py-2 rounded text-sm font-medium whitespace-nowrap transition-all duration-150",
                "text-[#b0b0c0] hover:text-white hover:bg-white/[0.06]",
                isActive && "text-white bg-white/10 after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:bg-[#ffd700] after:scale-x-100",
                !isActive && "after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:bg-[#ffd700] after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-150"
              )}
            >
              Dashboard
            </NavLink>
            <NavGroup label="Parlament">
              <DropdownLink to="/bills">Gesetze</DropdownLink>
              <DropdownLink to="/motions">Antr&auml;ge</DropdownLink>
              <DropdownLink to="/interpellations">Anfragen</DropdownLink>
              <DropdownLink to="/confidence-votes">Vertrauensvoten</DropdownLink>
              <DropdownLink to="/constitutional-court">Verfassungsgericht</DropdownLink>
              <DropdownLink to="/budget">Haushalt</DropdownLink>
            </NavGroup>
            <NavGroup label="Parteien &amp; Wahlen">
              <DropdownLink to="/parties">Parteien</DropdownLink>
              <DropdownLink to="/elections">Wahlen</DropdownLink>
              <DropdownLink to="/polls">Umfragen</DropdownLink>
            </NavGroup>
            <NavGroup label="Mitmachen">
              <DropdownLink to="/questions">B&uuml;rgerfragen</DropdownLink>
              <DropdownLink to="/referendums">Volksabstimmungen</DropdownLink>
            </NavGroup>
            <NavGroup label="Nachrichten">
              <DropdownLink to="/news">Newsticker</DropdownLink>
              <DropdownLink to="/media">Presse</DropdownLink>
            </NavGroup>
          </div>

          {/* Sim status + user area (desktop) */}
          <div className="hidden md:flex items-center ml-auto shrink-0 gap-3">
            <SimStatus />
            <NotificationBell />
            <div className="shrink-0 flex items-center">
              {user ? (
                <UserMenu user={user} />
              ) : (
                <NavLink
                  to="/login"
                  className="text-xs text-[#b0b0c0] no-underline px-3 py-1.5 border border-white/15 rounded-full whitespace-nowrap transition-all duration-150 hover:text-white hover:border-white/35 hover:bg-white/[0.06]"
                >
                  Anmelden
                </NavLink>
              )}
            </div>
          </div>

          {/* Mobile hamburger */}
          <MobileNav user={user} />
        </nav>

        {/* Error toast */}
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}

        {/* Main content */}
        <main className="mx-auto max-w-[1280px] flex-1 px-8 py-10 max-md:px-4 max-md:py-5">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/parties" element={<Parties />} />
            <Route path="/parties/:id" element={<PartyDetail />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/bills/:id" element={<BillDetail />} />
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
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/costs" element={<AdminCosts />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/referendums" element={<Referendums />} />
            <Route path="/log" element={<SimulationLog />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/my-activity" element={<MyActivity />} />
            <Route path="/login" element={<Login />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-[#1a1a2e] text-[#888] mt-8">
          <div className="max-w-[1280px] mx-auto px-8 py-6 flex justify-between items-center flex-wrap gap-4 max-md:flex-col max-md:text-center">
            <div className="flex gap-6">
              <Link to="/log" className="text-[#888] no-underline text-sm hover:text-[#ccc] transition-colors duration-150">Protokoll</Link>
              <Link to="/about" className="text-[#888] no-underline text-sm hover:text-[#ccc] transition-colors duration-150">&Uuml;ber</Link>
              <Link to="/admin" className="text-[#888] no-underline text-sm hover:text-[#ccc] transition-colors duration-150">Admin</Link>
            </div>
            <div className="text-xs text-[#555]">KI Bundestag &mdash; AI-Powered Parliament Simulation</div>
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
