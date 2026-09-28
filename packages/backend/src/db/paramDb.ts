/**
 * paramDb.ts — Per-account parameter values for guided-tool instructions.
 *
 * Each module declares parameter keys (Recipe.parameters). A parameter
 * table row maps a pooled tool account to that student's concrete values —
 * the modern replacement for "seeding" assignments from the student's own
 * userid, which SSO no longer exposes.
 *
 * Item shape: { moduleId (PK), sapUsername (SK), values: { key: value } }
 *
 * At launch the claimed account's row is bound onto the session as
 * session.parameters; the browser renders {key} placeholders inline and
 * compileContext injects the same values into the AI prompts so the
 * evaluator knows the expected ("known") result.
 *
 * When USE_LOCAL_DB=true, delegates to the JSON-file store in
 * localStore.ts so local dev works without AWS.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { USE_LOCAL_DB }  from '../config/env';
import { localParamDb }  from './localStore';

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE = process.env.DYNAMODB_TABLE_PARAMS!;

const ddbParamDb = {
  async getParams(moduleId: string, sapUsername: string): Promise<Record<string, string>> {
    const r = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { moduleId, sapUsername },
    }));
    return (r.Item?.values as Record<string, string>) ?? {};
  },
};

export const paramDb = USE_LOCAL_DB ? localParamDb : ddbParamDb;
