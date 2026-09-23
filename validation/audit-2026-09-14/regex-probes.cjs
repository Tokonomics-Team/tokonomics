const fs=require('fs'),path=require('path');
const {Worker,isMainThread,parentPort}=require('worker_threads');
if(!isMainThread){
 parentPort.on('message', ({pattern})=>{
  const regex=Function('return ('+pattern+')')();
  const seeds=['a',' ','a ','secret','-----BEGIN PRIVATE KEY-----\n','/*','at a ','a/','a\\','"','\n','/ ','a:','-','export ','abc_'];
  const timings=[];
  for(const seed of seeds){
   const row={seed};
   for(const n of [4096,16384]){
    const text=seed.repeat(Math.ceil(n/seed.length)).slice(0,n)+'!';
    regex.lastIndex=0;const start=performance.now();regex.test(text);row[n]=performance.now()-start;
   }
   timings.push(row);
  }
  parentPort.postMessage(timings);
 });
} else {
 const patched=process.argv.includes('--patched');
 const inventory=JSON.parse(fs.readFileSync(path.join(__dirname,'inventory.json'),'utf8'));
 if(patched) inventory.regexes=JSON.parse(fs.readFileSync(path.join(__dirname,'regex-fixes.json'),'utf8')).map(row=>({...row,pattern:row.after}));
 const prefix=patched?'patched-':'';
 const literals=inventory.regexes.filter(x=>x.kind==='literal');
 const unique=[...new Map(literals.map(r=>[r.pattern,r])).values()];
 let next=0;const result=new Map();
 async function run(){
  let worker;
  while(next<unique.length){
   const row=unique[next++];
   if(!worker)worker=new Worker(__filename);
   const timings=await new Promise(resolve=>{
    const timer=setTimeout(()=>{worker.removeAllListeners();worker.terminate();worker=undefined;resolve('timeout');},1500);
    worker.once('message',v=>{clearTimeout(timer);resolve(v)});
    worker.once('error',e=>{clearTimeout(timer);resolve({error:String(e)})});
    worker.postMessage({pattern:row.pattern});
   });
   if(worker)worker.removeAllListeners('error');
   result.set(row.pattern,timings);
  }
  if(worker)await worker.terminate();
 }
 Promise.all([run(),run(),run(),run()]).then(()=>{
  const output=inventory.regexes.map(row=>({...row,probe:result.get(row.pattern)??'dynamic expression; source review required'}));
  fs.writeFileSync(path.join(__dirname,prefix+'regex-probes.json'),JSON.stringify(output,null,2));
  const suspect=output.filter(row=>row.probe==='timeout'||Array.isArray(row.probe)&&row.probe.some(t=>t[16384]>30&&t[16384]/Math.max(.01,t[4096])>8));
  fs.writeFileSync(path.join(__dirname,prefix+'regex-suspects.json'),JSON.stringify(suspect,null,2));
  console.log(JSON.stringify(suspect.map(x=>({file:x.file,line:x.line,pattern:x.pattern,probe:x.probe==='timeout'?'timeout':x.probe.filter(t=>t[4096]>20)})),null,2));
 });
}
