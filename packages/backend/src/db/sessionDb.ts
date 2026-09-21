/**
 * sessionDb.ts — DynamoDB access layer for session records.
 * Sessions are ephemeral: TTL-governed, deleted on completion.
 *
 * PK: sessionId
 * GSI: canvasUuid-moduleId-index (for resume lookup)
 *
 * NOTE: canvasUuid is used only server-side for resume lookups.
 * It is never returned to the browser.
 *
 * When USE_LOCAL_DB=true, delegates to the JSON-file store in
 * localStore.ts so local dev works without AWS.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, PutCommand,
  UpdateCommand, DeleteCommand, QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { USE_LOCAL_DB }   from '../config/env';
import { localSessionDb } from './localStore';

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE = process.env.DYNAMODB_TABLE_SESSIONS!;

const ddbSessionDb = {
  async getSession(sessionId: string) {
    const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { sessionId } }));
    return r.Item ?? null;
  },

  async putSession(session: Record<string, unknown>) {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: session }));
  },

  async updateSession(sessionId: string, updates: Record<string, unknown>) {
    const keys   = Object.keys(updates);
    const expr   = 'SET ' + keys.map(k => `#${k} = :${k}`).join(', ');
    const names  = Object.fromEntries(keys.map(k => [`#${k}`, k]));
    const values = Object.fromEntries(keys.map(k => [`:${k}`, updates[k]]));
    await ddb.send(new UpdateCommand({
      TableName: TABLE, Key: { sessionId },
      UpdateExpression: expr,
      ExpressionAttributeNames:  names,
      ExpressionAttributeValues: values,
    }));
  },

  async deleteSession(sessionId: string) {
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { sessionId } }));
  },

  async findActiveSession(canvasUuid: string, moduleId: string) {
    // TODO: requires GSI on canvasUuid + moduleId
    // Placeholder: scan is acceptable for PoC scale
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: 'canvasUuid-moduleId-index',
      KeyConditionExpression: 'canvasUuid = :cu AND moduleId = :mid',
      FilterExpression: '#s <> :completed AND #s <> :expired',
      ExpressionAttributeNames:  { '#s': 'state' },
      ExpressionAttributeValues: {
        ':cu': canvasUuid, ':mid': moduleId,
        ':completed': 'COMPLETED', ':expired': 'EXPIRED',
      },
      Limit: 1,
    }));
    return r.Items?.[0] ?? null;
  },
};

export const sessionDb = USE_LOCAL_DB ? localSessionDb : ddbSessionDb;
