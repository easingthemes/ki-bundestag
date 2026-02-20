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
import { About } from "./pages/About";
import { BillDetail } from "./pages/BillDetail";
import { api, setErrorHandler, setUserToken, type User, type SimulationStatus } from "./api";
import { UserContext, loadStoredToken, saveToken, clearToken } from "./userContext";
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

  // Close dropdown on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Close on outside click
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
      className={`nav-group${open ? " nav-group-open" : ""}`}
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <button
        className="nav-group-trigger"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {label}
        <span className="nav-group-arrow" />
      </button>
      {open && (
        <div className="nav-dropdown">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Mobile nav drawer ──────────────────────────────────────────── */
function MobileNav({ user }: { user: User | null }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <>
      <button className="nav-hamburger" onClick={() => setOpen(o => !o)} aria-label="Toggle menu">
        <span /><span /><span />
      </button>
      {open && <div className="nav-mobile-backdrop" onClick={() => setOpen(false)} />}
      <div className={`nav-mobile-drawer${open ? " nav-mobile-drawer-open" : ""}`}>
        <div className="nav-mobile-header">
          <span>Menu</span>
          <button className="nav-mobile-close" onClick={() => setOpen(false)}>&times;</button>
        </div>
        <div className="nav-mobile-links">
          <NavLink to="/" end>Dashboard</NavLink>
          <div className="nav-mobile-group-label">Parlament</div>
          <NavLink to="/bills">Gesetze</NavLink>
          <NavLink to="/motions">Antr&auml;ge</NavLink>
          <NavLink to="/interpellations">Anfragen</NavLink>
          <NavLink to="/confidence-votes">Vertrauensvoten</NavLink>
          <NavLink to="/constitutional-court">Verfassungsgericht</NavLink>
          <NavLink to="/budget">Haushalt</NavLink>
          <div className="nav-mobile-group-label">Parteien &amp; Wahlen</div>
          <NavLink to="/parties">Parteien</NavLink>
          <NavLink to="/elections">Wahlen</NavLink>
          <NavLink to="/polls">Umfragen</NavLink>
          <div className="nav-mobile-group-label">Mitmachen</div>
          <NavLink to="/questions">B&uuml;rgerfragen</NavLink>
          <NavLink to="/referendums">Volksabstimmungen</NavLink>
          <div className="nav-mobile-group-label">Nachrichten</div>
          <NavLink to="/news">Newsticker</NavLink>
          <NavLink to="/media">Presse</NavLink>
          <div className="nav-mobile-sep" />
          <NavLink to="/log">Protokoll</NavLink>
          <NavLink to="/about">&Uuml;ber</NavLink>
          <NavLink to="/admin">Admin</NavLink>
          {!user && (
            <>
              <div className="nav-mobile-sep" />
              <NavLink to="/parties" className="nav-mobile-cta">Partei beitreten</NavLink>
            </>
          )}
        </div>
      </div>
    </>
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

  // Tick every second for progress bar
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const { running, pct } = useMemo(() => {
    if (!status?.dayStartedAt) return { running: false, pct: 0 };
    const started = new Date(status.dayStartedAt).getTime();
    const completed = status.lastRunAt ? new Date(status.lastRunAt).getTime() : 0;

    // Day is currently running: started > completed (or no completed yet)
    if (started > completed) {
      const elapsed = now - started;
      // Cap at 95% while running (we don't know the actual duration)
      return { running: true, pct: Math.min(Math.round((elapsed / 30_000) * 95), 95) };
    }

    // Day completed: show 100% briefly, then track idle time toward next day
    const sinceCompleted = now - completed;
    if (sinceCompleted < 2_000) return { running: false, pct: 100 };
    // After 2s, consider simulation idle
    return { running: false, pct: 0 };
  }, [status, now]);

  if (!status) return null;

  return (
    <div className="sim-status">
      <div className="sim-status-label">
        <span className={`sim-status-dot${running ? " sim-status-dot-active" : ""}`} />
        <span>Tag {status.currentDay}</span>
      </div>
      <div className="sim-status-bar">
        <div
          className={`sim-status-bar-fill${running ? "" : pct === 100 ? " sim-status-bar-done" : " sim-status-bar-idle"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function App() {
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const handleError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 6000);
  }, []);

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = loadStoredToken();
    if (stored) {
      setUserToken(stored);
      setToken(stored);
      api.getMe().then(u => setUser(u)).catch(() => {
        // Token no longer valid — clear it
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
      <div className="app">
        <nav className="nav">
          <Link to="/" className="nav-brand">KI Bundestag</Link>
          <div className="nav-links">
            <NavLink to="/" end>Dashboard</NavLink>
            <NavGroup label="Parlament">
              <NavLink to="/bills">Gesetze</NavLink>
              <NavLink to="/motions">Antr&auml;ge</NavLink>
              <NavLink to="/interpellations">Anfragen</NavLink>
              <NavLink to="/confidence-votes">Vertrauensvoten</NavLink>
              <NavLink to="/constitutional-court">Verfassungsgericht</NavLink>
              <NavLink to="/budget">Haushalt</NavLink>
            </NavGroup>
            <NavGroup label="Parteien &amp; Wahlen">
              <NavLink to="/parties">Parteien</NavLink>
              <NavLink to="/elections">Wahlen</NavLink>
              <NavLink to="/polls">Umfragen</NavLink>
            </NavGroup>
            <NavGroup label="Mitmachen">
              <NavLink to="/questions">B&uuml;rgerfragen</NavLink>
              <NavLink to="/referendums">Volksabstimmungen</NavLink>
            </NavGroup>
            <NavGroup label="Nachrichten">
              <NavLink to="/news">Newsticker</NavLink>
              <NavLink to="/media">Presse</NavLink>
            </NavGroup>
          </div>
          <SimStatus />
          <div className="nav-user">
            {user ? (
              <span className="nav-user-badge">
                <span className="nav-user-dot" />
                {user.displayName}
              </span>
            ) : (
              <NavLink to="/parties" className="nav-join-link">Partei beitreten</NavLink>
            )}
          </div>
          <MobileNav user={user} />
        </nav>
        {error && (
          <div className="error-toast" onClick={() => setError(null)}>
            {error}
          </div>
        )}
        <main className="main">
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
            <Route path="/referendums" element={<Referendums />} />
            <Route path="/log" element={<SimulationLog />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <div className="site-footer-links">
              <Link to="/log">Protokoll</Link>
              <Link to="/about">&Uuml;ber</Link>
              <Link to="/admin">Admin</Link>
            </div>
            <div className="site-footer-brand">KI Bundestag &mdash; AI-Powered Parliament Simulation</div>
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
