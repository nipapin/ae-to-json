/**
 * Batch-export currently open AE project via ae-to-json.
 *
 * Usage (ExtendScript / CEP evalScript):
 *   1. Build/bundle ae-to-json into after-effects.js (see repo root npm scripts)
 *   2. #include or eval aeToJSON
 *   3. Run this script with OUTPUT_DIR set
 *
 * This file is intentionally ES3-friendly.
 */

(function (global) {
  var OUTPUT_DIR = global.AE_AGENT_OUTPUT_DIR || Folder.desktop.fsName + '/ae-agent-dumps';

  function ensureFolder(fsName) {
    var f = new Folder(fsName);
    if (!f.exists) f.create();
    return f;
  }

  function projectBaseName() {
    if (!app.project || !app.project.file) return 'untitled_project';
    var n = File.decode(app.project.file.name);
    return n.replace(/\.(aep|aepx)$/i, '');
  }

  function exportOpenProject() {
    if (typeof aeToJSON !== 'function') {
      throw new Error('aeToJSON is not available. Load ae-to-json bundle first.');
    }

    ensureFolder(OUTPUT_DIR);
    var json = aeToJSON();
    var name = projectBaseName() + '.json';
    var out = new File(OUTPUT_DIR + '/' + name);
    out.encoding = 'UTF-8';
    out.open('w');
    out.write(JSON.stringify(json));
    out.close();
    return out.fsName;
  }

  global.aeAgentExportOpenProject = exportOpenProject;
})(this);
