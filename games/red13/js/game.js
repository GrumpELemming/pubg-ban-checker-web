// duplicate-load guard
if (window.__GAME_LOADED__) {
  console.warn("GAME loaded twice");
} else {
  window.__GAME_LOADED__ = true;

/* -------------------------------------------------------
   Blue Zone Runner - game.js (pure DOM, no innerHTML)
   ------------------------------------------------------- */

(function(){
  // === Ensure safe DOM helpers exist ===
  if (!window.safeStripTags) {
    window.safeStripTags = function(i){return i==null?"":String(i).replace(/<[^>]*>/g,"");};
  }
  if (!window.safeSetText) {
    window.safeSetText = function(el,t){if(el)el.textContent=t==null?"":String(t);};
  }
  if (!window.safeTrustedHTML) {
    window.safeTrustedHTML = function (el, html) {
      if (!el) return;
      const fragment = document.createDocumentFragment();
      const allowedTags = ["span", "strong", "em"];
      const parts = String(html).split(/(<[^>]+>)/g);
      const stack = [fragment];
      for (const part of parts) {
        if (!part) continue;
        if (part.startsWith("</")) { stack.pop(); continue; }
        const openMatch = part.match(/^<(\w+)[^>]*>$/);
        if (openMatch && allowedTags.includes(openMatch[1].toLowerCase())) {
          const tag = openMatch[1].toLowerCase();
          const node = document.createElement(tag);
          stack[stack.length - 1].appendChild(node);
          stack.push(node);
          continue;
        }
        if (!part.startsWith("<")) {
          stack[stack.length - 1].appendChild(document.createTextNode(part));
        }
      }
      el.replaceChildren(fragment);
    };
  }

  /* ------------------------------
     Core game state & references
  ------------------------------ */
  const hud = {
    hp: document.getElementById("hudHP"),
    bp: document.getElementById("hudBP"),
    gc: document.getElementById("hudGC"),
    warn: document.getElementById("hudWarn")
  };

  let hp = 100;
  let bp = 0;
  let gc = 0;
  let isDead = false;

  /* ------------------------------
     Helpers
  ------------------------------ */
  function updateHUD() {
    if (!hud.hp) return;
    let hpMarkup;
    if (hp <= 2) hpMarkup = `<span class="low">${hp} HP</span>`;
    else if (hp <= 25) hpMarkup = `<span class="mid">${hp} HP</span>`;
    else hpMarkup = `<span class="ok">${hp} HP</span>`;
    safeTrustedHTML(hud.hp, hpMarkup);
    if (hud.bp) safeSetText(hud.bp, `${bp} BP`);
    if (hud.gc) safeSetText(hud.gc, `${gc} GC`);
  }

  function showWarning(msg, cssClass="warn") {
    if (!hud.warn) return;
    const markup = `<span class="${cssClass}">${window.safeStripTags(msg)}</span>`;
    safeTrustedHTML(hud.warn, markup);
    setTimeout(()=> safeSetText(hud.warn,""), 1200);
  }

  /* ------------------------------
     Damage & Game-Over handling
  ------------------------------ */
  function applyDamage(amount) {
    if (isDead) return;
    hp -= amount;
    if (hp < 0) hp = 0;
    updateHUD();

    if (hp <= 2 && !isDead) {
      showWarning("LOW HP!");
    }
    if (hp <= 0) handleDeath();
  }

  function handleDeath() {
    isDead = true;
    showWarning("You died!", "dead");
    // stop movement / loop
    if (window.stopGameLoop) window.stopGameLoop();
  }

  /* ------------------------------
     Game loop stubs
  ------------------------------ */
  window.startGame = function(){
    isDead = false;
    hp = 100;
    updateHUD();
    if (window.startGameLoop) window.startGameLoop();
  };

  window.takeBlueZoneDamage = function(){
    applyDamage(1);
  };

  // expose for debugging
  window.applyDamage = applyDamage;
  window.updateHUD = updateHUD;

})(); // end IIFE

} // end duplicate-load guard
