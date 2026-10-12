const fs = require('node:fs');
const acorn = require('acorn');
const walk = require('acorn-walk');
function transform(source) {
  const ast = acorn.parse(source, { ecmaVersion:'latest' });
  const edits = [];
  walk.simple(ast, {
    CallExpression(node) {
      if (node.callee.type !== 'MemberExpression' || !['fillText', 'measureText'].includes(node.callee.property.name)) return;
      const context = source.slice(node.callee.object.start, node.callee.object.end);
      const args = node.arguments.map(argument => source.slice(argument.start, argument.end));
      if (node.callee.property.name === 'fillText') {
        edits.push([node.start, node.end, `window.pbcCanvasText(${context}, ${args.join(', ')})`]);
      } else {
        edits.push([node.arguments[0].start, node.arguments[0].end, `window.pbcTranslate(${args[0]})`]);
      }
    }
  });
  for (const [start, end, replacement] of edits.sort((a,b) => b[0]-a[0])) source = source.slice(0,start)+replacement+source.slice(end);
  return source;
}
for (const file of ['js/pubg-mini.js','red13/js/game.js','shne/game.js']) fs.writeFileSync(file, transform(fs.readFileSync(file,'utf8')));
for (const file of ['hangman.html','bluemem/bluemem.html']) {
  let source = fs.readFileSync(file,'utf8');
  source = source.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g, (match, open, code, close) => open+(code.trim()?transform(code):code)+close);
  fs.writeFileSync(file,source);
}
