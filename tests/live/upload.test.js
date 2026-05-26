import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadFile } from '../../src/live/upload.js';

describe('uploadFile', () => {
  let mockFile;

  beforeEach(() => {
    document.head.innerHTML = '<meta name="csrf-token" content="test-csrf">';

    // Create a mock File (jsdom supports basic File API)
    const blob = new Blob(['x'.repeat(100)], { type: 'image/jpeg' });
    mockFile = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  });

  it('sends chunks to endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await uploadFile(mockFile, 'lc_1', 'avatar', {
      chunkSize: 50, // small chunks to test multiple
    });

    // Should have called fetch multiple times (100 bytes / 50 byte chunks = 2)
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onProgress', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    const progressValues = [];
    await uploadFile(mockFile, 'lc_1', 'avatar', {
      chunkSize: 50,
      onProgress: (p) => progressValues.push(p),
    });

    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  it('calls onComplete', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    const onComplete = vi.fn();
    await uploadFile(mockFile, 'lc_1', 'avatar', { onComplete });

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'photo.jpg',
      fileType: 'image/jpeg',
      fileSize: 100,
    }));
  });

  it('returns upload result', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    const result = await uploadFile(mockFile, 'lc_1', 'avatar');

    expect(result).toHaveProperty('uploadId');
    expect(result.fileName).toBe('photo.jpg');
    expect(result.fileType).toBe('image/jpeg');
    expect(result.fileSize).toBe(100);
  });

  it('dispatches ml:upload-progress events', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    const handler = vi.fn();
    document.addEventListener('ml:upload-progress', handler);

    await uploadFile(mockFile, 'lc_1', 'avatar');

    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail.componentId).toBe('lc_1');
    expect(handler.mock.calls[0][0].detail.property).toBe('avatar');

    document.removeEventListener('ml:upload-progress', handler);
  });

  it('dispatches ml:upload-complete event', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    const handler = vi.fn();
    document.addEventListener('ml:upload-complete', handler);

    await uploadFile(mockFile, 'lc_1', 'avatar');

    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail.fileName).toBe('photo.jpg');

    document.removeEventListener('ml:upload-complete', handler);
  });

  it('calls onError on failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: () => Promise.resolve({ error: 'Too large' }),
    });

    const onError = vi.fn();

    await expect(
      uploadFile(mockFile, 'lc_1', 'avatar', { onError }),
    ).rejects.toThrow('Too large');

    expect(onError).toHaveBeenCalled();
  });

  it('sends CSRF token in headers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await uploadFile(mockFile, 'lc_1', 'avatar');

    const headers = fetch.mock.calls[0][1].headers;
    expect(headers['X-CSRF-Token']).toBe('test-csrf');
    expect(headers['X-ML-Live']).toBe('1.0');
  });

  it('sends correct FormData fields', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await uploadFile(mockFile, 'lc_1', 'avatar');

    const body = fetch.mock.calls[0][1].body;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('componentId')).toBe('lc_1');
    expect(body.get('property')).toBe('avatar');
    expect(body.get('fileName')).toBe('photo.jpg');
    expect(body.get('fileType')).toBe('image/jpeg');
  });
});
