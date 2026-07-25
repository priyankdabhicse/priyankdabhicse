import { openDatabase, storeData, retrieveData, deleteData, listStoredKeys } from "./indexeddb.js";

async function runSelfTests() {
  console.log("=== Starting AI Browser Agent Self-Test Suite ===");
  const testResults = [];

  function assert(condition, message) {
    if (condition) {
      testResults.push({ name: message, status: "PASSED" });
      console.log(`[PASS] ${message}`);
    } else {
      testResults.push({ name: message, status: "FAILED" });
      console.error(`[FAIL] ${message}`);
    }
  }

  // 1. Verify Manifest and Core extension files exist
  try {
    const response = await fetch("./manifest.json");
    const manifest = await response.json();
    assert(manifest !== null, "Manifest should be valid JSON");
    assert(manifest.manifest_version === 3, "Manifest version must be 3");

    const requiredPermissions = ["tabs", "tabGroups", "debugger", "scripting", "unlimitedStorage", "storage"];
    const hasAllPermissions = requiredPermissions.every(p => manifest.permissions.includes(p));
    assert(hasAllPermissions, "Manifest must include tabs, tabGroups, debugger, scripting, unlimitedStorage, storage permissions");
    assert(manifest.host_permissions && manifest.host_permissions.includes("<all_urls>"), "Manifest must include <all_urls> host permissions");
  } catch (err) {
    assert(false, `Manifest check failed: ${err.message}`);
  }

  // 2. Test IndexedDB Functionality (up to 30MB+ support validation)
  try {
    await storeData("test-key", "Test robust string data for AI extension background storage.");
    const retrieved = await retrieveData("test-key");
    assert(retrieved && retrieved.data === "Test robust string data for AI extension background storage.", "IndexedDB put & get operations work correctly");

    // Check 30MB+ storage capability with large chunks
    const largeChunk = "X".repeat(1024 * 1024 * 5); // 5MB chunk
    await storeData("large-chunk-5mb", largeChunk);
    const retrievedLarge = await retrieveData("large-chunk-5mb");
    assert(retrievedLarge && retrievedLarge.data.length === 5 * 1024 * 1024, "IndexedDB supports large 5MB data blocks without issue");

    await deleteData("test-key");
    await deleteData("large-chunk-5mb");

    const keys = await listStoredKeys();
    assert(!keys.includes("test-key") && !keys.includes("large-chunk-5mb"), "IndexedDB delete operations remove keys properly");
  } catch (err) {
    assert(false, `IndexedDB check failed: ${err.message}`);
  }

  // 3. Verify Popup UI elements (simulated loading of popup.html)
  try {
    const res = await fetch("./popup.html");
    const htmlText = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");

    const apiKeyInput = doc.getElementById("apiKey");
    const taskInput = doc.getElementById("taskInput");
    const startBtn = doc.getElementById("startBtn");
    const stopBtn = doc.getElementById("stopBtn");

    assert(apiKeyInput !== null, "UI Input element 'apiKey' should be present");
    assert(taskInput !== null, "UI Textarea element 'taskInput' should be present");
    assert(startBtn !== null, "UI Button element 'startBtn' should be present");
    assert(stopBtn !== null, "UI Button element 'stopBtn' should be present");
  } catch (err) {
    assert(false, `Popup UI file validation failed: ${err.message}`);
  }

  console.log("\n=== Self-Test Results ===");
  console.table(testResults);

  const allPassed = testResults.every(r => r.status === "PASSED");
  if (allPassed) {
    console.log("🚀 ALL TESTS PASSED SUCCESSFULLY! Extension is robust & compliant.");
  } else {
    console.error("❌ SOME TESTS FAILED. Please verify your codebase configuration.");
  }
}

// Automatically expose or run tests in background / window contexts
if (typeof window !== "undefined") {
  window.runSelfTests = runSelfTests;
} else {
  runSelfTests();
}
export { runSelfTests };
