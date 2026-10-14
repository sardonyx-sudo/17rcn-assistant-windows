// app.js - 扶輪公益網 AI 助手 正式版前端核心
// 完整串接 Python pywebview API、Google Apps Script 與 17rcn 跨視窗注入

let currentTab = 'capture';
let photos = [null, null, null]; // 3 個照片槽位 (DataUrl / Base64)
let queueData = [];
let processingData = [];
let skippedData = [];
let isRefreshing = false;
let lastFetchTime = 0;
let imageCacheBuster = Date.now(); // 圖片快取破除戳記，避免瀏覽器負向快取
let currentConfig = {};

// DOM 元素快取
const btnHeaderRefresh = document.getElementById('btnHeaderRefresh');
const refreshSpinIcon = document.getElementById('refreshSpinIcon');
const toastEl = document.getElementById('toastMessage');
const statusTextEl = document.querySelector('.status-text');
const statusDotEl = document.querySelector('.status-dot');

let isAppInitialized = false;

function checkAndInitApp() {
  if (isAppInitialized) return;
  if (window.pywebview && window.pywebview.api) {
    isAppInitialized = true;
    initApp();
  }
}

// 監聽 pywebview ready
window.addEventListener('pywebviewready', checkAndInitApp);

// 頁面載入時亦立即檢測
document.addEventListener('DOMContentLoaded', () => {
  // 1. 初始保證所有徽章與數字隱藏，不顯示之前測試用的數字
  updateBadges();

  // 2. 檢測 pywebview 連線
  checkAndInitApp();

  // 3. 僅在獨立瀏覽器且網址明確帶有 ?mock=1 時才手動載入測試假資料，防止正式版搶先顯示假數字
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mock') === '1' && typeof MockDB !== 'undefined') {
    setTimeout(() => {
      if (!isAppInitialized) {
        console.warn('[UI] 處於手動 Mock 預覽模式');
        queueData = [...MockDB.queueItems];
        processingData = [...MockDB.processingItems];
        skippedData = [...MockDB.skippedItems];
        renderQueueCards();
        renderProcessingCards();
        renderSkippedCards();
        updateBadges();
      }
    }, 600);
  }
});

/**
 * 應用程式初始化
 */
async function initApp() {
  console.log('[UI] pywebview 連線就緒，正在載入設定與物資佇列...');
  
  // 1. 讀取本機偏好設定
  try {
    if (window.pywebview && window.pywebview.api) {
      currentConfig = await window.pywebview.api.get_config();
      applyConfigToUI(currentConfig);
    }
  } catch (e) {
    console.error('[UI] 讀取設定失敗:', e);
  }

  // 2. 初始載入佇列 (背景靜默連線)
  await fetchQueueData(true);

  // 3. 預設顯示拍照採集分頁
  switchTab('capture');
}

function applyConfigToUI(cfg) {
  if (!cfg) return;
  const gasInput = document.getElementById('settingGasUrl');
  const addrInput = document.getElementById('settingDefaultAddress');
  const uploaderInput = document.getElementById('settingUploaderName');
  const captureAddrInput = document.getElementById('inputAddress');

  if (gasInput && cfg.gas_url) gasInput.value = cfg.gas_url;
  if (addrInput && cfg.default_address) {
    addrInput.value = cfg.default_address;
    if (captureAddrInput && !captureAddrInput.value) {
      captureAddrInput.value = cfg.default_address;
    }
  }
  if (uploaderInput && cfg.uploader_name) uploaderInput.value = cfg.uploader_name;
  const preloadInput = document.getElementById('settingPreloadPhotos');
  if (preloadInput && cfg.preload_photos !== undefined) {
    preloadInput.checked = (cfg.preload_photos !== false);
  }
}

// ─────────────────────────────────────────────────────────────
// 1. 分頁切換與「🔄 刷新」按鈕動態顯隱控制
// ─────────────────────────────────────────────────────────────
function switchTab(tabName) {
  currentTab = tabName;

  // 1. 更新底部導航欄高亮
  const navTabs = ['capture', 'queue', 'pending', 'settings'];
  navTabs.forEach(name => {
    const navBtn = document.getElementById(`navBtn${capitalize(name)}`);
    const panel = document.getElementById(`panel${capitalize(name)}`);
    if (navBtn) navBtn.classList.toggle('active', name === tabName);
    if (panel) panel.classList.toggle('active', name === tabName);
  });

  // 2. ⚠️ 關鍵邏輯：「刷新」按鈕只在切換到「物資佇列 (queue)」時出現！
  if (tabName === 'queue') {
    btnHeaderRefresh.style.display = 'inline-flex';
    // 進入佇列時若無資料或距離上次整理超過 30 秒，自動靜默同步一次
    if ((queueData.length === 0 || Date.now() - lastFetchTime > 30000) && !isRefreshing) {
      fetchQueueData(true);
    }
  } else {
    btnHeaderRefresh.style.display = 'none';
  }

  // 捲動回頂部
  const mainContent = document.querySelector('.main-content');
  if (mainContent) mainContent.scrollTop = 0;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────
// 2. 雲端資料同步 (Fetch Queue Data)
// ─────────────────────────────────────────────────────────────
async function fetchQueueData(silent = false) {
  if (isRefreshing) return;
  isRefreshing = true;

  imageCacheBuster = Date.now(); // 每次刷新時更新時間戳，強制瀏覽器破除負向快取向 Google Drive 重新請求

  if (refreshSpinIcon) refreshSpinIcon.classList.add('spinning');
  if (btnHeaderRefresh) btnHeaderRefresh.disabled = true;

  if (!silent) {
    setConnectionStatus('syncing', '同步佇列中...');
  }

  try {
    if (window.pywebview && window.pywebview.api) {
      const res = await window.pywebview.api.get_queue_data();
      if (res && res.success) {
        lastFetchTime = Date.now();
        queueData = res.items || [];
        processingData = res.processingItems || [];
        skippedData = res.skippedItems || [];
        renderQueueCards();
        renderProcessingCards();
        renderSkippedCards();
        updateBadges();
        setConnectionStatus('connected', `已連線 (待刊 ${queueData.length} 筆)`);
        if (!silent) {
          showToast(`✅ 佇列已同步！共 ${queueData.length} 筆待刊登物資`);
        }
      } else {
        const errMsg = res ? res.error : '連線失敗';
        setConnectionStatus('error', '連線異常');
        if (!silent) showToast(`⚠️ 同步失敗：${errMsg}`);
      }
    }
  } catch (err) {
    console.error('[UI] fetchQueueData error:', err);
    setConnectionStatus('error', '連線逾時');
    if (!silent) showToast(`❌ 連線錯誤: ${err.message || err}`);
  } finally {
    if (refreshSpinIcon) refreshSpinIcon.classList.remove('spinning');
    if (btnHeaderRefresh) btnHeaderRefresh.disabled = false;
    isRefreshing = false;
  }
}

function handleRefreshQueue() {
  fetchQueueData(false);
}

function setConnectionStatus(state, text) {
  if (statusTextEl) statusTextEl.textContent = text;
  if (statusDotEl) {
    if (state === 'connected') {
      statusDotEl.style.backgroundColor = '#10B981';
      statusDotEl.style.boxShadow = '0 0 6px rgba(16, 185, 129, 0.8)';
    } else if (state === 'syncing') {
      statusDotEl.style.backgroundColor = '#F59E0B';
      statusDotEl.style.boxShadow = '0 0 6px rgba(245, 158, 11, 0.8)';
    } else {
      statusDotEl.style.backgroundColor = '#EF4444';
      statusDotEl.style.boxShadow = '0 0 6px rgba(239, 68, 68, 0.8)';
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 3. 拍照採集互動（槽位選擇、拖曳、貼上、壓圖、上傳）
// ─────────────────────────────────────────────────────────────
function triggerFileInput(slotIndex) {
  const input = document.getElementById(`fileInput${slotIndex}`);
  if (input) input.click();
}

function handleFileChosen(event, slotIndex) {
  const file = event.target.files[0];
  if (!file) return;
  compressAndSetSlot(file, slotIndex);
}

function handleDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add('drag-over');
}

function handleDragLeave(event, slotIndex) {
  event.currentTarget.classList.remove('drag-over');
}

function handleDrop(event, slotIndex) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');

  const files = event.dataTransfer.files;
  if (!files || files.length === 0) return;

  let currentSlot = slotIndex;
  for (let i = 0; i < files.length && currentSlot <= 3; i++) {
    const file = files[i];
    if (file.type.startsWith('image/')) {
      compressAndSetSlot(file, currentSlot);
      currentSlot++;
    }
  }
}

// 監聽鍵盤 Ctrl+V 剪貼簿貼上圖片
document.addEventListener('paste', (event) => {
  if (currentTab !== 'capture') return;
  const items = (event.clipboardData || event.originalEvent.clipboardData).items;
  for (let item of items) {
    if (item.type.indexOf('image') === 0) {
      const file = item.getAsFile();
      // 尋找第一個空槽位
      const emptyIndex = photos.findIndex(p => p === null);
      const targetSlot = (emptyIndex !== -1 ? emptyIndex : 0) + 1;
      compressAndSetSlot(file, targetSlot);
      showToast(`📋 已從剪貼簿貼入相片 ${targetSlot}！`);
      break;
    }
  }
});

/**
 * 前端 Canvas 極速壓圖 (等比縮放至長邊 1280px, 85% JPEG 品質)
 */
function compressAndSetSlot(file, slotIndex) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 1280;

      if (width > height && width > MAX_SIZE) {
        height = Math.round((height * MAX_SIZE) / width);
        width = MAX_SIZE;
      } else if (height > MAX_SIZE) {
        width = Math.round((width * MAX_SIZE) / height);
        height = MAX_SIZE;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setSlotPhoto(slotIndex, compressedDataUrl, file.name);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function setSlotPhoto(slotIndex, dataUrl, fileName = '') {
  photos[slotIndex - 1] = {
    dataUrl: dataUrl,
    name: fileName || `photo_${slotIndex}.jpg`
  };
  const slotEl = document.getElementById(`slot${slotIndex}`);
  const previewEl = document.getElementById(`preview${slotIndex}`);
  
  if (slotEl && previewEl) {
    previewEl.src = dataUrl;
    slotEl.classList.add('has-image');
  }
  updatePhotoBadge();
}

function removePhoto(event, slotIndex) {
  event.stopPropagation();
  photos[slotIndex - 1] = null;
  const slotEl = document.getElementById(`slot${slotIndex}`);
  const previewEl = document.getElementById(`preview${slotIndex}`);
  const inputEl = document.getElementById(`fileInput${slotIndex}`);

  if (slotEl && previewEl) {
    previewEl.src = '';
    slotEl.classList.remove('has-image');
  }
  if (inputEl) inputEl.value = '';
  updatePhotoBadge();
}

function updatePhotoBadge() {
  const count = photos.filter(p => p !== null).length;
  const badge = document.getElementById('photoCountBadge');
  if (badge) badge.textContent = `${count} / 3 張`;
}

function clearAllPhotos() {
  for (let i = 1; i <= 3; i++) {
    removePhoto({ stopPropagation: () => {} }, i);
  }
}

function loadSamplePhotos() {
  const sample1 = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%23DBEAFE'/><text x='50%25' y='50%25' font-size='20' text-anchor='middle' fill='%231E40AF' font-weight='bold'>測試相片 1: 外觀</text></svg>";
  const sample2 = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%23DCFCE7'/><text x='50%25' y='50%25' font-size='20' text-anchor='middle' fill='%2315803D' font-weight='bold'>測試相片 2: 標籤</text></svg>";
  setSlotPhoto(1, sample1, 'sample_front.jpg');
  setSlotPhoto(2, sample2, 'sample_label.jpg');
  showToast('已載入 2 張測試相片');
}

function clearInput(id) {
  const el = document.getElementById(id);
  if (el) el.value = '';
}

/**
 * 送出採集物資直傳 GAS
 */
async function handleSubmitCapture() {
  const validPhotos = photos.filter(p => p !== null);
  if (validPhotos.length === 0) {
    showToast('⚠️ 請至少拍攝或上傳 1 張相片');
    return;
  }

  const btn = document.getElementById('btnSubmitCapture');
  const btnText = document.getElementById('btnSubmitText');
  btn.disabled = true;
  btnText.textContent = '⏳ 上傳中，正在寫入 Google Drive 與試算表...';

  // 整理上傳封包
  const photosPayload = validPhotos.map((p, idx) => {
    const b64 = p.dataUrl.split(',')[1] || p.dataUrl;
    return {
      name: p.name || `photo_${idx+1}.jpg`,
      mimeType: 'image/jpeg',
      base64: b64
    };
  });

  const address = document.getElementById('inputAddress').value.trim();
  const note = document.getElementById('inputNotes').value.trim();
  const uploader = (document.getElementById('settingUploaderName').value || '').trim();

  try {
    if (window.pywebview && window.pywebview.api) {
      const res = await window.pywebview.api.upload_goods({
        photos: photosPayload,
        address: address,
        note: note,
        uploader: uploader
      });

      if (res && res.success) {
        // 彈出成功 Modal
        document.getElementById('uploadSuccessModal').classList.add('active');
        // 背景重新同步佇列
        fetchQueueData(true);
      } else {
        const err = res ? res.error : '上傳失敗';
        showToast(`❌ 上傳失敗: ${err}`);
      }
    } else {
      // 離線預覽模擬
      setTimeout(() => {
        document.getElementById('uploadSuccessModal').classList.add('active');
      }, 1000);
    }
  } catch (err) {
    showToast(`❌ 上傳異常: ${err.message || err}`);
  } finally {
    btn.disabled = false;
    btnText.textContent = '一鍵上傳並啟動 AI 辨識';
  }
}

function handleContinueCapture() {
  document.getElementById('uploadSuccessModal').classList.remove('active');
  clearAllPhotos();
  document.getElementById('inputNotes').value = '';
  showToast('可以繼續新增下一件物資囉！');
}

function handleGoToQueue() {
  document.getElementById('uploadSuccessModal').classList.remove('active');
  clearAllPhotos();
  switchTab('queue');
}

// ─────────────────────────────────────────────────────────────
// 4. 物資佇列渲染 (Queue Cards)
// ─────────────────────────────────────────────────────────────
function renderQueueCards() {
  const container = document.getElementById('queueCardsContainer');
  const totalCountEl = document.getElementById('queueTotalCount');
  if (totalCountEl) totalCountEl.textContent = queueData.length;

  if (queueData.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 12px; color: #94A3B8;">
        <div style="font-size: 42px; margin-bottom: 10px;">🎉</div>
        <div style="font-weight: 700; font-size: 15px; color: #475569;">目前沒有待刊登物資</div>
        <div style="font-size: 12.5px; margin-top: 5px;">外勤拍攝的照片會自動出現在此處，或可於「拍照採集」上傳</div>
      </div>
    `;
    return;
  }

  container.innerHTML = queueData.map(item => {
    const row = item.row || item.id;
    const isLocked = item.isLocked || (item.status && item.status.includes('刊登中'));
    const cardClass = isLocked ? 'goods-card is-locked' : 'goods-card';
    const statusBadge = isLocked 
      ? `<span class="card-status-badge badge-locked">🔒 刊登中</span>`
      : `<span class="card-status-badge badge-ready">待刊登</span>`;

    const photosList = item.photos || [];
    const thumbsHtml = photosList.map((p, idx) => {
      const fileId = p.fileId || '';
      const origUrl = p.originalUrl || p.thumbnailUrl || '';
      const downUrl = p.downloadUrl || (fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : origUrl);
      const buster = imageCacheBuster || Date.now();
      const initUrl = p.thumbnailUrl 
        ? `${p.thumbnailUrl}${p.thumbnailUrl.includes('?') ? '&' : '?'}_t=${buster}` 
        : (origUrl ? `${origUrl}${origUrl.includes('?') ? '&' : '?'}_t=${buster}` : '');

      return `
        <img class="card-thumb-item" 
             src="${escapeHtml(initUrl)}" 
             alt="縮圖${idx+1}" 
             data-file-id="${escapeHtml(fileId)}"
             data-orig-url="${escapeHtml(origUrl)}"
             data-down-url="${escapeHtml(downUrl)}"
             data-fallback-step="0"
             onerror="handleThumbError(this)" 
             onclick="handleThumbClick(event, this, '${escapeQuotes(item.title)} (相片 ${idx+1})')" 
             loading="lazy">
      `;
    }).join('');

    const lockNoticeHtml = isLocked ? `
      <div class="locked-notice-box">
        <span>⚠️</span>
        <span><b>${item.lockOwner || '其他同仁'}</b> 正在刊登中（防止雙重送出）</span>
      </div>
    ` : '';

    const injectBtnDisabled = isLocked ? 'disabled' : '';
    const condStr = String(item.conditionText || item.condition || '').toLowerCase();
    const condDisplay = (condStr.includes('new') || condStr === '1' || condStr.includes('全新')) ? '全新' : '二手';
    const priceDisplay = Number(item.price || 0).toLocaleString();

    return `
      <div class="${cardClass}" id="card_row_${row}">
        <div class="card-top-row">
          <span class="card-category-tag">🏷️ ${item.category1Name || item.category1_name || item.cat1_name || '未分類'} ➔ ${item.category2Name || item.category2_name || item.cat2_name || '通用'}</span>
          ${statusBadge}
        </div>

        <div class="card-uploader-tag">
          <span>By:</span>
          <span class="uploader-name">${item.uploader || '未具名'}</span>
          <span style="margin-left: auto; font-size: 11px; color:#94A3B8;">列號 #${row}</span>
        </div>

        ${thumbsHtml ? `<div class="card-thumbs-row">${thumbsHtml}</div>` : ''}

        <h3 class="card-title">${item.title || '無品名'}</h3>

        <div class="card-meta-pills">
          <span class="meta-pill">數量: ${item.quantity || 1} 件</span>
          <span class="meta-pill">新舊: ${condDisplay}</span>
          <span class="meta-pill meta-pill-price">預估單價: NT$ ${priceDisplay}</span>
        </div>

        <div class="card-address">
          <span>📍</span>
          <span>${item.address || '取件地址未填寫'}</span>
        </div>

        ${item.description ? `<div class="card-description-box">${item.description}</div>` : ''}

        ${lockNoticeHtml}

        <div class="card-actions-wrapper">
          <button type="button" class="btn-inject-cta" id="btnInject_${row}" ${injectBtnDisabled} onclick="handleInjectItem(${row})">
            <span>🚀 一鍵帶入此筆 (含照片)</span>
          </button>

          <div class="card-secondary-btns">
            ${isLocked ? `
              <button type="button" class="btn-card-sub btn-unlock-amber" onclick="handleUnlockItem(${row})">
                <span>🔓 解除鎖定</span>
              </button>
            ` : `
              <button type="button" class="btn-card-sub" id="btnReprocess_${row}" onclick="handleReprocessItem(${row})">
                <span>🔄 重新辨識</span>
              </button>
            `}
            <button type="button" class="btn-card-sub" onclick="handleSkipItem(${row})">
              <span>⏩ 略過</span>
            </button>
            <button type="button" class="btn-card-sub btn-delete-red" onclick="handleDeleteItem(${row})">
              <span>🗑️ 刪除</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ─────────────────────────────────────────────────────────────
// 5. 待處理渲染 (Processing & Skipped)
// ─────────────────────────────────────────────────────────────
function renderProcessingCards() {
  const container = document.getElementById('processingCardsContainer');
  const countBadge = document.getElementById('processingCountBadge');
  if (countBadge) {
    countBadge.textContent = processingData.length;
    countBadge.style.display = processingData.length > 0 ? 'inline-block' : 'none';
  }

  if (processingData.length === 0) {
    container.innerHTML = `<div style="font-size: 12px; color: #94A3B8; padding: 6px 0;">目前無正在辨識中的物資</div>`;
    return;
  }

  container.innerHTML = processingData.map(item => `
    <div class="goods-card processing-card">
      <div class="card-top-row">
        <span class="card-category-tag">⏳ AI 分析中...</span>
        <span class="card-status-badge" style="background:#BAE6FD; color:#0284C7;">辨識中</span>
      </div>
      <div class="card-uploader-tag">
        <span>上傳者:</span>
        <span class="uploader-name">${item.uploader || '志工'}</span>
        <span style="margin-left: auto; font-size: 11px; color:#64748B;">${item.timestamp || '剛剛'}</span>
      </div>
      <h3 class="card-title">${item.title || '新物資 (Gemini 多模態視覺分析中)'}</h3>
      <div class="card-address">📍 ${item.address || '地址待確認'}</div>
      <div style="font-size: 11.5px; color: #0284C7; margin-top: 6px;">
        💡 雲端 AI 正在分析照片品名與分類，分析完成後將自動移至「物資佇列」。
      </div>
    </div>
  `).join('');
}

function renderSkippedCards() {
  const container = document.getElementById('skippedCardsContainer');
  const countBadge = document.getElementById('skippedCountBadge');
  if (countBadge) {
    countBadge.textContent = skippedData.length;
    countBadge.style.display = skippedData.length > 0 ? 'inline-block' : 'none';
  }

  if (skippedData.length === 0) {
    container.innerHTML = `<div style="font-size: 12px; color: #94A3B8; padding: 6px 0;">目前無略過項目</div>`;
    return;
  }

  container.innerHTML = skippedData.map(item => {
    const row = item.row || item.id;
    return `
      <div class="goods-card" style="opacity: 0.9;">
        <div class="card-top-row">
          <span class="card-category-tag">🏷️ ${item.category1Name || item.cat1_name || '已略過物資'}</span>
          <span class="card-status-badge" style="background:#F1F5F9; color:#64748B;">略過暫存</span>
        </div>
        <h3 class="card-title">${item.title || '無品名'}</h3>
        <div class="card-actions-wrapper">
          <button type="button" class="btn-card-sub" style="border-color:#10B981; color:#047857; font-weight:700;" onclick="handleRestoreItem(${row})">
            <span>↩️ 一鍵復原回「物資佇列」</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function updateBadges() {
  const qBadge = document.getElementById('navBadgeQueue');
  const pBadge = document.getElementById('navBadgePending');
  const qTotal = document.getElementById('queueTotalCount');
  const procBadge = document.getElementById('processingCountBadge');
  const skipBadge = document.getElementById('skippedCountBadge');

  const qCount = queueData ? queueData.length : 0;
  const procCount = processingData ? processingData.length : 0;
  const skipCount = skippedData ? skippedData.length : 0;
  const pCount = procCount + skipCount;

  // 1. 底部導航欄：物資佇列徽章 (大於 0 才顯示)
  if (qBadge) {
    qBadge.textContent = qCount;
    qBadge.style.display = qCount > 0 ? 'inline-block' : 'none';
  }

  // 2. 底部導航欄：待處理徽章 (大於 0 才顯示)
  if (pBadge) {
    pBadge.textContent = pCount;
    pBadge.style.display = pCount > 0 ? 'inline-block' : 'none';
  }

  // 3. 物資佇列頂部統計總數
  if (qTotal) {
    qTotal.textContent = qCount;
  }

  // 4. 待處理子區塊計數徽章
  if (procBadge) {
    procBadge.textContent = procCount;
    procBadge.style.display = procCount > 0 ? 'inline-block' : 'none';
  }
  if (skipBadge) {
    skipBadge.textContent = skipCount;
    skipBadge.style.display = skipCount > 0 ? 'inline-block' : 'none';
  }
}

// ─────────────────────────────────────────────────────────────
// 6. 卡片核心按鈕操作 (呼叫真實 Python API)
// ─────────────────────────────────────────────────────────────

// 一鍵帶入 (觸發跨視窗自動填表與相片掛載)
async function handleInjectItem(row) {
  const item = queueData.find(i => (i.row === row || i.id === row));
  if (!item) return;

  const btn = document.getElementById(`btnInject_${row}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ 正在下載照片並填入表單...</span>';
  }

  showToast(`⚡ 正在向「扶輪公益網」視窗自動注入：${item.title || '物資'}`);

  try {
    if (window.pywebview && window.pywebview.api) {
      const res = await window.pywebview.api.prepare_and_inject_goods(item);
      if (res && res.success) {
        showToast('✅ 資料與相片已自動填入！請確認後輸入驗證碼送出');
        // 本地暫時標記為刊登中
        item.isLocked = true;
        renderQueueCards();
      } else {
        const err = res ? res.error : '注入失敗';
        showToast(`⚠️ 無法刊登：${err}`);
        // 重新同步狀態
        fetchQueueData(true);
      }
    }
  } catch (err) {
    showToast(`❌ 帶入失敗: ${err.message || err}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🚀 一鍵帶入此筆 (含照片)</span>';
    }
  }
}

// 解除鎖定
async function handleUnlockItem(row) {
  showToast(`🔓 正在向雲端解除第 ${row} 列鎖定...`);
  try {
    if (window.pywebview && window.pywebview.api) {
      const res = await window.pywebview.api.unlock_goods(row);
      if (res && res.success) {
        showToast('✅ 已成功解除鎖定！');
        fetchQueueData(true);
      } else {
        showToast(`⚠️ 解鎖失敗: ${res ? res.error : '伺服器異常'}`);
      }
    }
  } catch (e) {
    showToast(`❌ 解鎖錯誤: ${e.message || e}`);
  }
}

// 重新辨識 (10 秒冷卻倒數)
async function handleReprocessItem(row) {
  const btn = document.getElementById(`btnReprocess_${row}`);
  if (btn) {
    btn.disabled = true;
    let remaining = 10;
    btn.innerHTML = `<span>⏳ 冷卻中 (${remaining}s)</span>`;
    const timer = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        btn.innerHTML = `<span>⏳ 冷卻中 (${remaining}s)</span>`;
      } else {
        clearInterval(timer);
        btn.disabled = false;
        btn.innerHTML = `<span>🔄 重新辨識</span>`;
      }
    }, 1000);
  }

  showToast(`🔄 已向雲端發送第 ${row} 列重辨請求...`);
  try {
    if (window.pywebview && window.pywebview.api) {
      const res = await window.pywebview.api.reprocess_goods(row);
      if (res && res.success) {
        showToast('✅ 已排入重新辨識佇列！');
        fetchQueueData(true);
      } else {
        showToast(`⚠️ 重辨失敗: ${res ? res.error : '異常'}`);
      }
    }
  } catch (e) {
    showToast(`❌ 重辨異常: ${e.message || e}`);
  }
}

// 略過物資
async function handleSkipItem(row) {
  showToast(`⏩ 正在將第 ${row} 列移至已略過...`);
  try {
    if (window.pywebview && window.pywebview.api) {
      const res = await window.pywebview.api.skip_goods(row);
      if (res && res.success) {
        showToast('✅ 已略過，移至「待處理」分頁');
        fetchQueueData(true);
      }
    }
  } catch (e) {
    showToast(`❌ 略過失敗: ${e.message || e}`);
  }
}

// 復原物資
async function handleRestoreItem(row) {
  showToast(`↩️ 正在復原第 ${row} 列回物資佇列...`);
  try {
    if (window.pywebview && window.pywebview.api) {
      const res = await window.pywebview.api.restore_goods(row);
      if (res && res.success) {
        showToast('✅ 已成功復原回待刊佇列！');
        fetchQueueData(true);
      }
    }
  } catch (e) {
    showToast(`❌ 復原失敗: ${e.message || e}`);
  }
}

// 刪除物資
async function handleDeleteItem(row) {
  const item = queueData.find(i => (i.row === row || i.id === row));
  const title = item ? item.title : `第 ${row} 列物資`;

  if (!confirm(`確定要刪除「${title}」嗎？\n雲端關聯的 Google Drive 照片將會同步移至垃圾桶。`)) {
    return;
  }

  showToast(`🗑️ 正在刪除第 ${row} 列物資與雲端相片...`);
  try {
    if (window.pywebview && window.pywebview.api) {
      const res = await window.pywebview.api.delete_goods(row);
      if (res && res.success) {
        showToast('✅ 物資與雲端相片已成功刪除');
        fetchQueueData(true);
      } else {
        showToast(`⚠️ 刪除失敗: ${res ? res.error : '異常'}`);
      }
    }
  } catch (e) {
    showToast(`❌ 刪除異常: ${e.message || e}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 7. 刊登成功跨視窗回報回調 (由 Python Bridge 調用)
// ─────────────────────────────────────────────────────────────
window.handleItemPublishedSuccess = function(row) {
  console.log('[UI] 收到刊登成功回報，Row:', row);
  // 卡片平滑淡出動畫
  const cardEl = document.getElementById(`card_row_${row}`);
  if (cardEl) {
    cardEl.style.transition = 'all 0.35s ease';
    cardEl.style.opacity = '0';
    cardEl.style.transform = 'scale(0.92)';
  }

  setTimeout(() => {
    queueData = queueData.filter(i => (i.row !== row && i.id !== row));
    renderQueueCards();
    updateBadges();
    showToast(`🎉 第 ${row} 列物資已成功刊登並回寫試算表！`);
  }, 350);
};

// ─────────────────────────────────────────────────────────────
// 8. 偏好設定與清理維護
// ─────────────────────────────────────────────────────────────
async function handleSaveSettings() {
  const gasUrl = document.getElementById('settingGasUrl').value.trim();
  const defaultAddr = document.getElementById('settingDefaultAddress').value.trim();
  const uploaderName = document.getElementById('settingUploaderName').value.trim();

  const preloadInput = document.getElementById('settingPreloadPhotos');
  const preloadPhotos = preloadInput ? preloadInput.checked : true;

  const newCfg = {
    gas_url: gasUrl,
    default_address: defaultAddr,
    uploader_name: uploaderName,
    preload_photos: preloadPhotos
  };

  try {
    if (window.pywebview && window.pywebview.api) {
      const res = await window.pywebview.api.save_config(newCfg);
      if (res && res.success) {
        currentConfig = Object.assign(currentConfig, newCfg);
        showToast('💾 偏好設定已成功儲存！');
        // 重新依新網址同步
        fetchQueueData(false);
      }
    }
  } catch (e) {
    showToast(`❌ 儲存失敗: ${e.message || e}`);
  }
}

async function simulateCleanup(type) {
  if (type === 'published') {
    if (!confirm('【空間維護確認】\n系統將掃描試算表所有「已刊登」資料，將其關聯的 Google Drive 照片移至垃圾桶，並清除試算表資料列。\n確定要執行嗎？')) {
      return;
    }
    showToast('🧹 正在清理已刊登資料與相片...');
    try {
      if (window.pywebview && window.pywebview.api) {
        const res = await window.pywebview.api.cleanup_storage('published');
        if (res && res.success) {
          showToast(`🧹 清理完成: ${res.message || '已成功釋放 Google Drive 空間！'}`);
          fetchQueueData(true);
        } else {
          showToast(`⚠️ 清理失敗: ${res ? res.error : '異常'}`);
        }
      }
    } catch (e) {
      showToast(`❌ 清理錯誤: ${e.message || e}`);
    }
  } else if (type === 'skipped') {
    if (!confirm('【空間維護確認】\n系統將清空所有「已略過」之物資與未發布之廢照。\n確定要執行嗎？')) {
      return;
    }
    showToast('🗑️ 正在清空已略過廢照...');
    try {
      if (window.pywebview && window.pywebview.api) {
        const res = await window.pywebview.api.cleanup_storage('skipped');
        if (res && res.success) {
          showToast(`🗑️ 清空完成: ${res.message || '已清空略過項目！'}`);
          fetchQueueData(true);
        } else {
          showToast(`⚠️ 清空失敗: ${res ? res.error : '異常'}`);
        }
      }
    } catch (e) {
      showToast(`❌ 清空錯誤: ${e.message || e}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 9. 縮圖多階層自動降級、重試與燈箱大圖控制 (比照 PWA 與桌面專屬 Python 代理)
// ─────────────────────────────────────────────────────────────

async function handleThumbError(imgEl) {
  const step = parseInt(imgEl.getAttribute('data-fallback-step') || '0', 10);
  const fileId = imgEl.getAttribute('data-file-id');
  const origUrl = imgEl.getAttribute('data-orig-url');
  const downUrl = imgEl.getAttribute('data-down-url');
  const now = Date.now();

  if (step === 0 && fileId) {
    // 降級第 1 階：Google Drive 直連下載網址 (uc?export=download&id=...)
    imgEl.setAttribute('data-fallback-step', '1');
    imgEl.src = `https://drive.google.com/uc?export=download&id=${fileId}&_t=${now}`;
  } else if (step <= 1 && origUrl && imgEl.src !== origUrl) {
    // 降級第 2 階：嘗試 downUrl 或 origUrl
    imgEl.setAttribute('data-fallback-step', '2');
    const target = downUrl || origUrl;
    const sep = target.includes('?') ? '&' : '?';
    imgEl.src = `${target}${sep}_t=${now}`;
  } else if (step <= 2 && fileId && window.pywebview && window.pywebview.api) {
    // 降級第 3 階（桌面版專屬殺手級保險）：透過本機 Python API 代理讀取 (含磁碟快取與 GAS DriveApp，100% 避開 Google 登入限制)
    imgEl.setAttribute('data-fallback-step', '3');
    imgEl.classList.add('thumb-loading');
    try {
      const res = await window.pywebview.api.get_photo_base64(fileId, downUrl || origUrl);
      imgEl.classList.remove('thumb-loading');
      if (res && res.success && res.base64) {
        imgEl.onerror = null;
        imgEl.src = `data:${res.mimeType || 'image/jpeg'};base64,${res.base64}`;
        return;
      }
    } catch (e) {
      imgEl.classList.remove('thumb-loading');
      console.warn('[UI] Python 代理縮圖下載失敗:', e);
    }
    setThumbFailed(imgEl);
  } else {
    // 降級第 4 階：顯示可點擊重試的灰色照片圖示
    setThumbFailed(imgEl);
  }
}

function setThumbFailed(imgEl) {
  imgEl.setAttribute('data-fallback-step', 'failed');
  imgEl.onerror = null;
  imgEl.classList.add('thumb-failed');
  imgEl.title = '相片載入失敗，點擊重新載入';
  imgEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/><path d="M12 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/></svg>';
}

function handleThumbClick(event, imgEl, caption) {
  if (imgEl.classList.contains('thumb-failed')) {
    event.stopPropagation();
    imgEl.classList.remove('thumb-failed');
    imgEl.setAttribute('data-fallback-step', '0');
    imgEl.title = '重新載入中...';
    const fileId = imgEl.getAttribute('data-file-id');
    const origUrl = imgEl.getAttribute('data-orig-url');
    const now = Date.now();
    imgEl.onerror = function() { handleThumbError(this); };
    imgEl.src = fileId 
      ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w800&_t=${now}` 
      : (origUrl ? `${origUrl}${origUrl.includes('?') ? '&' : '?'}_t=${now}` : '');
    return;
  }
  const currentSrc = imgEl.src;
  const origUrl = imgEl.getAttribute('data-orig-url') || currentSrc;
  openLightbox(currentSrc.startsWith('data:') ? currentSrc : origUrl, caption);
}

function openLightbox(imgUrl, caption) {
  if (!imgUrl) return;
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCaption');
  
  img.onerror = function() {
    const now = Date.now();
    if (!this.src.includes('_t=') && !this.src.startsWith('data:')) {
      const sep = imgUrl.includes('?') ? '&' : '?';
      this.src = `${imgUrl}${sep}_t=${now}`;
    }
  };
  
  img.src = (imgUrl.includes('_t=') || imgUrl.startsWith('data:')) ? imgUrl : `${imgUrl}${imgUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
  cap.textContent = caption || '';
  modal.classList.add('active');
}

function closeLightbox() {
  const modal = document.getElementById('lightboxModal');
  if (modal) modal.classList.remove('active');
  const img = document.getElementById('lightboxImg');
  if (img) img.src = '';
}

let toastTimer = null;
function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3200);
}

function escapeQuotes(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
