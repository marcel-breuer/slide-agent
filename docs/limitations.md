# Limitations

This repository is not yet a complete production MVP. The current implementation is a validated foundation and interactive editor slice.

Known limitations:

- Authentication endpoints are structural and do not yet persist sessions.
- Provider adapters are contract-complete placeholders and do not call paid APIs.
- PPTX import stores uploaded files, creates editable text-first decks, and reports unsupported source content; it does not preserve full OOXML layout fidelity.
- PPTX export supports native text, basic shapes, tables, and notes, with fallback warnings for richer elements.
- Visual regression, E2E, and compatibility testing still need to be expanded.
