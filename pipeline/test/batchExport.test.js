const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  getTopLevelComps,
  splitTopLevelComps,
  findAepFiles,
  batchSplitJsonDumps,
  extractFromAeJson
} = require('../src');

const SAMPLE = path.join(__dirname, '../fixtures/sample-project.json');

test('getTopLevelComps skips nested precomps', () => {
  const aeJson = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
  const top = getTopLevelComps(aeJson);
  const names = top.map((c) => c.name).sort();
  assert.deepEqual(names, ['Glitch Logo Slam', 'Minimal Logo Reveal']);
  assert.ok(!names.includes('Logo Inner Precomp'));
});

test('splitTopLevelComps writes one dump per top-level', () => {
  const aeJson = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
  const parts = splitTopLevelComps(aeJson, { projectName: 'demo' });
  assert.equal(parts.length, 2);
  for (const part of parts) {
    assert.equal(part.json.meta.topLevel, true);
    assert.equal(part.json.project.items.length, 1);
    assert.equal(part.json.project.items[0].typeName, 'Composition');
    const docs = extractFromAeJson(part.json, { projectId: 'demo' });
    assert.equal(docs.length, 1);
  }
});

test('batchSplitJsonDumps filters nested comps', () => {
  const tmpIn = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-in-'));
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-out-'));
  fs.copyFileSync(SAMPLE, path.join(tmpIn, 'sample-project.json'));
  const result = batchSplitJsonDumps(tmpIn, { outDir: tmpOut });
  assert.equal(result.written.length, 2);
  const files = fs.readdirSync(tmpOut).filter((f) => f.endsWith('.json'));
  assert.equal(files.length, 2);
});

test('findAepFiles discovers aep and aepx', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-aep-'));
  fs.writeFileSync(path.join(tmp, 'a.aep'), 'x');
  fs.writeFileSync(path.join(tmp, 'b.aepx'), 'x');
  fs.writeFileSync(path.join(tmp, 'skip.txt'), 'x');
  fs.mkdirSync(path.join(tmp, 'nested'));
  fs.writeFileSync(path.join(tmp, 'nested', 'c.aep'), 'x');
  const files = findAepFiles(tmp);
  assert.equal(files.length, 3);
});
