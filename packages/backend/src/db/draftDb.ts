/**
 * draftDb.ts — Persistence for in-progress recipe drafts (v3).
 *
 * Authors build modules across multiple sessions, so drafts are stored
 * server-side rather than in browser storage. Drafts are authored content
 * (not student data) and persist until published or discarded.
 *
 * PK: draftId. Under the shared-passkey interim auth all drafts are
 * team-visible — the optional `owner` field gives attribution only.
 *
 * When USE_LOCAL_DB=true, delegates to the JSON-file store in
 * localStore.ts so local dev works without AWS.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { RecipeDraft } from '@cap/shared';
import { USE_LOCAL_DB }  from '../config/env';
import { localDraftDb }  from './localStore';

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE = process.env.DYNAMODB_TABLE_RECIPE_DRAFTS!;

const ddbDraftDb = {
  async list(): Promise<RecipeDraft[]> {
    const r = await ddb.send(new ScanCommand({ TableName: TABLE }));
    return (r.Items ?? []) as RecipeDraft[];
  },
  async get(draftId: string): Promise<RecipeDraft | null> {
    const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { draftId } }));
    return (r.Item as RecipeDraft) ?? null;
  },
  async put(draft: RecipeDraft): Promise<void> {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: draft }));
  },
  async remove(draftId: string): Promise<void> {
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { draftId } }));
  },
};

export const draftDb = USE_LOCAL_DB ? localDraftDb : ddbDraftDb;
