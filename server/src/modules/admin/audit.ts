import { q } from '../../db/pool';

/** Append-only audit trail for security-relevant and moderation actions. Fire-and-forget. */
export function audit(actorId: string | null, action: string, targetType?: string, targetId?: string, meta?: Record<string, unknown>, ip?: string) {
  q('INSERT INTO audit_logs (actor_id, action, target_type, target_id, meta, ip) VALUES ($1,$2,$3,$4,$5,$6)', [
    actorId, action, targetType ?? null, targetId ?? null, meta ? JSON.stringify(meta) : null, ip ?? null,
  ]).catch((e) => console.error('[audit]', e.message));
}
