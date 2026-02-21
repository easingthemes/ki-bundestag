# Progress

## Goal

Replace the invisible UUID-token auth with a simple nickname-based login/register flow — one page, unique nicknames, session persisted in a cookie, user avatar in the nav with a dropdown for user-related pages.

## Steps

### Step 1: Unique nickname registration + login API

- **Status**: pending
- **Description**: Add unique constraint on `displayName` in the users table. Update `POST /api/users/register` to enforce uniqueness. Add `POST /api/users/login` that looks up by nickname and returns the user (or 404 if not found). Return a session token (the existing UUID) in both endpoints.

### Step 2: Login/Register page

- **Status**: pending
- **Description**: Create a single `/login` page with one nickname input. On submit: try login first, if 404 then register. Show inline feedback ("Welcome back" vs "Account created"). On success, store token in a cookie (not just localStorage) and redirect to previous page or home. Redirect unauthenticated users here when they try auth-required actions.

### Step 3: User avatar + dropdown in navigation

- **Status**: pending
- **Description**: Add a user avatar (initials-based circle) to the right side of the main nav. Click opens a dropdown with: nickname display, "My Party" link (if member), "My Questions" link, "My Proposals" link, and "Logout". When logged out, show a "Login" link instead.

### Step 4: Remove redundant nickname prompts

- **Status**: pending
- **Description**: Update join-party flow, question submission, proposal submission, and any other place that asks for a name to use the logged-in user's nickname automatically. Remove the displayName field from registration-time party joining (party join is now a separate action post-login).

### Step 5: Update visitor simulation script

- **Status**: pending
- **Description**: Update `scripts/simulate-visitors.ts` to use the new login/register API flow and cookie-based auth instead of raw token + localStorage.

## Notes

- The existing `users` table already has `displayName` — just needs a unique constraint
- Cookie approach: set `userToken` cookie with `SameSite=Lax`, read it server-side via `cookie-parser` or just keep sending `X-User-Token` header (cookie stores the token, frontend reads it and sends as header — simplest hybrid)
- "My Questions" / "My Proposals" pages could either be new routes or filtered views of existing pages
- Avatar: generated from initials (e.g., "HM" for "Hans Müller"), colored by party or hash — no image upload needed
