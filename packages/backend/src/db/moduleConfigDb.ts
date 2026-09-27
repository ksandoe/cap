/**
 * moduleConfigDb.ts — Per-module configuration (passing thresholds today;
 * retry limits, doc types, etc. can join later).
 *
 * PK: moduleId
 * Item: { moduleId, overallMin, dimensionFloor, updatedAt, updatedBy? }
 *
 *   overallMin     — minimum overallScore (0-100) required to pass
 *   dimensionFloor — minimum score on ANY single dimension (a weak
 *                    dimension alone can fail the student)
 *
 * Thresholds are instructor-tunable; the evaluator computes badgeAwarded
 * server-side from them so the model can't improvise pass/fail.
 *
 * When USE_LOCAL_DB=true, delegates to the JSON-file store in
 * localStore.ts so local dev works without AWS.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { USE_LOCAL_DB } from '../config/env';
import { localModuleConfigDb } from './localStore';

export interface ModuleConfig {
  moduleId:       string;
  overallMin:     number;   // default 60
  dimensionFloor: number;   // default 40
  updatedAt?:     string;
  updatedBy?:     string;
}

export const DEFAULT_THRESHOLDS = { overallMin: 60, dimensionFloor: 40 };

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE = process.env.DYNAMODB_TABLE_MODULE_CONFIG!;

const ddbModuleConfigDb = {
  async getConfig(moduleId: string): Promise<ModuleConfig> {
    const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { moduleId } }));
    return { moduleId, ...DEFAULT_THRESHOLDS, ...(r.Item ?? {}) } as ModuleConfig;
  },
  async saveConfig(cfg: ModuleConfig): Promise<void> {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: cfg }));
  },
};

export const moduleConfigDb = USE_LOCAL_DB ? localModuleConfigDb : ddbModuleConfigDb;
