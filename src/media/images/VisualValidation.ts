import path from 'node:path';
import type { VisualAsset } from '../../shared/types.js';
export function visualIdentity(asset: VisualAsset): string { return asset.candidateId ? 'id:' + asset.candidateId : 'path:' + path.resolve(asset.path); }
export function isDuplicateVisual(asset: VisualAsset, selected: Set<string>): boolean { return selected.has(visualIdentity(asset)); }
