const fs=require('fs'),path=require('path'),cp=require('child_process');
const {inspectVsix}=require('../../scripts/lib/vsix-artifact');
const root=path.resolve(__dirname,'../..');
async function main(){
 const artifact=await inspectVsix(path.join(__dirname,'candidate.vsix'));
 const forbidden=/(^|\/)(?:src|tests?|validation|scripts|out|out_test|node_modules)(?:\/|$)|(?:\.map|\.ts|\.log)$/i;
 const entries=[...artifact.entries.keys()];
 const graph=JSON.parse(fs.readFileSync(path.join(__dirname,'bundle-metafile.json'),'utf8'));
 const summary={sha256:artifact.sha256,sizeBytes:artifact.sizeBytes,entries,forbiddenEntries:entries.filter(name=>forbidden.test(name)),validationBundleInputs:Object.keys(graph.inputs).filter(name=>/^(?:validation|tests|scripts)\//.test(name)),evaluationBundleInputs:Object.keys(graph.inputs).filter(name=>name.startsWith('src/evaluation/')),outEvaluationFiles:fs.readdirSync(path.join(root,'out/evaluation')).filter(name=>name.endsWith('.js'))};
 fs.writeFileSync(path.join(__dirname,'packaging.json'),JSON.stringify(summary,null,2));
 // Build a separate full checkout snapshot for the original regression suite. Existing patched
 // files win; copy only missing tracked inputs. No production source is overwritten.
 const files=cp.execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 const stage=path.join(__dirname,'staged');
 for(const file of files){const target=path.join(stage,file);if(fs.existsSync(target))continue;fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
 fs.cpSync(path.join(root,'parsers'),path.join(stage,'parsers'),{recursive:true});
 const link=path.join(stage,'node_modules');if(!fs.existsSync(link))fs.symlinkSync(path.join(root,'node_modules'),link,'junction');
 console.log(JSON.stringify(summary,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
