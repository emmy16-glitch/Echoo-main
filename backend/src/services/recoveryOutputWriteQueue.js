// Serializes upload-driven writes for ONE broadcast. It never touches LiveKit
// publishing or listener audio; only optional post-live encoding sinks.
export const createOrderedOutputQueue = () => {
  let tail = Promise.resolve();
  let closed = false;
  return {
    append(task) {
      if (closed) return Promise.reject(new Error('Recording output is closing'));
      const next = tail.catch(() => null).then(task);
      tail = next;
      return next;
    },
    async close() {
      closed = true;
      await tail.catch(() => null);
    },
  };
};
