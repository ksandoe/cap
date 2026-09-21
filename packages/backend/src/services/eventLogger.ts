/**
 * eventLogger.ts
 *
 * Writes audit events to Aurora (audit_log table, 90-day retention)
 * and to stdout (CloudWatch Logs in Lambda).
 *
 * All events carry: event_type, occurred_at, severity, source, payload.
 * No student PII is logged — sessionId and tempUserId only.
 *
 * When USE_LOCAL_DB=true or Aurora is not configured, events are
 * console-only (audit_log write skipped).
 */
import { v4 as uuidv4 } from 'uuid';
import { EventType }    from '@cap/shared';
import { USE_LOCAL_DB } from '../config/env';
import { auroraConfigured, query } from '../db/auroraDb';

type Severity = 'INFO' | 'WARN' | 'ERROR';

async function log(severity: Severity, eventType: EventType, payload: Record<string, unknown> = {}) {
  const entry = {
    event_id:    uuidv4(),
    event_type:  eventType,
    occurred_at: new Date().toISOString(),
    severity,
    payload,
    source:      'backend',
  };
  console.log(`[${severity}] ${eventType}`, payload);
  if (USE_LOCAL_DB || !auroraConfigured()) return; // local dev: console-only audit log
  try {
    await query(
      `INSERT INTO audit_log (event_id, event_type, occurred_at, severity, source, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.event_id, entry.event_type, entry.occurred_at, severity, entry.source,
       JSON.stringify(payload)],
    );
  } catch (err) {
    console.error('Failed to write audit log entry:', err);
  }
}

export const logger = {
  info:  (e: EventType, p?: Record<string,unknown>) => log('INFO',  e, p),
  warn:  (e: EventType, p?: Record<string,unknown>) => log('WARN',  e, p),
  error: (e: EventType, p?: Record<string,unknown>) => log('ERROR', e, p),
};
