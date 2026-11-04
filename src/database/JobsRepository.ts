import type { LocalDatabase } from './connection.js';
import type { JobType, JobStatus } from '../shared/types.js';
interface JobRow { id: number; type: JobType; videoId: number | null; status: JobStatus; error: string | null }
export class JobsRepository {
  constructor(private readonly db: LocalDatabase) {}
  start(type: JobType, videoId?: number): JobRow {
    const r = this.db.prepare('INSERT INTO jobs(type,videoId) VALUES (?,?)').run(type,videoId ?? null);
    return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(Number(r.lastInsertRowid)) as unknown as JobRow;
  }
  succeed(id: number): void { this.db.prepare("UPDATE jobs SET status='success',finishedAt=CURRENT_TIMESTAMP WHERE id=?").run(id); }
  fail(id: number, error: string): void { this.db.prepare("UPDATE jobs SET status='failed',error=?,finishedAt=CURRENT_TIMESTAMP WHERE id=?").run(error,id); }
  historyForVideo(id: number): JobRow[] { return this.db.prepare('SELECT * FROM jobs WHERE videoId=? ORDER BY id').all(id) as unknown as JobRow[]; }
}
