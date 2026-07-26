// ==================== ПРИЛОЖЕНИЕ "ЗАДАЧИ" ====================
// Полностью офлайн: данные хранятся в localStorage браузера,
// с зеркальной резервной копией в IndexedDB (на случай, если Safari
// на iOS очистит localStorage) и ручным экспортом/импортом в файл.

const STORAGE_KEY = 'tasksApp_widgets_v1';
const CATEGORIES_KEY = 'tasksApp_categories_v1';
const HISTORY_KEY = 'tasksApp_history_v1';
const THEME_KEY = 'tasksApp_theme_v1';

// Цвет подсветки виджета зависит от категории, а не от порядка —
// у всех задач одной категории всегда одинаковая подсветка.
// «Сегодня / Обучение / На потом» больше не захардкожены — три
// предложенные категории в форме создания задачи получают свои цвета,
// остальные (свои, пользовательские) — стабильный цвет по хэшу названия.
const TYPE_COLOR_MAP = {
  'Постоянные': '#3498db',
  'Единичные': '#f39c12',
  'Обучение': '#9b59b6'
};
const FALLBACK_TYPE_COLORS = ['#2ecc71', '#1abc9c', '#e74c3c', '#34495e', '#e67e22'];

let widgets = [];
let categories = [];   // список категорий (вкладок) — по умолчанию пуст
let history = [];      // журнал выполненных задач для статистики
let activeType = null; // выбранная вкладка; null, пока нет ни одной категории
let savedTheme = 'light';
let lineIdCounter = 0;

// ---------- элементы ----------
const taskWidgetsEl = document.getElementById('task-widgets');
const emptyStateEl = document.getElementById('empty-state');
const typeTabsEl = document.getElementById('type-tabs');

const addTaskModal = document.getElementById('add-task-modal');
const addTaskBtn = document.getElementById('add-task-btn');
const closeAddTaskBtn = document.getElementById('close-add-task');
const cancelTaskWidgetBtn = document.getElementById('cancel-task-widget-btn');
const saveTaskWidgetBtn = document.getElementById('save-task-widget-btn');
const taskTypeInput = document.getElementById('task-type-input');
const typeSuggestionsEl = document.getElementById('type-suggestions');
const taskLinesContainer = document.getElementById('task-lines-container');
const addTaskLineBtn = document.getElementById('add-task-line-btn');
const dueDateTrigger = document.getElementById('toggle-due-date-btn');
const clearDueDateBtn = document.getElementById('clear-due-date-btn');
const dueDateCalendar = document.getElementById('due-date-calendar');
const calendarMonthLabel = document.getElementById('calendar-month-label');
const calendarDaysEl = document.getElementById('calendar-days');
const calendarPrevBtn = document.getElementById('calendar-prev-btn');
const calendarNextBtn = document.getElementById('calendar-next-btn');
const calendarTodayBtn = document.getElementById('calendar-today-btn');
const widgetTypeToggle = document.getElementById('widget-type-toggle');
const listModeFields = document.getElementById('list-mode-fields');
const progressModeFields = document.getElementById('progress-mode-fields');
const taskProgressTitleInput = document.getElementById('task-progress-title-input');
const taskProgressStepsInput = document.getElementById('task-progress-steps-input');
const dailyModeFields = document.getElementById('daily-mode-fields');
const taskDailyTitleInput = document.getElementById('task-daily-title-input');
const taskDailyDaysInput = document.getElementById('task-daily-days-input');

let currentWidgetMode = 'list';
let selectedDueDate = null;        // выбранная дата в модалке, формат 'YYYY-MM-DD'
let calendarViewDate = new Date(); // месяц, который сейчас показан в календаре выбора срока

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const settingsModal = document.getElementById('settings-modal');
const settingsBtn = document.getElementById('settings-btn');
const closeSettingsBtn = document.getElementById('close-settings');
const okSettingsBtn = document.getElementById('ok-settings-btn');
const calendarBtn = document.getElementById('calendar-btn');
const progressBtn = document.getElementById('progress-btn');

const calendarModal = document.getElementById('calendar-modal');
const closeCalendarModalBtn = document.getElementById('close-calendar-modal');
const okCalendarBtn = document.getElementById('ok-calendar-btn');
const mainCalendarDaysEl = document.getElementById('main-calendar-days');
const mainCalendarMonthLabel = document.getElementById('main-calendar-month-label');
const mainCalendarPrevBtn = document.getElementById('main-calendar-prev-btn');
const mainCalendarNextBtn = document.getElementById('main-calendar-next-btn');
const calendarDayDetailEl = document.getElementById('calendar-day-detail');
const calendarDayDetailTitleEl = document.getElementById('calendar-day-detail-title');
const calendarDayDetailListEl = document.getElementById('calendar-day-detail-list');

let mainCalendarViewDate = new Date();
let mainCalendarSelectedDate = null;

const statsModal = document.getElementById('stats-modal');
const closeStatsBtn = document.getElementById('close-stats');
const okStatsBtn = document.getElementById('ok-stats-btn');

const exportDataBtn = document.getElementById('export-data-btn');
const importDataBtn = document.getElementById('import-data-btn');
const importFileInput = document.getElementById('import-file-input');

// ==================== IndexedDB (резервное хранилище) ====================
// localStorage остаётся основным хранилищем — он синхронный и простой.
// IndexedDB используется только как «второй карман»: если Safari на iOS
// вдруг очистит localStorage, при следующем запуске данные подхватятся отсюда.

const IDB_NAME = 'tasksAppDB';
const IDB_STORE = 'kv';

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB недоступен')); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

async function idbGet(key) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
  } catch (e) {
    return undefined;
  }
}

// ==================== ХРАНЕНИЕ ====================

function saveWidgets() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  } catch (e) {
    console.error('Не удалось сохранить задачи в localStorage:', e);
  }
  idbSet(STORAGE_KEY, widgets);
}

function saveCategories() {
  try {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  } catch (e) {
    console.error('Не удалось сохранить категории в localStorage:', e);
  }
  idbSet(CATEGORIES_KEY, categories);
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Не удалось сохранить историю в localStorage:', e);
  }
  idbSet(HISTORY_KEY, history);
}

function logCompletion(type) {
  history.push({ type, ts: Date.now(), date: toISODate(new Date()) });
  // не даём журналу расти бесконечно
  if (history.length > 1000) {
    history = history.slice(history.length - 1000);
  }
  saveHistory();
}

function ensureCategory(type) {
  if (!categories.includes(type)) {
    categories.push(type);
    saveCategories();
  }
}

async function loadAllData() {
  // тема
  try {
    savedTheme = localStorage.getItem(THEME_KEY) || (await idbGet(THEME_KEY)) || 'light';
  } catch (e) {
    savedTheme = 'light';
  }

  // задачи (виджеты)
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      widgets = JSON.parse(raw);
    } else {
      const idbWidgets = await idbGet(STORAGE_KEY);
      widgets = Array.isArray(idbWidgets) ? idbWidgets : [];
      if (widgets.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
      }
    }
  } catch (e) {
    console.error('Не удалось прочитать задачи:', e);
    widgets = [];
  }

  // категории (вкладки)
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (raw) {
      categories = JSON.parse(raw);
    } else {
      const idbCats = await idbGet(CATEGORIES_KEY);
      categories = Array.isArray(idbCats) ? idbCats : [];
    }
  } catch (e) {
    console.error('Не удалось прочитать категории:', e);
    categories = [];
  }

  // на случай данных из прошлой версии приложения (со старыми фиксированными
  // вкладками) — не теряем их, а превращаем в динамические категории
  if (categories.length === 0 && widgets.length > 0) {
    categories = Array.from(new Set(widgets.map(w => w.type)));
    saveCategories();
  }
  if (categories.length > 0) {
    activeType = categories[0];
  }

  // история выполненных задач
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      history = JSON.parse(raw);
    } else {
      const idbHist = await idbGet(HISTORY_KEY);
      history = Array.isArray(idbHist) ? idbHist : [];
    }
  } catch (e) {
    console.error('Не удалось прочитать историю:', e);
    history = [];
  }
}

function colorForType(type) {
  if (TYPE_COLOR_MAP[type]) return TYPE_COLOR_MAP[type];

  // для произвольных пользовательских категорий — стабильный цвет по хэшу названия,
  // чтобы одна и та же категория всегда получала один и тот же цвет
  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FALLBACK_TYPE_COLORS.length;
  return FALLBACK_TYPE_COLORS[index];
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d;
}

function pluralTasks(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'задача';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'задачи';
  return 'задач';
}

// ==================== ВКЛАДКИ КАТЕГОРИЙ ====================

function renderTypeTabs() {
  typeTabsEl.innerHTML = '';

  if (categories.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'type-tabs-empty-hint';
    hint.textContent = 'Категорий пока нет — создайте первую задачу';
    typeTabsEl.appendChild(hint);
    return;
  }

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'type-tab neumorphic-btn small' + (cat === activeType ? ' active' : '');
    btn.dataset.type = cat;
    btn.textContent = cat;
    typeTabsEl.appendChild(btn);
  });
}

typeTabsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.type-tab');
  if (!btn) return;

  typeTabsEl.querySelectorAll('.type-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeType = btn.dataset.type;
  render();
});

// ==================== РЕНДЕР ЗАДАЧ ====================

function render() {
  const filtered = widgets.filter(w => w.type === activeType);

  taskWidgetsEl.innerHTML = '';

  if (filtered.length === 0) {
    emptyStateEl.classList.add('show');
  } else {
    emptyStateEl.classList.remove('show');
  }

  filtered.forEach((widget) => {
    taskWidgetsEl.appendChild(renderWidget(widget));
  });
}

function renderWidget(widget) {
  const el = document.createElement('div');
  el.className = 'task-widget';
  el.dataset.id = widget.id;
  el.style.setProperty('--widget-color', colorForType(widget.type));

  const title = document.createElement('h3');
  title.textContent = (widget.mode === 'progress' || widget.mode === 'daily') ? widget.title : widget.type;
  el.appendChild(title);

  if (widget.dueDate) {
    const due = document.createElement('p');
    due.className = 'due-date';
    due.textContent = 'До ' + formatDate(widget.dueDate);
    el.appendChild(due);
  }

  if (widget.mode === 'progress') {
    renderProgressBody(el, widget);
  } else if (widget.mode === 'daily') {
    renderDailyBody(el, widget);
  } else {
    renderListBody(el, widget);
  }

  return el;
}

function renderListBody(el, widget) {
  const list = document.createElement('div');
  list.className = 'task-list';

  widget.tasks.forEach(task => {
    const row = document.createElement('div');
    row.className = 'task-row' + (task.done ? ' done' : '');
    row.dataset.taskId = task.id;

    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = task.text;
    row.appendChild(text);

    const completeBtn = document.createElement('button');
    completeBtn.className = 'task-complete-btn';
    completeBtn.textContent = task.done ? 'Готово' : 'Завершить';
    completeBtn.disabled = task.done;
    completeBtn.addEventListener('click', () => completeTask(widget.id, task.id));
    row.appendChild(completeBtn);

    list.appendChild(row);
  });

  el.appendChild(list);

  // подвал виджета: «Пропустить» — слева, того же размера и формы,
  // что и кнопки «Завершить» у отдельных пунктов
  const footer = document.createElement('div');
  footer.className = 'widget-footer';

  const skipBtn = document.createElement('button');
  skipBtn.className = 'widget-skip-btn';
  skipBtn.textContent = 'Пропустить';
  skipBtn.addEventListener('click', () => removeWidget(widget.id));
  footer.appendChild(skipBtn);

  el.appendChild(footer);
}

// ==================== ЛОГИКА ЗАДАЧ ====================

function renderProgressBody(el, widget) {
  const steps = Math.max(1, widget.steps || 1);
  const progress = Math.min(widget.progress || 0, steps);
  const percent = Math.round((progress / steps) * 100);

  const barContainer = document.createElement('div');
  barContainer.className = 'task-progress-container';

  const barFill = document.createElement('div');
  barFill.className = 'task-progress-fill';
  barFill.style.width = percent + '%';
  barContainer.appendChild(barFill);
  el.appendChild(barContainer);

  const label = document.createElement('p');
  label.className = 'task-progress-label';
  label.textContent = `${progress} / ${steps} (${percent}%)`;
  el.appendChild(label);

  // подвал виджета: «Пропустить» слева (компактная кнопка, как «Завершить»),
  // «Сделать» — справа, занимает оставшееся место
  const footer = document.createElement('div');
  footer.className = 'widget-footer';

  const skipBtn = document.createElement('button');
  skipBtn.className = 'widget-skip-btn';
  skipBtn.textContent = 'Пропустить';
  skipBtn.addEventListener('click', () => removeWidget(widget.id));
  footer.appendChild(skipBtn);

  const stepBtn = document.createElement('button');
  stepBtn.className = 'progress-step-btn';
  stepBtn.textContent = 'Сделать';
  stepBtn.addEventListener('click', () => incrementProgress(widget.id));
  footer.appendChild(stepBtn);

  el.appendChild(footer);
}

function incrementProgress(widgetId) {
  const widget = widgets.find(w => w.id === widgetId);
  if (!widget || widget.mode !== 'progress') return;

  const steps = Math.max(1, widget.steps || 1);
  widget.progress = Math.min((widget.progress || 0) + 1, steps);
  saveWidgets();

  if (widget.progress >= steps) {
    // шкала заполнена на 100% — это засчитывается как выполненная задача
    logCompletion(widget.type);
    removeWidget(widgetId);
  } else {
    render();
  }
}

// ---------- виджет «Daily Check»: сетка из N ячеек-дней ----------
// Каждая ячейка соответствует конкретному календарному дню (startDate + i).
// Закрыть можно только ячейку сегодняшнего дня — на это даётся ровно 24 часа
// (то есть текущие сутки); прошлые дни закрыть нельзя, будущие — тоже.
// Если день закончился, а ячейка не была отмечена — она остаётся выпуклой,
// но становится красной («пропущено»).

function renderDailyBody(el, widget) {
  const totalDays = Math.max(1, widget.totalDays || 1);
  const todayISO = toISODate(new Date());
  const checks = widget.checks || {};

  const grid = document.createElement('div');
  grid.className = 'daily-grid';

  let doneCount = 0;
  let missedCount = 0;

  for (let i = 0; i < totalDays; i++) {
    const cellISO = toISODate(addDays(widget.startDate, i));

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'daily-cell';
    cell.textContent = String(i + 1);

    if (checks[cellISO]) {
      cell.classList.add('done');
      cell.disabled = true;
      doneCount++;
    } else if (cellISO === todayISO) {
      cell.classList.add('is-today');
      cell.addEventListener('click', () => markDailyCellDone(widget.id, cellISO));
    } else {
      cell.disabled = true;
      if (cellISO < todayISO) {
        cell.classList.add('missed');
        missedCount++;
      }
    }

    grid.appendChild(cell);
  }

  el.appendChild(grid);

  const summary = document.createElement('p');
  summary.className = 'daily-summary';
  summary.textContent = missedCount > 0
    ? `Выполнено ${doneCount} из ${totalDays} · пропущено ${missedCount}`
    : `Выполнено ${doneCount} из ${totalDays}`;
  el.appendChild(summary);

  const footer = document.createElement('div');
  footer.className = 'widget-footer';

  const skipBtn = document.createElement('button');
  skipBtn.className = 'widget-skip-btn';
  skipBtn.textContent = 'Пропустить';
  skipBtn.addEventListener('click', () => removeWidget(widget.id));
  footer.appendChild(skipBtn);

  el.appendChild(footer);
}

function markDailyCellDone(widgetId, iso) {
  const widget = widgets.find(w => w.id === widgetId);
  if (!widget || widget.mode !== 'daily') return;

  const todayISO = toISODate(new Date());
  if (iso !== todayISO) return; // закрывать можно только сегодняшнюю ячейку

  if (!widget.checks) widget.checks = {};
  if (widget.checks[iso]) return;

  widget.checks[iso] = true;
  saveWidgets();
  logCompletion(widget.type);
  render();
}

function completeTask(widgetId, taskId) {
  const widget = widgets.find(w => w.id === widgetId);
  if (!widget) return;

  const task = widget.tasks.find(t => t.id === taskId);
  if (!task || task.done) return;

  task.done = true;
  saveWidgets();
  logCompletion(widget.type);

  const allDone = widget.tasks.every(t => t.done);
  if (allDone) {
    // все пункты выполнены — виджет удаляется
    removeWidget(widgetId);
  } else {
    render();
  }
}

function removeWidget(widgetId) {
  const el = taskWidgetsEl.querySelector(`[data-id="${widgetId}"]`);
  const finish = () => {
    widgets = widgets.filter(w => w.id !== widgetId);
    saveWidgets();
    render();
  };

  if (el) {
    el.classList.add('removing');
    el.addEventListener('animationend', finish, { once: true });
    // подстраховка, если анимация не сработает
    setTimeout(finish, 400);
  } else {
    finish();
  }
}

// ==================== МОДАЛКА ДОБАВЛЕНИЯ ЗАДАЧИ ====================

function openModal(modalEl) {
  document.body.classList.add('menu-open');
  modalEl.classList.add('show');
}

function closeModal(modalEl) {
  modalEl.classList.remove('show');
  document.body.classList.remove('menu-open');
}

function createTaskLine(value = '') {
  const row = document.createElement('div');
  row.className = 'task-line-row';
  row.dataset.lineId = ++lineIdCounter;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'neumorphic-input task-line-input';
  input.placeholder = 'Текст задачи';
  input.value = value;
  row.appendChild(input);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-task-line-btn';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    // не даём удалить последнюю оставшуюся строку
    if (taskLinesContainer.children.length > 1) {
      row.remove();
    } else {
      input.value = '';
    }
  });
  row.appendChild(removeBtn);

  return row;
}

function syncTypeSuggestionChips() {
  const val = taskTypeInput.value.trim();
  typeSuggestionsEl.querySelectorAll('.type-suggestion-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.preset === val);
  });
}

function resetAddTaskModal() {
  taskTypeInput.value = activeType || '';
  syncTypeSuggestionChips();

  taskLinesContainer.innerHTML = '';
  taskLinesContainer.appendChild(createTaskLine());

  selectedDueDate = null;
  updateDueDateTrigger();
  closeCalendar();

  currentWidgetMode = 'list';
  widgetTypeToggle.querySelectorAll('.widget-type-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'list'));
  listModeFields.classList.remove('hidden');
  progressModeFields.classList.add('hidden');
  dailyModeFields.classList.add('hidden');
  taskProgressTitleInput.value = '';
  taskProgressStepsInput.value = 10;
  taskDailyTitleInput.value = '';
  taskDailyDaysInput.value = 20;
}

widgetTypeToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.widget-type-btn');
  if (!btn) return;

  currentWidgetMode = btn.dataset.mode;
  widgetTypeToggle.querySelectorAll('.widget-type-btn').forEach(b => b.classList.toggle('active', b === btn));

  listModeFields.classList.toggle('hidden', currentWidgetMode !== 'list');
  progressModeFields.classList.toggle('hidden', currentWidgetMode !== 'progress');
  dailyModeFields.classList.toggle('hidden', currentWidgetMode !== 'daily');
});

typeSuggestionsEl.addEventListener('click', (e) => {
  const chip = e.target.closest('.type-suggestion-chip');
  if (!chip) return;

  taskTypeInput.value = chip.dataset.preset;
  syncTypeSuggestionChips();
  taskTypeInput.focus();
});

taskTypeInput.addEventListener('input', syncTypeSuggestionChips);

// ---------- общий рендер сетки календаря (переиспользуется в обоих календарях) ----------

function loadLevelForDate(iso) {
  const count = widgets.filter(w => w.dueDate === iso).length;
  if (count === 0) return { level: 'none', count };
  if (count === 1) return { level: 'medium', count };
  return { level: 'high', count };
}

function buildCalendarDays(container, viewDate, opts = {}) {
  const { selectedDate = null, showLoad = false, onDayClick = null } = opts;
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  container.innerHTML = '';

  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = понедельник
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayISO = toISODate(new Date());

  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement('span');
    empty.className = 'calendar-day empty';
    container.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${pad2(month + 1)}-${pad2(day)}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'calendar-day';
    btn.textContent = day;

    if (iso === todayISO) btn.classList.add('today');
    if (iso === selectedDate) btn.classList.add('selected');

    if (showLoad) {
      const { level, count } = loadLevelForDate(iso);
      if (level !== 'none') {
        btn.classList.add('load-' + level);
        btn.setAttribute('aria-label', `${day}: ${count} ${pluralTasks(count)}`);
        const dot = document.createElement('span');
        dot.className = 'calendar-day-dot';
        btn.appendChild(dot);
      }
    }

    if (onDayClick) {
      btn.addEventListener('click', () => onDayClick(iso));
    }

    container.appendChild(btn);
  }
}

// ---------- собственный календарь для выбора срока ----------

function renderCalendar() {
  calendarMonthLabel.textContent = `${MONTH_NAMES[calendarViewDate.getMonth()]} ${calendarViewDate.getFullYear()}`;
  buildCalendarDays(calendarDaysEl, calendarViewDate, {
    selectedDate: selectedDueDate,
    showLoad: true,
    onDayClick: selectDueDate
  });
}

function selectDueDate(iso) {
  selectedDueDate = iso;
  updateDueDateTrigger();
  closeCalendar();
}

function updateDueDateTrigger() {
  if (selectedDueDate) {
    dueDateTrigger.textContent = 'Дедлайн: ' + formatDate(selectedDueDate);
    dueDateTrigger.classList.add('has-date');
    clearDueDateBtn.classList.remove('hidden');
  } else {
    dueDateTrigger.textContent = 'Дедлайн';
    dueDateTrigger.classList.remove('has-date');
    clearDueDateBtn.classList.add('hidden');
  }
}

function openCalendar() {
  calendarViewDate = selectedDueDate ? new Date(selectedDueDate + 'T00:00:00') : new Date();
  renderCalendar();
  dueDateCalendar.classList.remove('hidden');
}

function closeCalendar() {
  dueDateCalendar.classList.add('hidden');
}

dueDateTrigger.addEventListener('click', () => {
  if (dueDateCalendar.classList.contains('hidden')) {
    openCalendar();
  } else {
    closeCalendar();
  }
});

clearDueDateBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  selectedDueDate = null;
  updateDueDateTrigger();
  closeCalendar();
});

calendarPrevBtn.addEventListener('click', () => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
  renderCalendar();
});

calendarNextBtn.addEventListener('click', () => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
  renderCalendar();
});

calendarTodayBtn.addEventListener('click', () => {
  const today = new Date();
  calendarViewDate = new Date(today.getFullYear(), today.getMonth(), 1);
  selectDueDate(toISODate(today));
});

addTaskBtn.addEventListener('click', () => {
  resetAddTaskModal();
  openModal(addTaskModal);
});

closeAddTaskBtn.addEventListener('click', () => closeModal(addTaskModal));
cancelTaskWidgetBtn.addEventListener('click', () => closeModal(addTaskModal));

addTaskLineBtn.addEventListener('click', () => {
  const row = createTaskLine();
  taskLinesContainer.appendChild(row);
  row.querySelector('input').focus();
});

saveTaskWidgetBtn.addEventListener('click', () => {
  const type = taskTypeInput.value.trim();

  if (!type) {
    taskTypeInput.focus();
    return;
  }

  const dueDate = selectedDueDate;
  let newWidget;

  if (currentWidgetMode === 'progress') {
    const title = taskProgressTitleInput.value.trim();
    const steps = Math.max(1, parseInt(taskProgressStepsInput.value, 10) || 1);

    if (!title) {
      taskProgressTitleInput.focus();
      return;
    }

    newWidget = {
      id: 'w' + Date.now() + Math.random().toString(16).slice(2),
      type,
      dueDate,
      mode: 'progress',
      title,
      steps,
      progress: 0
    };
  } else if (currentWidgetMode === 'daily') {
    const title = taskDailyTitleInput.value.trim();
    const totalDays = Math.min(365, Math.max(1, parseInt(taskDailyDaysInput.value, 10) || 1));

    if (!title) {
      taskDailyTitleInput.focus();
      return;
    }

    newWidget = {
      id: 'w' + Date.now() + Math.random().toString(16).slice(2),
      type,
      dueDate,
      mode: 'daily',
      title,
      totalDays,
      startDate: toISODate(new Date()),
      checks: {}
    };
  } else {
    const texts = Array.from(taskLinesContainer.querySelectorAll('.task-line-input'))
      .map(input => input.value.trim())
      .filter(text => text.length > 0);

    if (texts.length === 0) {
      taskTypeInput.focus();
      return;
    }

    newWidget = {
      id: 'w' + Date.now() + Math.random().toString(16).slice(2),
      type,
      dueDate,
      mode: 'list',
      tasks: texts.map(text => ({
        id: 't' + Date.now() + Math.random().toString(16).slice(2),
        text,
        done: false
      }))
    };
  }

  widgets.push(newWidget);
  saveWidgets();

  // регистрируем категорию (если она новая — появится вкладка) и переключаемся
  // на неё, чтобы пользователь сразу увидел созданную задачу
  ensureCategory(type);
  activeType = type;
  renderTypeTabs();

  closeModal(addTaskModal);
  render();
});

// ==================== КАЛЕНДАРЬ ЗАГРУЗКИ (главный экран) ====================

function renderMainCalendar() {
  mainCalendarMonthLabel.textContent = `${MONTH_NAMES[mainCalendarViewDate.getMonth()]} ${mainCalendarViewDate.getFullYear()}`;
  buildCalendarDays(mainCalendarDaysEl, mainCalendarViewDate, {
    selectedDate: mainCalendarSelectedDate,
    showLoad: true,
    onDayClick: showCalendarDayDetail
  });
}

function showCalendarDayDetail(iso) {
  mainCalendarSelectedDate = iso;
  renderMainCalendar();

  const dayWidgets = widgets.filter(w => w.dueDate === iso);

  calendarDayDetailTitleEl.textContent = dayWidgets.length
    ? `${formatDate(iso)} — ${dayWidgets.length} ${pluralTasks(dayWidgets.length)}`
    : `${formatDate(iso)} — свободный день`;

  calendarDayDetailListEl.innerHTML = '';

  if (dayWidgets.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'stats-empty';
    empty.textContent = 'На этот день ничего не запланировано';
    calendarDayDetailListEl.appendChild(empty);
  } else {
    dayWidgets.forEach(w => {
      const item = document.createElement('div');
      item.className = 'calendar-day-detail-item';

      const name = document.createElement('span');
      if (w.mode === 'progress' || w.mode === 'daily') {
        name.textContent = w.title;
      } else {
        const firstText = w.tasks[0] ? w.tasks[0].text : w.type;
        name.textContent = w.tasks.length > 1 ? `${firstText} +${w.tasks.length - 1}` : firstText;
      }

      const type = document.createElement('span');
      type.className = 'cddi-type';
      type.textContent = w.type;

      item.appendChild(name);
      item.appendChild(type);
      calendarDayDetailListEl.appendChild(item);
    });
  }

  calendarDayDetailEl.classList.remove('hidden');
}

mainCalendarPrevBtn.addEventListener('click', () => {
  mainCalendarViewDate = new Date(mainCalendarViewDate.getFullYear(), mainCalendarViewDate.getMonth() - 1, 1);
  renderMainCalendar();
});

mainCalendarNextBtn.addEventListener('click', () => {
  mainCalendarViewDate = new Date(mainCalendarViewDate.getFullYear(), mainCalendarViewDate.getMonth() + 1, 1);
  renderMainCalendar();
});

calendarBtn.addEventListener('click', () => {
  mainCalendarViewDate = new Date();
  mainCalendarSelectedDate = null;
  calendarDayDetailEl.classList.add('hidden');
  renderMainCalendar();
  openModal(calendarModal);
});

closeCalendarModalBtn.addEventListener('click', () => closeModal(calendarModal));
okCalendarBtn.addEventListener('click', () => closeModal(calendarModal));

// ==================== ПРОГРЕСС / СТАТИСТИКА ====================

function computeStats() {
  const todayISO = toISODate(new Date());
  const total = history.length;
  const todayCount = history.filter(h => h.date === todayISO).length;

  // последние 7 дней, от старых к новым
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(toISODate(d));
  }
  const weekCounts = days.map(iso => history.filter(h => h.date === iso).length);
  const weekTotal = weekCounts.reduce((a, b) => a + b, 0);

  // текущая серия дней подряд с хотя бы одной выполненной задачей
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = toISODate(d);
    const has = history.some(h => h.date === iso);
    if (has) {
      streak++;
    } else {
      break;
    }
  }

  const byCategory = {};
  history.forEach(h => {
    byCategory[h.type] = (byCategory[h.type] || 0) + 1;
  });

  return { total, todayCount, weekTotal, days, weekCounts, streak, byCategory, todayISO };
}

function renderStats() {
  const s = computeStats();

  const summaryEl = document.getElementById('stats-summary');
  summaryEl.innerHTML = '';

  const cards = [
    { value: s.total, label: 'Всего выполнено' },
    { value: s.todayCount, label: 'Сегодня' },
    { value: s.weekTotal, label: 'За 7 дней' },
    { value: s.streak, label: s.streak === 1 ? 'День подряд' : 'Дней подряд' }
  ];

  cards.forEach(c => {
    const card = document.createElement('div');
    card.className = 'stat-card';

    const val = document.createElement('span');
    val.className = 'stat-value';
    val.textContent = c.value;

    const lab = document.createElement('span');
    lab.className = 'stat-label';
    lab.textContent = c.label;

    card.appendChild(val);
    card.appendChild(lab);
    summaryEl.appendChild(card);
  });

  const chartEl = document.getElementById('stats-chart');
  chartEl.innerHTML = '';
  const maxCount = Math.max(1, ...s.weekCounts);

  s.days.forEach((iso, idx) => {
    const col = document.createElement('div');
    col.className = 'stats-chart-col' + (iso === s.todayISO ? ' is-today' : '');

    const bar = document.createElement('div');
    bar.className = 'stats-chart-bar';
    const count = s.weekCounts[idx];
    const heightPx = count > 0 ? Math.max(6, Math.round((count / maxCount) * 60)) : 3;
    bar.style.height = heightPx + 'px';
    bar.title = `${formatDate(iso)}: ${count} ${pluralTasks(count)}`;

    const label = document.createElement('span');
    label.className = 'stats-chart-col-label';
    const d = new Date(iso + 'T00:00:00');
    label.textContent = WEEKDAY_SHORT[(d.getDay() + 6) % 7];

    col.appendChild(bar);
    col.appendChild(label);
    chartEl.appendChild(col);
  });

  const catEl = document.getElementById('stats-categories');
  catEl.innerHTML = '';
  const catEntries = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);

  if (catEntries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'stats-empty';
    empty.textContent = 'Пока нет завершённых задач';
    catEl.appendChild(empty);
  } else {
    catEntries.forEach(([type, count]) => {
      const row = document.createElement('div');
      row.className = 'stats-category-row';

      const dot = document.createElement('span');
      dot.className = 'stats-category-dot';
      dot.style.setProperty('--dot-color', colorForType(type));

      const name = document.createElement('span');
      name.className = 'stats-category-name';
      name.textContent = type;

      const cnt = document.createElement('span');
      cnt.className = 'stats-category-count';
      cnt.textContent = count;

      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(cnt);
      catEl.appendChild(row);
    });
  }
}

progressBtn.addEventListener('click', () => {
  renderStats();
  openModal(statsModal);
});

closeStatsBtn.addEventListener('click', () => closeModal(statsModal));
okStatsBtn.addEventListener('click', () => closeModal(statsModal));

// ==================== НАСТРОЙКИ ====================

settingsBtn.addEventListener('click', () => openModal(settingsModal));
closeSettingsBtn.addEventListener('click', () => closeModal(settingsModal));
okSettingsBtn.addEventListener('click', () => closeModal(settingsModal));

// ---------- переключение темы (светлая / тёмная) ----------

const themeToggle = document.getElementById('theme-toggle');

function applyTheme(theme) {
  savedTheme = theme;
  document.body.classList.toggle('dark', theme === 'dark');
  themeToggle.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    console.error('Не удалось сохранить тему:', e);
  }
  idbSet(THEME_KEY, theme);
}

themeToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.theme-btn');
  if (!btn) return;
  applyTheme(btn.dataset.theme);
});

// ---------- резервная копия: экспорт / импорт ----------

exportDataBtn.addEventListener('click', () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    widgets,
    categories,
    history,
    theme: savedTheme
  };

  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-backup-${toISODate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Не удалось создать файл резервной копии:', e);
    alert('Не получилось создать файл резервной копии');
  }
});

importDataBtn.addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', async () => {
  const file = importFileInput.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data.widgets)) throw new Error('Неверный формат файла');

    widgets = data.widgets;
    categories = Array.isArray(data.categories) && data.categories.length
      ? data.categories
      : Array.from(new Set(widgets.map(w => w.type)));
    history = Array.isArray(data.history) ? data.history : [];

    saveWidgets();
    saveCategories();
    saveHistory();

    if (data.theme) applyTheme(data.theme);

    if (!categories.includes(activeType)) {
      activeType = categories[0] || null;
    }

    renderTypeTabs();
    render();

    alert('Данные успешно восстановлены из резервной копии');
  } catch (e) {
    console.error('Не удалось импортировать резервную копию:', e);
    alert('Не получилось прочитать файл резервной копии');
  } finally {
    importFileInput.value = '';
  }
});

// ==================== ОФФЛАЙН-ИНДИКАТОР ====================

function updateOfflineIndicator() {
  const indicator = document.getElementById('offline-indicator');
  if (!navigator.onLine) {
    indicator.classList.add('show');
  } else {
    indicator.classList.remove('show');
  }
}

window.addEventListener('online', updateOfflineIndicator);
window.addEventListener('offline', updateOfflineIndicator);

// ==================== SERVICE WORKER (офлайн-загрузка самого приложения) ====================
// В отличие от localStorage/IndexedDB (которые хранят только данные),
// Service Worker кэширует сами файлы приложения (HTML/CSS/JS), поэтому
// оно открывается даже при полном отсутствии интернета.

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then((reg) => {
        // если найдена новая версия — она поставится в фон и активируется
        // при следующем полном перезапуске приложения (см. skipWaiting в SW)
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              console.log('Service Worker: приложение обновлено и готово к офлайн-работе');
            }
          });
        });
      })
      .catch((e) => console.error('Не удалось зарегистрировать Service Worker:', e));
  });
}

// ==================== СТАРТ ====================

async function initApp() {
  // просим у браузера постоянное (persistent) хранилище — это снижает
  // риск того, что iOS Safari сотрёт данные сайта при нехватке места
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  await loadAllData();

  applyTheme(savedTheme);
  renderTypeTabs();
  render();
  updateOfflineIndicator();
  registerServiceWorker();
}

initApp();
