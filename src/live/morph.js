/**
 * MonkeysJS Live — DOM Morph Engine
 *
 * Purpose-built DOM morphing engine for live component updates.
 * This is not a generic diff library — it is designed specifically
 * for the MonkeysLegion wire protocol.
 *
 * Features:
 * - Keyed reconciliation via `key` attribute
 * - Attribute-level diffing (only changed attributes touched)
 * - Focus, scroll position, and cursor preservation
 * - CSS transition preservation (morphs don't break animations)
 * - Respects `ml:ignore`, `ml:replace`, `ml:preserve` directives
 *
 * @module monkeysjs/live/morph
 */

/**
 * Morph an existing DOM tree to match new HTML.
 *
 * @param {Element} fromEl The existing DOM element.
 * @param {string} toHtml The new HTML string.
 * @param {object} [options] Morphing options.
 * @param {boolean} [options.childrenOnly=false] Only morph children, not the root.
 * @returns {Element} The morphed element.
 */
export function morph(fromEl, toHtml, options = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${toHtml}</body>`, 'text/html');
  const toEl = doc.body.firstElementChild;

  if (!toEl) return fromEl;

  // Save focus/cursor state
  const focusState = saveFocusState();

  if (options.childrenOnly) {
    morphChildren(fromEl, toEl);
  } else {
    morphNode(fromEl, toEl);
  }

  // Restore focus/cursor state
  restoreFocusState(focusState);

  return fromEl;
}

/**
 * Morph a single node (element or text).
 *
 * @param {Node} fromNode The existing DOM node.
 * @param {Node} toNode The target DOM node.
 */
function morphNode(fromNode, toNode) {
  // Text nodes — update text content directly
  if (fromNode.nodeType === Node.TEXT_NODE) {
    if (fromNode.textContent !== toNode.textContent) {
      fromNode.textContent = toNode.textContent;
    }
    return;
  }

  // Comment nodes — skip
  if (fromNode.nodeType === Node.COMMENT_NODE) return;

  // Element nodes
  if (fromNode.nodeType !== Node.ELEMENT_NODE) return;

  // Check for ml:ignore — skip morphing this subtree entirely
  if (fromNode.hasAttribute('ml:ignore')) return;

  // Check for ml:preserve — keep the node identical
  if (fromNode.hasAttribute('ml:preserve')) return;

  // Check for ml:replace — full replacement
  if (fromNode.hasAttribute('ml:replace')) {
    fromNode.replaceWith(toNode.cloneNode(true));
    return;
  }

  // Different tag names — full replacement
  if (fromNode.tagName !== toNode.tagName) {
    fromNode.replaceWith(toNode.cloneNode(true));
    return;
  }

  // Morph attributes
  morphAttributes(fromNode, toNode);

  // Morph children
  morphChildren(fromNode, toNode);
}

/**
 * Morph attributes on an element (add, update, remove).
 *
 * @param {Element} fromEl The existing element.
 * @param {Element} toEl The target element.
 */
function morphAttributes(fromEl, toEl) {
  // Skip live-specific data attributes that should persist
  const persistAttrs = new Set(['data-ml-id', 'data-ml-component']);

  // Update or add attributes from toEl
  for (const attr of toEl.attributes) {
    if (persistAttrs.has(attr.name)) continue;

    const currentValue = fromEl.getAttribute(attr.name);
    if (currentValue !== attr.value) {
      fromEl.setAttribute(attr.name, attr.value);
    }
  }

  // Remove attributes not in toEl
  const toRemove = [];
  for (const attr of fromEl.attributes) {
    if (persistAttrs.has(attr.name)) continue;

    if (!toEl.hasAttribute(attr.name)) {
      toRemove.push(attr.name);
    }
  }
  for (const name of toRemove) {
    fromEl.removeAttribute(name);
  }

  // Special handling for form elements
  if (fromEl.tagName === 'INPUT' || fromEl.tagName === 'TEXTAREA' || fromEl.tagName === 'SELECT') {
    syncFormElement(fromEl, toEl);
  }
}

/**
 * Morph children of an element using keyed reconciliation.
 *
 * @param {Element} fromEl The existing parent element.
 * @param {Element} toEl The target parent element.
 */
function morphChildren(fromEl, toEl) {
  const fromChildren = Array.from(fromEl.childNodes);
  const toChildren = Array.from(toEl.childNodes);

  // Build key maps for keyed reconciliation
  const fromKeyMap = buildKeyMap(fromChildren);
  const toKeyMap = buildKeyMap(toChildren);

  let fromIdx = 0;
  let toIdx = 0;

  while (toIdx < toChildren.length) {
    const toChild = toChildren[toIdx];
    const toKey = getKey(toChild);

    // If the target child has a key, try to find it in fromChildren
    if (toKey) {
      const existingNode = fromKeyMap.get(toKey);

      if (existingNode) {
        // Found by key — move it to the right position and morph
        if (fromEl.childNodes[fromIdx] !== existingNode) {
          fromEl.insertBefore(existingNode, fromEl.childNodes[fromIdx] || null);
        }
        morphNode(existingNode, toChild);
        fromIdx++;
        toIdx++;
        continue;
      }
    }

    // No key or key not found — match by position
    if (fromIdx < fromChildren.length) {
      const fromChild = fromEl.childNodes[fromIdx];
      const fromKey = getKey(fromChild);

      // If fromChild has a key that still exists in toChildren, skip it
      // (it will be moved later)
      if (fromKey && toKeyMap.has(fromKey)) {
        // Insert new node before this one
        const newNode = toChild.cloneNode(true);
        fromEl.insertBefore(newNode, fromChild);
        toIdx++;
        fromIdx++;
        continue;
      }

      // Same type — morph in place
      if (canMorphInPlace(fromChild, toChild)) {
        morphNode(fromChild, toChild);
        fromIdx++;
        toIdx++;
      } else {
        // Different type — replace
        const newNode = toChild.cloneNode(true);
        fromEl.replaceChild(newNode, fromChild);
        fromIdx++;
        toIdx++;
      }
    } else {
      // No more fromChildren — append
      fromEl.appendChild(toChild.cloneNode(true));
      toIdx++;
    }
  }

  // Remove extra fromChildren that have no match
  while (fromEl.childNodes.length > toChildren.length) {
    const extra = fromEl.childNodes[toChildren.length];
    if (extra) {
      // Don't remove ml:preserve nodes
      if (extra.nodeType === Node.ELEMENT_NODE && extra.hasAttribute('ml:preserve')) {
        break;
      }
      fromEl.removeChild(extra);
    } else {
      break;
    }
  }
}

/**
 * Build a key → node map for keyed reconciliation.
 *
 * @param {NodeList|Array<Node>} children
 * @returns {Map<string, Node>}
 */
function buildKeyMap(children) {
  const map = new Map();
  for (const child of children) {
    const key = getKey(child);
    if (key) {
      map.set(key, child);
    }
  }
  return map;
}

/**
 * Get the `key` attribute from a node.
 * @param {Node} node
 * @returns {string|null}
 */
function getKey(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  return node.getAttribute('key') || node.getAttribute('data-key');
}

/**
 * Check if two nodes can be morphed in place (same type + tag).
 * @param {Node} a
 * @param {Node} b
 * @returns {boolean}
 */
function canMorphInPlace(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType === Node.TEXT_NODE) return true;
  if (a.nodeType === Node.ELEMENT_NODE) {
    return a.tagName === b.tagName;
  }
  return false;
}

/**
 * Sync form element values (inputs, textareas, selects).
 *
 * Preserves user input for focused elements to avoid jarring reflows.
 *
 * @param {Element} fromEl
 * @param {Element} toEl
 */
function syncFormElement(fromEl, toEl) {
  const isFocused = document.activeElement === fromEl;

  // Don't update value of focused inputs (user is typing)
  if (isFocused) return;

  if (fromEl.tagName === 'INPUT') {
    const type = fromEl.type;
    if (type === 'checkbox' || type === 'radio') {
      if (fromEl.checked !== toEl.checked) {
        fromEl.checked = toEl.checked;
      }
    } else {
      if (fromEl.value !== toEl.value) {
        fromEl.value = toEl.value;
      }
    }
  } else if (fromEl.tagName === 'TEXTAREA') {
    if (fromEl.value !== toEl.value) {
      fromEl.value = toEl.value;
    }
  } else if (fromEl.tagName === 'SELECT') {
    if (fromEl.value !== toEl.value) {
      fromEl.value = toEl.value;
    }
  }
}

/**
 * Save current focus, cursor, and scroll state.
 * @returns {object}
 */
function saveFocusState() {
  const el = document.activeElement;
  if (!el || el === document.body) return { element: null };

  return {
    element: el,
    id: el.id,
    selectionStart: el.selectionStart ?? null,
    selectionEnd: el.selectionEnd ?? null,
    scrollTop: el.scrollTop,
    scrollLeft: el.scrollLeft,
  };
}

/**
 * Restore focus, cursor, and scroll state after morphing.
 * @param {object} state The saved state from saveFocusState.
 */
function restoreFocusState(state) {
  if (!state.element) return;

  // Find the element again (it may have been replaced)
  let target = state.element;
  if (!document.contains(target) && state.id) {
    target = document.getElementById(state.id);
  }

  if (!target) return;

  // Restore focus
  try {
    target.focus({ preventScroll: true });
  } catch (_) {
    // Element may not be focusable
  }

  // Restore cursor position
  if (state.selectionStart !== null) {
    try {
      target.setSelectionRange(state.selectionStart, state.selectionEnd);
    } catch (_) {
      // Not all elements support setSelectionRange
    }
  }

  // Restore scroll position
  if (state.scrollTop !== undefined) {
    target.scrollTop = state.scrollTop;
    target.scrollLeft = state.scrollLeft;
  }
}
