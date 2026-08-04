/**
 * Card = retrieval document. Embeddings are built from embeddingText.
 */

function emptyCard() {
  return {
    schemaVersion: 1,
    id: null,
    title: null,
    intent: [],
    style: [],
    motion: [],
    not: [],
    tags: [],
    duration_s: 0,
    fps: 0,
    size: [1920, 1080],
    complexity: 'unknown',
    description: null,
    visualDescription: null,
    embeddingText: null,
    paths: {
      projectJson: null,
      recipe: null,
      preview: null,
      frames: []
    },
    source: {
      projectId: null,
      projectPath: null,
      compId: null,
      compName: null
    },
    createdAt: null,
    updatedAt: null
  };
}

module.exports = { emptyCard };
