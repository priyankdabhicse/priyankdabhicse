/**
 * IndexedDB Utility for storing and managing large datasets (up to 30MB+).
 * Works in both popup and background environments.
 */

const DB_NAME = "AIBrowserAgentDB";
const STORE_NAME = "largeDataStore";
const DB_VERSION = 1;

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Store a record (can be string data, array buffers, or Blob objects)
 * @param {string} id - unique key identifier
 * @param {any} data - the content (e.g., text, base64, blob)
 * @param {string} type - optional mime-type or data description
 */
export async function storeData(id, data, type = "text") {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const record = {
      id,
      data,
      type,
      updatedAt: Date.now()
    };

    const request = store.put(record);

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Retrieve stored data by key
 * @param {string} id
 * @returns {Promise<any>}
 */
export async function retrieveData(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = (event) => {
      resolve(event.target.result ? event.target.result : null);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Delete a record by key
 * @param {string} id
 */
export async function deleteData(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve(true);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Get all stored items keys and metadata
 */
export async function listStoredKeys() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}
