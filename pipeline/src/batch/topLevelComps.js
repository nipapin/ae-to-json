const { flattenItems } = require('../extract/fromAeJson');

/**
 * Top-level composition = CompItem that is not used inside any other composition.
 * In ae-to-json dumps this is `usedIn: []` (or missing).
 */
function isTopLevelComp(item) {
  if (!item || item.typeName !== 'Composition') return false;
  const usedIn = item.usedIn;
  if (usedIn == null) return true;
  if (Array.isArray(usedIn)) return usedIn.length === 0;
  // AE sometimes exposes length-only collection stubs in dumps
  if (typeof usedIn === 'object' && typeof usedIn.length === 'number') {
    return usedIn.length === 0;
  }
  return true;
}

function getTopLevelComps(aeJson) {
  const project = aeJson.project || aeJson;
  const items = flattenItems(project.items || []);
  return items.filter(isTopLevelComp);
}

/**
 * Split a full project dump into one ae-json file per top-level composition.
 * Output shape stays compatible with extractFromAeJson / ingest.
 */
function splitTopLevelComps(aeJson, meta = {}) {
  const project = aeJson.project || aeJson;
  const top = getTopLevelComps(aeJson);
  const projectMeta = omit(project, ['items', 'activeItem', 'selection', 'xmpPacket']);

  return top.map((comp) => ({
    fileName: safeFileName(`${meta.projectName || 'project'}__${comp.name || comp.id}`),
    json: {
      project: Object.assign({}, projectMeta, {
        items: [comp],
        numItems: 1
      }),
      meta: {
        sourceAep: meta.sourceAep || meta.projectPath || null,
        projectName: meta.projectName || null,
        topLevel: true,
        compId: comp.id != null ? comp.id : null,
        compName: comp.name || null,
        exportedAt: new Date().toISOString()
      }
    },
    comp
  }));
}

function omit(obj, keys) {
  const out = {};
  const skip = new Set(keys);
  for (const [k, v] of Object.entries(obj || {})) {
    if (!skip.has(k)) out[k] = v;
  }
  return out;
}

function safeFileName(name) {
  return String(name)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

module.exports = {
  isTopLevelComp,
  getTopLevelComps,
  splitTopLevelComps,
  safeFileName
};
