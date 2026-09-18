/**
 * sapConnector.ts
 *
 * Read-only SAP integration. Two responsibilities:
 *   1. Acquire and cache OAuth 2.0 access tokens from SAP.
 *   2. Query the SAP OData API to verify document existence.
 *
 * SAP account pool management (assignment + reset) is in sapPool.ts.
 *
 * TODO: implement token cache with refresh-before-expiry
 * TODO: implement OData query for required document types
 * TODO: handle SAP connectivity errors and timeouts
 */
import axios from 'axios';
import { USE_LOCAL_DB } from '../../config/env';

let _accessToken: string | null = null;
let _tokenExpiry: number        = 0;

async function getAccessToken(): Promise<string> {
  if (_accessToken && Date.now() < _tokenExpiry - 60_000) return _accessToken;

  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.SAP_CLIENT_ID!,
    client_secret: process.env.SAP_CLIENT_SECRET!,
  });

  const resp = await axios.post(process.env.SAP_OAUTH_TOKEN_URL!, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10_000,
  });

  _accessToken = resp.data.access_token;
  _tokenExpiry = Date.now() + (resp.data.expires_in * 1000);
  return _accessToken!;
}

export interface VerificationResult {
  allPresent:   boolean;
  foundDocs:    string[];
  missingTypes: string[];
}

/**
 * Verify that requiredDocTypes all exist in SAP for the given sapUsername.
 * Returns which docs were found and which are still missing.
 *
 * TODO: replace placeholder with real OData query
 */
export async function verifySapDocuments(
  sapUsername: string,
  requiredDocTypes: string[],
): Promise<VerificationResult> {
  // Local dev: no real SAP sandbox — report all documents present
  if (USE_LOCAL_DB) {
    console.log(`[SAP:local] Simulating verification for ${sapUsername}`);
    return {
      allPresent:   true,
      foundDocs:    requiredDocTypes.map((t, i) => `SIM-${t}-0000${i + 1}`),
      missingTypes: [],
    };
  }

  const token = await getAccessToken();

  // TODO: implement OData v4 query
  // Example: GET /sap/opu/odata/sap/SD_DOC_SRV/DocumentSet
  //          ?$filter=CreatedBy eq '${sapUsername}' and DocType in (${requiredDocTypes})
  console.log(`[SAP] Verifying docs for ${sapUsername}`, { token: '[REDACTED]' });

  // Placeholder — replace with real query
  return { allPresent: false, foundDocs: [], missingTypes: requiredDocTypes };
}
