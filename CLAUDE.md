# Maverick Assistant (MCA) — Project Instructions

MCA is the employee-facing chat UI for Grizzly Electrical Solutions, deployed on Vercel.
It proxies all AI requests through the MCC server via `/api/*` → Tailscale Funnel.

## Architecture

- `src/main.jsx` — single-page React app, no router
- `src/styles.css` — all styles
- `src/mavUtils.js` — `MavMarkdown` renderer, `isDocumentResponse` helper
- `vercel.json` — rewrites `/api/*` to MCC Tailscale Funnel URL

## Workflow Modes

Two modes, defined in `WORKFLOW_MODES` (no dedicated ESTIMATE mode — see below):
- `ask` — ASK MAVERICK: general Q&A, scoping, and estimate building
- `ops` — OPERATIONS: email, docs, spreadsheets, agents

## Estimate Flow (as of 2026-06-23)

**There is no standalone ESTIMATE mode button.** Estimates are triggered naturally in ASK mode.

### How it works end-to-end:
1. User scopes a job conversationally in ASK MAVERICK mode
2. User says "build it", "go ahead", or similar trigger phrase
3. MCC's `handleEstimateFromAsk()` fires — Haiku reads the last 16 messages and extracts agreed line items (via `ESTIMATE_EXTRACT_SYSTEM` prompt), returns `[ESTIMATE_READY]{...}[/ESTIMATE_READY]` in the SSE stream
4. Frontend strips the tag, parses the JSON, sets `pendingEstimate` state → shows the `estimateConfirmBar` with a "⚡ BUILD IT" button and item count
5. While confirm bar is visible, any chat message is routed as an **edit request** (MCC `handleEstimateEdit()` via Haiku + `ESTIMATE_EDIT_SYSTEM`)
6. User clicks "BUILD IT" → POST `/api/chat` with `mode: 'estimate-ready'`, `lineItems`, `pendingCustomer` → MCC spawns `from-chat.ts` in grizzly-hcp → HCP estimate created → URL returned in chat

### Key frontend state:
- `pendingEstimate: { items[], customer: { name, email, phone } }` — set when `[ESTIMATE_READY]` detected
- When `pendingEstimate` is set, it's passed as `pendingItems`/`pendingCustomer` in every ASK chat request so MCC routes to `handleEstimateEdit()`

### Key frontend functions:
- `handleChatSubmit()` — main chat handler; detects `[ESTIMATE_READY]` in stream
- `handleBuildEstimate()` — called by BUILD IT button; sends `mode: 'estimate-ready'` to MCC

## Repo Relationships

```
MCA (this repo, Vercel)
  └─ /api/* → MCC (Tailscale Funnel, port 3000)
                └─ spawns from-chat.ts in grizzly-hcp
                            └─ creates estimate in HCP
```

## Related Repos

- **MCC** (`maverick-core-software/mcc`) — server brain; handles all AI modes, estimate extraction, grizzly-hcp pipeline. Key file: `lib/chat.mjs`
- **grizzly-hcp** (`maverick-core-software/grizzly-hcp`) — HCP automation; `src/automations/estimates/from-chat.ts` is the estimate pipeline entry point

## Session Notes

- MCC needs to be cloned in every session — it cannot be read/written via the local git proxy unless it was selected at session startup
- All three repos (`mcc`, `grizzly-hcp`, `maverick-assistant`) must be selected when creating a Claude Code web session
- If MCC is missing from the local proxy (clone fails with "repository not authorized"), start a fresh session with all 3 repos selected
