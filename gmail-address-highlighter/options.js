const textarea = document.getElementById('emails');
const saveButton = document.getElementById('save');
const status = document.getElementById('status');

// 保存されているメールアドレスを読み込んで表示
function restoreOptions() {
  chrome.storage.sync.get(
    { registeredEmails: [] },
    (items) => {
      const emails = items.registeredEmails || [];
      textarea.value = emails.join(', ');
    }
  );
}

// 入力内容を保存
function saveOptions() {
  const raw = textarea.value || '';
  // カンマ・読点・改行・スペース等で分割
  const emails = raw
    .split(/[,、\s]+/)
    .map(e => e.trim())
    .filter(e => e.length > 0);

  chrome.storage.sync.set(
    { registeredEmails: emails },
    () => {
      status.textContent = '保存しました。';
      setTimeout(() => { status.textContent = ''; }, 1500);
    }
  );
}

document.addEventListener('DOMContentLoaded', restoreOptions);
saveButton.addEventListener('click', saveOptions);
