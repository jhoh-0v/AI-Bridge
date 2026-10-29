const { contextBridge, ipcRenderer } = require('electron');
const allowed = new Set(['GET','START','NEW','PATCH','SUBMIT','NEXT','HELP','EXPORT','HOME','PROFILE','SAVE_PROFILE','OPEN_CHAT','OPEN_SITE','HIGHLIGHT','TOGGLE_COACH','COPY','SAVE_FILE','DOWNLOADS','USE_DOWNLOAD','OPEN_DOWNLOADS','RETRY_CHAT','BROWSER_CHAT']);
allowed.add('PLAN_LESSON');
for(const type of ['INGEST_RESULT','RETRY_COACH','ENABLE_COACH'])allowed.add(type);
for (const type of ['PREPARE_SAMPLE','CHOOSE_SOURCE','START_LESSON','SAVE_PRACTICE_SOURCE','PRACTICE','REPORT_RESULT_ERROR','RECOVER_SENT','RETURN_CHAT','ATTACH_RESULT','SAVE_RESPONSE','REVIEW_CHOICE','REFLECTION_CHOICE','FINISH','ENABLE_HELP','TRY_AGAIN']) allowed.add(type);
contextBridge.exposeInMainWorld('aiBridge', Object.freeze({
  dispatch(message) {
    if (!message || !allowed.has(message.type)) return Promise.reject(new Error('지원하지 않는 작업입니다.'));
    return ipcRenderer.invoke('bridge:command', message).then(r => { if (!r.ok) throw new Error(r.error); return r.value; });
  },
  onStatus(callback) {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('bridge:status', handler);
    return () => ipcRenderer.removeListener('bridge:status', handler);
  },
  onPractice(callback) {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('bridge:practice-state', handler);
    return () => ipcRenderer.removeListener('bridge:practice-state', handler);
  },
  onFlush(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('bridge:flush', async () => {
      try { await callback(); ipcRenderer.send('bridge:flushed', true); }
      catch { ipcRenderer.send('bridge:flushed', false); }
    });
  }
}));
