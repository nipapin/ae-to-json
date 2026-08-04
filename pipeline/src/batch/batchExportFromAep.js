const fs = require('fs');
const path = require('path');
const { findAepFiles } = require('./findAepFiles');
const { splitTopLevelComps, safeFileName } = require('./topLevelComps');
const { exportTopLevelCompsInAe } = require('./aeExportScript');

/**
 * Batch-export top-level compositions from a directory of .aep / .aepx files.
 *
 * Requires:
 *   - Adobe After Effects installed (macOS / Windows)
 *   - npm i after-effects   (in pipeline/ or repo root)
 */
async function batchExportFromAep(projectsDir, options = {}) {
  const outDir = path.resolve(options.outDir || path.join(process.cwd(), 'dumps'));
  const dryRun = Boolean(options.dryRun);
  const limit = options.limit != null ? Number(options.limit) : Infinity;
  const files = findAepFiles(projectsDir, {
    maxDepth: options.maxDepth,
    ignore: options.ignore
  }).slice(0, limit);

  fs.mkdirSync(outDir, { recursive: true });

  const plan = {
    projectsDir: path.resolve(projectsDir),
    outDir,
    dryRun,
    projectCount: files.length,
    projects: files.map((f) => ({
      path: f,
      name: path.basename(f).replace(/\.(aep|aepx)$/i, '')
    }))
  };

  if (dryRun) {
    return { ...plan, written: [], note: 'dry-run — After Effects not invoked' };
  }

  if (!files.length) {
    return { ...plan, written: [], note: 'no .aep/.aepx files found' };
  }

  const ae = loadAfterEffects();
  const written = [];
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    const aepPath = files[i];
    const label = `[${i + 1}/${files.length}] ${aepPath}`;
    console.log(`[batch-export] opening ${label}`);

    try {
      const result = await ae.execute(exportTopLevelCompsInAe, [aepPath]);
      const projectName = result.projectName || path.basename(aepPath).replace(/\.(aep|aepx)$/i, '');

      for (const comp of result.compositions || []) {
        const wrapped = {
          project: {
            bitsPerChannel: result.bitsPerChannel,
            numItems: 1,
            items: [comp]
          },
          meta: {
            sourceAep: aepPath,
            projectName,
            topLevel: true,
            compId: comp.id,
            compName: comp.name,
            exportedAt: new Date().toISOString()
          }
        };

        const fileName = safeFileName(`${projectName}__${comp.name || comp.id}`) + '.json';
        const outPath = path.join(outDir, fileName);
        fs.writeFileSync(outPath, JSON.stringify(wrapped, null, 2));
        written.push({
          aep: aepPath,
          comp: comp.name,
          out: outPath
        });
        console.log(`[batch-export]   wrote ${fileName}`);
      }

      if (!(result.compositions && result.compositions.length)) {
        console.warn(`[batch-export]   no top-level comps in ${projectName}`);
      }
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.error(`[batch-export] FAILED ${aepPath}: ${message}`);
      errors.push({ aep: aepPath, error: message });
      if (options.stopOnError) throw err;
    }
  }

  const manifestPath = path.join(outDir, '_batch-manifest.json');
  const manifest = {
    exportedAt: new Date().toISOString(),
    projectsDir: plan.projectsDir,
    projectCount: files.length,
    writtenCount: written.length,
    written,
    errors
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { ...plan, written, errors, manifestPath };
}

/**
 * Split already-exported full project JSON dumps into per top-level-comp files.
 * No After Effects required.
 */
function batchSplitJsonDumps(inputDir, options = {}) {
  const outDir = path.resolve(options.outDir || path.join(process.cwd(), 'dumps'));
  fs.mkdirSync(outDir, { recursive: true });

  const files = walkJson(inputDir);
  const written = [];

  for (const file of files) {
    if (path.basename(file).startsWith('_')) continue;
    const aeJson = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Skip already-split single-comp dumps
    if (aeJson.meta && aeJson.meta.topLevel) continue;

    const projectName = path.basename(file, '.json');
    const parts = splitTopLevelComps(aeJson, {
      projectName,
      projectPath: file,
      sourceAep: (aeJson.meta && aeJson.meta.sourceAep) || null
    });

    for (const part of parts) {
      const outPath = path.join(outDir, part.fileName + '.json');
      fs.writeFileSync(outPath, JSON.stringify(part.json, null, 2));
      written.push({ source: file, out: outPath, comp: part.comp.name });
    }
  }

  return { outDir, written };
}

function loadAfterEffects() {
  let ae;
  try {
    ae = require('after-effects');
  } catch (err) {
    throw new Error(
      'Package "after-effects" is required for batch-export from .aep files.\n' +
        'Install it with:  cd pipeline && npm i after-effects\n' +
        'After Effects must be installed (macOS/Windows).\n' +
        'Tip: use --dry-run to only list projects, or split-toplevel for existing JSON dumps.'
    );
  }

  ae.options({
    errorHandling: true,
    es5Shim: true,
    aeQuery: false
  });

  return ae;
}

function walkJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJson(full, out);
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

module.exports = {
  batchExportFromAep,
  batchSplitJsonDumps,
  loadAfterEffects
};
