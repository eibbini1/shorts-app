import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
export type LocalDatabase = DatabaseSync;
let connection: DatabaseSync | undefined;
let currentPath: string | undefined;
export function getDb(file = process.env.DATABASE_PATH ?? 'storage/shorts.sqlite'): DatabaseSync {
  if (connection && currentPath === file) return connection;
  connection?.close();
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  connection = new DatabaseSync(file);
  currentPath = file;
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS videos (id INTEGER PRIMARY KEY, title TEXT NOT NULL, script TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', videoPath TEXT, metadataJson TEXT, readinessJson TEXT, manifestJson TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, type TEXT NOT NULL, videoId INTEGER REFERENCES videos(id), status TEXT NOT NULL DEFAULT 'running', error TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, finishedAt TEXT);
    CREATE TABLE IF NOT EXISTS analytics (id INTEGER PRIMARY KEY, videoId INTEGER REFERENCES videos(id), observedAt TEXT NOT NULL, metricsJson TEXT NOT NULL);
  `);
  return connection;
}
export function __resetDbForTests(): void { connection?.close(); connection = undefined; currentPath = undefined; }
