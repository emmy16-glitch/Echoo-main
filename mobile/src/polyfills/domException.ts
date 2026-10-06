const globalScope = globalThis as typeof globalThis & { DOMException?: unknown };

if (typeof globalScope.DOMException === 'undefined') {
  (globalScope as any).DOMException = class DOMException extends Error {
    constructor(message = '', name = 'Error') {
      super(message);
      this.name = name;
    }
  };
}
