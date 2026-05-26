import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Wire } from '../../src/live/wire.js';

describe('Wire', () => {
  let wire;

  beforeEach(() => {
    wire = new Wire('/_live');
    vi.useFakeTimers();
  });

  afterEach(() => {
    wire.cancel();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('sets default endpoint', () => {
      expect(wire.endpoint).toBe('/_live');
    });

    it('accepts custom endpoint', () => {
      const w = new Wire('/api/live');
      expect(w.endpoint).toBe('/api/live');
    });

    it('starts with empty queue', () => {
      expect(wire.queue.size).toBe(0);
    });

    it('has 5ms batch delay', () => {
      expect(wire.batchDelay).toBe(5);
    });
  });

  describe('queueUpdate', () => {
    it('adds entry to queue', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: {}, checksum: 'x' };
      wire.queueUpdate('lc_1', 'count', 5, snapshot);

      expect(wire.queue.has('lc_1')).toBe(true);
      expect(wire.queue.get('lc_1').updates.count).toBe(5);
    });

    it('batches multiple updates for same component', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: {}, checksum: 'x' };
      wire.queueUpdate('lc_1', 'count', 5, snapshot);
      wire.queueUpdate('lc_1', 'step', 2, snapshot);

      expect(wire.queue.size).toBe(1);
      const entry = wire.queue.get('lc_1');
      expect(entry.updates.count).toBe(5);
      expect(entry.updates.step).toBe(2);
    });

    it('creates separate entries per component', () => {
      wire.queueUpdate('lc_1', 'count', 1, { id: 'lc_1' });
      wire.queueUpdate('lc_2', 'name', 'x', { id: 'lc_2' });

      expect(wire.queue.size).toBe(2);
    });
  });

  describe('queueAction', () => {
    it('adds call to queue', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: {} };
      wire.queueAction('lc_1', 'increment', [], snapshot);

      expect(wire.queue.get('lc_1').calls).toEqual([
        { method: 'increment', args: [] },
      ]);
    });

    it('batches multiple actions', () => {
      const snapshot = { id: 'lc_1' };
      wire.queueAction('lc_1', 'increment', [], snapshot);
      wire.queueAction('lc_1', 'save', [42], snapshot);

      const entry = wire.queue.get('lc_1');
      expect(entry.calls).toHaveLength(2);
      expect(entry.calls[1]).toEqual({ method: 'save', args: [42] });
    });
  });

  describe('onResponse / offResponse', () => {
    it('registers callback', () => {
      const cb = vi.fn();
      wire.onResponse('lc_1', cb);
      expect(wire.callbacks.has('lc_1')).toBe(true);
    });

    it('removes callback', () => {
      wire.onResponse('lc_1', vi.fn());
      wire.offResponse('lc_1');
      expect(wire.callbacks.has('lc_1')).toBe(false);
    });
  });

  describe('isLoading', () => {
    it('returns false by default', () => {
      expect(wire.isLoading('lc_1')).toBe(false);
    });

    it('reflects loading state', () => {
      wire.loading.set('lc_1', true);
      expect(wire.isLoading('lc_1')).toBe(true);
    });
  });

  describe('cancel', () => {
    it('clears queue', () => {
      wire.queueUpdate('lc_1', 'x', 1, {});
      expect(wire.queue.size).toBe(1);

      wire.cancel();
      expect(wire.queue.size).toBe(0);
    });

    it('clears flush timer', () => {
      wire.queueUpdate('lc_1', 'x', 1, {});
      expect(wire.flushTimer).not.toBeNull();

      wire.cancel();
      expect(wire.flushTimer).toBeNull();
    });
  });

  describe('flush', () => {
    it('clears queue after flush', async () => {
      // Mock fetch
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'lc_1', state: {}, checksum: 'y' }),
      });

      wire.queueUpdate('lc_1', 'count', 1, { component: 'C', id: 'lc_1', state: {}, checksum: 'x' });
      await wire.flush();

      expect(wire.queue.size).toBe(0);
    });

    it('sends POST to endpoint', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      document.head.innerHTML = '<meta name="csrf-token" content="csrf-tok">';

      wire.queueAction('lc_1', 'save', [], { component: 'C', id: 'lc_1', state: {}, checksum: 'x' });
      await wire.flush();

      expect(fetch).toHaveBeenCalledWith('/_live', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-ML-Live': '1.0',
        }),
      }));
    });

    it('invokes response callback', async () => {
      const cb = vi.fn();
      wire.onResponse('lc_1', cb);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'lc_1', html: '<div>1</div>' }),
      });

      wire.queueAction('lc_1', 'increment', [], { component: 'C', id: 'lc_1', state: {}, checksum: 'x' });
      await wire.flush();

      expect(cb).toHaveBeenCalledWith({ id: 'lc_1', html: '<div>1</div>' });
    });

    it('dispatches ml:wire-error on fetch failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network fail'));

      const errorHandler = vi.fn();
      document.addEventListener('ml:wire-error', errorHandler);

      wire.queueAction('lc_1', 'x', [], { component: 'C', id: 'lc_1', state: {}, checksum: 'x' });
      await wire.flush();

      expect(errorHandler).toHaveBeenCalled();
      document.removeEventListener('ml:wire-error', errorHandler);
    });

    it('dispatches ml:loading events', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const loadingEvents = [];
      const handler = (e) => loadingEvents.push(e.detail);
      document.addEventListener('ml:loading', handler);

      wire.queueAction('lc_1', 'x', [], { component: 'C', id: 'lc_1', state: {}, checksum: 'x' });
      await wire.flush();

      expect(loadingEvents).toEqual([
        { componentId: 'lc_1', loading: true },
        { componentId: 'lc_1', loading: false },
      ]);

      document.removeEventListener('ml:loading', handler);
    });
  });
});
