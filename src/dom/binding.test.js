import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from './binding';

describe('DOM Binding', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should bind text content (m-text)', () => {
    container.innerHTML = '<span m-text="message"></span>';
    const app = createApp({ message: 'Hello' }).mount(container);
    
    const span = container.querySelector('span');
    expect(span.textContent).toBe('Hello');

    app.data.message = 'World';
    expect(span.textContent).toBe('World');
  });

  it('should bind inner HTML (m-html)', () => {
    container.innerHTML = '<div m-html="content"></div>';
    const app = createApp({ content: '<b>Bold</b>' }).mount(container);
    
    const div = container.querySelector('div');
    expect(div.innerHTML).toBe('<b>Bold</b>');

    app.data.content = '<i>Italic</i>';
    expect(div.innerHTML).toBe('<i>Italic</i>');
  });

  it('should toggle visibility (m-show)', () => {
    container.innerHTML = '<div m-show="visible">Content</div>';
    const app = createApp({ visible: true }).mount(container);
    const div = container.querySelector('div');
    
    expect(div.style.display).not.toBe('none');

    app.data.visible = false;
    expect(div.style.display).toBe('none');
  });

  it('should handle event binding (@click)', () => {
    container.innerHTML = '<button @click="count++"></button>';
    const app = createApp({ count: 0 }).mount(container);
    const button = container.querySelector('button');
    
    button.click();
    expect(app.data.count).toBe(1);
    
    button.click();
    expect(app.data.count).toBe(2);
  });

  it('should handle two-way binding (m-model) on input', () => {
    container.innerHTML = '<input m-model="text" />';
    const app = createApp({ text: 'initial' }).mount(container);
    const input = container.querySelector('input');
    
    expect(input.value).toBe('initial');

    // Model -> View
    app.data.text = 'updated';
    expect(input.value).toBe('updated'); // This might require flushing effects if async, but it should be sync here.

    // View -> Model
    input.value = 'typed';
    input.dispatchEvent(new Event('input'));
    expect(app.data.text).toBe('typed');
  });

  it('should handle conditional rendering (m-if)', () => {
    container.innerHTML = '<div m-if="show">Visible</div>';
    const app = createApp({ show: true }).mount(container);
    
    expect(container.querySelector('div')).not.toBeNull();
    expect(container.querySelector('div').textContent).toBe('Visible');

    app.data.show = false;
    expect(container.querySelector('div')).toBeNull();

    app.data.show = true;
    expect(container.querySelector('div')).not.toBeNull();
  });

  it('should handle list rendering (m-for)', () => {
    container.innerHTML = '<ul><li m-for="item in items" m-text="item"></li></ul>';
    const app = createApp({ items: ['A', 'B'] }).mount(container);
    
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('A');
    expect(items[1].textContent).toBe('B');

    app.data.items.push('C');
    
    const newItems = container.querySelectorAll('li');
    expect(newItems.length).toBe(3);
    expect(newItems[2].textContent).toBe('C');
    
    // Removing items
    app.data.items.pop();
    expect(container.querySelectorAll('li').length).toBe(2);
  });
  
  it('should handle nested directives in m-for', () => {
      container.innerHTML = '<ul><li m-for="item in items"><span m-text="item.name"></span></li></ul>';
      const app = createApp({ items: [{ name: 'A' }, { name: 'B' }] }).mount(container);
      
      const spans = container.querySelectorAll('span');
      expect(spans[0].textContent).toBe('A');
      expect(spans[1].textContent).toBe('B');
      
      app.data.items[0].name = 'Updated A';
      expect(spans[0].textContent).toBe('Updated A');
  });
});
