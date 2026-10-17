/* Translate authored UI text while preserving markup, identifiers and stored values. */
(() => {
  'use strict';
  const normalize = text => String(text).replace(/\s+/g, ' ').trim();
  const phrases = window.PBC_PHRASES || {};
  for (const type of ['keydown', 'keyup', 'click', 'mousedown', 'mouseup']) window.addEventListener(type, event => {
    if (event.target.closest?.('.lang-switch')) event.stopImmediatePropagation();
  }, true);
  const sources = new Map(Object.keys(phrases).map(source => [normalize(source).toLowerCase(), source]));
  const templates = Object.keys(phrases).filter(source => /\{\d+\}/.test(source)).map(source => {
    const slots = [];
    const escaped = source.split(/(\{\d+\})/).map(part => {
      if (/^\{\d+\}$/.test(part)) { slots.push(part); return '(.+?)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    return { source, slots, pattern: new RegExp(`^${escaped}$`, 'i') };
  }).sort((a, b) => b.source.replace(/\{\d+\}/g, '').length - a.source.replace(/\{\d+\}/g, '').length);
  const records = new WeakMap();
  const attributes = ['title', 'aria-label', 'alt', 'placeholder', 'data-tooltip', 'data-track-label'];
  const protectedSelector = 'script, style, code, pre, [translate="no"], [data-i18n-ignore], .lang-switch select, .wl-name-line strong, .wl-platform-badge, #nameChangeText, #watchlistAccountName[data-user-name="true"]';
  function translate(source, lang = getCurrentLang(), depth = 0) {
    const text = normalize(source);
    if (lang === 'en' || !text) return String(source);
    const exact = phrases[text] ? text : sources.get(text.toLowerCase());
    if (exact) return phrases[exact][lang] || text;
    for (const template of templates) {
      const match = template.pattern.exec(text);
      if (!match) continue;
      let output = phrases[template.source][lang];
      if (!output) continue;
      template.slots.forEach((slot, index) => {
        let value = match[index + 1];
        // These slots contain authored status/item labels, not player names.
        if (depth < 2 && ((template.source === 'Checked {0}: {1}.' && slot === '{1}') || template.source === 'Crate {0}: {1}' && slot === '{1}' || template.source === 'Use {0} theme' || /^(?:Scrap|Scrapped) \{0\} for \{1\} BP/.test(template.source) && slot === '{0}')) value = translate(value, lang, depth + 1);
        output = output.split(slot).join(value);
      });
      return output;
    }
    return String(source);
  }
  window.pbcTranslate = translate;
  window.pbcCanvasText = (context, source, x, y, maxWidth) => {
    if (getCurrentLang() === 'en') {
      if (maxWidth === undefined) context.fillText(source, x, y);
      else context.fillText(source, x, y, maxWidth);
      return;
    }
    const translated = translate(source);
    context.save();
    context.direction = getCurrentLang() === 'ar' ? 'rtl' : 'ltr';
    const transform = context.getTransform();
    const width = transform.a > 0 ? (context.canvas.width - transform.e) / transform.a : context.canvas.width;
    const alignment = context.textAlign;
    const available = alignment === 'center' ? 2 * Math.min(x, width - x) : alignment === 'right' || alignment === 'end' ? x : width - x;
    context.fillText(translated, x, y, maxWidth || Math.max(20, available - 12));
    context.restore();
  };
  window.pbcLocale = () => getCurrentLang() === 'en' ? 'en-GB' : getCurrentLang();
  const legacyTranslate = window.tr;
  window.tr = key => {
    const dict = TRANSLATIONS[getCurrentLang()] || TRANSLATIONS.en;
    const source = TRANSLATIONS.en[key];
    if (source && phrases[source]?.[getCurrentLang()]) return phrases[source][getCurrentLang()];
    return dict[key] || translate(source || legacyTranslate(key));
  };
  function updateValue(node, key, read, write) {
    let record = records.get(node);
    if (!record) { record = {}; records.set(node, record); }
    const current = read();
    if (!record[key] || current !== record[key].output) record[key] = { source: current };
    const source = record[key].source;
    const translated = translate(source);
    // Preserve whitespace between inline links, emphasis and surrounding text.
    const output = translated === source ? source : `${source.match(/^\s*/)[0]}${translated}${source.match(/\s*$/)[0]}`;
    record[key].output = output;
    if (current !== output) write(output);
  }
  function visit(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      const parent = root.parentElement;
      if (parent && !parent.closest(`${protectedSelector}, [data-i18n]`)) updateValue(root, 'text', () => root.nodeValue, value => { root.nodeValue = value; });
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root !== document) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (root.matches(protectedSelector) || root.closest('[translate="no"], [data-i18n-ignore]')) return;
      for (const attr of attributes) if (root.hasAttribute(attr)) updateValue(root, attr, () => root.getAttribute(attr), value => root.setAttribute(attr, value));
      if (root.matches('meta[name="description"], meta[property="og:title"], meta[property="og:description"]')) updateValue(root, 'content', () => root.content, value => { root.content = value; });
    }
    for (const child of root.childNodes) visit(child);
  }
  let observer;
  window.pbcTranslatePage = () => {
    observer?.disconnect();
    document.documentElement.lang = getCurrentLang();
    document.documentElement.dir = getCurrentLang() === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el => { const value = window.tr(el.dataset.i18n); if (el.textContent !== value) el.textContent = value; });
    visit(document);
    observer?.observe(document.documentElement, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: [...attributes, 'content'] });
    window.dispatchEvent(new CustomEvent('pbc:language-change', { detail: { lang: getCurrentLang() } }));
  };
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('.lang-switch')) {
      const container = document.createElement('div');
      container.className = 'lang-switch site-language-switch';
      const label = document.createElement('label');
      label.htmlFor = 'siteLanguage'; label.dataset.i18n = 'nav.lang'; label.textContent = window.tr('nav.lang');
      const select = document.createElement('select'); select.id = 'siteLanguage';
      container.append(label, select);
      (document.querySelector('.privacy-nav, .nav-panel, header') || document.body).prepend(container);
      buildLangSelector();
    }
    document.querySelectorAll('.lang-switch select').forEach(select => {
      const group = document.createElement('span');
      group.className = 'language-select-group';
      select.before(group);
      group.append(select);
      const credit = document.createElement('span');
      credit.className = 'korean-language-credit';
      credit.setAttribute('translate', 'no');
      credit.lang = 'ko';
      credit.textContent = '제작지원 백뚤기';
      group.append(credit);
    });
    observer = new MutationObserver(mutations => {
      observer.disconnect();
      for (const mutation of mutations) {
        if (mutation.type === 'childList') for (const node of mutation.addedNodes) visit(node);
        else visit(mutation.target);
      }
      observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: [...attributes, 'content'] });
    });
    window.pbcTranslatePage();
  });
  window.addEventListener('storage', event => { if (event.key === 'siteLang') applyTranslations(getCurrentLang()); });
})();
