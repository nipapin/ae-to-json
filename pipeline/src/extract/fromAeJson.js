const { recipeFromComp } = require('./recipeFromComp');
const { cardFromRecipe } = require('./cardFromComp');

/**
 * Walk an ae-to-json export and yield per-composition documents.
 */
function extractFromAeJson(aeJson, meta = {}) {
  const project = aeJson.project || aeJson;
  const items = flattenItems(project.items || []);
  const compositions = items.filter((item) => item.typeName === 'Composition');

  const projectId =
    meta.projectId ||
    slug(meta.projectPath || meta.fileName || project.id || 'project');

  return compositions.map((comp) => {
    const recipe = recipeFromComp(comp, {
      projectId,
      projectPath: meta.projectPath || null,
      id: slug(`${projectId}__${comp.name || comp.id}`)
    });

    const card = cardFromRecipe(recipe, {
      paths: {
        projectJson: meta.projectPath || null,
        recipe: null,
        preview: null,
        frames: []
      },
      visual: null
    });

    return {
      recipe,
      card,
      compName: comp.name,
      compId: comp.id
    };
  });
}

function flattenItems(items, out = []) {
  for (const item of items || []) {
    out.push(item);
    if (item.typeName === 'Folder' && Array.isArray(item.items)) {
      flattenItems(item.items, out);
    }
  }
  return out;
}

function listCompositions(aeJson) {
  const project = aeJson.project || aeJson;
  return flattenItems(project.items || []).filter((i) => i.typeName === 'Composition');
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

module.exports = {
  extractFromAeJson,
  listCompositions,
  flattenItems
};
