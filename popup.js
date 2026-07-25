const apiKeyInput = document.getElementById("apiKey");
const taskInput = document.getElementById("taskInput");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusOutput = document.getElementById("statusOutput");

// Load stored API Key and Task Input
chrome.storage.local.get(["apiKey", "taskInput", "logs", "lastStatus"], (res) => {
  if (res.apiKey) apiKeyInput.value = res.apiKey;
  if (res.taskInput) taskInput.value = res.taskInput;
  if (res.lastStatus) {
    statusOutput.textContent = res.lastStatus;
  }
  if (res.logs && res.logs.length > 0) {
    renderLogs(res.logs);
  }
});

// Save API Key on input change
apiKeyInput.addEventListener("input", () => {
  chrome.storage.local.set({ apiKey: apiKeyInput.value });
});

// Save Task Input on input change
taskInput.addEventListener("input", () => {
  chrome.storage.local.set({ taskInput: taskInput.value });
});

function renderLogs(logs) {
  statusOutput.textContent = logs
    .map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.text}`)
    .join("\n");
  statusOutput.scrollTop = statusOutput.scrollHeight;
}

// Start Action
startBtn.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  const task = taskInput.value.trim();

  if (!apiKey) {
    statusOutput.textContent = "Error: Please enter your OpenRouter API Key.";
    return;
  }
  if (!task) {
    statusOutput.textContent = "Error: Please enter a natural language task.";
    return;
  }

  statusOutput.textContent = "Starting task workflow...\nInitializing Chrome tab group...";

  chrome.runtime.sendMessage({
    type: "START_TASK",
    apiKey: apiKey,
    task: task
  }, (response) => {
    if (chrome.runtime.lastError) {
      statusOutput.textContent = "Error: " + chrome.runtime.lastError.message;
    } else {
      console.log("Background response:", response);
    }
  });
});

// Emergency Stop Action
stopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "EMERGENCY_STOP" }, (response) => {
    if (chrome.runtime.lastError) {
      statusOutput.textContent = "Error sending Emergency Stop: " + chrome.runtime.lastError.message;
    } else {
      statusOutput.textContent = "🚨 Emergency Stop triggered!\nOperations halted & debugger detached.";
    }
  });
});

// Listen for status updates from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "STATUS_UPDATE") {
    if (message.logs) {
      renderLogs(message.logs);
    } else if (message.message) {
      statusOutput.textContent = message.message;
    }
  }
});
