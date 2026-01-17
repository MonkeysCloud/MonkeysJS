import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from './binding';

describe('DOM Features', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('$dispatch', () => {
    it('should dispatch custom events', () => {
      container.innerHTML = `
        <div @custom="handled = true">
          <button @click="$dispatch('custom')"></button>
        </div>
      `;
      const app = createApp({ handled: false }).mount(container);
      const button = container.querySelector('button');
      
      button.click();
      expect(app.data.handled).toBe(true);
    });

    it('should pass details with events', () => {
        container.innerHTML = `
          <div @custom="message = $event.detail.msg">
            <button @click="$dispatch('custom', { msg: 'hello' })"></button>
          </div>
        `;
        const app = createApp({ message: '' }).mount(container);
        const button = container.querySelector('button');
        
        button.click();
        expect(app.data.message).toBe('hello');
      });
  });

  describe('m-mask', () => {
    it('should format input', () => {
      container.innerHTML = '<input m-mask="99-99">';
      const app = createApp().mount(container);
      const input = container.querySelector('input');
      
      input.value = '1234';
      input.dispatchEvent(new Event('input'));
      
      expect(input.value).toBe('12-34');
    });

    it('should handle alpha mask', () => {
        container.innerHTML = '<input m-mask="aa">';
        const app = createApp().mount(container);
        const input = container.querySelector('input');
        
        input.value = '1a2b';
        input.dispatchEvent(new Event('input'));
        
        expect(input.value).toBe('ab');
    });
  });

  describe('$watch', () => {
      it('should watch values from template', async () => {
          container.innerHTML = '<div m-effect="$watch(() => count, (val) => doubled = val * 2)"></div>';
          const app = createApp({ count: 1, doubled: 2 }).mount(container);
          
          expect(app.data.doubled).toBe(2);
          
          app.data.count = 5;
          
          // Wait for effect scheduler
          await new Promise(resolve => setTimeout(resolve, 0));
          
          expect(app.data.doubled).toBe(10);
      });
  });
});
