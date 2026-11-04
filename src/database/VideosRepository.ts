import type { LocalDatabase } from './connection.js';
import type { PipelineManifest, VideoMetadata, VideoStatus } from '../shared/types.js';
import type { ReadinessReport } from '../services/YouTubeReadinessService.js';
export interface VideoRow { id: number; title: string; script: string; status: VideoStatus; videoPath: string | null; metadataJson: string | null; readinessJson: string | null; manifestJson: string | null }
export class VideosRepository {
  constructor(private readonly db: LocalDatabase) {}
  create(input: { title: string; script: string }): VideoRow {
    const result = this.db.prepare('INSERT INTO videos(title,script) VALUES (?,?)').run(input.title,input.script);
    return this.getById(Number(result.lastInsertRowid));
  }
  getById(id: number): VideoRow {
    const row = this.db.prepare('SELECT * FROM videos WHERE id=?').get(id);
    if (!row) throw new Error('Video not found: ' + id);
    return row as unknown as VideoRow;
  }
  recentTitles(limit = 20): string[] { return this.db.prepare('SELECT title FROM videos ORDER BY id DESC LIMIT ?').all(limit).map(row => String(row.title)); }
  setStatus(id: number, status: VideoStatus): void { this.db.prepare('UPDATE videos SET status=? WHERE id=?').run(status,id); }
  markRendered(id: number, file: string): void { this.db.prepare("UPDATE videos SET status='rendered',videoPath=? WHERE id=?").run(file,id); }
  persistPublishArtifacts(id: number, meta: VideoMetadata, readiness: ReadinessReport, manifest: PipelineManifest): void {
    this.db.prepare('UPDATE videos SET metadataJson=?,readinessJson=?,manifestJson=? WHERE id=?').run(JSON.stringify(meta),JSON.stringify(readiness),JSON.stringify(manifest),id);
  }
}
