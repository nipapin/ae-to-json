/**
 * Turn a recipe into ExtendScript that builds a composition.
 * This is the CEP execution half — intentionally conservative:
 * solids/footage placeholders + transform keyframes.
 */

function recipeToJsx(recipe, options = {}) {
  const compName = escapeStr(options.compName || recipe.source.compName || recipe.id || 'AgentComp');
  const lines = [];

  lines.push('// Generated from ae-agent recipe — ES3 ExtendScript');
  lines.push('(function () {');
  lines.push('  app.beginUndoGroup("AE Agent: Build Recipe");');
  lines.push('  try {');
  lines.push(`    var comp = app.project.items.addComp("${compName}", ${num(recipe.comp.width)}, ${num(recipe.comp.height)}, 1, ${num(recipe.comp.duration)}, ${num(recipe.comp.frameRate)});`);

  const bg = recipe.comp.bgColor || [0, 0, 0];
  lines.push(`    comp.bgColor = [${num(bg[0])}, ${num(bg[1])}, ${num(bg[2])}];`);
  lines.push('    var layerByName = {};');

  // Create layers bottom-up (AE adds at top)
  const layers = (recipe.layers || []).slice().sort((a, b) => (b.index || 0) - (a.index || 0));

  for (const layer of layers) {
    lines.push('');
    lines.push(`    // layer: ${escapeStr(layer.name)} [${layer.role}]`);
    if (layer.nullLayer || layer.role === 'null') {
      lines.push('    var lyr = comp.layers.addNull();');
    } else if (layer.role === 'bg' && !layer.source) {
      lines.push(
        `    var lyr = comp.layers.addSolid([${num(bg[0])}, ${num(bg[1])}, ${num(bg[2])}], "${escapeStr(layer.name)}", comp.width, comp.height, 1);`
      );
    } else {
      // Footage path if available; otherwise solid placeholder
      if (layer.source) {
        lines.push(`    var footageFile = new File(${JSON.stringify(String(layer.source))});`);
        lines.push('    var footageItem = null;');
        lines.push('    if (footageFile.exists) { footageItem = app.project.importFile(new ImportOptions(footageFile)); }');
        lines.push(`    var lyr = footageItem ? comp.layers.add(footageItem) : comp.layers.addSolid([1,1,1], "${escapeStr(layer.name)}", 500, 500, 1);`);
      } else {
        lines.push(
          `    var lyr = comp.layers.addSolid([1, 1, 1], "${escapeStr(layer.name)}", 500, 500, 1);`
        );
      }
    }

    lines.push(`    lyr.name = "${escapeStr(layer.name)}";`);
    if (layer.inPoint != null) lines.push(`    lyr.inPoint = ${num(layer.inPoint)};`);
    if (layer.outPoint != null) lines.push(`    lyr.outPoint = ${num(layer.outPoint)};`);
    lines.push(`    layerByName["${escapeStr(layer.name)}"] = lyr;`);

    for (const motion of layer.motion || []) {
      const propExpr = transformPropAccess(motion.prop);
      if (!propExpr) continue;
      lines.push(`    (function (p) {`);
      lines.push('      while (p.numKeys > 0) { p.removeKey(1); }');
      // We only have from/to endpoints in compact motion — enough for agent rebuilds
      lines.push(`      p.setValueAtTime(${num(motion.t0)}, ${valueToJsx(motion.from)});`);
      if (motion.t1 != null && motion.t1 !== motion.t0) {
        lines.push(`      p.setValueAtTime(${num(motion.t1)}, ${valueToJsx(motion.to)});`);
      }
      lines.push(`    })(${propExpr});`);
    }
  }

  lines.push('    return comp;');
  lines.push('  } finally {');
  lines.push('    app.endUndoGroup();');
  lines.push('  }');
  lines.push('})();');

  return lines.join('\n');
}

function transformPropAccess(propName) {
  const map = {
    Opacity: 'lyr.property("ADBE Transform Group").property("ADBE Opacity")',
    Position: 'lyr.property("ADBE Transform Group").property("ADBE Position")',
    'X Position': 'lyr.property("ADBE Transform Group").property("ADBE Position_0")',
    'Y Position': 'lyr.property("ADBE Transform Group").property("ADBE Position_1")',
    Scale: 'lyr.property("ADBE Transform Group").property("ADBE Scale")',
    Rotation: 'lyr.property("ADBE Transform Group").property("ADBE Rotate Z")',
    'Z Rotation': 'lyr.property("ADBE Transform Group").property("ADBE Rotate Z")',
    'Anchor Point': 'lyr.property("ADBE Transform Group").property("ADBE Anchor Point")'
  };
  return map[propName] || null;
}

function valueToJsx(v) {
  if (typeof v === 'number') return String(num(v));
  if (Array.isArray(v)) return `[${v.map((x) => (typeof x === 'number' ? num(x) : JSON.stringify(x))).join(', ')}]`;
  return '0';
}

function escapeStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function num(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

module.exports = { recipeToJsx };
