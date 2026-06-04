# Ring AI Frontend Userflow Gap Audit (2026-02-16)

Scope reviewed:
- `frontend/src/app/page.tsx` (marketing entry)
- `frontend/src/app/login/page.tsx`
- `frontend/src/app/dashboard/**`
- Linked nav components (`Navbar`, `Sidebar`, `TopBar`, `CTAFooter`)
- API contract alignment against backend endpoints/schemas

## End-to-End Userflow Summary

Expected flow:
1. Landing page (`/`) -> Login (`/login`) -> Dashboard (`/dashboard`)
2. Dashboard pages should support: read data, create/update entities, and move to next logical step.

Current reality:
- Navigation exists and pages are linked.
- Several primary CTAs are non-functional.
- Multiple list pages are likely empty due to frontend/backend response-shape mismatch.
- Some advanced pages are mostly implemented (Insights, ROI compare/calculator, Knowledge Base doc upload/search, TTS synthesis), but onboarding flow is blocked by missing create/edit actions in core pages.

## Critical Issues (P0/P1)

### P0: API contract mismatch causes silent empty states
- `frontend/src/lib/api.ts` + page consumers assume list keys like `campaigns`, `templates`, `transactions`.
- Backend schemas return `items` and `page_size`.
- Affected pages:
  - `dashboard/campaigns`
  - `dashboard/templates`
  - `dashboard/credit-purchase`
  - `dashboard/credit-usage`
- Impact: user sees "No data" even when backend has data.

### P1: Core CTA dead-ends on core management pages
- `dashboard/campaigns/page.tsx`: Add New Campaign button has no handler.
- `dashboard/templates/page.tsx`: Create + Edit actions have no handlers.
- `dashboard/credit-purchase/page.tsx`: Buy Credits button has no handler.
- `dashboard/integrations/page.tsx`: Generate API Key button has no handler.
- `dashboard/settings/page.tsx`: Update Profile / Set Password / Verify KYC / Upload Picture are UI-only.

### P1: Hardcoded org context blocks multi-tenant correctness
- `dashboard/knowledge-bases/page.tsx` uses constant `ORG_ID` placeholder.
- `dashboard/roi/page.tsx` A/B test tab passes `org_id=""` to endpoints that require UUID.
- Impact: works only in narrow seeded/dev conditions; fails in real tenants.

## Page-by-Page Gaps

### Landing (`/`)
- Working: section navigation, login CTA.
- Missing:
  - Footer company/legal links use `href="#"` placeholders.
  - "Talk to Sales" routes to `/login` instead of contact flow.

### Login (`/login`)
- Working: credential login and token storage.
- Missing:
  - No registration/forgot-password path exposed despite backend having `/auth/register`.

### Dashboard Layout/Navigation
- `TopBar` missing page title mapping for `/dashboard/roi` (shows default Dashboard).
- Sidebar collapse is local state; content area margin remains fixed (`ml-[260px]`) so collapsed sidebar does not reclaim space.
- Notification bell in `TopBar` has no behavior.

### Dashboard Overview (`/dashboard`)
- Working: main analytics widgets/charts render.
- Missing/partial:
  - credit usage chart uses hardcoded weekly sample data.
  - several widgets use placeholders (`Total Outbound SMS`, `Total Call Duration`, `Total Owned Numbers`, `Avg Credit Spent`, top campaign).

### Campaigns (`/dashboard/campaigns`)
- Working: basic list fetch attempt and status chips.
- Missing:
  - list parsing mismatch (`data.campaigns` vs backend `items`).
  - search param unsupported by backend list endpoint.
  - sort/date controls are visual-only.
  - Add Campaign CTA not wired.
  - row click -> details/edit flow missing.

### Analytics (`/dashboard/analytics`)
- Working: overview + carrier + intent fetch.
- Missing:
  - search fields are local-only, not applied.
  - Export PDF button not wired.
  - some stats are static placeholders (`Total SMS Sent`, playback %, duration).

### ROI (`/dashboard/roi`)
- Working: campaign ROI, compare, calculator UI and calls mostly present.
- Missing:
  - A/B test list/create call likely fails due to invalid org_id (empty string).
  - no org context source from auth/profile.

### Insights (`/dashboard/insights`)
- Working: campaign selection, AI summary, tabs, charting, CSV export.
- Missing:
  - no deep-link from campaigns or analytics to a selected campaign insights view.

### Credits Purchase (`/dashboard/credit-purchase`)
- Missing:
  - list parsing mismatch (`transactions` vs backend `items`).
  - Date filter visual-only.
  - Buy Credits CTA not connected to `/credits/purchase` flow.

### Credits Usage (`/dashboard/credit-usage`)
- Missing:
  - list parsing mismatch (`transactions` vs backend `items`).
  - Date filter visual-only.

### Templates (`/dashboard/templates`)
- Missing:
  - list parsing mismatch (`templates` vs backend `items`).
  - Create template and Edit template dialogs/forms not implemented.
  - delete works.

### Knowledge Base (`/dashboard/knowledge-bases`)
- Working: create/list/delete KB, document upload/delete, retrieval test.
- Missing:
  - hardcoded `ORG_ID`.
  - KB rename/edit flow absent despite backend `PUT /knowledge-bases/{id}`.

### TTS Providers (`/dashboard/tts-providers`)
- Working: provider list, voice browser, synthesis comparison, cost calculator.
- Missing:
  - Provider Config tab uses fake local "Saved!" state; no backend persistence endpoint used.

### Integrations (`/dashboard/integrations`)
- Working: fetch existing API key prefix + phone numbers.
- Missing:
  - Generate API key button not wired.
  - webhook configuration UI not wired to backend endpoint.
  - copy button only copies key prefix placeholder, not usable credential.

### Settings (`/dashboard/settings`)
- Working: profile/kyc/api-token display basics.
- Missing:
  - profile update endpoint not integrated.
  - password update flow missing.
  - KYC submit flow missing.
  - notification preferences are not persisted.

## Recommended Implementation Order

1. Fix API contract alignment in `src/lib/api.ts` and dependent page types (unblock data visibility).
2. Implement missing primary CTAs (campaign create, template create/edit, buy credits, generate API key).
3. Remove hardcoded org assumptions (derive org context from authenticated user/org).
4. Wire visual-only filters/actions (search/sort/date/export) or hide until functional.
5. Add continuity links between pages (campaign row -> campaign detail/ROI/insights).
6. Finish settings/integrations persistence (profile, webhook, notification prefs, KYC).

## Quick Wins (low effort, high clarity)

- Add `/dashboard/roi` title mapping in `TopBar`.
- Replace footer `#` links with real routes or remove temporarily.
- Show "Not connected yet" helper text on non-wired controls to reduce user confusion.
