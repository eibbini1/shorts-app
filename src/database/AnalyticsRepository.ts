import type { LocalDatabase } from './connection.js';
export class AnalyticsRepository {
  constructor(private readonly db: LocalDatabase) {}
  record(videoId: number, metrics: Record<string, number>, observedAt = new Date().toISOString()): void {
    this.db.prepare('INSERT INTO analytics(videoId,observedAt,metricsJson) VALUES (?,?,?)').run(videoId,observedAt,JSON.stringify(metrics));
  }
  latest(videoId: number): Record<string, number> | null {
    const row = this.db.prepare('SELECT metricsJson FROM analytics WHERE videoId=? ORDER BY id DESC LIMIT 1').get(videoId);
    return row ? JSON.parse(String(row.metricsJson)) as Record<string, number> : null;
  }
}
