const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const modules = ['governor/contextGovernor','governor/evidenceSafetyGate','governor/evidencePolicy','governor/intentExtractor','cache/schemaMinifier','cache/normalizer','cache/blobAstCache','ast/pruner','ast/treeShaker','engine/tokenizer','engine/ramManager','search/invertedIndex','security/sanitizer','security/anonymizedLogger','compression/observationMasking','engine/agenticCompactor','metrics/circuitBreaker','workspace/workspaceIndex','workspace/exactSourceReader','engine/scratchpadManager','protocol/canonicalCompiler','engine/pipelineOrchestrator','engine/featureFlags'];
modules.push('workspace/semanticChunk','governor/inlineEvidenceClassifier','ignore/tokenIgnore','cache/providerCapabilities');
async function main() {
 const patched = process.argv.includes('--patched');
 const sourceRoot = patched ? path.join(__dirname,'staged/src') : path.join(root,'src');
 const output = path.join(__dirname, patched?'probes-patched.js':'probes-baseline.js');
 await esbuild.build({stdin:{contents:modules.map(m=>`export * from ${JSON.stringify(path.join(sourceRoot,m))};`).join('\n'),resolveDir:root,loader:'ts'},outfile:output,bundle:true,platform:'node',format:'cjs',target:'node20',alias:{vscode:path.join(root,'tests/mock-vscode.ts')},external:['@vscode/tree-sitter-wasm'],logLevel:'silent'});
 const m = require(output), results=[];
 function probe(id, run) { try { const observed=run(); results.push({id,...observed}); } catch(e) {results.push({id,error:String(e.stack)});} }
 const governor=m.DeterministicContextGovernor.getInstance();
 probe('BUG-GOV-01',()=>{
  const real=Date.now; let a,b; try {Date.now=()=>100;a=governor.evaluateContext({userPrompt:'refactor service'});Date.now=()=>200;b=governor.evaluateContext({userPrompt:'refactor service'});}finally{Date.now=real;}
  const same=JSON.stringify(a)===JSON.stringify(b);
  a.requiredEvidence.length=0;
  const next=governor.evaluateContext({userPrompt:'refactor service'});
  return {defect:!same || next.requiredEvidence.length===0,same,requirementsAfterCallerMutation:next.requiredEvidence.length};
 });
 probe('BUG-GOV-02',()=>{const audit=m.EvidenceSafetyGate.auditEvidence([{category:'tests',priority:'high',reason:'regression'}],[]);return {defect:audit.passed,audit};});
 probe('BUG-SCHEMA-01',()=>{const schema={name:'x',inputSchema:{type:'object',additionalProperties:false,properties:{mode:{type:'string',enum:['a','b','c','d'],minLength:1},default:{type:'string'},description:{type:'string'},title:{type:'string'}},required:['mode','default','description','title']}};const actual=JSON.parse(m.ToolSchemaMinifier.minifyToolSchemas(schema,'high').minifiedSchema);return {defect:!require('util').isDeepStrictEqual(actual,schema),actual};});
 probe('BUG-CACHE-01',()=>{const a={name:'x',inputSchema:{type:'string',format:'email'}};const b={inputSchema:{format:'email',type:'string'},name:'x'};const left=m.ToolSchemaMinifier.minifyToolSchemas(a).minifiedSchema,right=m.ToolSchemaMinifier.minifyToolSchemas(b).minifiedSchema;return {defect:left!==right,left,right};});
 probe('BUG-CACHE-02',()=>{const input='const pattern = /foo\\s+bar/;\nconst separator = "hello\\nworld";\nTimestamp: retain this required event';const actual=m.CacheNormalizer.normalizeCacheableText(input);return {defect:actual!==input,input,actual};});
 const engine=new m.AstPrunerEngine();
 const code='export interface User {\n  id: number;\n  name: string;\n}\n\nexport class Account {\n  balance: number = 0;\n  deposit(amount: number) {\n    this.balance += amount;\n    return this.balance;\n  }\n}\n';
 probe('BUG-AST-01',()=>{const actual=engine.pruneCodeContext(code,'typescript',{structuralTier:'T0',bypassCache:true}); const ts=require('typescript');const parsed=ts.createSourceFile('x.ts',actual.prunedCode,ts.ScriptTarget.Latest,true);return {defect:parsed.parseDiagnostics.length>0,actual:actual.prunedCode,parseErrors:parsed.parseDiagnostics.map(d=>d.messageText)};});
 probe('BUG-AST-02',()=>{const moduleCode='export function target() { return helper(); }\n\nfunction helper() { return 42; }\n\nexport * from "./contracts";\n\nconst sideEffect = import("./register");';const actual=m.DependencyTreeShaker.sliceModuleContext(moduleCode,['target']);return {defect:!actual.shakenCode.includes('function helper')||!actual.shakenCode.includes('export *'),actual};});
 probe('BUG-AST-03',()=>{const input='\n'.repeat(15)+'package main\n\nfunc foo[T interface { Name() string }](x T) string {\n return x.Name()\n}\n'+'// notes '.repeat(30);const actual=engine.pruneCodeContext(input,'go',{bypassCache:true});return {defect:actual.prunedCode!==input,actual:actual.prunedCode};});
 probe('BUG-MEM-01',()=>{const c=new m.BlobAstCache({maxMemoryBytes:1024}); c.set('large',{prunedCode:'x'.repeat(4000),originalTokenCount:1000,prunedTokenCount:1000,reductionPercentage:0,language:'typescript',wasPruned:false,durationMs:1});return {defect:c.getStats().memoryBytes>1024,stats:c.getStats()};});
 probe('BUG-MEM-02',()=>{const idx=new m.InvertedPostingsIndex();for(let i=0;i<40000;i++)idx.addDocument('same',['alpha']);return {defect:idx.docIndexToId.length>1,live:idx.getDocCount(),allocatedSlots:idx.docIndexToId.length,scoreBytes:idx.scoreBuf.byteLength};});
 probe('BUG-SEC-01',()=>{const key='sk-proj-'+ 'Q7v9Rt2Z'.repeat(5);const payloads=['password=defaultProd2026!','password=abcd1234',JSON.stringify({password:'short'}),key.split('').map(c=>'%'+c.charCodeAt(0).toString(16)).join(''),Buffer.from(key).toString('base64'),'-----BEGIN ENCRYPTED PRIVATE KEY-----\n'+'QUJD'.repeat(12)+'\n-----END ENCRYPTED PRIVATE KEY-----'];const actual=payloads.map(x=>({input:x,...m.SecuritySanitizer.sanitizeSecrets(x)}));return {defect:actual.some(x=>x.input===x.sanitized),actual};});
 probe('BUG-LOG-01',()=>{const logger=new m.AnonymizedLogger();const actual=logger.sanitize('at load (/srv/private-customer/service.ts:42:1)');return {defect:actual.includes('/srv/private-customer'),actual};});
 probe('BUG-COMP-01',()=>{const content=[...Array(20).fill('ok'), 'panic: database corruption',' at save (app.ts:22:1)','exit code: 1',...Array(20).fill('ok')].join('\n');const actual=m.AgenticToolCompactor.maskHeadTail(content);return {defect:!actual.includes('panic:')||!actual.includes('exit code: 1'),actual};});
 probe('BUG-COMP-02',()=>{const messages=Array.from({length:7},(_,i)=>({role:'user',parts:[{kind:'tool_result',callId:String(i),content:[{kind:'text',text:(i===0?'panic: essential failure\n':'')+'evidence '.repeat(550)}]}]}));const earlier=m.maskObservations(messages.slice(0,6));const later=m.maskObservations(messages);return {defect:later.applied,earlier:earlier.maskedCount,later:later.maskedCount,firstText:later.messages[0].parts[0].content[0].text};});
 probe('BUG-LIMIT-01',()=>{const cb=new m.AgenticCircuitBreaker(50);cb.evaluateTurn(NaN,'a');const actual=cb.evaluateTurn(100000,'b');return {defect:!actual.tripped,actual};});
 probe('BUG-AST-05',()=>{const code='export function save() {\n /* multiline comment\n }\n */\n criticalWrite();\n}\n';const ranges=m.extractChunkRanges(code,[{name:'save',kind:'function',line:1}],{fileKey:'a',relativePath:'a.ts',language:'ts',sourceVersion:'v1',snapshotGeneration:1});const actual=m.rehydrateExact(ranges[0],'a.ts',{read:()=>code});return {defect:actual.status==='exact'&&!actual.text.includes('criticalWrite'),range:ranges[0],actual};});
 probe('BUG-CACHE-03',()=>{const actual=m.ProviderCacheRegistry.resolve('claude-3-5-haiku','anthropic');return {defect:actual.minCacheableTokens!==2048,actual};});
 probe('BUG-REGEX-02',()=>{let actual;try{actual=require('child_process').execFileSync(process.execPath,[path.join(__dirname,'glob-probe.cjs'),output],{encoding:'utf8',timeout:1500});return {defect:false,actual};}catch(e){return {defect:e.code==='ETIMEDOUT',code:e.code};}});
 const orchestrator=new m.PipelineOrchestrator(engine);
 try {const result=await orchestrator.compileContext({messages:[{role:'user',content:'Debug this failure'}],deferSideEffects:true});results.push({id:'BUG-GOV-02-END-TO-END',defect:true,returned:result.optimizedMessages});}catch(e){results.push({id:'BUG-GOV-02-END-TO-END',defect:!String(e).includes('REQUIRED_EVIDENCE_MISSING'),error:String(e)});}
 let forwarded;
 const compiler=new m.CanonicalRequestCompiler({compileContext:async request=>{forwarded=request;return {optimizedMessages:request.messages,receipts:[]}}});
 const signal={snapshotGeneration:1,capturedAt:1,diagnostics:[{filePath:'x.ts',line:1,message:'TS1000',severity:'error',category:'syntax'}]};
 const compiled=await compiler.compile({messages:[{role:'user',parts:[{kind:'text',text:'Explain x'}]}],signalSnapshot:signal});
 compiler.abandon(compiled);
 results.push({id:'BUG-GOV-03',defect:forwarded.signalSnapshot!==signal,signalForwarded:!!forwarded.signalSnapshot});
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tokonomics-static-audit-'));
 try {
  const file=path.join(temp,'a.ts');fs.writeFileSync(file,code);
  const ram=new m.RamContextManager(engine,{ramBudgetMB:1});
  await ram.warmWorkspace(temp);const one=ram.getStats();await ram.warmWorkspace(temp);const two=ram.getStats();
  results.push({id:'BUG-MEM-03',defect:two.symbolsIndexed>one.symbolsIndexed,one,two});
  const index=new m.VersionedWorkspaceIndex([temp],engine,{trusted:true});await index.initialize();const before=index.captureSnapshot();fs.writeFileSync(file,code+'\nexport function added() {return 1;}');
  if(patched){index.scheduleUpsert(file);await new Promise(r=>setTimeout(r,150));}
  const after=await index.ensureInitialized();results.push({id:'BUG-IDX-01',defect:before.generation===after.generation,before:before.generation,after:after.generation,patchedTest:'simulate the newly registered filesystem callback'});
  const originalRead=fs.promises.readFile;let unblock,started;const startSignal=new Promise(r=>started=r);const barrier=new Promise(r=>unblock=r);
  fs.promises.readFile=async(...args)=>{started();await barrier;return originalRead(...args)};
  try {const pending=index.upsert(file);await startSignal;index.dispose();const generation=index.captureSnapshot().generation;unblock();await pending;results.push({id:'BUG-IDX-02',defect:index.captureSnapshot().generation!==generation,before:generation,after:index.captureSnapshot().generation});}finally {fs.promises.readFile=originalRead;}
  const scratch=new m.ScratchpadManager(temp);fs.mkdirSync(path.join(temp,'.tokenopt'),{recursive:true});fs.writeFileSync(path.join(temp,'.tokenopt/scratchpad.json'),'null');probe('BUG-SCRATCH-01',()=>{try {scratch.generatePromptDigest(scratch.readState());return {defect:false};}catch(e){return {defect:true,error:String(e)};}});
 } finally { fs.rmSync(temp,{recursive:true,force:true}); }
 await engine.initialize(root);
 probe('BUG-AST-04',()=>{const js='class Account {\n constructor() { this.balance = 0; }\n deposit(amount) {\n this.balance += amount;\n return this.balance;\n }\n}\n'+'// documentation '.repeat(20);const actual=engine.pruneCodeContext(js,'javascript',{bypassCache:true});let error;try {new vm.Script(actual.prunedCode);}catch(e){error=String(e)}return {defect:!!error,treeSitter:engine.hasTreeSitterActive(),actual:actual.prunedCode,error};});
 fs.writeFileSync(path.join(__dirname,patched?'reproductions-patched.json':'reproductions.json'),JSON.stringify(results,null,2));
 for(const row of results)console.log(row.id, row.defect===true?'REPRODUCED':row.defect===false?'NOT PRESENT':'PROBE ERROR');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
