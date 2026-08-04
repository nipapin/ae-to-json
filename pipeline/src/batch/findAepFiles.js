const fs = require('fs');
const path = require('path');

const AEP_EXT = new Set(['.aep', '.aepx']);

/**
 * Recursively find After Effects project files.
 */
function findAepFiles(rootDir, options = {}) {
  const abs = path.resolve(rootDir);
  if (!fs.existsSync(abs)) {
    throw new Error(`Directory not found: ${abs}`);
  }

  const out = [];
  const maxDepth = options.maxDepth == null ? Infinity : options.maxDepth;
  const ignore = new Set(
    (options.ignore || ['node_modules', '.git', 'library', 'dumps', 'Adobe After Effects Auto-Save']).map((s) =>
      s.toLowerCase()
    )
  );

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith('.')) continue;
      if (ignore.has(name.toLowerCase())) continue;

      const full = path.join(dir, name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(name).toLowerCase();
        if (AEP_EXT.has(ext)) {
          out.push(full);
        }
      }
    }
  }

  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    const ext = path.extname(abs).toLowerCase();
    if (!AEP_EXT.has(ext)) {
      throw new Error(`Not an After Effects project: ${abs}`);
    }
    return [abs];
  }

  walk(abs, 0);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

module.exports = { findAepFiles, AEP_EXT };
