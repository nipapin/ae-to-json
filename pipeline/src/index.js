const { extractFromAeJson, listCompositions, flattenItems } = require('./extract/fromAeJson');
const { recipeFromComp } = require('./extract/recipeFromComp');
const { cardFromRecipe } = require('./extract/cardFromComp');
const { LibraryStore } = require('./index/store');
const { buildIndex, search } = require('./index/search');
const { processProject, processLibrary } = require('./batch/processLibrary');
const { findAepFiles } = require('./batch/findAepFiles');
const { getTopLevelComps, splitTopLevelComps, isTopLevelComp } = require('./batch/topLevelComps');
const { batchExportFromAep, batchSplitJsonDumps } = require('./batch/batchExportFromAep');
const { createVisualAiProvider } = require('./providers/visualAi');
const { createEmbeddingProvider, cosineSimilarity } = require('./providers/embeddings');
const { recipeToJsx } = require('./rebuild/recipeToJsx');

module.exports = {
  // extract
  extractFromAeJson,
  listCompositions,
  flattenItems,
  recipeFromComp,
  cardFromRecipe,

  // store + search
  LibraryStore,
  buildIndex,
  search,

  // batch
  processProject,
  processLibrary,
  findAepFiles,
  getTopLevelComps,
  splitTopLevelComps,
  isTopLevelComp,
  batchExportFromAep,
  batchSplitJsonDumps,

  // providers
  createVisualAiProvider,
  createEmbeddingProvider,
  cosineSimilarity,

  // rebuild
  recipeToJsx
};
