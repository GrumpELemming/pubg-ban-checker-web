/* ======================================================
   SCHNEEFUCHS HATES SMGS — FULL WEB BUILD v1.0
   Featuring Falling Medkits + SMG Intensity Scaling
   ====================================================== */

// ===== Canvas =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha:false });
const W = canvas.width, H = canvas.height;

// ===== Assets =====
const imgFox = new Image();  imgFox.src = 'fox.png';
const imgMed = new Image();  imgMed.src = 'medkit.png'; // optional sprite, leave blank to draw glow

const smgDefs = [
  { key:'UMP',    src:'UMP.png',    w:192, h:96,  rateMult:1.0 },
  { key:'MP9',    src:'MP9.png',    w:168, h:84,  rateMult:0.5 },
  { key:'Vector', src:'Vector.png', w:184, h:92,  rateMult:0.25 },
  { key:'P90',    src:'P90.png',    w:184, h:92,  rateMult:0.125 },
];
smgDefs.forEach(d => { const im=new Image(); im.src=d.src; d.im=im; });

// ===== State =====
const state = {
  running:false,
  time:0,
  phase:1,
  nextPhaseAt:30000,     // was 15000 — now 30s per phase
  phaseInterval:30000,   // slower intensity build-up
  smgs:[],
  bullets:[],
  meds:[],
  keys:{},
  player:null,
};


// ===== Player =====
function makePlayer(){
  return {
    x:W*0.5, y:H*0.7,
    vx:0, vy:0,
    speed:1.7, dashSpeed:2.6,
    r:26,   
    hp:100, maxHp:100,
    invuln:0,
    w:96, h:96,
    faceLeft:false,
  };
}

// ===== SMGs =====
function makeSMG(def){
  const side = (Math.random()*4)|0;
  let x,y,vx,vy;
  const baseSpeed = 0.55 + 0.05*state.phase;
  switch(side){
    case 0: x=-80; y=80+Math.random()*(H-160); vx= baseSpeed;  vy=(Math.random()*0.6-0.3); break;
    case 1: x=W+80; y=80+Math.random()*(H-160); vx=-baseSpeed;  vy=(Math.random()*0.6-0.3); break;
    case 2: x=80+Math.random()*(W-160); y=-80; vx=(Math.random()*0.6-0.3); vy= baseSpeed;   break;
    default:x=80+Math.random()*(W-160); y=H+80; vx=(Math.random()*0.6-0.3); vy=-baseSpeed;  break;
  }
  return {
    def,
    x,y,vx,vy,
    wobbleT:Math.random()*Math.PI*2,
    wobbleAmp:16+Math.random()*22,
    fireCooldown:0,
    bulletsFired:0,
  };
}

function drawSMG(g,p){
  const {im,w,h} = g.def;
  const ang = Math.atan2(p.y - g.y, p.x - g.x);

  // store muzzle offset so bullets spawn correctly
  g.muzzleX = g.x + Math.cos(ang) * (w * 0.35);
  g.muzzleY = g.y + Math.sin(ang) * (w * 0.35);

  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(ang);
  ctx.drawImage(im, -w/2, -h/2, w, h);
  ctx.restore();
}


// ===== Bullets =====
function spawnBullet(sx,sy,tx,ty){
  const dx=tx-sx, dy=ty-sy, d=Math.hypot(dx,dy)||1;
  const speed = 1.5 + 0.04*state.phase;
  state.bullets.push({ x:sx,y:sy, vx:dx/d*speed, vy:dy/d*speed, r:3.6, life:6000 });
}

// ===== Medkits (Heals) =====
function spawnMed(x){
  state.meds.push({
    x:Math.max(30, Math.min(W-30, (x ?? (30+Math.random()*(W-60))))),
    y:-20,
    vy:0.8 + Math.random()*0.3,
    r:14,
    heal:25,
    swayT:Math.random()*Math.PI*2,
    alpha:0,
  });
}

// ===== Utils =====
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const now = ()=>performance.now();
function circleHit(x1,y1,r1,x2,y2,r2){ return (x1-x2)**2 + (y1-y2)**2 <= (r1+r2)**2; }

// ===== Input =====
window.addEventListener('keydown', e=>{
  state.keys[e.key.toLowerCase()] = true;
  if(!state.running && introEl && !introEl.classList.contains('hidden') && (e.key==='Enter'||e.key==='NumpadEnter')) startRun();
  if(!state.running && overEl && !overEl.classList.contains('hidden') && e.key.toLowerCase()==='r') startRun();
});
window.addEventListener('keyup', e=>{ state.keys[e.key.toLowerCase()] = false; });

// ===== Title / Menu =====
const titleScreen = document.getElementById('titleScreen');
const introEl = document.getElementById('intro');
const overEl = document.getElementById('gameover');
const finalStatsEl = document.getElementById('finalStats');

const backToGamesURL = "https://pubgbanchecker.com/games.html";

function showMenuFromTitle(){
  titleScreen.classList.add('hidden');
  introEl.classList.remove('hidden');
  updateBestTimeDisplay();
}
titleScreen.addEventListener('click', showMenuFromTitle);
window.addEventListener('keydown', e=>{
  if(!titleScreen.classList.contains('hidden') && (e.key==='Enter'||e.key===' ')) showMenuFromTitle();
});

document.getElementById('startBtn').onclick = ()=> startRun();

// Create “Back to Games” button dynamically if not present
let backBtn = document.getElementById('backBtn');
if(!backBtn){
  backBtn = document.createElement('button');
  backBtn.id = 'backBtn';
  backBtn.textContent = 'Back to Games';
  backBtn.className = 'menuButton';
  backBtn.onclick = ()=> window.location.href = backToGamesURL;
  introEl.appendChild(backBtn);
}

// ===== Best Time Storage =====
function getBestTime(){ return parseFloat(localStorage.getItem("schnee_best_time") || "0"); }
function setBestTime(ms){ localStorage.setItem("schnee_best_time", String(ms)); }
function formatTime(ms){
  const secs=Math.floor(ms/1000);
  const mm=String(Math.floor(secs/60)).padStart(2,'0');
  const ss=String(secs%60).padStart(2,'0');
  return `${mm}:${ss}`;
}

function updateBestTimeDisplay(){
  const best = getBestTime();
  const el = document.getElementById('bestTimeDisplay');
  if(el) el.textContent = best>0 ? `Best Time: ${formatTime(best)}` : "";
  else {
    const span = document.createElement('div');
    span.id = 'bestTimeDisplay';
    span.className = 'best-time';
    span.textContent = best>0 ? `Best Time: ${formatTime(best)}` : "";
    introEl.appendChild(span);
  }
}

// ===== Buttons & Restart =====
document.getElementById('restartBtn').onclick = ()=> startRun();

let backToMenuBtn = document.getElementById('backMenuBtn');
if (backToMenuBtn) {
  backToMenuBtn.onclick = () => {
    // Hide Game Over screen
    overEl.classList.add('hidden');
    // Show Menu again
    introEl.classList.remove('hidden');
    // Reset state
    state.running = false;
    state.time = 0;
    updateBestTimeDisplay();
  };
}


// ===== End Game (with Best Time Update) =====
function endRun(){
  state.running=false;
  const survived = state.time;
  const best = getBestTime();
  if(survived > best) setBestTime(survived);

  const secs=Math.floor(survived/1000);
  const mm=String(Math.floor(secs/60)).padStart(2,'0');
  const ss=String(secs%60).padStart(2,'0');

  finalStatsEl.textContent = `You reached Phase ${state.phase} and survived ${mm}:${ss}.`;
  overEl.classList.remove('hidden');
  updateBestTimeDisplay();
}


// ===== Game Flow =====
function reset(){
  state.running=false;
  state.time=0;
  state.phase=1;
  state.nextPhaseAt=state.phaseInterval;
  state.smgs.length=0;
  state.bullets.length=0;
  state.meds.length=0;
  state.player = makePlayer();
}

function startRun(){
  reset();
  introEl.classList.add('hidden');
  overEl.classList.add('hidden');
  state.running=true;
  enforcePhaseComposition(true);
}

// ===== Phase Composition =====
function desiredComposition(phase){
  switch(true){
    case (phase<=1):  return { UMP:1, MP9:0, Vector:0, P90:0 };
    case (phase===2): return { UMP:2, MP9:0, Vector:0, P90:0 };
    case (phase===3): return { UMP:2, MP9:1, Vector:0, P90:0 };
    case (phase===4): return { UMP:2, MP9:1, Vector:1, P90:0 };
    case (phase===5): return { UMP:2, MP9:1, Vector:1, P90:1 };
    case (phase===6): return { UMP:2, MP9:2, Vector:1, P90:1 };
    case (phase===7): return { UMP:2, MP9:2, Vector:2, P90:1 };
    case (phase===8): return { UMP:1, MP9:2, Vector:2, P90:1 };
    case (phase===9): return { UMP:1, MP9:2, Vector:3, P90:1 };
    default:{
      const extra = Math.min(phase-9,4);
      return { UMP:0, MP9:2, Vector:3+extra, P90:1+Math.floor(extra/2) };
    }
  }
}


function enforcePhaseComposition(seed=false){
  const want = desiredComposition(state.phase);
  const have = { UMP:0, MP9:0, Vector:0, P90:0 };
  for(const g of state.smgs) have[g.def.key]++;

  for(const key of Object.keys(want)){
    const need = Math.max(0, want[key] - have[key]);
    for(let i=0;i<need;i++){
      const def = smgDefs.find(d=>d.key===key);
      state.smgs.push(makeSMG(def));
    }
  }

  if(seed){
    for(const key of Object.keys(have)){
      let extra = Math.max(0, have[key] - (want[key]||0));
      for(let i=state.smgs.length-1; i>=0 && extra>0; i--){
        if(state.smgs[i].def.key===key){ state.smgs.splice(i,1); extra--; }
      }
    }
  }
}

// ===== Fire Rate =====
const BASE_FIRE_UMP_MS = 1800;
function nextFireCooldownMS(def){
  const globalMult = Math.max(0.6, 1 - (state.phase-1)*0.04);
  const jitter = 0.7 + Math.random()*0.6;
  return BASE_FIRE_UMP_MS * def.rateMult * globalMult * jitter;
}

// ===== Game Loop =====
let last = now();
function tick(){
  const t = now(); const dt = Math.min(50, t-last); last=t;
  drawBackground();

  if(state.running){
    updatePhase(dt);
    updatePlayer(dt);
    updateSMGs(dt);
    updateBullets(dt);
    updateMeds(dt);
    drawHUD();
    if(state.player.hp<=0) endRun();
  }else{
    drawHUD(true);
  }

  requestAnimationFrame(tick);
}

// ===== Update Functions =====
function updatePhase(dt){
  state.time += dt;
  if(state.time >= state.nextPhaseAt){
    state.phase++;
    state.nextPhaseAt += state.phaseInterval;
    enforcePhaseComposition();
  }
}

function updatePlayer(dt){
  const p=state.player, k=state.keys;
  const up=k['w']||k['arrowup'], down=k['s']||k['arrowdown'],
        left=k['a']||k['arrowleft'], right=k['d']||k['arrowright'],
        dash=k['shift'];
  const sp = dash ? p.dashSpeed : p.speed;
  p.vx=(left?-1:0)+(right?1:0); p.vy=(up?-1:0)+(down?1:0);
  const mag=Math.hypot(p.vx,p.vy)||1;
  p.x += (p.vx/mag)*sp*dt*0.6; p.y += (p.vy/mag)*sp*dt*0.6;
  if(right) p.faceLeft=false; if(left) p.faceLeft=true;
  p.x = clamp(p.x, p.r+6, W-p.r-6); p.y = clamp(p.y, p.r+6, H-p.r-6);
  if(p.invuln>0) p.invuln -= dt;

  ctx.save();
  ctx.shadowColor='rgba(0,150,255,.35)';
  ctx.shadowBlur=18;
  ctx.translate(p.x,p.y);
  if(p.faceLeft) ctx.scale(-1,1);
  ctx.drawImage(imgFox, -p.w/2, -p.h/2, p.w, p.h);
  ctx.restore();
}

function updateSMGs(dt){
  const p=state.player;
  for(let i=state.smgs.length-1;i>=0;i--){
    const g=state.smgs[i];
    g.wobbleT += dt*0.005;
    g.x += g.vx*dt*0.6; g.y += g.vy*dt*0.6;
    g.x += Math.cos(g.wobbleT)*(g.wobbleAmp*dt/1000);
    g.y += Math.sin(g.wobbleT*1.2)*(g.wobbleAmp*.7*dt/1000);

    if(g.x<-200||g.x>W+200||g.y<-200||g.y>H+200){
      state.smgs[i] = makeSMG(g.def);
      continue;
    }

    g.fireCooldown -= dt;
    if(g.fireCooldown<=0){
      const jitter = 10*(Math.random()-0.5);
      spawnBullet(g.muzzleX || g.x, g.muzzleY || g.y, p.x + jitter, p.y + jitter);
      g.bulletsFired++;
      if(g.bulletsFired % (8 + (Math.random()*4|0)) === 0){
        g.fireCooldown = nextFireCooldownMS(g.def) * 1.8;
      }else{
        g.fireCooldown = nextFireCooldownMS(g.def);
      }
    }

    drawSMG(g,p);
  }
}

function updateBullets(dt){
  const p=state.player;
  for(let i=state.bullets.length-1;i>=0;i--){
    const b=state.bullets[i];
    b.x += b.vx*dt*0.6; b.y += b.vy*dt*0.6; b.life -= dt;

    if(p.invuln<=0 && circleHit(b.x,b.y,b.r, p.x,p.y,p.r)){
      const dmg = 8 + Math.min(12, Math.floor(state.phase*0.9));
      p.hp = Math.max(0, p.hp - dmg);
      p.invuln = 350;
      if(Math.random()<0.8) spawnMed(p.x + (Math.random()*40-20));
      state.bullets.splice(i,1);
      continue;
    }

    if(b.life<=0 || b.x<-80||b.x>W+80||b.y<-80||b.y>H+80){
      state.bullets.splice(i,1); continue;
    }

    ctx.save();
    ctx.shadowColor='rgba(255,90,90,.6)'; ctx.shadowBlur=14;
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
    ctx.fillStyle='#ff5858'; ctx.fill();
    ctx.restore();
  }
}

function updateMeds(dt){
  const p=state.player;
  for(let i=state.meds.length-1;i>=0;i--){
    const m=state.meds[i];
    m.swayT += dt*0.003;
    m.x += Math.cos(m.swayT)*0.5*(1+0.1*state.phase);
    m.y += m.vy*dt*0.6;
    m.alpha = Math.min(1, m.alpha + 0.05);

    if(circleHit(m.x,m.y,m.r, p.x,p.y,p.r+4)){
      p.hp = Math.min(p.maxHp, p.hp + m.heal);
      state.meds.splice(i,1); continue;
    }
    if(m.y>H+40){ state.meds.splice(i,1); continue; }

    ctx.save();
    ctx.globalAlpha = m.alpha;
    if(imgMed.src){
      ctx.drawImage(imgMed, m.x-24, m.y-24, 46, 46);
    }else{
      ctx.shadowColor='rgba(120,255,180,.55)';
      ctx.shadowBlur=16;
      ctx.beginPath();
      ctx.arc(m.x,m.y,m.r,0,Math.PI*2);
      ctx.fillStyle='#86ffc6'; ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.3)';
      ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#095a44';
      ctx.fillRect(m.x-7,m.y-2,14,4);
      ctx.fillRect(m.x-2,m.y-7,4,14);
    }
    ctx.restore();
  }
}

// ===== Background & HUD =====
function drawBackground(){
  const g=ctx.createRadialGradient(W*.5,H*.5,60, W*.5,H*.5, Math.max(W,H));
  g.addColorStop(0,'#061a27'); g.addColorStop(1,'#041018');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  ctx.globalAlpha=.12;
  for(let i=0;i<3;i++){
    const cx=(Math.sin((state.time*.0002)+(i*1.7))*.5+.5)*W;
    const cy=(Math.cos((state.time*.00016)+(i*2.1))*.5+.5)*H;
    const r=220+i*170;
    const fog=ctx.createRadialGradient(cx,cy,10, cx,cy,r);
    fog.addColorStop(0,'rgba(0,150,255,.14)');
    fog.addColorStop(1,'rgba(0,60,110,0)');
    ctx.fillStyle=fog; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;
}

function drawHUD(dim=false){
  const p=state.player;
  ctx.fillStyle='rgba(2,20,30,.55)';
  ctx.fillRect(12,12, W-24, 50);
  ctx.strokeStyle='rgba(100,180,255,.45)';
  ctx.lineWidth=1;
  ctx.strokeRect(12.5,12.5, W-25, 50);

  const hpPct=p?p.hp/p.maxHp:1;
  const barW=Math.round((W-260)*Math.max(0,Math.min(1,hpPct)));
  ctx.fillStyle='rgba(0,120,200,.35)';
  ctx.fillRect(20,20, (W-280), 14);
  const grad=ctx.createLinearGradient(20,20, 20+barW,20);
  grad.addColorStop(0,'#47c3ff');
  grad.addColorStop(1,'#8fe3ff');
  ctx.fillStyle=grad;
  ctx.fillRect(20,20, barW,14);

  ctx.fillStyle='#ccefff';
  ctx.font='bold 14px system-ui,-apple-system,Segoe UI';
  ctx.fillText(`HP: ${p?Math.ceil(p.hp):100}`, 20,46);

  const secs=Math.floor(state.time/1000);
  const mm=String(Math.floor(secs/60)).padStart(2,'0');
  const ss=String(secs%60).padStart(2,'0');
  ctx.textAlign='right';
  ctx.fillText(`Phase ${state.phase}  •  ${mm}:${ss}`, W-20,46);
  ctx.textAlign='left';

  if(dim && !state.running && introEl && !introEl.classList.contains('hidden')){
    ctx.fillStyle='rgba(140,210,255,.85)';
    ctx.font='600 18px system-ui,-apple-system,Segoe UI';
    ctx.fillText('Press Enter to Start', 24, H-24);
  }
}

// ===== Boot =====
reset();
(function preload(){ void imgFox.width; smgDefs.forEach(d=>void d.im.width); })();
tick();

// ===== Console Easter Egg =====
console.log("%cCurious, runner?", "color:#00bfff; font-size:14px; font-style:italic;");
console.log("%cType blueZoneAlert() in the console if you dare 💀", "color:#66ccff;");
function blueZoneAlert(){
  console.log("%c[BLUE ZONE WARNING]", "color:#00bfff; font-weight:bold; font-size:18px;");
  console.log("%cYou’ve entered the dev zone, runner...", "color:#66ccff;");
  console.log("%cNow f*** off before the blue takes you 😎", "color:#ff4444; font-weight:bold;");
}

