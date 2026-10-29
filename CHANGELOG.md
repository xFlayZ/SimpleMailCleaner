# Changelog

All notable user-facing and operational changes are recorded here. Dates use ISO 8601. New work goes under **Unreleased** and moves into a versioned section when released.

## Unreleased

### Added

- Replaced README mockup artwork with the supplied in-app dashboard and mailbox screenshots. The root route now sends signed-in users to the dashboard and everyone else to login; an explicit demo entry remains available from the login page.
- Added a dedicated `/trash` workspace with searchable, filterable, paginated messages and safe restore selection. Activity action-result details now support subject/sender search, status filtering and received-date filters.
- Added a Coolify-ready Compose stack with separate web, worker, PostgreSQL and migration services, persistent database storage, and linked beginner-friendly deployment guides in German and English. Worker and migration commands now accept Coolify-provided environment variables without requiring a `.env` file.
- Added independent **All date ranges** and **All messages** options for metadata imports. Unlimited bounds persist through retries; Gmail, Outlook and IMAP remove the corresponding filters while AI scans retain their explicit limits. The Proton connector accepts the same scope (connector update required).
- Added `/training` with persisted 10/20/50-message sessions, pause/resume, diverse active-learning heuristics, optional reasons and user-controlled feedback scope.
- Added per-user/per-mailbox feedback, correction capture from manual edits, inactive personal rule suggestions after three agreeing examples, manual rule creation, dry-run previews, explicit activation, priority, editing, deactivation, deletion and revision history with inactive restoration.
- Integrated approved metadata rules before external AI in the existing review pipeline. Conflicts return review; protective criteria remain authoritative. Archive is a stored suggestion only. Training has no provider mutations or external AI calls.
- Added migration 007, personal-rule unit tests and isolated training integration coverage. Documented heuristic limits and deferred optional statistical classification in `docs/TRAINING.md`.
- Added a configurable dashboard with mailbox, newsletter, sender, cleanup, unclassified-message and AI-usage metrics. Widgets can be hidden and reordered; preferences are stored in the browser.
- Added permanent application routes: `/dashboard`, `/mailbox`, `/newsletter`, `/senders`, `/cleanup`, `/activity`, `/settings` and `/login`; `/` redirects to `/dashboard`.
- Added an all-index mailbox view with active/trash status filters, search, pagination and existing advanced filters.
- Added an opt-in demo entry point. Anonymous users see an account/login prompt instead of demo mailbox content by default.
- Added activity queue pause/resume, cleanup for completed activity history, metadata-scan retry and local-only review retry.
- Added local mailbox-index purge that retains the provider account connection and leaves provider-side messages untouched.
- Added password-confirmed, irreversible account deletion with a typed server-side confirmation token.
- Added English project documentation with an optional German README, interface preview images and this changelog.

### Changed

- Fixed the missing activity navigation item after adding training; navigation now includes every workspace section except the separately placed settings link.
- Gmail imports now fetch at most five metadata messages concurrently. Gmail and Outlook report page/batch progress and check cancellation while fetching, instead of waiting for the full mailbox selection.
- Added actionable network, timeout, permission and schema error messages; worker diagnostics log safe error codes and periodic liveness messages without exception contents or credentials.
- Renamed the main overview to **Dashboard** and simplified **Prüfen & aufräumen** to **Aufräumen**.
- Removed the duplicate mailbox-add icon, sidebar promotional card and duplicate profile control in the top bar.
- The worker queue and OpenRouter batch polling now respect the per-user activity pause setting.
- Mailbox-wide selection excludes trashed messages while the combined all-status view is active, preventing mixed-state bulk actions.

### Safety

- Activity-history clearing refuses to remove active work and preserves remote batches whose result or provider-side retention cleanup is unresolved.
- Local data purge and account deletion refuse to proceed while relevant scans, reviews, provider actions or unresolved OpenRouter batches are active.
- Automatic retries are limited to metadata scans and local-only reviews. AI work requires a fresh cost preview; ambiguous provider-side mail actions are not retried automatically.

## 0.1.0 — Initial open-source release

- Released the self-hosted Next.js and PostgreSQL application under the MIT License.
- Added Gmail, Outlook, T-Online, Yahoo and Proton Mail connection adapters.
- Added OpenRouter settings, per-user encrypted API keys, local filtering, grouped AI analysis and explicit action approval.
- Added paginated message review, newsletter/sender grouping, activity history, batch analysis and provider-side trash/unsubscribe workflows.
