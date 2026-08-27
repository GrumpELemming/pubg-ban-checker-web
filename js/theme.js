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
      var selected = btn.dataset.theme === name;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
  }

  // Apply immediately to avoid flash
  var saved = getSaved();
  if (saved !== DEFAULT) document.documentElement.classList.add('theme-' + saved);

  document.addEventListener('DOMContentLoaded', function () {
    // Set initial active state
    document.querySelectorAll('.theme-swatch').forEach(function(btn) {
      var label = btn.getAttribute('title') || btn.dataset.theme || 'Theme';
      var selected = btn.dataset.theme === saved;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-label', 'Use ' + label + ' theme');
      btn.setAttribute('aria-pressed', String(selected));
      btn.addEventListener('click', function () {
        applyTheme(this.dataset.theme);
      });
    });
  });
})();
