(function () {
  var STORAGE_KEY = 'pubgTheme';
  var DEFAULT = 'phantom';
  var BACKGROUND_KEY = 'pubgBackgroundEffects';
  var THEMES = ['phantom', 'cyber', 'red', 'green', 'gold', 'void', 'ember', 'synthwave', 'arctic', 'orange'];
  function valid(name) { return THEMES.indexOf(name) !== -1 ? name : DEFAULT; }
  function getSaved() {
    try { return valid(localStorage.getItem(STORAGE_KEY)); } catch (e) { return DEFAULT; }
  }
  function getBackgroundEffects() {
    try { return localStorage.getItem(BACKGROUND_KEY) === 'true'; } catch (e) { return false; }
  }
  function applyBackgroundEffects(enabled, persist) {
    document.documentElement.classList.toggle('background-effects-off', !enabled);
    document.querySelectorAll('.theme-background-input').forEach(function (input) { input.checked = enabled; });
    if (persist) { try { localStorage.setItem(BACKGROUND_KEY, String(enabled)); } catch (e) {} }
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
  applyBackgroundEffects(getBackgroundEffects(), false);
  document.addEventListener('DOMContentLoaded', function () {
    var host = document.querySelector('.theme-switcher, .privacy-nav, .clan-hero .controls, .nav-panel') || document.querySelector('.clan-hero .hero-body');
    if (host) {
      var label = document.createElement('label');
      label.className = 'theme-background-toggle';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'theme-background-input';
      input.checked = getBackgroundEffects();
      input.addEventListener('change', function () { applyBackgroundEffects(this.checked, true); });
      var caption = document.createElement('span');
      caption.textContent = 'Show background effects';
      label.appendChild(input);
      label.appendChild(caption);
      host.appendChild(label);
    }
    document.querySelectorAll('.theme-swatch').forEach(function (btn) {
      var label = btn.getAttribute('title') || btn.dataset.theme || 'Theme';
      btn.setAttribute('aria-label', 'Use ' + label + ' theme');
      btn.addEventListener('click', function () { applyTheme(this.dataset.theme, true); });
    });
    applyTheme(getSaved(), false);
    applyBackgroundEffects(getBackgroundEffects(), false);
  });
  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY || event.key === null) applyTheme(getSaved(), false);
    if (event.key === BACKGROUND_KEY || event.key === null) applyBackgroundEffects(getBackgroundEffects(), false);
  });
})();
