# Architecture

Slide Agent uses a TypeScript monorepo with separate packages for presentation schema, rendering, PowerPoint import/export, AI routing, provider adapters, authentication, storage, pricing, database access, and shared utilities.

The core rule is that arbitrary generated HTML is not the presentation data model. The structured presentation schema is the source of truth for browser rendering and PowerPoint export.
