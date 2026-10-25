import type { RequestHandler } from 'express';

/** Auth schemas reject malformed data; generic string cleaners must not rewrite secret values. */
export function preserveTypedCredentials(sanitizer: RequestHandler, prefix: string): RequestHandler {
  const authPath = `${prefix}/auth/`.toLowerCase();
  const passwordPath = `${prefix}/users/me/change-password`.toLowerCase();
  return (req, res, next) => {
    const path = req.path.toLowerCase().replace(/\/+$/, '');
    if (path.startsWith(authPath) || path === passwordPath) { next(); return; }
    sanitizer(req, res, next);
  };
}
