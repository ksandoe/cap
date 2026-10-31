import Database from 'better-sqlite3';
import path from 'node:path';

// Local SQLite file, zero external services — docs/architecture-proposal.md §2.
// Reference data (customers, materials, assignment config) is NOT stored here; it lives as
// static code in @sap-sim/engine and is looked up directly. This file only holds per-student,
// dynamically-generated state: resolved assignment variants, documents, events, PO counters,
// and wizard progress.
const DB_PATH = process.env.SAP_SIM_DB_PATH ?? path.join(__dirname, '..', 'sap-sim.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS assignment_instances (
    id TEXT PRIMARY KEY,
    assignmentId TEXT NOT NULL,
    studentKey TEXT NOT NULL,
    source TEXT NOT NULL,
    variantIndex INTEGER,
    seed TEXT,
    resolvedParamsJson TEXT NOT NULL,
    expectedNetValueJson TEXT NOT NULL,
    custPoNumber TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    UNIQUE (assignmentId, studentKey)
  );

  CREATE TABLE IF NOT EXISTS po_counters (
    assignmentId TEXT PRIMARY KEY,
    nextSequence INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sales_documents (
    id TEXT PRIMARY KEY,
    docType TEXT NOT NULL,
    assignmentId TEXT NOT NULL,
    studentKey TEXT NOT NULL,
    predecessorId TEXT,
    customerId TEXT NOT NULL,
    custReference TEXT NOT NULL,
    custReferenceDate TEXT,
    validFrom TEXT,
    validTo TEXT,
    requestedDeliveryDate TEXT,
    itemsJson TEXT NOT NULL,
    headerConditionsJson TEXT NOT NULL,
    netValue REAL NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    savedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    studentKey TEXT NOT NULL,
    assignmentId TEXT NOT NULL,
    docId TEXT,
    type TEXT NOT NULL,
    payloadJson TEXT NOT NULL,
    occurredAt TEXT NOT NULL,
    relativeMs INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flow_progress (
    studentKey TEXT NOT NULL,
    assignmentId TEXT NOT NULL,
    currentBlockIndex INTEGER NOT NULL,
    furthestBlockIndex INTEGER NOT NULL,
    PRIMARY KEY (studentKey, assignmentId)
  );
`);
