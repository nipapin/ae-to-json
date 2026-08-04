#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  LibraryStore,
  processLibrary,
  processProject,
  buildIndex,
  search,
  extractFromAeJson,
  createVisualAiProvider,
  createEmbeddingProvider,
  recipeToJsx,
  batchExportFromAep,
  batchSplitJsonDumps,
  findAepFiles
} = require('../src');

function flag(args, name) {
  return args.includes(name);
}

function flagValue(args, name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1];
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (!cmd || cmd === 'help' || cmd === '--help') {
    printHelp();
    return;
  }

  if (cmd === 'batch-export') {
    const projectsDir = required(rest[0], 'projects directory (.aep/.aepx)');
    const outDir = flagValue(rest, '--out', path.join(process.cwd(), 'dumps'));
    const dryRun = flag(rest, '--dry-run');
    const limitRaw = flagValue(rest, '--limit', null);
    const result = await batchExportFromAep(projectsDir, {
      outDir,
      dryRun,
      limit: limitRaw != null ? Number(limitRaw) : Infinity,
      stopOnError: flag(rest, '--stop-on-error')
    });
    console.log(JSON.stringify({
      projectCount: result.projectCount,
      writtenCount: (result.written || []).length,
      errorCount: (result.errors || []).length,
      outDir: result.outDir,
      dryRun: result.dryRun,
      manifestPath: result.manifestPath || null,
      projects: result.dryRun ? result.projects : undefined,
      errors: result.errors
    }, null, 2));
    if (result.errors && result.errors.length) process.exitCode = 2;
    return;
  }

  if (cmd === 'list-aep') {
    const projectsDir = required(rest[0], 'projects directory');
    const files = findAepFiles(projectsDir);
    console.log(JSON.stringify({ count: files.length, files }, null, 2));
    return;
  }

  if (cmd === 'split-toplevel') {
    const input = required(rest[0], 'json dump or dumps directory');
    const outDir = flagValue(rest, '--out', path.join(process.cwd(), 'dumps'));
    const stat = fs.statSync(input);
    let result;
    if (stat.isDirectory()) {
      result = batchSplitJsonDumps(input, { outDir });
    } else {
      // single file
      fs.mkdirSync(outDir, { recursive: true });
      const { splitTopLevelComps } = require('../src/batch/topLevelComps');
      const aeJson = readJson(input);
      const parts = splitTopLevelComps(aeJson, {
        projectName: path.basename(input, '.json'),
        projectPath: input
      });
      const written = [];
      for (const part of parts) {
        const outPath = path.join(outDir, part.fileName + '.json');
        writeJson(outPath, part.json);
        written.push(outPath);
      }
      result = { outDir, written };
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'extract') {
    const input = required(rest[0], 'input ae-json path');
    const outDir = rest[1] || path.join(process.cwd(), 'out');
    const aeJson = readJson(input);
    const docs = extractFromAeJson(aeJson, { projectPath: input, fileName: path.basename(input) });
    fs.mkdirSync(outDir, { recursive: true });
    for (const doc of docs) {
      const dir = path.join(outDir, doc.recipe.id);
      fs.mkdirSync(dir, { recursive: true });
      writeJson(path.join(dir, 'recipe.json'), doc.recipe);
      writeJson(path.join(dir, 'card.json'), doc.card);
    }
    console.log(`Extracted ${docs.length} comps → ${outDir}`);
    return;
  }

  if (cmd === 'ingest') {
    const inputDir = required(rest[0], 'input dumps directory');
    const libraryDir = rest.includes('--library')
      ? rest[rest.indexOf('--library') + 1]
      : path.join(process.cwd(), 'library');

    const store = new LibraryStore(libraryDir);
    const visualAi = createVisualAiProvider({
      type: env('AE_VISUAL_AI', 'sidecar')
    });

    const results = await processLibrary(store, inputDir, { visualAi });
    const totalComps = results.reduce((n, r) => n + r.comps.length, 0);
    console.log(`Ingested ${results.length} projects / ${totalComps} comps → ${libraryDir}`);
    return;
  }

  if (cmd === 'ingest-one') {
    const input = required(rest[0], 'input ae-json path');
    const libraryDir = rest.includes('--library')
      ? rest[rest.indexOf('--library') + 1]
      : path.join(process.cwd(), 'library');
    const store = new LibraryStore(libraryDir);
    const visualAi = createVisualAiProvider({ type: env('AE_VISUAL_AI', 'sidecar') });
    const result = await processProject(
      store,
      readJson(input),
      { projectPath: input, fileName: path.basename(input) },
      { visualAi }
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'index') {
    const libraryDir = rest[0] || path.join(process.cwd(), 'library');
    const store = new LibraryStore(libraryDir);
    const embeddings = createEmbeddingProvider({
      type: env('AE_EMBEDDINGS', 'local')
    });
    const result = await buildIndex(store, { embeddings });
    console.log(`Indexed ${result.cardCount} cards`);
    console.log(JSON.stringify(result.manifest, null, 2));
    return;
  }

  if (cmd === 'search') {
    const query = required(rest[0], 'search query');
    const libraryDir = rest.includes('--library')
      ? rest[rest.indexOf('--library') + 1]
      : path.join(process.cwd(), 'library');
    const topK = rest.includes('--top') ? Number(rest[rest.indexOf('--top') + 1]) : 5;
    const store = new LibraryStore(libraryDir);
    const embeddings = createEmbeddingProvider({ type: env('AE_EMBEDDINGS', 'local') });
    const results = await search(store, query, { embeddings, topK });
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (cmd === 'show') {
    const libraryDir = rest.includes('--library')
      ? rest[rest.indexOf('--library') + 1]
      : path.join(process.cwd(), 'library');
    const id = required(rest[0], 'comp id');
    const store = new LibraryStore(libraryDir);
    console.log(JSON.stringify({
      card: store.loadCard(id),
      recipe: store.loadRecipe(id)
    }, null, 2));
    return;
  }

  if (cmd === 'jsx') {
    const libraryDir = rest.includes('--library')
      ? rest[rest.indexOf('--library') + 1]
      : path.join(process.cwd(), 'library');
    const id = required(rest[0], 'comp id');
    const store = new LibraryStore(libraryDir);
    const recipe = store.loadRecipe(id);
    process.stdout.write(recipeToJsx(recipe) + '\n');
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exitCode = 1;
}

function printHelp() {
  console.log(`ae-agent — After Effects library indexer for CEP agents

Usage:
  # From .aep / .aepx (requires After Effects + npm i after-effects)
  ae-agent batch-export <projectsDir> --out ./dumps [--dry-run] [--limit N]
  ae-agent list-aep <projectsDir>

  # From existing ae-to-json dumps (no AE)
  ae-agent split-toplevel <dump.json|dumpsDir> --out ./dumps

  # Indexing pipeline
  ae-agent extract <ae-json> [outDir]
  ae-agent ingest <dumpsDir> [--library library]
  ae-agent ingest-one <ae-json> [--library library]
  ae-agent index [library]
  ae-agent search "<query>" [--library library] [--top 5]
  ae-agent show <compId> [--library library]
  ae-agent jsx <compId> [--library library]

Env:
  AE_VISUAL_AI=sidecar|http|null
  AE_VISUAL_AI_URL=https://...
  AE_VISUAL_AI_HEADERS={"Authorization":"Bearer ..."}
  AE_EMBEDDINGS=local|http
  OPENAI_API_KEY=...
`);
}

function required(value, label) {
  if (!value) {
    console.error(`Missing ${label}`);
    printHelp();
    process.exit(1);
  }
  return value;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function env(name, fallback) {
  return process.env[name] || fallback;
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
