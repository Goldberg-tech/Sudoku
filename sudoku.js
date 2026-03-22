// ══ СОСТОЯНИЕ ════════════════════════════════════════════════
let puzzle    = [];   // исходный пазл (0 = пустая клетка)
let solution  = [];   // правильное решение
let userGrid  = [];   // ввод пользователя
let notes     = [];   // заметки [row][col] = Set
let selected  = null; // { row, col }
let notesMode = false;
let difficulty = 'easy';
let hintsUsed  = 0;
let errors     = 0;
let timerSec   = 0;
let timerInt   = null;
let gameWon    = false;

const REMOVE_COUNT = { easy: 36, medium: 46, hard: 54 };
const DIFF_LABEL   = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' };

// ══ ГЕНЕРАТОР СУДОКУ ══════════════════════════════════════════
function generateSolution() {
  const grid = Array.from({length:9}, () => Array(9).fill(0));
  fillGrid(grid);
  return grid;
}

function fillGrid(grid) {
  const pos = findEmpty(grid);
  if (!pos) return true;
  const [r, c] = pos;
  const nums = shuffle([1,2,3,4,5,6,7,8,9]);
  for (const n of nums) {
    if (isValid(grid, r, c, n)) {
      grid[r][c] = n;
      if (fillGrid(grid)) return true;
      grid[r][c] = 0;
    }
  }
  return false;
}

function findEmpty(grid) {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (grid[r][c] === 0) return [r, c];
  return null;
}

function isValid(grid, row, col, num) {
  // Строка
  if (grid[row].includes(num)) return false;
  // Столбец
  for (let r = 0; r < 9; r++) if (grid[r][col] === num) return false;
  // Блок 3×3
  const br = Math.floor(row/3)*3, bc = Math.floor(col/3)*3;
  for (let r = br; r < br+3; r++)
    for (let c = bc; c < bc+3; c++)
      if (grid[r][c] === num) return false;
  return true;
}

function shuffle(arr) {
  for (let i = arr.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function deepCopy(grid) {
  return grid.map(r => [...r]);
}

function createPuzzle(sol, removeCount) {
  const puz = deepCopy(sol);
  const cells = shuffle([...Array(81).keys()]);
  let removed = 0;
  for (const idx of cells) {
    if (removed >= removeCount) break;
    const r = Math.floor(idx/9), c = idx%9;
    const val = puz[r][c];
    puz[r][c] = 0;
    // Простая проверка — если убрать много сразу без проверки уникальности
    // для простоты принимаем что пазл валиден
    removed++;
  }
  return puz;
}

// ══ ТАЙМЕР ═══════════════════════════════════════════════════
function startTimer() {
  clearInterval(timerInt);
  timerInt = setInterval(() => {
    if (!gameWon) {
      timerSec++;
      updateTimerDisplay();
    }
  }, 1000);
}

function stopTimer() { clearInterval(timerInt); }

function updateTimerDisplay() {
  const m = Math.floor(timerSec/60);
  const s = timerSec % 60;
  document.getElementById('timer').textContent =
    `${m}:${String(s).padStart(2,'0')}`;
}

function formatTime(sec) {
  const m = Math.floor(sec/60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

// ══ СТАТИСТИКА ════════════════════════════════════════════════
function loadStats() {
  try { return JSON.parse(localStorage.getItem('sudoku_stats') || '{}'); }
  catch { return {}; }
}

function saveStats(s) {
  try { localStorage.setItem('sudoku_stats', JSON.stringify(s)); } catch {}
}

function updateStats(time) {
  const s = loadStats();
  const key = difficulty;
  if (!s[key]) s[key] = { solved: 0, best: null, streak: 0 };
  s[key].solved++;
  s[key].streak++;
  if (!s[key].best || time < s[key].best) s[key].best = time;
  s[key].lastDate = new Date().toDateString();
  saveStats(s);
  return s[key];
}

function renderStats(target) {
  const s = loadStats();
  const d = s[difficulty] || { solved:0, best:null, streak:0 };
  document.getElementById(target+'-solved').textContent = d.solved || 0;
  document.getElementById(target+'-best').textContent = d.best ? formatTime(d.best) : '—';
  document.getElementById(target+'-streak').textContent = d.streak || 0;
}

// ══ РЕНДЕР СЕТКИ ═════════════════════════════════════════════
function buildGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.addEventListener('click', () => selectCell(r, c));
      grid.appendChild(cell);
    }
  }
}

function renderGrid() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      renderCell(r, c);
    }
  }
  highlightRelated();
}

function renderCell(r, c) {
  const cell = getCell(r, c);
  const given = puzzle[r][c] !== 0;
  const val = given ? puzzle[r][c] : userGrid[r][c];
  const cellNotes = notes[r][c];

  // Класс
  cell.className = 'cell';
  if (given) cell.classList.add('given');

  if (val) {
    cell.innerHTML = '';
    cell.textContent = val;
    if (!given) {
      if (val !== solution[r][c]) {
        cell.classList.add('error');
      } else {
        cell.classList.add('user-val');
      }
    }
  } else if (cellNotes.size > 0) {
    cell.textContent = '';
    const notesEl = document.createElement('div');
    notesEl.className = 'cell-notes';
    for (let n = 1; n <= 9; n++) {
      const noteEl = document.createElement('div');
      noteEl.className = 'note';
      noteEl.textContent = cellNotes.has(n) ? n : '';
      notesEl.appendChild(noteEl);
    }
    cell.appendChild(notesEl);
  } else {
    cell.textContent = '';
  }
}

function getCell(r, c) {
  return document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}

function highlightRelated() {
  // Сброс
  document.querySelectorAll('.cell').forEach(el => {
    el.classList.remove('selected', 'highlight', 'same-num');
  });

  if (!selected) return;

  const { row, col } = selected;
  const selVal = getVal(row, col);
  const br = Math.floor(row/3)*3, bc = Math.floor(col/3)*3;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = getCell(r, c);
      if (r === row && c === col) {
        cell.classList.add('selected');
      } else if (
        r === row || c === col ||
        (r >= br && r < br+3 && c >= bc && c < bc+3)
      ) {
        cell.classList.add('highlight');
      }
      // Подсветка одинаковых цифр
      if (selVal && getVal(r, c) === selVal) {
        cell.classList.add('same-num');
      }
    }
  }
}

function getVal(r, c) {
  return puzzle[r][c] || userGrid[r][c] || 0;
}

// ══ ВЗАИМОДЕЙСТВИЕ ════════════════════════════════════════════
function selectCell(r, c) {
  selected = { row: r, col: c };
  highlightRelated();
}

function inputNumber(num) {
  if (!selected || gameWon) return;
  const { row, col } = selected;
  if (puzzle[row][col] !== 0) return; // дано — нельзя менять

  if (notesMode) {
    if (userGrid[row][col]) return; // если уже введена цифра
    if (notes[row][col].has(num)) notes[row][col].delete(num);
    else notes[row][col].add(num);
    renderCell(row, col);
    highlightRelated();
    return;
  }

  // Стираем заметки
  notes[row][col].clear();
  userGrid[row][col] = num;
  renderCell(row, col);
  highlightRelated();

  // Проверяем победу
  if (checkWin()) {
    gameWon = true;
    stopTimer();
    const st = updateStats(timerSec);
    setTimeout(() => openWinModal(st), 600);
  }
}

function eraseCell() {
  if (!selected || gameWon) return;
  const { row, col } = selected;
  if (puzzle[row][col] !== 0) return;
  userGrid[row][col] = 0;
  notes[row][col].clear();
  renderCell(row, col);
  highlightRelated();
}

function giveHint() {
  if (!selected || gameWon) return;
  const { row, col } = selected;
  if (puzzle[row][col] !== 0) return;
  userGrid[row][col] = solution[row][col];
  notes[row][col].clear();
  hintsUsed++;
  renderCell(row, col);
  highlightRelated();
  if (checkWin()) {
    gameWon = true;
    stopTimer();
    const st = updateStats(timerSec);
    setTimeout(() => openWinModal(st), 600);
  }
}

function checkWin() {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const val = puzzle[r][c] || userGrid[r][c];
      if (val !== solution[r][c]) return false;
    }
  return true;
}

// ══ НОВАЯ ИГРА ════════════════════════════════════════════════
function newGame(diff) {
  if (diff) difficulty = diff;
  solution  = generateSolution();
  puzzle    = createPuzzle(solution, REMOVE_COUNT[difficulty]);
  userGrid  = Array.from({length:9}, () => Array(9).fill(0));
  notes     = Array.from({length:9}, () => Array.from({length:9}, () => new Set()));
  selected  = null;
  notesMode = false;
  hintsUsed = 0;
  errors    = 0;
  timerSec  = 0;
  gameWon   = false;

  document.getElementById('btn-notes').classList.remove('active');
  updateTimerDisplay();
  renderGrid();
  updateNumpadDone();
  startTimer();
}

// ══ НУМПАД ═══════════════════════════════════════════════════
function buildNumpad() {
  const numpad = document.getElementById('numpad');
  numpad.innerHTML = '';
  for (let n = 1; n <= 9; n++) {
    const btn = document.createElement('button');
    btn.className = 'num-btn';
    btn.textContent = n;
    btn.dataset.num = n;
    btn.addEventListener('click', () => inputNumber(n));
    numpad.appendChild(btn);
  }
}

function updateNumpadDone() {
  // Подсвечиваем цифры которые уже все расставлены
  const count = Array(10).fill(0);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const v = puzzle[r][c] || userGrid[r][c];
      if (v) count[v]++;
    }
  for (let n = 1; n <= 9; n++) {
    const btn = document.querySelector(`[data-num="${n}"]`);
    if (btn) {
      if (count[n] >= 9) btn.classList.add('done');
      else btn.classList.remove('done');
    }
  }
}

// ══ ПОБЕДНЫЙ МОДАЛ ════════════════════════════════════════════
function openWinModal(stats) {
  updateNumpadDone();
  document.getElementById('win-badge').textContent = DIFF_LABEL[difficulty];
  document.getElementById('win-badge').className = `badge badge-${difficulty}`;
  document.getElementById('win-time').textContent = `Время: ${formatTime(timerSec)}${hintsUsed ? ` · Подсказок: ${hintsUsed}` : ''}`;
  document.getElementById('s-solved').textContent = stats.solved || 0;
  document.getElementById('s-best').textContent = stats.best ? formatTime(stats.best) : '—';
  document.getElementById('s-streak').textContent = stats.streak || 0;
  document.getElementById('win-modal').classList.add('open');
}

function shareResult() {
  const diffEmoji = { easy: '🟢', medium: '🟡', hard: '🔴' };
  const text = `Судоку решено! ${diffEmoji[difficulty]} ${DIFF_LABEL[difficulty]}\n⏱ Время: ${formatTime(timerSec)}${hintsUsed ? `\n💡 Подсказок: ${hintsUsed}` : ''}\n\nИграй в MAX: https://max.ru/твой_ник_бота?startapp`;
  const encoded = encodeURIComponent(text);
  const tg = window.MaxBridge;
  if (tg && tg.shareContent) {
    try { tg.shareContent({ text }); return; } catch {}
  }
  window.open(`https://max.ru/:share?text=${encoded}`, '_blank');
}

// ══ СТАРТ ════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  buildGrid();
  buildNumpad();
  newGame('easy');

  // Сложность
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      newGame(btn.dataset.diff);
    });
  });

  // Тулбар
  document.getElementById('btn-erase').addEventListener('click', eraseCell);
  document.getElementById('btn-notes').addEventListener('click', () => {
    notesMode = !notesMode;
    document.getElementById('btn-notes').classList.toggle('active', notesMode);
  });
  document.getElementById('btn-hint').addEventListener('click', giveHint);
  document.getElementById('btn-new').addEventListener('click', () => newGame());

  // Модалки
  document.getElementById('btn-stats-open').addEventListener('click', () => {
    renderStats('ss');
    document.getElementById('stats-modal').classList.add('open');
  });
  document.getElementById('btn-close-stats').addEventListener('click', () => {
    document.getElementById('stats-modal').classList.remove('open');
  });
  document.getElementById('btn-share').addEventListener('click', shareResult);
  document.getElementById('btn-new-game').addEventListener('click', () => {
    document.getElementById('win-modal').classList.remove('open');
    newGame();
  });

  // Клавиатура
  document.addEventListener('keydown', e => {
    if (e.key >= '1' && e.key <= '9') inputNumber(parseInt(e.key));
    if (e.key === 'Backspace' || e.key === 'Delete') eraseCell();
    if (e.key === 'ArrowUp'    && selected) selectCell(Math.max(0,selected.row-1), selected.col);
    if (e.key === 'ArrowDown'  && selected) selectCell(Math.min(8,selected.row+1), selected.col);
    if (e.key === 'ArrowLeft'  && selected) selectCell(selected.row, Math.max(0,selected.col-1));
    if (e.key === 'ArrowRight' && selected) selectCell(selected.row, Math.min(8,selected.col+1));
  });

  // MAX Bridge
  const tg = window.MaxBridge;
  if (tg) {
    try { tg.ready(); } catch(e) {}
    try { tg.expand(); } catch(e) {}
    try { if (typeof tg.requestFullscreen === 'function') tg.requestFullscreen(); } catch(e) {}
    try { if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes(); } catch(e) {}
  }
});
