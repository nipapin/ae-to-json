const ROLE_RULES = [
  { role: 'logo', patterns: [/logo/i, /brand/i, /emblem/i, /mark/i] },
  { role: 'title', patterns: [/title/i, /headline/i, /heading/i, /main.?text/i] },
  { role: 'subtitle', patterns: [/subtitle/i, /sub.?title/i, /tagline/i] },
  { role: 'bg', patterns: [/^bg$/i, /background/i, /backdrop/i] },
  { role: 'accent', patterns: [/accent/i, /shape/i, /line/i, /bar/i, /stroke/i] },
  { role: 'matte', patterns: [/matte/i, /mask/i, /alpha/i] },
  { role: 'camera', patterns: [/camera/i] },
  { role: 'light', patterns: [/light/i] },
  { role: 'null', patterns: [/null/i, /controller/i, /ctrl/i, /rig/i] },
  { role: 'adjustment', patterns: [/adj/i, /adjustment/i, /grade/i, /lut/i] }
];

function guessRole(layer) {
  const name = String(layer.name || '');
  for (const rule of ROLE_RULES) {
    if (rule.patterns.some((re) => re.test(name))) {
      return rule.role;
    }
  }

  if (layer.matchName === 'ADBE Camera Layer' || /camera/i.test(layer.comment || '')) {
    return 'camera';
  }
  if (layer.matchName === 'ADBE Light Layer') {
    return 'light';
  }
  if (layer.adjustmentLayer) {
    return 'adjustment';
  }
  if (layer.nullLayer) {
    return 'null';
  }

  // Text layers often carry titles when unnamed conventionally
  if (hasTextDocument(layer)) {
    return 'title';
  }

  if (isLikelySolidBackground(layer)) {
    return 'bg';
  }

  return 'content';
}

function hasTextDocument(layer) {
  const props = layer.properties || {};
  return Boolean(props['Text'] || props['ADBE Text Properties'] || findPropByMatch(props, /Text/i));
}

function isLikelySolidBackground(layer) {
  const name = String(layer.name || '');
  if (/solid/i.test(name) && layer.index === (layer._maxIndex || layer.index)) {
    return true;
  }
  return false;
}

function findPropByMatch(obj, re) {
  if (!obj || typeof obj !== 'object') return null;
  for (const [key, value] of Object.entries(obj)) {
    if (re.test(key)) return value;
    if (value && typeof value === 'object' && value.properties) {
      const nested = findPropByMatch(value.properties, re);
      if (nested) return nested;
    }
  }
  return null;
}

module.exports = { guessRole, ROLE_RULES };
