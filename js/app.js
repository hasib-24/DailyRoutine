/* ===================================================
   রুটিন প্ল্যানার — Main Application Logic
   Smart Reminder System + Firebase Sync
   =================================================== */

'use strict';

// ===== GLOBAL STATE =====
const State = {
  user: null,
  tasks: [],
  notifPermission: 'default',
  notifLog: [],
  unreadCount: 0,
  currentView: 'dashboard',
  reminderIntervals: [],
  unsub: null,
  selectedTaskId: null,
  db: null,
  auth: null
};

// ===== UTILITY FUNCTIONS =====
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');

function formatDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার'];
  const months = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function getBnDate() {
  const now = new Date();
  const days = ['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার'];
  const months = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'সুপ্রভাত! 🌅';
  if (h < 17) return 'শুভ বিকেল! ☀️';
  if (h < 21) return 'শুভ সন্ধ্যা! 🌙';
  return 'শুভ রাত্রি! 🌟';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function showToast(msg, type = 'info') {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

const catLabels = {
  exam: '📝 পরীক্ষা', study: '📚 পড়াশোনা', bcs: '🎯 BCS',
  job: '💼 চাকরি', personal: '🏠 ব্যক্তিগত', health: '🏃 স্বাস্থ্য', other: '📌 অন্যান্য'
};

// ===== FIREBASE INIT =====
window.addEventListener('firebase-ready', () => {
  const { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged,
    collection, doc, setDoc, getDocs, deleteDoc, onSnapshot, query, where, orderBy, Timestamp, writeBatch
  } = window._firebase;

  State.db = db;
  State.auth = auth;

  // ===== AUTH STATE =====
  onAuthStateChanged(auth, user => {
    if (user) {
      State.user = user;
      showApp(user);
      subscribeToTasks();
    } else {
      State.user = null;
      showAuthScreen();
      if (State.unsub) { State.unsub(); State.unsub = null; }
    }
  });

  // ===== GOOGLE SIGN IN =====
  $('google-signin-btn').addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch(e) {
      showToast('লগইন ব্যর্থ হয়েছে। আবার চেষ্টা করো।', 'error');
      console.error(e);
    }
  });

  $('signout-btn').addEventListener('click', async () => {
    clearReminderIntervals();
    await signOut(auth);
    showToast('লগ আউট সফল হয়েছে।');
  });

  // ===== FIRESTORE SUBSCRIBE =====
  function subscribeToTasks() {
    if (State.unsub) State.unsub();
    const colRef = collection(db, 'users', State.user.uid, 'tasks');
    const q = query(colRef, orderBy('date', 'asc'));
    State.unsub = onSnapshot(q, snapshot => {
      State.tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
      updateLastSync();
    }, err => {
      console.error('Firestore error:', err);
      showToast('ডেটা লোড করতে সমস্যা হয়েছে।', 'error');
    });
  }

  // ===== SAVE TASK =====
  async function saveTask(taskData) {
    const colRef = collection(db, 'users', State.user.uid, 'tasks');
    const docRef = doc(colRef, taskData.id);
    await setDoc(docRef, taskData);
  }

  // ===== DELETE TASK =====
  async function deleteTask(taskId) {
    const docRef = doc(db, 'users', State.user.uid, 'tasks', taskId);
    await deleteDoc(docRef);
  }

  // ===== UPDATE TASK =====
  async function updateTask(taskId, updates) {
    const docRef = doc(db, 'users', State.user.uid, 'tasks', taskId);
    await setDoc(docRef, updates, { merge: true });
  }

  // ===== TASK FORM SUBMIT =====
  $('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bulkMode = $('bulk-mode').checked;

    if (bulkMode) {
      await saveBulkTasks();
    } else {
      const task = buildTaskFromForm();
      if (!task) return;
      try {
        await saveTask(task);
        showToast('কাজ শিডিউলে যোগ হয়েছে! ✓', 'success');
        clearForm();
      } catch(e) {
        showToast('সেভ করতে সমস্যা হয়েছে।', 'error');
      }
    }
  });

  async function saveBulkTasks() {
    const startDate = new Date($('task-date').value + 'T00:00:00');
    const inputs = document.querySelectorAll('.bulk-day-input');
    const cat = $('task-category').value;
    const priority = $('task-priority').value;
    const reminderBefore = parseInt($('reminder-before').value);
    let count = 0;

    for (let i = 0; i < inputs.length; i++) {
      const title = inputs[i].value.trim();
      if (!title) continue;
      const taskDate = new Date(startDate);
      taskDate.setDate(startDate.getDate() + i);
      const task = {
        id: generateId(),
        title, category: cat, priority,
        date: formatDate(taskDate),
        time: $('task-time').value || '',
        details: $('task-details').value.trim(),
        reminderBefore, done: false,
        createdAt: Date.now(), userId: State.user.uid
      };
      await saveTask(task);
      count++;
    }
    if (count > 0) {
      showToast(`${count}টি কাজ শিডিউলে যোগ হয়েছে! ✓`, 'success');
      clearForm();
    }
  }

  function buildTaskFromForm() {
    const title = $('task-title').value.trim();
    const date = $('task-date').value;
    if (!title || !date) { showToast('কাজের নাম ও তারিখ অবশ্যই দাও।', 'warning'); return null; }
    return {
      id: generateId(),
      title, category: $('task-category').value,
      priority: $('task-priority').value,
      date, time: $('task-time').value || '',
      details: $('task-details').value.trim(),
      reminderBefore: parseInt($('reminder-before').value),
      done: false, createdAt: Date.now(), userId: State.user.uid
    };
  }

  // ===== MARK DONE =====
  async function toggleTaskDone(taskId) {
    const task = State.tasks.find(t => t.id === taskId);
    if (!task) return;
    await updateTask(taskId, { done: !task.done });
    showToast(task.done ? 'কাজ আবার চালু করা হয়েছে।' : 'কাজ সম্পন্ন করা হয়েছে! 🎉', 'success');
  }

  // ===== DELETE MODAL =====
  $('modal-delete-btn').addEventListener('click', async () => {
    if (!State.selectedTaskId) return;
    try {
      await deleteTask(State.selectedTaskId);
      closeModal();
      showToast('কাজ মুছে ফেলা হয়েছে।');
    } catch { showToast('মুছতে সমস্যা হয়েছে।', 'error'); }
  });

  $('modal-complete-btn').addEventListener('click', async () => {
    if (!State.selectedTaskId) return;
    await toggleTaskDone(State.selectedTaskId);
    closeModal();
  });

  // ===== BACKUP EXPORT =====
  $('export-json-btn').addEventListener('click', () => {
    const data = { exportedAt: new Date().toISOString(), user: State.user.email, tasks: State.tasks };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `routine-backup-${formatDate(new Date())}.json`;
    a.click(); URL.revokeObjectURL(url);
    localStorage.setItem('lastBackup', new Date().toLocaleString('bn-BD'));
    $('last-backup-info').textContent = `সর্বশেষ Backup: ${localStorage.getItem('lastBackup')}`;
    showToast('Backup নামানো হয়েছে! 💾', 'success');
  });

  $('export-csv-btn').addEventListener('click', () => {
    const headers = ['তারিখ', 'কাজ', 'ক্যাটাগরি', 'সময়', 'বিস্তারিত', 'অগ্রাধিকার', 'সম্পন্ন'];
    const rows = State.tasks.map(t => [
      t.date, `"${t.title}"`, catLabels[t.category] || t.category,
      t.time || '-', `"${(t.details || '').replace(/"/g, '""')}"`,
      t.priority, t.done ? 'হ্যাঁ' : 'না'
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `routine-backup-${formatDate(new Date())}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast('CSV নামানো হয়েছে!', 'success');
  });

  // ===== IMPORT RESTORE =====
  $('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      $('import-filename').textContent = file.name;
      $('import-btn').disabled = false;
    }
  });

  $('import-btn').addEventListener('click', async () => {
    const file = $('import-file').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.tasks || !Array.isArray(data.tasks)) throw new Error('Invalid format');
        let count = 0;
        for (const task of data.tasks) {
          task.userId = State.user.uid;
          await saveTask(task);
          count++;
        }
        $('import-status').innerHTML = `<span style="color:#2ecc71">✓ ${count}টি কাজ Restore হয়েছে!</span>`;
        showToast(`${count}টি কাজ Restore সফল! ✓`, 'success');
      } catch(err) {
        $('import-status').innerHTML = `<span style="color:#e74c3c">ফাইলে সমস্যা আছে। সঠিক Backup ফাইল ব্যবহার করো।</span>`;
      }
    };
    reader.readAsText(file);
  });

  // ===== MANUAL SYNC =====
  $('manual-sync-btn').addEventListener('click', () => {
    subscribeToTasks();
    showToast('Sync করা হয়েছে! 🔄', 'success');
  });

  // ===== EXPOSE FOR RENDER FUNCTIONS =====
  window._appActions = { toggleTaskDone, deleteTask, updateTask };

}); // end firebase-ready

// ===== UI: SHOW/HIDE AUTH/APP =====
function showApp(user) {
  $('auth-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('user-avatar').src = user.photoURL || '';
  $('user-name').textContent = user.displayName || 'ব্যবহারকারী';
  $('user-email').textContent = user.email || '';
  $('today-date-display').textContent = getBnDate();
  $('greeting-text').textContent = getGreeting();
  checkNotifPermission();
  initReminderSystem();
  loadNotifLog();
  if (localStorage.getItem('lastBackup')) {
    $('last-backup-info').textContent = `সর্বশেষ Backup: ${localStorage.getItem('lastBackup')}`;
  }
}

function showAuthScreen() {
  $('auth-screen').classList.remove('hidden');
  $('app').classList.add('hidden');
}

// ===== RENDER ALL VIEWS =====
function renderAll() {
  renderDashboard();
  renderAllTasks();
}

// ===== DASHBOARD RENDER =====
function renderDashboard() {
  const today = formatDate(new Date());
  const tomorrow = formatDate(new Date(Date.now() + 86400000));
  const dayAfter = formatDate(new Date(Date.now() + 172800000));

  const todayTasks = State.tasks.filter(t => t.date === today);
  const tomorrowTasks = State.tasks.filter(t => t.date === tomorrow);
  const dayAfterTasks = State.tasks.filter(t => t.date === dayAfter);

  // Today
  const doneCount = todayTasks.filter(t => t.done).length;
  $('today-progress').textContent = `${doneCount}/${todayTasks.length} সম্পন্ন`;
  renderTaskList('today-tasks', todayTasks, today);
  renderTaskList('tomorrow-tasks', tomorrowTasks, tomorrow);
  renderTaskList('dayafter-tasks', dayAfterTasks, dayAfter);
  render10DaySummary();
}

function renderTaskList(containerId, tasks, refDate) {
  const container = $(containerId);
  if (!tasks.length) {
    container.innerHTML = '<div class="empty-state">কোনো কাজ নেই।</div>';
    return;
  }
  container.innerHTML = tasks.map(t => buildTaskItemHTML(t, refDate)).join('');
  // Attach check/click handlers
  container.querySelectorAll('.task-check').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window._appActions?.toggleTaskDone(btn.dataset.id);
    });
  });
  container.querySelectorAll('.task-item').forEach(item => {
    item.addEventListener('click', () => openTaskModal(item.dataset.id));
  });
}

function buildTaskItemHTML(task, _ref) {
  const catClass = `cat-${task.category}`;
  const priClass = `priority-${task.priority}`;
  const doneClass = task.done ? 'done' : '';
  const checkedClass = task.done ? 'checked' : '';
  return `
    <div class="task-item ${doneClass}" data-id="${task.id}">
      <button class="task-check ${checkedClass}" data-id="${task.id}"></button>
      <div class="priority-dot ${priClass}"></div>
      <div class="task-info">
        <div class="task-title">${escHtml(task.title)}</div>
        <div class="task-meta">
          ${task.time ? `<span class="task-time">⏰ ${task.time}</span>` : ''}
          <span class="cat-badge ${catClass}">${catLabels[task.category] || task.category}</span>
          ${task.details ? `<span class="task-details-preview">${escHtml(task.details)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function render10DaySummary() {
  const container = $('ten-day-summary');
  const today = new Date(); today.setHours(0,0,0,0);
  const cells = [];
  const dayNames = ['রবি','সোম','মঙ্গল','বুধ','বৃহ','শুক্র','শনি'];

  for (let i = 0; i < 10; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const ds = formatDate(d);
    const count = State.tasks.filter(t => t.date === ds).length;
    const isToday = i === 0;
    cells.push(`
      <div class="day-cell ${count > 0 ? 'has-tasks' : ''} ${isToday ? 'today-cell' : ''}" data-date="${ds}" title="${formatDisplayDate(ds)}">
        <div class="day-name">${dayNames[d.getDay()]}</div>
        <div class="day-num">${d.getDate()}</div>
        ${count > 0 ? `<div class="day-count">${count}টি</div>` : ''}
      </div>`);
  }
  container.innerHTML = cells.join('');
  container.querySelectorAll('.day-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      switchView('tasks');
      setTimeout(() => {
        const tasksForDate = State.tasks.filter(t => t.date === cell.dataset.date);
        const el = document.querySelector(`[data-group-date="${cell.dataset.date}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    });
  });
}

// ===== ALL TASKS VIEW =====
function renderAllTasks() {
  const catFilter = $('filter-category')?.value || 'all';
  const statusFilter = $('filter-status')?.value || 'all';
  let tasks = [...State.tasks];
  if (catFilter !== 'all') tasks = tasks.filter(t => t.category === catFilter);
  if (statusFilter === 'pending') tasks = tasks.filter(t => !t.done);
  if (statusFilter === 'done') tasks = tasks.filter(t => t.done);

  const container = $('all-tasks-list');
  if (!tasks.length) {
    container.innerHTML = '<div class="empty-state">কোনো কাজ পাওয়া যায়নি।</div>';
    return;
  }

  // Group by date
  const groups = {};
  tasks.forEach(t => {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
  });

  let html = '';
  Object.keys(groups).sort().forEach(date => {
    const relLabel = getRelativeLabel(date);
    html += `<div class="date-group-header" data-group-date="${date}">${formatDisplayDate(date)} ${relLabel}</div>`;
    groups[date].forEach(t => { html += buildTaskItemHTML(t, date); });
  });
  container.innerHTML = html;

  container.querySelectorAll('.task-check').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window._appActions?.toggleTaskDone(btn.dataset.id);
    });
  });
  container.querySelectorAll('.task-item').forEach(item => {
    item.addEventListener('click', () => openTaskModal(item.dataset.id));
  });
}

function getRelativeLabel(dateStr) {
  const today = formatDate(new Date());
  const tomorrow = formatDate(new Date(Date.now() + 86400000));
  const dayAfter = formatDate(new Date(Date.now() + 172800000));
  if (dateStr === today) return '— আজ 🔴';
  if (dateStr === tomorrow) return '— আগামীকাল 🟡';
  if (dateStr === dayAfter) return '— পরশু 🔵';
  return '';
}

// ===== TASK MODAL =====
function openTaskModal(taskId) {
  const task = State.tasks.find(t => t.id === taskId);
  if (!task) return;
  State.selectedTaskId = taskId;
  $('modal-title').textContent = escHtml(task.title);
  $('modal-content').innerHTML = `
    <div class="modal-content-item"><span class="mci-label">তারিখ</span><span class="mci-value">${formatDisplayDate(task.date)}</span></div>
    ${task.time ? `<div class="modal-content-item"><span class="mci-label">সময়</span><span class="mci-value">⏰ ${task.time}</span></div>` : ''}
    <div class="modal-content-item"><span class="mci-label">ক্যাটাগরি</span><span class="mci-value">${catLabels[task.category] || task.category}</span></div>
    <div class="modal-content-item"><span class="mci-label">অগ্রাধিকার</span><span class="mci-value">${task.priority === 'high' ? '🔴 বেশি' : task.priority === 'medium' ? '🟡 মাঝারি' : '🟢 কম'}</span></div>
    ${task.details ? `<div class="modal-content-item"><span class="mci-label">বিস্তারিত</span><span class="mci-value">${escHtml(task.details)}</span></div>` : ''}
    <div class="modal-content-item"><span class="mci-label">স্ট্যাটাস</span><span class="mci-value" style="color:${task.done ? '#2ecc71':'#f39c12'}">${task.done ? '✓ সম্পন্ন' : '⏳ বাকি আছে'}</span></div>`;
  $('modal-complete-btn').textContent = task.done ? '↩ আবার চালু করো' : '✓ সম্পন্ন হয়েছে';
  $('task-modal').classList.remove('hidden');
}

function closeModal() {
  $('task-modal').classList.add('hidden');
  State.selectedTaskId = null;
}
$('modal-close').addEventListener('click', closeModal);
$('task-modal').querySelector('.modal-backdrop').addEventListener('click', closeModal);

// ===== NAVIGATION =====
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const targetView = $(`view-${viewName}`);
  if (targetView) { targetView.classList.remove('hidden'); targetView.classList.add('active'); }
  document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');
  State.currentView = viewName;
  const titles = { dashboard: 'ড্যাশবোর্ড', schedule: 'শিডিউল তৈরি', tasks: 'সব কাজ', reminders: 'Reminder সেটিংস', backup: 'Backup & Restore' };
  $('topbar-title').textContent = titles[viewName] || '';
  if (viewName === 'tasks') renderAllTasks();
  if (viewName === 'schedule') initBulkSchedule();
  closeSidebar();
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

$('quick-add-btn').addEventListener('click', () => switchView('schedule'));

// ===== SIDEBAR TOGGLE =====
function openSidebar() {
  $('sidebar').classList.add('open');
  getOrCreateOverlay().classList.add('active');
}
function closeSidebar() {
  $('sidebar').classList.remove('open');
  const ov = document.querySelector('.sidebar-overlay');
  if (ov) ov.classList.remove('active');
}
function getOrCreateOverlay() {
  let ov = document.querySelector('.sidebar-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'sidebar-overlay';
    ov.addEventListener('click', closeSidebar);
    document.body.appendChild(ov);
  }
  return ov;
}
$('menu-toggle').addEventListener('click', openSidebar);
$('sidebar-close').addEventListener('click', closeSidebar);

// ===== FILTERS =====
$('filter-category').addEventListener('change', renderAllTasks);
$('filter-status').addEventListener('change', renderAllTasks);

// ===== FORM HELPERS =====
function clearForm() {
  $('task-form').reset();
  const today = formatDate(new Date());
  $('task-date').value = today;
  $('bulk-schedule').classList.add('hidden');
  $('bulk-mode').checked = false;
}
$('clear-form-btn').addEventListener('click', clearForm);

// Set default date to today
window.addEventListener('DOMContentLoaded', () => {
  const dateInput = $('task-date');
  if (dateInput) dateInput.value = formatDate(new Date());
});

// ===== BULK SCHEDULE =====
function initBulkSchedule() {
  $('task-date').value = $('task-date').value || formatDate(new Date());
}

$('bulk-mode').addEventListener('change', (e) => {
  const bulk = $('bulk-schedule');
  if (e.target.checked) {
    bulk.classList.remove('hidden');
    buildBulkDayRows();
  } else {
    bulk.classList.add('hidden');
  }
});

$('task-date').addEventListener('change', () => {
  if ($('bulk-mode').checked) buildBulkDayRows();
});

function buildBulkDayRows() {
  const startDate = new Date($('task-date').value + 'T00:00:00');
  if (isNaN(startDate)) return;
  const dayNames = ['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার'];
  const container = $('bulk-days-container');
  container.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const d = new Date(startDate); d.setDate(startDate.getDate() + i);
    const label = `${d.getDate()}/${d.getMonth()+1} ${dayNames[d.getDay()]}`;
    const row = document.createElement('div');
    row.className = 'bulk-day-row';
    row.innerHTML = `<span class="bulk-day-label">দিন ${i+1}: ${label}</span>
      <input class="bulk-day-input" type="text" placeholder="কাজের নাম..." data-day="${i}">`;
    container.appendChild(row);
  }
}

// ===== NOTIFICATION SYSTEM =====
function checkNotifPermission() {
  if (!('Notification' in window)) {
    $('notif-status-display').textContent = 'এই ব্রাউজারে Notification সমর্থিত নয়।';
    return;
  }
  State.notifPermission = Notification.permission;
  updateNotifStatus();
  if (Notification.permission === 'default') {
    $('notif-banner').classList.remove('hidden');
  }
}

$('enable-notif').addEventListener('click', requestNotifPermission);
$('request-notif-perm').addEventListener('click', requestNotifPermission);
$('dismiss-notif').addEventListener('click', () => $('notif-banner').classList.add('hidden'));

async function requestNotifPermission() {
  if (!('Notification' in window)) return;
  const perm = await Notification.requestPermission();
  State.notifPermission = perm;
  updateNotifStatus();
  $('notif-banner').classList.add('hidden');
  if (perm === 'granted') {
    showToast('Browser Notification চালু হয়েছে! 🔔', 'success');
    new Notification('রুটিন প্ল্যানার', { body: 'Notification সফলভাবে চালু হয়েছে! সময়মতো Reminder পাবে।', icon: '/icons/icon-192.png' });
  }
}

function updateNotifStatus() {
  const el = $('notif-status-display');
  const map = {
    granted: '✅ Browser Notification চালু আছে',
    denied: '❌ Browser Notification বন্ধ আছে। ব্রাউজার সেটিংস থেকে চালু করো।',
    default: '⚠️ Browser Notification এখনো চালু করা হয়নি।'
  };
  el.textContent = map[State.notifPermission] || '';
}

// ===== SMART REMINDER SYSTEM =====
function clearReminderIntervals() {
  State.reminderIntervals.forEach(clearInterval);
  State.reminderIntervals = [];
}

function initReminderSystem() {
  clearReminderIntervals();
  // Check every minute
  const interval = setInterval(checkAndFireReminders, 60000);
  State.reminderIntervals.push(interval);
  // Also check immediately after 2 sec
  setTimeout(checkAndFireReminders, 2000);
}

function checkAndFireReminders() {
  if (!State.user || !State.tasks.length) return;
  const now = new Date();
  const today = formatDate(now);
  const tomorrow = formatDate(new Date(Date.now() + 86400000));
  const dayAfter = formatDate(new Date(Date.now() + 172800000));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = 8 * 60; // 8 AM
  const endMin = 22 * 60;  // 10 PM
  if (nowMin < startMin || nowMin > endMin) return;

  State.tasks.filter(t => !t.done).forEach(task => {
    const key = `reminded_${task.id}_${now.getHours()}`;
    if (sessionStorage.getItem(key)) return;

    let shouldFire = false;
    const daysUntil = daysBetween(today, task.date);

    if (task.date === today) {
      // Today: every hour + at task time
      shouldFire = true;
      if (task.time) {
        const [th, tm] = task.time.split(':').map(Number);
        const taskMin = th * 60 + tm;
        const diffMin = taskMin - nowMin;
        if (diffMin > 0 && diffMin <= task.reminderBefore) shouldFire = true;
      }
    } else if (task.date === tomorrow) {
      // Tomorrow: every 3 hours (more frequent)
      shouldFire = now.getMinutes() < 5 && now.getHours() % 3 === 0;
    } else if (task.date === dayAfter) {
      // Day after: 3 times a day
      shouldFire = now.getMinutes() < 5 && [8, 14, 20].includes(now.getHours());
    } else if (daysUntil > 2 && daysUntil <= 10) {
      // Upcoming: once a day at 9 AM
      shouldFire = now.getMinutes() < 5 && now.getHours() === 9;
    }

    if (shouldFire) {
      sessionStorage.setItem(key, '1');
      fireReminder(task);
    }
  });
}

function daysBetween(d1, d2) {
  const a = new Date(d1 + 'T00:00:00');
  const b = new Date(d2 + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function fireReminder(task) {
  const daysUntil = daysBetween(formatDate(new Date()), task.date);
  let urgency = '';
  if (daysUntil === 0) urgency = '🔴 আজকে!';
  else if (daysUntil === 1) urgency = '🟡 আগামীকাল';
  else if (daysUntil === 2) urgency = '🔵 পরশু';
  else urgency = `${daysUntil} দিন পরে`;

  const title = `${urgency} — ${task.title}`;
  const body = `${catLabels[task.category] || ''}${task.time ? ` | সময়: ${task.time}` : ''}${task.details ? `\n${task.details.slice(0, 80)}` : ''}`;

  // Browser Notification
  if (State.notifPermission === 'granted') {
    try {
      new Notification(title, { body, icon: '/icons/icon-192.png', tag: task.id });
    } catch(e) { console.error(e); }
  }

  // In-App Notification
  addInAppNotification(title, body, task.id);
}

// ===== IN-APP NOTIFICATION =====
function addInAppNotification(title, body, taskId) {
  const notif = { id: generateId(), title, body, taskId, time: new Date().toLocaleTimeString('bn-BD'), read: false };
  State.notifLog.unshift(notif);
  if (State.notifLog.length > 50) State.notifLog.pop();
  saveNotifLog();
  State.unreadCount++;
  updateNotifBadge();
  renderNotifLog();
}

function updateNotifBadge() {
  const badge = $('notif-badge');
  if (State.unreadCount > 0) {
    badge.textContent = State.unreadCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function saveNotifLog() {
  try { localStorage.setItem('notifLog', JSON.stringify(State.notifLog.slice(0, 50))); } catch {}
}

function loadNotifLog() {
  try {
    const saved = localStorage.getItem('notifLog');
    if (saved) State.notifLog = JSON.parse(saved);
    renderNotifLog();
  } catch {}
}

function renderNotifLog() {
  const container = $('notif-log');
  if (!State.notifLog.length) {
    container.innerHTML = '<div class="empty-state">এখনো কোনো Notification নেই।</div>';
    return;
  }
  container.innerHTML = State.notifLog.map(n => `
    <div class="notif-log-item">
      <div>${escHtml(n.title)}</div>
      ${n.body ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem">${escHtml(n.body)}</div>` : ''}
      <div class="notif-time">${n.time}</div>
    </div>`).join('');

  // In-app panel
  const panelList = $('inapp-notif-list');
  panelList.innerHTML = State.notifLog.slice(0, 20).map(n => `
    <div class="inapp-notif-item ${n.read ? '' : 'unread'}">
      <div class="in-title">${escHtml(n.title)}</div>
      ${n.body ? `<div class="in-body">${escHtml(n.body)}</div>` : ''}
      <div class="in-time">${n.time}</div>
    </div>`).join('');
}

// In-app panel toggle
$('notif-toggle').addEventListener('click', () => {
  const panel = $('inapp-notif-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    State.notifLog.forEach(n => n.read = true);
    State.unreadCount = 0;
    updateNotifBadge();
    saveNotifLog();
    renderNotifLog();
  }
});
$('close-inapp-panel').addEventListener('click', () => $('inapp-notif-panel').classList.add('hidden'));

// ===== SYNC STATUS =====
function updateLastSync() {
  const el = $('last-sync-time');
  if (el) el.textContent = `সর্বশেষ Sync: ${new Date().toLocaleTimeString('bn-BD')}`;
}

// ===== SERVICE WORKER REGISTRATION =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('Service Worker registered'))
      .catch(err => console.log('SW registration failed:', err));
  });
}
