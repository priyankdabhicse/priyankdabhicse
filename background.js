// background.js - AI Browser Agent Service Worker

import { storeAsset } from './db.js';

const SYSTEM_PROMPT = `You are an expert AI browser automation agent.
Your job is to generate a single, structured, executable JavaScript code block that will run in the webpage DOM context to perform the user's requested task.
You have access to all standard DOM APIs (document.querySelector, click, value assignment, event dispatching, etc.).

We also provide the following async helper functions pre-defined in your scope. You MUST use them to ensure reliable execution:
1. delay(ms): Promise - waits for ms milliseconds. Example: await delay(1000);
2. waitForSelector(selector, timeout=10000): Promise<Element> - waits for element to appear. Example: const input = await waitForSelector('input[name="q"]');
3. clickElement(selector): Promise - waits for and clicks the element. Example: await clickElement('button[type="submit"]');
4. typeText(selector, text): Promise - waits for element, clears it, types text character-by-character, and fires change/input events. Example: await typeText('input[name="q"]', 'hello world');
5. getPageText(): Promise<string> - returns the visible text content of the page.
6. storeInDB(key, data, mimeType): Promise - stores an asset (such as text, base64 data, or images) to IndexedDB. Example: await storeInDB('task_result', 'some text');

Rules:
- Output ONLY the raw executable JavaScript code.
- Do NOT wrap your output in markdown code blocks (such as \`\`\`javascript ... \`\`\`).
- Output code that uses async/await at the top level (the environment supports top-level await).
- Be extremely reliable. Handle any potential loading times or dynamic elements using the helpers.
- Once completed, you can return a final string result or simply finish.
- Avoid using chrome.* APIs directly inside the page context, as this runs in the webpage context. Use DOM and helper APIs.`;

const activeTasks = new Map();

// Load tasks from storage on startup
loadTasksFromStorage();

async function saveTasksToStorage() {
  const taskArray = Array.from(activeTasks.entries()).map(([id, t]) => ({
    id,
    task: t.task,
    apiKey: t.apiKey,
    status: t.status,
    logs: t.logs,
    tabId: t.tabId,
    groupId: t.groupId,
    retryCount: t.retryCount,
    lastCode: t.lastCode
  }));
  await chrome.storage.local.set({ activeTasks: taskArray });
}

async function loadTasksFromStorage() {
  const res = await chrome.storage.local.get('activeTasks');
  if (res.activeTasks) {
    for (const t of res.activeTasks) {
      activeTasks.set(t.id, {
        ...t,
        isStopping: false,
        lastConsoleError: null
      });
    }
  }
}

function updatePopup() {
  chrome.runtime.sendMessage({ action: 'TASK_UPDATED' }).catch(() => {
    // Suppress error when popup is closed
  });
}

// Debugger Event Listener to capture runtime console errors & exception logs
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  // Capture any bindings (e.g., storeInDB calling sendToExtension)
  if (method === "Runtime.bindingCalled" && params.name === "sendToExtension") {
    try {
      const payload = JSON.parse(params.payload);
      if (payload.action === 'store') {
        await storeAsset(payload.key, payload.value, payload.mimeType || '');
        console.log(`Successfully stored ${payload.key} in Extension IndexedDB`);

        // Find matching task and log the save event
        for (const [id, task] of activeTasks.entries()) {
          if (task.tabId === source.tabId) {
            task.logs.push(`Asset saved to local storage: ${payload.key}`);
            saveTasksToStorage();
            updatePopup();
          }
        }
      }
    } catch (err) {
      console.error('Error handling sendToExtension binding:', err);
    }
  }

  // Monitor logs for execution issues
  for (const [id, task] of activeTasks.entries()) {
    if (task.tabId === source.tabId) {
      if (method === "Runtime.consoleAPICalled" && params.type === "error") {
        const errorMsg = params.args.map(arg => arg.value || arg.description || JSON.stringify(arg)).join(' ');
        task.lastConsoleError = errorMsg;
        task.logs.push(`Console Error Detected: ${errorMsg}`);
        saveTasksToStorage();
        updatePopup();
      }
      if (method === "Runtime.exceptionThrown") {
        const errorMsg = params.exceptionDetails.exception?.description || params.exceptionDetails.text;
        task.lastConsoleError = errorMsg;
        task.logs.push(`Uncaught Exception Detected: ${errorMsg}`);
        saveTasksToStorage();
        updatePopup();
      }
    }
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  for (const [id, task] of activeTasks.entries()) {
    if (task.tabId === source.tabId) {
      if (task.status === 'running') {
        task.status = 'stopped';
        task.logs.push(`Debugger detached. Reason: ${reason}`);
        saveTasksToStorage();
        updatePopup();
      }
    }
  }
});

// Listener for messages from Popup UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_TASK') {
    startTask(message.task, message.apiKey)
      .then(result => sendResponse({ success: true, taskId: result.taskId }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.action === 'EMERGENCY_STOP') {
    emergencyStopAll()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.action === 'GET_TASKS_STATE') {
    const states = Array.from(activeTasks.entries()).map(([id, t]) => ({
      id,
      task: t.task,
      status: t.status,
      logs: t.logs,
      tabId: t.tabId,
      groupId: t.groupId,
      retryCount: t.retryCount,
      lastCode: t.lastCode
    }));
    sendResponse({ success: true, tasks: states });
    return false;
  }
  if (message.action === 'STOP_TASK') {
    stopSpecificTask(message.taskId)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.action === 'CLEAR_TASKS') {
    activeTasks.clear();
    saveTasksToStorage().then(() => {
      sendResponse({ success: true });
      updatePopup();
    });
    return true;
  }
});

async function startTask(taskText, apiKey) {
  if (!taskText || !apiKey) {
    throw new Error("Task and API Key are required.");
  }

  const taskId = Date.now().toString();

  // 1. Group all related tabs into a new Chrome Tab Group for this specific task
  // Create a starting blank tab (or Google) to initialize group isolation
  const tab = await chrome.tabs.create({ url: 'https://www.google.com' });
  const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
  await chrome.tabGroups.update(groupId, {
    title: `Task: ${taskText.substring(0, 15)}...`,
    color: 'blue'
  });

  const task = {
    id: taskId,
    task: taskText,
    apiKey: apiKey,
    status: 'running',
    tabId: tab.id,
    groupId: groupId,
    logs: ['Task initialized.', 'Created a dedicated Chrome Tab Group for isolating this task.'],
    lastCode: '',
    retryCount: 0,
    lastConsoleError: null,
    isStopping: false
  };

  activeTasks.set(taskId, task);
  await saveTasksToStorage();
  updatePopup();

  // 2. Attach debugger to target tab
  try {
    await new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId: tab.id }, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    task.logs.push("Attached Chrome Debugger. Enabling runtime monitoring...");
    await chrome.debugger.sendCommand({ tabId: tab.id }, "Runtime.enable");
    await chrome.debugger.sendCommand({ tabId: tab.id }, "Runtime.addBinding", { name: "sendToExtension" });
    task.logs.push("Runtime tracking and local-storage bindings active.");
    await saveTasksToStorage();
    updatePopup();

    // Start background task loop (don't block the startup return)
    runTaskLoop(taskId);

  } catch (err) {
    task.status = 'error';
    task.logs.push(`Debugger attachment failed: ${err.message}`);
    await saveTasksToStorage();
    updatePopup();
    throw err;
  }

  return { taskId };
}

async function runTaskLoop(taskId) {
  const task = activeTasks.get(taskId);
  if (!task) return;

  try {
    task.logs.push("Parsing task intent with OpenRouter API...");
    await saveTasksToStorage();
    updatePopup();

    // Initial LLM prompt parsing
    let llmResponse = await askOpenRouter(task.task, task.apiKey, null, null);
    let code = cleanGeneratedCode(llmResponse);
    task.lastCode = code;
    task.logs.push("Generated execution logic. Initiating script evaluation...");
    await saveTasksToStorage();
    updatePopup();

    let finished = false;
    while (!finished && !task.isStopping) {
      try {
        task.lastConsoleError = null; // reset console error tracker

        // Run code via DevTools Protocol Runtime.evaluate
        const result = await chrome.debugger.sendCommand(
          { tabId: task.tabId },
          "Runtime.evaluate",
          {
            expression: executionWrapper(code),
            userGesture: true,
            awaitPromise: true,
            returnByValue: true
          }
        );

        if (result.exceptionDetails) {
          const exc = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Execution Exception";
          throw new Error(exc);
        }

        // Check if asynchronous console error triggered failure
        if (task.lastConsoleError) {
          throw new Error(task.lastConsoleError);
        }

        task.logs.push("Command execution succeeded! AI Task complete.");
        task.status = 'completed';
        finished = true;
        await safeDetachDebugger(task.tabId);
        await saveTasksToStorage();
        updatePopup();

      } catch (err) {
        if (task.isStopping) break;

        task.retryCount++;
        task.logs.push(`Error executing command (Attempt ${task.retryCount}): ${err.message}`);
        await saveTasksToStorage();
        updatePopup();

        if (task.retryCount > 3) {
          task.logs.push("Maximum retry limit exceeded. Script halted.");
          task.status = 'error';
          await safeDetachDebugger(task.tabId);
          await saveTasksToStorage();
          updatePopup();
          break;
        }

        task.logs.push("Initiating token-efficient error self-repair. Resolving error...");
        await saveTasksToStorage();
        updatePopup();

        // Token-Efficient Error Handling: send ONLY failed command and exact console error text
        const fixResponse = await askOpenRouter(task.task, task.apiKey, code, err.message);
        code = cleanGeneratedCode(fixResponse);
        task.lastCode = code;
        task.logs.push("Repair code received. Re-evaluating...");
        await saveTasksToStorage();
        updatePopup();
      }
    }
  } catch (err) {
    if (task) {
      task.logs.push(`Fatal Task Execution Failure: ${err.message}`);
      task.status = 'error';
      await safeDetachDebugger(task.tabId);
      await saveTasksToStorage();
      updatePopup();
    }
  }
}

async function askOpenRouter(originalTask, apiKey, failedCode = null, errorText = null) {
  let systemPrompt, userPrompt;

  if (failedCode && errorText) {
    // Strict, minimal token-saving payload containing ONLY the failed command & console error text
    systemPrompt = `You are an expert AI browser automation debugger.
Your only job is to return corrected, raw, executable JavaScript code that fixes the specific error provided.
Do NOT output explanations. Do NOT wrap code in markdown. Output ONLY the raw executable JavaScript.`;

    userPrompt = `Failed Code:
${failedCode}

Console Error / Exception:
${errorText}

Please return the corrected Javascript.`;
  } else {
    // Standard system prompt for parsing task
    systemPrompt = SYSTEM_PROMPT;
    userPrompt = `Task to execute: "${originalTask}"`;
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://chrome-ai-agent-extension",
      "X-Title": "Autonomous AI Browser Agent"
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenRouter API returned status ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  if (!data.choices || data.choices.length === 0) {
    throw new Error("Invalid response structure from OpenRouter API.");
  }

  return data.choices[0].message.content.trim();
}

function cleanGeneratedCode(code) {
  let cleaned = code.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, '');
    cleaned = cleaned.replace(/\n```$/, '');
  }
  return cleaned.trim();
}

async function safeDetachDebugger(tabId) {
  try {
    await new Promise((resolve) => {
      chrome.debugger.detach({ tabId }, () => {
        // Suppress error if already detached
        const err = chrome.runtime.lastError;
        resolve();
      });
    });
  } catch (err) {
    // ignore
  }
}

async function emergencyStopAll() {
  console.log("Emergency stop initiated.");
  for (const [id, task] of activeTasks.entries()) {
    task.isStopping = true;
    task.status = 'stopped';
    task.logs.push("Emergency Stop triggered! Immediately terminating background execution.");
    await safeDetachDebugger(task.tabId);
  }
  await saveTasksToStorage();
  updatePopup();
}

async function stopSpecificTask(taskId) {
  const task = activeTasks.get(taskId);
  if (task) {
    task.isStopping = true;
    task.status = 'stopped';
    task.logs.push("Execution stopped by user request.");
    await safeDetachDebugger(task.tabId);
    await saveTasksToStorage();
    updatePopup();
  }
}

function executionWrapper(llmCode) {
  return `
(async () => {
  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  const waitForSelector = async (selector, timeout = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await delay(200);
    }
    throw new Error("Timeout waiting for selector: " + selector);
  };

  const clickElement = async (selector) => {
    const el = await waitForSelector(selector);
    el.scrollIntoView({ block: 'center' });
    await delay(300);

    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    });
    el.dispatchEvent(clickEvent);
  };

  const typeText = async (selector, text) => {
    const el = await waitForSelector(selector);
    el.scrollIntoView({ block: 'center' });
    await delay(300);
    el.focus();
    el.value = '';

    for (let i = 0; i < text.length; i++) {
      el.value += text[i];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await delay(50);
    }
  };

  const getPageText = async () => {
    return document.body.innerText || '';
  };

  const storeInDB = async (key, data, mimeType = '') => {
    if (typeof sendToExtension === 'function') {
      sendToExtension(JSON.stringify({ action: 'store', key, value: data, mimeType }));
      return "Saved asset: " + key;
    } else {
      throw new Error("sendToExtension binding is not available in page context");
    }
  };

  // User-provided LLM commands
  ${llmCode}
})()
`;
}
