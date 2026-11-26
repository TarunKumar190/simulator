import type { NextFunction, Request, Response } from 'express';
import { verifyBearerToken, type AuthenticatedUser } from '../lib/auth.ts';
import type { UserRole } from '../types.ts';

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

export function extractBearerToken(req: Request, allowQueryToken = false): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  if (allowQueryToken && typeof req.query?.token === 'string') {
    return req.query.token.trim();
  }
  return '';
}

export function createRequireAuth(allowQueryToken = false) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req, allowQueryToken);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
    }
    try {
      const user = await verifyBearerToken(token);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired session.' });
      }
      req.authUser = user;
      return next();
    } catch (err) {
      console.error('Authentication error:', err);
      return res.status(401).json({ error: 'Unauthorized: Authentication check failed.' });
    }
  };
}

export const requireAuth = createRequireAuth(false);
export const requireStreamOrImageAuth = createRequireAuth(true);

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = req.authUser;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
    }
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        error: `Forbidden: Role "${user.role}" does not have permission for this action.`,
      });
    }
    return next();
  };
}
