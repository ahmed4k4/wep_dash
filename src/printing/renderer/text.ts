/**
 * Pure text-layout helpers: word wrapping and line metrics.
 * These have no DOM/Canvas dependency so they're testable in Node.
 */

export interface TextMetricsLike {
  width: number;
}

export interface TextWrapOptions {
  maxWidth: number; // in pixels
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  measure: (text: string) => TextMetricsLike;
  /** Break long words if they exceed maxWidth */
  wrapLongWords?: boolean;
}

/**
 * Wrap text into lines that each fit within maxWidth.
 * Preserves explicit newlines. Numbers/Latin words break on spaces;
 * Arabic words also break on spaces (spaces are the natural separator).
 */
export function wrapText(text: string, opts: TextWrapOptions): string[] {
  const paragraphs = text.split(/\r?\n/);
  const result: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      result.push("");
      continue;
    }
    const words = paragraph.split(/(\s+)/); // keep spaces as separate tokens
    let line = "";
    for (const token of words) {
      // A token is pure whitespace: only add if it doesn't overflow
      if (/^\s+$/.test(token)) {
        const candidate = line + token;
        if (opts.measure(candidate).width <= opts.maxWidth || !line) {
          line = candidate;
        }
        continue;
      }
      const candidate = line + token;
      if (opts.measure(candidate).width <= opts.maxWidth || !line) {
        line = candidate;
      } else {
        result.push(line.trimEnd());
        line = token;
      }
    }
    result.push(line.trimEnd());
  }
  return result;
}

/** Sum of line heights needed for a block of text with a line multiplier. */
export function blockHeight(
  lines: string[],
  lineHeightPx: number
): number {
  return Math.round(lines.length * lineHeightPx);
}