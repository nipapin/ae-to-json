/**
 * Embedding providers.
 *
 * Interface:
 *   embed(texts: string[]) -> number[][]
 *   dimensions: number
 */

class EmbeddingProvider {
  get dimensions() {
    throw new Error('not implemented');
  }

  async embed(_texts) {
    throw new Error('not implemented');
  }
}

/**
 * Deterministic local bag-of-hashed-tokens embedding.
 * Good enough for indexing/dev/tests without an API key.
 */
class LocalHashEmbeddingProvider extends EmbeddingProvider {
  constructor(dimensions = 256) {
    super();
    this._dimensions = dimensions;
  }

  get dimensions() {
    return this._dimensions;
  }

  async embed(texts) {
    return texts.map((text) => this._embedOne(text || ''));
  }

  _embedOne(text) {
    const vec = new Array(this._dimensions).fill(0);
    const tokens = tokenize(text);
    if (!tokens.length) return vec;

    for (const token of tokens) {
      const h = hash32(token);
      const idx = h % this._dimensions;
      const sign = (h & 1) === 0 ? 1 : -1;
      vec[idx] += sign;
    }
    return l2normalize(vec);
  }
}

/**
 * OpenAI-compatible embeddings endpoint.
 * Works with OpenAI, Azure OpenAI-compat, local servers, etc.
 */
class HttpEmbeddingProvider extends EmbeddingProvider {
  constructor(options = {}) {
    super();
    this.url = options.url || 'https://api.openai.com/v1/embeddings';
    this.model = options.model || 'text-embedding-3-small';
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || process.env.AE_EMBED_API_KEY;
    this.headers = options.headers || {};
    this._dimensions = options.dimensions || 1536;
  }

  get dimensions() {
    return this._dimensions;
  }

  async embed(texts) {
    if (!this.apiKey && !this.headers.Authorization) {
      throw new Error('HttpEmbeddingProvider requires apiKey or Authorization header');
    }

    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.headers.Authorization || `Bearer ${this.apiKey}`,
        ...this.headers
      },
      body: JSON.stringify({
        model: this.model,
        input: texts
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Embeddings HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    const vectors = (data.data || [])
      .sort((a, b) => a.index - b.index)
      .map((row) => row.embedding);

    if (vectors[0]) this._dimensions = vectors[0].length;
    return vectors;
  }
}

function createEmbeddingProvider(config = {}) {
  const type = config.type || process.env.AE_EMBEDDINGS || 'local';
  if (type === 'http' || type === 'openai') {
    return new HttpEmbeddingProvider(config);
  }
  return new LocalHashEmbeddingProvider(config.dimensions || 256);
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_/]/g, ' ')
    .split(/[\s/_-]+/)
    .filter((t) => t.length > 1);
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function l2normalize(vec) {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  return vec.map((v) => v / norm);
}

function cosineSimilarity(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

module.exports = {
  EmbeddingProvider,
  LocalHashEmbeddingProvider,
  HttpEmbeddingProvider,
  createEmbeddingProvider,
  cosineSimilarity,
  l2normalize
};
