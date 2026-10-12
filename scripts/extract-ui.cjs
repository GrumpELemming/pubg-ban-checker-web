const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const vm = require('node:vm');
const entries = new Map();
function add(text, file) {
  text = text.replace(/\s+/g, ' ').trim();
  if (!/[a-zA-Z]/.test(text) || /^(?:hero\.|results\.|watchlist\.)/.test(text)) return;
  if (!entries.has(text)) entries.set(text, new Set());
  entries.get(text).add(file);
}
function html(text, file) {
  const clean = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const match of clean.matchAll(/(?:^|>)([^<]+)(?=<|$)/g)) add(match[1], file);
  for (const match of clean.matchAll(/\s(?:aria-label|title|alt|placeholder|data-tooltip|data-track-label)="([^"]+)"/g)) add(match[1], file);
  for (const match of clean.matchAll(/<meta\b[^>]*(?:name="description"|property="og:(?:title|description)")[^>]*content="([^"]+)"/g)) add(match[1], file);
}
function js(code, file) {
  let ast;
  try { ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' }); }
  catch (error) { throw new Error(`${file}: ${error.message}`); }
  walk.ancestor(ast, {
    BinaryExpression(node, ancestors) {
      if (node.operator !== '+' || ancestors[ancestors.length - 2]?.type === 'BinaryExpression') return;
      const parts = [];
      function flatten(part) {
        if (part.type === 'BinaryExpression' && part.operator === '+') { flatten(part.left); flatten(part.right); }
        else if (part.type === 'Literal' && typeof part.value === 'string') parts.push(part.value);
        else parts.push(null);
      }
      flatten(node);
      if (!parts.some(p => p && /[A-Za-z]/.test(p))) return;
      let slot = 0;
      const value = parts.map(p => p === null ? `{${slot++}}` : p).join('');
      if (value.includes('<')) html(value, file);
      else if (/^[A-Z]/.test(value) && !/[#;]|https?:|\b(?:rgba|hsl)\(/.test(value)) add(value, file);
    },
    Literal(node, ancestors) {
      if (typeof node.value !== 'string') return;
      const parents = ancestors.slice(0, -1);
      if (parents.some(p => p.type === 'CallExpression' && p.arguments.includes(node) && ['getElementById','querySelector','querySelectorAll','classList','getAttribute','addEventListener','removeEventListener'].includes(p.callee.property?.name))) return;
      if (parents.some(p => p.type === 'CallExpression' && p.callee.type === 'MemberExpression' && p.callee.object.name === 'console')) return;
      let value = node.value;
      const uiAssignment = parents.some(p => p.type === 'AssignmentExpression' && p.left.type === 'MemberExpression' && ['textContent', 'innerHTML'].includes(p.left.property.name));
      const uiCall = parents.some(p => p.type === 'CallExpression' && /(?:Status|confirm|alert|message)/i.test(p.callee.name || p.callee.property?.name || ''));
      if ((uiAssignment || uiCall) && !value.includes('<') && /[A-Za-z]/.test(value)) add(value, file);
      if (value.includes('<')) { html(value, file); return; }
      if (/^[A-Z][A-Za-z0-9 ·!?(),:%+\/’'\-–—\[\].=]*$/.test(value) && !/^(GET|POST|PUT|DELETE|PATCH|HEAD|Accept|Content-Type|X-CSRF-Token|DOMContentLoaded|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Enter|Escape|Space|Tab|Shift|F\d+|JSON|UTF-8)$/.test(value)) add(value, file);
      if (parents.some(p => p.type === 'Property' && /^(label|name|quip|title|subtitle|message)$/.test(p.key.name || p.key.value || '')) && /[A-Za-z]/.test(value) && !/[#{}<>]/.test(value)) add(value, file);
    },
    TemplateLiteral(node) {
      const value = node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? `{${i}}` : '')).join('');
      if (value.includes('<')) { html(value, file); return; }
      if (/^[A-Z]/.test(value) && !/[#;]|https?:|\b(?:rgba|hsl)\(/.test(value)) add(value, file);
    }
  });
}
for (const directory of ['.', 'js', 'red13/js', 'bluemem', 'shne', 'red13']) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!item.isFile()) continue;
    const file = path.posix.join(directory, item.name);
    if (file === 'js/i18n.js' || file === 'playwright.config.js' || /i18n-(?:catalog|runtime)/.test(file)) continue;
    if (item.name.endsWith('.html')) {
      const source = fs.readFileSync(file, 'utf8'); html(source, file);
      const wordList = source.match(/const RAW_WORDS = `([\s\S]*?)`/);
      if (wordList) for (const word of wordList[1].split(',')) add(word, file);
      for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (match[2].trim() && !match[1].includes('ld+json')) js(match[2], file);
    } else if (item.name.endsWith('.js')) js(fs.readFileSync(file, 'utf8'), file);
  }
}
const list = [...entries].map(([source, files]) => ({ source, files: [...files] }));
const context = { window: {}, document: { addEventListener() {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/i18n.js', 'utf8')+'\nglobalThis.english = TRANSLATIONS.en;', context);
for (const source of Object.values(context.english)) if (!entries.has(source)) list.push({ source, files:['js/i18n.js'] });
fs.writeFileSync('translation-audit.json', JSON.stringify(list, null, 2) + '\n');
console.log(`${list.length} source phrases extracted.`);
