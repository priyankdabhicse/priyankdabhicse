// popup.js - Interactive Controller for AI Browser Agent

import { listAssets, deleteAsset, getAsset } from './db.js';

// DOM Selectors
const apiKeyInput = document.getElementById('apiKey');
const taskInput = document.getElementById('task');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const taskList = document.getElementById('taskList');
const assetList = document.getElementById('assetList');
const refreshAssetsBtn = document.getElementById('refreshAssetsBtn');
const clearBtn = document.getElementById('clearBtn');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Restore saved API Key & last Task if any
  const res = await chrome.storage.local.get(['apiKey', 'lastTask']);
  if (res.apiKey) {
    apiKeyInput.value = res.apiKey;
  }
  if (res.lastTask) {
    taskInput.value = res.lastTask;
  }

  // Initial load
  await updateTasksState();
  await updateAssetsState();

  // Set up periodic updates for running tasks (e.g., logs, status)
  setInterval(updateTasksState, 1000);
});

// Start button listener
startBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const taskText = taskInput.value.trim();

  if (!apiKey) {
    alert("Please enter your OpenRouter API Key.");
    return;
  }
  if (!taskText) {
    alert("Please describe a task to run.");
    return;
  }

  // Save the configuration
  await chrome.storage.local.set({ apiKey, lastTask: taskText });

  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';

  chrome.runtime.sendMessage({ action: 'START_TASK', task: taskText, apiKey }, (response) => {
    startBtn.disabled = false;
    startBtn.textContent = 'Start Task';

    if (response && response.success) {
      taskInput.value = ''; // Clear task input upon successful launch
      chrome.storage.local.set({ lastTask: '' });
      updateTasksState();
    } else {
      const errMsg = response ? response.error : 'No response from service worker.';
      alert(`Failed to start task: ${errMsg}`);
    }
  });
});

// Emergency Stop button listener
stopBtn.addEventListener('click', () => {
  stopBtn.disabled = true;
  stopBtn.textContent = 'Stopping...';

  chrome.runtime.sendMessage({ action: 'EMERGENCY_STOP' }, (response) => {
    stopBtn.disabled = false;
    stopBtn.textContent = 'Emergency Stop';
    if (response && response.success) {
      updateTasksState();
    } else {
      alert("Emergency Stop request failed.");
    }
  });
});

// Clear Tasks listener
clearBtn.addEventListener('click', () => {
  if (confirm("Are you sure you want to clear all tasks from logs?")) {
    chrome.runtime.sendMessage({ action: 'CLEAR_TASKS' }, (response) => {
      if (response && response.success) {
        updateTasksState();
      }
    });
  }
});

// Refresh assets manually
refreshAssetsBtn.addEventListener('click', async () => {
  await updateAssetsState();
});

// Fetch tasks and update DOM
async function updateTasksState() {
  chrome.runtime.sendMessage({ action: 'GET_TASKS_STATE' }, (response) => {
    if (!response || !response.success || !response.tasks) {
      return;
    }

    const tasks = response.tasks;
    if (tasks.length === 0) {
      taskList.innerHTML = '<p class="empty-state">No tasks created yet.</p>';
      return;
    }

    taskList.innerHTML = '';
    tasks.forEach(t => {
      const taskEl = document.createElement('div');
      taskEl.className = 'task-item';

      const taskHeader = document.createElement('div');
      taskHeader.className = 'task-header';

      const taskTitle = document.createElement('span');
      taskTitle.className = 'task-title';
      taskTitle.textContent = t.task;
      taskTitle.title = t.task;

      const statusBadge = document.createElement('span');
      statusBadge.className = `status-badge ${t.status}`;
      statusBadge.textContent = t.status;

      taskHeader.appendChild(taskTitle);
      taskHeader.appendChild(statusBadge);
      taskEl.appendChild(taskHeader);

      // Render logs
      if (t.logs && t.logs.length > 0) {
        const logsContainer = document.createElement('div');
        logsContainer.className = 'task-logs';
        logsContainer.textContent = t.logs.join('\n');

        // Auto-scroll the task logs container to bottom
        setTimeout(() => {
          logsContainer.scrollTop = logsContainer.scrollHeight;
        }, 50);

        taskEl.appendChild(logsContainer);
      }

      // Individual task stop action if still active
      if (t.status === 'running') {
        const rowActions = document.createElement('div');
        rowActions.style.display = 'flex';
        rowActions.style.justifyContent = 'flex-end';
        rowActions.style.marginTop = '6px';

        const stopTaskBtn = document.createElement('button');
        stopTaskBtn.className = 'btn-text';
        stopTaskBtn.style.color = 'var(--danger-color)';
        stopTaskBtn.textContent = 'Stop Execution';
        stopTaskBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: 'STOP_TASK', taskId: t.id }, () => {
            updateTasksState();
          });
        });

        rowActions.appendChild(stopTaskBtn);
        taskEl.appendChild(rowActions);
      }

      taskList.appendChild(taskEl);
    });
  });
}

// Fetch assets from IndexedDB and update DOM
async function updateAssetsState() {
  try {
    const keys = await listAssets();
    if (!keys || keys.length === 0) {
      assetList.innerHTML = '<p class="empty-state">No local assets stored.</p>';
      return;
    }

    assetList.innerHTML = '';
    for (const key of keys) {
      const itemEl = document.createElement('div');
      itemEl.className = 'asset-item';

      const keySpan = document.createElement('span');
      keySpan.className = 'asset-id';
      keySpan.textContent = key;

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'asset-actions';

      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn-text';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', async () => {
        const asset = await getAsset(key);
        if (asset) {
          alert(`Asset details for key "${key}":\n\nContent:\n${typeof asset.value === 'object' ? JSON.stringify(asset.value, null, 2) : asset.value}\n\nMime-Type: ${asset.mimeType || 'None'}`);
        }
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-text';
      delBtn.style.color = 'var(--danger-color)';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        if (confirm(`Delete asset "${key}"?`)) {
          await deleteAsset(key);
          await updateAssetsState();
        }
      });

      actionsDiv.appendChild(viewBtn);
      actionsDiv.appendChild(delBtn);
      itemEl.appendChild(keySpan);
      itemEl.appendChild(actionsDiv);
      assetList.appendChild(itemEl);
    }
  } catch (err) {
    assetList.innerHTML = `<p class="empty-state">Error loading assets: ${err.message}</p>`;
  }
}

// Monitor state update events from background service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'TASK_UPDATED') {
    updateTasksState();
    updateAssetsState();
  }
});
