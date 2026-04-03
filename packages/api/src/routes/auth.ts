import { Router } from "express";
import passport from "passport";

const router = Router();

// Frontend URL to redirect to after OAuth completes
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// ── Google OAuth ────────────────────────────────────────────────────────────

router.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get("/api/auth/google/callback",
  passport.authenticate("google", { failureRedirect: `${FRONTEND_URL}/login?error=google` }),
  (req, res) => {
    // Ensure session is persisted before redirecting — prevents blank-state on first login
    req.session.save(() => { res.redirect(`${FRONTEND_URL}/?auth=success`); });
  },
);

// ── GitHub OAuth ────────────────────────────────────────────────────────────

router.get("/api/auth/github", passport.authenticate("github", { scope: ["user:email"] }));

router.get("/api/auth/github/callback",
  passport.authenticate("github", { failureRedirect: `${FRONTEND_URL}/login?error=github` }),
  (req, res) => {
    // Ensure session is persisted before redirecting — prevents blank-state on first login
    req.session.save(() => { res.redirect(`${FRONTEND_URL}/?auth=success`); });
  },
);

// ── Session endpoints ───────────────────────────────────────────────────────

router.get("/api/auth/me", (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const u = req.user as any;
  res.json({
    id: u.id,
    displayName: u.displayName,
    partyId: u.partyId,
    avatarUrl: u.avatarUrl,
    provider: u.provider,
    createdAt: u.createdAt,
    lastActive: u.lastActive,
    switchCooldownUntil: u.switchCooldownUntil,
    isBot: u.isBot ?? false,
  });
});

router.post("/api/auth/logout", (req, res) => {
  req.logout((err) => {
    if (err) { res.status(500).json({ error: "Logout failed" }); return; }
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
});

// ── Available providers (so frontend knows which buttons to show) ───────────

router.get("/api/auth/providers", (_req, res) => {
  const providers: string[] = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) providers.push("google");
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) providers.push("github");
  res.json({ providers });
});

export default router;
