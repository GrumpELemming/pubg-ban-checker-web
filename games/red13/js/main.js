// duplicate-load guard
if(window.__MAIN_LOADED__){console.warn('MAIN loaded twice')}else{window.__MAIN_LOADED__=true;
// js/main.js — Final: Title→Menu on Enter, OPS buttons fully functional
(() => {
  // ===== Screens =====
  const screens = {
    intro: document.getElementById("intro"),
    menu: document.getElementById("menu"),
    crates: document.getElementById("crates"),
  };

  window.uiScreen = "intro";

  window.setScreen = (name) => {
  for (const key in screens) {
    if (screens[key]) screens[key].classList.toggle("hidden", key !== name);
  }
  window.uiScreen = name;

  if (name === "menu") {
    bindMenuButtons();
    if (typeof window.updateMenuStats === "function") window.updateMenuStats();
  }
};



  // ===== Menu + Crates navigation (keyboard) =====
  window.addEventListener("keydown", (e) => {
    if (window.uiScreen === "crates" && e.key === "Enter") {
      e.preventDefault();
      setScreen("menu");
    }
  });

  // ===== Menu Buttons =====
  function bindMenuButtons() {
    const btnStart = document.getElementById("btnStart");
    const btnCrates = document.getElementById("btnCrates");

    if (btnStart) {
      btnStart.onclick = () => {
        console.log("▶ Start Run clicked");
        if (window.startGameFixed && typeof window.startGameFixed === "function") {
          window.startGameFixed();
        } else if (window.startGame && typeof window.startGame === "function") {
          window.startGame();
        } else {
          console.warn("No startGameFixed() found.");
        }
      };
    }

    if (btnCrates) {
      btnCrates.onclick = () => {
        console.log("🎁 Open Crates clicked");
        setScreen("crates");
      };
    }
  }

  // ===== Focus helper =====
  const canvas = document.getElementById("game");
  if (canvas) {
    window.addEventListener("click", () => {
      try { canvas.focus(); } catch {}
    });
  }

  // initial bind
  bindMenuButtons();

  // ===== Expose for debugging =====
  window.debugScreens = screens;
})();

}// end guard
