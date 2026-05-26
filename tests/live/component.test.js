import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentManager } from '../../src/live/component.js';
import { Wire } from '../../src/live/wire.js';

// Minimal mock for processDirectives (imported in component.js)
vi.mock('../../src/live/directives.js', () => ({
  processDirectives: vi.fn(),
}));

describe('ComponentManager', () => {
  let wire, manager;

  beforeEach(() => {
    document.body.innerHTML = '';
    wire = new Wire('/_live');
    manager = new ComponentManager(wire);
  });

  describe('mount', () => {
    it('mounts from DOM element with snapshot', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: { count: 0 }, checksum: 'abc' };
      document.body.innerHTML = `<div data-ml-id="lc_1" data-ml-component="Counter" data-ml-snapshot='${JSON.stringify(snapshot)}'><p>Count: 0</p></div>`;

      const el = document.querySelector('[data-ml-id]');
      manager.mount(el);

      expect(manager.components.has('lc_1')).toBe(true);
    });

    it('skips if already mounted', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: {}, checksum: 'abc' };
      document.body.innerHTML = `<div data-ml-id="lc_1" data-ml-snapshot='${JSON.stringify(snapshot)}'></div>`;

      const el = document.querySelector('[data-ml-id]');
      manager.mount(el);
      manager.mount(el); // second call should be no-op

      expect(manager.components.size).toBe(1);
    });

    it('skips if no snapshot attribute', () => {
      document.body.innerHTML = '<div data-ml-id="lc_1"></div>';
      const el = document.querySelector('[data-ml-id]');

      manager.mount(el);

      expect(manager.components.has('lc_1')).toBe(false);
    });

    it('skips if no data-ml-id', () => {
      document.body.innerHTML = '<div></div>';
      const el = document.querySelector('div');

      manager.mount(el);

      expect(manager.components.size).toBe(0);
    });

    it('handles invalid JSON gracefully', () => {
      document.body.innerHTML = '<div data-ml-id="lc_1" data-ml-snapshot="not-json"></div>';
      const el = document.querySelector('[data-ml-id]');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      manager.mount(el);

      expect(manager.components.has('lc_1')).toBe(false);
      spy.mockRestore();
    });

    it('dispatches ml:mounted event', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: {}, checksum: 'abc' };
      document.body.innerHTML = `<div data-ml-id="lc_1" data-ml-snapshot='${JSON.stringify(snapshot)}'></div>`;

      const el = document.querySelector('[data-ml-id]');
      const handler = vi.fn();
      el.addEventListener('ml:mounted', handler);

      manager.mount(el);

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].detail.componentId).toBe('lc_1');
    });
  });

  describe('destroy', () => {
    it('removes component', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: {}, checksum: 'abc' };
      document.body.innerHTML = `<div data-ml-id="lc_1" data-ml-snapshot='${JSON.stringify(snapshot)}'></div>`;

      manager.mount(document.querySelector('[data-ml-id]'));
      expect(manager.components.size).toBe(1);

      manager.destroy('lc_1');
      expect(manager.components.size).toBe(0);
    });

    it('handles destroy of non-existing component', () => {
      expect(() => manager.destroy('lc_nonexistent')).not.toThrow();
    });

    it('dispatches ml:destroyed event', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: {}, checksum: 'abc' };
      document.body.innerHTML = `<div data-ml-id="lc_1" data-ml-snapshot='${JSON.stringify(snapshot)}'></div>`;

      const el = document.querySelector('[data-ml-id]');
      manager.mount(el);

      const handler = vi.fn();
      el.addEventListener('ml:destroyed', handler);

      manager.destroy('lc_1');

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('destroyAll', () => {
    it('destroys all components', () => {
      const s1 = { component: 'A', id: 'lc_1', state: {}, checksum: 'a' };
      const s2 = { component: 'B', id: 'lc_2', state: {}, checksum: 'b' };
      document.body.innerHTML = `
        <div data-ml-id="lc_1" data-ml-snapshot='${JSON.stringify(s1)}'></div>
        <div data-ml-id="lc_2" data-ml-snapshot='${JSON.stringify(s2)}'></div>
      `;

      document.querySelectorAll('[data-ml-id]').forEach(el => manager.mount(el));
      expect(manager.components.size).toBe(2);

      manager.destroyAll();
      expect(manager.components.size).toBe(0);
    });
  });

  describe('updateProperty', () => {
    it('queues wire update', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: { count: 0 }, checksum: 'abc' };
      document.body.innerHTML = `<div data-ml-id="lc_1" data-ml-snapshot='${JSON.stringify(snapshot)}'></div>`;

      manager.mount(document.querySelector('[data-ml-id]'));

      const spy = vi.spyOn(wire, 'queueUpdate');
      manager.updateProperty('lc_1', 'count', 5);

      expect(spy).toHaveBeenCalledWith('lc_1', 'count', 5, expect.any(Object));
    });

    it('marks property dirty', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: { count: 0 }, checksum: 'abc' };
      document.body.innerHTML = `<div data-ml-id="lc_1" data-ml-snapshot='${JSON.stringify(snapshot)}'></div>`;

      manager.mount(document.querySelector('[data-ml-id]'));
      manager.updateProperty('lc_1', 'count', 5);

      const instance = manager.get('lc_1');
      expect(instance.dirtyState.count).toBe(5);
    });

    it('handles non-existing component gracefully', () => {
      expect(() => manager.updateProperty('lc_nonexistent', 'x', 1)).not.toThrow();
    });
  });

  describe('callAction', () => {
    it('queues wire action', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: {}, checksum: 'abc' };
      document.body.innerHTML = `<div data-ml-id="lc_1" data-ml-snapshot='${JSON.stringify(snapshot)}'></div>`;

      manager.mount(document.querySelector('[data-ml-id]'));

      const spy = vi.spyOn(wire, 'queueAction');
      manager.callAction('lc_1', 'increment', []);

      expect(spy).toHaveBeenCalledWith('lc_1', 'increment', [], expect.any(Object));
    });

    it('handles non-existing component gracefully', () => {
      expect(() => manager.callAction('lc_nonexistent', 'x')).not.toThrow();
    });
  });

  describe('refresh', () => {
    it('sends $refresh action', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: {}, checksum: 'abc' };
      document.body.innerHTML = `<div data-ml-id="lc_1" data-ml-snapshot='${JSON.stringify(snapshot)}'></div>`;

      manager.mount(document.querySelector('[data-ml-id]'));

      const spy = vi.spyOn(wire, 'queueAction');
      manager.refresh('lc_1');

      expect(spy).toHaveBeenCalledWith('lc_1', '$refresh', [], expect.any(Object));
    });
  });

  describe('get', () => {
    it('returns component instance', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: {}, checksum: 'abc' };
      document.body.innerHTML = `<div data-ml-id="lc_1" data-ml-snapshot='${JSON.stringify(snapshot)}'></div>`;

      manager.mount(document.querySelector('[data-ml-id]'));

      expect(manager.get('lc_1')).toBeDefined();
      expect(manager.get('lc_1').id).toBe('lc_1');
    });

    it('returns undefined for non-existing', () => {
      expect(manager.get('lc_nonexistent')).toBeUndefined();
    });
  });
});

describe('ComponentInstance', () => {
  let wire, manager;

  beforeEach(() => {
    document.body.innerHTML = '';
    wire = new Wire('/_live');
    manager = new ComponentManager(wire);
  });

  describe('handleResponse', () => {
    function mountComponent() {
      const snapshot = { component: 'Counter', id: 'lc_1', state: { count: 0 }, checksum: 'abc', meta: {} };
      document.body.innerHTML = `<div data-ml-id="lc_1" data-ml-snapshot='${JSON.stringify(snapshot)}'><p>Count: 0</p></div>`;
      manager.mount(document.querySelector('[data-ml-id]'));
      return manager.get('lc_1');
    }

    it('updates snapshot on response', () => {
      const instance = mountComponent();

      instance.handleResponse({
        id: 'lc_1',
        type: 'full',
        html: '<p>Count: 5</p>',
        state: { count: 5 },
        checksum: 'new-checksum',
        effects: {},
      });

      expect(instance.snapshot.checksum).toBe('new-checksum');
      expect(instance.state.count).toBe(5);
    });

    it('clears dirty state after response', () => {
      const instance = mountComponent();
      instance.dirtyState = { count: 99 };

      instance.handleResponse({
        id: 'lc_1',
        type: 'none',
        state: { count: 5 },
        checksum: 'x',
        effects: {},
      });

      expect(instance.dirtyState).toEqual({});
    });

    it('applies streams effects', () => {
      const instance = mountComponent();
      instance.root.innerHTML = '<p>Count: 0</p><div data-ml-stream="reply"></div>';

      instance.handleResponse({
        id: 'lc_1',
        type: 'none',
        state: { count: 0 },
        checksum: 'x',
        effects: {
          streams: [
            { target: 'reply', content: 'Hello AI', mode: 'replace', chunks: ['Hello AI'] },
          ],
        },
      });

      expect(instance.root.querySelector('[data-ml-stream="reply"]').innerHTML).toBe('Hello AI');
    });

    it('handles redirect effect', () => {
      const instance = mountComponent();

      // Mock window.location
      delete window.location;
      window.location = { href: '' };

      instance.handleResponse({
        id: 'lc_1',
        type: 'none',
        state: {},
        checksum: 'x',
        effects: { redirect: { url: '/dashboard' } },
      });

      expect(window.location.href).toBe('/dashboard');
    });

    it('dispatches browser events from effects', () => {
      const instance = mountComponent();
      const handler = vi.fn();
      instance.root.addEventListener('confetti', handler);

      instance.handleResponse({
        id: 'lc_1',
        type: 'none',
        state: {},
        checksum: 'x',
        effects: {
          dispatch: [{ event: 'confetti', detail: { count: 50 } }],
        },
      });

      expect(handler).toHaveBeenCalled();
    });

    it('dispatches ml:updated event', () => {
      const instance = mountComponent();
      const handler = vi.fn();
      instance.root.addEventListener('ml:updated', handler);

      instance.handleResponse({
        id: 'lc_1',
        type: 'none',
        state: {},
        checksum: 'x',
        effects: {},
      });

      expect(handler).toHaveBeenCalled();
    });

    it('removes data-ml-lazy after first response', () => {
      const snapshot = { component: 'Counter', id: 'lc_lazy', state: {}, checksum: 'abc', meta: {} };
      document.body.innerHTML = `<div data-ml-id="lc_lazy" data-ml-lazy="true" data-ml-snapshot='${JSON.stringify(snapshot)}'></div>`;
      manager.mount(document.querySelector('[data-ml-id]'));
      const instance = manager.get('lc_lazy');

      instance.handleResponse({
        id: 'lc_lazy',
        type: 'full',
        html: '<p>Loaded!</p>',
        state: {},
        checksum: 'x',
        effects: {},
      });

      expect(instance.root.hasAttribute('data-ml-lazy')).toBe(false);
    });

    it('shows validation errors', () => {
      const instance = mountComponent();
      instance.root.innerHTML = '<input><span data-ml-error="email" style="display:none"></span>';

      instance.handleResponse({
        id: 'lc_1',
        type: 'none',
        state: {},
        checksum: 'x',
        effects: {
          errors: { email: ['Required', 'Must be valid'] },
        },
      });

      const errorEl = instance.root.querySelector('[data-ml-error="email"]');
      expect(errorEl.textContent).toBe('Required, Must be valid');
      expect(errorEl.style.display).toBe('');
    });
  });

  describe('setDirty', () => {
    it('marks property as dirty', () => {
      const snapshot = { component: 'Counter', id: 'lc_1', state: { count: 0 }, checksum: 'abc', meta: {} };
      document.body.innerHTML = `<div data-ml-id="lc_1" data-ml-snapshot='${JSON.stringify(snapshot)}'></div>`;
      manager.mount(document.querySelector('[data-ml-id]'));

      const instance = manager.get('lc_1');
      instance.setDirty('count', 42);

      expect(instance.dirtyState.count).toBe(42);
    });
  });
});
