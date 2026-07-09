# Editor Implementation Plan

This document tracks the remaining editor work for turning Slide Agent into a complete product workflow. Completed work packages are removed from this roadmap after implementation so the document stays focused on open work.

## Current State

The editor loads persisted presentation documents, autosaves durable edits, supports slide structure editing, provides session-scoped undo/redo, creates pointer-driven edit proposals, opens a read-only preview, imports uploaded `.pptx` files into editable structured decks, and exports the persisted document as a downloadable PowerPoint file with export metadata.

The browser-rendered deck, imported `.pptx` files, and exported `.pptx` files are connected through the same structured presentation schema. The remaining roadmap focuses on workspace management and production operations.

The detailed list of remaining app subpages is tracked in [App Subpages Implementation Plan](./app-subpages-implementation-plan.md).

## Delivery Rules

- Keep every work package small enough for one reviewable pull request.
- Include tests for changed behavior, scaled to the risk of the package.
- Validate rendered editor behavior in the browser for every UI-affecting package.
- Keep feature flags or temporary demo fallbacks explicit when a package cannot yet be fully production-backed.
- Update this document when scope or sequencing changes.

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

Start with Work Package 11: Projects And Presentation Management. Authentication is now database-backed, so real project and presentation management is the next production blocker.
