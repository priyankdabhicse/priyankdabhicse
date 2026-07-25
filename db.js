// db.js - IndexedDB storage library for AI Browser Agent

const DB_NAME = 'AIBrowserAgentDB';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

/**
 * Initializes and returns the IndexedDB database instance.
 */
export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Stores a value (string, object, Blob, ArrayBuffer, etc.) in IndexedDB.
 * @param {string} id - Unique identifier
 * @param {any} value - The data to store (supports >30MB with unlimitedStorage)
 * @param {string} [mimeType] - Optional mime-type for media
 */
export async function storeAsset(id, value, mimeType = '') {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({
      id,
      value,
      mimeType,
      updatedAt: Date.now()
    });

    request.onsuccess = () => {
      console.log(`Successfully stored asset: ${id}`);
      resolve(true);
    };

    request.onerror = (event) => {
      console.error(`Failed to store asset: ${id}`, event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Retrieves a stored asset by key.
 * @param {string} id
 * @returns {Promise<{id: string, value: any, mimeType: string, updatedAt: number} | null>}
 */
export async function getAsset(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = (event) => {
      console.error(`Failed to retrieve asset: ${id}`, event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Deletes a stored asset.
 * @param {string} id
 */
export async function deleteAsset(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log(`Successfully deleted asset: ${id}`);
      resolve(true);
    };

    request.onerror = (event) => {
      console.error(`Failed to delete asset: ${id}`, event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Lists all stored asset IDs.
 * @returns {Promise<string[]>}
 */
export async function listAssets() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}
