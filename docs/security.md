# Security

Provider credentials are encrypted with AES-256-GCM using unique nonces. API responses must expose only masked identifiers. Decryption should happen only immediately before provider calls.

The application must not execute AI-generated code or expose private assets publicly.
