/**
 * Visual AI provider interface.
 *
 * You plug your API here. The pipeline only needs:
 *   caption({ imagePath, frames? }) -> { description, tags, style, raw? }
 */

class VisualAiProvider {
  async caption(_input) {
    throw new Error('VisualAiProvider.caption() not implemented');
  }
}

/**
 * Reads sidecar JSON next to preview if present:
 *   preview.mp4  -> preview.caption.json
 *   frame_01.png -> frame_01.caption.json
 *
 * Useful while wiring a real Visual AI API.
 */
class SidecarVisualAiProvider extends VisualAiProvider {
  constructor(fsModule = require('fs'), pathModule = require('path')) {
    super();
    this.fs = fsModule;
    this.path = pathModule;
  }

  async caption({ imagePath, frames = [] }) {
    const targets = [imagePath, ...frames].filter(Boolean);
    const parts = [];
    const tags = [];
    const style = [];

    for (const target of targets) {
      const sidecar = `${target}.caption.json`.replace(/(\.[^.]+)\.caption\.json$/, '.caption.json');
      // prefer explicit .caption.json beside file
      const candidates = [
        target.replace(/\.[^.]+$/, '.caption.json'),
        `${target}.caption.json`,
        sidecar
      ];

      for (const file of candidates) {
        if (this.fs.existsSync(file)) {
          const data = JSON.parse(this.fs.readFileSync(file, 'utf8'));
          if (data.description) parts.push(data.description);
          if (Array.isArray(data.tags)) tags.push(...data.tags);
          if (Array.isArray(data.style)) style.push(...data.style);
          break;
        }
      }
    }

    return {
      description: parts.join(' ') || null,
      tags: [...new Set(tags)],
      style: [...new Set(style)],
      raw: null
    };
  }
}

/**
 * HTTP provider — point at your Visual AI gateway.
 *
 * Expected response JSON:
 *   { description: string, tags?: string[], style?: string[] }
 */
class HttpVisualAiProvider extends VisualAiProvider {
  constructor(options = {}) {
    super();
    this.url = options.url;
    this.headers = options.headers || {};
    this.fieldName = options.fieldName || 'image';
    if (!this.url) throw new Error('HttpVisualAiProvider requires options.url');
  }

  async caption({ imagePath, frames = [], prompt }) {
    const fs = require('fs');
    const path = require('path');
    const target = imagePath || frames[0];
    if (!target) {
      return { description: null, tags: [], style: [], raw: null };
    }

    const bytes = fs.readFileSync(target);
    const form = new FormData();
    form.append(this.fieldName, new Blob([bytes]), path.basename(target));
    if (prompt) form.append('prompt', prompt);
    if (frames.length) form.append('frameCount', String(frames.length));

    const res = await fetch(this.url, {
      method: 'POST',
      headers: this.headers,
      body: form
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Visual AI HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    return {
      description: data.description || data.caption || null,
      tags: data.tags || [],
      style: data.style || [],
      raw: data
    };
  }
}

/**
 * No-op provider for offline structural indexing.
 */
class NullVisualAiProvider extends VisualAiProvider {
  async caption() {
    return { description: null, tags: [], style: [], raw: null };
  }
}

function createVisualAiProvider(config = {}) {
  const type = config.type || process.env.AE_VISUAL_AI || 'sidecar';
  if (type === 'http') {
    return new HttpVisualAiProvider({
      url: config.url || process.env.AE_VISUAL_AI_URL,
      headers: config.headers || headerFromEnv(process.env.AE_VISUAL_AI_HEADERS),
      fieldName: config.fieldName
    });
  }
  if (type === 'null') return new NullVisualAiProvider();
  return new SidecarVisualAiProvider();
}

function headerFromEnv(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

module.exports = {
  VisualAiProvider,
  SidecarVisualAiProvider,
  HttpVisualAiProvider,
  NullVisualAiProvider,
  createVisualAiProvider
};
