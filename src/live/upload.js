/**
 * MonkeysJS Live — File Upload Client
 *
 * Chunked file upload with progress tracking for live components.
 * Client-side counterpart of the `WithFileUploads` PHP concern.
 *
 * @module monkeysjs/live/upload
 */

import { getCsrfToken, findComponentRoot, getComponentId } from './utils.js';

/**
 * Upload a file in chunks with progress tracking.
 *
 * @param {File} file The file to upload.
 * @param {string} componentId The live component ID.
 * @param {string} property The state property name.
 * @param {object} [options] Upload options.
 * @param {string} [options.endpoint='/_live/upload'] The upload endpoint.
 * @param {number} [options.chunkSize=1048576] Chunk size in bytes (default: 1MB).
 * @param {Function} [options.onProgress] Progress callback (0-100).
 * @param {Function} [options.onComplete] Completion callback.
 * @param {Function} [options.onError] Error callback.
 * @returns {Promise<object>} Upload result.
 */
export async function uploadFile(file, componentId, property, options = {}) {
  const endpoint = options.endpoint || '/_live/upload';
  const chunkSize = options.chunkSize || 1048576; // 1MB
  const totalChunks = Math.ceil(file.size / chunkSize);

  // Generate upload ID
  const uploadId = crypto.randomUUID ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  let uploadedChunks = 0;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('uploadId', uploadId);
    formData.append('componentId', componentId);
    formData.append('property', property);
    formData.append('chunkIndex', String(i));
    formData.append('totalChunks', String(totalChunks));
    formData.append('fileName', file.name);
    formData.append('fileType', file.type);
    formData.append('fileSize', String(file.size));

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
          'X-ML-Live': '1.0',
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(error.error || `Upload chunk ${i} failed: HTTP ${response.status}`);
      }

      uploadedChunks++;
      const progress = Math.round((uploadedChunks / totalChunks) * 100);

      if (options.onProgress) {
        options.onProgress(progress);
      }

      // Dispatch progress event
      document.dispatchEvent(new CustomEvent('ml:upload-progress', {
        detail: { componentId, property, progress, uploadId },
      }));

    } catch (error) {
      if (options.onError) {
        options.onError(error);
      }
      throw error;
    }
  }

  const result = { uploadId, fileName: file.name, fileType: file.type, fileSize: file.size };

  if (options.onComplete) {
    options.onComplete(result);
  }

  // Dispatch complete event
  document.dispatchEvent(new CustomEvent('ml:upload-complete', {
    detail: { componentId, property, ...result },
  }));

  return result;
}

/**
 * Set up automatic file upload handling for ml:model on file inputs.
 *
 * @param {Element} root The component root element.
 * @param {object} componentManager The component manager.
 */
export function setupFileInputs(root, componentManager) {
  const fileInputs = root.querySelectorAll('input[type="file"][data-ml-model]');

  for (const input of fileInputs) {
    input.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const compRoot = findComponentRoot(input);
      if (!compRoot) return;

      const componentId = getComponentId(compRoot);
      const property = input.getAttribute('data-ml-model');

      // Client-side validation hints
      const maxSize = input.getAttribute('data-ml-max-size');
      const acceptTypes = input.getAttribute('accept');

      if (maxSize && file.size > parseInt(maxSize, 10)) {
        const maxMb = (parseInt(maxSize, 10) / 1048576).toFixed(1);
        document.dispatchEvent(new CustomEvent('ml:upload-error', {
          detail: {
            componentId,
            property,
            error: `File exceeds maximum size of ${maxMb} MB`,
          },
        }));
        return;
      }

      try {
        await uploadFile(file, componentId, property, {
          onProgress: (progress) => {
            // Update loading UI
            const loadingEls = compRoot.querySelectorAll(
              `[ml\\:loading][ml\\:target="${property}"]`
            );
            for (const el of loadingEls) {
              el.style.display = '';
              const progressEl = el.querySelector('[data-ml-progress]');
              if (progressEl) {
                progressEl.textContent = `${progress}%`;
                progressEl.style.width = `${progress}%`;
              }
            }
          },
          onComplete: (result) => {
            componentManager.updateProperty(componentId, property, result);
          },
        });
      } catch (error) {
        console.error(`[ML Live] Upload error:`, error);
      }
    });
  }
}
