import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCsrfToken, generateId, parseModifiers, parseDuration,
  debounce, throttle, deepEqual,
  findComponentRoot, getComponentId, isOffline,
  setByPath, getByPath,
} from '../../src/live/utils.js';

describe('generateId', () => {
  it('generates a string starting with lc_', () => {
    const id = generateId();
    expect(id).toMatch(/^lc_[a-f0-9]+$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('returns 12-hex-char suffix (6 bytes)', () => {
    const id = generateId();
    expect(id.length).toBe(3 + 12); // 'lc_' + 12 hex chars
  });
});

describe('getCsrfToken', () => {
  it('reads from meta tag', () => {
    document.head.innerHTML = '<meta name="csrf-token" content="test-token-123">';
    expect(getCsrfToken()).toBe('test-token-123');
  });

  it('returns empty string when no meta tag', () => {
    document.head.innerHTML = '';
    expect(getCsrfToken()).toBe('');
  });

  it('returns empty string when content is empty', () => {
    document.head.innerHTML = '<meta name="csrf-token" content="">';
    expect(getCsrfToken()).toBe('');
  });
});

describe('parseModifiers', () => {
  it('parses plain directive', () => {
    const result = parseModifiers('ml:model');
    expect(result.name).toBe('model');
    expect(result.modifiers).toEqual([]);
    expect(result.eventName).toBeNull();
  });

  it('parses directive with one modifier', () => {
    const result = parseModifiers('ml:model.live');
    expect(result.name).toBe('model');
    expect(result.modifiers).toEqual(['live']);
  });

  it('parses directive with multiple modifiers', () => {
    const result = parseModifiers('ml:model.live.debounce.300ms');
    expect(result.name).toBe('model');
    expect(result.modifiers).toEqual(['live', 'debounce', '300ms']);
  });

  it('detects event names', () => {
    expect(parseModifiers('ml:click').eventName).toBe('click');
    expect(parseModifiers('ml:submit').eventName).toBe('submit');
    expect(parseModifiers('ml:keydown').eventName).toBe('keydown');
    expect(parseModifiers('ml:change').eventName).toBe('change');
  });

  it('does not flag non-event directives', () => {
    expect(parseModifiers('ml:model').eventName).toBeNull();
    expect(parseModifiers('ml:loading').eventName).toBeNull();
    expect(parseModifiers('ml:poll').eventName).toBeNull();
  });

  it('handles event with modifiers', () => {
    const result = parseModifiers('ml:keydown.enter');
    expect(result.name).toBe('keydown');
    expect(result.modifiers).toEqual(['enter']);
    expect(result.eventName).toBe('keydown');
  });

  it('handles string without ml: prefix', () => {
    const result = parseModifiers('model.live');
    expect(result.name).toBe('model');
    expect(result.modifiers).toEqual(['live']);
  });
});

describe('parseDuration', () => {
  it('parses milliseconds', () => {
    expect(parseDuration('300ms')).toBe(300);
    expect(parseDuration('0ms')).toBe(0);
    expect(parseDuration('1000ms')).toBe(1000);
  });

  it('parses seconds', () => {
    expect(parseDuration('1s')).toBe(1000);
    expect(parseDuration('0.5s')).toBe(500);
    expect(parseDuration('1.5s')).toBe(1500);
  });

  it('defaults to integer ms', () => {
    expect(parseDuration('500')).toBe(500);
  });

  it('defaults to 300 for invalid', () => {
    expect(parseDuration('invalid')).toBe(300);
  });
});

describe('debounce', () => {
  it('returns a function', () => {
    const debounced = debounce(() => {}, 100);
    expect(typeof debounced).toBe('function');
  });

  it('delays execution', async () => {
    let called = false;
    const debounced = debounce(() => { called = true; }, 50);

    debounced();
    expect(called).toBe(false);

    await new Promise(r => setTimeout(r, 100));
    expect(called).toBe(true);
  });

  it('only fires once for rapid calls', async () => {
    let count = 0;
    const debounced = debounce(() => { count++; }, 50);

    debounced();
    debounced();
    debounced();

    await new Promise(r => setTimeout(r, 100));
    expect(count).toBe(1);
  });

  it('passes arguments through', async () => {
    let received;
    const debounced = debounce((a, b) => { received = [a, b]; }, 50);

    debounced('x', 'y');
    await new Promise(r => setTimeout(r, 100));

    expect(received).toEqual(['x', 'y']);
  });
});

describe('throttle', () => {
  it('returns a function', () => {
    const throttled = throttle(() => {}, 100);
    expect(typeof throttled).toBe('function');
  });

  it('executes immediately on first call', () => {
    let called = false;
    const throttled = throttle(() => { called = true; }, 100);

    throttled();
    expect(called).toBe(true);
  });

  it('blocks rapid calls within limit', () => {
    let count = 0;
    const throttled = throttle(() => { count++; }, 100);

    throttled();
    throttled();
    throttled();

    expect(count).toBe(1);
  });
});

describe('deepEqual', () => {
  it('compares primitives', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'b')).toBe(false);
  });

  it('compares objects', () => {
    expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('compares nested objects', () => {
    expect(deepEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } })).toBe(true);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it('compares arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 3])).toBe(false);
    expect(deepEqual([1, 2], [1])).toBe(false);
    expect(deepEqual([], [])).toBe(true);
  });

  it('compares mixed', () => {
    expect(deepEqual({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(deepEqual([{ x: 1 }], [{ x: 1 }])).toBe(true);
  });

  it('handles null/undefined', () => {
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(null, 0)).toBe(false);
    expect(deepEqual(undefined, '')).toBe(false);
  });

  it('handles different types', () => {
    expect(deepEqual(1, '1')).toBe(false);
    expect(deepEqual([], {})).toBe(false);
  });
});

describe('findComponentRoot', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds closest component root', () => {
    document.body.innerHTML = '<div data-ml-id="lc_1"><span id="child">text</span></div>';
    const child = document.getElementById('child');
    const root = findComponentRoot(child);

    expect(root).not.toBeNull();
    expect(root.getAttribute('data-ml-id')).toBe('lc_1');
  });

  it('returns null when no component root', () => {
    document.body.innerHTML = '<div><span id="orphan">text</span></div>';
    const child = document.getElementById('orphan');

    expect(findComponentRoot(child)).toBeNull();
  });

  it('returns self if element is the root', () => {
    document.body.innerHTML = '<div data-ml-id="lc_1" id="root"></div>';
    const root = document.getElementById('root');

    expect(findComponentRoot(root)).toBe(root);
  });
});

describe('getComponentId', () => {
  it('returns the data-ml-id value', () => {
    const el = document.createElement('div');
    el.setAttribute('data-ml-id', 'lc_42');

    expect(getComponentId(el)).toBe('lc_42');
  });

  it('returns null when no attribute', () => {
    const el = document.createElement('div');
    expect(getComponentId(el)).toBeNull();
  });
});

describe('setByPath', () => {
  it('sets a top-level value', () => {
    const obj = {};
    setByPath(obj, 'name', 'Alice');
    expect(obj.name).toBe('Alice');
  });

  it('sets a nested value', () => {
    const obj = { user: {} };
    setByPath(obj, 'user.name', 'Bob');
    expect(obj.user.name).toBe('Bob');
  });

  it('creates intermediate objects', () => {
    const obj = {};
    setByPath(obj, 'a.b.c', 42);
    expect(obj.a.b.c).toBe(42);
  });

  it('overwrites non-object intermediate', () => {
    const obj = { a: 'string' };
    setByPath(obj, 'a.b', 1);
    expect(obj.a.b).toBe(1);
  });
});

describe('getByPath', () => {
  it('gets a top-level value', () => {
    expect(getByPath({ name: 'Alice' }, 'name')).toBe('Alice');
  });

  it('gets a nested value', () => {
    expect(getByPath({ user: { name: 'Bob' } }, 'user.name')).toBe('Bob');
  });

  it('returns undefined for missing path', () => {
    expect(getByPath({ a: 1 }, 'b.c')).toBeUndefined();
  });

  it('returns undefined from null intermediate', () => {
    expect(getByPath({ a: null }, 'a.b')).toBeUndefined();
  });
});

describe('isOffline', () => {
  it('returns a boolean', () => {
    expect(typeof isOffline()).toBe('boolean');
  });
});
