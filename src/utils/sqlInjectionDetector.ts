/** Friendly feedback only. Typed schemas and fixed database queries enforce safety. */
import { detectAuthPayload, authPayloadMessage } from './authInputFeedback';
export const detectSQLInjection = (input: unknown): boolean => detectAuthPayload(input) === 'sql';
export const checkForSQLInjection = (credentials: { username?: unknown; email?: unknown; password?: unknown }) => {
  for (const field of ['username', 'email'] as const) {
    if (detectSQLInjection(credentials?.[field])) return { detected: true, field };
  }
  return { detected: false };
};
export const getSQLInjectionResponse = () => ({ statusCode: 400, message: authPayloadMessage('sql') });
