/**
 * handler.ts — AWS Lambda entry point
 * Wraps the Express app with serverless-http.
 */
import serverless from 'serverless-http';
import { app } from '../app';

export const handler = serverless(app);
