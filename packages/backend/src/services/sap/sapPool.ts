/**
 * sapPool.ts
 *
 * Manages the pool of pre-provisioned SAP sandbox accounts.
 *
 * Each account in cap-sap-pool has:
 *   - sapUsername (PK)
 *   - status: 'available' | 'in_use'
 *   - assignedSessionId (set when in_use)
 *   - assignedAt (timestamp, for stale-lock detection)
 *
 * On activity exit (completion, expiry, or error), the account
 * is reset via the SAP reset endpoint and returned to 'available'.
 *
 * When USE_LOCAL_DB=true, delegates to the JSON-file store in
 * db/localStore.ts so local dev works without AWS.
 *
 * TODO: implement stale-lock reclamation (account locked > N hours → force release)
 * TODO: implement SAP account reset call
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { USE_LOCAL_DB }  from '../../config/env';
import { localSapPool }  from '../../db/localStore';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE = process.env.DYNAMODB_TABLE_SAP_POOL!;

async function ddbAcquire(sessionId: string): Promise<string> {
  // Scan for an available account
  // TODO: replace Scan with a GSI query on status for efficiency at scale
  const result = await ddb.send(new ScanCommand({
    TableName:        TABLE,
    FilterExpression: '#s = :available',
    ExpressionAttributeNames:  { '#s': 'status' },
    ExpressionAttributeValues: { ':available': 'available' },
    Limit: 10,
  }));

  const candidates = result.Items ?? [];
  if (candidates.length === 0) throw new Error('SAP_POOL_EXHAUSTED');

  // Pick randomly from candidates to distribute load
  const account = candidates[Math.floor(Math.random() * candidates.length)];

  // Atomic conditional update — claim the account
  await ddb.send(new UpdateCommand({
    TableName:        TABLE,
    Key:              { sapUsername: account.sapUsername },
    UpdateExpression: 'SET #s = :in_use, assignedSessionId = :sid, assignedAt = :now',
    ConditionExpression: '#s = :available', // prevents double-assignment
    ExpressionAttributeNames:  { '#s': 'status' },
    ExpressionAttributeValues: {
      ':in_use':    'in_use',
      ':available': 'available',
      ':sid':       sessionId,
      ':now':       new Date().toISOString(),
    },
  }));

  return account.sapUsername as string;
}

async function ddbRelease(sapUsername: string): Promise<void> {
  // TODO: call SAP reset endpoint before releasing
  await ddb.send(new UpdateCommand({
    TableName:        TABLE,
    Key:              { sapUsername },
    UpdateExpression: 'SET #s = :available REMOVE assignedSessionId, assignedAt',
    ExpressionAttributeNames:  { '#s': 'status' },
    ExpressionAttributeValues: { ':available': 'available' },
  }));
}

export const acquireSapAccount = USE_LOCAL_DB
  ? localSapPool.acquireSapAccount : ddbAcquire;
export const releaseSapAccount = USE_LOCAL_DB
  ? localSapPool.releaseSapAccount : ddbRelease;
