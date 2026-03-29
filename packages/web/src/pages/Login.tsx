import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api } from "../api";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";

export function Login() {
  const { user, login } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "not_found" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  if (user) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <Card>
          <CardContent className="p-8">
            <div className="w-14 h-14 rounded-full bg-[#ffd700] flex items-center justify-center text-xl font-bold text-[#1a1a2e] mx-auto mb-4">
              {user.displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <h2 className="text-lg font-semibold mb-1">Willkommen, {user.displayName}</h2>
            <p className="text-sm text-muted-foreground mb-4">Du bist bereits angemeldet.</p>
            <Link
              to="/"
              className="inline-block px-4 py-2 rounded bg-[#1a1a2e] text-white text-sm font-medium no-underline hover:opacity-90"
            >
              Zum Dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleLogin = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 30) return;
    setStatus("loading");
    setErrMsg("");
    try {
      const found = await api.loginUser(trimmed);
      if (found) {
        login(found.id, found);
        navigate(redirect, { replace: true });
      } else {
        setStatus("not_found");
      }
    } catch {
      setErrMsg("Anmeldung fehlgeschlagen. Bitte erneut versuchen.");
      setStatus("error");
    }
  };

  const handleRegister = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 30) return;
    setStatus("loading");
    setErrMsg("");
    try {
      const newUser = await api.registerUser(trimmed);
      localStorage.setItem("ki-onboarding", "1");
      login(newUser.id, newUser);
      navigate(redirect, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      if (msg.includes("already taken") || msg.includes("Nickname")) {
        setErrMsg("Nickname bereits vergeben. Versuche dich stattdessen anzumelden.");
      } else {
        setErrMsg(msg);
      }
      setStatus("error");
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-16">
      <Card>
        <CardContent className="p-8">
          <h2 className="text-xl font-semibold mb-1 text-center">Anmelden</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Mit Nickname anmelden oder neues Konto erstellen.
          </p>

          <label className="text-sm font-medium block mb-1.5">Nickname</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); if (status === "not_found" || status === "error") setStatus("idle"); }}
            maxLength={30}
            placeholder="2–30 Zeichen"
            className="w-full px-3 py-2 rounded border border-input text-sm mb-4"
            onKeyDown={e => {
              if (e.key === "Enter") {
                if (status === "not_found") handleRegister();
                else handleLogin();
              }
            }}
          />

          {status === "not_found" && (
            <div className="mb-4 px-3 py-2.5 rounded bg-amber-50 border border-amber-200 text-sm">
              <span className="font-medium text-amber-800">Kein Konto gefunden für "{name.trim()}".</span>
              <span className="text-amber-700 block mt-0.5">Neues Konto mit diesem Nickname erstellen?</span>
            </div>
          )}

          {status === "error" && errMsg && (
            <div className="mb-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-sm text-red-700">
              {errMsg}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {status === "not_found" ? (
              <>
                <button
                  onClick={handleRegister}
                  className="w-full px-4 py-2.5 rounded bg-[#1a1a2e] text-white font-semibold text-sm cursor-pointer hover:opacity-90 disabled:opacity-50"
                  disabled={name.trim().length < 2}
                >
                  Account erstellen
                </button>
                <button
                  onClick={() => { setStatus("idle"); setName(""); }}
                  className="w-full px-4 py-2 rounded border border-input bg-card text-sm cursor-pointer hover:bg-accent"
                >
                  Anderen Namen versuchen
                </button>
              </>
            ) : (
              <button
                onClick={handleLogin}
                disabled={status === "loading" || name.trim().length < 2}
                className="w-full px-4 py-2.5 rounded bg-[#1a1a2e] text-white font-semibold text-sm cursor-pointer hover:opacity-90 disabled:opacity-50"
              >
                {status === "loading" ? "..." : "Anmelden"}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
