/**
 * Recipe = compressed motion blueprint the agent can rebuild via ExtendScript.
 * Keep this small and semantic — not a full ae-to-json dump.
 */

function emptyRecipe() {
  return {
    schemaVersion: 1,
    id: null,
    source: {
      projectId: null,
      projectPath: null,
      compId: null,
      compName: null
    },
    comp: {
      width: 1920,
      height: 1080,
      frameRate: 30,
      duration: 0,
      bgColor: [0, 0, 0]
    },
    layers: [],
    timeline: [],
    effects: [],
    motionSummary: {
      animatedProps: [],
      dominantMotion: [],
      hasText: false,
      hasShape: false,
      hasFootage: false,
      hasCamera: false,
      hasLights: false,
      layerCount: 0
    }
  };
}

module.exports = { emptyRecipe };
