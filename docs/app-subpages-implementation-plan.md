# App Subpages Implementation Plan

This plan tracks the application subpages that still need production-backed implementations after adding the workspace navigation shell. It focuses on pages that are reachable from the app navigation or from contextual project and presentation flows.

## Current Route Status

| Route                                           | Current state                                                 | Required implementation                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/app/projects`                                 | Production-backed project list.                               | Keep extending workspace summaries as workflow pages land.                                                                                  |
| `/app/projects/[projectId]`                     | Production-backed project detail and presentation management. | Keep extending presentation metadata as workflow pages mature.                                                                              |
| `/app/design-profiles`                          | Placeholder page.                                             | Add design profile list, create/import flow, search/filtering, archive state, and profile usage counts.                                     |
| `/app/design-profiles/[profileId]`              | Placeholder page.                                             | Add profile detail with colors, fonts, logos, layout rules, extracted source evidence, version history, and preview cards.                  |
| `/app/settings/presentations`                   | Placeholder page.                                             | Add persisted presentation defaults for slide count, tone, audience, detail level, speaker notes, imagery, and export defaults.             |
| `/app/settings/profile`                         | Placeholder page.                                             | Add account profile form, time zone, currency, data export, and account deletion workflow.                                                  |
| `/app/settings/providers`                       | Placeholder page.                                             | Add provider credential management, masked key display, credential verification, model defaults, and encrypted-at-rest storage integration. |
| `/app/settings/budget`                          | Placeholder page.                                             | Add monthly spend and token budgets, warning thresholds, hard-stop settings, and current usage summary.                                     |
| `/app/settings/language`                        | Placeholder page.                                             | Add separate UI locale and presentation-output language preferences with persisted defaults.                                                |
| `/app/settings/security`                        | Placeholder page.                                             | Add password change, session management, sensitive-action confirmation, and security event history.                                         |
| `/app/presentations/[presentationId]`           | Production-backed workflow overview.                          | Add richer readiness signals as generation and review state expands.                                                                        |
| `/app/presentations/[presentationId]/briefing`  | Production-backed briefing form.                              | Add adaptive follow-up questions, attachments/references, and briefing approval state.                                                      |
| `/app/presentations/[presentationId]/storyline` | Production-backed manual storyline outline.                   | Add generated proposals, scope estimates, and an explicit approval gate.                                                                    |
| `/app/presentations/[presentationId]/editor`    | Implemented editor shell.                                     | Add project-aware breadcrumbs in the editor chrome.                                                                                         |
| `/app/presentations/[presentationId]/export`    | Production-backed export page.                                | Add export settings and compatibility warning previews before generation.                                                                   |

## Implementation Order

1. **Presentation defaults and language settings**
   - Implement `/app/settings/presentations` and `/app/settings/language` before deeper generation controls so new decks have predictable defaults.
   - Acceptance: saved defaults are applied when creating a new presentation and are visible when editing settings again.

2. **Provider, budget, and security settings**
   - Implement provider credentials, budget controls, and security settings on top of the database-backed authentication and authorization foundation.
   - Acceptance: protected settings are user-owned, sensitive values are never returned in plaintext, and unauthorized API access is rejected.

3. **Design profile management**
   - Implement design profile list and detail once projects can reference design profiles.
   - Acceptance: a user can create or import a profile, inspect extracted rules, attach it to a presentation, and archive it.

4. **Profile settings and account lifecycle**
   - Implement the remaining account preferences after the protected-resource model is stable.
   - Acceptance: profile updates persist, account deletion is deliberate and auditable, and data export is scoped to the signed-in user.

## Dependencies

- Database-backed authentication and authorization are available for protected app pages and API routes.
- Project and presentation CRUD is available for contextual presentation pages.
- Presentation overview, briefing, storyline, and export pages are available for the core workflow.
- Provider credentials must remain encrypted at rest and masked in every browser response.
- External input for imported profiles, attachments, and presentation data must continue to pass runtime schema validation.

## Validation Expectations

- Add route-level tests for each implemented page.
- Add API tests for every create, update, archive, restore, and settings persistence path.
- Add authorization tests for user-owned projects, presentations, design profiles, credentials, budgets, and settings.
- Run browser QA for the complete navigation path: projects -> project detail -> presentation overview -> briefing -> storyline -> editor -> export.
- Keep placeholder pages only when their implementation is explicitly assigned to a later work package.

## Next Package Recommendation

The next implementation package should be presentation defaults and language settings. It makes new deck creation predictable and prepares the workflow pages for generation controls.
