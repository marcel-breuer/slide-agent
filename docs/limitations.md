# Limitations

This repository is not yet a complete production MVP. The current implementation is a validated foundation and interactive editor slice.

Known limitations:

- Authentication endpoints are structural and do not yet persist sessions.
- Provider adapters are contract-complete placeholders and do not call paid APIs.
- PPTX import performs safe package inspection but not detailed element conversion.
- PPTX export supports native text, basic shapes, tables, and notes, with fallback warnings for richer elements.
- Visual regression, E2E, and compatibility testing still need to be expanded.
