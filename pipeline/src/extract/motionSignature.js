/**
 * Walk ae-to-json layer.properties and extract a compact motion signature.
 * Keyframe format from ae-to-json: [time, value, ease?]
 */

const TRACKED_PROP_NAMES = [
  'Opacity',
  'Position',
  'X Position',
  'Y Position',
  'Z Position',
  'Scale',
  'Rotation',
  'X Rotation',
  'Y Rotation',
  'Z Rotation',
  'Anchor Point',
  'Orientation'
];

function extractLayerMotion(layer) {
  const tracks = [];
  walkProperties(layer.properties || {}, [], tracks);

  return tracks.filter((t) => t.keyframes.length >= 1);
}

function walkProperties(node, path, out) {
  if (!node || typeof node !== 'object') return;

  // Leaf property with keyframes
  if (Array.isArray(node.keyframes)) {
    const name = path[path.length - 1] || node.name || node.matchName || 'unknown';
    if (shouldTrack(name, node)) {
      const kfs = normalizeKeyframes(node.keyframes);
      if (kfs.length) {
        out.push({
          path: path.join('/'),
          name,
          matchName: node.matchName || null,
          keyframes: kfs,
          summary: summarizeKeyframes(name, kfs)
        });
      }
    }
    return;
  }

  // Nested group: Transform / Effects / etc.
  for (const [key, value] of Object.entries(node)) {
    if (!value || typeof value !== 'object') continue;
    if (key === 'keyframes' || key === 'selectedKeys') continue;

    if (value.properties && typeof value.properties === 'object') {
      walkProperties(value.properties, path.concat(key), out);
    } else if (Array.isArray(value.keyframes) || value.propertyType || value.matchName) {
      walkProperties(value, path.concat(key), out);
    } else if (!Array.isArray(value)) {
      // Some dumps nest groups directly
      walkProperties(value, path.concat(key), out);
    }
  }
}

function shouldTrack(name, node) {
  if (TRACKED_PROP_NAMES.includes(name)) return true;
  if (node && typeof node.numKeys === 'number' && node.numKeys > 1) return true;
  if (Array.isArray(node.keyframes) && node.keyframes.length > 1) {
    // Prefer transform-like and effect params with real animation
    return true;
  }
  return TRACKED_PROP_NAMES.some((n) => name.includes(n));
}

function normalizeKeyframes(raw) {
  return raw
    .filter((kf) => Array.isArray(kf) && kf.length >= 2)
    .map((kf) => {
      const entry = {
        t: round(kf[0], 4),
        v: sanitizeValue(kf[1])
      };
      if (kf[2] != null) {
        entry.ease = simplifyEase(kf[2]);
      }
      return entry;
    })
    .sort((a, b) => a.t - b.t);
}

function sanitizeValue(v) {
  if (typeof v === 'number') return round(v, 4);
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? round(x, 4) : x));
  if (v && typeof v === 'object') {
    // TextDocument etc. — keep tiny summary only
    if (v.text != null) return { text: String(v.text).slice(0, 120) };
    return { type: 'object' };
  }
  return v;
}

function simplifyEase(ease) {
  // Keep small; full AE ease objects are huge
  if (!ease || typeof ease !== 'object') return null;
  try {
    return JSON.parse(JSON.stringify(ease, replacer));
  } catch {
    return null;
  }
}

function replacer(key, value) {
  if (typeof value === 'number') return round(value, 4);
  return value;
}

function summarizeKeyframes(name, kfs) {
  if (kfs.length < 2) {
    return { kind: 'static', label: `${name} static` };
  }

  const first = kfs[0].v;
  const last = kfs[kfs.length - 1].v;
  const duration = round(kfs[kfs.length - 1].t - kfs[0].t, 4);
  const delta = describeDelta(name, first, last);

  return {
    kind: 'animated',
    label: delta.label,
    from: first,
    to: last,
    duration,
    keyCount: kfs.length,
    direction: delta.direction
  };
}

function describeDelta(name, from, to) {
  const n = name.toLowerCase();

  if (typeof from === 'number' && typeof to === 'number') {
    const dir = to > from ? 'up' : to < from ? 'down' : 'hold';
    if (n.includes('opacity')) {
      if (from < to) return { label: 'fade in', direction: 'in' };
      if (from > to) return { label: 'fade out', direction: 'out' };
      return { label: 'opacity hold', direction: 'hold' };
    }
    if (n.includes('rotation')) {
      return { label: dir === 'up' ? 'rotate cw' : dir === 'down' ? 'rotate ccw' : 'rotation hold', direction: dir };
    }
    return { label: `${name} ${dir}`, direction: dir };
  }

  if (Array.isArray(from) && Array.isArray(to)) {
    if (n.includes('scale')) {
      const fa = avg(from);
      const ta = avg(to);
      if (ta > fa) return { label: 'scale up', direction: 'in' };
      if (ta < fa) return { label: 'scale down', direction: 'out' };
      return { label: 'scale hold', direction: 'hold' };
    }
    if (n.includes('position')) {
      const dx = (to[0] || 0) - (from[0] || 0);
      const dy = (to[1] || 0) - (from[1] || 0);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        return { label: 'position hold', direction: 'hold' };
      }
      const horiz = Math.abs(dx) >= Math.abs(dy);
      if (horiz) {
        return { label: dx > 0 ? 'slide right' : 'slide left', direction: dx > 0 ? 'right' : 'left' };
      }
      return { label: dy > 0 ? 'slide down' : 'slide up', direction: dy > 0 ? 'down' : 'up' };
    }
  }

  return { label: `${name} animate`, direction: 'change' };
}

function dominantMotionLabels(layerMotions) {
  const labels = [];
  for (const layer of layerMotions) {
    for (const track of layer.tracks) {
      if (track.summary && track.summary.kind === 'animated') {
        labels.push(track.summary.label);
      }
    }
  }
  // unique, prefer frequency
  const counts = new Map();
  for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label)
    .slice(0, 8);
}

function avg(arr) {
  const nums = arr.filter((x) => typeof x === 'number');
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round(n, p) {
  const m = 10 ** p;
  return Math.round(n * m) / m;
}

module.exports = {
  extractLayerMotion,
  dominantMotionLabels,
  TRACKED_PROP_NAMES
};
