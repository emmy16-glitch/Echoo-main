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

// LiveKit's tee writes a primary 320-kbps MP3 and a segmented MP3 backup.
// Reserve headroom for the *new* show plus already-active broadcasters.
// This is admission protection for the near future, not a promise that the
// entire indefinite live session is fully provisioned.
export const minimumRecordingFreeBytes = ({
  activeRecordings = 0, bitrateKbps = 320, headroomHours = 2,
} = {}) => {
  const active = Math.max(0, Math.floor(Number(activeRecordings) || 0));
  const bitrate = Math.max(64, Math.min(1024, Number(bitrateKbps) || 320));
  const hours = Math.max(1, Math.min(12, Number(headroomHours) || 2));
  const bytesPerHourPerShow = 2 * bitrate * 1000 / 8 * 3600;
  return Math.ceil(MIN_FREE_BYTES + (active + 1) * bytesPerHourPerShow * hours);
};

const archive = () => path.resolve(process.env.REPLAY_ARCHIVE_DIR ||
  path.join(process.cwd(), 'uploads', 'replay'));

// Externally visible health tells operators only the state, never the NFS path
// or error details. A failed mount must not pass merely because Linux still
// has a writable directory where the mount used to exist.
export async function checkServerRecordingStorageReadiness({
  required = false, activeRecordings = 0,
} = {}) {
  if (!required) return { ready: true, status: 'not-required' };
  const directory = archive();
  const bitrateKbps = Number.parseInt(String(process.env.AUDIO_REPLAY_MP3_BITRATE || '320k'), 10) || 320;
  const headroomHours = Number(process.env.ECHOO_RECORDING_HEADROOM_HOURS) || 2;
  const minimumFreeBytes = minimumRecordingFreeBytes({ activeRecordings, bitrateKbps, headroomHours });
  // The earlier cache also reused a single-show OK result when a second
  // organization's broadcast increased the required shared-disk capacity.
  if (last && last.directory === directory &&
      last.minimumFreeBytes === minimumFreeBytes &&
      Date.now() - last.checkedAt < CACHE_MS) return last.result;
  if (pending?.directory === directory &&
      pending.minimumFreeBytes === minimumFreeBytes) return pending.promise;

  const check = (async () => {
    let ready = false;
    try {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory()) throw new Error('Archive must be a directory');
      const { stdout } = await run('findmnt',
        ['-n', '-T', directory, '-o', 'TARGET'], { timeout: 3500, maxBuffer: 4096 });
      const mount = String(stdout || '').trim();
      if (!mount || mount === '/') throw new Error('Persistent media volume is not mounted');
      const disk = await fs.statfs(directory);
      if (Number(disk.bsize) * Number(disk.bavail) < minimumFreeBytes) {
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
    last = { directory, minimumFreeBytes, checkedAt: Date.now(), result };
    return result;
  })();
  pending = { directory, minimumFreeBytes, promise: check };
  try { return await check; } finally {
    if (pending?.promise === check) pending = null;
  }
}
