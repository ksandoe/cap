/**
 * recipeDb.ts — DynamoDB access layer for instructional recipes.
 * Recipes are NOT student data — they are authored content and
 * persist indefinitely (no TTL).
 *
 * PK: moduleId  SK: version (number)
 * GSI: isActive-index for active recipe lookup
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { Recipe } from '@cap/shared';

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE = process.env.DYNAMODB_TABLE_RECIPES!;

export const recipeDb = {
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
    const versions = await recipeDb.listVersions(recipe.moduleId!);
    const nextVer  = versions.length ? Math.max(...versions.map((v:any) => v.version)) + 1 : 1;
    const saved    = {
      ...recipe, version: nextVer, isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as Recipe;
    // TODO: deactivate previous active version
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
};
