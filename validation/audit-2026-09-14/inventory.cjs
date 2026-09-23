const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const ts = require('typescript');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const files = cp.execFileSync('git', ['ls-files', '-z'], {cwd:root, encoding:'utf8'}).split('\0').filter(Boolean);
const inventory = [], regexes = [], imports = [], operations = [];
for (const file of files) {
  if (!/\.(?:[cm]?js|tsx?|json|md|ps1)$/.test(file) && !['.vscodeignore'].includes(file)) continue;
  const bytes = fs.readFileSync(path.join(root, file));
  const source = bytes.toString('utf8');
  inventory.push({file, bytes:bytes.length, lines:source.split('\n').length, sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  if (!/\.(?:[cm]?js|tsx?)$/.test(file)) continue;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const loc = node => ({file, line:sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1});
  function visit(node) {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) regexes.push({...loc(node), kind:'literal', pattern:node.getText(sf)});
    if ((ts.isNewExpression(node) || ts.isCallExpression(node)) && node.expression.getText(sf) === 'RegExp') regexes.push({...loc(node), kind:'constructor', pattern:node.getText(sf)});
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) imports.push({...loc(node), module:node.moduleSpecifier.text, typeOnly:!!node.importClause?.isTypeOnly});
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(sf);
      if (/^(?:require|import)$/.test(name)) imports.push({...loc(node), module:node.arguments[0]?.text ?? node.arguments[0]?.getText(sf), kind:name});
      if (/onDid|watch|\.on$|Sync$|setTimeout|setInterval|sendRequest|spawn|fetch|request$|connect$/.test(name)) operations.push({...loc(node), call:name, arguments:node.arguments.map(a=>a.getText(sf).slice(0,180))});
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  // Inline webview programs are code inside HTML templates, not TS regex nodes.
  // Keep their source spelling and exact source lines separately; template escaping applies at runtime.
  for (const script of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const offset=script.index+script[0].indexOf('>')+1;
    const embedded=ts.createSourceFile(file+'.embedded.js',script[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    function embeddedVisit(node){
      if(node.kind===ts.SyntaxKind.RegularExpressionLiteral || ((ts.isNewExpression(node)||ts.isCallExpression(node))&&node.expression.getText(embedded)==='RegExp')) {
        regexes.push({file,line:source.slice(0,offset+node.getStart(embedded)).split('\n').length,kind:'embedded-template',pattern:node.getText(embedded)});
      }
      ts.forEachChild(node,embeddedVisit);
    }
    embeddedVisit(embedded);
  }
}
async function main() {
  const build = await esbuild.build({absWorkingDir:root,entryPoints:['src/extension.ts'],bundle:true,write:false,metafile:true,external:['vscode'],platform:'node',format:'cjs',target:'node20',minify:true,logLevel:'silent'});
  fs.writeFileSync(path.join(__dirname,'bundle-metafile.json'), JSON.stringify(build.metafile,null,2));
  const reachable = Object.keys(build.metafile.inputs);
  const result = {commit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(), inventory, regexes, imports, operations, reachable};
  fs.writeFileSync(path.join(__dirname,'inventory.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({files:inventory.length,sourceFiles:inventory.filter(x=>x.file.startsWith('src/')).length,sourceLines:inventory.filter(x=>x.file.startsWith('src/')).reduce((s,x)=>s+x.lines,0),regexes:regexes.length,sourceRegexes:regexes.filter(x=>x.file.startsWith('src/')).length,reachable:reachable.length,evaluation:reachable.filter(x=>/validation|evaluation|benchmarks/.test(x)),validationImports:imports.filter(x=>x.file.startsWith('src/') && /validation/.test(x.module))},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
