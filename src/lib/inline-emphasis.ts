// Renders *emphasis* inside plain-text headline fields.
//
// The hero tagline, ledes and section eyebrows are plain strings, not
// rich-text, so there's no markdown pipeline behind them. Rather than turn them
// into rich-text fields (which would put a whole toolbar in the CMS for one
// word of italics), this recognises the two markdown emphasis forms and leaves
// everything else literal.
//
// Escapes first, then substitutes, so CMS content can never inject markup.

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * `*word*` or `_word_` → `<em>word</em>`. Returns HTML safe to pass to
 * `set:html`. A stray unpaired marker is left as a literal character.
 */
export const inlineEmphasis = (value: string | undefined | null): string => {
  if (!value) return '';
  return escapeHtml(value)
    .replace(/(?<![\w*])\*(?!\s)([^*]+?)(?<!\s)\*(?![\w*])/g, '<em>$1</em>')
    .replace(/(?<![\w_])_(?!\s)([^_]+?)(?<!\s)_(?![\w_])/g, '<em>$1</em>');
};
