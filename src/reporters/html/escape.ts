const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes text for use in HTML content or in a quoted attribute. Everything that comes from the
 * scanned code (paths, messages, names) goes through this: it is the report's defense against
 * markup in a file name or a comment.
 */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

/** The URL when it is a plain web address; anything else (`javascript:`, `data:`) is dropped. */
export function safeUrl(url: string): string | undefined {
  return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : undefined;
}
