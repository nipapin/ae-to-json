# AE Agent Pipeline

Handlers that turn a large After Effects project archive into something a CEP agent can **search** and **rebuild**.

This does **not** replace `ae-to-json`. It sits on top of it:

```text
.aep / .aepx
   → (AE + ae-to-json) → raw project JSON
   → extract recipes + cards
   → visual captions (your Visual AI API)
   → embeddings
   → search("minimal logo reveal") → recipe
   → CEP / ExtendScript rebuilds comp from recipe
```

## Quick start

```bash
cd pipeline
node bin/ae-agent.js extract fixtures/sample-project.json /tmp/ae-out
node bin/ae-agent.js ingest-one fixtures/sample-project.json --library /tmp/ae-library
node bin/ae-agent.js index /tmp/ae-library
node bin/ae-agent.js search "minimal logo reveal" --library /tmp/ae-library
npm test
```

## What you provide

| You provide | Where |
|---|---|
| AE project dumps (`ae-to-json` output) | folder of `*.json` |
| Optional preview per comp | `library/comps/<id>/preview.mp4` or `.png` |
| Optional still frames | `library/comps/<id>/frames/000.png` … |
| Visual AI API | `AE_VISUAL_AI=http` + `AE_VISUAL_AI_URL` |
| Embeddings API (optional) | `AE_EMBEDDINGS=http` + `OPENAI_API_KEY` |

Until Visual AI is wired, put captions next to previews:

```json
// library/comps/<id>/preview.caption.json
{
  "description": "Soft centered logo fade-in on black",
  "tags": ["logo", "reveal", "fade"],
  "style": ["minimal", "clean"]
}
```

## Library layout

```text
library/
  projects/<projectId>/raw.json
  comps/<compId>/
    recipe.json      # motion blueprint for ExtendScript
    card.json        # search document
    preview.mp4      # optional
    frames/000.png   # optional
  index/
    cards.jsonl
    embeddings.json
    manifest.json
```

## Algorithms (stages)

### 1. Export (runs inside AE)
- `ae-scripts/exportProjectJson.jsx` — dump open project via `aeToJSON`
- `ae-scripts/renderCompPreview.jsx` — still frames for Visual AI

### 2. Extract
For each composition in a dump:
- guess layer roles (`logo`, `title`, `bg`, …)
- compress keyframes → motion labels (`fade in`, `scale up`, …)
- build **recipe** (rebuildable timeline)
- build **card** (intent/style/tags/embeddingText)

### 3. Visual caption
Provider interface in `src/providers/visualAi.js`:
- `sidecar` (default, reads `*.caption.json`)
- `http` (your API)
- `null` (structure-only)

### 4. Embed + search
- `local` hash embeddings for offline/dev
- `http` OpenAI-compatible embeddings for production
- cosine search over cards

## CEP agent loop (later)

```text
user: "minimal logo reveal"
  → ae-agent search
  → pick top recipe
  → JSX builder applies recipe.timeline / layers
  → optional aerender preview back to panel
```

Recipe is the contract between AI and ExtendScript — not the full ae-json.

## Env

```bash
export AE_VISUAL_AI=sidecar          # or http | null
export AE_VISUAL_AI_URL=https://...
export AE_VISUAL_AI_HEADERS='{"Authorization":"Bearer ..."}'
export AE_EMBEDDINGS=local           # or http
export OPENAI_API_KEY=...
```

## API (Node)

```js
const {
  extractFromAeJson,
  processProject,
  LibraryStore,
  buildIndex,
  search,
  createVisualAiProvider,
  createEmbeddingProvider
} = require('./src');
```
