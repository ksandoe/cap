/**
 * assetDb.ts — Recipe image assets (screenshots for guided-tool
 * instructions and rich-text blocks).
 *
 * PK: assetId
 * Item: { assetId, moduleId?, contentType, data(base64), createdAt }
 *
 * Images are stored as base64 so they work identically in the local
 * JSON store and DynamoDB — no S3/CORS/public-bucket surface. The
 * upload route enforces a ~280KB decoded cap (base64 stays under the
 * 400KB DynamoDB item limit); the admin client downscales larger
 * screenshots before posting.
 *
 * Served publicly via GET /assets/:id — recipe screenshots carry no
 * student data.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { USE_LOCAL_DB } from '../config/env';
import { localAssetDb } from './localStore';

export interface Asset {
  assetId:     string;
  moduleId?:   string;
  contentType: string;        // image/png, image/jpeg, image/gif, image/webp
  data:        string;        // base64 payload
  createdAt:   string;
}

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE = process.env.DYNAMODB_TABLE_ASSETS!;

const ddbAssetDb = {
  async put(a: Asset): Promise<void> {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: a }));
  },
  async get(assetId: string): Promise<Asset | null> {
    const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { assetId } }));
    return (r.Item as Asset) ?? null;
  },
};

export const assetDb = USE_LOCAL_DB ? localAssetDb : ddbAssetDb;
