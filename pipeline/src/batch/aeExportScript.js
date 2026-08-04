/**
 * Function executed inside After Effects via the `after-effects` npm bridge.
 * Opens one project, serializes each top-level composition (usedIn.length === 0).
 *
 * Keep this CommonJS-exportable: after-effects stringifies the function.
 * Avoid outer-scope closures — only the function body + arguments are sent to AE.
 */
function exportTopLevelCompsInAe(aepPath) {
  if (!app) {
    throw new Error('After Effects app bridge missing');
  }

  // Close current project if any (don't save)
  try {
    if (app.project && app.project.file) {
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    } else if (app.project && app.project.numItems > 0) {
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    }
  } catch (e) {
    // ignore
  }

  var file = new File(aepPath);
  if (!file.exists) {
    throw new Error('Project not found: ' + aepPath);
  }

  app.open(file);

  try {
    var comps = [];
    var i;
    for (i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (!(item instanceof CompItem)) continue;
      if (item.usedIn && item.usedIn.length > 0) continue;
      comps.push(serializeComp(item));
    }

    return {
      sourceAep: aepPath,
      projectName: file.name.replace(/\.(aep|aepx)$/i, ''),
      bitsPerChannel: app.project.bitsPerChannel,
      compCount: comps.length,
      compositions: comps
    };
  } finally {
    try {
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    } catch (e2) {
      // ignore
    }
  }

  function serializeComp(comp) {
    var layers = [];
    var layerIndex = {};
    var li;

    // Map layer objects to 0-based indexes (ae-to-json style)
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
    if (layer.parent) {
      parentIdx = layerIndex[layer.parent.id];
      if (parentIdx === undefined) parentIdx = null;
    }

    var source = null;
    try {
      if (layer.source && layer.source.file) {
        source = layer.source.file.fsName;
      } else if (layer.source && layer.source.mainSource && layer.source.mainSource.file) {
        source = layer.source.mainSource.file.fsName;
      } else if (layer.source && layer.source.name) {
        source = layer.source.name;
      }
    } catch (e) {
      source = null;
    }

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
    if (!tg) return { properties: {} };
    var props = {};
    var names = [
      ['ADBE Anchor Point', 'Anchor Point'],
      ['ADBE Position', 'Position'],
      ['ADBE Position_0', 'X Position'],
      ['ADBE Position_1', 'Y Position'],
      ['ADBE Position_2', 'Z Position'],
      ['ADBE Scale', 'Scale'],
      ['ADBE Rotate Z', 'Rotation'],
      ['ADBE Rotate X', 'X Rotation'],
      ['ADBE Rotate Y', 'Y Rotation'],
      ['ADBE Orientation', 'Orientation'],
      ['ADBE Opacity', 'Opacity']
    ];

    for (var n = 0; n < names.length; n++) {
      var match = names[n][0];
      var label = names[n][1];
      var p = tg.property(match);
      if (!p) continue;
      props[label] = serializeProperty(p, label);
    }

    return { properties: props };
  }

  function serializeEffects(layer) {
    var parade = layer.property('ADBE Effect Parade');
    var props = {};
    if (!parade) return { properties: props };
    for (var i = 1; i <= parade.numProperties; i++) {
      var fx = parade.property(i);
      props[fx.name] = {
        name: fx.name,
        matchName: fx.matchName,
        enabled: fx.enabled !== false
      };
    }
    return { properties: props };
  }

  function serializeProperty(prop, label) {
    var keyframes = [];
    try {
      if (prop.propertyValueType === PropertyValueType.NO_VALUE) {
        return { name: label, matchName: prop.matchName, keyframes: [] };
      }
      if (prop.numKeys > 0) {
        for (var k = 1; k <= prop.numKeys; k++) {
          keyframes.push([prop.keyTime(k), sanitizeValue(prop.keyValue(k))]);
        }
      } else if (prop.valueAtTime) {
        keyframes.push([0, sanitizeValue(prop.valueAtTime(0, false))]);
      }
    } catch (e) {
      return {
        name: label,
        matchName: prop.matchName,
        keyframes: [],
        exportError: true,
        message: String(e && e.message ? e.message : e)
      };
    }

    return {
      name: label,
      matchName: prop.matchName,
      keyframes: keyframes
    };
  }

  function sanitizeValue(v) {
    if (v == null) return null;
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
    // AE arrays (Point, Scale, Color...) look like objects with length
    if (typeof v === 'object' && typeof v.length === 'number') {
      var arr = [];
      for (var i = 0; i < v.length; i++) {
        arr.push(typeof v[i] === 'number' ? v[i] : sanitizeValue(v[i]));
      }
      return arr;
    }
    return null;
  }
}

module.exports = { exportTopLevelCompsInAe };
