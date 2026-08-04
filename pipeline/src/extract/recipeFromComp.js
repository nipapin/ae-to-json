const { guessRole } = require('./layerRoles');
const { extractLayerMotion, dominantMotionLabels } = require('./motionSignature');
const { emptyRecipe } = require('../schemas/recipe');

/**
 * Convert one ae-to-json Composition item into a compact recipe.
 */
function recipeFromComp(comp, meta = {}) {
  const recipe = emptyRecipe();
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const maxIndex = layers.reduce((m, l) => Math.max(m, l.index || 0), 0);

  recipe.id = meta.id || slug(`${meta.projectId || 'project'}_${comp.id || comp.name}`);
  recipe.source = {
    projectId: meta.projectId || null,
    projectPath: meta.projectPath || null,
    compId: comp.id != null ? comp.id : null,
    compName: comp.name || null
  };
  recipe.comp = {
    width: comp.width || 1920,
    height: comp.height || 1080,
    frameRate: comp.frameRate || 30,
    duration: round(comp.duration || 0, 4),
    bgColor: normalizeColor(comp.bgColor)
  };

  const layerMotions = [];
  const effects = [];

  recipe.layers = layers.map((layer) => {
    const layerWithMax = Object.assign({}, layer, { _maxIndex: maxIndex });
    const role = guessRole(layerWithMax);
    const tracks = extractLayerMotion(layer);
    layerMotions.push({ name: layer.name, role, tracks });

    const layerEffects = extractEffects(layer);
    for (const fx of layerEffects) {
      effects.push({ layer: layer.name, role, ...fx });
    }

    const animated = tracks
      .filter((t) => t.summary && t.summary.kind === 'animated')
      .map((t) => ({
        prop: t.name,
        path: t.path,
        from: t.summary.from,
        to: t.summary.to,
        t0: t.keyframes[0].t,
        t1: t.keyframes[t.keyframes.length - 1].t,
        label: t.summary.label,
        keyCount: t.summary.keyCount
      }));

    // Compact timeline entries
    for (const a of animated) {
      recipe.timeline.push({
        layer: layer.name,
        role,
        prop: a.prop,
        from: a.from,
        to: a.to,
        t: [a.t0, a.t1],
        label: a.label
      });
    }

    return {
      index: layer.index,
      name: layer.name,
      role,
      enabled: layer.enabled !== false,
      inPoint: round(layer.inPoint || 0, 4),
      outPoint: round(layer.outPoint != null ? layer.outPoint : recipe.comp.duration, 4),
      parent: layer.parent,
      nullLayer: Boolean(layer.nullLayer),
      adjustmentLayer: Boolean(layer.adjustmentLayer),
      threeDLayer: Boolean(layer.threeDLayer),
      source: layer.source || null,
      matchName: layer.matchName || null,
      effects: layerEffects.map((e) => e.name),
      motion: animated
    };
  });

  recipe.effects = effects.slice(0, 40);
  recipe.motionSummary = buildMotionSummary(recipe, layerMotions);

  return recipe;
}

function extractEffects(layer) {
  const props = layer.properties || {};
  const parade = props.Effects || props['ADBE Effect Parade'] || null;
  if (!parade) return [];

  const groups = parade.properties || parade;
  if (!groups || typeof groups !== 'object') return [];

  const out = [];
  for (const [name, value] of Object.entries(groups)) {
    if (!value || typeof value !== 'object') continue;
    if (name === 'keyframes' || name === 'selectedKeys') continue;
    out.push({
      name,
      matchName: value.matchName || null,
      enabled: value.enabled !== false
    });
  }
  return out;
}

function buildMotionSummary(recipe, layerMotions) {
  const animatedProps = new Set();
  for (const layer of recipe.layers) {
    for (const m of layer.motion) animatedProps.add(m.prop);
  }

  return {
    animatedProps: [...animatedProps],
    dominantMotion: dominantMotionLabels(layerMotions),
    hasText: recipe.layers.some((l) => /text/i.test(l.matchName || '') || l.role === 'title' || l.role === 'subtitle'),
    hasShape: recipe.layers.some((l) => /shape/i.test(l.matchName || '') || l.role === 'accent'),
    hasFootage: recipe.layers.some((l) => Boolean(l.source) || l.role === 'logo' || l.role === 'content'),
    hasCamera: recipe.layers.some((l) => l.role === 'camera'),
    hasLights: recipe.layers.some((l) => l.role === 'light'),
    layerCount: recipe.layers.length
  };
}

function normalizeColor(c) {
  if (!Array.isArray(c) || c.length < 3) return [0, 0, 0];
  return c.slice(0, 3).map((x) => round(Number(x) || 0, 4));
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function round(n, p) {
  const m = 10 ** p;
  return Math.round(Number(n) * m) / m;
}

module.exports = { recipeFromComp };
