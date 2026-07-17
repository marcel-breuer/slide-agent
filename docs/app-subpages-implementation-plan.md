# App Subpages Implementation Plan

This plan tracks the application subpages that still need production-backed implementations after adding the workspace navigation shell. It focuses on pages that are reachable from the app navigation or from contextual project and presentation flows.

## Current Route Status

| Route                                           | Current state                                                 | Required implementation                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/app/projects`                                 | Production-backed project list.                               | Keep extending workspace summaries as workflow pages land.                                                                                  |
| `/app/projects/[projectId]`                     | Production-backed project detail and presentation management. | Keep extending presentation metadata as workflow pages mature.                                                                              |
| `/app/design-profiles`                          | Retired user-facing route.                                    | Keep design selection inside presentation workflows; do not expose a separate technical profile management page.                           |
| `/app/design-profiles/[profileId]`              | Retired user-facing route.                                    | Redirect legacy links back to projects.                                                                                                    |
| `/app/settings/presentations`                   | Production-backed presentation defaults.                      | Add richer generation-control defaults as the generation pipeline expands.                                                                  |
| `/app/settings/account`                         | Production-backed combined account page.                      | Keep profile, password, sessions, data export, and account deletion together.                                                               |
| `/app/settings/providers`                       | Placeholder page.                                             | Add provider credential management, masked key display, credential verification, model defaults, and encrypted-at-rest storage integration. |
| `/app/settings/budget`                          | Retired user-facing route.                                    | Redirect legacy links; no subscription or usage-limit settings are exposed.                                                                |
| `/app/settings/language`                        | Production-backed language settings.                          | Apply UI locale across translated copy when the i18n surface expands.                                                                       |
| `/app/settings/security`                        | Redirect to combined account settings.                        | Keep password change, session management, sensitive-action confirmation, and security event history on `/app/settings/account`.             |
| `/app/presentations/[presentationId]`           | Production-backed workflow overview.                          | Add richer readiness signals as generation and review state expands.                                                                        |
| `/app/presentations/[presentationId]/briefing`  | Production-backed briefing form.                              | Add adaptive follow-up questions, attachments/references, and briefing approval state.                                                      |
| `/app/presentations/[presentationId]/storyline` | Production-backed manual storyline outline.                   | Add generated proposals, scope estimates, and an explicit approval gate.                                                                    |
| `/app/presentations/[presentationId]/editor`    | Implemented editor shell.                                     | Add project-aware breadcrumbs in the editor chrome.                                                                                         |
| `/app/presentations/[presentationId]/export`    | Production-backed export page.                                | Add export settings and compatibility warning previews before generation.                                                                   |

## Implementation Order

1. **Provider and account settings**
   - Keep provider credentials and combined account/security settings on top of the database-backed authentication and authorization foundation.
   - Acceptance: protected settings are user-owned, sensitive values are never returned in plaintext, and unauthorized API access is rejected.

2. **Account lifecycle**
   - Keep profile settings and account lifecycle controls together.
   - Acceptance: profile updates persist, account deletion is deliberate and auditable, and data export is scoped to the signed-in user.

## Dependencies

- Database-backed authentication and authorization are available for protected app pages and API routes.
- Project and presentation CRUD is available for contextual presentation pages.
- Presentation overview, briefing, storyline, and export pages are available for the core workflow.
- Presentation defaults and language settings are persisted and applied to newly created presentations.
- Provider credentials must remain encrypted at rest and masked in every browser response.
- External input for imported profiles, attachments, and presentation data must continue to pass runtime schema validation.

## Validation Expectations

- Add route-level tests for each implemented page.
- Add API tests for every create, update, archive, restore, and settings persistence path.
- Add authorization tests for user-owned projects, presentations, credentials, and settings.
- Run browser QA for the complete navigation path: projects -> project detail -> presentation overview -> briefing -> storyline -> editor -> export.
- Keep placeholder pages only when their implementation is explicitly assigned to a later work package.

## Next Package Recommendation

The next implementation package should focus on provider and account settings; billing, subscription quotas, and standalone design-profile management are intentionally out of scope.
