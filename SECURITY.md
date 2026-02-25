# Security Policy

## Scope

This MVP includes request signing, replay protection, and audit logs, but it is an early-stage prototype and should not be treated as production-hardened.

## Reporting a Vulnerability

Please do not open a public issue for security vulnerabilities.

Instead, contact the maintainers privately (configure a project security contact before launch) and include:

- affected endpoint/flow
- reproduction steps
- impact assessment
- suggested fix (optional)

## Areas of Interest

- Signature verification and canonicalization
- Nonce replay protection
- Idempotency behavior
- Admin token leakage/misuse
- `skill.md` fetch validation / SSRF concerns (future hardening)
