/**
 * seed-demo.ts — Push the demo content (recipe + SAP pool) into DynamoDB.
 *
 * Run once after creating the tables:
 *
 *   DYNAMODB_TABLE_RECIPES=cap-recipes DYNAMODB_TABLE_SAP_POOL=cap-sap-pool \
 *     AWS_REGION=us-east-1 npx tsx scripts/seed-demo.ts
 *
 * Idempotent — PutCommand overwrites existing items.
 * Sessions are intentionally NOT seeded (they're runtime data).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { demoSeedData } from '../src/db/localStore';

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
);
const RECIPES  = process.env.DYNAMODB_TABLE_RECIPES  ?? 'cap-recipes';
const SAP_POOL = process.env.DYNAMODB_TABLE_SAP_POOL ?? 'cap-sap-pool';
const PARAMS   = process.env.DYNAMODB_TABLE_PARAMS   ?? 'cap-params';

async function main() {
  const { recipes, sapPool, params } = demoSeedData();

  for (const r of recipes) {
    await ddb.send(new PutCommand({ TableName: RECIPES, Item: r }));
    console.log(`recipe  ${r.moduleId} v${r.version}`);
  }
  for (const a of sapPool) {
    await ddb.send(new PutCommand({ TableName: SAP_POOL, Item: a }));
    console.log(`sap acct ${a.sapUsername}`);
  }
  for (const p of params) {
    await ddb.send(new PutCommand({ TableName: PARAMS, Item: p }));
    console.log(`params  ${p.sapUsername} → ${JSON.stringify(p.values)}`);
  }
  console.log('seed complete');
}

main().catch(e => { console.error(e); process.exit(1); });
