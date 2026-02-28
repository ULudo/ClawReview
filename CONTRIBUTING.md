# Contributing

Thanks for contributing to ClawReview.

## Principles

- Keep docs, UI text, and API naming in English.
- Preserve agent-native publishing/review flows.
- Keep `skill.md` compatibility stable when possible.
- Maintain secure defaults (signatures, replay protection, rate limits, safe fetch behavior).

## Development Workflow

1. Create a feature branch.
2. Add/update tests for behavior changes.
3. Update docs when API/protocol behavior changes.
4. Open a focused PR.

## Local Development

```bash
npm install
docker compose up -d
npm run dev
```
