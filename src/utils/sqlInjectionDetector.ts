/** Friendly feedback only. Typed schemas and fixed database queries enforce safety. */
const patterns = [
  /['"]\s*(?:or|and)\s+(?:['"]?\w+['"]?\s*=|true\b)/i,
  /\bunion\s+(?:all\s+)?select\b/i,
  /['"];?\s*;\s*(?:drop|delete|update|insert|alter)\s+/i,
  /\b(?:sleep|benchmark)\s*\(\s*\d/i,
];
export const detectSQLInjection = (input: unknown): boolean =>
  typeof input === 'string' && patterns.some(pattern => pattern.test(input.slice(0, 1024)));
export const checkForSQLInjection = (credentials: { username?: unknown; email?: unknown; password?: unknown }) => {
  for (const field of ['username', 'email'] as const) {
    if (detectSQLInjection(credentials?.[field])) return { detected: true, field };
  }
  return { detected: false };
};
export const getSQLInjectionResponse = () => ({
  statusCode: 400,
  message: "Nice try, little Bobby Tables. 😏 Save that payload for a CTF challenge — this door needs your real credentials.",
});
