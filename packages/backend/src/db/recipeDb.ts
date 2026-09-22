/**
 * recipeDb.ts — DynamoDB access layer for instructional recipes.
 * Recipes are NOT student data — they are authored content and
 * persist indefinitely (no TTL).
 *
 * PK: moduleId  SK: version (number)
 * GSI: isActive-index for active recipe lookup
 *
 * TODO: recipes belong in Aurora (Master PRD §5.2) — migrate this
 * access layer to auroraDb once the recipes table is live.
 *
 * When USE_LOCAL_DB=true, delegates to the JSON-file store in
 * localStore.ts so local dev works without AWS.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { Recipe } from '@cap/shared';
import { USE_LOCAL_DB }  from '../config/env';
import { localRecipeDb } from './localStore';

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE = process.env.DYNAMODB_TABLE_RECIPES!;

const ddbRecipeDb = {
  async getActiveRecipe(moduleId: string): Promise<Recipe | null> {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'moduleId = :mid',
      FilterExpression: 'isActive = :t',
      ExpressionAttributeValues: { ':mid': moduleId, ':t': true },
      Limit: 1,
    }));
    return (r.Items?.[0] as Recipe) ?? null;
  },

  async saveRecipe(recipe: Partial<Recipe>): Promise<Recipe> {
    const versions = await ddbRecipeDb.listVersions(recipe.moduleId!);
    const nextVer  = versions.length ? Math.max(...versions.map((v:any) => v.version)) + 1 : 1;
    const saved    = {
      ...recipe, version: nextVer, isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as Recipe;
    // Deactivate previous versions so only one active version exists per module
    await Promise.all(versions.map(v =>
      ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { moduleId: recipe.moduleId, version: v.version },
        UpdateExpression: 'SET isActive = :f',
        ExpressionAttributeValues: { ':f': false },
      }))
    ));
    await ddb.send(new PutCommand({ TableName: TABLE, Item: saved }));
    return saved;
  },

  async listVersions(moduleId: string) {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'moduleId = :mid',
      ExpressionAttributeValues: { ':mid': moduleId },
    }));
    return r.Items ?? [];
  },

  async listActiveModules() {
    // Scan is fine at PoC/demo scale — recipes table is small.
    const r = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'isActive = :t',
      ExpressionAttributeValues: { ':t': true },
    }));
    const seen = new Map<string, string>();
    for (const item of r.Items ?? []) {
      if (!seen.has(item.moduleId)) seen.set(item.moduleId, item.moduleTitle);
    }
    return [...seen.entries()].map(([moduleId, moduleTitle]) => ({ moduleId, moduleTitle }));
  },

  async listAllRecipes() {
    const r = await ddb.send(new ScanCommand({ TableName: TABLE }));
    return r.Items ?? [];
  },
};

export const recipeDb = USE_LOCAL_DB ? localRecipeDb : ddbRecipeDb;
