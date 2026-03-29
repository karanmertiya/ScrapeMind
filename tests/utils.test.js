// ═══════════════════════════════════════════════════════════════
// ScrapeMind — Unit Tests for pure utility functions
// Run with:  node tests/utils.test.js
// ═══════════════════════════════════════════════════════════════

'use strict';
const assert = require('assert');

// ── Utility functions (mirrored from background.js) ─────────────

function fmtSeconds(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtMs(ms) {
  return fmtSeconds(Math.floor(ms / 1000));
}

function extractJSON(html, varName) {
  let markerLen;
  let start = html.indexOf(`${varName} = `);
  if (start !== -1) {
    markerLen = varName.length + 3;
  } else {
    start = html.indexOf(`${varName}=`);
    if (start === -1) return null;
    markerLen = varName.length + 1;
  }

  let pos       = start + markerLen;
  let depth     = 0;
  let inStr     = false;
  let esc       = false;
  const jsonStart = pos;

  for (; pos < html.length; pos++) {
    const ch = html[pos];
    if (esc)               { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"')        { inStr = !inStr; continue; }
    if (inStr)             continue;
    if (ch === '{')        depth++;
    else if (ch === '}')   { depth--; if (depth === 0) break; }
  }

  try { return JSON.parse(html.slice(jsonStart, pos + 1)); }
  catch { return null; }
}

function extractPlaylistVideoIds(html) {
  const marker = 'playlistVideoListRenderer';
  const start  = html.indexOf(marker);
  if (start === -1) return null;

  const slice = html.slice(start, start + 300_000);
  const seen  = new Set();
  const ids   = [];
  const re    = /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
  let m;
  while ((m = re.exec(slice)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
  }
  return ids.length ? ids : null;
}

// ── Test harness ────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log(`\n${name}`);
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✕ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════════════════════
// fmtSeconds
// ═══════════════════════════════════════════════════════════════
suite('fmtSeconds');

test('zero seconds → "0:00"', () => {
  assert.strictEqual(fmtSeconds(0), '0:00');
});

test('59 seconds → "0:59"', () => {
  assert.strictEqual(fmtSeconds(59), '0:59');
});

test('60 seconds → "1:00"', () => {
  assert.strictEqual(fmtSeconds(60), '1:00');
});

test('90 seconds → "1:30"', () => {
  assert.strictEqual(fmtSeconds(90), '1:30');
});

test('3600 seconds → "1:00:00"', () => {
  assert.strictEqual(fmtSeconds(3600), '1:00:00');
});

test('3661 seconds → "1:01:01"', () => {
  assert.strictEqual(fmtSeconds(3661), '1:01:01');
});

test('7384 seconds → "2:03:04"', () => {
  assert.strictEqual(fmtSeconds(7384), '2:03:04');
});

test('single-digit minutes pad seconds → "9:05"', () => {
  assert.strictEqual(fmtSeconds(545), '9:05');
});

// ═══════════════════════════════════════════════════════════════
// fmtMs
// ═══════════════════════════════════════════════════════════════
suite('fmtMs');

test('0 ms → "0:00"', () => {
  assert.strictEqual(fmtMs(0), '0:00');
});

test('1000 ms → "0:01"', () => {
  assert.strictEqual(fmtMs(1000), '0:01');
});

test('60000 ms → "1:00"', () => {
  assert.strictEqual(fmtMs(60000), '1:00');
});

test('truncates sub-second ms (1500 → "0:01")', () => {
  assert.strictEqual(fmtMs(1500), '0:01');
});

test('3600000 ms → "1:00:00"', () => {
  assert.strictEqual(fmtMs(3_600_000), '1:00:00');
});

// ═══════════════════════════════════════════════════════════════
// extractJSON
// ═══════════════════════════════════════════════════════════════
suite('extractJSON');

test('returns null when variable not present', () => {
  assert.strictEqual(extractJSON('<html></html>', 'ytInitialPlayerResponse'), null);
});

test('parses spaced assignment: varName = {...}', () => {
  const html = 'var ytInitialPlayerResponse = {"key":"value"};';
  const result = extractJSON(html, 'ytInitialPlayerResponse');
  assert.deepStrictEqual(result, { key: 'value' });
});

test('parses compact assignment: varName={...}', () => {
  const html = 'ytInitialPlayerResponse={"key":"value"};';
  const result = extractJSON(html, 'ytInitialPlayerResponse');
  assert.deepStrictEqual(result, { key: 'value' });
});

test('parses nested objects', () => {
  const obj = { a: { b: { c: [1, 2, 3] } } };
  const html = `var ytInitialPlayerResponse = ${JSON.stringify(obj)};`;
  assert.deepStrictEqual(extractJSON(html, 'ytInitialPlayerResponse'), obj);
});

test('handles escaped quotes inside strings', () => {
  const html = 'var foo = {"title":"say \\"hello\\""};';
  const result = extractJSON(html, 'foo');
  assert.strictEqual(result.title, 'say "hello"');
});

test('returns null when JSON is malformed', () => {
  const html = 'var foo = {broken: true;';
  assert.strictEqual(extractJSON(html, 'foo'), null);
});

test('handles text before and after the JSON', () => {
  const html = '<script>var x=1;</script><script>var myVar = {"ok":true};</script><script>var y=2;</script>';
  const result = extractJSON(html, 'myVar');
  assert.deepStrictEqual(result, { ok: true });
});

// ═══════════════════════════════════════════════════════════════
// extractPlaylistVideoIds
// ═══════════════════════════════════════════════════════════════
suite('extractPlaylistVideoIds');

test('returns null when marker absent', () => {
  assert.strictEqual(extractPlaylistVideoIds('<html></html>'), null);
});

test('extracts video IDs inside playlistVideoListRenderer', () => {
  const id1 = 'abcdefghijk';
  const id2 = 'lmnopqrstuv';
  const html = `...playlistVideoListRenderer {"videoId":"${id1}"},{"videoId":"${id2}"}...`;
  const ids = extractPlaylistVideoIds(html);
  assert.deepStrictEqual(ids, [id1, id2]);
});

test('deduplicates repeated video IDs', () => {
  const id = 'abcdefghijk';
  const html = `playlistVideoListRenderer {"videoId":"${id}"},{"videoId":"${id}"}`;
  const ids = extractPlaylistVideoIds(html);
  assert.deepStrictEqual(ids, [id]);
});

test('ignores IDs that appear before the marker', () => {
  const beforeId = 'zzzzzzzzzzz';
  const insideId = 'abcdefghijk';
  const html = `{"videoId":"${beforeId}"}...playlistVideoListRenderer {"videoId":"${insideId}"}`;
  const ids = extractPlaylistVideoIds(html);
  assert.ok(ids.includes(insideId));
  assert.ok(!ids.includes(beforeId));
});

test('returns null when section contains no IDs', () => {
  const html = 'playlistVideoListRenderer {"title":"My Playlist"}';
  assert.strictEqual(extractPlaylistVideoIds(html), null);
});

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(40)}`);
console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
