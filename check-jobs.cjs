const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('app.js','utf8').split('async function reconstructionRequest')[1].split("if(location.hostname")[0];
async function run(jobApi,failed=false){
  const calls=[];
  const replies=[{service:'scalp-reconstruction-v2',configured:true,job_api:jobApi}];
  if(jobApi)replies.push({job_id:'signed-job'},{status:'pending'});
  replies.push(failed?{detail:'GPU unavailable'}:{schema:'scalp-reconstruction-v2'});
  const sandbox={AbortSignal,Date,encodeURIComponent,$:()=>({value:'service-key'}),status:()=>{},setTimeout:fn=>fn(),fetch:async(url,options)=>{calls.push({url,options});const data=replies.shift();return {ok:!(failed&&!replies.length),status:failed&&!replies.length?503:data.job_id||data.status==='pending'?202:200,json:async()=>data};}};
  vm.createContext(sandbox);vm.runInContext('async function reconstructionRequest'+source,sandbox);
  if(failed)await assert.rejects(()=>sandbox.reconstructionRequest('https://worker',{}),/GPU unavailable/);
  else assert.equal((await sandbox.reconstructionRequest('https://worker',{})).schema,'scalp-reconstruction-v2');
  assert.equal(calls[1].url,jobApi?'https://worker/jobs':'https://worker/reconstruct');
  for(const call of calls.slice(1))assert.equal(call.options.headers['X-API-Key'],'service-key');
}
(async()=>{await run(true);await run(false);await run(true,true);console.log('PASS: async submit/poll, legacy service, worker failure and authenticated requests.');})().catch(e=>{console.error(e);process.exitCode=1});
