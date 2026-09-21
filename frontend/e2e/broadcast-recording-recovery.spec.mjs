import { expect, test } from 'playwright/test';

test('checkpointed OPFS master survives a simulated page restart and remains disposable', async ({ page }) => {
  await page.goto('/login');
  const supported = await page.evaluate(() => typeof navigator.storage?.getDirectory === 'function');
  test.skip(!supported, 'This browser does not expose OPFS');

  const seeded = await page.evaluate(async () => {
    const storageName = 'echoo-tmp-e2e-crash-recovery.wav';
    const sampleRate = 48000;
    const dataBytes = sampleRate * 2 * 3; // one second, stereo 24-bit PCM
    const header = new Uint8Array(44);
    const view = new DataView(header.buffer);
    const text = (offset, value) => [...value].forEach((character, index) => {
      view.setUint8(offset + index, character.charCodeAt(0));
    });
    text(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 6, true);
    view.setUint16(32, 6, true);
    view.setUint16(34, 24, true);
    text(36, 'data');
    view.setUint32(40, dataBytes, true);

    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle('echoo-live-recordings', { create: true });
    await directory.removeEntry(storageName).catch(() => {});
    const handle = await directory.getFileHandle(storageName, { create: true });
    const writer = await handle.createWritable();
    await writer.write(header);
    await writer.write(new Uint8Array(dataBytes));
    await writer.close();
    localStorage.setItem('echoo:recoverable-broadcast-recording:v1', JSON.stringify({
      version: 1,
      status: 'recovery_required',
      broadcastId: '507f1f77bcf86cd799439088',
      title: 'Crash recovery E2E',
      storageName,
      startedAt: Date.now() - 1000,
      sampleRate,
      dataBytes,
    }));
    return { storageName, dataBytes };
  });

  await page.reload();
  const recovered = await page.evaluate(async () => {
    const service = await import('/src/services/broadcastRecordingService.js');
    const recording = await service.recoverPendingBroadcastRecording();
    const snapshot = recording && {
      size: recording.blob.size,
      durationSeconds: recording.durationSeconds,
      lossless: recording.lossless,
      recoveredAfterRestart: recording.recoveredAfterRestart,
    };
    await recording?.dispose?.();
    return {
      snapshot,
      manifest: localStorage.getItem('echoo:recoverable-broadcast-recording:v1'),
    };
  });

  expect(recovered.snapshot).toMatchObject({
    size: seeded.dataBytes + 44,
    lossless: true,
    recoveredAfterRestart: true,
  });
  expect(recovered.snapshot.durationSeconds).toBeCloseTo(1, 4);
  expect(recovered.manifest).toBeNull();
});
