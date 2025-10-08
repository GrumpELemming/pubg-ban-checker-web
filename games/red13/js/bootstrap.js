// duplicate-load guard
if(window.__BOOTSTRAP_LOADED__){console.warn('BOOTSTRAP loaded twice')}else{window.__BOOTSTRAP_LOADED__=true;
window.addEventListener("DOMContentLoaded", () => {
    const intro  = document.getElementById('intro');
    const menu   = document.getElementById('menu');
    const crates = document.getElementById('crates');
    const how    = document.getElementById('how');
    const about  = document.getElementById('about');

    // Intro → Menu
    intro.addEventListener('click', () => {
      intro.classList.add('hidden');
      menu.classList.remove('hidden');
    });

    // Start + Crates
    document.getElementById('btnStart').addEventListener('click', () => menu.classList.add('hidden'));
    document.getElementById('btnCrates').addEventListener('click', () => {
      menu.classList.add('hidden');
      crates.classList.remove('hidden');
    });

    // Back from Crates
    document.getElementById('btnBackOps').addEventListener('click', () => {
      crates.classList.add('hidden');
      menu.classList.remove('hidden');
      const crateImg = document.getElementById('crateImg');
      if (crateImg) crateImg.style.opacity = "0";
    });

    // How To Play + About
    const btnHow = document.getElementById('btnHow');
    const btnAbout = document.getElementById('btnAbout');
    const btnBackFromHow = document.getElementById('btnBackFromHow');
    const btnBackFromAbout = document.getElementById('btnBackFromAbout');

    if (btnHow) btnHow.addEventListener('click', () => {
      menu.classList.add('hidden');
      how.classList.remove('hidden');
    });

    if (btnAbout) btnAbout.addEventListener('click', () => {
      menu.classList.add('hidden');
      about.classList.remove('hidden');
    });

    if (btnBackFromHow) btnBackFromHow.addEventListener('click', () => {
      how.classList.add('hidden');
      menu.classList.remove('hidden');
    });

    if (btnBackFromAbout) btnBackFromAbout.addEventListener('click', () => {
      about.classList.add('hidden');
      menu.classList.remove('hidden');
    });
  });

// Disable zoom (Ctrl + scroll / Ctrl + + / Ctrl + - / Ctrl + 0)
  window.addEventListener('wheel', e => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
      e.preventDefault();
    }
  });
}// end guard
