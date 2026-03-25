// ══ КОНФИГ ═══════════════════════════════════════════════════
const LEVELS = [
  { id:'easy',   name:'Лёгкий',  color:'#3ddc84', remove:32, unlockAt:0, badge:'b1', prev:null },
  { id:'medium', name:'Средний', color:'#e8c847', remove:42, unlockAt:3, badge:'b2', prev:'easy' },
  { id:'hard',   name:'Сложный', color:'#ef4444', remove:50, unlockAt:3, badge:'b3', prev:'medium' },
  { id:'expert', name:'Эксперт', color:'#a855f7', remove:56, unlockAt:3, badge:'b4', prev:'hard' },
  { id:'master', name:'Мастер',  color:'#1a1d2e', remove:62, unlockAt:3, badge:'b5', prev:'expert' },
];
const MAX_ERRORS = 3;
const FREE_HINTS = 1;
const FREE_UNDOS = 1;

// ══ СОСТОЯНИЕ ════════════════════════════════════════════════
let puzzle=[], solution=[], userGrid=[], notes=[];
let history=[];
let selected=null, notesMode=false;
let timerSec=0, timerInt=null, gameWon=false, gameLost=false, gamePaused=false;
let currentLevel='easy', isDaily=false;
let hintsLeft=FREE_HINTS, undosLeft=FREE_UNDOS, errorsCount=0;
let touchStartY=0;

// ══ БЛОКИРОВКА СВАЙПА ════════════════════════════════════════
document.addEventListener('touchstart', e=>{
  touchStartY=e.touches[0].clientY;
},{passive:true});

document.addEventListener('touchmove', e=>{
  const sa=e.target.closest('.scroll-area');

  // Нет scroll-area — блокируем всё (игровое поле и т.д.)
  if(!sa){e.preventDefault();return;}

  // На экране профиля — блокируем любой свайп вниз когда уже на верху
  // это предотвращает pull-to-close в MAX WebView
  const isProfileScroll=sa.closest('#screen-profile');
  const atTop=sa.scrollTop<=0;
  const atBot=sa.scrollTop+sa.clientHeight>=sa.scrollHeight-1;
  const goDown=e.touches[0].clientY>touchStartY;
  const goUp=e.touches[0].clientY<touchStartY;

  if(isProfileScroll){
    // Полная блокировка любого pull-to-dismiss
    if(atTop&&goDown){e.preventDefault();return;}
    // Также блокируем если контент не скроллится (весь контент виден)
    if(sa.scrollHeight<=sa.clientHeight){e.preventDefault();return;}
  }

  if((atTop&&goDown)||(atBot&&goUp)) e.preventDefault();
},{passive:false});

// ══ ГЕНЕРАТОР ════════════════════════════════════════════════
function generateSolution(){const g=Array.from({length:9},()=>Array(9).fill(0));fillGrid(g);return g;}
function fillGrid(g){const pos=findEmpty(g);if(!pos)return true;const[r,c]=pos;for(const n of shuffle([1,2,3,4,5,6,7,8,9])){if(isValid(g,r,c,n)){g[r][c]=n;if(fillGrid(g))return true;g[r][c]=0;}}return false;}
function findEmpty(g){for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(!g[r][c])return[r,c];return null;}
function isValid(g,row,col,num){if(g[row].includes(num))return false;for(let r=0;r<9;r++)if(g[r][col]===num)return false;const br=Math.floor(row/3)*3,bc=Math.floor(col/3)*3;for(let r=br;r<br+3;r++)for(let c=bc;c<bc+3;c++)if(g[r][c]===num)return false;return true;}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function deepCopy(g){return g.map(r=>[...r]);}
function seededRng(seed){let s=seed;return()=>{s=(s*1664525+1013904223)&0xffffffff;return(s>>>0)/0xffffffff;};}
function seededShuffle(arr,rng){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function generateDailySolution(){const d=new Date();const seed=d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();const rng=seededRng(seed);const g=Array.from({length:9},()=>Array(9).fill(0));fillGridSeeded(g,rng);return g;}
function fillGridSeeded(g,rng){const pos=findEmpty(g);if(!pos)return true;const[r,c]=pos;for(const n of seededShuffle([1,2,3,4,5,6,7,8,9],rng)){if(isValid(g,r,c,n)){g[r][c]=n;if(fillGridSeeded(g,rng))return true;g[r][c]=0;}}return false;}
function createPuzzle(sol,remove){const puz=deepCopy(sol);const cells=shuffle([...Array(81).keys()]);let rem=0;for(const idx of cells){if(rem>=remove)break;puz[Math.floor(idx/9)][idx%9]=0;rem++;}return puz;}

// ══ ХРАНИЛИЩЕ (привязано к userId) ════════════════════════════
let _userId='guest';

function initUserId(){
  try{
    const tg=window.MaxBridge||window.Telegram?.WebApp;
    const user=tg?.initDataUnsafe?.user;
    const id=user?.id||user?.user_id;
    if(id){_userId=String(id);return;}
  }catch{}
  let aid=localStorage.getItem('sudoku_anon_id');
  if(!aid){aid='anon_'+Math.random().toString(36).slice(2);localStorage.setItem('sudoku_anon_id',aid);}
  _userId=aid;
}

function userKey(k){return `u_${_userId}_${k}`;}
const ls=(k,d={})=>{try{return JSON.parse(localStorage.getItem(userKey(k))||'null')??d;}catch{return d;}};
const ss=(k,v)=>{try{localStorage.setItem(userKey(k),JSON.stringify(v));}catch{}};
const getStats=()=>ls('stats',{});
const saveStats=s=>ss('stats',s);
const getHistory2=()=>ls('history',[]);
const saveHistory2=h=>ss('history',h);

// Имя и аватар
function getUserName(){
  try{
    const tg=window.MaxBridge||window.Telegram?.WebApp;
    const user=tg?.initDataUnsafe?.user;
    const name=user?.name||user?.first_name||user?.username;
    if(name)return name;
  }catch{}
  return ls('username',null)||'Игрок';
}
function saveUserName(name){ss('username',name);}
function getUserAvatar(){return ls('avatar',null);}
function saveUserAvatar(b64){ss('avatar',b64);}

// Сохранение текущей партии
function saveGameState(){
  if(gameWon||gameLost||!puzzle.length)return;
  const notesRaw=notes.map(row=>row.map(cell=>[...cell]));
  ss('active_game',{puzzle,solution,userGrid,notesRaw,timerSec,currentLevel,isDaily,errorsCount,hintsLeft,undosLeft,notesMode,selected:selected?{row:selected.row,col:selected.col}:null});
}
function clearGameState(){ss('active_game',null);}
function loadGameState(){return ls('active_game',null);}

// ══ BACKEND API REPORTING ════════════════════════════════════
// Замените на реальный URL вашего Railway backend
const API_BASE = 'sudoku-backend-production-624b.up.railway.app'; // например: 'https://nature-scanner-backend-pr.railway.app'

function apiHeaders(){
  return{
    'Content-Type':'application/json',
    'X-User-Id':_userId,
    'X-Username':getUserName()||'',
  };
}
function reportEvent(event,params={}){
  if(!API_BASE)return;
  fetch(`${API_BASE}/api/sudoku/event`,{
    method:'POST',headers:apiHeaders(),
    body:JSON.stringify({event,params}),
  }).catch(()=>{});
}
function reportGameResult(data){
  if(!API_BASE)return;
  fetch(`${API_BASE}/api/sudoku/game-result`,{
    method:'POST',headers:apiHeaders(),
    body:JSON.stringify(data),
  }).catch(()=>{});
}
function track(event, params){
  try{
    if(typeof ym !== 'undefined'){
      ym(108242784, 'reachGoal', event, params);
    }
  }catch(e){}
  // Дублируем в бэкенд
  reportEvent(event, params);
}
function getDateKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

function getShortDate(){const d=new Date();const months=['ЯНВ','ФЕВ','МАР','АПР','МАЙ','ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ','ДЕК'];return `${d.getDate()} ${months[d.getMonth()]}`;}
function getPrevDateKey(){const d=new Date();d.setDate(d.getDate()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function formatTime(s){return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
function getLevelStats(id){const s=getStats();return s[id]||{solved:0,best:null};}
function isLevelUnlocked(lvl){if(!lvl.prev)return true;return(getLevelStats(lvl.prev).solved||0)>=lvl.unlockAt;}
function isDailyDone(){const s=getStats();return s.daily&&s.daily.date===getDateKey();}

// ══ ТАЙМЕР ═══════════════════════════════════════════════════
function startTimer(){
  clearInterval(timerInt);
  timerInt=setInterval(()=>{
    if(!gameWon&&!gameLost&&!gamePaused){
      timerSec++;
      document.getElementById('g-timer').textContent=formatTime(timerSec);
      if(timerSec%5===0)saveGameState();
    }
  },1000);
}
function stopTimer(){clearInterval(timerInt);}

// ══ ПАУЗА ════════════════════════════════════════════════════
function pauseGame(){
  if(gameWon||gameLost)return;
  gamePaused=true;
  saveGameState();
  document.getElementById('pause-time-display').textContent=formatTime(timerSec);
  document.getElementById('pause-ad-zone').classList.add('open');
  document.getElementById('pause-overlay').classList.add('open');
}
function resumeGame(){
  gamePaused=false;
  document.getElementById('pause-overlay').classList.remove('open');
  document.getElementById('pause-ad-zone').classList.remove('open');
}

// ══ НАВИГАЦИЯ ════════════════════════════════════════════════
function showScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.screen===name));
  touchStartY=0;
  if(name==='home')renderHome();
  if(name==='profile')renderProfile();
  if(name==='leaderboard')renderLeaderboard();
}

// ══ HOME ══════════════════════════════════════════════════════
function renderHome(){
  const stats=getStats();
  document.getElementById('home-streak').textContent=stats.streak||0;

  // Дата
  const d=new Date();
  document.getElementById('daily-date-el').textContent=
    d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'long'});

  // Судоку дня — зелёный если пройдено
  const done=isDailyDone();
  const card=document.getElementById('daily-card');
  const badgeEl=document.getElementById('daily-badge-text');
  const doneRow=document.getElementById('daily-done-row');
  const btnD=document.getElementById('btn-daily');

  if(done){
    card.classList.add('done');
    badgeEl.textContent='✓ СУДОКУ ДНЯ';
    doneRow.style.display='';
    btnD.style.display='none';
  }else{
    card.classList.remove('done');
    badgeEl.textContent='СУДОКУ ДНЯ';
    doneRow.style.display='none';
    btnD.style.display='';
    btnD.innerHTML='<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Играть';
    btnD.disabled=false;
  }

  // Незавершённая игра — показываем сразу
  const existing=document.getElementById('resume-banner');
  if(existing)existing.remove();
  const saved=loadGameState();
  if(saved&&saved.puzzle&&saved.puzzle.length){
    showResumeButton(saved);
  }

  // Уровни
  const list=document.getElementById('levels-list');list.innerHTML='';
  LEVELS.forEach(lvl=>{
    const unlocked=isLevelUnlocked(lvl);
    const st=getLevelStats(lvl.id);
    const card=document.createElement('div');
    card.className='level-card'+(unlocked?'':' locked');
    const need=unlocked?0:lvl.unlockAt-(getLevelStats(lvl.prev).solved||0);
    const prev=LEVELS.find(l=>l.id===lvl.prev);
    const desc=unlocked?(st.best?`Рекорд: ${formatTime(st.best)}`:'Ещё нет рекордов'):`Нужно ещё ${need} побед на «${prev?.name}»`;
    card.innerHTML=`
      <div class="level-dot" style="background:${unlocked?lvl.color:'var(--muted)'}"></div>
      <div style="flex:1;min-width:0;">
        <div class="level-name">${lvl.name}</div>
        <div class="level-desc">${desc}</div>
      </div>
      <div class="level-right">${unlocked?(st.solved||0)+' игр':'—'}</div>
    `;
    if(unlocked)card.addEventListener('click',()=>startGame(lvl.id,false));
    list.appendChild(card);
  });
}

function showResumeButton(saved){
  const lvl=LEVELS.find(l=>l.id===saved.currentLevel);
  const banner=document.createElement('div');
  banner.id='resume-banner';
  banner.style.cssText='background:linear-gradient(135deg,#1a1d2e,#2d3561);border-radius:14px;padding:14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;';
  banner.innerHTML=`
    <div>
      <div style="font-size:13px;font-weight:900;color:var(--accent);letter-spacing:1px;margin-bottom:4px;">НЕЗАВЕРШЁННАЯ ИГРА</div>
      <div style="font-size:12px;color:rgba(255,255,255,.7);">${lvl?.name||''}  ·  ${formatTime(saved.timerSec||0)}</div>
    </div>
    <button id="btn-resume-game" style="padding:9px 16px;border-radius:9px;background:var(--accent);color:#1a1d2e;font-size:13px;font-weight:800;border:none;cursor:pointer;white-space:nowrap;flex-shrink:0;">▶ Продолжить</button>
  `;
  const pad=document.querySelector('#screen-home .home-pad');
  const streakCard=pad.querySelector('.streak-card');
  pad.insertBefore(banner,streakCard.nextSibling);
  document.getElementById('btn-resume-game').addEventListener('click',()=>{
    banner.remove();
    resumeGameFromSave(saved);
  });
}

// ══ ИГРА ══════════════════════════════════════════════════════
function startGame(levelId,daily){
  currentLevel=levelId;isDaily=daily;
  const lvl=LEVELS.find(l=>l.id===levelId);
  solution=daily?generateDailySolution():generateSolution();
  puzzle=createPuzzle(solution,daily?44:lvl.remove);
  userGrid=Array.from({length:9},()=>Array(9).fill(0));
  notes=Array.from({length:9},()=>Array.from({length:9},()=>new Set()));
  history=[];
  selected=null;notesMode=false;
  timerSec=0;gameWon=false;gameLost=false;gamePaused=false;
  hintsLeft=FREE_HINTS;undosLeft=FREE_UNDOS;errorsCount=0;
  clearGameState();
  track('game_start',{level:levelId,daily:daily});
  reportEvent('game_start',{level:levelId,daily:daily});
  document.getElementById('g-date').textContent=getShortDate();
  document.getElementById('g-timer').textContent='0:00';
  document.getElementById('g-errors').textContent=`0/${MAX_ERRORS}`;
  document.getElementById('hint-badge').textContent=hintsLeft;
  updateUndoBadge();
  document.getElementById('btn-notes').classList.remove('active');
  document.getElementById('notes-lbl').textContent='Заметки';
  buildGrid();buildNumpad();renderGrid();
  showScreen('game');
  startTimer();
}

function resumeGameFromSave(state){
  currentLevel=state.currentLevel;isDaily=state.isDaily;
  puzzle=state.puzzle;solution=state.solution;userGrid=state.userGrid;
  notes=state.notesRaw.map(row=>row.map(cell=>new Set(cell)));
  timerSec=state.timerSec||0;errorsCount=state.errorsCount||0;
  hintsLeft=state.hintsLeft??FREE_HINTS;undosLeft=state.undosLeft??FREE_UNDOS;notesMode=state.notesMode||false;
  history=[];gameWon=false;gameLost=false;gamePaused=false;selected=null;
  document.getElementById('g-date').textContent=getShortDate();
  document.getElementById('g-timer').textContent=formatTime(timerSec);
  document.getElementById('g-errors').textContent=`${errorsCount}/${MAX_ERRORS}`;
  document.getElementById('hint-badge').textContent=hintsLeft>0?hintsLeft:'!';
  document.getElementById('btn-notes').classList.toggle('active',notesMode);
  document.getElementById('notes-lbl').textContent=notesMode?'ВКЛ':'Заметки';
  buildGrid();buildNumpad();renderGrid();updateUndoBadge();
  if(state.selected)selectCell(state.selected.row,state.selected.col);
  showScreen('game');
  startTimer();
}

// ══ СЕТКА ════════════════════════════════════════════════════
function buildGrid(){
  const grid=document.getElementById('grid');grid.innerHTML='';
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){
    const cell=document.createElement('div');
    cell.className='cell';cell.dataset.row=r;cell.dataset.col=c;
    cell.addEventListener('click',()=>selectCell(r,c));
    grid.appendChild(cell);
  }
}
function getCell(r,c){return document.querySelector(`[data-row="${r}"][data-col="${c}"]`);}
function renderGrid(){for(let r=0;r<9;r++)for(let c=0;c<9;c++)renderCell(r,c);highlightRelated();}
function renderCell(r,c){
  const cell=getCell(r,c);
  const given=puzzle[r][c]!==0;
  const val=given?puzzle[r][c]:userGrid[r][c];
  const cn=notes[r][c];
  cell.className='cell';
  if(given)cell.classList.add('given');
  if(val){
    cell.innerHTML='';cell.textContent=val;
    if(!given)cell.classList.add(val!==solution[r][c]?'err':'uval');
  }else if(cn.size>0){
    cell.textContent='';
    const ne=document.createElement('div');ne.className='cell-notes';
    for(let n=1;n<=9;n++){
      const nd=document.createElement('div');nd.className='note';
      nd.textContent=cn.has(n)?n:'';ne.appendChild(nd);
    }
    cell.appendChild(ne);
  }else{cell.textContent='';}
}
function getVal(r,c){return puzzle[r][c]||userGrid[r][c]||0;}
function highlightRelated(){
  document.querySelectorAll('.cell').forEach(el=>el.classList.remove('sel','hi','snum'));
  if(!selected)return;
  const{row,col}=selected;
  const sv=getVal(row,col);
  const br=Math.floor(row/3)*3,bc=Math.floor(col/3)*3;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){
    const cell=getCell(r,c);
    if(r===row&&c===col)cell.classList.add('sel');
    else if(r===row||c===col||(r>=br&&r<br+3&&c>=bc&&c<bc+3))cell.classList.add('hi');
    if(sv&&getVal(r,c)===sv)cell.classList.add('snum');
  }
}
function selectCell(r,c){selected={row:r,col:c};highlightRelated();}

// ══ ВВОД ══════════════════════════════════════════════════════
function inputNumber(num){
  if(!selected||gameWon||gameLost||gamePaused)return;
  const{row,col}=selected;
  if(puzzle[row][col]!==0)return;
  if(notesMode){
    if(userGrid[row][col])return;
    history.push({row,col,prevVal:0,prevNotes:new Set(notes[row][col]),wasNote:true});
    notes[row][col].has(num)?notes[row][col].delete(num):notes[row][col].add(num);
    renderCell(row,col);highlightRelated();saveGameState();return;
  }
  history.push({row,col,prevVal:userGrid[row][col],prevNotes:new Set(notes[row][col]),wasNote:false});
  notes[row][col].clear();
  userGrid[row][col]=num;
  renderCell(row,col);highlightRelated();updateNumpadDone();saveGameState();
  if(num!==solution[row][col]){
    errorsCount++;
    document.getElementById('g-errors').textContent=`${errorsCount}/${MAX_ERRORS}`;
    if(errorsCount>=MAX_ERRORS){gameLost=true;clearGameState();stopTimer();showToast('Слишком много ошибок');setTimeout(()=>showScreen('home'),2000);}
  }else if(checkWin()){gameWon=true;clearGameState();stopTimer();const st=saveResult();setTimeout(()=>openWinModal(st),500);}
}

function eraseCell(){
  if(!selected||gameWon||gameLost||gamePaused)return;
  const{row,col}=selected;
  if(puzzle[row][col]!==0)return;
  history.push({row,col,prevVal:userGrid[row][col],prevNotes:new Set(notes[row][col]),wasNote:false});
  userGrid[row][col]=0;notes[row][col].clear();
  renderCell(row,col);highlightRelated();updateNumpadDone();saveGameState();
}

function updateUndoBadge(){
  const badge=document.getElementById('undo-badge');
  if(!badge)return;
  badge.textContent=undosLeft>0?undosLeft:'!';
  // Когда бесплатные закончились — красный бейдж как предупреждение
  badge.style.background=undosLeft>0?'var(--user)':'var(--error)';
}

function undoMove(){
  if(gamePaused||gameWon||gameLost)return;
  if(history.length===0){showToast('Нечего отменять');return;}

  if(undosLeft>0){
    // Бесплатная отмена
    undosLeft--;
    updateUndoBadge();
    applyUndo();
  }else{
    // Платная — показываем подтверждение
    document.getElementById('undo-overlay').classList.add('open');
  }
}

function applyUndo(){
  if(history.length===0){showToast('Нечего отменять');return;}
  const last=history.pop();
  // Если отменяемый ход был ошибкой — откатываем счётчик ошибок
  if(!last.wasNote && last.prevVal===0 && last.row!==undefined){
    const wasError=userGrid[last.row]?.[last.col]!==undefined &&
      userGrid[last.row][last.col]!==0 &&
      userGrid[last.row][last.col]!==solution[last.row][last.col];
    if(wasError && errorsCount>0){
      errorsCount--;
      document.getElementById('g-errors').textContent=`${errorsCount}/${MAX_ERRORS}`;
    }
  }
  if(last.wasNote){notes[last.row][last.col]=new Set(last.prevNotes);}
  else{userGrid[last.row][last.col]=last.prevVal;notes[last.row][last.col]=new Set(last.prevNotes);}
  renderCell(last.row,last.col);highlightRelated();updateNumpadDone();saveGameState();
}

function useHint(){
  if(gamePaused)return;
  if(hintsLeft<=0){document.getElementById('hint-overlay').classList.add('open');return;}
  applyHint();
}
function applyHint(){
  if(!selected||gameWon||gameLost)return;
  const{row,col}=selected;
  if(puzzle[row][col]!==0)return;
  history.push({row,col,prevVal:userGrid[row][col],prevNotes:new Set(notes[row][col]),wasNote:false});
  userGrid[row][col]=solution[row][col];
  notes[row][col].clear();
  if(hintsLeft>0)hintsLeft--;
  track('hint_used',{level:currentLevel,free:hintsLeft>=0});
  document.getElementById('hint-badge').textContent=hintsLeft>0?hintsLeft:'!';
  renderCell(row,col);highlightRelated();updateNumpadDone();saveGameState();
  if(checkWin()){gameWon=true;clearGameState();stopTimer();const st=saveResult();setTimeout(()=>openWinModal(st),500);}
}

function checkWin(){
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(getVal(r,c)!==solution[r][c])return false;
  return true;
}

// ══ НУМПАД ═══════════════════════════════════════════════════
function buildNumpad(){
  const np=document.getElementById('numpad');np.innerHTML='';
  for(let n=1;n<=9;n++){
    const btn=document.createElement('button');
    btn.className='nbtn';btn.textContent=n;btn.dataset.num=n;
    btn.addEventListener('click',()=>inputNumber(n));
    np.appendChild(btn);
  }
}
function updateNumpadDone(){
  const cnt=Array(10).fill(0);
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){const v=getVal(r,c);if(v)cnt[v]++;}
  for(let n=1;n<=9;n++){const b=document.querySelector(`[data-num="${n}"]`);if(b)b.classList.toggle('done',cnt[n]>=9);}
}

// ══ СОХРАНЕНИЕ РЕЗУЛЬТАТА ════════════════════════════════════
function saveResult(){
  const stats=getStats();const today=getDateKey();
  if(isDaily)stats.daily={date:today,time:timerSec};
  if(!stats[currentLevel])stats[currentLevel]={solved:0,best:null};
  const lst=stats[currentLevel];
  lst.solved++;
  if(!lst.best||timerSec<lst.best)lst.best=timerSec;
  if(stats.lastDate===getPrevDateKey())stats.streak=(stats.streak||0)+1;
  else if(stats.lastDate!==today)stats.streak=1;
  stats.lastDate=today;
  stats.bestStreak=Math.max(stats.bestStreak||0,stats.streak||1);
  saveStats(stats);
  track('game_win',{level:currentLevel,time:timerSec,errors:errorsCount,daily:isDaily});
  if(isDaily) track('daily_complete',{time:timerSec});
  // Отправляем результат на бэкенд
  reportGameResult({
    level: currentLevel,
    isDaily,
    timeSec: timerSec,
    errors: errorsCount,
    won: true,
    hintsUsed: FREE_HINTS - hintsLeft,
    user_id: _userId,
    username: getUserName()
  });
  // Отправляем результат на бэкенд (если настроен)
  reportGameResult({level:currentLevel,daily:isDaily,won:true,time_sec:timerSec,errors:errorsCount,hints_used:FREE_HINTS-hintsLeft});
  hist.unshift({level:currentLevel,daily:isDaily,time:timerSec,date:today,ts:Date.now()});
  if(hist.length>50)hist.pop();
  saveHistory2(hist);
  return lst;
}

// ══ WIN MODAL ════════════════════════════════════════════════
function openWinModal(lst){
  const lvl=LEVELS.find(l=>l.id===currentLevel);
  document.getElementById('win-title').textContent=isDaily?'Судоку дня решено! 🎉':'Решено!';
  document.getElementById('win-badge').textContent=isDaily?'Судоку дня':(lvl?.name||'');
  document.getElementById('win-badge').className=`badge ${lvl?.badge||'b1'}`;
  document.getElementById('win-sub').textContent=`Время: ${formatTime(timerSec)}${errorsCount?` · Ошибок: ${errorsCount}`:''}`;
  const ws=document.getElementById('win-stats');
  const s=getStats();
  ws.innerHTML=`
    <div class="stat-box"><div class="stat-num">${lst.solved||0}</div><div class="stat-lbl">Решено</div></div>
    <div class="stat-box"><div class="stat-num" style="font-size:15px">${lst.best?formatTime(lst.best):'—'}</div><div class="stat-lbl">Рекорд</div></div>
    <div class="stat-box"><div class="stat-num">${s.streak||0}</div><div class="stat-lbl">Серия</div></div>
  `;
  document.getElementById('win-overlay').classList.add('open');
}
function shareResult(){
  const lvl=LEVELS.find(l=>l.id===currentLevel);
  const text=`Решил судоку! ${lvl?.name||''}\n⏱ ${formatTime(timerSec)}${errorsCount?`\nОшибок: ${errorsCount}`:''}\n\nИграй: https://max.ru/ТВОЙ_НИК?startapp`;
  const tg=window.MaxBridge;
  if(tg&&tg.shareContent){try{tg.shareContent({text});return;}catch{}}
  window.open(`https://max.ru/:share?text=${encodeURIComponent(text)}`,'_blank');
}

// ══ PROFILE ══════════════════════════════════════════════════
function renderProfile(){
  const stats=getStats(),hist=getHistory2();
  const name=getUserName();
  const avatarB64=getUserAvatar();
  document.getElementById('p-name').textContent=name;
  document.getElementById('p-sub').textContent=`Серия: ${stats.streak||0} дней`;
  // Аватар
  const avatarEl=document.getElementById('p-avatar');
  if(avatarB64){
    avatarEl.innerHTML=`<img src="${avatarB64}" alt="avatar"/>`;
  }else{
    avatarEl.innerHTML=name[0]?.toUpperCase()||'?';
  }
  let total=0;LEVELS.forEach(l=>total+=(stats[l.id]?.solved||0));
  document.getElementById('p-solved').textContent=total;
  document.getElementById('p-streak').textContent=stats.streak||0;
  document.getElementById('p-best-streak').textContent=stats.bestStreak||0;
  const pl=document.getElementById('p-levels');pl.innerHTML='';
  LEVELS.forEach(lvl=>{
    const st=stats[lvl.id]||{solved:0,best:null};
    const unlocked=isLevelUnlocked(lvl);
    const div=document.createElement('div');div.className='hist-item';
    div.innerHTML=`
      <div class="hi-left">
        <div class="hi-dot" style="background:${unlocked?lvl.color:'var(--muted)'}"></div>
        <div><div class="hi-name">${lvl.name}</div><div class="hi-date">${st.solved||0} игр · Рекорд: ${st.best?formatTime(st.best):'—'}</div></div>
      </div>
      <div class="hi-time" style="color:${unlocked?'var(--user)':'var(--muted)'}">${unlocked?(st.solved||0):'—'}</div>
    `;
    pl.appendChild(div);
  });
  const ph=document.getElementById('p-history');ph.innerHTML='';
  if(!hist.length){ph.innerHTML='<div style="color:var(--muted);font-size:12px;text-align:center;padding:14px;">Ещё нет игр</div>';return;}
  hist.slice(0,20).forEach(h=>{
    const lvl=LEVELS.find(l=>l.id===h.level);
    const div=document.createElement('div');div.className='hist-item';
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
function openStatsModal(){
  const s=getStats();
  let total=0;LEVELS.forEach(l=>total+=(s[l.id]?.solved||0));
  document.getElementById('modal-stats').innerHTML=`
    <div class="stat-box"><div class="stat-num">${total}</div><div class="stat-lbl">Решено</div></div>
    <div class="stat-box"><div class="stat-num">${s.streak||0}</div><div class="stat-lbl">Серия</div></div>
    <div class="stat-box"><div class="stat-num">${s.bestStreak||0}</div><div class="stat-lbl">Рекорд</div></div>
  `;
  document.getElementById('stats-overlay').classList.add('open');
}

// ══ ЛИДЕРБОРД ════════════════════════════════════════════════
// Моковые данные — заменить на API-запрос когда будет бэкенд
const MOCK_LEADERS = [
  {name:'Александра К.',avatar:null,solved:142,best:87,streak:14,levels:{easy:50,medium:40,hard:30,expert:15,master:7}},
  {name:'Михаил Д.',avatar:null,solved:118,best:104,streak:21,levels:{easy:45,medium:35,hard:22,expert:12,master:4}},
  {name:'Ольга В.',avatar:null,solved:97,best:96,streak:9,levels:{easy:40,medium:30,hard:18,expert:8,master:1}},
  {name:'Сергей П.',avatar:null,solved:84,best:112,streak:6,levels:{easy:35,medium:25,hard:15,expert:7,master:2}},
  {name:'Татьяна И.',avatar:null,solved:76,best:128,streak:4,levels:{easy:30,medium:22,hard:14,expert:8,master:2}},
  {name:'Андрей Н.',avatar:null,solved:63,best:143,streak:3,levels:{easy:28,medium:18,hard:10,expert:5,master:2}},
  {name:'Елена С.',avatar:null,solved:55,best:156,streak:8,levels:{easy:25,medium:15,hard:9,expert:4,master:2}},
  {name:'Дмитрий Р.',avatar:null,solved:49,best:167,streak:2,levels:{easy:22,medium:14,hard:8,expert:3,master:2}},
  {name:'Наталья Л.',avatar:null,solved:41,best:189,streak:5,levels:{easy:18,medium:12,hard:7,expert:3,master:1}},
  {name:'Игорь Ф.',avatar:null,solved:34,best:201,streak:1,levels:{easy:15,medium:10,hard:6,expert:2,master:1}},
];
let _lbLevel='all';

function getMyLbEntry(){
  const stats=getStats();
  let total=0;LEVELS.forEach(l=>total+=(stats[l.id]?.solved||0));
  let bestOverall=null;
  LEVELS.forEach(l=>{const b=stats[l.id]?.best;if(b&&(!bestOverall||b<bestOverall))bestOverall=b;});
  return{
    name:getUserName(),
    avatar:getUserAvatar(),
    solved:total,
    best:bestOverall,
    streak:stats.streak||0,
    levels:{
      easy:stats.easy?.solved||0,
      medium:stats.medium?.solved||0,
      hard:stats.hard?.solved||0,
      expert:stats.expert?.solved||0,
      master:stats.master?.solved||0
    },
    isMe:true
  };
}

function getLbSortKey(entry,level){
  if(level==='all')return entry.solved;
  return entry.levels[level]||0;
}

function renderLeaderboard(){
  const me=getMyLbEntry();
  const allEntries=[...MOCK_LEADERS,me];
  allEntries.sort((a,b)=>getLbSortKey(b,_lbLevel)-getLbSortKey(a,_lbLevel));

  const myRank=allEntries.findIndex(e=>e.isMe)+1;
  const list=document.getElementById('lb-list');
  list.innerHTML='';

  // Моя позиция вверху
  const myPos=document.createElement('div');
  myPos.className='lb-my-pos';
  const myScore=getLbSortKey(me,_lbLevel);
  const myAvatar=me.avatar?`<img src="${me.avatar}" alt=""/>`:(me.name[0]?.toUpperCase()||'?');
  myPos.innerHTML=`
    <div class="lb-avatar" style="background:var(--accent);color:#1a1d2e;">${myAvatar}</div>
    <div class="lb-info">
      <div class="lb-name">Вы — ${me.name}</div>
      <div class="lb-sub" style="color:rgba(255,255,255,.5);">Серия: ${me.streak} дн.</div>
    </div>
    <div style="text-align:right;">
      <div class="lb-stat">${myScore}</div>
      <div style="font-size:10px;color:rgba(255,255,255,.5);">#${myRank} место</div>
    </div>
  `;
  list.appendChild(myPos);

  // Заголовок топа
  const topTitle=document.createElement('div');
  topTitle.className='lb-section-title';
  topTitle.textContent=`Топ игроков · ${_lbLevel==='all'?'Все уровни':LEVELS.find(l=>l.id===_lbLevel)?.name||''}`;
  list.appendChild(topTitle);

  // Список
  allEntries.forEach((entry,i)=>{
    const rank=i+1;
    const row=document.createElement('div');
    row.className='lb-row'+(entry.isMe?' me':'');
    const score=getLbSortKey(entry,_lbLevel);
    const rankClass=rank===1?'gold':rank===2?'silver':rank===3?'bronze':'';
    const rankIcon=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':rank;
    const avatarContent=entry.avatar?`<img src="${entry.avatar}" alt=""/>`:(entry.name[0]?.toUpperCase()||'?');
    const dotColor=entry.isMe?'var(--accent)':'#94a3b8';
    row.innerHTML=`
      <div class="lb-rank ${rankClass}">${rankIcon}</div>
      <div class="lb-avatar">${avatarContent}</div>
      <div class="lb-info">
        <div class="lb-name">${entry.name}${entry.isMe?' (вы)':''}</div>
        <div class="lb-sub">Серия: ${entry.streak} дн.</div>
      </div>
      <div class="lb-stat">${score}</div>
    `;
    list.appendChild(row);
  });

  // Сноска
  const note=document.createElement('div');
  note.style.cssText='font-size:10px;color:var(--muted);text-align:center;padding:12px 0;';
  note.textContent='* Рейтинг обновляется после подключения сервера';
  list.appendChild(note);
}

// ══ REWARDED VIDEO SIMULATION (fullscreen) ═══════════════════
let rvTimers={hint:null,undo:null};
let rvCallbacks={hint:null,undo:null};

function startRewardedVideo(type, onComplete){
  const totalSec=5;
  let elapsed=0;
  rvCallbacks[type]=onComplete;

  const fsEl=document.getElementById(`${type}-rv-fullscreen`);
  const barEl=document.getElementById(`${type}-rv-bar`);
  const labelEl=document.getElementById(`${type}-rv-label`);
  const claimBtn=document.getElementById(`${type}-rv-claim`);

  if(!barEl||!claimBtn||!labelEl||!fsEl)return;

  barEl.style.width='0%';
  claimBtn.disabled=true;
  labelEl.textContent='Смотрите рекламу...';
  fsEl.classList.add('open');

  clearInterval(rvTimers[type]);
  rvTimers[type]=setInterval(()=>{
    elapsed++;
    barEl.style.width=Math.min(100,Math.round(elapsed/totalSec*100))+'%';
    if(elapsed>=totalSec){
      clearInterval(rvTimers[type]);
      claimBtn.disabled=false;
      labelEl.textContent='Готово! Забирайте награду.';
    }
  },1000);
}

function stopRewardedVideo(type){
  clearInterval(rvTimers[type]);
  const fsEl=document.getElementById(`${type}-rv-fullscreen`);
  if(fsEl)fsEl.classList.remove('open');
  rvCallbacks[type]=null;
}
let toastTimer;
function showToast(txt){
  const el=document.getElementById('toast');
  el.textContent=txt;el.style.opacity='1';
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.style.opacity='0',2000);
}

// ══ РЕДАКТИРОВАНИЕ ПРОФИЛЯ ════════════════════════════════════
function openEditName(){
  const input=document.getElementById('edit-name-input');
  input.value=getUserName();
  document.getElementById('edit-name-overlay').classList.add('open');
  setTimeout(()=>input.focus(),350);
}
function saveNameAndClose(){
  const val=document.getElementById('edit-name-input').value.trim();
  if(val){saveUserName(val);renderProfile();showToast('Имя сохранено');}
  document.getElementById('edit-name-overlay').classList.remove('open');
}
function handleAvatarUpload(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const b64=e.target.result;
    saveUserAvatar(b64);
    renderProfile();
    showToast('Фото обновлено');
  };
  reader.readAsDataURL(file);
}

// ══ СТАРТ ════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{

  // MaxBridge + userId
  const tg=window.MaxBridge;
  if(tg){
    try{tg.ready();}catch{}
    try{tg.expand();}catch{}
    try{if(typeof tg.requestFullscreen==='function')tg.requestFullscreen();}catch{}
    try{if(typeof tg.disableVerticalSwipes==='function')tg.disableVerticalSwipes();}catch{}
  }
  initUserId();

  // Сохраняем имя из MaxBridge если есть
  try{
    const user=tg?.initDataUnsafe?.user;
    const name=user?.name||user?.first_name||user?.username;
    if(name&&!ls('username',null))saveUserName(name);
  }catch{}

  // Навигация
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.addEventListener('click',()=>showScreen(b.dataset.screen));
  });

  // Leaderboard tabs
  document.querySelectorAll('.lb-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.lb-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      _lbLevel=tab.dataset.level;
      renderLeaderboard();
    });
  });

  // Кнопка Назад — сохраняем игру
  document.getElementById('btn-back').addEventListener('click',()=>{
    saveGameState();stopTimer();showScreen('home');
  });

  // Пауза
  document.getElementById('btn-pause').addEventListener('click',pauseGame);
  document.getElementById('btn-resume').addEventListener('click',resumeGame);
  document.getElementById('btn-pause-home').addEventListener('click',()=>{
    saveGameState();stopTimer();
    document.getElementById('pause-overlay').classList.remove('open');
    document.getElementById('pause-ad-zone').classList.remove('open');
    showScreen('home');
  });

  // Главная
  document.getElementById('btn-daily').addEventListener('click',()=>startGame('easy',true));
  document.getElementById('btn-home-stats').addEventListener('click',openStatsModal);

  // Тулбар
  document.getElementById('btn-undo').addEventListener('click',undoMove);
  document.getElementById('btn-erase').addEventListener('click',eraseCell);
  document.getElementById('btn-notes').addEventListener('click',()=>{
    notesMode=!notesMode;
    document.getElementById('btn-notes').classList.toggle('active',notesMode);
    document.getElementById('notes-lbl').textContent=notesMode?'ВКЛ':'Заметки';
  });
  document.getElementById('btn-hint').addEventListener('click',useHint);

  // Win
  document.getElementById('btn-win-share').addEventListener('click',shareResult);
  document.getElementById('btn-win-home').addEventListener('click',()=>{
    document.getElementById('win-overlay').classList.remove('open');showScreen('home');
  });

  // ── Hint: шаг 1 (подтверждение) → шаг 2 (fullscreen видео)
  document.getElementById('btn-watch-hint-ad').addEventListener('click',()=>{
    document.getElementById('hint-overlay').classList.remove('open');
    startRewardedVideo('hint',()=>{
      // Награда после просмотра
      hintsLeft=1;
      document.getElementById('hint-badge').textContent=1;
      applyHint();
    });
  });
  document.getElementById('btn-hint-cancel').addEventListener('click',()=>{
    document.getElementById('hint-overlay').classList.remove('open');
  });
  document.getElementById('hint-rv-claim').addEventListener('click',()=>{
    const cb=rvCallbacks['hint'];
    stopRewardedVideo('hint');
    if(cb)cb();
  });
  document.getElementById('hint-rv-cancel').addEventListener('click',()=>{
    stopRewardedVideo('hint');
  });

  // ── Undo: шаг 1 (подтверждение) → шаг 2 (fullscreen видео)
  document.getElementById('btn-watch-undo-ad').addEventListener('click',()=>{
    document.getElementById('undo-overlay').classList.remove('open');
    startRewardedVideo('undo',()=>{
      // Награда после просмотра
      applyUndo();
    });
  });
  document.getElementById('btn-undo-cancel').addEventListener('click',()=>{
    document.getElementById('undo-overlay').classList.remove('open');
  });
  document.getElementById('undo-rv-claim').addEventListener('click',()=>{
    const cb=rvCallbacks['undo'];
    stopRewardedVideo('undo');
    if(cb)cb();
  });
  document.getElementById('undo-rv-cancel').addEventListener('click',()=>{
    stopRewardedVideo('undo');
  });

  document.getElementById('btn-close-stats').addEventListener('click',()=>{
    document.getElementById('stats-overlay').classList.remove('open');
  });

  // Редактирование имени
  document.getElementById('btn-edit-name').addEventListener('click',openEditName);
  document.getElementById('btn-save-name').addEventListener('click',saveNameAndClose);
  document.getElementById('btn-cancel-name').addEventListener('click',()=>{
    document.getElementById('edit-name-overlay').classList.remove('open');
  });
  document.getElementById('edit-name-input').addEventListener('keydown',e=>{
    if(e.key==='Enter')saveNameAndClose();
  });

  // Загрузка аватара
  document.getElementById('btn-avatar-edit').addEventListener('click',()=>{
    document.getElementById('avatar-file-input').click();
  });
  document.getElementById('avatar-file-input').addEventListener('change',e=>{
    handleAvatarUpload(e.target.files[0]);
    e.target.value='';
  });

  // Клавиатура
  document.addEventListener('keydown',e=>{
    if(gamePaused)return;
    if(e.key>='1'&&e.key<='9')inputNumber(parseInt(e.key));
    if(e.key==='Backspace'||e.key==='Delete')eraseCell();
    if(e.ctrlKey&&e.key==='z')undoMove();
    if(selected){
      if(e.key==='ArrowUp')selectCell(Math.max(0,selected.row-1),selected.col);
      if(e.key==='ArrowDown')selectCell(Math.min(8,selected.row+1),selected.col);
      if(e.key==='ArrowLeft')selectCell(selected.row,Math.max(0,selected.col-1));
      if(e.key==='ArrowRight')selectCell(selected.row,Math.min(8,selected.col+1));
    }
  });

  // Автосохранение при уходе
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveGameState();});
  window.addEventListener('pagehide',saveGameState);

  renderHome();
});
