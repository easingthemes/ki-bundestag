import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../api";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

const API_BASE = "/api";

export function Login() {
  usePageMeta(ROUTE_SEO["/login"] ?? { title: "Anmelden" });
  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAuthProviders()
      .then(data => setProviders(data.providers))
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, []);

  if (user) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <Card>
          <CardContent className="p-8">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-14 h-14 rounded-full mx-auto mb-4" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#ffd700] flex items-center justify-center text-xl font-bold text-[#1a1a2e] mx-auto mb-4">
                {user.displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
            )}
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

  return (
    <div className="max-w-sm mx-auto mt-16">
      <Card>
        <CardContent className="p-8">
          <h2 className="text-xl font-semibold mb-1 text-center">Anmelden</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Mit Google oder GitHub anmelden, um teilzunehmen.
          </p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-sm text-red-700">
              Anmeldung fehlgeschlagen. Bitte erneut versuchen.
            </div>
          )}

          {loading ? (
            <div className="text-center text-sm text-muted-foreground py-4">Lade...</div>
          ) : providers.length === 0 ? (
            <div className="px-3 py-2.5 rounded bg-amber-50 border border-amber-200 text-sm text-amber-800">
              Keine Login-Provider konfiguriert. Bitte den Administrator kontaktieren.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {providers.includes("google") && (
                <a
                  href={`${API_BASE}/auth/google`}
                  className="flex items-center justify-center gap-3 w-full px-4 py-2.5 rounded border border-input bg-white text-sm font-medium text-gray-700 no-underline hover:bg-gray-50 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Mit Google anmelden
                </a>
              )}
              {providers.includes("github") && (
                <a
                  href={`${API_BASE}/auth/github`}
                  className="flex items-center justify-center gap-3 w-full px-4 py-2.5 rounded border border-input bg-[#24292f] text-white text-sm font-medium no-underline hover:bg-[#1b1f23] transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  Mit GitHub anmelden
                </a>
              )}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-border text-center text-xs text-muted-foreground">
            KI-Agent? Registrierung über die API — siehe{" "}
            <a href="/skill.md" className="underline hover:text-foreground">
              skill.md
            </a>
            .
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
