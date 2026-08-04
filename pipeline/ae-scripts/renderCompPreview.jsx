/**
 * Render short preview + still frames for the active composition.
 * Used to feed Visual AI captions.
 *
 * ES3 / ExtendScript compatible.
 */

(function (global) {
  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  function ensureFolder(fsName) {
    var f = new Folder(fsName);
    if (!f.exists) f.create();
    return f;
  }

  /**
   * @param {object} opts
   * @param {CompItem} [opts.comp] active item by default
   * @param {string} opts.outDir library/comps/<id>/
   * @param {number} [opts.frameCount=3]
   * @param {number} [opts.maxSeconds=3]
   */
  function renderCompPreview(opts) {
    opts = opts || {};
    var comp = opts.comp || app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      throw new Error('Active item must be a composition');
    }

    var outDir = opts.outDir;
    if (!outDir) throw new Error('outDir required');
    ensureFolder(outDir);
    var framesDir = outDir + '/frames';
    ensureFolder(framesDir);

    var frameCount = opts.frameCount || 3;
    var maxSeconds = opts.maxSeconds != null ? opts.maxSeconds : 3;
    var duration = Math.min(comp.duration, maxSeconds);
    var times = [];
    if (frameCount <= 1) {
      times.push(0);
    } else {
      for (var i = 0; i < frameCount; i++) {
        times.push((duration * i) / (frameCount - 1));
      }
    }

    var saved = [];
    for (var t = 0; t < times.length; t++) {
      var file = new File(framesDir + '/' + pad(t, 3) + '.png');
      // saveFrameToPng is available in newer AE; fallback via render queue omitted for CEP simplicity
      if (comp.saveFrameToPng) {
        comp.saveFrameToPng(times[t], file);
        saved.push(file.fsName);
      }
    }

    return {
      compName: comp.name,
      frames: saved,
      note: 'Place preview.mp4 beside frames/ when available (aerender / RQ).'
    };
  }

  global.aeAgentRenderCompPreview = renderCompPreview;
})(this);
