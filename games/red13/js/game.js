// js/game.js — v1.1 Sweaty Try-Hard Update (Full Build)
(() => {
  // ====== Config ======
  const COLS = 54, ROWS = 34, CELL = 20, HUD_H = 40;
  const CANVAS_W = COLS * CELL, CANVAS_H = HUD_H + ROWS * CELL;

  const MAX_HP = 100, START_HP = 75;
  const PHASE_LEN_MS = 280 * 50;
  const DMG_INTERVAL_MS = 28 * 50;
  const DMG_BY_PHASE = [0,1,1,2,3,4,5,6,8,10,12];

  const RED = {
    zones: [], nextSpawnAt: 0, baseInterval: 2200, minInterval: 700,
    lifeMin: 2300, lifeMax: 5200, lastDamageAt: 0, damageEvery: 220,
    baseDamage: 3, pulse: true
  };

  const COLORS = {
    bg:"#111318", hud:"#0b0c10", playerBody:"#ff4040", playerHead:"#ff7373",
    playerFeet:"#b82020", text:"#e6e6e6", hp:"#e85d75",
    item:"#7bdcb5", itemF:"#58a6ff", itemM:"#ffd166", itemG:"#b380ff"
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.outline = "none";

  let gameActive = false, frameId = null;
  window.gameActive = false;

// ====== Input ======
const keysDown = new Set();

function normalizeKey(key) {
  const k = key.toLowerCase();
  if (k.startsWith("arrow")) {
    if (k === "arrowup") return "w";
    if (k === "arrowdown") return "s";
    if (k === "arrowleft") return "a";
    if (k === "arrowright") return "d";
    return "";
  }
  if (["w", "a", "s", "d"].includes(k)) return k;
  return "";
}

// Movement input
window.addEventListener("keydown", e => {
  const k = normalizeKey(e.key);
  if (!k) return;
  e.preventDefault();
  keysDown.add(k);
});

window.addEventListener("keyup", e => {
  const k = normalizeKey(e.key);
  if (!k) return;
  keysDown.delete(k);
});

// Prevent spacebar scroll / zoom
window.addEventListener("keydown", e => {
  if (e.key === " " || e.code === "Space") e.preventDefault();
});

// Restart key (R)
window.addEventListener("keydown", e => {
  if (!gameActive) return;
  if (e.key.toLowerCase() === "r") {
    e.preventDefault();
    startGameFixed();
  }
});

// Debug key (T) — instantly spawn Sweaty Try-Hard
/*
window.addEventListener("keydown", e => {
  if (!gameActive) return;
  if (e.key.toLowerCase() === "t") {
    e.preventDefault();
    if (!tryHardActive) {
      spawnTryHard(performance.now());
      tryHardPhaseTriggered = true;
      console.log("DEBUG: Sweaty Try-Hard spawned manually!");
    }
  }
});
*/

  // Prevent space zoom/scroll
  window.addEventListener("keydown", e => {
    if (e.key === " " || e.code === "Space") e.preventDefault();
  });

  // ====== Persistent Stats ======
  const LS_BP = "red13_bp", LS_GC = "red13_gc";
  function saveStats(bp,gc){
    localStorage.setItem(LS_BP, String(Math.max(0,bp|0)));
    localStorage.setItem(LS_GC, String(Math.max(0,gc|0)));
    if (typeof window.refreshCrateHUD==="function") window.refreshCrateHUD();
  }
  function loadStats(){
    return {
      bp: parseInt(localStorage.getItem(LS_BP)||"0",10),
      gc: parseInt(localStorage.getItem(LS_GC)||"0",10)
    };
  }

  // ====== State ======
  let state;
  function reset(){
    const { bp, gc } = loadStats();
    const now = performance.now();
    state = {
      px: Math.floor(COLS/2),
      py: Math.floor(ROWS/2),
      hp: START_HP, bp, gcoin: gc,
      dir: "down", phase: 1,
      nextPhaseAt: now + PHASE_LEN_MS,
      nextDmgAt: now + DMG_INTERVAL_MS,
      items: [], _nextItemAt: 0,
      dead: false, lastFrame: now,
      _moveAcc: 0, _bpAcc: 0
    };
    RED.zones.length = 0;
    RED.nextSpawnAt = now + 900;
    hideTryHardAlert();
    tryHardActive = false;
  }

  // ====== Utils ======
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const rgba=(hex,a)=>`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;

  // ====== Try-Hard System ======
  let tryHardActive = false;
  let tryHard = null;
  let tryHardPhaseTriggered = false;
  let tryHardAlertTimer = 0;
  const TRYHARD_ALERT_DURATION = 3000;

  function showTryHardAlert(){
    const alert=document.createElement("div");
    alert.id="tryHardAlert";
    alert.textContent="Sweaty Try-Hard in Blue Zone Alert!";
    Object.assign(alert.style,{
      position:"fixed",top:"0",left:"0",width:"100%",padding:"16px 0",
      background:"linear-gradient(90deg,#ff4d4d,#ffd64d)",
      color:"#fff",fontFamily:"BebasNeue,system-ui",fontSize:"26px",
      textAlign:"center",letterSpacing:"1px",zIndex:9999,
      boxShadow:"0 0 20px rgba(255,64,64,0.6)",animation:"flashAlert 0.5s infinite alternate"
    });
    const style=document.createElement("style");
    style.textContent=`@keyframes flashAlert{from{opacity:1;}to{opacity:0.6;}}`;
    document.head.appendChild(style);
    document.body.appendChild(alert);
    tryHardAlertTimer = performance.now() + TRYHARD_ALERT_DURATION;
  }

  function hideTryHardAlert(){
    const el=document.getElementById("tryHardAlert");
    if(el) el.remove();
  }

  function spawnTryHard(now){
    tryHardActive = true;
    const direction = Math.random() < 0.5 ? 1 : -1;
    const startX = direction === 1 ? -CELL*3 : CANVAS_W + CELL*3;
    const y = HUD_H + Math.floor(ROWS/2)*CELL;
    tryHard = {
      x: startX, y, vx: 4*direction, bullets: [], hue: 0, dir: direction
    };
    showTryHardAlert();
  }

  function updateTryHard(now,dt){
    if(!tryHardActive||!tryHard) return;
    tryHard.hue = (tryHard.hue + dt*0.1) % 360;
    tryHard.x += tryHard.vx;
    // fire bullets randomly
    if(Math.random()<0.15){
      const ang = Math.random() * Math.PI * 2; // full 360° spread<.5?-1:1);
      const spd = 6+Math.random()*3;
      tryHard.bullets.push({
        x: tryHard.x, y: tryHard.y, vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd,
        hue: Math.random()*360
      });
    }
    // update bullets
    for(const b of tryHard.bullets){
      b.x += b.vx;
      b.y += b.vy;
    }
    tryHard.bullets = tryHard.bullets.filter(b=>b.x>-20&&b.x<CANVAS_W+20&&b.y>HUD_H-20&&b.y<CANVAS_H+20);
    // collision check
    const px=state.px*CELL+CELL,py=HUD_H+state.py*CELL+CELL;
    for(const b of tryHard.bullets){
      if(Math.abs(b.x-px)<CELL && Math.abs(b.y-py)<CELL){
        // Hit!
        state.dead=true;
        stopGame();
        hideTryHardAlert();
        showGameOverPopup("Sweaty Try-Hard got you!");
        saveStats(state.bp,state.gcoin);
        return;
      }
    }
    // end event
    if(tryHard.dir===1 && tryHard.x>CANVAS_W+CELL*3 || tryHard.dir===-1 && tryHard.x<-CELL*3){
      tryHardActive=false;
      hideTryHardAlert();
    }
  }

  function drawTryHard(now){
    if(!tryHardActive||!tryHard) return;
    const col=`hsl(${tryHard.hue},100%,60%)`;
    ctx.save();
    ctx.translate(0,HUD_H);
    // body
    ctx.fillStyle=col;
    ctx.fillRect(tryHard.x-CELL,tryHard.y-HUD_H-CELL, CELL*2, CELL*2);
    // head
    ctx.fillRect(tryHard.x-CELL*0.3,tryHard.y-HUD_H-CELL*1.6,CELL*0.6,CELL*0.6);
    // bullets
    for(const b of tryHard.bullets){
      ctx.fillStyle=`hsl(${b.hue},100%,70%)`;
      ctx.fillRect(b.x-2,b.y-HUD_H-2,4,4);
    }
      ctx.restore(); // restores to source-over
}  // <— close drawBackground properly

function drawHUD(now){

  }
  // ====== Items + Red Zones (same as v1.0 Stable) ======
  function spawnItemNow(now){
    if(state.items.length>=7) return;
    const x=1+Math.floor(Math.random()*(COLS-2));
    const y=1+Math.floor(Math.random()*(ROWS-2));
    const r=Math.random();
    const type=r<.4?"B":r<.7?"F":r<.9?"M":"G";
    const cx=x*CELL+CELL/2;
    const cy=HUD_H+y*CELL+CELL/2;
    const fallDur=550+Math.random()*150;
    state.items.push({
      x,y,type,falling:true,born:now,landTime:now+fallDur,
      targetX:cx,targetY:cy,px:cx,py:-CELL
    });
  }
  function scheduleItems(now){
    if(!state._nextItemAt) state._nextItemAt=now+1300;
    if(now>=state._nextItemAt){
      spawnItemNow(now);
      state._nextItemAt=now+1200+Math.random()*900;
    }
  }
  function updateFallingItems(now){
    for(const it of state.items){
      if(!it.falling) continue;
      const t=clamp((now-it.born)/(it.landTime-it.born),0,1);
      const k=easeOutCubic(t);
      it.px=it.targetX;
      it.py=-CELL+(it.targetY+CELL)*k;
      if(t>=1){it.falling=false;it.px=it.targetX;it.py=it.targetY;}
    }
  }
  function drawItem(it){
    const f=it.type==="B"?COLORS.item:it.type==="F"?COLORS.itemF:it.type==="M"?COLORS.itemM:COLORS.itemG;
    ctx.save();ctx.translate(0,HUD_H);
    if(it.falling){
      for(let i=4;i>=1;i--){const gy=it.py-i*14,a=.06*i;
        ctx.fillStyle=rgba(f,a);
        ctx.fillRect(it.px-CELL/2+3,gy-CELL/2+3,CELL-6,CELL-6);
      }
      ctx.fillStyle=rgba(f,.82);
      ctx.fillRect(it.px-CELL/2+3,it.py-CELL/2+3,CELL-6,CELL-6);
      ctx.fillStyle="#0b0c10";ctx.font="bold 12px monospace";
      ctx.fillText(it.type,it.px-4,it.py+4);
    }else{
      const x=it.x*CELL,y=it.y*CELL;
      ctx.fillStyle=f;ctx.fillRect(x+3,y+3,CELL-6,CELL-6);
      ctx.fillStyle="#0b0c10";ctx.font="bold 12px monospace";
      ctx.fillText(it.type,x+7,y+14);
    }
    ctx.restore();
  }
  function pickupNearby(){
    for(let i=state.items.length-1;i>=0;i--){
      const it=state.items[i];
      if(it.falling) continue;
      if(it.x>=state.px-1&&it.x<=state.px+1&&it.y>=state.py-1&&it.y<=state.py+1){
        if(it.type==="B"){if(state.hp<75)state.hp=Math.min(75,state.hp+10);state.bp+=5;}
        if(it.type==="F"){if(state.hp<75)state.hp=75;state.bp+=10;}
        if(it.type==="M"){state.hp=MAX_HP;state.bp+=20;}
        if(it.type==="G"){state.gcoin+=1;}
        saveStats(state.bp,state.gcoin);
        state.items.splice(i,1);
      }
    }
  }

  // ====== Red Zone Functions ======
  function spawnRedZones(now){
    const pf=Math.max(.45,1-(state.phase-1)*.12);
    const intv=Math.max(RED.minInterval,RED.baseInterval*pf);
    if(now<RED.nextSpawnAt)return;
    RED.nextSpawnAt=now+intv;
    const margin=CELL*6;
    const cx=margin+Math.random()*(CANVAS_W-margin*2);
    const cy=HUD_H+margin+Math.random()*((ROWS*CELL)-margin*2);
    const r=CELL*3+Math.random()*(CELL*7);
    const life=RED.lifeMin+Math.random()*(RED.lifeMax-RED.lifeMin);
    const type=Math.random()<.7?"solid":"ring";
    RED.zones.push({type,cx,cy,r,rInner:type==="ring"?r*.55:0,born:now,life,pulse:Math.random()<.5});
    if(RED.zones.length>64)RED.zones.splice(0,RED.zones.length-64);
  }
  function zoneRadiusAt(z,now){
    if(!z.pulse)return{outer:z.r,inner:z.rInner||0};
    const t=(now-z.born)/z.life;
    const w=Math.sin(t*Math.PI*4)*.15;
    return{outer:z.r*(1+w),inner:(z.rInner||0)*(1+w)};
  }
  function drawRedZones(now){
    ctx.save();
    for(const z of RED.zones){
      const a=(now-z.born)/z.life;
      const alpha=.2+.25*(1-a);
      const {outer,inner}=zoneRadiusAt(z,now);
      ctx.beginPath();
      if(z.type==="solid"){
        ctx.arc(z.cx,z.cy,outer,0,Math.PI*2);
        ctx.fillStyle=`rgba(228,61,61,${alpha})`;ctx.fill();
      }else{
        ctx.arc(z.cx,z.cy,outer,0,Math.PI*2);
        ctx.arc(z.cx,z.cy,inner,0,Math.PI*2,true);
        ctx.fillStyle=`rgba(228,61,61,${alpha})`;ctx.fill("evenodd");
      }
    }
    ctx.restore();
  }
  function damageFromRedZones(now){
    if(now-RED.lastDamageAt<RED.damageEvery)return;
    const px=state.px*CELL+CELL;
    const py=HUD_H+state.py*CELL+CELL;
    let hit=0;
    for(const z of RED.zones){
      const {outer,inner}=zoneRadiusAt(z,now);
      const d=Math.hypot(px-z.cx,py-z.cy);
      if(z.type==="solid"&&d<=outer)hit++;
      else if(z.type==="ring"&&d>=inner&&d<=outer)hit++;
    }
    if(hit){
      const dmg=Math.min(15,Math.ceil((RED.baseDamage+(state.phase-1)*.5)*hit));
      state.hp=Math.max(0,state.hp-dmg);
      RED.lastDamageAt=now;
    }
  }

// ====== Rendering ======
function drawBackground(now = performance.now()) {
  // base deep blue
  ctx.fillStyle = "rgba(15, 22, 40, 0.95)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // faint grass pattern
  ctx.save();
  ctx.translate(0, HUD_H);
  const grassSeed = Math.floor(now / 250);
  for (let y = 0; y < ROWS * CELL; y += 8) {
    for (let x = 0; x < COLS * CELL; x += 8) {
      if ((x + y + grassSeed) % 17 === 0) {
        const shade = 25 + Math.random() * 25;
        // greenish tint blended into the blue
        ctx.fillStyle = `rgba(${shade},${shade + 40},${shade + 20},0.12)`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }
  ctx.restore();

  // gentle blue haze for depth
  const cx = CANVAS_W / 2;
  const cy = HUD_H + (ROWS * CELL) / 2;
  const pulse = 0.8 + Math.sin(now / 2000) * 0.05;
  const grad = ctx.createRadialGradient(cx, cy, 150, cx, cy, 600);
  grad.addColorStop(0, `rgba(20, 40, 80, ${0.08 * pulse})`);
  grad.addColorStop(1, `rgba(10, 20, 40, 1)`);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

function drawHUD(now){
  ctx.fillStyle = COLORS.hud;
  ctx.fillRect(0, 0, CANVAS_W, HUD_H);
  ctx.fillStyle = COLORS.text;
  ctx.font = "14px monospace";

  const remain = Math.max(0, state.nextPhaseAt - now);
  ctx.fillText(`HP:${state.hp}`, 10, 15);
  ctx.fillText(`BP:${state.bp}`, 270, 15);
  ctx.fillText(`PH:${state.phase}`, 360, 15);
  ctx.fillText(`GC:${state.gcoin}`, 430, 15);
  ctx.fillText(`Next:${(remain / 1000).toFixed(1)}s`, 520, 15);

  const barW = 180, barH = 10, x0 = 70, y0 = 18;
  ctx.fillStyle = "#2b2f36";
  ctx.fillRect(x0, y0, barW, barH);
  ctx.fillStyle = COLORS.hp;
  ctx.fillRect(x0, y0, barW * (state.hp / MAX_HP), barH);
}

function drawPlayer(now){
  const bounce = Math.sin(now/120) * 2;
  const px = state.px*CELL, py = state.py*CELL;
  ctx.save(); ctx.translate(0, HUD_H);
  ctx.fillStyle = COLORS.playerBody;
  ctx.fillRect(px + CELL*0.2, py + CELL*0.6 - bounce, CELL*1.6, CELL*1.4);
  ctx.fillStyle = COLORS.playerFeet;
  ctx.fillRect(px + CELL*0.25, py + CELL*1.9 - bounce, CELL*1.5, CELL*0.3);
  let hx = px + CELL*0.6, hy = py + CELL*0.1 - bounce;
  switch (state.dir){
    case "up":    hy = py - CELL*0.35 - bounce; break;
    case "down":  hy = py + CELL*0.9  - bounce; break;
    case "left":  hx = px - CELL*0.45; hy = py + CELL*0.55 - bounce; break;
    case "right": hx = px + CELL*1.15; hy = py + CELL*0.55 - bounce; break;
  }
  ctx.fillStyle = COLORS.playerHead;
  ctx.fillRect(hx, hy, CELL*0.8, CELL*0.8);
  ctx.restore();
}


function drawHUD(now) {
  ctx.fillStyle = COLORS.hud;
  ctx.fillRect(0, 0, CANVAS_W, HUD_H);
  ctx.fillStyle = COLORS.text;
  ctx.font = "14px monospace";

  const remain = Math.max(0, state.nextPhaseAt - now);
  ctx.fillText(`HP:${state.hp}`, 10, 15);
  ctx.fillText(`BP:${state.bp}`, 270, 15);
  ctx.fillText(`PH:${state.phase}`, 360, 15);
  ctx.fillText(`GC:${state.gcoin}`, 430, 15);
  ctx.fillText(`Next:${(remain / 1000).toFixed(1)}s`, 520, 15);

  const barW = 180, barH = 10, x0 = 70, y0 = 18;
  ctx.fillStyle = "#2b2f36";
  ctx.fillRect(x0, y0, barW, barH);
  ctx.fillStyle = COLORS.hp;
  ctx.fillRect(x0, y0, barW * (state.hp / MAX_HP), barH);
}

function drawPlayer(now) {
  const bounce = Math.sin(now / 120) * 2;
  const px = state.px * CELL, py = state.py * CELL;
  ctx.save();
  ctx.translate(0, HUD_H);
  ctx.fillStyle = COLORS.playerBody;
  ctx.fillRect(px + CELL * 0.2, py + CELL * 0.6 - bounce, CELL * 1.6, CELL * 1.4);
  ctx.fillStyle = COLORS.playerFeet;
  ctx.fillRect(px + CELL * 0.25, py + CELL * 1.9 - bounce, CELL * 1.5, CELL * 0.3);
  let hx = px + CELL * 0.6, hy = py + CELL * 0.1 - bounce;
  switch (state.dir) {
    case "up": hy = py - CELL * 0.35 - bounce; break;
    case "down": hy = py + CELL * 0.9 - bounce; break;
    case "left": hx = px - CELL * 0.45; hy = py + CELL * 0.55 - bounce; break;
    case "right": hx = px + CELL * 1.15; hy = py + CELL * 0.55 - bounce; break;
  }
  ctx.fillStyle = COLORS.playerHead;
  ctx.fillRect(hx, hy, CELL * 0.8, CELL * 0.8);
  ctx.restore();
}
  // ====== Main Loop ======
  function update(dt,now){
    if(!gameActive||state.dead)return;
    const stepMs=120;
    state._moveAcc+=dt;
    while(state._moveAcc>=stepMs){
      state._moveAcc-=stepMs;
      if(keysDown.has("w")){state.py--;state.dir="up";}
      if(keysDown.has("s")){state.py++;state.dir="down";}
      if(keysDown.has("a")){state.px--;state.dir="left";}
      if(keysDown.has("d")){state.px++;state.dir="right";}
      state.px=clamp(state.px,0,COLS-2);
      state.py=clamp(state.py,0,ROWS-2);
    }
    scheduleItems(now);
    updateFallingItems(now);
    pickupNearby();
    state._bpAcc+=dt;
    while(state._bpAcc>=50){state.bp+=1;state._bpAcc-=50;}
    if(now>=state.nextDmgAt){
      const phaseDmg=DMG_BY_PHASE[Math.min(state.phase,DMG_BY_PHASE.length-1)];
      state.hp-=phaseDmg;state.nextDmgAt+=DMG_INTERVAL_MS;
      if(state.hp<0)state.hp=0;
    }
    if(now>=state.nextPhaseAt){state.phase++;state.nextPhaseAt+=PHASE_LEN_MS;}
    spawnRedZones(now);
    RED.zones=RED.zones.filter(z=>(now-z.born)<=z.life);
    damageFromRedZones(now);

    // === Sweaty Try-Hard Trigger ===
    if(!tryHardPhaseTriggered && state.phase>=10 && state.phase<=12){
      if(Math.random()<0.01){ // random chance per frame
        spawnTryHard(now);
        tryHardPhaseTriggered=true;
      }
    }

    updateTryHard(now,dt);

    if(state.hp<=0&&!state.dead){
      state.dead=true;stopGame();
      saveStats(state.bp,state.gcoin);
      showGameOverPopup("You died!");
    }
  }

  function loop(now){
    if(!gameActive)return;
    const dt=Math.min(50,now-(state.lastFrame||now));
    state.lastFrame=now;
    update(dt,now);
    drawBackground();
    drawHUD(now);
    drawRedZones(now);
    drawTryHard(now);
    for(const it of state.items) drawItem(it);
    drawPlayer(now);
    frameId=requestAnimationFrame(loop);
  }

  // ====== UI / Game Over ======
  function showGameOverPopup(text){
    let popup=document.getElementById("gameOverPopup");
    if(!popup){
      popup=document.createElement("div");
      popup.id="gameOverPopup";
      popup.innerHTML=`
        <div class="popup-inner">
          <h2 id="goText"></h2>
          <button id="btnPlayAgain" class="ops-btn primary">Play Again</button>
          <button id="btnMenu" class="ops-btn accent">Back to Menu</button>
        </div>`;
      document.body.appendChild(popup);
      const style=document.createElement("style");
      style.textContent=`
        #gameOverPopup{position:fixed;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.75);z-index:99;}
        #gameOverPopup .popup-inner{background:rgba(15,20,28,.9);padding:32px 40px;border-radius:12px;text-align:center;
          border:1px solid rgba(255,102,102,.4);box-shadow:0 0 40px rgba(255,64,64,.3);color:#ffe680;font-family:system-ui,sans-serif;}
        #gameOverPopup h2{margin:0 0 20px;}
        #gameOverPopup .ops-btn{margin:6px 0;width:180px;}`;
      document.head.appendChild(style);
    }
    popup.style.display="grid";
    document.getElementById("goText").textContent=text||"You Died!";
    document.getElementById("btnPlayAgain").onclick=()=>{popup.style.display="none";startGameFixed();};
    document.getElementById("btnMenu").onclick=()=>{popup.style.display="none";setScreen("menu");};
  }
  function hideGameOverPopup(){
    const p=document.getElementById("gameOverPopup");
    if(p)p.style.display="none";
  }

  // ====== Public API ======
  function startGameFixed(){
    reset();
    hideGameOverPopup();
    gameActive=true;
    window.gameActive=true;
    window.uiScreen="game";
    setScreen("game");
    requestAnimationFrame(loop);
  }
  function stopGame(){
    gameActive=false;
    window.gameActive=false;
    if(frameId)cancelAnimationFrame(frameId);
  }

  window.startGameFixed=startGameFixed;
  window.stopGame=stopGame;
  window.gameLoop=loop;
  window.gameUpdate=update;
})();

