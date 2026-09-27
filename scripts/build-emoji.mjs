// Generates src/emoji-data.json: a compact [emoji, "name keyword keyword ..."] list
// used by the icon picker's search. Run with `npm run build:emoji` after
// bumping unicode-emoji-json / emojilib.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const byEmoji = require('unicode-emoji-json/data-by-emoji.json');
const ordered = require('unicode-emoji-json/data-ordered-emoji.json');
const keywords = require('emojilib');

const rows = [];
for (const emoji of ordered) {
  const meta = byEmoji[emoji];
  if (!meta) continue;
  const words = new Set();
  for (const w of `${meta.name} ${meta.slug.replace(/_/g, ' ')}`.toLowerCase().split(/\s+/)) if (w) words.add(w);
  for (const k of keywords[emoji] || []) for (const w of k.toLowerCase().replace(/_/g, ' ').split(/\s+/)) if (w) words.add(w);
  rows.push([emoji, [...words].join(' '), meta.group]);
}
writeFileSync(new URL('../src/emoji-data.json', import.meta.url), JSON.stringify(rows));
console.log(`wrote ${rows.length} emoji`);
