import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient, http, useFetch, useUpload } from './client';

describe('HTTP Client', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    global.AbortController = vi.fn().mockImplementation(() => ({
      abort: vi.fn(),
      signal: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createClient', () => {
    it('should create a client with default config', () => {
      const client = createClient();
      expect(client.defaults.baseURL).toBe('');
      expect(client.defaults.cache).toBe(false);
    });

    it('should create a client with custom config', () => {
      const client = createClient({ baseURL: 'https://api.example.com', timeout: 5000 });
      expect(client.defaults.baseURL).toBe('https://api.example.com');
      expect(client.defaults.timeout).toBe(5000);
    });
  });

  describe('HTTP Methods', () => {
    it('should make a GET request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: () => Promise.resolve('{"data": "test"}'),
        json: () => Promise.resolve({ data: 'test' }),
        clone: () => ({ text: () => Promise.resolve('{"data": "test"}') })
      });

      const response = await http.get('/test');
      
      expect(global.fetch).toHaveBeenCalledWith('/test', expect.objectContaining({
        method: 'GET'
      }));
      expect(response.data).toEqual({ data: 'test' });
    });

    it('should make a POST request with body', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          status: 201,
          statusText: 'Created',
          headers: new Map(),
          text: () => Promise.resolve('{"id": 1}'),
          json: () => Promise.resolve({ id: 1 }),
          clone: () => ({ text: () => Promise.resolve('{"id": 1}') })
        });
  
        const data = { name: 'test' };
        await http.post('/test', data);
        
        expect(global.fetch).toHaveBeenCalledWith('/test', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data)
        }));
    });

    it('should handle errors', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            headers: new Map(),
            text: () => Promise.resolve('{"error": "not found"}'),
            json: () => Promise.resolve({ error: 'not found' }),
            clone: () => ({ text: () => Promise.resolve('{"error": "not found"}') })
        });

        await expect(http.get('/test')).rejects.toThrow('HTTP 404: Not Found');
    });
  });

  describe('useFetch', () => {
      it('should initialize with default state', () => {
          const { data, error, isLoading } = useFetch('/test', { immediate: false });
          expect(data.value).toBeNull();
          expect(error.value).toBeNull();
          expect(isLoading.value).toBe(false);
      });

      // Need to mock fetch implementation for execute to work
      it('should update state on successful request', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Map(),
            text: () => Promise.resolve('{"success": true}'),
            json: () => Promise.resolve({ success: true }),
            clone: () => ({ text: () => Promise.resolve('{"success": true}') })
        });

        const { execute, data, isLoading, isSuccess } = useFetch('/test', { immediate: false });
        
        // Execute returns a promise
        const promise = execute();
        
        // Check loading state (might be tricky due to async nature, but let's try)
        // Since execute is async, state updates happen inside.
        
        await promise;

        expect(data.value).toEqual({ success: true });
        expect(isLoading.value).toBe(false);
        expect(isSuccess.value).toBe(true);
      });
  });

  describe('useUpload', () => {
    let mockXHR;
    
    beforeEach(() => {
      mockXHR = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        abort: vi.fn(),
        upload: { onprogress: null },
        onload: null,
        onerror: null,
        onabort: null,
        status: 200,
        responseText: '{"success":true}'
      };
      
      global.XMLHttpRequest = vi.fn(() => mockXHR);
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should upload file and track progress', async () => {
      const { upload, progress, data, isUploading } = useUpload('https://api.example.com/upload');
      
      const uploadPromise = upload(new Blob(['content']), { fieldName: 'file' });
      
      expect(isUploading.value).toBe(true);
      expect(mockXHR.open).toHaveBeenCalledWith('POST', 'https://api.example.com/upload');
      
      // Simulate progress
      mockXHR.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
      expect(progress.value).toBe(50);
      
      // Simulate complete
      mockXHR.onload();
      await uploadPromise;
      
      expect(progress.value).toBe(100);
      expect(isUploading.value).toBe(false);
      expect(data.value).toEqual({ success: true });
    });
    
    it('should handle errors', async () => {
        const { upload, error } = useUpload('https://api.example.com/upload');
        
        mockXHR.status = 500;
        mockXHR.statusText = 'Server Error';
        
        try {
            const p = upload(new Blob(['']));
            mockXHR.onload();
            await p;
        } catch (e) {
            expect(error.value.message).toContain('Upload failed: Server Error');
        }
    });
  });
});
