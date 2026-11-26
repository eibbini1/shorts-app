// Scenario reference manifests, first-frame manifests, sequential review frames, and saved character library.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { motionState, verifiedTake } from './studio-motion-state.mjs';

const CHARACTER_ID = /^[0-9a-f]{32}$/;

export function createStudioManifests({ root }) {
  const characterDir = path.join(root, 'storage', 'studio-characters');

  function newest(dir, ext, since) {
    try {
      const found = [];
      const walk = (d, depth) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory() && depth < 2) walk(p, depth + 1);
          else if (e.name.endsWith(ext)) {
            const m = fs.statSync(p).mtimeMs;
            if (m >= since) found.push([m, p]);
          }
        }
      };
      walk(path.join(root, dir), 0);
      found.sort((a, b) => b[0] - a[0]);
      return found[0] && path.relative(root, found[0][1]);
    } catch { return null; }
  }

  function readReferenceManifest(scenario) {
    const work = path.join('storage', 'any-local', path.basename(scenario, '.json'));
    const workRoot = path.resolve(root, work);
    const manifest = path.join(workRoot, 'references.json');
    if (!fs.existsSync(manifest)) return { rows: [], references: [], sha256: null };
    const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const story = path.join(root, scenario);
    const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (data.schemaVersion !== 1 || data.scenarioSha256 !== hash(story) || !Array.isArray(data.references)) {
      throw new Error('The reference images belong to an older version of this story. Upload them again.');
    }
    const shotCount = JSON.parse(fs.readFileSync(story, 'utf8')).plan.shots.length;
    const seen = new Set();
    const references = data.references.map((row) => {
      if (!row || typeof row !== 'object') throw new Error('The reference-image manifest is invalid.');
      const fileName = String(row.file || '');
      const match = /^references\/shot-(\d+)-[0-9a-f]{16}\.(png|jpg)$/i.exec(fileName);
      if (!match || Number(match[1]) !== row.shot || !Number.isInteger(row.shot) ||
          row.shot < 1 || row.shot > shotCount || seen.has(row.shot)) {
        throw new Error('The reference-image manifest is invalid.');
      }
      seen.add(row.shot);
      const file = path.resolve(workRoot, fileName);
      const real = fs.realpathSync(file);
      if (!real.startsWith(workRoot + path.sep) || hash(real) !== row.sha256) {
        throw new Error(`The reference image for shot ${row.shot} changed. Upload it again.`);
      }
      return { shot: row.shot, p: path.relative(root, real), t: fs.statSync(real).mtimeMs, sha256: row.sha256 };
    }).sort((a, b) => a.shot - b.shot);
    return { rows: data.references, references, sha256: hash(manifest) };
  }

  function referenceIdentity(scenario) {
    const rows = readReferenceManifest(scenario).rows
      .map((row) => ({ shot: row.shot, file: row.file, sha256: row.sha256 }))
      .sort((a, b) => a.shot - b.shot);
    return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }

  function writeReferenceImage(workRoot, shot, image) {
    const digest = crypto.createHash('sha256').update(image.buffer).digest('hex');
    const relative = `references/shot-${String(shot).padStart(2, '0')}-${digest.slice(0, 16)}.${image.ext}`;
    const target = path.join(workRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      if (crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== digest) {
        throw new Error('A stored reference image does not match its filename.');
      }
    } else {
      const temporary = `${target}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(temporary, image.buffer, { flag: 'wx' });
      fs.renameSync(temporary, target);
    }
    return { shot, file: relative, sha256: digest, mime: image.mime };
  }

  function frameManifest(scenario) {
    const work = path.join('storage', 'any-local', path.basename(scenario, '.json'));
    const data = JSON.parse(fs.readFileSync(path.join(root, work, 'first-frames.json'), 'utf8'));
    const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const referenceHash = readReferenceManifest(scenario).sha256;
    const story = path.join(root, scenario);
    const count = JSON.parse(fs.readFileSync(story, 'utf8')).plan.shots.length;
    if (data.schemaVersion !== 1 || data.scenarioSha256 !== hash(story) ||
        (data.referenceManifestSha256 ?? null) !== referenceHash || data.frames?.length !== count) {
      throw new Error('Review fresh first frames for this story and its reference images.');
    }
    const stills = data.frames.map((frame, index) => {
      const workRoot = path.resolve(root, work);
      const file = path.resolve(workRoot, frame.file);
      const real = fs.realpathSync(file);
      if (frame.shot !== index + 1 || !real.startsWith(workRoot + path.sep) || hash(real) !== frame.sha256) {
        throw new Error('A first frame changed. Make first frames again.');
      }
      return { shot: frame.shot, p: path.relative(root, real), t: fs.statSync(real).mtimeMs, n: path.basename(real), verified: true };
    });
    return { stills };
  }

  function pendingFrameManifest(scenario) {
    const work = path.join('storage', 'any-local', path.basename(scenario, '.json'));
    const workRoot = path.resolve(root, work);
    const story = path.join(root, scenario);
    const data = JSON.parse(fs.readFileSync(path.join(workRoot, 'pending-first-frames.json'), 'utf8'));
    const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const referenceHash = readReferenceManifest(scenario).sha256;
    const count = JSON.parse(fs.readFileSync(story, 'utf8')).plan.shots.length;
    if (data.schemaVersion !== 1 || data.scenarioSha256 !== hash(story) ||
        (data.referenceManifestSha256 ?? null) !== referenceHash || !Array.isArray(data.frames)) {
      throw new Error('The pending frame review is stale. Generate first frames again.');
    }
    const seen = new Set();
    for (const frame of data.frames) {
      if (!Number.isInteger(frame.shot) || frame.shot < 1 || frame.shot > count || seen.has(frame.shot) ||
          !Array.isArray(frame.candidates) || frame.candidates.length === 0) {
        throw new Error('The pending frame review is incomplete or invalid.');
      }
      seen.add(frame.shot);
      const candidateIds = new Set();
      for (const candidate of frame.candidates) {
        const file = path.resolve(workRoot, candidate.file || '');
        if (!file.startsWith(workRoot + path.sep) || !fs.existsSync(file)) {
          throw new Error('A pending frame changed. Generate first frames again.');
        }
        const real = fs.realpathSync(file);
        const relative = path.relative(workRoot, real);
        const match = /^refs\/shot-(\d+)-[0-9a-f]+\.png$/i.exec(relative);
        if (!real.startsWith(workRoot + path.sep) || !match || Number(match[1]) !== frame.shot - 1 ||
            hash(real) !== candidate.sha256 ||
            !Number.isInteger(candidate.candidate) || candidate.candidate < 1 ||
            candidateIds.has(candidate.candidate)) {
          throw new Error('A pending frame changed. Generate first frames again.');
        }
        candidateIds.add(candidate.candidate);
      }
    }
    return { work, workRoot, data, count };
  }

  function sequenceMotionResult(scenario, sequence, shot, includeSegments = false, options = {}, resolveTakeContext) {
    const workRoot = path.resolve(root, 'storage', 'any-local', path.basename(scenario, '.json'));
    const manifestPath = path.join(workRoot, 'sequence', `shot-${String(shot).padStart(2, '0')}.json`);
    const state = motionState(workRoot)[shot - 1];
    const result = state?.completed
      ? verifiedTake(workRoot, state.completed[state.current], { ...resolveTakeContext({ scenario, sequence, options }, shot).expected, shot, take: state.current })
      : JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const story = path.join(root, scenario);
    const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const approved = sequence.approvedFrames.find((frame) => frame.shot === shot);
    const approvedPath = approved && path.resolve(workRoot, approved.file);
    if (!approvedPath || !approvedPath.startsWith(workRoot + path.sep) ||
        hash(fs.realpathSync(approvedPath)) !== approved.sha256) {
      throw new Error(`The approved first frame for shot ${shot} changed.`);
    }
    const checkedFile = (relative, expectedHash) => {
      const candidate = path.resolve(workRoot, relative || '');
      const real = fs.realpathSync(candidate);
      if (!real.startsWith(workRoot + path.sep) || hash(real) !== expectedHash) {
        throw new Error(`The verified motion artifact for shot ${shot} changed.`);
      }
      return path.relative(workRoot, real);
    };
    if (!approved || result.schemaVersion !== 1 || result.shot !== shot ||
        result.scenarioSha256 !== hash(story) ||
        result.scenarioSha256 !== approved.scenarioSha256 ||
        result.approvedReferenceSha256 !== approved.sha256) {
      throw new Error(`Shot ${shot} motion does not match the current story and approved first frame.`);
    }
    const clip = checkedFile(result.clip, result.clipSha256);
    const endFrame = checkedFile(result.endFrame, result.endFrameSha256);
    return {
      shot, clip, clipSha256: result.clipSha256, endFrame, endFrameSha256: result.endFrameSha256,
      take: result.take ?? null, parts: result.parts ?? null,
      ...(includeSegments && Array.isArray(result.segments) ? {
        segments: result.segments.map((segment, index) => ({
          part: index + 1,
          clip: checkedFile(segment.clip, segment.sha256),
          sha256: segment.sha256,
        })),
      } : {}),
    };
  }

  function sequenceIdentityReference(scenario, sequence) {
    const identity = sequence.approvedFrames.find((frame) => frame.shot === 1);
    if (!identity || identity.scenarioSha256 !== crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(root, scenario))).digest('hex')) {
      throw new Error('The first approved shot is missing or belongs to an older story.');
    }
    const workRoot = path.resolve(root, 'storage', 'any-local', path.basename(scenario, '.json'));
    const candidate = path.resolve(workRoot, identity.file);
    const real = fs.realpathSync(candidate);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex');
    if (!real.startsWith(workRoot + path.sep) || digest !== identity.sha256) {
      throw new Error('The shared identity reference changed; review shot 1 again.');
    }
    return path.relative(root, real);
  }

  function saveSequenceFrameManifest(scenario, sequence, reviewer) {
    const workRoot = path.resolve(root, 'storage', 'any-local', path.basename(scenario, '.json'));
    const story = path.join(root, scenario);
    const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const scenarioSha256 = hash(story);
    const count = JSON.parse(fs.readFileSync(story, 'utf8')).plan.shots.length;
    const frames = [...sequence.approvedFrames].sort((a, b) => a.shot - b.shot);
    if (frames.length !== count || frames.some((frame, index) => frame.shot !== index + 1)) {
      throw new Error('Sequential frame approval is incomplete.');
    }
    for (const frame of frames) {
      const file = path.resolve(workRoot, frame.file);
      const real = fs.realpathSync(file);
      if (!real.startsWith(workRoot + path.sep) || hash(real) !== frame.sha256) {
        throw new Error(`The approved first frame for shot ${frame.shot} changed.`);
      }
    }
    const manifest = {
      schemaVersion: 1,
      scenarioSha256,
      referenceManifestSha256: readReferenceManifest(scenario).sha256,
      reviewMethod: 'human',
      reviewedBy: reviewer,
      reviewedAt: new Date().toISOString(),
      sharedIdentityReference: {
        shot: frames[0].shot,
        file: frames[0].file,
        sha256: frames[0].sha256,
      },
      frames,
    };
    const target = path.join(workRoot, 'first-frames.json');
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temporary, target);
  }

  function previewFrames(scenario, since = 0) {
    const work = path.join('storage', 'any-local', path.basename(scenario, '.json'));
    const refs = path.resolve(root, work, 'refs');
    let count;
    try { count = JSON.parse(fs.readFileSync(path.join(root, scenario), 'utf8')).plan.shots.length; }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    let names;
    try { names = fs.readdirSync(refs); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const reviews = new Map();
    for (const name of names.filter((file) => /^vision-[0-9a-f]+\.json$/i.test(file))) {
      try {
        const report = JSON.parse(fs.readFileSync(path.join(refs, name), 'utf8'));
        const image = path.resolve(root, report.image || '');
        if (!image.startsWith(refs + path.sep)) continue;
        if (!/^shot-\d+-[0-9a-f]+\.png$/i.test(path.basename(image))) continue;
        const checkedAt = fs.statSync(path.join(refs, name)).mtimeMs;
        const key = path.basename(image);
        if (!reviews.has(key) || reviews.get(key).checkedAt < checkedAt) {
          reviews.set(key, {
            checkedAt,
            status: String(report.status || 'unverified'),
            reason: (report.verdict?.missingOrWrong || []).join('; ').slice(0, 300),
          });
        }
      } catch (error) {
        if (!(error instanceof SyntaxError) && error.code !== 'ENOENT') throw error;
      }
    }
    const latest = new Map();
    for (const name of names.filter((file) => /^shot-\d+-[0-9a-f]+\.png$/i.test(file))) {
      const index = Number(name.match(/^shot-(\d+)-/)[1]);
      if (index >= count) continue;
      const file = path.join(refs, name);
      let fileTime;
      try { fileTime = fs.statSync(file).mtimeMs; }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const review = reviews.get(name);
      const t = Math.max(fileTime, review?.checkedAt || 0);
      if (since && t < since) continue;
      if (!latest.has(index) || latest.get(index).t < t) {
        latest.set(index, {
          shot: index + 1, p: path.relative(root, file), t, n: name, verified: false,
          reviewStatus: review?.status || 'unverified', reviewReason: review?.reason || '',
        });
      }
    }
    return [...latest.values()].sort((a, b) => a.shot - b.shot);
  }

  function characterCatalog() {
    if (!fs.existsSync(characterDir)) return [];
    return fs.readdirSync(characterDir)
      .filter((name) => CHARACTER_ID.test(path.basename(name, '.json')) && name.endsWith('.json'))
      .map((name) => JSON.parse(fs.readFileSync(path.join(characterDir, name), 'utf8')))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function characterImage(id) {
    if (!CHARACTER_ID.test(id)) throw new Error('Choose a saved character.');
    const record = characterCatalog().find((item) => item.id === id);
    if (!record || !['png', 'jpg'].includes(record.ext)) throw new Error('Saved character is unavailable.');
    const file = fs.realpathSync(path.join(characterDir, id + '.' + record.ext));
    if (path.dirname(file) !== fs.realpathSync(characterDir)) throw new Error('Saved character file is invalid.');
    const buffer = fs.readFileSync(file);
    if (crypto.createHash('sha256').update(buffer).digest('hex') !== record.sha256) {
      throw new Error('Saved character image changed.');
    }
    return { buffer, ext: record.ext, mime: record.ext === 'png' ? 'image/png' : 'image/jpeg' };
  }

  return {
    characterDir,
    newest,
    readReferenceManifest,
    referenceIdentity,
    writeReferenceImage,
    frameManifest,
    pendingFrameManifest,
    sequenceMotionResult,
    sequenceIdentityReference,
    saveSequenceFrameManifest,
    previewFrames,
    characterCatalog,
    characterImage,
  };
}
