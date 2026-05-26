import { describe, it, expect, beforeEach } from 'vitest';
import { morph } from '../../src/live/morph.js';

describe('morph', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
  });

  describe('basic morphing', () => {
    it('updates text content', () => {
      container.innerHTML = '<p>Count: 0</p>';
      const target = container.firstElementChild;

      morph(target, '<p>Count: 5</p>');

      expect(target.textContent).toBe('Count: 5');
    });

    it('returns the original element', () => {
      container.innerHTML = '<div>old</div>';
      const el = container.firstElementChild;
      const result = morph(el, '<div>new</div>');

      expect(result).toBe(el);
    });

    it('handles empty toHtml gracefully', () => {
      container.innerHTML = '<div>old</div>';
      const el = container.firstElementChild;
      const result = morph(el, '');

      expect(result).toBe(el);
    });
  });

  describe('attribute morphing', () => {
    it('adds new attributes', () => {
      container.innerHTML = '<div></div>';
      const el = container.firstElementChild;

      morph(el, '<div class="active" data-id="1"></div>');

      expect(el.getAttribute('class')).toBe('active');
      expect(el.getAttribute('data-id')).toBe('1');
    });

    it('removes old attributes', () => {
      container.innerHTML = '<div class="old" title="test"></div>';
      const el = container.firstElementChild;

      morph(el, '<div class="new"></div>');

      expect(el.getAttribute('class')).toBe('new');
      expect(el.hasAttribute('title')).toBe(false);
    });

    it('preserves data-ml-id', () => {
      container.innerHTML = '<div data-ml-id="lc_1"></div>';
      const el = container.firstElementChild;

      morph(el, '<div data-ml-id="lc_different"></div>');

      expect(el.getAttribute('data-ml-id')).toBe('lc_1');
    });

    it('preserves data-ml-component', () => {
      container.innerHTML = '<div data-ml-component="Counter"></div>';
      const el = container.firstElementChild;

      morph(el, '<div data-ml-component="Other"></div>');

      expect(el.getAttribute('data-ml-component')).toBe('Counter');
    });
  });

  describe('children morphing', () => {
    it('adds new children', () => {
      container.innerHTML = '<ul><li>A</li></ul>';
      const el = container.firstElementChild;

      morph(el, '<ul><li>A</li><li>B</li></ul>');

      expect(el.children.length).toBe(2);
      expect(el.children[1].textContent).toBe('B');
    });

    it('removes extra children', () => {
      container.innerHTML = '<ul><li>A</li><li>B</li><li>C</li></ul>';
      const el = container.firstElementChild;

      morph(el, '<ul><li>A</li></ul>');

      expect(el.children.length).toBe(1);
    });

    it('updates child text', () => {
      container.innerHTML = '<div><span>old</span></div>';
      const el = container.firstElementChild;

      morph(el, '<div><span>new</span></div>');

      expect(el.querySelector('span').textContent).toBe('new');
    });
  });

  describe('keyed reconciliation', () => {
    it('reorders keyed elements', () => {
      container.innerHTML = '<ul><li key="a">A</li><li key="b">B</li><li key="c">C</li></ul>';
      const el = container.firstElementChild;
      const originalB = el.querySelector('[key="b"]');

      morph(el, '<ul><li key="c">C</li><li key="a">A</li><li key="b">B</li></ul>');

      // B should still be the same DOM node (keyed reconciliation)
      const currentB = el.querySelector('[key="b"]');
      expect(currentB).toBe(originalB);
    });

    it('handles data-key attribute', () => {
      container.innerHTML = '<div><span data-key="x">X</span></div>';
      const el = container.firstElementChild;

      morph(el, '<div><span data-key="x">X updated</span></div>');

      expect(el.querySelector('[data-key="x"]').textContent).toBe('X updated');
    });
  });

  describe('directives', () => {
    it('respects ml:ignore', () => {
      container.innerHTML = '<div><p ml:ignore>Do not change</p></div>';
      const el = container.firstElementChild;
      const ignoredNode = el.querySelector('p');

      morph(el, '<div><p ml:ignore>Changed!</p></div>');

      // The original node should still have its text preserved
      expect(ignoredNode.textContent).toBe('Do not change');
    });

    it('respects ml:preserve', () => {
      container.innerHTML = '<div><video ml:preserve src="a.mp4"></video></div>';
      const el = container.firstElementChild;
      const originalVideo = el.querySelector('video');

      morph(el, '<div><video ml:preserve src="b.mp4"></video></div>');

      expect(el.querySelector('video')).toBe(originalVideo);
    });

    it('handles ml:replace', () => {
      container.innerHTML = '<div><p ml:replace>Old</p></div>';
      const el = container.firstElementChild;

      morph(el, '<div><p ml:replace>New</p></div>');

      expect(el.querySelector('p').textContent).toBe('New');
    });
  });

  describe('tag replacement', () => {
    it('replaces different tag names', () => {
      container.innerHTML = '<div><span>text</span></div>';
      const el = container.firstElementChild;

      morph(el, '<div><strong>bold</strong></div>');

      expect(el.firstElementChild.tagName).toBe('STRONG');
      expect(el.firstElementChild.textContent).toBe('bold');
    });
  });

  describe('childrenOnly option', () => {
    it('morphs only children when set', () => {
      container.innerHTML = '<div class="keep"><p>old</p></div>';
      const el = container.firstElementChild;

      morph(el, '<div class="remove"><p>new</p></div>', { childrenOnly: true });

      expect(el.getAttribute('class')).toBe('keep');
      expect(el.querySelector('p').textContent).toBe('new');
    });
  });

  describe('form elements', () => {
    it('syncs input values when not focused', () => {
      container.innerHTML = '<div><input type="text" value="old"></div>';
      const el = container.firstElementChild;

      morph(el, '<div><input type="text" value="new"></div>');

      expect(el.querySelector('input').value).toBe('new');
    });

    it('preserves focused input value', () => {
      container.innerHTML = '<div><input id="test-input" type="text" value="old"></div>';
      const el = container.firstElementChild;
      const input = el.querySelector('input');
      input.value = 'user-typing';
      input.focus();

      morph(el, '<div><input id="test-input" type="text" value="server"></div>');

      expect(input.value).toBe('user-typing');
    });

    it('syncs checkbox state', () => {
      container.innerHTML = '<div><input type="checkbox"></div>';
      const el = container.firstElementChild;

      morph(el, '<div><input type="checkbox" checked></div>');

      expect(el.querySelector('input').checked).toBe(true);
    });
  });
});
