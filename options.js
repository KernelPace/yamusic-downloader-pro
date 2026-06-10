const inputEl = document.getElementById('subfolder');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save');

// Загрузка сохраненного значения при открытии (по умолчанию '1_Music')
chrome.storage.local.get(['subfolder'], (data) => {
  inputEl.value = data.subfolder !== undefined ? data.subfolder : '1_Music';
});

// Сохранение значения
saveBtn.addEventListener('click', () => {
  const value = inputEl.value.trim();
  
  chrome.storage.local.set({ subfolder: value }, () => {
    statusEl.textContent = 'Настройки успешно сохранены!';
    setTimeout(() => {
      statusEl.textContent = '';
    }, 2000);
  });
});