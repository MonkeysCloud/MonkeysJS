# MonkeysJS

<p align="center">
  <img src="https://monkeyslegion.com/images/icon-monkeyslegion.png" alt="MonkeysJS Logo" width="200">
</p>

<p align="center">
  <strong>The robust, reactive JavaScript library that replaces Alpine.js and Axios.</strong><br>
  Built-in HTTP client, advanced DOM binding, WebSockets, and powerful form handling in one lightweight package.
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#live-components">Live Components</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#examples">Examples</a>
</p>

---

## Why MonkeysJS?

MonkeysJS is designed to be a complete solution for modern web interfaces. Instead of stitching together Alpine.js for interactivity and Axios for requests, getting disparate libraries to talk to each other, MonkeysJS provides a unified, reactive system where your data, DOM, and network requests work in harmony.

## Features

✨ **Advanced Reactivity** - Fine-grained reactivity system (`ref`, `reactive`, `computed`, `watch`) that powers everything.

🌐 **Production-Ready HTTP** - A robust alternative to Axios with caching, retries, deduplication, and file upload progress (`useUpload`).

🎯 **Pro-Level DOM Binding** - More than just text updates. Includes `$dispatch`, `$watch`, formatted inputs with `m-mask`, and lifecycle hooks.

📡 **WebSocket Client** - integrated `useWebSocket` with auto-reconnect, heartbeats, and reactive state.

📝 **Form handling** - Native `useForm` with validation, dirty checking, and async submission.

🔄 **Smart Data Fetching** - Declarative `m-fetch` for zero-boilerplate data loading.

📦 **Zero Dependencies** - ~14KB gzipped. No bloat.

⚡ **Live Components** - Server-driven reactive UI over the wire. Purpose-built DOM morphing, wire protocol batching, SSE streaming for AI, and chunked uploads. The client runtime for [monkeyslegion-live](https://github.com/monkeyscloud/monkeyslegion-live).

## Installation

### NPM

```bash
npm install monkeysjs
```

### CDN

```html
<script src="https://unpkg.com/monkeysjs"></script>
```

## Quick Start

### Browser (Alpine.js style)

```html
<div m-data="{ count: 0, open: false }">
  <!-- Dispatch custom events like a pro -->
  <button @click="$dispatch('toggle-menu', { state: !open })">Toggle</button>

  <!-- Watch for changes right in your HTML -->
  <div m-effect="$watch(() => count, val => console.log(val))"></div>

  <!-- Format inputs automatically -->
  <input m-mask="99-99-9999" placeholder="Phone Number" />

  <span m-text="count"></span>
  <button @click="count++">Increment</button>
</div>
```

### ES Modules

```javascript
import { reactive, http, useUpload } from "monkeysjs";

// Reactive state
const state = reactive({ count: 0 });

// File Upload with Progress
const { upload, progress } = useUpload("/api/files");

async function handleFile(file) {
  await upload(file);
  console.log("Upload complete!");
}
```

## Documentation

### DOM Binding

MonkeysJS offers a superset of directives you might expect, plus power-user features.

#### `$dispatch(event, detail)`

Emit custom events that bubble up the DOM.

```html
<button @click="$dispatch('notify', { message: 'Saved!' })">Save</button>
```

#### `$watch(source, callback)`

React to changes declaratively.

```html
<div
  m-effect="$watch(() => isOpen, val => document.body.classList.toggle('noscroll', val))"
></div>
```

#### `m-mask`

Built-in input masking for dates, phones, and more.

- `9`: Numeric
- `a`: Alpha
- `*`: Alphanumeric

```html
<input m-mask="999-99-9999" placeholder="SSN" />
```

### HTTP Client

Forget Axios. MonkeysJS has you covered.

#### `useUpload(url)`

Upload files with built-in progress tracking.

```javascript
import { useUpload } from "monkeysjs";

const { upload, progress, isUploading, error } = useUpload("/api/upload");

// In your view
// <div :style="{ width: progress + '%' }"></div>
```

#### `useFetch(url)`

Reactive data fetching.

```javascript
import { useFetch } from "monkeysjs";

const { data, error, isLoading, execute } = useFetch("/api/users");
```

### WebSockets

Built-in reactive WebSocket client.

```javascript
import { useWebSocket } from "monkeysjs";

const { send, data, isConnected } = useWebSocket("wss://api.example.com");
```

---

## Live Components

**New in 1.0.2** — MonkeysJS ships a purpose-built live runtime for [monkeyslegion-live](https://github.com/monkeyscloud/monkeyslegion-live). Write PHP components, get a reactive UI over the wire — no SPA build step, no API layer.

### Why not Alpine.js or Stimulus?

MonkeysJS Live is designed against the MonkeysLegion wire protocol from the ground up. Hydration, batching, keyed DOM morphing, and streamed AI rendering are first-class — not bolted on.

### Import

```javascript
import { ComponentManager, Wire, morph, StreamClient } from "monkeysjs/live";
```

Or load automatically via the PHP `@liveScripts` directive (no manual import needed).

### Wire Protocol

The `Wire` client batches concurrent state updates and action calls into a single HTTP round-trip per component.

```javascript
import { Wire } from "monkeysjs/live";

const wire = new Wire("/_live");

// Queue a state update (auto-batched)
wire.queueUpdate("lc_abc123", "count", 5, snapshot);

// Queue an action call (batched with the update above)
wire.queueAction("lc_abc123", "increment", [], snapshot);

// Register a response handler
wire.onResponse("lc_abc123", (data) => {
  console.log("New state:", data.state);
});
```

### DOM Morphing

The morph engine patches only what changed — keyed reconciliation, attribute-level diffing, focus/scroll preservation, and CSS transition safety.

```javascript
import { morph } from "monkeysjs/live";

// Morph an existing element to match new HTML
morph(existingElement, "<div><p>Updated content</p></div>");

// Morph children only (keep root attributes)
morph(existingElement, newHtml, { childrenOnly: true });
```

**Directives respected during morphing:**

| Attribute | Effect |
|-----------|--------|
| `ml:ignore` | Skip this subtree entirely |
| `ml:preserve` | Keep node identical across morphs |
| `ml:replace` | Force full replacement |
| `key` / `data-key` | Keyed reconciliation (stable identity) |

### Component Manager

The `ComponentManager` hydrates live components from the DOM, tracks state, and dispatches actions through the wire.

```javascript
import { ComponentManager } from "monkeysjs/live";

const manager = new ComponentManager(wire);

// Auto-mount all components on the page
document.querySelectorAll("[data-ml-id]").forEach((el) => manager.mount(el));

// Update state (triggers wire round-trip)
manager.updateProperty("lc_abc123", "count", 10);

// Call an action
manager.callAction("lc_abc123", "increment");

// Force re-render
manager.refresh("lc_abc123");
```

### ml: Directive Set

All directives are processed automatically after mount and after each morph.

| Directive | Purpose |
|-----------|---------|
| `ml:model` | Two-way bind input → `#[State]` |
| `ml:model.live` | Sync on every input event |
| `ml:model.live.debounce.300ms` | Debounced live sync |
| `ml:click` | Call `#[Action]` method |
| `ml:submit.prevent` | Form submission action |
| `ml:keydown.enter` | Key event → action |
| `ml:loading` | Show element during round-trip |
| `ml:dirty` | Reflect unsynced changes |
| `ml:poll.5s` | Re-render on interval |
| `ml:offline` | Show when browser is offline |
| `ml:stream` | Target for streamed AI content |
| `ml:transition` | CSS enter/leave transitions |

### Streaming (AI / LLM)

The `StreamClient` connects to SSE endpoints for real-time token streaming. This is the client-side counterpart of the PHP `Streams` concern — paired with MonkeysLegion Apex for server-driven AI rendering.

```javascript
import { StreamClient } from "monkeysjs/live";

const stream = new StreamClient("/_live/stream");

stream
  .on("chunk", ({ content }) => {
    document.querySelector('[ml\\:stream="reply"]').insertAdjacentHTML("beforeend", content);
  })
  .on("done", () => console.log("Stream complete"))
  .connect("lc_abc123", "reply");
```

### File Uploads

Chunked uploads with progress tracking, integrated with the live component lifecycle.

```javascript
import { uploadFile } from "monkeysjs/live";

await uploadFile(file, "lc_abc123", "avatar", {
  chunkSize: 1048576, // 1MB chunks
  onProgress: (percent) => console.log(`${percent}%`),
  onComplete: (result) => console.log("Done:", result.fileName),
});
```

### Events

MonkeysJS Live dispatches `CustomEvent`s at every lifecycle point:

| Event | When |
|-------|------|
| `ml:mounted` | Component hydrated from DOM |
| `ml:updated` | Component received a wire response |
| `ml:destroyed` | Component cleaned up |
| `ml:loading` | Loading state changed (start/end) |
| `ml:dirty` | Unsynced state change detected |
| `ml:emit` | Inter-component event from server |
| `ml:wire-error` | Wire request failed |
| `ml:upload-progress` | File upload chunk completed |
| `ml:upload-complete` | File upload finished |

### Runtime Size

< 12 KB gzipped. Zero dependencies. No build step required — ships as ESM, works with `<script type="module">` or any bundler.

---

## License

MIT

## Contributors

<table>
  <tr>
    <td>
      <a href="https://github.com/yorchperaza">
        <img src="https://github.com/yorchperaza.png" width="100px;" alt="Jorge Peraza"/><br />
        <sub><b>Jorge Peraza</b></sub>
      </a>
    </td>
  </tr>
</table>
