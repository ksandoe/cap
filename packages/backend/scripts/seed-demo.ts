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
 *
 * SEED_ONLY_MODULE=<moduleId> writes only that module's recipe + module-config
 * row — for adding or refreshing one module (e.g. sim-sales-process) without
 * touching other modules' rows. Shared infra (SAP pool, per-account params,
 * image assets) is skipped in this mode; use a full run to seed those.
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
const MODULE_CONFIG = process.env.DYNAMODB_TABLE_MODULE_CONFIG ?? 'cap-module-config';

// Demo screenshots extracted from the sales-process assignment PDF. The
// filename (minus extension) is the assetId, so the seed recipe can
// reference them statically as /img/seed-inq-soldto etc.
const ASSET_DIR = path.join(__dirname, '..', 'demo-assets');
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp',
};

async function main() {
  const only = process.env.SEED_ONLY_MODULE;
  const { recipes, sapPool, params, moduleConfigs } = demoSeedData();

  for (const r of recipes) {
    if (only && r.moduleId !== only) continue;
    await ddb.send(new PutCommand({ TableName: RECIPES, Item: r }));
    console.log(`recipe  ${r.moduleId} v${r.version}`);
  }
  for (const c of moduleConfigs) {
    if (only && c.moduleId !== only) continue;
    await ddb.send(new PutCommand({ TableName: MODULE_CONFIG, Item: c }));
    console.log(`config  ${c.moduleId}`);
  }
  if (only) { console.log(`seed complete (module-only: ${only})`); return; }
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
