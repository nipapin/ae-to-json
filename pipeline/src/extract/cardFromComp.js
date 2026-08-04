const { emptyCard } = require('../schemas/card');

/**
 * Build a retrieval card from a recipe (+ optional visual caption).
 */
function cardFromRecipe(recipe, options = {}) {
  const visual = options.visual || null;
  const card = emptyCard();
  const now = new Date().toISOString();

  card.id = recipe.id;
  card.title = recipe.source.compName || recipe.id;
  card.duration_s = recipe.comp.duration;
  card.fps = recipe.comp.frameRate;
  card.size = [recipe.comp.width, recipe.comp.height];
  card.source = { ...recipe.source };
  card.paths = {
    projectJson: options.paths && options.paths.projectJson || null,
    recipe: options.paths && options.paths.recipe || null,
    preview: options.paths && options.paths.preview || null,
    frames: (options.paths && options.paths.frames) || []
  };
  card.createdAt = now;
  card.updatedAt = now;

  const motion = recipe.motionSummary.dominantMotion || [];
  card.motion = unique(motion);

  card.intent = guessIntent(recipe, visual);
  card.style = guessStyle(recipe, visual);
  card.not = guessNot(recipe, visual);
  card.tags = unique([
    ...card.intent,
    ...card.style,
    ...card.motion,
    ...inferStructuralTags(recipe),
    ...((visual && visual.tags) || [])
  ]);

  card.complexity = guessComplexity(recipe);
  card.visualDescription = (visual && visual.description) || null;
  card.description = buildDescription(recipe, visual);
  card.embeddingText = buildEmbeddingText(card, recipe);

  return card;
}

function guessIntent(recipe, visual) {
  const text = collectText(recipe, visual).toLowerCase();
  const intent = [];

  const rules = [
    [/logo\s*reveal|brand\s*intro|logo\s*intro/, 'logo reveal'],
    [/lower\s*third/, 'lower third'],
    [/title\s*card|opening\s*title|main\s*title/, 'title card'],
    [/transition|wipe|dissolve/, 'transition'],
    [/outro|end\s*card|credits/, 'outro'],
    [/slideshow|photo\s*gallery/, 'slideshow'],
    [/infographic|data\s*viz/, 'infographic'],
    [/hud|ui\s*anim|interface/, 'ui animation'],
    [/kinetic\s*type|text\s*anim/, 'kinetic type']
  ];

  for (const [re, label] of rules) {
    if (re.test(text)) intent.push(label);
  }

  // Heuristics from structure
  const roles = new Set(recipe.layers.map((l) => l.role));
  if (roles.has('logo') && recipe.comp.duration > 0 && recipe.comp.duration <= 5) {
    intent.push('logo reveal');
  }
  if (roles.has('title') && roles.has('subtitle')) {
    intent.push('title card');
  }
  if (intent.length === 0) {
    if (recipe.motionSummary.hasText) intent.push('text animation');
    else intent.push('motion graphic');
  }

  return unique(intent);
}

function guessStyle(recipe, visual) {
  const text = collectText(recipe, visual).toLowerCase();
  const style = [];
  const rules = [
    [/minimal|clean|simple|soft/, 'minimal'],
    [/corporate|business|office/, 'corporate'],
    [/glitch|noise|distort/, 'glitch'],
    [/neon|cyber|futur/, 'futuristic'],
    [/hand.?drawn|sketch|doodle/, 'hand-drawn'],
    [/luxury|elegant|gold|serif/, 'elegant'],
    [/brutal|bold|heavy/, 'bold'],
    [/flat|2d/, 'flat'],
    [/3d|cinema|camera/, '3d'],
    [/particle|dust|bokeh/, 'particles']
  ];
  for (const [re, label] of rules) {
    if (re.test(text)) style.push(label);
  }

  const motion = (recipe.motionSummary.dominantMotion || []).join(' ').toLowerCase();
  if (/fade/.test(motion) && /scale/.test(motion) && style.length === 0) {
    style.push('minimal');
  }
  if (recipe.motionSummary.hasCamera) style.push('3d');
  if (style.length === 0) style.push('general');

  return unique(style);
}

function guessNot(recipe, visual) {
  const style = new Set(guessStyle(recipe, visual));
  const not = [];
  if (style.has('minimal')) not.push('glitch', 'particles', 'shake');
  if (!recipe.motionSummary.hasCamera) not.push('3d camera move');
  return unique(not);
}

function inferStructuralTags(recipe) {
  const tags = [];
  const ms = recipe.motionSummary;
  if (ms.hasText) tags.push('text');
  if (ms.hasShape) tags.push('shape');
  if (ms.hasFootage) tags.push('footage');
  if (ms.hasCamera) tags.push('camera');
  if (ms.layerCount <= 3) tags.push('simple-layers');
  if (ms.layerCount >= 12) tags.push('complex-layers');
  if (recipe.comp.duration > 0 && recipe.comp.duration <= 3) tags.push('short');
  if (recipe.comp.duration >= 10) tags.push('long');
  for (const m of ms.dominantMotion || []) tags.push(m);
  return tags;
}

function guessComplexity(recipe) {
  const score =
    recipe.layers.length +
    recipe.timeline.length +
    recipe.effects.length * 0.5 +
    (recipe.motionSummary.hasCamera ? 4 : 0);
  if (score < 8) return 'low';
  if (score < 20) return 'medium';
  return 'high';
}

function buildDescription(recipe, visual) {
  const parts = [];
  parts.push(`Composition "${recipe.source.compName || recipe.id}"`);
  parts.push(`${recipe.comp.width}x${recipe.comp.height} @ ${recipe.comp.frameRate}fps`);
  parts.push(`${round(recipe.comp.duration, 2)}s`);
  parts.push(`${recipe.layers.length} layers`);

  if (recipe.motionSummary.dominantMotion.length) {
    parts.push(`motion: ${recipe.motionSummary.dominantMotion.slice(0, 5).join(', ')}`);
  }
  if (visual && visual.description) {
    parts.push(`look: ${visual.description}`);
  }
  return parts.join(' · ');
}

function buildEmbeddingText(card, recipe) {
  return [
    card.title,
    card.description,
    card.visualDescription,
    `intent: ${card.intent.join(', ')}`,
    `style: ${card.style.join(', ')}`,
    `motion: ${card.motion.join(', ')}`,
    `tags: ${card.tags.join(', ')}`,
    `not: ${card.not.join(', ')}`,
    `roles: ${recipe.layers.map((l) => l.role).join(', ')}`
  ]
    .filter(Boolean)
    .join('\n');
}

function collectText(recipe, visual) {
  return [
    recipe.source.compName,
    recipe.id,
    ...(recipe.layers || []).map((l) => l.name),
    ...(recipe.motionSummary.dominantMotion || []),
    visual && visual.description,
    visual && (visual.tags || []).join(' ')
  ]
    .filter(Boolean)
    .join(' ');
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function round(n, p) {
  const m = 10 ** p;
  return Math.round(Number(n) * m) / m;
}

module.exports = { cardFromRecipe };
