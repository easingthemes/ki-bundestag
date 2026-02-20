import { StrictMode, useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
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
import { api, setErrorHandler, setUserToken, type User } from "./api";
import { UserContext, loadStoredToken, saveToken, clearToken } from "./userContext";
import "./styles.css";

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
          <div className="nav-brand">🇩🇪 KI Bundestag</div>
          <div className="nav-links">
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/parties">Parties</NavLink>
            <NavLink to="/bills">Bills</NavLink>
            <NavLink to="/elections">Elections</NavLink>
            <NavLink to="/budget">Budget</NavLink>
            <span className="nav-sep" />
            <NavLink to="/motions">Motions</NavLink>
            <NavLink to="/interpellations">Anfragen</NavLink>
            <NavLink to="/confidence-votes">Vertrauensvoten</NavLink>
            <NavLink to="/constitutional-court">Verfassungsgericht</NavLink>
            <span className="nav-sep" />
            <NavLink to="/news">News</NavLink>
            <NavLink to="/media">Media</NavLink>
            <NavLink to="/polls">Polls</NavLink>
            <NavLink to="/referendums">Votes</NavLink>
            <NavLink to="/questions">Questions</NavLink>
            <span className="nav-sep" />
            <NavLink to="/log">Log</NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/admin">Admin</NavLink>
            <span className="nav-sep" />
            {user ? (
              <span style={{ fontSize: "0.8rem", color: "#ccc", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#28a745", display: "inline-block" }} />
                {user.displayName}
              </span>
            ) : (
              <NavLink to="/parties" style={{ fontSize: "0.8rem", color: "#aaa" }}>Join a Party</NavLink>
            )}
          </div>
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
