import { storeData, retrieveData } from "./indexeddb.js";

let activeTabId = null;
let tabGroupId = null;
let isExecutionHalted = false;
let isRecovering = false;
let currentCommandIndex = 0;
let commandsList = [];
let currentCommandObj = null;
let openRouterApiKey = "";
let lastConsoleError = "";

const mainSystemPrompt = `You are an expert AI Browser Agent.
Your task is to convert natural language instructions into a structured sequence of executable browser commands.

You MUST respond ONLY with a JSON array of commands. No explanation, no markdown formatting. Just raw JSON.

Supported Commands:
1. {"command": "navigate", "url": "URL_STRING"} - Navigate active tab to a URL.
2. {"command": "click", "selector": "CSS_SELECTOR"} - Click an element on the page.
3. {"command": "type", "selector": "CSS_SELECTOR", "text": "TEXT_TO_TYPE"} - Fill in a form field.
4. {"command": "wait", "milliseconds": NUMBER} - Wait for a duration.
5. {"command": "evaluate", "js": "JS_CODE_STRING"} - Run custom JavaScript in the page context.
6. {"command": "store", "id": "KEY", "data": "VALUE_OR_OBJECT"} - Store any data directly in local IndexedDB.
7. {"command": "retrieve", "id": "KEY"} - Retrieve data from IndexedDB.

Keep your command sequences logical, robust, and highly efficient.`;

async function logStatus(message) {
  console.log("[AI Agent Log]:", message);
  const result = await chrome.storage.local.get({ logs: [] });
  const logs = result.logs;
  logs.push({ timestamp: Date.now(), text: message });
  await chrome.storage.local.set({ logs: logs, lastStatus: message });

  try {
    await chrome.runtime.sendMessage({ type: "STATUS_UPDATE", message: message, logs: logs });
  } catch (err) {
    // Ignore error if popup is closed
  }
}

async function clearLogs() {
  await chrome.storage.local.set({ logs: [], lastStatus: "Starting..." });
}

async function callOpenRouter(messages) {
  if (!openRouterApiKey) {
    throw new Error("OpenRouter API key is missing. Please set it in the extension settings.");
  }

  const model = "google/gemini-2.5-flash";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openRouterApiKey}`,
        "X-Title": "AI Browser Agent"
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (error) {
    await logStatus(`[ERROR] OpenRouter request failed: ${error.message}`);
    throw error;
  }
}

async function attachDebugger(tabId) {
  return new Promise((resolve) => {
    chrome.debugger.attach({ tabId: tabId }, "1.3", () => {
      if (chrome.runtime.lastError) {
        console.warn("Debugger attach warning/error:", chrome.runtime.lastError.message);
        resolve();
      } else {
        chrome.debugger.sendCommand({ tabId: tabId }, "Console.enable", {}, () => {
          chrome.debugger.sendCommand({ tabId: tabId }, "Runtime.enable", {}, () => {
            logStatus("Debugger attached and listening to tab: " + tabId);
            resolve();
          });
        });
      }
    });
  });
}

async function detachDebugger(tabId) {
  if (!tabId) return;
  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId: tabId }, () => {
      const err = chrome.runtime.lastError; // Ignore if already detached
      resolve();
    });
  });
}

// Monitor Console and Runtime Errors via Debugger API
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  if (isExecutionHalted) return;
  if (source.tabId !== activeTabId) return;

  if (method === "Console.messageAdded") {
    const message = params.message;
    if (message.level === "error") {
      lastConsoleError = `Console Error: ${message.text} at ${message.url || 'unknown'}`;
    }
  } else if (method === "Runtime.exceptionThrown") {
    const exceptionDetails = params.exceptionDetails;
    const desc = exceptionDetails.exception ? (exceptionDetails.exception.description || exceptionDetails.text) : exceptionDetails.text;
    lastConsoleError = `Exception: ${desc}`;
  }
});

async function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);

    chrome.tabs.get(tabId, (tab) => {
      if (tab && tab.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

async function runScriptInTab(tabId, func, args = []) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: func,
    args: args
  });
  if (results && results[0] && results[0].result !== undefined) {
    return results[0].result;
  }
  return null;
}

async function executeSingleCommand(cmdObj) {
  const { command, url, selector, text, milliseconds, js, id, data } = cmdObj;

  switch (command) {
    case "navigate":
      if (!url) throw new Error("Navigate command missing 'url'");
      let targetUrl = url;
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = "https://" + targetUrl;
      }
      await chrome.tabs.update(activeTabId, { url: targetUrl });
      await waitForTabComplete(activeTabId);
      await new Promise(r => setTimeout(r, 2000));
      break;

    case "click":
      if (!selector) throw new Error("Click command missing 'selector'");
      await runScriptInTab(activeTabId, (sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error("Element not found for selector: " + sel);
        el.click();
        return true;
      }, [selector]);
      await new Promise(r => setTimeout(r, 1000));
      break;

    case "type":
      if (!selector) throw new Error("Type command missing 'selector'");
      if (text === undefined) throw new Error("Type command missing 'text'");
      await runScriptInTab(activeTabId, (sel, txt) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error("Element not found for selector: " + sel);
        el.value = txt;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, [selector, text]);
      await new Promise(r => setTimeout(r, 1000));
      break;

    case "wait":
      const delayMs = parseInt(milliseconds || 1000, 10);
      await new Promise(r => setTimeout(r, delayMs));
      break;

    case "evaluate":
      if (!js) throw new Error("Evaluate command missing 'js' code");
      await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        world: "MAIN",
        func: (codeStr) => {
          return new Function(codeStr)();
        },
        args: [js]
      });
      break;

    case "store":
      if (!id) throw new Error("Store command missing 'id'");
      if (data === undefined) throw new Error("Store command missing 'data'");
      await storeData(id, data);
      await logStatus(`Stored item '${id}' in IndexedDB.`);
      break;

    case "retrieve":
      if (!id) throw new Error("Retrieve command missing 'id'");
      const retrieved = await retrieveData(id);
      await logStatus(`Retrieved item '${id}' from IndexedDB: ${JSON.stringify(retrieved)}`);
      break;

    default:
      throw new Error(`Unknown command type: '${command}'`);
  }
}

async function runTaskSequence() {
  isExecutionHalted = false;
  await logStatus(`Starting task sequence with ${commandsList.length} commands.`);

  while (currentCommandIndex < commandsList.length) {
    if (isExecutionHalted) {
      await logStatus("Execution paused or halted.");
      return;
    }

    currentCommandObj = commandsList[currentCommandIndex];
    await logStatus(`[Step ${currentCommandIndex + 1}/${commandsList.length}] Executing: ${JSON.stringify(currentCommandObj)}`);

    // Clear last console error state to ensure fresh capture per step
    lastConsoleError = "";

    try {
      await executeSingleCommand(currentCommandObj);
      currentCommandIndex++;
    } catch (error) {
      if (isExecutionHalted) return;

      // Combine custom execution error with the latest console error if available
      const fullErrorText = lastConsoleError
        ? `${error.message} (Page Console: ${lastConsoleError})`
        : error.message;

      await logStatus(`[ERROR] Failed command: ${JSON.stringify(currentCommandObj)}. Error: ${fullErrorText}`);
      await handleExecutionError(fullErrorText);
      return;
    }
  }

  await logStatus("🎉 Task execution successfully completed!");
  await detachDebugger(activeTabId);
}

async function handleExecutionError(errorText) {
  if (isExecutionHalted) return;
  if (isRecovering) return;
  isRecovering = true;
  isExecutionHalted = true;

  await logStatus(`[RECOVERY] Initiating token-efficient recovery for failed step...`);

  const errorPrompt = [
    {
      role: "system",
      content: "You are an expert debugger for an AI browser agent. Your input is: 1. The exact browser command that failed. 2. The exact console error text. You must output ONLY a valid JSON command object or a corrected JSON array of commands representing the fix. Do not explain anything, do not include markdown blocks. Output raw JSON."
    },
    {
      role: "user",
      content: `Failed Command: ${JSON.stringify(currentCommandObj)}
Error: ${errorText}`
    }
  ];

  try {
    const rawCorrection = await callOpenRouter(errorPrompt);
    if (isExecutionHalted) {
      await logStatus("[RECOVERY] Halted during OpenRouter call. Aborting recovery resume.");
      isRecovering = false;
      return;
    }

    let corrected = null;
    try {
      const cleanedText = rawCorrection.replace(/```json/g, "").replace(/```/g, "").trim();
      corrected = JSON.parse(cleanedText);
    } catch (e) {
      throw new Error(`Failed to parse OpenRouter correction response: ${rawCorrection}`);
    }

    if (isExecutionHalted) {
      isRecovering = false;
      return;
    }

    await logStatus(`[RECOVERY] Received correction: ${JSON.stringify(corrected)}`);

    if (Array.isArray(corrected)) {
      commandsList.splice(currentCommandIndex, 1, ...corrected);
    } else {
      commandsList[currentCommandIndex] = corrected;
    }

    isRecovering = false;
    isExecutionHalted = false;
    await logStatus(`[RECOVERY] Resuming execution from step ${currentCommandIndex + 1}...`);
    await runTaskSequence();
  } catch (err) {
    isRecovering = false;
    await logStatus(`[RECOVERY FAILED] Could not resolve error: ${err.message}`);
    await detachDebugger(activeTabId);
  }
}

async function stopExecution() {
  isExecutionHalted = true;
  isRecovering = false;
  await logStatus("🚨 Emergency Stop initiated! Halting all operations.");

  if (activeTabId) {
    await detachDebugger(activeTabId);
  }

  currentCommandObj = null;
  commandsList = [];
  currentCommandIndex = 0;

  await logStatus("System reset complete. Debugger detached.");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_TASK") {
    (async () => {
      try {
        await clearLogs();
        openRouterApiKey = message.apiKey;
        const task = message.task;

        if (!openRouterApiKey) {
          await logStatus("[ERROR] Missing OpenRouter API Key!");
          return;
        }
        if (!task) {
          await logStatus("[ERROR] Task input is empty!");
          return;
        }

        await logStatus(`Starting task: "${task}"`);
        await logStatus("Sending task to OpenRouter for parsing...");

        const mainPrompt = [
          {
            role: "system",
            content: mainSystemPrompt
          },
          {
            role: "user",
            content: `Generate browser commands to fulfill: "${task}"`
          }
        ];

        const rawResponse = await callOpenRouter(mainPrompt);
        if (isExecutionHalted) {
          await logStatus("Halted during initial parsing call. Aborting.");
          return;
        }

        let parsedCommands = null;
        try {
          const cleanedText = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();
          parsedCommands = JSON.parse(cleanedText);
        } catch (e) {
          throw new Error(`Failed to parse OpenRouter response as JSON: ${rawResponse}`);
        }

        if (isExecutionHalted) return;

        if (!Array.isArray(parsedCommands) || parsedCommands.length === 0) {
          throw new Error("OpenRouter did not return a valid non-empty array of commands.");
        }

        commandsList = parsedCommands;
        currentCommandIndex = 0;

        // Determine initial navigation URL or default to google.com
        let initialUrl = "https://www.google.com";
        if (commandsList[0] && commandsList[0].command === "navigate" && commandsList[0].url) {
          initialUrl = commandsList[0].url;
          if (!/^https?:\/\//i.test(initialUrl)) {
            initialUrl = "https://" + initialUrl;
          }
        }

        await logStatus(`Initializing Chrome tab group...`);
        const tab = await chrome.tabs.create({ url: initialUrl });
        activeTabId = tab.id;

        const groupId = await chrome.tabs.group({ tabIds: [activeTabId] });
        tabGroupId = groupId;
        await chrome.tabGroups.update(groupId, { title: `Task: ${task.substring(0, 15)}...`, color: "blue" });

        await logStatus(`Created tab group. Active Tab ID: ${activeTabId}`);
        await attachDebugger(activeTabId);

        await waitForTabComplete(activeTabId);

        await runTaskSequence();

      } catch (err) {
        await logStatus(`[ERROR] Task start failed: ${err.message}`);
      }
    })();

    sendResponse({ status: "started" });
  } else if (message.type === "EMERGENCY_STOP") {
    stopExecution().then(() => {
      sendResponse({ status: "stopped" });
    });
    return true;
  } else if (message.type === "GET_STATUS") {
    sendResponse({
      activeTabId,
      tabGroupId,
      isExecutionHalted,
      isRecovering,
      currentCommandIndex,
      commandsCount: commandsList.length,
      currentCommandObj
    });
  }
});
