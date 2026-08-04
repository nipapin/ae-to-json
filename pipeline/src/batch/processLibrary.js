const fs = require('fs');
const path = require('path');
const { extractFromAeJson } = require('../extract/fromAeJson');
const { cardFromRecipe } = require('../extract/cardFromComp');
const { createVisualAiProvider } = require('../providers/visualAi');

/**
 * Process one ae-to-json dump into library comps.
 */
async function processProject(store, aeJson, meta = {}, options = {}) {
  const visualAi = options.visualAi || createVisualAiProvider(options.visualConfig || { type: 'sidecar' });
  const projectId =
    meta.projectId ||
    slug(path.basename(meta.projectPath || meta.fileName || 'project', path.extname(meta.projectPath || '')));

  store.ensureLayout();
  store.saveProjectRaw(projectId, aeJson, meta.projectPath || null);

  const extracted = extractFromAeJson(aeJson, {
    projectId,
    projectPath: meta.projectPath || null,
    fileName: meta.fileName || null
  });

  const saved = [];

  for (const item of extracted) {
    // Pre-create comp folder so sidecar captions / previews can be found
    const compDir = store.compPath(item.recipe.id);
    fs.mkdirSync(compDir, { recursive: true });

    const preview = firstExisting([
      path.join(compDir, 'preview.mp4'),
      path.join(compDir, 'preview.gif'),
      path.join(compDir, 'preview.png'),
      meta.previewPath || null
    ]);

    const framesDir = path.join(compDir, 'frames');
    const frames = fs.existsSync(framesDir)
      ? fs
          .readdirSync(framesDir)
          .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
          .sort()
          .map((f) => path.join(framesDir, f))
      : [];

    let visual = { description: null, tags: [], style: [] };
    try {
      visual = await visualAi.caption({
        imagePath: preview,
        frames,
        prompt: `Describe this After Effects motion graphic composition for search. Focus on style, motion type, and purpose. Comp name: ${item.compName}`
      });
    } catch (err) {
      console.warn(`[visual] ${item.recipe.id}: ${err.message}`);
    }

    const card = cardFromRecipe(item.recipe, {
      visual,
      paths: {
        projectJson: path.join(store.projectPath(projectId), 'raw.json'),
        recipe: null,
        preview,
        frames
      }
    });

    // Merge visual style into card.style if provider returned style labels
    if (visual.style && visual.style.length) {
      card.style = unique([...(card.style || []), ...visual.style]);
      card.tags = unique([...(card.tags || []), ...visual.style]);
      card.embeddingText = [
        card.embeddingText,
        `visual style: ${visual.style.join(', ')}`
      ].join('\n');
    }

    store.saveComp(item.recipe.id, { recipe: item.recipe, card });
    saved.push({ id: item.recipe.id, title: card.title, intent: card.intent, style: card.style });
  }

  return { projectId, comps: saved };
}

/**
 * Ingest a folder of *.json ae-to-json dumps.
 */
async function processLibrary(store, inputDir, options = {}) {
  const files = walkJsonFiles(inputDir);
  const results = [];

  for (const file of files) {
    // skip already-processed library output
    if (file.includes(`${path.sep}comps${path.sep}`) || file.includes(`${path.sep}index${path.sep}`)) {
      continue;
    }
    if (path.basename(file) === 'recipe.json' || path.basename(file) === 'card.json') {
      continue;
    }

    console.log(`[ingest] ${file}`);
    const aeJson = JSON.parse(fs.readFileSync(file, 'utf8'));
    const result = await processProject(
      store,
      aeJson,
      { projectPath: file, fileName: path.basename(file) },
      options
    );
    results.push(result);
  }

  return results;
}

function walkJsonFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walkJsonFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

function firstExisting(paths) {
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'project';
}

module.exports = {
  processProject,
  processLibrary,
  walkJsonFiles
};
