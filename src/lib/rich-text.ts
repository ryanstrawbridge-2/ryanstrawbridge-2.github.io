// Small, safe text formatting for section blocks (home.json "blocks").
//
// Block text is plain JSON written by studio, not markdown files, so this
// covers only what the blocks need and escapes everything first:
//
//   blank line        new paragraph
//   - item / * item   bullet list
//   1. item           numbered list
//   **bold**  *italic*  `code`  [label](https://url)
//   ||hidden||        redaction bars (█████), for work you can't name
//
// Returns HTML safe for set:html.

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const safeUrl = (url: string) => (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url) ? url : '#');

/** One line of text: emphasis, links, code, redaction. */
export const inlineRich = (value: string | undefined | null): string => {
  if (!value) return '';
  return escapeHtml(value)
    .replace(/\|\|(.+?)\|\|/g, (_, t: string) => `<span class="redact" aria-label="redacted">${'█'.repeat(Math.max(3, Math.min(24, t.length)))}</span>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => {
      const href = safeUrl(url.replace(/&amp;/g, '&'));
      const external = /^https?:/i.test(href);
      return `<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
    })
    .replace(/\*\*(?!\s)(.+?)(?<!\s)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<![\w*])\*(?!\s)([^*]+?)(?<!\s)\*(?![\w*])/g, '<em>$1</em>');
};

/** Paragraphs and lists. */
export const richText = (value: string | undefined | null): string => {
  if (!value) return '';
  const out: string[] = [];
  for (const chunk of String(value).replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${inlineRich(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`);
    } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      out.push(`<ol>${lines.map((l) => `<li>${inlineRich(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`);
    } else {
      out.push(`<p>${lines.map((l) => inlineRich(l)).join('<br />')}</p>`);
    }
  }
  return out.join('');
};

/** YouTube / Vimeo page URL -> privacy-friendly embed URL, or null. */
export const embedUrl = (url: string | undefined | null): string | null => {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?dnt=1`;
  return null;
};
