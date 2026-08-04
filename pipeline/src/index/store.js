const fs = require('fs');
const path = require('path');

/**
 * Filesystem index layout:
 *
 * library/
 *   projects/<projectId>/raw.json
 *   comps/<compId>/recipe.json
 *   comps/<compId>/card.json
 *   comps/<compId>/preview.mp4          (optional, user-provided)
 *   comps/<compId>/frames/000.png       (optional)
 *   index/cards.jsonl
 *   index/embeddings.json
 *   index/manifest.json
 */

class LibraryStore {
  constructor(rootDir) {
    this.root = rootDir;
  }

  ensureLayout() {
    for (const rel of ['projects', 'comps', 'index']) {
      fs.mkdirSync(path.join(this.root, rel), { recursive: true });
    }
  }

  projectPath(projectId) {
    return path.join(this.root, 'projects', projectId);
  }

  compPath(compId) {
    return path.join(this.root, 'comps', compId);
  }

  writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  saveProjectRaw(projectId, aeJson, sourcePath) {
    const dir = this.projectPath(projectId);
    fs.mkdirSync(dir, { recursive: true });
    this.writeJson(path.join(dir, 'raw.json'), aeJson);
    this.writeJson(path.join(dir, 'meta.json'), {
      projectId,
      sourcePath: sourcePath || null,
      importedAt: new Date().toISOString()
    });
    return dir;
  }

  saveComp(compId, { recipe, card }) {
    const dir = this.compPath(compId);
    fs.mkdirSync(dir, { recursive: true });
    const recipePath = path.join(dir, 'recipe.json');
    const cardPath = path.join(dir, 'card.json');

    if (card && card.paths) {
      card.paths.recipe = recipePath;
      card.paths.preview = firstExisting([
        path.join(dir, 'preview.mp4'),
        path.join(dir, 'preview.gif'),
        path.join(dir, 'preview.png')
      ]);
      const framesDir = path.join(dir, 'frames');
      if (fs.existsSync(framesDir)) {
        card.paths.frames = fs
          .readdirSync(framesDir)
          .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
          .sort()
          .map((f) => path.join(framesDir, f));
      }
    }

    this.writeJson(recipePath, recipe);
    this.writeJson(cardPath, card);
    return { dir, recipePath, cardPath };
  }

  listCompIds() {
    const root = path.join(this.root, 'comps');
    if (!fs.existsSync(root)) return [];
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  loadCard(compId) {
    return this.readJson(path.join(this.compPath(compId), 'card.json'));
  }

  loadRecipe(compId) {
    return this.readJson(path.join(this.compPath(compId), 'recipe.json'));
  }

  writeIndex({ cards, embeddings, provider }) {
    const indexDir = path.join(this.root, 'index');
    fs.mkdirSync(indexDir, { recursive: true });

    const cardsPath = path.join(indexDir, 'cards.jsonl');
    const lines = cards.map((c) => JSON.stringify(c)).join('\n') + (cards.length ? '\n' : '');
    fs.writeFileSync(cardsPath, lines);

    const embPath = path.join(indexDir, 'embeddings.json');
    this.writeJson(embPath, {
      provider,
      dimensions: embeddings[0] ? embeddings[0].vector.length : 0,
      items: embeddings
    });

    const manifest = {
      updatedAt: new Date().toISOString(),
      cardCount: cards.length,
      cardsPath,
      embeddingsPath: embPath,
      provider
    };
    this.writeJson(path.join(indexDir, 'manifest.json'), manifest);
    return manifest;
  }

  loadIndex() {
    const manifestPath = path.join(this.root, 'index', 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No index found at ${manifestPath}. Run: ae-agent index`);
    }
    const manifest = this.readJson(manifestPath);
    const cards = fs
      .readFileSync(manifest.cardsPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const embeddingsDoc = this.readJson(manifest.embeddingsPath);
    const byId = new Map(embeddingsDoc.items.map((item) => [item.id, item.vector]));
    return { manifest, cards, embeddingsById: byId, dimensions: embeddingsDoc.dimensions };
  }
}

function firstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = { LibraryStore };
