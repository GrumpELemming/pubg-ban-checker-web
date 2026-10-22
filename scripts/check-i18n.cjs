const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/i18n-catalog.js','utf8'), context);
const phrases = context.window.PBC_PHRASES;
const languages = ['en','ko','zh','de','fi','pl','ru','tr','hy','ar','cy'];
const normalize = source => source.replace(/&amp;/g,'&').replace(/&nbsp;/g,'\u00a0').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
const catalogSources = new Set(Object.keys(phrases).map(normalize));
const exemptions = new Set(JSON.parse(fs.readFileSync('locales/exemptions.json','utf8')).map(row => normalize(row.source)));
const errors = [];
for (const [source, values] of Object.entries(phrases)) {
  const slots = (source.match(/\{\d+\}/g) || []).sort().join(',');
  for (const lang of languages) {
    const value = values[lang];
    if (!value?.trim()) { errors.push(`${lang}: missing ${source}`); continue; }
    if ((value.match(/\{\d+\}/g)||[]).sort().join(',') !== slots) errors.push(`${lang}: changed placeholders in ${source}`);
    if (value.includes('\u2047') || value.includes('<unk>')) errors.push(`${lang}: unknown character token in ${source}`);
  }
}
for (const row of JSON.parse(fs.readFileSync('translation-audit.json','utf8'))) {
  const source = normalize(row.source);
  if (!catalogSources.has(source) && !exemptions.has(source)) errors.push(`Uncatalogued UI source: ${row.source} (${row.files.join(', ')})`);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`All ${Object.keys(phrases).length} phrases cover ${languages.length} languages; placeholders and source inventory verified.`);
