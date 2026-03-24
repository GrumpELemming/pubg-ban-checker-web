(function () {
  var STORAGE_KEY = 'pubgTheme';
  var DEFAULT = 'cyber';

  function getSaved() {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT; } catch (e) { return DEFAULT; }
  }

  function applyTheme(name) {
    var html = document.documentElement;
    ['red','green','phantom','gold','void','ember','synthwave','arctic','orange'].forEach(function(t) {
      html.classList.remove('theme-' + t);
    });
    if (name !== DEFAULT) html.classList.add('theme-' + name);
    try { localStorage.setItem(STORAGE_KEY, name); } catch (e) {}
    document.querySelectorAll('.theme-swatch').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.theme === name);
    });
  }

  // Apply immediately to avoid flash
  var saved = getSaved();
  if (saved !== DEFAULT) document.documentElement.classList.add('theme-' + saved);

  document.addEventListener('DOMContentLoaded', function () {
    // Set initial active state
    document.querySelectorAll('.theme-swatch').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.theme === saved);
      btn.addEventListener('click', function () {
        applyTheme(this.dataset.theme);
      });
    });
  });
})();
