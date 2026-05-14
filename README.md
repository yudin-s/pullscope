# PullScope

Client-side AI PR review with your own model endpoint.

[Live demo](https://yudin-s.github.io/pullscope/) · [Source](https://github.com/yudin-s/pullscope)

PullScope is a zero-backend workbench for reviewing public GitHub pull requests. Paste a PR URL, inspect deterministic local risk signals, and optionally run an AI review directly from your browser against an OpenAI-compatible endpoint.

It is designed as a portfolio-grade open-source devtool: useful without login, static-hostable on GitHub Pages, security-aware, and polished enough to show real product engineering.

## What It Does

- Parses public GitHub PR URLs like `https://github.com/owner/repo/pull/123`.
- Fetches PR metadata and changed files from the public GitHub REST API.
- Scores risk locally without AI.
- Highlights dependency, lockfile, infrastructure, security, test, large-diff, and many-file signals.
- Shows reviewer persona notes for security, reliability, maintainability, and DX.
- Includes demo data for rate-limit or offline demos.
- Provides BYOK provider setup for OpenAI-compatible model endpoints.
- Lets you choose automatic, Responses API, or Chat Completions endpoint routing.
- Runs browser-side CORS diagnostics across model-list, Responses, Chat, and minimal completion probes.
- Generates a Codex-ready Markdown review brief.

## Zero-Backend Architecture

PullScope is a static frontend only.

There is:

- no backend
- no proxy
- no database
- no serverless function
- no OAuth flow in the MVP
- no GitHub writeback
- no committed API key

All GitHub reads use public unauthenticated REST endpoints. All model calls, when enabled, are sent directly from the user's browser to the endpoint they configure.

## Security And Key Handling

PullScope runs entirely in your browser. Your model key is sent directly from your browser to the endpoint you configure. PullScope has no backend and cannot store your key on a server.

Memory-only mode is the default and recommended behavior. Use temporary, restricted, or low-limit API keys. Optional session or local profile saving is an advanced opt-in and stores only provider, model, base URL, and endpoint mode. API keys remain memory-only.

Because this is a browser-only app, CORS matters. If a provider does not allow requests from the current origin, PullScope cannot bypass that policy without adding a backend or proxy, which is intentionally outside the MVP architecture.

## Provider Recipes

| Provider | Base URL | Default Endpoint |
| --- | --- | --- |
| OpenAI | `https://api.openai.com` | `/v1/responses`, fallback `/v1/chat/completions` |
| OpenRouter | `https://openrouter.ai` | `/api/v1/chat/completions` |
| Groq | `https://api.groq.com` | `/openai/v1/chat/completions` |
| Ollama | `http://localhost:11434` | `/v1/chat/completions` |
| LM Studio | `http://localhost:1234` | `/v1/chat/completions` |
| Custom | user-defined | Responses or Chat Completions compatible |

Local model notes:

- Ollama may require browser origin/CORS configuration depending on your setup.
- LM Studio may need CORS enabled for browser access.
- Local HTTP endpoints work best while developing locally. Remote HTTPS deployments may be blocked by mixed-content rules when calling `http://localhost`.

## Codex Brief

The Codex-ready brief is generated from the current PR metadata, deterministic risk score, top file signals, and reviewer persona notes. It is Markdown-only and can be copied into Codex or another code-review assistant without requiring the optional AI review step.

## Limitations

- Public PRs only.
- GitHub unauthenticated rate limits apply.
- Patch snippets can be omitted by GitHub for large or binary files.
- AI review quality depends on the configured provider and model.
- No OAuth, private repository access, or GitHub comment writeback in the MVP.
- No full repository analysis.

## Development

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

## Deployment To GitHub Pages

The repository includes a GitHub Actions workflow at `.github/workflows/deploy.yml`.

During GitHub Actions builds, Vite derives the Pages base path from `GITHUB_REPOSITORY`, so forks and renamed repositories use their own repository slug automatically.

In GitHub:

1. Open repository settings.
2. Go to Pages.
3. Set source to GitHub Actions.
4. Push to `main`.

## Portfolio Positioning

PullScope demonstrates:

- frontend product engineering
- API integration without a backend
- static deployment constraints
- security-aware BYOK UX
- AI tooling integration
- useful deterministic analysis before model calls
- polished dashboard and developer workflow design

It is intentionally scoped as a practical open-source devtool, not a SaaS.
