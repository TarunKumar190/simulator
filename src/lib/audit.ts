import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import type { AuthRequest } from '../middleware/auth.ts';

export async function recordAuditLog(params: {
  req?: AuthRequest;
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const user = params.req?.authUser;
    const forwarded = params.req?.headers['x-forwarded-for'];
    const ip =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : params.req?.socket?.remoteAddress || null;

    await db.insert(auditLogs).values({
      userId: params.userId ?? user?.id ?? null,
      userEmail: params.userEmail ?? user?.email ?? null,
      userRole: params.userRole ?? user?.role ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      details: params.details ?? null,
      ipAddress: ip,
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
