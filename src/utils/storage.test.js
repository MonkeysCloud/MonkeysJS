import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useLocalStorage, createMemoryStorage } from './storage';
import { ref } from '../core/reactive';

describe('Storage Utils', () => {
    // Mock local storage
    let store = {};
    
    beforeEach(() => {
        localStorage.clear();
        // Mock window event listener dispatch if possible or just ignore (it's hard to mock addEventListener on jsdom window without stubbing)
        // Actually, jsdom supports events.
    });

    it('should useLocalStorage', async () => {
        const value = useLocalStorage('test-key', 'default');
        
        expect(value.value).toBe('default');
        
        value.value = 'updated';
        // Watch might be cached/microtask
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(localStorage.getItem('test-key')).toBe('updated');
    });

    it('should load existing value', () => {
        localStorage.setItem('existing', '"saved"');
        const value = useLocalStorage('existing', 'default');
        
        expect(value.value).toBe('saved');
    });

    it('should use memory storage fallback', () => {
        const memoryAdapter = createMemoryStorage();
        memoryAdapter.set('key', 'val');
        expect(memoryAdapter.get('key')).toBe('val');
    });
});
