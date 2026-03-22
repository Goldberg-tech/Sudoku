// ══ КОНФИГ ═══════════════════════════════════════════════════
const LEVELS = [
  { id:'easy',   name:'Лёгкий',  color:'#3ddc84', remove:32, unlockAt:0,  badge:'b1', prev:null },
  { id:'medium', name:'Средний', color:'#e8c847', remove:42, unlockAt:3,  badge:'b2', prev:'easy' },
  { id:'hard',   name:'Сложный', color:'#ef4444', remove:50, unlockAt:2,  badge:'b3', prev:'medium' },
  { id:'expert', name:'Эксперт', color:'#a855f7', remove:56, unlockAt:4,  badge:'b4', prev:'hard' },
  { id:'master', name:'Мастер',  color:'#1a1d2e', remove:62, unlockAt:10, badge:'b5', prev:'expert' },
];
const MAX_ERRORS = 3;
const FREE_HINTS = 1;

// ══ СОСТОЯНИЕ ════════════════════════════════════════════════
let puzzle=[], solution=[], userGrid=[], notes=[];
let selected=null, notesMode=false;
let timerSec=0, timerInt=null, gameWon=false, gameLost=false;
let currentLevel='easy', isDaily=false;
let hintsLeft=FREE_HINTS, errorsCount=0;
let touchStartY=0;

// ══ БЛОКИРОВКА СВАЙПА (только вне scroll-area) ═══════════════
document.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', e => {
  const scrollArea = e.target.closest('.scroll-area');
  if (!scrollArea) {
    e.preventDefault();
    return;
  }
  const atTop    = scrollArea.scrollTop <= 0;
  const atBottom = scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 1;
  const goingDown = e.touches[0].clientY > touchStartY;
  const goingUp   = e.touches[0].clientY < touchStartY;
  if ((atTop && goingDown) || (atBottom && goingUp)) {
    e.preventDefault();
  }
}, { passive: false });

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

// Детерминированный для судоку дня
function seededRng(seed) {
  let s = seed;
  return () => { s=(s*1664525+1013904223)&0xffffffff; return (s>>>0)/0xffffffff; };
}
function seededShuffle(arr, rng) {
  const a=[...arr];
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function generateDailySolution() {
  const d=new Date();
  const seed=d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
  const rng=seededRng(seed);
  const g=Array.from({length:9},()=>Array(9).fill(0));
  fillGridSeeded(g,rng);
  return g;
}
function fillGridSeeded(g,rng) {
  const pos=findEmpty(g);
  if (!pos) return true;
  const [r,c]=pos;
  const nums=seededShuffle([1,2,3,4,5,6,7,8,9],rng);
  for (const n of nums) {
    if (isValid(g,r,c,n)) { g[r][c]=n; if(fillGridSeeded(g,rng)) return true; g[r][c]=0; }
  }
  return false;
}
function createPuzzle(sol, remove) {
  const puz=deepCopy(sol);
  const cells=shuffle([...Array(81).keys()]);
  let rem=0;
  for (const idx of cells) {
    if (rem>=remove) break;
    puz[Math.floor(idx/9)][idx%9]=0; rem++;
  }
  return puz;
}

// ══ ХРАНИЛИЩЕ ════════════════════════════════════════════════
const ls = (k,d={}) => { try{return JSON.parse(localStorage.getItem(k)||'null')??d;}catch{return d;} };
const ss = (k,v) => { try{localStorage.setItem(k,JSON.stringify(v));}catch{} };
const getStats   = () => ls('sudoku_stats',{});
const saveStats  = s => ss('sudoku_stats',s);
const getHistory = () => ls('sudoku_history',[]);
const saveHistory= h => ss('sudoku_history',h);

function getDateKey() {
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getPrevDateKey() {
  const d=new Date(); d.setDate(d.getDate()-1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatTime(s) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function getLevelStats(id) { const s=getStats(); return s[id]||{solved:0,best:null}; }
function isLevelUnlocked(lvl) {
  if (!lvl.prev) return true;
  return (getLevelStats(lvl.prev).solved||0) >= lvl.unlockAt;
}
function isDailyDone() { const s=getStats(); return s.daily&&s.daily.date===getDateKey(); }

// ══ ТАЙМЕР ═══════════════════════════════════════════════════
function startTimer() {
  clearInterval(timerInt);
  timerInt=setInterval(()=>{ if(!gameWon&&!gameLost){ timerSec++; document.getElementById('g-timer').textContent=formatTime(timerSec); } },1000);
}
function stopTimer() { clearInterval(timerInt); }

// ══ НАВИГАЦИЯ ════════════════════════════════════════════════
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.screen===name));
  touchStartY=0;
  if (name==='home') renderHome();
  if (name==='profile') renderProfile();
}

// ══ HOME ══════════════════════════════════════════════════════
function renderHome() {
  const stats=getStats();
  document.getElementById('home-streak').textContent=stats.streak||0;

  const d=new Date();
  document.getElementById('daily-date-el').textContent=
    d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'long'});

  const done=isDailyDone();
  const btnD=document.getElementById('btn-daily');
  const doneRow=document.getElementById('daily-done-row');
  if (done) {
    btnD.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20,6 9,17 4,12"/></svg> Выполнено';
    btnD.disabled=true;
    doneRow.style.display='';
    document.getElementById('daily-done-time').textContent=formatTime(stats.daily.time);
  } else {
    btnD.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Играть';
    btnD.disabled=false;
    doneRow.style.display='none';
  }

  const list=document.getElementById('levels-list');
  list.innerHTML='';
  LEVELS.forEach(lvl=>{
    const unlocked=isLevelUnlocked(lvl);
    const st=getLevelStats(lvl.id);
    const card=document.createElement('div');
    card.className='level-card'+(unlocked?'':' locked');

    let desc=unlocked
      ? (st.best?`Рекорд: ${formatTime(st.best)}`:'Ещё нет рекордов')
      : (() => {
          const prev=LEVELS.find(l=>l.id===lvl.prev);
          const need=lvl.unlockAt-(getLevelStats(lvl.prev).solved||0);
          return `Нужно ещё ${need} побед на «${prev?.name}»`;
        })();

    card.innerHTML=`
      <div class="level-icon" style="background:${unlocked?lvl.color+'22':'var(--bg3)'}">
        ${unlocked
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="${lvl.color}" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
        }
      </div>
      <div style="flex:1;min-width:0;">
        <div class="level-name">${lvl.name}</div>
        <div class="level-desc">${desc}</div>
      </div>
      <div class="level-right${(st.solved||0)>=10?' done':''}">${unlocked?(st.solved||0)+' игр':'—'}</div>
    `;
    if (unlocked) card.addEventListener('click',()=>startGame(lvl.id,false));
    list.appendChild(card);
  });
}

// ══ ИГРА ══════════════════════════════════════════════════════
function startGame(levelId, daily) {
  currentLevel=levelId; isDaily=daily;
  const lvl=LEVELS.find(l=>l.id===levelId);

  solution = daily ? generateDailySolution() : generateSolution();
  puzzle   = createPuzzle(solution, daily?44:lvl.remove);
  userGrid = Array.from({length:9},()=>Array(9).fill(0));
  notes    = Array.from({length:9},()=>Array.from({length:9},()=>new Set()));
  selected=null; notesMode=false;
  timerSec=0; gameWon=false; gameLost=false;
  hintsLeft=FREE_HINTS; errorsCount=0;

  document.getElementById('g-level-name').textContent=daily?'Судоку дня':lvl.name;
  document.getElementById('g-timer').textContent='0:00';
  document.getElementById('g-errors').textContent=`0/${MAX_ERRORS}`;
  document.getElementById('hints-left').textContent=hintsLeft;
  document.getElementById('btn-notes').classList.remove('active');

  buildGrid(); buildNumpad(); renderGrid();
  showScreen('game');
  startTimer();
}

// ══ СЕТКА ════════════════════════════════════════════════════
function buildGrid() {
  const grid=document.getElementById('grid');
  grid.innerHTML='';
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
    const cell=document.createElement('div');
    cell.className='cell'; cell.dataset.row=r; cell.dataset.col=c;
    cell.addEventListener('click',()=>selectCell(r,c));
    grid.appendChild(cell);
  }
}
function getCell(r,c) { return document.querySelector(`[data-row="${r}"][data-col="${c}"]`); }
function renderGrid() { for(let r=0;r<9;r++) for(let c=0;c<9;c++) renderCell(r,c); highlightRelated(); }
function renderCell(r,c) {
  const cell=getCell(r,c);
  const given=puzzle[r][c]!==0;
  const val=given?puzzle[r][c]:userGrid[r][c];
  const cn=notes[r][c];
  cell.className='cell';
  if (given) cell.classList.add('given');
  if (val) {
    cell.innerHTML=''; cell.textContent=val;
    if (!given) cell.classList.add(val!==solution[r][c]?'err':'uval');
  } else if (cn.size>0) {
    cell.textContent='';
    const ne=document.createElement('div'); ne.className='cell-notes';
    for (let n=1;n<=9;n++) {
      const nd=document.createElement('div'); nd.className='note';
      nd.textContent=cn.has(n)?n:''; ne.appendChild(nd);
    }
    cell.appendChild(ne);
  } else { cell.textContent=''; }
}
function getVal(r,c) { return puzzle[r][c]||userGrid[r][c]||0; }
function highlightRelated() {
  document.querySelectorAll('.cell').forEach(el=>el.classList.remove('sel','hi','snum'));
  if (!selected) return;
  const {row,col}=selected;
  const sv=getVal(row,col);
  const br=Math.floor(row/3)*3, bc=Math.floor(col/3)*3;
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
    const cell=getCell(r,c);
    if (r===row&&c===col) cell.classList.add('sel');
    else if (r===row||c===col||(r>=br&&r<br+3&&c>=bc&&c<bc+3)) cell.classList.add('hi');
    if (sv&&getVal(r,c)===sv) cell.classList.add('snum');
  }
}
function selectCell(r,c) { selected={row:r,col:c}; highlightRelated(); }

// ══ ВВОД ══════════════════════════════════════════════════════
function inputNumber(num) {
  if (!selected||gameWon||gameLost) return;
  const {row,col}=selected;
  if (puzzle[row][col]!==0) return;
  if (notesMode) {
    if (userGrid[row][col]) return;
    notes[row][col].has(num)?notes[row][col].delete(num):notes[row][col].add(num);
    renderCell(row,col); highlightRelated(); return;
  }
  notes[row][col].clear();
  userGrid[row][col]=num;
  renderCell(row,col); highlightRelated(); updateNumpadDone();
  if (num!==solution[row][col]) {
    errorsCount++;
    document.getElementById('g-errors').textContent=`${errorsCount}/${MAX_ERRORS}`;
    if (errorsCount>=MAX_ERRORS) { gameLost=true; stopTimer(); showToast('Слишком много ошибок 😔'); setTimeout(()=>showScreen('home'),2000); }
  } else if (checkWin()) { gameWon=true; stopTimer(); const st=saveResult(); setTimeout(()=>openWinModal(st),500); }
}
function eraseCell() {
  if (!selected||gameWon||gameLost) return;
  const {row,col}=selected;
  if (puzzle[row][col]!==0) return;
  userGrid[row][col]=0; notes[row][col].clear();
  renderCell(row,col); highlightRelated(); updateNumpadDone();
}
function useHint() {
  if (hintsLeft<=0) { document.getElementById('hint-overlay').classList.add('open'); return; }
  if (!selected||gameWon||gameLost) return;
  const {row,col}=selected;
  if (puzzle[row][col]!==0) return;
  userGrid[row][col]=solution[row][col];
  notes[row][col].clear(); hintsLeft--;
  document.getElementById('hints-left').textContent=hintsLeft;
  renderCell(row,col); highlightRelated(); updateNumpadDone();
  if (checkWin()) { gameWon=true; stopTimer(); const st=saveResult(); setTimeout(()=>openWinModal(st),500); }
}
function checkWin() {
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) if (getVal(r,c)!==solution[r][c]) return false;
  return true;
}

// ══ НУМПАД ═══════════════════════════════════════════════════
function buildNumpad() {
  const np=document.getElementById('numpad'); np.innerHTML='';
  for (let n=1;n<=9;n++) {
    const btn=document.createElement('button');
    btn.className='nbtn'; btn.textContent=n; btn.dataset.num=n;
    btn.addEventListener('click',()=>inputNumber(n));
    np.appendChild(btn);
  }
}
function updateNumpadDone() {
  const cnt=Array(10).fill(0);
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) { const v=getVal(r,c); if(v) cnt[v]++; }
  for (let n=1;n<=9;n++) { const b=document.querySelector(`[data-num="${n}"]`); if(b) b.classList.toggle('done',cnt[n]>=9); }
}

// ══ СОХРАНЕНИЕ ═══════════════════════════════════════════════
function saveResult() {
  const stats=getStats(); const today=getDateKey();
  if (isDaily) stats.daily={date:today,time:timerSec};
  if (!stats[currentLevel]) stats[currentLevel]={solved:0,best:null};
  const lst=stats[currentLevel];
  lst.solved++;
  if (!lst.best||timerSec<lst.best) lst.best=timerSec;
  if (stats.lastDate===getPrevDateKey()) stats.streak=(stats.streak||0)+1;
  else if (stats.lastDate!==today) stats.streak=1;
  stats.lastDate=today;
  stats.bestStreak=Math.max(stats.bestStreak||0,stats.streak||1);
  saveStats(stats);
  const hist=getHistory();
  hist.unshift({level:currentLevel,daily:isDaily,time:timerSec,date:today,ts:Date.now()});
  if (hist.length>50) hist.pop();
  saveHistory(hist);
  return lst;
}

// ══ WIN MODAL ════════════════════════════════════════════════
function openWinModal(lst) {
  const lvl=LEVELS.find(l=>l.id===currentLevel);
  document.getElementById('win-title').textContent=isDaily?'Судоку дня решено!':'Решено!';
  document.getElementById('win-badge').textContent=isDaily?'Судоку дня':(lvl?.name||'');
  document.getElementById('win-badge').className=`badge ${lvl?.badge||'b1'}`;
  document.getElementById('win-sub').textContent=`Время: ${formatTime(timerSec)}${errorsCount?` · Ошибок: ${errorsCount}`:''}`;
  const ws=document.getElementById('win-stats');
  const s=getStats();
  ws.innerHTML=`
    <div class="stat-box"><div class="stat-num">${lst.solved||0}</div><div class="stat-lbl">Решено</div></div>
    <div class="stat-box"><div class="stat-num" style="font-size:16px">${lst.best?formatTime(lst.best):'—'}</div><div class="stat-lbl">Рекорд</div></div>
    <div class="stat-box"><div class="stat-num">${s.streak||0}</div><div class="stat-lbl">Серия</div></div>
  `;
  document.getElementById('win-overlay').classList.add('open');
}
function shareResult() {
  const lvl=LEVELS.find(l=>l.id===currentLevel);
  const text=`Решил судоку! ${lvl?.name||''}\n⏱ ${formatTime(timerSec)}${errorsCount?`\nОшибок: ${errorsCount}`:''}\n\nИграй: https://max.ru/ТВОЙ_НИК?startapp`;
  const tg=window.MaxBridge;
  if (tg&&tg.shareContent) { try{tg.shareContent({text});return;}catch{} }
  window.open(`https://max.ru/:share?text=${encodeURIComponent(text)}`,'_blank');
}

// ══ PROFILE ══════════════════════════════════════════════════
function renderProfile() {
  const stats=getStats(), hist=getHistory();
  const tg=window.MaxBridge;
  const user=tg?.initDataUnsafe?.user;
  const name=user?.name||user?.first_name||'Игрок';
  document.getElementById('p-name').textContent=name;
  document.getElementById('p-avatar').textContent=name[0]?.toUpperCase()||'?';
  document.getElementById('p-sub').textContent=`Серия: ${stats.streak||0} дней`;
  let total=0;
  LEVELS.forEach(l=>total+=(stats[l.id]?.solved||0));
  document.getElementById('p-solved').textContent=total;
  document.getElementById('p-streak').textContent=stats.streak||0;
  document.getElementById('p-best-streak').textContent=stats.bestStreak||0;

  const pl=document.getElementById('p-levels'); pl.innerHTML='';
  LEVELS.forEach(lvl=>{
    const st=stats[lvl.id]||{solved:0,best:null};
    const unlocked=isLevelUnlocked(lvl);
    const div=document.createElement('div'); div.className='hist-item';
    div.innerHTML=`
      <div class="hi-left">
        <div class="hi-dot" style="background:${unlocked?lvl.color:'var(--muted)'}"></div>
        <div><div class="hi-name">${lvl.name}</div><div class="hi-date">${st.solved||0} игр · Рекорд: ${st.best?formatTime(st.best):'—'}</div></div>
      </div>
      <div class="hi-time" style="color:${unlocked?'var(--user)':'var(--muted)'}">${unlocked?(st.solved||0):'—'}</div>
    `;
    pl.appendChild(div);
  });

  const ph=document.getElementById('p-history'); ph.innerHTML='';
  if (!hist.length) {
    ph.innerHTML='<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px;">Ещё нет игр</div>';
    return;
  }
  hist.slice(0,20).forEach(h=>{
    const lvl=LEVELS.find(l=>l.id===h.level);
    const div=document.createElement('div'); div.className='hist-item';
    div.innerHTML=`
      <div class="hi-left">
        <div class="hi-dot" style="background:${h.daily?'var(--accent)':(lvl?.color||'var(--muted)')}"></div>
        <div><div class="hi-name">${h.daily?'Судоку дня':(lvl?.name||'')}</div><div class="hi-date">${h.date}</div></div>
      </div>
      <div class="hi-time">${formatTime(h.time)}</div>
    `;
    ph.appendChild(div);
  });
}

// ══ STATS MODAL ══════════════════════════════════════════════
function openStatsModal() {
  const s=getStats();
  let total=0; LEVELS.forEach(l=>total+=(s[l.id]?.solved||0));
  document.getElementById('modal-stats').innerHTML=`
    <div class="stat-box"><div class="stat-num">${total}</div><div class="stat-lbl">Решено</div></div>
    <div class="stat-box"><div class="stat-num">${s.streak||0}</div><div class="stat-lbl">Серия</div></div>
    <div class="stat-box"><div class="stat-num">${s.bestStreak||0}</div><div class="stat-lbl">Рекорд</div></div>
  `;
  document.getElementById('stats-overlay').classList.add('open');
}

// ══ TOAST ════════════════════════════════════════════════════
let toastTimer;
function showToast(txt) {
  const el=document.getElementById('toast');
  el.textContent=txt; el.style.opacity='1';
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.style.opacity='0',2000);
}

// ══ СТАРТ ════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{

  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.addEventListener('click',()=>showScreen(b.dataset.screen));
  });

  document.getElementById('btn-daily').addEventListener('click',()=>startGame('easy',true));
  document.getElementById('btn-home-stats').addEventListener('click',openStatsModal);
  document.getElementById('btn-back').addEventListener('click',()=>{ stopTimer(); showScreen('home'); });
  document.getElementById('btn-erase').addEventListener('click',eraseCell);
  document.getElementById('btn-notes').addEventListener('click',()=>{
    notesMode=!notesMode;
    document.getElementById('btn-notes').classList.toggle('active',notesMode);
  });
  document.getElementById('btn-hint').addEventListener('click',useHint);
  document.getElementById('btn-win-share').addEventListener('click',shareResult);
  document.getElementById('btn-win-home').addEventListener('click',()=>{
    document.getElementById('win-overlay').classList.remove('open');
    showScreen('home');
  });
  document.getElementById('btn-watch-ad').addEventListener('click',()=>{
    // Слот для rewarded video — пока даём подсказку бесплатно
    document.getElementById('hint-overlay').classList.remove('open');
    hintsLeft=1;
    document.getElementById('hints-left').textContent=1;
    useHint();
  });
  document.getElementById('btn-hint-cancel').addEventListener('click',()=>{
    document.getElementById('hint-overlay').classList.remove('open');
  });
  document.getElementById('btn-close-stats').addEventListener('click',()=>{
    document.getElementById('stats-overlay').classList.remove('open');
  });

  document.addEventListener('keydown',e=>{
    if (e.key>='1'&&e.key<='9') inputNumber(parseInt(e.key));
    if (e.key==='Backspace'||e.key==='Delete') eraseCell();
    if (selected) {
      if (e.key==='ArrowUp') selectCell(Math.max(0,selected.row-1),selected.col);
      if (e.key==='ArrowDown') selectCell(Math.min(8,selected.row+1),selected.col);
      if (e.key==='ArrowLeft') selectCell(selected.row,Math.max(0,selected.col-1));
      if (e.key==='ArrowRight') selectCell(selected.row,Math.min(8,selected.col+1));
    }
  });

  const tg=window.MaxBridge;
  if (tg) {
    try{tg.ready();}catch{}
    try{tg.expand();}catch{}
    try{if(typeof tg.requestFullscreen==='function')tg.requestFullscreen();}catch{}
    try{if(typeof tg.disableVerticalSwipes==='function')tg.disableVerticalSwipes();}catch{}
  }

  renderHome();
});
