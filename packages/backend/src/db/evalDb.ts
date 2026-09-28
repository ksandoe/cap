/**
 * evalDb.ts — De-identified evaluation records for research + threshold tuning.
 *
 * PK: attemptId (= sessionId; sessions are deleted on completion but the
 * attempt record survives — it carries no student identifiers).
 *
 * Item: { attemptId, moduleId, recipeVersion, attemptNumber,
 *         evaluation, transcript, completedAt }
 *
 * FERPA note: canvasUuid/tempUserId are intentionally NOT stored here.
 * Transcripts may incidentally contain whatever the student typed; IRB
 * gating for research access is enforced at the admin layer.
 *
 * When USE_LOCAL_DB=true, delegates to the JSON-file store in
 * localStore.ts so local dev works without AWS.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { USE_LOCAL_DB } from '../config/env';
import { localEvalDb } from './localStore';

export interface EvalRecord {
  attemptId:     string;   // sessionId
  moduleId:      string;
  recipeVersion: number;
  attemptNumber: number;
  evaluation:    unknown;
  transcript:    { role: string; content: string }[];
  completedAt:   string;
}

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE = process.env.DYNAMODB_TABLE_EVALUATIONS!;

const ddbEvalDb = {
  async saveAttempt(rec: EvalRecord): Promise<void> {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: rec }));
  },
  async getAttempt(attemptId: string): Promise<EvalRecord | null> {
    const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { attemptId } }));
    return (r.Item as EvalRecord) ?? null;
  },
  async listForModule(moduleId: string): Promise<EvalRecord[]> {
    // Scan is fine at PoC scale — the eval table is small.
    const r = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'moduleId = :mid',
      ExpressionAttributeValues: { ':mid': moduleId },
    }));
    return (r.Items ?? []) as EvalRecord[];
  },
};

export const evalDb = USE_LOCAL_DB ? localEvalDb : ddbEvalDb;
