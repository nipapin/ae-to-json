const { extractFromAeJson, listCompositions, flattenItems } = require('./extract/fromAeJson');
const { recipeFromComp } = require('./extract/recipeFromComp');
const { cardFromRecipe } = require('./extract/cardFromComp');
const { LibraryStore } = require('./index/store');
const { buildIndex, search } = require('./index/search');
const { processProject, processLibrary } = require('./batch/processLibrary');
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

  // providers
  createVisualAiProvider,
  createEmbeddingProvider,
  cosineSimilarity,

  // rebuild
  recipeToJsx
};
