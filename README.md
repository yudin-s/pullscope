# PullScope

Client-side PR review helper with optional model output.

<p>
  <img alt="Chrome LanguageModel" src="https://img.shields.io/badge/Chrome-LanguageModel-1A73E8?style=for-the-badge&logo=googlechrome&logoColor=white">
  <img alt="Static app" src="https://img.shields.io/badge/Static%20app-GitHub%20Pages-22C55E?style=for-the-badge&logo=githubpages&logoColor=white">
</p>

[Live demo](https://yudin-s.github.io/pullscope/) · [Source](https://github.com/yudin-s/pullscope)

PullScope is a static workbench for reviewing public GitHub pull requests. Paste a PR URL, inspect local risk signals, and optionally add model output from the browser against an OpenAI-compatible endpoint.

The app is useful without a login or backend. It focuses on quick triage: changed files, risk signals, reviewer notes, and a Markdown brief that can be copied into a deeper review workflow.

## Chrome LanguageModel Support

PullScope can use Chrome's browser-side `LanguageModel` API when it is available in the user's browser. The local scoring still runs first, so the app remains usable when browser-native model support is missing.

| Capability | PullScope support |
| --- | --- |
| Browser-managed model | Checks availability and shows preparation/download state where Chrome exposes it. |
| No API key path | Chrome `LanguageModel` runs through the browser runtime without a model API key. |
| Local-first review | Deterministic risk scoring runs before any optional model output. |
| Debuggable output | Raw browser model responses are visible in the UI fallback and console. |

> PullScope is not affiliated with Google. Google, Chrome, Gemini, and Gemini Nano names are used only to describe compatibility with browser features exposed by Chrome.

## What It Does

- Parses public GitHub PR URLs like `https://github.com/owner/repo/pull/123`.
- Fetches PR metadata and changed files from the public GitHub REST API.
- Scores risk locally without a model call.
- Highlights dependency, lockfile, infrastructure, security, test, large-diff, and many-file signals.
- Shows reviewer notes for security, reliability, maintainability, and DX.
- Includes demo data for rate-limit or offline demos.
- Supports Chrome `LanguageModel` where the browser exposes it.
- Supports OpenAI-compatible model endpoints configured by the user.
- Lets you choose automatic, Responses API, or Chat Completions endpoint routing.
- Runs browser-side CORS diagnostics for configured model endpoints.
- Generates a Markdown review brief from the current PR metadata and local signals.

## Static Architecture

PullScope is a frontend-only app.

There is:

- no backend
- no proxy
- no database
- no serverless function
- no OAuth flow in the MVP
- no GitHub writeback
- no committed API key

GitHub reads use public unauthenticated REST endpoints by default. For private repositories, users can paste a fine-grained GitHub token with read-only repository access; that token is sent directly from the browser to `api.github.com` and is not stored by PullScope. All model calls, when enabled, are sent directly from the user's browser to the endpoint they configure.

## Security And Key Handling

PullScope runs entirely in your browser. Your model key is sent directly from your browser to the endpoint you configure. PullScope has no backend and cannot store your key on a server.

Memory-only mode is the default and recommended behavior. Use temporary, restricted, low-limit, read-only tokens. Optional session or local profile saving is an advanced opt-in and stores only provider, model, base URL, and endpoint mode. API keys and GitHub tokens remain memory-only.

Because this is a browser-only app, CORS matters. If a provider does not allow requests from the current origin, PullScope cannot bypass that policy without adding a backend or proxy.

Chrome `LanguageModel` is the browser-native exception: it does not need a base URL, API key, or CORS-compatible endpoint.

## Private Repository Access

PullScope can analyze private GitHub PRs when the user provides a fine-grained GitHub token with read-only access to the target repository. The token is used only for browser-side GitHub REST calls and is cleared on refresh. A full browser-only OAuth flow would require a registered GitHub OAuth/GitHub App flow and is separate from the no-backend token path.

## Provider Recipes

| Provider | Base URL | Default Endpoint |
| --- | --- | --- |
| OpenAI | `https://api.openai.com` | `/v1/responses`, fallback `/v1/chat/completions` |
| Groq | `https://api.groq.com` | `/openai/v1/chat/completions` |
| Ollama | `http://localhost:11434` | `/v1/chat/completions` |
| LM Studio | `http://localhost:1234` | `/v1/chat/completions` |
| Chrome LanguageModel | browser-managed | Chrome `LanguageModel` API |
| Custom | user-defined | Responses or Chat Completions compatible |

Local model notes:

- Ollama may require browser origin/CORS configuration depending on your setup.
- LM Studio may need CORS enabled for browser access.
- Local HTTP endpoints work best while developing locally. Remote HTTPS deployments may be blocked by mixed-content rules when calling `http://localhost`.

## Limitations

- Public PRs only unless the user supplies a read-only GitHub token.
- GitHub unauthenticated rate limits apply.
- Patch snippets can be omitted by GitHub for large or binary files.
- Model review quality depends on the configured provider and model.
- No OAuth or GitHub comment writeback in the MVP.
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
