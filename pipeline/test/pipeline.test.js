const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  extractFromAeJson,
  recipeFromComp,
  cardFromRecipe,
  LibraryStore,
  processProject,
  buildIndex,
  search,
  createEmbeddingProvider,
  createVisualAiProvider
} = require('../src');

const SAMPLE = path.join(__dirname, '../fixtures/sample-project.json');

test('extract yields one doc per composition', () => {
  const aeJson = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
  const docs = extractFromAeJson(aeJson, { projectId: 'sample' });
  assert.equal(docs.length, 2);
  assert.equal(docs[0].recipe.source.compName, 'Minimal Logo Reveal');
  assert.ok(docs[0].recipe.layers.some((l) => l.role === 'logo'));
  assert.ok(docs[0].recipe.motionSummary.dominantMotion.includes('fade in'));
  assert.ok(docs[0].recipe.motionSummary.dominantMotion.includes('scale up'));
});

test('card intent detects logo reveal', () => {
  const aeJson = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
  const docs = extractFromAeJson(aeJson, { projectId: 'sample' });
  const minimal = docs.find((d) => d.compName === 'Minimal Logo Reveal');
  assert.ok(minimal.card.intent.includes('logo reveal'));
  assert.ok(minimal.card.embeddingText.toLowerCase().includes('logo'));
});

test('ingest + index + search finds minimal logo reveal', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-agent-'));
  const store = new LibraryStore(tmp);
  const aeJson = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));

  // Write a visual caption sidecar for the minimal comp after first pass folder creation
  await processProject(
    store,
    aeJson,
    { projectPath: SAMPLE, projectId: 'sample' },
    { visualAi: createVisualAiProvider({ type: 'null' }) }
  );

  // Enrich with caption sidecar and re-process visual via sidecar provider
  const comps = store.listCompIds();
  const minimalId = comps.find((id) => id.includes('minimal-logo-reveal'));
  assert.ok(minimalId);

  const preview = path.join(store.compPath(minimalId), 'preview.png');
  fs.writeFileSync(preview, Buffer.from([0])); // placeholder bytes
  fs.writeFileSync(
    path.join(store.compPath(minimalId), 'preview.caption.json'),
    JSON.stringify({
      description: 'Clean centered logo fading in with gentle scale on black background',
      tags: ['logo', 'minimal', 'fade'],
      style: ['minimal', 'clean']
    })
  );

  await processProject(
    store,
    aeJson,
    { projectPath: SAMPLE, projectId: 'sample' },
    { visualAi: createVisualAiProvider({ type: 'sidecar' }) }
  );

  const embeddings = createEmbeddingProvider({ type: 'local' });
  await buildIndex(store, { embeddings });

  const results = await search(store, 'minimal logo reveal', { embeddings, topK: 2 });
  assert.ok(results.length >= 1);
  assert.match(results[0].title.toLowerCase(), /logo/);
  assert.ok(results[0].score > 0);
});

test('recipe timeline keeps compact motion ops', () => {
  const aeJson = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
  const comp = aeJson.project.items[0];
  const recipe = recipeFromComp(comp, { projectId: 'x' });
  assert.ok(recipe.timeline.length >= 2);
  const opacity = recipe.timeline.find((t) => t.prop === 'Opacity');
  assert.equal(opacity.from, 0);
  assert.equal(opacity.to, 100);
  const card = cardFromRecipe(recipe);
  assert.equal(card.complexity, 'low');
});
