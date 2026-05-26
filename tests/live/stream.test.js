import { describe, it, expect, vi } from 'vitest';
import { StreamClient, fetchStream } from '../../src/live/stream.js';

describe('StreamClient', () => {
  it('initializes with correct defaults', () => {
    const client = new StreamClient('/_live/stream');

    expect(client.endpoint).toBe('/_live/stream');
    expect(client.connected).toBe(false);
    expect(client.source).toBeNull();
    expect(client.reconnectDelay).toBe(1000);
    expect(client.maxReconnects).toBe(5);
    expect(client.reconnectAttempts).toBe(0);
  });

  it('accepts custom options', () => {
    const client = new StreamClient('/stream', {
      reconnectDelay: 2000,
      maxReconnects: 10,
    });

    expect(client.reconnectDelay).toBe(2000);
    expect(client.maxReconnects).toBe(10);
  });

  describe('event system', () => {
    it('registers listeners', () => {
      const client = new StreamClient('/stream');
      const cb = vi.fn();

      client.on('chunk', cb);

      expect(client.listeners.get('chunk')).toContain(cb);
    });

    it('supports chaining on()', () => {
      const client = new StreamClient('/stream');
      const result = client.on('chunk', vi.fn());

      expect(result).toBe(client);
    });

    it('removes listeners', () => {
      const client = new StreamClient('/stream');
      const cb = vi.fn();

      client.on('chunk', cb);
      client.off('chunk', cb);

      expect(client.listeners.get('chunk')).not.toContain(cb);
    });

    it('emits events to listeners', () => {
      const client = new StreamClient('/stream');
      const cb = vi.fn();

      client.on('open', cb);
      client._emit('open', { componentId: 'lc_1', target: 'reply' });

      expect(cb).toHaveBeenCalledWith({
        componentId: 'lc_1',
        target: 'reply',
      });
    });

    it('handles multiple listeners', () => {
      const client = new StreamClient('/stream');
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      client.on('chunk', cb1);
      client.on('chunk', cb2);
      client._emit('chunk', { content: 'Hello' });

      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });

    it('catches listener errors', () => {
      const client = new StreamClient('/stream');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      client.on('chunk', () => { throw new Error('test'); });
      client._emit('chunk', {});

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('handles off for non-existing listener', () => {
      const client = new StreamClient('/stream');
      expect(() => client.off('chunk', vi.fn())).not.toThrow();
    });

    it('handles emit for non-existing event', () => {
      const client = new StreamClient('/stream');
      expect(() => client._emit('nonexistent', {})).not.toThrow();
    });
  });

  describe('disconnect', () => {
    it('sets connected to false', () => {
      const client = new StreamClient('/stream');
      client.connected = true;

      client.disconnect();

      expect(client.connected).toBe(false);
      expect(client.source).toBeNull();
    });

    it('handles disconnect when already disconnected', () => {
      const client = new StreamClient('/stream');
      expect(() => client.disconnect()).not.toThrow();
    });
  });
});

describe('fetchStream', () => {
  it('calls onChunk with streamed data', async () => {
    const chunks = [];
    const encoder = new TextEncoder();

    // Create a mock ReadableStream
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('Hello'));
        controller.enqueue(encoder.encode(' World'));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });

    await fetchStream('/_live/stream', { id: '1' }, (text) => chunks.push(text));

    expect(chunks).toEqual(['Hello', ' World']);
  });

  it('calls onDone when stream completes', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data'));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: stream });

    const onDone = vi.fn();
    await fetchStream('/_live/stream', {}, vi.fn(), onDone);

    expect(onDone).toHaveBeenCalled();
  });

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(
      fetchStream('/stream', {}, vi.fn()),
    ).rejects.toThrow('HTTP 500');
  });
});
