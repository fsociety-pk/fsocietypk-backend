/** Feedback for common patterns, never a SQL/XSS security boundary. Keep both app copies in sync. */
export type AuthPayloadKind = 'sql' | 'xss' | 'nosql';
const sqlPatterns = [
  /['"`]\s*(?:or|and)\s+(?:[\w'"`]+\s*(?:=|<>|!=|like)\s*[\w'"`]+|true\b)/i,
  /\b(?:or|and)\s+(?:\d+\s*(?:=|<>|!=)\s*\d+|true\b)/i,
  /\bunion\s+(?:all\s+)?select\b/i,
  /;\s*(?:select|drop|delete|update|insert|alter|create|truncate|exec(?:ute)?)\b/i,
  /\b(?:sleep|pg_sleep|benchmark|extractvalue|updatexml)\s*\(/i,
  /\bwaitfor\s+delay\b/i,
  /['"]\s*(?:--|#|\/\*)/,
  /\bexec(?:ute)?\s+(?:xp_|sp_)/i,
];
const xssPatterns = [
  /<\s*\/?\s*[a-z][^>]{0,512}>/i,
  /\bon[a-z]{2,25}\s*=/i,
  /(?:javascript|vbscript)\s*:/i,
  /data\s*:\s*text\/html/i,
];
const noSqlPattern = /(?:[{,]\s*["']?\$(?:ne|eq|gt|gte|lt|lte|regex|where|exists|or|and)\b["']?\s*:|\[\$(?:ne|eq|gt|regex|where)\])/i;
function feedbackText(value: string) {
  let text = value.slice(0, 2048);
  // Decode a bounded preview for recognition only; never change submitted credentials.
  for (let i = 0; i < 2; i++) {
    text = text.replace(/%([a-f\d]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    text = text.replace(/&#(x[\da-f]+|\d+);?/gi, (original, code: string) => {
      const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return point <= 0x10ffff ? String.fromCodePoint(point) : original;
    });
    text = text.replace(/&(lt|gt|quot|apos|colon|tab|newline);/gi, (_, name: string) => ({ lt:'<', gt:'>', quot:'"', apos:"'", colon:':', tab:'\t', newline:'\n' }[name.toLowerCase()] || ''));
    text = text.replace(/\\(?:x([a-f\d]{2})|u([a-f\d]{4}))/gi, (_, hex: string, unicode: string) => String.fromCharCode(parseInt(hex || unicode, 16)));
  }
  return text;
}
export function detectAuthPayload(value: unknown): AuthPayloadKind | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).some(key => key.startsWith('$')) ? 'nosql' : null;
  }
  if (typeof value !== 'string' || !value) return null;
  const text = feedbackText(value);
  if (xssPatterns.some(pattern => pattern.test(text))) return 'xss';
  if (noSqlPattern.test(text)) return 'nosql';
  const sql = text.replace(/\/\*!\d{0,6}\s*([\s\S]{0,2048}?)\*\//g, ' $1 ').replace(/\/\*[\s\S]{0,2048}?\*\//g, ' ');
  return sqlPatterns.some(pattern => pattern.test(sql)) ? 'sql' : null;
}
export function authPayloadMessage(kind: AuthPayloadKind): string {
  return kind === 'xss' ? 'XSS-style input spotted. Save the scripts for a challenge and enter your account details.' : kind === 'nosql' ? 'Query-style input spotted. This field needs your username or email.' : 'SQL-style input spotted. Nice curiosity—save that payload for a CTF challenge.';
}
