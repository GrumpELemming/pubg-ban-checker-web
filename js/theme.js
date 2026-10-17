(function () {
  var STORAGE_KEY = 'pubgTheme';
  var DEFAULT = 'phantom';
  var THEMES = ['phantom', 'cyber', 'red', 'green', 'gold', 'void', 'ember', 'synthwave', 'arctic', 'orange'];
  function valid(name) { return THEMES.indexOf(name) !== -1 ? name : DEFAULT; }
  function getSaved() {
    try { return valid(localStorage.getItem(STORAGE_KEY)); } catch (e) { return DEFAULT; }
  }
  function applyTheme(name, persist) {
    name = valid(name);
    THEMES.forEach(function (theme) { document.documentElement.classList.remove('theme-' + theme); });
    document.documentElement.classList.add('theme-' + name);
    if (persist) { try { localStorage.setItem(STORAGE_KEY, name); } catch (e) {} }
    document.querySelectorAll('.theme-swatch').forEach(function (btn) {
      var selected = btn.dataset.theme === name;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
  }
  applyTheme(getSaved(), false);
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.theme-swatch').forEach(function (btn) {
      var label = btn.getAttribute('title') || btn.dataset.theme || 'Theme';
      btn.setAttribute('aria-label', 'Use ' + label + ' theme');
      btn.addEventListener('click', function () { applyTheme(this.dataset.theme, true); });
    });
    applyTheme(getSaved(), false);
  });
  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY || event.key === null) applyTheme(getSaved(), false);
  });
})();
