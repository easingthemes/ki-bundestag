import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { randomUUID } from "crypto";
import { getUserDb, schema, logger } from "@ki-bundestag/engine";
import { eq, and } from "drizzle-orm";

/** Find or create a user from an OAuth profile. */
function findOrCreateUser(provider: string, providerId: string, displayName: string, avatarUrl: string | null): string {
  const userDb = getUserDb();

  // Check if user already exists with this provider + providerId
  const existing = userDb.select().from(schema.users)
    .where(and(eq(schema.users.provider, provider), eq(schema.users.providerId, providerId)))
    .all();

  if (existing.length > 0) {
    // Update lastActive and avatar
    userDb.update(schema.users)
      .set({ lastActive: Date.now(), avatarUrl: avatarUrl ?? existing[0].avatarUrl })
      .where(eq(schema.users.id, existing[0].id))
      .run();
    return existing[0].id;
  }

  // New user — ensure unique display name
  let uniqueName = displayName || `User`;
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? uniqueName : `${uniqueName} ${suffix}`;
    const clash = userDb.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.displayName, candidate)).all();
    if (clash.length === 0) { uniqueName = candidate; break; }
    suffix++;
  }

  const id = randomUUID();
  const now = Date.now();
  userDb.insert(schema.users).values({
    id,
    displayName: uniqueName,
    partyId: null,
    provider,
    providerId,
    avatarUrl,
    createdAt: now,
    lastActive: now,
    switchCooldownUntil: null,
  }).run();

  return id;
}

export function configurePassport(): void {
  // Serialize: store only user ID in session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize: look up full user from DB
  passport.deserializeUser((id: string, done) => {
    try {
      const userDb = getUserDb();
      const rows = userDb.select().from(schema.users).where(eq(schema.users.id, id)).all();
      if (rows.length === 0) { done(null, false); return; }
      done(null, rows[0]);
    } catch (err) { done(err); }
  });

  // Google OAuth strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
    }, (_accessToken, _refreshToken, profile, done) => {
      try {
        const avatarUrl = profile.photos?.[0]?.value ?? null;
        const displayName = profile.displayName || profile.emails?.[0]?.value?.split("@")[0] || "Google User";
        const userId = findOrCreateUser("google", profile.id, displayName, avatarUrl);
        done(null, { id: userId });
      } catch (err) { done(err as Error); }
    }));
    logger.info("[auth] Google OAuth strategy configured");
  } else {
    logger.info("[auth] Google OAuth not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)");
  }

  // GitHub OAuth strategy
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL || "/api/auth/github/callback",
    }, (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
      try {
        const avatarUrl = profile.photos?.[0]?.value ?? null;
        const displayName = profile.displayName || profile.username || "GitHub User";
        const userId = findOrCreateUser("github", profile.id, displayName, avatarUrl);
        done(null, { id: userId });
      } catch (err) { done(err); }
    }));
    logger.info("[auth] GitHub OAuth strategy configured");
  } else {
    logger.info("[auth] GitHub OAuth not configured (missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)");
  }
}
