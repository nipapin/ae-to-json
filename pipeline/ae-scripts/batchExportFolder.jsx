/**
 * Run inside After Effects (File > Scripts > Run Script File...)
 * Asks for a projects folder + output folder, then batch-exports
 * one JSON per top-level composition (usedIn.length === 0).
 *
 * ES3 / ExtendScript compatible — no Node required.
 */

(function () {
  app.beginSuppressDialogs();

  var projectsFolder = Folder.selectDialog('Select folder with .aep / .aepx projects');
  if (!projectsFolder) return;

  var outFolder = Folder.selectDialog('Select output folder for JSON dumps');
  if (!outFolder) return;

  var projects = [];
  collectProjects(projectsFolder, projects);

  if (!projects.length) {
    alert('No .aep / .aepx files found.');
    return;
  }

  var written = 0;
  var errors = [];

  for (var p = 0; p < projects.length; p++) {
    var projectFile = projects[p];
    try {
      app.open(projectFile);
      var projectName = File.decode(projectFile.name).replace(/\.(aep|aepx)$/i, '');
      var comps = [];
      var i;
      for (i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof CompItem && item.usedIn.length === 0) {
          comps.push(item);
        }
      }

      for (var c = 0; c < comps.length; c++) {
        var payload = {
          project: {
            bitsPerChannel: app.project.bitsPerChannel,
            numItems: 1,
            items: [serializeComp(comps[c])]
          },
          meta: {
            sourceAep: projectFile.fsName,
            projectName: projectName,
            topLevel: true,
            compId: comps[c].id,
            compName: comps[c].name,
            exportedAt: new Date().toString()
          }
        };

        var fileName = safeName(projectName + '__' + comps[c].name) + '.json';
        var outFile = new File(outFolder.fsName + '/' + fileName);
        outFile.encoding = 'UTF-8';
        outFile.open('w');
        outFile.write(stringify(payload));
        outFile.close();
        written++;
      }

      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    } catch (err) {
      errors.push(projectFile.fsName + ': ' + err.toString());
      try {
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
      } catch (e2) {}
    }
  }

  app.endSuppressDialogs(false);
  alert('Done. Wrote ' + written + ' JSON file(s).\nErrors: ' + errors.length);

  // ---- helpers ----

  function collectProjects(folder, out) {
    var entries = folder.getFiles();
    for (var i = 0; i < entries.length; i++) {
      var f = entries[i];
      if (f instanceof Folder) {
        if (f.name.indexOf('.') === 0) continue;
        if (f.name === 'Adobe After Effects Auto-Save') continue;
        collectProjects(f, out);
      } else if (f instanceof File) {
        if (/\.aepx?$/i.test(f.name)) out.push(f);
      }
    }
  }

  function serializeComp(comp) {
    var layers = [];
    var layerIndex = {};
    var li;
    for (li = 1; li <= comp.numLayers; li++) {
      layerIndex[comp.layer(li).id] = li - 1;
    }
    for (li = 1; li <= comp.numLayers; li++) {
      layers.push(serializeLayer(comp.layer(li), layerIndex));
    }
    return {
      typeName: 'Composition',
      id: comp.id,
      name: comp.name,
      width: comp.width,
      height: comp.height,
      frameRate: comp.frameRate,
      duration: comp.duration,
      frameDuration: comp.frameDuration,
      bgColor: [comp.bgColor[0], comp.bgColor[1], comp.bgColor[2]],
      pixelAspect: comp.pixelAspect,
      numLayers: comp.numLayers,
      usedIn: [],
      layers: layers
    };
  }

  function serializeLayer(layer, layerIndex) {
    var parentIdx = null;
    if (layer.parent && layerIndex[layer.parent.id] !== undefined) {
      parentIdx = layerIndex[layer.parent.id];
    }
    var source = null;
    try {
      if (layer.source && layer.source.file) source = layer.source.file.fsName;
      else if (layer.source && layer.source.name) source = layer.source.name;
    } catch (e) {}

    return {
      index: layer.index,
      id: layer.id,
      name: layer.name,
      enabled: layer.enabled,
      inPoint: layer.inPoint,
      outPoint: layer.outPoint,
      parent: parentIdx,
      nullLayer: !!layer.nullLayer,
      adjustmentLayer: !!layer.adjustmentLayer,
      threeDLayer: !!layer.threeDLayer,
      matchName: layer.matchName,
      source: source,
      properties: {
        Transform: serializeTransform(layer),
        Effects: serializeEffects(layer)
      }
    };
  }

  function serializeTransform(layer) {
    var tg = layer.property('ADBE Transform Group');
    var props = {};
    if (!tg) return { properties: props };
    var names = [
      ['ADBE Anchor Point', 'Anchor Point'],
      ['ADBE Position', 'Position'],
      ['ADBE Scale', 'Scale'],
      ['ADBE Rotate Z', 'Rotation'],
      ['ADBE Opacity', 'Opacity']
    ];
    for (var n = 0; n < names.length; n++) {
      var p = tg.property(names[n][0]);
      if (p) props[names[n][1]] = serializeProperty(p, names[n][1]);
    }
    return { properties: props };
  }

  function serializeEffects(layer) {
    var parade = layer.property('ADBE Effect Parade');
    var props = {};
    if (!parade) return { properties: props };
    for (var i = 1; i <= parade.numProperties; i++) {
      var fx = parade.property(i);
      props[fx.name] = { name: fx.name, matchName: fx.matchName, enabled: fx.enabled !== false };
    }
    return { properties: props };
  }

  function serializeProperty(prop, label) {
    var keyframes = [];
    try {
      if (prop.numKeys > 0) {
        for (var k = 1; k <= prop.numKeys; k++) {
          keyframes.push([prop.keyTime(k), sanitizeValue(prop.keyValue(k))]);
        }
      } else if (prop.valueAtTime) {
        keyframes.push([0, sanitizeValue(prop.valueAtTime(0, false))]);
      }
    } catch (e) {}
    return { name: label, matchName: prop.matchName, keyframes: keyframes };
  }

  function sanitizeValue(v) {
    if (v == null) return null;
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'object' && typeof v.length === 'number') {
      var arr = [];
      for (var i = 0; i < v.length; i++) arr.push(v[i]);
      return arr;
    }
    return null;
  }

  function safeName(name) {
    return String(name).replace(/[<>:"\/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 120);
  }

  // Minimal JSON.stringify for AE (no cycles expected)
  function stringify(value) {
    return str(value);
    function str(v) {
      if (v === null) return 'null';
      var t = typeof v;
      if (t === 'number' || t === 'boolean') return String(v);
      if (t === 'string') return quote(v);
      if (v instanceof Array) {
        var a = [];
        for (var i = 0; i < v.length; i++) a.push(str(v[i]));
        return '[' + a.join(',') + ']';
      }
      if (t === 'object') {
        var keys = [];
        for (var k in v) {
          if (v.hasOwnProperty(k) && typeof v[k] !== 'undefined') {
            keys.push(quote(k) + ':' + str(v[k]));
          }
        }
        return '{' + keys.join(',') + '}';
      }
      return 'null';
    }
    function quote(s) {
      return '"' + String(s)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t') + '"';
    }
  }
})();
