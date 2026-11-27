/**
 * ddbClient.ts — The one way to make a DynamoDB document client.
 *
 * Every table module uses this, so the setting below applies everywhere.
 *
 * `removeUndefinedValues: true` matters because the document client's default is to
 * THROW when an item has a property whose value is undefined ("Pass
 * options.removeUndefinedValues=true to remove undefined values from map/array/set").
 * It throws in the client, before any network call. The local JSON store used in
 * development and tests does not care, so `field: undefined` passes every local test and
 * then fails on the real table. Optional fields written as `x ? value : undefined` are
 * easy to write and were already in the code (the authoring wizard's tone guidance and a
 * draft's owner), so the safe default is to drop undefined properties on write.
 *
 * Do not call DynamoDBDocumentClient.from directly anywhere else: a test fails if
 * you do.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export function makeDocClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
}
