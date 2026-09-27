// The list icon is whatever emoji you type with the phone's own emoji keyboard.

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const pictographic = /\p{Extended_Pictographic}/u;

/** First emoji in a string (so pasting or typing on the emoji keyboard just works), or null. */
export function extractEmoji(input) {
  if (!input) return null;
  const graphemes = segmenter ? [...segmenter.segment(input)].map((s) => s.segment) : Array.from(input);
  for (const g of graphemes) {
    if (pictographic.test(g) || /[\u{1F1E6}-\u{1F1FF}]/u.test(g)) return g;
  }
  return null;
}
