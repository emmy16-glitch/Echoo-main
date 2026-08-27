export class TranscriptUploadQueue {
  constructor({ upload, maxItems = 200, maxAttempts = 5, retryBaseMs = 500 } = {}) {
    if (typeof upload !== 'function') throw new Error('TranscriptUploadQueue requires an upload function.');
    this.upload = upload;
    this.maxItems = maxItems;
    this.maxAttempts = maxAttempts;
    this.retryBaseMs = retryBaseMs;
    this.items = new Map();
    this.order = [];
    this.draining = false;
    this.stopped = false;
  }

  enqueue(segment) {
    if (this.stopped || !segment?.providerSegmentId) return false;
    const key = String(segment.providerSegmentId);
    const existing = this.items.get(key);
    const entry = {
      segment: { ...(existing?.segment || {}), ...segment },
      attempts: existing?.attempts || 0,
    };
    this.items.set(key, entry);
    if (!existing) this.order.push(key);
    while (this.order.length > this.maxItems) {
      const oldest = this.order.shift();
      if (oldest) this.items.delete(oldest);
    }
    void this.drain();
    return true;
  }

  async drain() {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      while (!this.stopped && this.order.length) {
        const key = this.order[0];
        const current = this.items.get(key);
        if (!current) {
          this.order.shift();
          continue;
        }
        try {
          const snapshot = current.segment;
          await this.upload(snapshot);
          // If a newer revision arrived while this upload was in flight, keep
          // the key queued and upload the newer snapshot instead of dropping it.
          const latest = this.items.get(key);
          if (latest && latest.segment !== snapshot && latest.segment.providerRevision !== snapshot.providerRevision) {
            latest.attempts = 0;
            continue;
          }
          this.items.delete(key);
          this.order.shift();
        } catch {
          const latest = this.items.get(key);
          if (!latest) {
            this.order.shift();
            continue;
          }
          latest.attempts += 1;
          if (latest.attempts >= this.maxAttempts) {
            this.items.delete(key);
            this.order.shift();
            continue;
          }
          const delay = Math.min(8000, this.retryBaseMs * (2 ** (latest.attempts - 1)));
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    } finally {
      this.draining = false;
    }
  }

  async flush({ timeoutMs = 5000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (this.order.length && Date.now() < deadline) {
      await this.drain();
      if (this.order.length) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return this.order.length === 0;
  }

  stop() {
    this.stopped = true;
  }

  get size() {
    return this.order.length;
  }
}

export default TranscriptUploadQueue;
