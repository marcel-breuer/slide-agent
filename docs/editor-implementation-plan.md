# Editor Implementation Plan

This document is the working implementation plan for turning the current editor prototype into a usable Slide Agent product workflow. Each work package must be delivered as its own focused pull request. After each pull request is merged, implementation pauses until the next package is explicitly approved.

## Current State

The editor currently renders a sample presentation from local React state. A demo login guard exists, and the UI includes controls for navigation, slide selection, properties, AI pointers, preview, and export. Most controls are not yet connected to durable data, backend APIs, jobs, AI providers, or file export flows.

## Target Outcome

The editor should let an authenticated user create, open, edit, save, AI-modify, preview, and export presentations using the structured presentation schema as the source of truth. The browser-rendered deck and exported PowerPoint file must be generated from the same persisted document data.

## Delivery Rules

- Keep every work package small enough for one reviewable pull request.
- Include tests for changed behavior, scaled to the risk of the package.
- Validate rendered editor behavior in the browser for every UI-affecting package.
- Do not start the next work package until the previous pull request has been merged and the next package has been approved.
- Keep feature flags or temporary demo fallbacks explicit when a package cannot yet be fully production-backed.
- Update this document when scope or sequencing changes.

## Work Package 1: Persisted Presentation Loading

Goal: Replace hardcoded sample-only editor loading with a server-backed presentation document read path.

Required functionality:

- Add a presentation document storage shape backed by the existing Prisma model or a narrowly scoped schema addition.
- Seed or bootstrap the demo presentation into the database for local development.
- Add an API route that returns a presentation document by `presentationId`.
- Load the editor document from the API instead of importing `samplePresentation` directly in the editor shell.
- Show loading, not-found, and error states.
- Keep the current demo presentation available after login.

Acceptance criteria:

- Opening `/app/presentations/demo-presentation/editor` loads the document through an API call.
- If the presentation does not exist, the user sees a clear not-found state.
- The editor no longer depends on the sample import as its primary data source.
- Browser QA verifies login -> editor -> loaded document.

Suggested validation:

- Focused API tests for successful and missing presentation lookup.
- `pnpm lint`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- Browser QA on the editor route.

## Work Package 2: Autosave And Durable Edits

Goal: Make user edits persist across refreshes and sessions.

Required functionality:

- Add an update API for presentation document patches or full document replacement.
- Persist title text edits, selected slide changes, and element property edits.
- Add autosave with debouncing and visible save state.
- Prevent lost updates with an `updatedAt` or document version check.
- Show recoverable save errors without destroying local state.

Acceptance criteria:

- Editing title text persists after page refresh.
- Save status visibly changes between saving, saved, and failed states.
- Concurrent or stale updates fail safely.

Suggested validation:

- API tests for valid save, invalid schema, and stale update.
- Component or integration tests for autosave state where practical.
- Browser QA for edit -> autosave -> refresh.

## Work Package 3: Slide And Deck Structure Editing

Goal: Implement core deck editing controls beyond text properties.

Required functionality:

- Add, duplicate, delete, and reorder slides.
- Rename slides or update slide titles.
- Select slides from the thumbnail rail using persisted state.
- Keep slide IDs stable and schema-valid.
- Add undo/redo for structural operations or clearly define the package boundary if undo/redo is handled in Work Package 4.

Acceptance criteria:

- Users can create and remove slides.
- Reordering slides persists after refresh.
- Deleting the active slide selects a sensible neighboring slide.
- Invalid empty-deck states are prevented.

Suggested validation:

- Unit tests for slide operations.
- API tests for persisted structure changes.
- Browser QA for add, duplicate, delete, reorder, refresh.

## Work Package 4: Editor Command Model And Undo/Redo

Goal: Make editing operations predictable, reversible, and reusable by manual UI and AI actions.

Required functionality:

- Introduce a command/action model for editor mutations.
- Wire undo and redo buttons to command history.
- Include text edits, property edits, pointer changes, and slide structure changes where already implemented.
- Keep unsaved command state compatible with autosave.
- Disable undo/redo controls when unavailable.

Acceptance criteria:

- Undo and redo work for supported editor changes.
- History survives normal editing sessions until reload.
- Autosave persists the current document state, not every transient history step.

Suggested validation:

- Unit tests for command reducer/history behavior.
- Browser QA for edit -> undo -> redo -> autosave.

## Work Package 5: Pointer-Driven AI Edit Requests

Goal: Connect slide pointers and assistant prompt input to a backend AI edit workflow.

Required functionality:

- Persist slide pointers with coordinates, labels, and user instructions.
- Send selected slide, document context, pointer context, and user prompt to a backend route.
- Produce a structured edit proposal instead of directly mutating the deck.
- Show proposal preview with accept and reject actions.
- Record AI operation metadata for later usage reporting.

Acceptance criteria:

- Users can place pointers, describe requested changes, and request an edit proposal.
- The proposal shows what will change before applying it.
- Accepting a proposal updates the persisted document.
- Rejecting a proposal leaves the document unchanged.

Suggested validation:

- Unit tests for pointer context generation.
- API tests using a deterministic mocked provider response.
- Browser QA for pointer -> prompt -> proposal -> accept/reject.

## Work Package 6: Provider Configuration And Real AI Routing

Goal: Move from mocked proposal behavior to configured provider-backed generation.

Required functionality:

- Use stored provider credentials and provider configuration for AI calls.
- Validate provider availability and credential status before generation.
- Route requests through the model router based on task capabilities.
- Handle provider errors, rate limits, and missing credentials clearly.
- Keep deterministic mock mode available for tests.

Acceptance criteria:

- A configured provider can generate an edit proposal.
- Missing credentials produce a clear UI state and do not crash the editor.
- Provider failures are surfaced as recoverable errors.

Suggested validation:

- Provider adapter tests with mocked HTTP responses.
- API tests for missing credentials and provider failure.
- Browser QA with mock mode enabled.

## Work Package 7: Preview Mode

Goal: Add a presentation preview experience separate from edit mode.

Required functionality:

- Implement preview mode from the editor toolbar.
- Render the selected deck in a read-only viewer.
- Support next and previous slide navigation.
- Preserve current editor selection when leaving preview.
- Add keyboard navigation where practical.

Acceptance criteria:

- Preview opens from the editor and shows the current saved deck.
- Navigation works without exposing editing controls.
- Closing preview returns to the editor.

Suggested validation:

- Component tests for preview navigation.
- Browser QA for preview open, navigate, close.

## Work Package 8: PowerPoint Export Flow

Goal: Connect the export button to real `.pptx` generation and download.

Required functionality:

- Add an export API route or job that uses the existing PPTX exporter package.
- Store export output in local file storage.
- Add export status UI in the editor.
- Provide a download action when export completes.
- Record export metadata and errors.

Acceptance criteria:

- Clicking export generates a downloadable `.pptx` from the persisted document.
- Export failures are visible and recoverable.
- Downloaded file opens as a PowerPoint-compatible deck.

Suggested validation:

- Export package tests for generated structure.
- API tests for export creation and download.
- Browser QA for export -> download.

## Work Package 9: Import Flow

Goal: Let users upload an existing `.pptx` and convert it into an editable structured deck.

Required functionality:

- Add upload UI and API route.
- Store uploaded files in local file storage.
- Run the importer package and create a presentation document.
- Show import report warnings and unsupported features.
- Open the created presentation in the editor.

Acceptance criteria:

- A valid `.pptx` upload creates an editable presentation.
- Unsupported content is reported clearly.
- Invalid uploads are rejected safely.

Suggested validation:

- Importer tests with fixture files.
- API tests for valid, invalid, and oversized uploads.
- Browser QA for upload -> report -> open editor.

## Work Package 10: Full Authentication And Authorization

Goal: Replace demo-session behavior with database-backed users and resource authorization.

Required functionality:

- Persist users during registration.
- Verify login credentials against stored password hashes.
- Store hashed session tokens in the `Session` table.
- Validate sessions in middleware and API routes.
- Restrict projects, presentations, assets, exports, and settings to their owner.
- Add logout and session expiration handling.

Acceptance criteria:

- Demo-only credentials are no longer the primary auth path.
- Users can register, log in, and access only their own resources.
- Expired or invalid sessions redirect to login.
- API routes reject unauthorized access.

Suggested validation:

- Auth helper tests.
- API tests for login, logout, expired session, and unauthorized resource access.
- Browser QA for register/login/logout and protected route access.

## Work Package 11: Projects And Presentation Management

Goal: Build the workspace around the editor.

Required functionality:

- List projects and presentations from the database.
- Create, rename, archive, and restore projects.
- Create, rename, duplicate, archive, and restore presentations.
- Navigate from project list to editor.
- Remove remaining hardcoded navigation data.

Acceptance criteria:

- The sidebar and project pages show real user-owned data.
- Creating a presentation opens it in the editor.
- Archived records are hidden from default views and recoverable where supported.

Suggested validation:

- API tests for project and presentation CRUD.
- Browser QA for project creation -> presentation creation -> editor navigation.

## Work Package 12: Production Hardening And Observability

Goal: Make the deployed app easier to operate and debug.

Required functionality:

- Add health checks that verify database, Redis, storage, and worker reachability.
- Add structured error logging without sensitive prompt or credential leakage.
- Add basic worker heartbeat/status.
- Add deployment documentation for required variables and backup expectations.
- Add smoke-test instructions for Coolify deployments.

Acceptance criteria:

- Admin system status reflects real dependency checks.
- Deployment docs clearly list required production values.
- Operational errors can be diagnosed without exposing sensitive data.

Suggested validation:

- API tests for health/status behavior.
- Compose config validation.
- Browser QA for admin status page where applicable.

## Backlog After MVP

- Collaborative editing.
- Template and brand kit management.
- Commenting and review workflow.
- Version history and restore points.
- Visual regression testing for slide rendering.
- Advanced layout suggestions.
- Team accounts and shared workspaces.
- Billing and quota enforcement.

## Immediate Next Step

Start with Work Package 1: Persisted Presentation Loading. This is the foundation for most later work because save, export, AI edits, and project navigation all need the editor to load a real persisted document first.
