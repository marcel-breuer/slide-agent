# Repository Instructions

This repository contains Slide Agent, a TypeScript-first monorepo for creating, editing, importing, managing, and exporting PowerPoint presentations.

## Development Environment

- Work inside Docker whenever practical.
- Prefer project-defined Docker Compose commands over host-specific global tools.
- Run dependency installation, tests, linting, type checks, database commands, and builds in the container environment when technically possible.
- Do not require local Node.js, PostgreSQL, Redis, MinIO, or Mailpit installations for normal development.

## Architecture

- Keep domain logic outside React components and route handlers.
- Keep provider-specific logic out of presentation domain services.
- Keep PowerPoint-specific logic out of the browser renderer.
- Keep browser-specific logic out of the PowerPoint exporter.
- Use the versioned presentation schema as the single source of truth.
- Do not execute AI-generated HTML, CSS, JavaScript, or arbitrary code.
- Validate all external input with runtime schemas.

## Security

- Use strict TypeScript.
- Do not hardcode secrets.
- Do not expose or log provider credentials, passwords, tokens, cookies, authorization headers, signed storage URLs, or sensitive prompt content.
- Store provider credentials encrypted at rest and never return plaintext credentials to the browser.
- Add server-side authorization checks for every protected resource.
- Do not remove validation or security checks without an equivalent replacement.

## Quality

- Write tests for changed behavior.
- Do not disable tests to make CI pass.
- Keep commits focused and use Conventional Commits.
- Do not mention coding assistants or generated code in commits, pull requests, changelogs, release notes, source comments, or documentation unless explicitly required.
- Prefer maintained dependencies.
- Avoid large unrelated refactors.
- Make schema migrations backward-compatible where possible.
- Document assumptions and limitations explicitly.
