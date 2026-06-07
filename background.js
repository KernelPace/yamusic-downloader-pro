'use strict';

// Фоновый скрипт отвечает ТОЛЬКО за скачивание файла. 
// Все API-запросы выполняет content.js, так как у него есть доступ к cookies Яндекса.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'YM_DL_DOWNLOAD') {
    (async () => {
      try {
        const { url, filename } = msg.payload;
        
        // Получаем папку из настроек
        const data = await chrome.storage.sync.get(['subfolder']);
        const subfolder = data.subfolder !== undefined ? data.subfolder : '1_Music';
        
        // Очистка от хакерских символов (../../)
        const safeSub = String(subfolder).replace(/^[\/\\]+|[\/\\]+$/g, '').replace(/\.\./g, '_');
        const finalPath = safeSub ? `${safeSub}/${filename}` : filename;

        const downloadId = await chrome.downloads.download({
          url: url,
          filename: finalPath,
          conflictAction: 'uniquify',
          saveAs: false
        });
        
        sendResponse({ ok: true, id: downloadId });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true; // Ждем асинхронного выполнения
  }
});