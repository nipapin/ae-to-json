const { createEmbeddingProvider, cosineSimilarity } = require('../providers/embeddings');

/**
 * Build vector index from cards already saved in the store.
 */
async function buildIndex(store, options = {}) {
  const provider = options.embeddings || createEmbeddingProvider(options.embeddingConfig || {});
  const compIds = store.listCompIds();
  const cards = [];

  for (const id of compIds) {
    try {
      cards.push(store.loadCard(id));
    } catch (err) {
      console.warn(`[index] skip ${id}: ${err.message}`);
    }
  }

  const texts = cards.map((c) => c.embeddingText || c.description || c.title || '');
  const vectors = texts.length ? await provider.embed(texts) : [];

  const embeddings = cards.map((card, i) => ({
    id: card.id,
    vector: vectors[i]
  }));

  const manifest = store.writeIndex({
    cards,
    embeddings,
    provider: {
      type: provider.constructor.name,
      dimensions: provider.dimensions
    }
  });

  return { manifest, cardCount: cards.length };
}

/**
 * Search cards by natural language query.
 */
async function search(store, query, options = {}) {
  const topK = options.topK || 5;
  const provider = options.embeddings || createEmbeddingProvider(options.embeddingConfig || {});
  const { cards, embeddingsById } = store.loadIndex();

  const [queryVec] = await provider.embed([query]);

  const scored = cards
    .map((card) => {
      const vector = embeddingsById.get(card.id);
      if (!vector) return null;
      const score = cosineSimilarity(queryVec, vector);
      return { score, card };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  let results = scored;

  // Optional hard filters
  if (options.style) {
    const want = String(options.style).toLowerCase();
    results = results.filter((r) => (r.card.style || []).some((s) => s.toLowerCase().includes(want)));
  }
  if (options.intent) {
    const want = String(options.intent).toLowerCase();
    results = results.filter((r) => (r.card.intent || []).some((s) => s.toLowerCase().includes(want)));
  }
  if (options.maxDuration != null) {
    results = results.filter((r) => r.card.duration_s <= options.maxDuration);
  }

  return results.slice(0, topK).map((r) => ({
    score: round(r.score, 6),
    id: r.card.id,
    title: r.card.title,
    intent: r.card.intent,
    style: r.card.style,
    motion: r.card.motion,
    description: r.card.description,
    visualDescription: r.card.visualDescription,
    paths: r.card.paths,
    source: r.card.source
  }));
}

function round(n, p) {
  const m = 10 ** p;
  return Math.round(n * m) / m;
}

module.exports = { buildIndex, search };
