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
import fs   from 'fs';
import path from 'path';

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
);
const RECIPES  = process.env.DYNAMODB_TABLE_RECIPES  ?? 'cap-recipes';
const SAP_POOL = process.env.DYNAMODB_TABLE_SAP_POOL ?? 'cap-sap-pool';
const PARAMS   = process.env.DYNAMODB_TABLE_PARAMS   ?? 'cap-params';
const ASSETS   = process.env.DYNAMODB_TABLE_ASSETS   ?? 'cap-assets';

// Demo screenshots extracted from the sales-process assignment PDF. The
// filename (minus extension) is the assetId, so the seed recipe can
// reference them statically as /img/seed-inq-soldto etc.
const ASSET_DIR = path.join(__dirname, '..', 'demo-assets');
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp',
};

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
  if (fs.existsSync(ASSET_DIR)) {
    for (const file of fs.readdirSync(ASSET_DIR)) {
      const contentType = IMAGE_TYPES[path.extname(file).toLowerCase()];
      if (!contentType) continue;
      const assetId = path.basename(file, path.extname(file));
      const data    = fs.readFileSync(path.join(ASSET_DIR, file)).toString('base64');
      await ddb.send(new PutCommand({ TableName: ASSETS, Item: {
        assetId, moduleId: 'demo-sales-process', contentType, data,
        createdAt: new Date().toISOString(),
      }}));
      console.log(`asset   ${assetId} (${Math.round(data.length * 3 / 4 / 1024)}KB)`);
    }
  }
  console.log('seed complete');
}

main().catch(e => { console.error(e); process.exit(1); });
