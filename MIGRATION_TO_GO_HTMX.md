# Migration Plan: React/TS to Go/HTMX

## Phase 1: Environment & Sandbox Update

- [ ] Add Go to Dockerfile.sandbox
  - _If `apk add go` exists in `Dockerfile.sandbox` then step done_
- [ ] Update sandbox-agent.js to support Go command execution
  - _If `sandbox-agent.js` can run `go run main.go` then step done_
- [ ] Update `app.config.ts` to include Go/HTMX configurations
  - _If `appConfig` has `go` runtime settings then step done_

## Phase 2: Generation Logic Update

- [ ] Update prompt engineering (packages/create-open-lovable/lib/prompts.js)
  - _If AI produces Go structs + HTMX templates instead of React components then step done_
- [ ] Update API handlers (`generate-ai-code-stream/route.ts`)
  - _If stream supports Go/HTMX file naming/extension output then step done_

## Phase 3: Runtime & Preview

- [ ] Update internal preview (Template Go + HTMX)
  - _If `/home/user/app/main.go` and `index.html` (with htmx.org CDN) run successfully then step done_
