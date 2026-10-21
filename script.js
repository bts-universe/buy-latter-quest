/* 購物冷靜期：所有任務及決策紀錄只保存在目前瀏覽器。 */
(() => {
  'use strict';
  const STORAGE_KEY = 'buy-later-quest-v1';
  const EXP_PER_DECISION = 20;
  const LEVEL_EXP = 100;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const now = () => Date.now();
  let toastTimer;
  let activeFilter = 'all';
  let selectedTaskId = null;

  function loadTasks() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(data)) return [];
      return data.filter(task => task && typeof task.id === 'string' && typeof task.name === 'string' && Number.isFinite(Number(task.price)) && Number(task.price) >= 0 && Number.isFinite(Date.parse(task.deadline)) && Number.isFinite(Date.parse(task.createdAt)) && ['waiting', 'purchased', 'abandoned'].includes(task.status))
        .map(task => ({ ...task, price: Number(task.price), history: Array.isArray(task.history) ? task.history : [] }));
    } catch (error) {
      console.warn('無法讀取任務資料，將以空清單開始。', error);
      return [];
    }
  }
  let tasks = loadTasks();
  function saveTasks() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); return true; }
    catch (error) { console.error('無法儲存任務資料。', error); showToast('儲存失敗：請確認瀏覽器儲存空間設定'); return false; }
  }
  const isReview = task => task.status === 'waiting' && Date.parse(task.deadline) <= now();
  const isActive = task => task.status === 'waiting';
  const completed = () => tasks.filter(task => task.status === 'purchased' || task.status === 'abandoned');
  const money = amount => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(amount);
  const dateTime = value => new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  const dateOnly = value => new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(value);
  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function safeUrl(value) {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  }
  function remaining(deadline) {
    const ms = Date.parse(deadline) - now();
    if (ms <= 0) return '冷靜期結束，可以重新評估';
    const minutes = Math.ceil(ms / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    if (days) return `還有 ${days} 天 ${hours} 小時`;
    if (hours) return `還有 ${hours} 小時 ${mins} 分`;
    return `還有 ${mins} 分鐘`;
  }
  function statusFor(task) {
    if (task.status === 'purchased') return ['已購買', 'purchased'];
    if (task.status === 'abandoned') return ['已放棄', 'abandoned'];
    return isReview(task) ? ['待重新評估', 'review'] : ['等待中', 'waiting'];
  }
  function showToast(message) {
    const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }
  function iconFor(status) { return status === 'review' ? '✦' : status === 'purchased' ? '♡' : status === 'abandoned' ? '✓' : '◷'; }

  function taskCard(task) {
    const [statusLabel, statusClass] = statusFor(task);
    const active = isActive(task);
    const deadlineText = active ? `<span class="countdown ${isReview(task) ? 'urgent' : ''}">◷ ${escapeHTML(remaining(task.deadline))}</span>` : `<span>決策時間 ${escapeHTML(dateTime(task.decisionAt || task.deadline))}</span>`;
    const created = `<span>建立於 ${escapeHTML(dateTime(task.createdAt))}</span>`;
    const url = safeUrl(task.url || '');
    const product = url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">↗ 商品連結</a>` : '';
    const action = active
      ? `${isReview(task) ? `<button class="mini-button review-action" data-action="decide" data-id="${escapeHTML(task.id)}">重新評估</button>` : ''}<button class="mini-button" data-action="abandon" data-id="${escapeHTML(task.id)}">${isReview(task) ? '放棄購買' : '提前放棄'}</button>`
      : `<span class="task-meta">${task.status === 'abandoned' ? `保住 NT$${money(task.price)}` : '已記錄這次選擇'}</span>`;
    return `<article class="task-card ${isReview(task) ? 'review-card' : ''}"><div class="task-main"><div class="task-title-row"><span class="task-title">${escapeHTML(task.name)}</span><span class="task-price">NT$ ${money(task.price)}</span><span class="task-status ${statusClass}">${iconFor(statusClass)} ${statusLabel}</span></div><div class="task-meta">${created}<span>截止 ${escapeHTML(dateTime(task.deadline))}</span>${deadlineText}${product}</div>${task.note ? `<div class="task-note">${escapeHTML(task.note)}</div>` : ''}</div><div class="task-actions">${action}</div></article>`;
  }
  function emptyState(kind) {
    const data = {
      hall: ['✧', '冒險，從第一個任務開始', '把心動商品記下來，給自己時間慢慢想。', true],
      all: ['▤', '任務圖鑑還是空的', '接受第一個任務，開始練習從容選擇。', true],
      filtered: ['✧', '這裡暫時沒有任務', '試試看其他狀態，或新增一個購物任務。', false],
      history: ['◷', '冒險紀錄正在等待故事', '完成第一次購物決定後，紀錄會出現在這裡。', false]
    }[kind];
    return `<div class="empty-state"><div class="empty-icon">${data[0]}</div><strong>${data[1]}</strong><p>${data[2]}</p>${data[3] ? '<button class="button primary new-task-trigger">＋ 接受新任務</button>' : ''}</div>`;
  }
  function renderTasks() {
    const activeTasks = tasks.filter(isActive).sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
    const reviewCount = activeTasks.filter(isReview).length;
    $('#hall-task-list').innerHTML = activeTasks.length ? activeTasks.slice(0, 3).map(taskCard).join('') : emptyState('hall');
    $('#all-task-list').innerHTML = (() => {
      const visible = tasks.filter(task => activeFilter === 'all' || (activeFilter === 'review' ? isReview(task) : activeFilter === 'waiting' ? isActive(task) && !isReview(task) : task.status === activeFilter));
      visible.sort((a, b) => isActive(a) !== isActive(b) ? (isActive(a) ? -1 : 1) : Date.parse(b.createdAt) - Date.parse(a.createdAt));
      return visible.length ? visible.map(taskCard).join('') : emptyState(activeFilter === 'all' ? 'all' : 'filtered');
    })();
    $('#active-count').textContent = activeTasks.length;
    $('#saved-total').textContent = money(tasks.filter(task => task.status === 'abandoned').reduce((sum, task) => sum + task.price, 0));
    $('#quest-heading-count').textContent = activeTasks.length;
    $('#nav-task-count').textContent = activeTasks.length;
    $('#review-banner').classList.toggle('hidden', reviewCount === 0);
    $('#filter-all-count').textContent = tasks.length;
    $('#filter-waiting-count').textContent = activeTasks.filter(task => !isReview(task)).length;
    $('#filter-review-count').textContent = reviewCount;
  }
  function renderLevel() {
    const exp = completed().length * EXP_PER_DECISION;
    const level = Math.floor(exp / LEVEL_EXP) + 1;
    const current = exp % LEVEL_EXP;
    $('#level-number').textContent = String(level).padStart(2, '0');
    $('#exp-current').textContent = current;
    $('#exp-next').textContent = LEVEL_EXP;
    $('#exp-progress').style.width = `${current / LEVEL_EXP * 100}%`;
    $('#level-hint').textContent = exp === 0 ? '完成一次購物決定，開始累積冒險經驗' : `再獲得 ${LEVEL_EXP - current} EXP 就能升上 Lv.${String(level + 1).padStart(2, '0')}`;
  }
  const achievements = [
    { icon: '◷', title: '第一份等待', desc: '建立你的第一個購物任務', done: () => tasks.length >= 1 },
    { icon: '✧', title: '深思熟慮', desc: '完成第一次購物決定', done: () => completed().length >= 1 },
    { icon: '♧', title: '留住預算', desc: '放棄一件心動商品', done: () => tasks.some(task => task.status === 'abandoned') },
    { icon: '✦', title: '公會常客', desc: '完成五次購物決定', done: () => completed().length >= 5 },
    { icon: '◇', title: '理性守護者', desc: '累積保住 NT$5,000', done: () => tasks.filter(task => task.status === 'abandoned').reduce((sum, task) => sum + task.price, 0) >= 5000 },
    { icon: '♔', title: '漫長旅程', desc: '冒險者升上 Lv.02', done: () => completed().length * EXP_PER_DECISION >= LEVEL_EXP }
  ];
  function renderAchievements() {
    $('#achievement-grid').innerHTML = achievements.map(item => `<article class="achievement-card ${item.done() ? '' : 'locked'}"><div class="achievement-icon">${item.icon}</div><strong>${item.title}</strong><p>${item.desc}</p><p>${item.done() ? '✦ 已解鎖' : '尚未解鎖'}</p></article>`).join('');
  }
  function renderHistory() {
    const ended = tasks.filter(task => task.status !== 'waiting').sort((a, b) => Date.parse(b.decisionAt || b.createdAt) - Date.parse(a.decisionAt || a.createdAt));
    const saved = tasks.filter(task => task.status === 'abandoned').reduce((sum, task) => sum + task.price, 0);
    $('#history-summary').innerHTML = `<div><span>完成的決定</span><strong>${completed().length} 次</strong></div><div><span>已購買</span><strong>${tasks.filter(task => task.status === 'purchased').length} 件</strong></div><div><span>已放棄</span><strong>${tasks.filter(task => task.status === 'abandoned').length} 件</strong></div><div><span>保住的預算</span><strong class="saved">NT$ ${money(saved)}</strong></div>`;
    $('#history-list').innerHTML = ended.length ? ended.map(taskCard).join('') : emptyState('history');
  }
  function render() { renderTasks(); renderLevel(); renderAchievements(); renderHistory(); }
  function navigate(page) {
    $$('.page').forEach(section => section.classList.toggle('active-page', section.id === `page-${page}`));
    $$('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function openDecision(task, { allowEarly = false } = {}) {
    if (!task || !isActive(task) || (!allowEarly && !isReview(task))) return;
    selectedTaskId = task.id;
    $('#decision-title').textContent = isReview(task) ? '重新評估' : '提前放棄';
    $('#decision-description').textContent = isReview(task) ? '冷靜期已經結束，聽聽現在的自己怎麼想。' : '確認放下這件商品後，價格會計入保住的預算。';
    $('#decision-product').innerHTML = `<strong>${escapeHTML(task.name)}</strong><span>NT$ ${money(task.price)}</span>`;
    $$('.decision-option').forEach(button => { button.hidden = !isReview(task) && button.dataset.decision !== 'abandoned'; });
    $('#decision-dialog').showModal();
  }
  function finishDecision(task, decision) {
    const at = new Date().toISOString();
    task.status = decision;
    task.decision = decision;
    task.decisionAt = at;
    task.history.push({ decision, at });
    saveTasks(); render();
    $('#decision-dialog').close();
    showToast(decision === 'purchased' ? '已記錄你的選擇，願這件商品為你帶來喜悅。' : '已記錄這次選擇，保住的預算也更新了。');
  }
  function handleAction(button) {
    const task = tasks.find(item => item.id === button.dataset.id);
    if (!task) return;
    if (button.dataset.action === 'decide') openDecision(task);
    if (button.dataset.action === 'abandon') openDecision(task, { allowEarly: true });
  }
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-page]');
    if (nav) { navigate(nav.dataset.page); return; }
    const newTask = event.target.closest('.new-task-trigger');
    if (newTask) { $('#task-form').reset(); $('#form-error').textContent = ''; $('#task-dialog').showModal(); setTimeout(() => $('#task-name').focus(), 0); return; }
    const close = event.target.closest('.dialog-close');
    if (close) { close.closest('dialog').close(); return; }
    const filter = event.target.closest('[data-filter]');
    if (filter) { activeFilter = filter.dataset.filter; $$('.filter-tab').forEach(tab => tab.classList.toggle('selected', tab === filter)); renderTasks(); return; }
    const action = event.target.closest('[data-action]');
    if (action) handleAction(action);
    const decision = event.target.closest('[data-decision]');
    // 延長時間的下拉選單在決策按鈕內；改選選項時不可立刻送出延長。
    if (decision && event.target.closest('select')) return;
    if (decision && selectedTaskId) {
      const task = tasks.find(item => item.id === selectedTaskId);
      if (!task || !isActive(task)) { $('#decision-dialog').close(); return; }
      if (decision.dataset.decision === 'extend') {
        const duration = Number($('#extend-duration').value);
        if (![24, 72, 168].includes(duration)) return;
        const oldDeadline = task.deadline;
        task.deadline = new Date(now() + duration * 3600000).toISOString();
        task.history.push({ decision: 'extended', at: new Date().toISOString(), previousDeadline: oldDeadline, deadline: task.deadline });
        saveTasks(); render(); $('#decision-dialog').close(); showToast('冷靜期已延長，繼續照自己的步調思考。'); return;
      }
      if (decision.dataset.decision === 'purchased' && !isReview(task)) return;
      finishDecision(task, decision.dataset.decision);
    }
  });
  $('#task-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const price = Number(form.get('price'));
    const duration = Number(form.get('duration'));
    const error = $('#form-error'); error.textContent = '';
    if (!name) { error.textContent = '請填寫商品名稱。'; $('#task-name').focus(); return; }
    if (!Number.isFinite(price) || price <= 0 || price > 100000000) { error.textContent = '請輸入大於 0 且不超過 100,000,000 的整數價格。'; $('#task-price').focus(); return; }
    if (!Number.isInteger(price)) { error.textContent = '價格請輸入整數金額。'; $('#task-price').focus(); return; }
    if (![24, 72, 168].includes(duration)) { error.textContent = '請選擇有效的冷靜期。'; return; }
    const createdAt = new Date().toISOString();
    const urlText = String(form.get('url') || '').trim();
    if (urlText && !safeUrl(urlText)) { error.textContent = '請輸入有效的 http 或 https 商品網址。'; $('#task-url').focus(); return; }
    const task = { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, name, price, url: urlText, note: String(form.get('note') || '').trim(), createdAt, deadline: new Date(Date.now() + duration * 3600000).toISOString(), status: 'waiting', decisionAt: null, decision: null, history: [] };
    tasks.unshift(task);
    if (!saveTasks()) { tasks.shift(); return; }
    render(); $('#task-dialog').close(); navigate('hall'); showToast('任務已建立，冷靜期現在開始。');
  });
  $('#today-label').textContent = new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
  $('#welcome-date').textContent = dateOnly(new Date());
  render();
  // 剩餘時間取決於截止時間，每分鐘重新顯示，重新開啟頁面也會立即校正。
  setInterval(renderTasks, 60000);
})();
