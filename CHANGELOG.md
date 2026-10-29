# Changelog

All notable user-facing and operational changes are recorded here. Dates use ISO 8601. New work goes under **Unreleased** and moves into a versioned section when released.

## Unreleased

### Added

- Added a configurable dashboard with mailbox, newsletter, sender, cleanup, unclassified-message and AI-usage metrics. Widgets can be hidden and reordered; preferences are stored in the browser.
- Added permanent application routes: `/dashboard`, `/mailbox`, `/newsletter`, `/senders`, `/cleanup`, `/activity`, `/settings` and `/login`; `/` redirects to `/dashboard`.
- Added an all-index mailbox view with active/trash status filters, search, pagination and existing advanced filters.
- Added an opt-in demo entry point. Anonymous users see an account/login prompt instead of demo mailbox content by default.
- Added activity queue pause/resume, cleanup for completed activity history, metadata-scan retry and local-only review retry.
- Added local mailbox-index purge that retains the provider account connection and leaves provider-side messages untouched.
- Added password-confirmed, irreversible account deletion with a typed server-side confirmation token.
- Added English project documentation with an optional German README, interface preview images and this changelog.

### Changed

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
