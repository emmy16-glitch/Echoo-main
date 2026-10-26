import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CACHE_MS = 30_000;
const MIN_FREE_BYTES = 256 * 1024 * 1024;
let last = null;
let pending = null;

const archive = () => path.resolve(process.env.REPLAY_ARCHIVE_DIR ||
  path.join(process.cwd(), 'uploads', 'replay'));

// Externally visible health tells operators only the state, never the NFS path
// or error details. A failed mount must not pass merely because Linux still
// has a writable directory where the mount used to exist.
export async function checkServerRecordingStorageReadiness({ required = false } = {}) {
  if (!required) return { ready: true, status: 'not-required' };
  const directory = archive();
  if (last && last.directory === directory && Date.now() - last.checkedAt < CACHE_MS) {
    return last.result;
  }
  if (pending) return pending;

  pending = (async () => {
    let ready = false;
    try {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory()) throw new Error('Archive must be a directory');
      const { stdout } = await run('findmnt',
        ['-n', '-T', directory, '-o', 'TARGET'], { timeout: 3500, maxBuffer: 4096 });
      const mount = String(stdout || '').trim();
      if (!mount || mount === '/') throw new Error('Persistent media volume is not mounted');
      const disk = await fs.statfs(directory);
      if (Number(disk.bsize) * Number(disk.bavail) < MIN_FREE_BYTES) {
        throw new Error('Persistent archive is low on free space');
      }
      const probePath = path.join(directory,
        '.echoo-health-' + process.pid + '-' + randomUUID());
      let probe = null;
      try {
        probe = await fs.open(probePath, 'wx', 0o600);
        await probe.writeFile('recording storage writable\n');
        await probe.sync();
        ready = true;
      } finally {
        await probe?.close().catch(() => null);
        await fs.rm(probePath, { force: true }).catch(() => null);
      }
    } catch (error) {
      console.warn('[Echoo Recording] storage readiness degraded:', error?.code || error?.message || error);
    }
    const result = { ready, status: ready ? 'writable-persistent-volume' : 'unavailable' };
    last = { directory, checkedAt: Date.now(), result };
    return result;
  })().finally(() => { pending = null; });
  return pending;
}
