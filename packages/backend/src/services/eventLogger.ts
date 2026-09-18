/**
 * eventLogger.ts
 *
 * Writes audit events to DynamoDB (cap-sessions table, events prefix)
 * and to stdout (CloudWatch Logs in Lambda).
 *
 * All events carry: event_id, event_type, occurred_at, severity, source.
 * No student PII is logged — sessionId and tempUserId only.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { EventType }    from '@cap/shared';

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE = process.env.DYNAMODB_TABLE_SESSIONS!;

type Severity = 'INFO' | 'WARN' | 'ERROR';

async function log(severity: Severity, eventType: EventType, payload: Record<string, unknown> = {}) {
  const entry = {
    pk:          `event_${uuidv4()}`,
    sk:          new Date().toISOString(),
    eventType, severity, payload, source: 'backend',
    ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 3600, // 90-day retention
  };
  console.log(`[${severity}] ${eventType}`, payload);
  try {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: entry }));
  } catch (err) {
    console.error('Failed to write audit log entry:', err);
  }
}

export const logger = {
  info:  (e: EventType, p?: Record<string,unknown>) => log('INFO',  e, p),
  warn:  (e: EventType, p?: Record<string,unknown>) => log('WARN',  e, p),
  error: (e: EventType, p?: Record<string,unknown>) => log('ERROR', e, p),
};
