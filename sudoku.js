// ══ КОНФИГ УРОВНЕЙ ═══════════════════════════════════════════
const LEVELS = [
  { id:'easy',    name:'Лёгкий',     emoji:'🟢', remove:32, unlockAt:0,  badge:'b1', desc:'Для начинающих' },
  { id:'medium',  name:'Средний',    emoji:'🟡', remove:42, unlockAt:3,  badge:'b2', desc:'Нужно 3 победы на лёгком' },
  { id:'hard',    name:'Сложный',    emoji:'🔴', remove:50, unlockAt:2,  badge:'b3', desc:'Нужно 2 победы на среднем' },
  { id:'expert',  name:'Эксперт',    emoji:'🟣', remove:56, unlockAt:4,  badge:'b4', desc:'Нужно 4 победы на сложном' },
  { id:'master',  name:'Мастер',     emoji:'⚫', remove:62, unlockAt:10, badge:'b5', desc:'Нужно 10 побед на эксперте' },
];

const MAX_ERRORS = 3;
const FREE_HINTS = 3;

// ══ СОСТОЯНИЕ ════════════════════════════════════════════════
let puzzle=[], solution=[], userGrid=[], notes=[];
let selected=null, notesMode=false;
let timerSec=0, timerInt=null, gameWon=false, gameLost=false;
let currentLevel='easy', isDaily=false;
let hintsLeft=FREE_HINTS, errorsCount=0;

// ══ ГЕНЕРАТОР ════════════════════════════════════════════════
function generateSolution() {
  const g = Array.from({length:9},()=>Array(9).fill(0));
  fillGrid(g);
  return g;
}
function fillGrid(g) {
  const pos = findEmpty(g);
  if (!pos) return true;
  const [r,c] = pos;
  const nums = shuffle([1,2,3,4,5,6,7,8,9]);
  for (const n of nums) {
    if (isValid(g,r,c,n)) {
      g[r][c]=n;
      if (fillGrid(g)) return true;
      g[r][c]=0;
    }
  }
  return false;
}
function findEmpty(g) {
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) if (!g[r][c]) return [r,c];
  return null;
}
function isValid(g,row,col,num) {
  if (g[row].includes(num)) return false;
  for (let r=0;r<9;r++) if (g[r][col]===num) return false;
  const br=Math.floor(row/3)*3, bc=Math.floor(col/3)*3;
  for (let r=br;r<br+3;r++) for (let c=bc;c<bc+3;c++) if (g[r][c]===num) return false;
  return true;
}
function shuffle(a) {
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function deepCopy(g) { return g.map(r=>[...r]); }

// Детерминированный генератор для судоку дня
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
function seededShuffle(arr, rng) {
  const a = [...arr];
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(rng()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function generateDailySolution() {
  const d = new Date();
  const seed = d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
  const rng = seededRandom(seed);
  const g = Array.from({length:9},()=>Array(9).fill(0));
  fillGridSeeded(g, rng);
  return g;
}
function fillGridSeeded(g, rng) {
  const pos = findEmpty(g);
  if (!pos) return true;
  const [r,c] = pos;
  const nums = seededShuffle([1,2,3,4,5,6,7,8,9], rng);
  for (const n of nums) {
    if (isValid(g,r,c,n)) {
      g[r][c]=n;
      if (fillGridSeeded(g,rng)) return true;
      g[r][c]=0;
    }
  }
  return false;
}

function createPuzzle(sol, removeCount) {
  const puz = deepCopy(sol);
  const cells = shuffle([...Array(81).keys()]);
  let removed = 0;
  for (const idx of cells) {
    if (removed >= removeCount) break;
    const r=Math.floor(idx/9), c=idx%9;
    puz[r][c]=0; removed++;
  }
  return puz;
}

// ══ ХРАНИЛИЩЕ ════════════════════════════════════════════════
function ls(key, def={}) {
  try { return JSON.parse(localStorage.getItem(key)||'null') ?? def; } catch { return def; }
}
function ss(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function getStats() { return ls('sudoku_stats', {}); }
function saveStats(s) { ss('sudoku_stats', s); }
function getHistory() { return ls('sudoku_history', []); }
function saveHistory(h) { ss('sudoku_history', h); }

function getDateKey() {
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getLevelStats(lvlId) {
  const s = getStats();
  return s[lvlId] || { solved:0, best:null, streak:0 };
}

function isLevelUnlocked(lvl) {
  if (lvl.unlockAt === 0) return true;
  const idx = LEVELS.findIndex(l=>l.id===lvl.id);
  if (idx===0) return true;
  const prev = LEVELS[idx-1];
  const prevSt = getLevelStats(prev.id);
  return (prevSt.solved||0) >= lvl.unlockAt;
}

function isDailyDone() {
  const s = getStats();
  return s.daily && s.daily.date === getDateKey();
}

function formatTime(sec) {
  const m=Math.floor(sec/60), s=sec%60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

// ══ ТАЙМЕР ═══════════════════════════════════════════════════
function startTimer() {
  clearInterval(timerInt);
  timerInt = setInterval(()=>{
    if (!gameWon && !gameLost) {
      timerSec++;
      document.getElementById('g-timer').textContent = formatTime(timerSec);
    }
  },1000);
}
function stopTimer() { clearInterval(timerInt); }

// ══ НАВИГАЦИЯ ════════════════════════════════════════════════
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.screen===name);
  });
  if (name==='home') renderHome();
  if (name==='profile') renderProfile();
}

// ══ HOME ══════════════════════════════════════════════════════
function renderHome() {
  // Streak
  const stats = getStats();
  document.getElementById('home-streak').textContent = stats.streak||0;

  // Дата судоку дня
  const d = new Date();
  document.getElementById('daily-date').textContent =
    d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'});

  const done = isDailyDone();
  const btnDaily = document.getElementById('btn-daily');
  const doneMeta = document.getElementById('daily-done-meta');
  if (done) {
    btnDaily.textContent = '✅ Выполнено сегодня';
    btnDaily.disabled = true;
    doneMeta.style.display = '';
    document.getElementById('daily-done-time').textContent = formatTime(stats.daily.time);
  } else {
    btnDaily.textContent = '▶ Играть';
    btnDaily.disabled = false;
    doneMeta.style.display = 'none';
  }

  // Уровни
  const list = document.getElementById('levels-list');
  list.innerHTML = '';
  LEVELS.forEach(lvl => {
    const unlocked = isLevelUnlocked(lvl);
    const st = getLevelStats(lvl.id);
    const card = document.createElement('div');
    card.className = 'level-card' + (unlocked?'':' locked');
    const progress = unlocked
      ? `<div class="level-progress${st.solved>=10?' done':''}">${st.solved||0} игр</div>`
      : `<div class="unlock-text">🔒</div>`;

    // Текст под названием
    let desc = lvl.desc;
    if (unlocked) {
      const best = st.best ? `Рекорд: ${formatTime(st.best)}` : 'Ещё нет рекордов';
      desc = best;
    }

    card.innerHTML = `
      <div class="level-icon">${unlocked ? lvl.emoji : '🔒'}</div>
      <div class="level-info">
        <div class="level-name">${lvl.name}</div>
        <div class="level-desc">${desc}</div>
      </div>
      ${progress}
    `;
    if (unlocked) {
      card.addEventListener('click', () => startGame(lvl.id, false));
    }
    list.appendChild(card);
  });
}

// ══ НАЧАЛО ИГРЫ ═══════════════════════════════════════════════
function startGame(levelId, daily) {
  currentLevel = levelId;
  isDaily = daily;

  const lvl = LEVELS.find(l=>l.id===levelId);

  if (daily) {
    solution = generateDailySolution();
    puzzle   = createPuzzle(solution, 44);
  } else {
    solution = generateSolution();
    puzzle   = createPuzzle(solution, lvl.remove);
  }

  userGrid = Array.from({length:9},()=>Array(9).fill(0));
  notes    = Array.from({length:9},()=>Array.from({length:9},()=>new Set()));
  selected = null; notesMode = false;
  timerSec = 0; gameWon = false; gameLost = false;
  hintsLeft = FREE_HINTS; errorsCount = 0;

  document.getElementById('g-level-name').textContent = daily ? 'Судоку дня' : lvl.name;
  document.getElementById('g-timer').textContent = '0:00';
  document.getElementById('g-errors').textContent = `0/${MAX_ERRORS}`;
  document.getElementById('hints-left').textContent = hintsLeft;
  document.getElementById('btn-notes').classList.remove('active');

  buildGrid();
  buildNumpad();
  renderGrid();
  showScreen('game');
  startTimer();
}

// ══ СЕТКА ════════════════════════════════════════════════════
function buildGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML='';
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
    const cell=document.createElement('div');
    cell.className='cell';
    cell.dataset.row=r; cell.dataset.col=c;
    cell.addEventListener('click',()=>selectCell(r,c));
    grid.appendChild(cell);
  }
}

function getCell(r,c) {
  return document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}

function renderGrid() {
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) renderCell(r,c);
  highlightRelated();
}

function renderCell(r,c) {
  const cell=getCell(r,c);
  const given=puzzle[r][c]!==0;
  const val=given?puzzle[r][c]:userGrid[r][c];
  const cn=notes[r][c];

  cell.className='cell';
  if (given) cell.classList.add('given');

  if (val) {
    cell.innerHTML='';
    cell.textContent=val;
    if (!given) {
      if (val!==solution[r][c]) cell.classList.add('err');
      else cell.classList.add('uval');
    }
  } else if (cn.size>0) {
    cell.textContent='';
    const ne=document.createElement('div');
    ne.className='cell-notes';
    for (let n=1;n<=9;n++) {
      const nd=document.createElement('div');
      nd.className='note';
      nd.textContent=cn.has(n)?n:'';
      ne.appendChild(nd);
    }
    cell.appendChild(ne);
  } else {
    cell.textContent='';
  }
}

function getVal(r,c) { return puzzle[r][c]||userGrid[r][c]||0; }

function highlightRelated() {
  document.querySelectorAll('.cell').forEach(el=>{
    el.classList.remove('sel','hi','snum');
  });
  if (!selected) return;
  const {row,col}=selected;
  const selVal=getVal(row,col);
  const br=Math.floor(row/3)*3, bc=Math.floor(col/3)*3;
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
    const cell=getCell(r,c);
    if (r===row&&c===col) cell.classList.add('sel');
    else if (r===row||c===col||(r>=br&&r<br+3&&c>=bc&&c<bc+3)) cell.classList.add('hi');
    if (selVal&&getVal(r,c)===selVal) cell.classList.add('snum');
  }
}

function selectCell(r,c) {
  selected={row:r,col:c};
  highlightRelated();
}

// ══ ВВОД ═════════════════════════════════════════════════════
function inputNumber(num) {
  if (!selected||gameWon||gameLost) return;
  const {row,col}=selected;
  if (puzzle[row][col]!==0) return;

  if (notesMode) {
    if (userGrid[row][col]) return;
    if (notes[row][col].has(num)) notes[row][col].delete(num);
    else notes[row][col].add(num);
    renderCell(row,col); highlightRelated();
    return;
  }

  notes[row][col].clear();
  userGrid[row][col]=num;
  renderCell(row,col); highlightRelated();
  updateNumpadDone();

  if (num!==solution[row][col]) {
    errorsCount++;
    document.getElementById('g-errors').textContent=`${errorsCount}/${MAX_ERRORS}`;
    if (errorsCount>=MAX_ERRORS) {
      gameLost=true; stopTimer();
      showMessage('Слишком много ошибок 😔');
      setTimeout(()=>showScreen('home'),2000);
    }
  } else if (checkWin()) {
    gameWon=true; stopTimer();
    const st=saveGameResult();
    setTimeout(()=>openWinModal(st),500);
  }
}

function eraseCell() {
  if (!selected||gameWon||gameLost) return;
  const {row,col}=selected;
  if (puzzle[row][col]!==0) return;
  userGrid[row][col]=0; notes[row][col].clear();
  renderCell(row,col); highlightRelated(); updateNumpadDone();
}

function useHint() {
  if (hintsLeft<=0) {
    document.getElementById('hint-overlay').classList.add('open');
    return;
  }
  if (!selected||gameWon||gameLost) return;
  const {row,col}=selected;
  if (puzzle[row][col]!==0) return;
  userGrid[row][col]=solution[row][col];
  notes[row][col].clear();
  hintsLeft--;
  document.getElementById('hints-left').textContent=hintsLeft;
  renderCell(row,col); highlightRelated(); updateNumpadDone();
  if (checkWin()) { gameWon=true; stopTimer(); const st=saveGameResult(); setTimeout(()=>openWinModal(st),500); }
}

function checkWin() {
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) if (getVal(r,c)!==solution[r][c]) return false;
  return true;
}

// ══ НУМПАД ═══════════════════════════════════════════════════
function buildNumpad() {
  const numpad=document.getElementById('numpad');
  numpad.innerHTML='';
  for (let n=1;n<=9;n++) {
    const btn=document.createElement('button');
    btn.className='nbtn'; btn.textContent=n; btn.dataset.num=n;
    btn.addEventListener('click',()=>inputNumber(n));
    numpad.appendChild(btn);
  }
}
function updateNumpadDone() {
  const count=Array(10).fill(0);
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) { const v=getVal(r,c); if(v) count[v]++; }
  for (let n=1;n<=9;n++) {
    const btn=document.querySelector(`[data-num="${n}"]`);
    if (btn) btn.classList.toggle('done', count[n]>=9);
  }
}

// ══ СОХРАНЕНИЕ РЕЗУЛЬТАТА ════════════════════════════════════
function saveGameResult() {
  const stats = getStats();
  const today = getDateKey();

  if (isDaily) {
    stats.daily = { date:today, time:timerSec };
  }

  // Уровень
  if (!stats[currentLevel]) stats[currentLevel]={solved:0,best:null,streak:0};
  const lst = stats[currentLevel];
  lst.solved++;
  if (!lst.best||timerSec<lst.best) lst.best=timerSec;

  // Стрик
  if (stats.lastDate===today) {
    // уже играл сегодня
  } else if (stats.lastDate===getPrevDateKey()) {
    stats.streak=(stats.streak||0)+1;
  } else {
    stats.streak=1;
  }
  stats.lastDate=today;
  stats.bestStreak=Math.max(stats.bestStreak||0, stats.streak||0);
  saveStats(stats);

  // История
  const hist=getHistory();
  hist.unshift({
    level:currentLevel, daily:isDaily,
    time:timerSec, date:today,
    ts:Date.now()
  });
  if (hist.length>50) hist.pop();
  saveHistory(hist);

  return lst;
}

function getPrevDateKey() {
  const d=new Date(); d.setDate(d.getDate()-1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ══ WIN MODAL ════════════════════════════════════════════════
function openWinModal(lst) {
  const lvl=LEVELS.find(l=>l.id===currentLevel);
  document.getElementById('win-title').textContent = isDaily?'🗓 Судоку дня решено!':'🎉 Решено!';
  document.getElementById('win-badge').textContent = isDaily?'Судоку дня':(lvl?.name||'');
  document.getElementById('win-badge').className = `badge ${lvl?.badge||'b1'}`;
  document.getElementById('win-sub').textContent = `Время: ${formatTime(timerSec)}${errorsCount?` · Ошибок: ${errorsCount}`:''}${(FREE_HINTS-hintsLeft)?` · Подсказок: ${FREE_HINTS-hintsLeft}`:''}`;

  const ws=document.getElementById('win-stats');
  ws.innerHTML=`
    <div class="stat-box"><div class="stat-num">${lst.solved||0}</div><div class="stat-lbl">Решено</div></div>
    <div class="stat-box"><div class="stat-num" style="font-size:16px">${lst.best?formatTime(lst.best):'—'}</div><div class="stat-lbl">Рекорд</div></div>
    <div class="stat-box"><div class="stat-num">${getStats().streak||0}</div><div class="stat-lbl">🔥 Серия</div></div>
  `;
  document.getElementById('win-overlay').classList.add('open');
}

function shareResult() {
  const lvl=LEVELS.find(l=>l.id===currentLevel);
  const name=isDaily?'Судоку дня':lvl?.name||'';
  const text=`Решил судоку! ${lvl?.emoji||'🧩'} ${name}\n⏱ ${formatTime(timerSec)}${errorsCount?`\n❌ Ошибок: ${errorsCount}`:''}\n\nИграй в Судоку в MAX: https://max.ru/ТВОЙ_НИК?startapp`;
  const encoded=encodeURIComponent(text);
  const tg=window.MaxBridge;
  if (tg&&tg.shareContent) { try{tg.shareContent({text});return;}catch{} }
  window.open(`https://max.ru/:share?text=${encoded}`,'_blank');
}

// ══ PROFILE ══════════════════════════════════════════════════
function renderProfile() {
  const stats=getStats();
  const hist=getHistory();

  // Шапка
  const tg=window.MaxBridge;
  const user=tg?.initDataUnsafe?.user;
  const name=user?.name||user?.first_name||'Игрок';
  document.getElementById('p-name').textContent=name;
  document.getElementById('p-avatar').textContent=name[0]?.toUpperCase()||'?';
  document.getElementById('p-sub').textContent=`Серия: ${stats.streak||0} дней 🔥`;

  // Общая статистика
  let totalSolved=0;
  LEVELS.forEach(l=>{ totalSolved+=(stats[l.id]?.solved||0); });
  document.getElementById('p-solved').textContent=totalSolved;
  document.getElementById('p-streak').textContent=stats.streak||0;
  document.getElementById('p-best-streak').textContent=stats.bestStreak||0;

  // По уровням
  const pls=document.getElementById('p-levels-stats');
  pls.innerHTML='';
  LEVELS.forEach(lvl=>{
    const st=stats[lvl.id]||{solved:0,best:null};
    const unlocked=isLevelUnlocked(lvl);
    const div=document.createElement('div');
    div.className='history-item';
    div.innerHTML=`
      <div class="hi-left">
        <div class="hi-icon">${unlocked?lvl.emoji:'🔒'}</div>
        <div><div class="hi-name">${lvl.name}</div><div class="hi-date">${st.solved||0} игр · Рекорд: ${st.best?formatTime(st.best):'—'}</div></div>
      </div>
      <div class="hi-time">${unlocked?`${st.solved||0}`:'—'}</div>
    `;
    pls.appendChild(div);
  });

  // История
  const ph=document.getElementById('p-history');
  ph.innerHTML='';
  if (!hist.length) {
    ph.innerHTML='<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px;">Ещё нет сыгранных игр</div>';
    return;
  }
  hist.slice(0,20).forEach(h=>{
    const lvl=LEVELS.find(l=>l.id===h.level);
    const div=document.createElement('div');
    div.className='history-item';
    div.innerHTML=`
      <div class="hi-left">
        <div class="hi-icon">${h.daily?'🗓':(lvl?.emoji||'🧩')}</div>
        <div><div class="hi-name">${h.daily?'Судоку дня':(lvl?.name||'')}</div><div class="hi-date">${h.date}</div></div>
      </div>
      <div class="hi-time">${formatTime(h.time)}</div>
    `;
    ph.appendChild(div);
  });
}

// ══ HELPERS ══════════════════════════════════════════════════
let msgTimer;
function showMessage(txt) {
  // Простой тост
  let el=document.getElementById('game-toast');
  if (!el) {
    el=document.createElement('div');
    el.id='game-toast';
    el.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.8);color:#fff;padding:12px 24px;border-radius:100px;font-size:15px;font-weight:700;z-index:999;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent=txt;
  el.style.opacity='1';
  clearTimeout(msgTimer);
  msgTimer=setTimeout(()=>el.style.opacity='0',2000);
}

// ══ STATS MODAL ══════════════════════════════════════════════
function openStatsModal() {
  const stats=getStats();
  let totalSolved=0;
  LEVELS.forEach(l=>totalSolved+=(stats[l.id]?.solved||0));
  const ms=document.getElementById('modal-stats');
  ms.innerHTML=`
    <div class="stat-box"><div class="stat-num">${totalSolved}</div><div class="stat-lbl">Решено</div></div>
    <div class="stat-box"><div class="stat-num">${stats.streak||0}</div><div class="stat-lbl">🔥 Серия</div></div>
    <div class="stat-box"><div class="stat-num">${stats.bestStreak||0}</div><div class="stat-lbl">Рекорд серии</div></div>
  `;
  document.getElementById('stats-overlay').classList.add('open');
}

// ══ СТАРТ ════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', ()=>{

  // Навигация
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    btn.addEventListener('click',()=>showScreen(btn.dataset.screen));
  });

  // Home
  document.getElementById('btn-daily').addEventListener('click',()=>startGame('easy',true));
  document.getElementById('btn-home-stats').addEventListener('click',openStatsModal);

  // Game
  document.getElementById('btn-back').addEventListener('click',()=>{
    stopTimer();
    showScreen('home');
  });
  document.getElementById('btn-erase').addEventListener('click',eraseCell);
  document.getElementById('btn-notes').addEventListener('click',()=>{
    notesMode=!notesMode;
    document.getElementById('btn-notes').classList.toggle('active',notesMode);
  });
  document.getElementById('btn-hint').addEventListener('click',useHint);
  document.getElementById('btn-pause').addEventListener('click',()=>{ stopTimer(); showScreen('home'); });

  // Win modal
  document.getElementById('btn-win-share').addEventListener('click',shareResult);
  document.getElementById('btn-win-home').addEventListener('click',()=>{
    document.getElementById('win-overlay').classList.remove('open');
    showScreen('home');
  });

  // Hint modal
  document.getElementById('btn-watch-ad').addEventListener('click',()=>{
    // Здесь будет rewarded video
    // Пока просто даём подсказку
    document.getElementById('hint-overlay').classList.remove('open');
    hintsLeft=1;
    document.getElementById('hints-left').textContent=hintsLeft;
    useHint();
  });
  document.getElementById('btn-hint-cancel').addEventListener('click',()=>{
    document.getElementById('hint-overlay').classList.remove('open');
  });

  // Stats modal
  document.getElementById('btn-close-stats').addEventListener('click',()=>{
    document.getElementById('stats-overlay').classList.remove('open');
  });

  // Клавиатура
  document.addEventListener('keydown',e=>{
    if (e.key>='1'&&e.key<='9') inputNumber(parseInt(e.key));
    if (e.key==='Backspace'||e.key==='Delete') eraseCell();
    if (e.key==='ArrowUp'&&selected) selectCell(Math.max(0,selected.row-1),selected.col);
    if (e.key==='ArrowDown'&&selected) selectCell(Math.min(8,selected.row+1),selected.col);
    if (e.key==='ArrowLeft'&&selected) selectCell(selected.row,Math.max(0,selected.col-1));
    if (e.key==='ArrowRight'&&selected) selectCell(selected.row,Math.min(8,selected.col+1));
  });

  // MAX Bridge
  const tg=window.MaxBridge;
  if (tg) {
    try{tg.ready();}catch{}
    try{tg.expand();}catch{}
    try{if(typeof tg.requestFullscreen==='function')tg.requestFullscreen();}catch{}
    try{if(typeof tg.disableVerticalSwipes==='function')tg.disableVerticalSwipes();}catch{}
  }

  renderHome();
});
