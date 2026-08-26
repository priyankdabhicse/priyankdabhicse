/**
 * Subway Surfers Bot AI - Popup Controller Script
 * Handles UI interactions, updates settings, communicates with content script & background worker.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const settingsManager = window.BotSettings;
  const currentSettings = await settingsManager.load();

  // DOM Element Bindings
  const statusBadge = document.getElementById('statusBadge');
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  const btnPause = document.getElementById('btnPause');
  const btnResume = document.getElementById('btnResume');
  const btnAutoDetect = document.getElementById('btnAutoDetect');

  const controlMethod = document.getElementById('controlMethod');
  const reactionSpeed = document.getElementById('reactionSpeed');
  const speedValue = document.getElementById('speedValue');
  const safetyLevel = document.getElementById('safetyLevel');
  const hideUiMode = document.getElementById('hideUiMode');
  const debugMode = document.getElementById('debugMode');
  const showStats = document.getElementById('showStats');

  // Populate UI with current saved settings
  controlMethod.value = currentSettings.controlMethod || 'auto';
  reactionSpeed.value = currentSettings.reactionSpeed || 85;
  speedValue.textContent = `${currentSettings.reactionSpeed || 85}%`;
  safetyLevel.value = currentSettings.safetyLevel || 'high';
  hideUiMode.value = currentSettings.hideUiMode || 'original';
  debugMode.checked = !!currentSettings.debugMode;
  showStats.checked = !!currentSettings.showStats;

  // Poll current active tab status
  queryActiveTabStatus();
  setInterval(queryActiveTabStatus, 1000);

  // Button Action Listeners
  btnStart.addEventListener('click', () => sendBotCommand('TOGGLE_BOT', { enabled: true }));
  btnStop.addEventListener('click', () => sendBotCommand('TOGGLE_BOT', { enabled: false }));
  btnPause.addEventListener('click', () => sendBotCommand('PAUSE_BOT'));
  btnResume.addEventListener('click', () => sendBotCommand('RESUME_BOT'));
  btnAutoDetect.addEventListener('click', () => sendBotCommand('AUTO_DETECT'));

  // Settings Change Listeners
  controlMethod.addEventListener('change', () => updateSetting('controlMethod', controlMethod.value));
  reactionSpeed.addEventListener('input', () => {
    speedValue.textContent = `${reactionSpeed.value}%`;
  });
  reactionSpeed.addEventListener('change', () => updateSetting('reactionSpeed', parseInt(reactionSpeed.value, 10)));
  safetyLevel.addEventListener('change', () => updateSetting('safetyLevel', safetyLevel.value));
  hideUiMode.addEventListener('change', () => updateSetting('hideUiMode', hideUiMode.value));
  debugMode.addEventListener('change', () => updateSetting('debugMode', debugMode.checked));
  showStats.addEventListener('change', () => updateSetting('showStats', showStats.checked));

  async function updateSetting(key, value) {
    await settingsManager.save({ [key]: value, enabled: currentSettings.enabled });
  }

  function sendBotCommand(type, extra = {}) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return;

      if (type === 'TOGGLE_BOT') {
        settingsManager.save({ enabled: extra.enabled, paused: false });
      } else if (type === 'PAUSE_BOT') {
        settingsManager.save({ paused: true });
      } else if (type === 'RESUME_BOT') {
        settingsManager.save({ paused: false });
      }

      chrome.tabs.sendMessage(tabs[0].id, { type, ...extra }, (response) => {
        if (chrome.runtime.lastError) {
          updateStatusUI('BOT: SEARCHING', false, false);
          return;
        }
        if (response && response.status) {
          updateStatusUI(response.status, response.isRunning, response.isPaused);
        }
      });
    });
  }

  function queryActiveTabStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
          updateStatusUI('BOT: OFFLINE', false, false);
          return;
        }
        if (response) {
          updateStatusUI(response.status, response.isRunning, response.isPaused);
        }
      });
    });
  }

  function updateStatusUI(statusText, isRunning, isPaused) {
    statusBadge.textContent = statusText;
    statusBadge.className = 'status-badge ' + (
      statusText.includes('PLAYING') ? 'playing' :
      statusText.includes('PAUSED') ? 'paused' :
      statusText.includes('SEARCHING') ? 'searching' :
      statusText.includes('ERROR') ? 'error' : 'offline'
    );

    btnStart.disabled = isRunning;
    btnStop.disabled = !isRunning;
    btnPause.disabled = !isRunning || isPaused;
    btnResume.disabled = !isRunning || !isPaused;
  }
});
