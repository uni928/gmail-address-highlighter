// content.js

// =====================
// スタイル注入
// =====================
function injectStyle() {
  if (document.getElementById('gmail-address-highlighter-style')) return;

  const style = document.createElement('style');
  style.id = 'gmail-address-highlighter-style';
  style.textContent = `
    .gmail-address-highlight {
      background-color: #fff3b0 !important;
      font-weight: bold !important;
      border-radius: 2px;
      padding: 0 3px;
    }
  `;
  document.head.appendChild(style);
}

// =====================
// 登録済みメールアドレス管理
// =====================
let registeredEmails = [];
let highlightTimer = null;
let collectTimer = null;

function loadRegisteredEmails(callback) {
  chrome.storage.sync.get({ registeredEmails: [] }, (items) => {
    registeredEmails = items.registeredEmails || [];
    console.log('[GAH] loaded emails:', registeredEmails);
    if (callback) callback();
  });
}

function getEmailSet() {
  return new Set(registeredEmails.map(e => e.toLowerCase()));
}

// storage 更新を即反映
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.registeredEmails) {
    registeredEmails = changes.registeredEmails.newValue || [];
    console.log('[GAH] storage changed:', registeredEmails);
    scheduleHighlight(1000);
  }
});

// =====================
// 属性ベースのハイライト
// =====================
//
// 画面上の「名前表示」の要素に対して、
// その裏の email / data-hovercard-id / title / aria-label に
// 登録済みメールアドレスが含まれていれば強調クラスを付与する。
//
function highlightByAttributes() {
  if (!registeredEmails || registeredEmails.length === 0) return;

  const emailSet = getEmailSet();
  const root = document.querySelector('div[role="main"]') || document.body;

  const selector = [
    'span[email]',
    'span[data-hovercard-id]',
    'span[title]',
    'span[aria-label]',
    'div[email]',
    'div[data-hovercard-id]',
    'div[title]',
    'div[aria-label]'
  ].join(', ');

  const nodes = root.querySelectorAll(selector);

  nodes.forEach(el => {
    if (el.classList.contains('gmail-address-highlight')) return;

    const candidates = [
      el.getAttribute('email'),
      el.getAttribute('data-hovercard-id'),
      el.getAttribute('title'),
      el.getAttribute('aria-label')
    ].filter(Boolean);

    if (candidates.length === 0) return;

    const lowerCandidates = candidates.map(c => c.toLowerCase());

    let matched = false;
    for (const reg of emailSet) {
      if (!reg) continue;
      for (const c of lowerCandidates) {
        if (c.includes(reg)) {
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (matched) {
      el.classList.add('gmail-address-highlight');
    }
  });
}

function scheduleHighlight(delay = 800) {
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    try {
      highlightByAttributes();
    } catch (e) {
      console.error('[GAH] highlight error:', e);
    }
  }, delay);
}

// =====================
// 「送信済み」欄からの一括収集
// =====================
//
// #sent（送信済み）を開いているときだけ、
// 画面内の email 属性等からメールアドレスを抽出して
// registeredEmails に追加していく。
//
function collectSentAddressesFromDom() {
  // URLハッシュで送信済みか判定（例: #sent, #sent/...）
  if (!location.hash || !location.hash.startsWith('#sent')) {
    return;
  }

  const root = document.querySelector('div[role="main"]') || document.body;

  const selector = [
    'span[email]',
    'span[data-hovercard-id]',
    'span[title]',
    'span[aria-label]',
    'div[email]',
    'div[data-hovercard-id]',
    'div[title]',
    'div[aria-label]'
  ].join(', ');

  const nodes = root.querySelectorAll(selector);
  if (!nodes.length) return;

  const found = new Set();

  nodes.forEach(el => {
    const candidates = [
      el.getAttribute('email'),
      el.getAttribute('data-hovercard-id'),
      el.getAttribute('title'),
      el.getAttribute('aria-label')
    ].filter(Boolean);

    candidates.forEach(c => {
      const val = c.trim();
      // 属性値の中からメールアドレスっぽい部分を全て拾う
      const matches = val.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/ig);
      if (matches) {
        matches.forEach(m => found.add(m.toLowerCase()));
      }
    });
  });

  if (!found.size) return;

  chrome.storage.sync.get({ registeredEmails: [] }, (items) => {
    const existing = new Set((items.registeredEmails || []).map(e => e.toLowerCase()));
    let changed = false;

    found.forEach(email => {
      if (!existing.has(email)) {
        existing.add(email);
        changed = true;
        console.log('[GAH] collected from Sent:', email);
      }
    });

    if (changed) {
      const arr = Array.from(existing);
      chrome.storage.sync.set({ registeredEmails: arr }, () => {
        registeredEmails = arr;
        // 新しく追加されたのでハイライトも更新
        scheduleHighlight(1000);
      });
    }
  });
}

function scheduleCollectSent(delay = 1500) {
  if (collectTimer) clearTimeout(collectTimer);
  collectTimer = setTimeout(() => {
    try {
      collectSentAddressesFromDom();
    } catch (e) {
      console.error('[GAH] collectSent error:', e);
    }
  }, delay);
}

// =====================
// DOM監視（SPA対応）
// =====================
function setupDomObserver() {
  const observer = new MutationObserver(() => {
    // 画面が変わるたびにハイライト
    scheduleHighlight();
    // もし「送信済み」画面なら、アドレス収集もデバウンス付きで実行
    scheduleCollectSent();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  window.addEventListener('hashchange', () => {
    // ラベル遷移時に少し待ってから実行
    scheduleHighlight(1000);
    scheduleCollectSent(2000);
  });

  // 初回：Gmailの描画が一段落するであろう 5秒後に一回
  scheduleHighlight(5000);
  scheduleCollectSent(6000);
}

// =====================
// 初期化
// =====================
function init() {
  try {
    injectStyle();
    loadRegisteredEmails(() => {
      setupDomObserver();
    });
  } catch (e) {
    console.error('[GAH] init error:', e);
  }
}

init();
