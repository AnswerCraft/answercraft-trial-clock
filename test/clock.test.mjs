import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authentic,boundedBody,callbackPath,dispatchPath,schedulePath,signedHeaders} from '../src/auth.mjs';
import {deliver,dispatchJob,enqueue,sweep,prune} from '../src/clock.mjs';

const base=1794758400000;
const secret='a'.repeat(64), callback='b'.repeat(64);
const job={id:'7'.repeat(64),kind:'cutoff',runAt:base+1200000};
function blobs() {
  const data=new Map();
  return {
    data, get:async k=>data.get(k)??null,
    async setJSON(k,v,o) {if(o?.onlyIfNew&&data.has(k))return{modified:false};data.set(k,v);return{modified:true};},
    async delete(k) {data.delete(k);},
    async *list({prefix}) {yield{blobs:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}
  };
}
test('scheduler and internal callbacks have separate signed paths, secrets and timestamps',async()=>{
  const raw=JSON.stringify(job);
  const headers=new Headers(await signedHeaders(schedulePath,raw,secret,base));
  assert(await authentic(headers,schedulePath,raw,secret,base));
  assert(!await authentic(headers,dispatchPath,raw,secret,base));
  assert(!await authentic(headers,schedulePath,raw+' ',secret,base));
  assert(!await authentic(headers,schedulePath,raw,callback,base));
  assert(!await authentic(headers,schedulePath,raw,secret,base+301000));
  assert.equal(await boundedBody(new Request('https://unit.invalid/',{method:'POST',body:raw})),raw);
  assert.equal(await boundedBody(new Request('https://unit.invalid/',{method:'POST',body:'x'.repeat(1025)})),null);
});
test('far jobs require a healthy sweeper and survive failed admission, retries and restarts',async()=>{
  const store=blobs();
  const dispatch=async()=>{throw Error('Unexpected immediate dispatch');};
  assert.equal(await enqueue(store,job,base,dispatch),503);
  await sweep(store,base,dispatch);
  assert.equal(await enqueue(store,job,base,dispatch),200);
  assert.equal(await enqueue(store,{...job,runAt:job.runAt+1},base,dispatch),409);
  assert.equal(await enqueue(store,{...job,kind:'warning'},base,dispatch),201);
  const due=[];
  await sweep(store,job.runAt-90000,async candidate=>{due.push(candidate);return true;});
  assert.deepEqual(due.map(e=>e.kind).sort(),['cutoff','warning']);
});
test('a rejected near-term dispatch cannot authorize a controlled trial call',async()=>{
  const store=blobs(), near={...job,runAt:base+30000};
  assert.equal(await enqueue(store,near,base,async()=>false),503);
  assert.equal(await enqueue(store,near,base,async()=>true),200);
  assert.equal(await enqueue(store,{...near,privateNumber:'unexpected'},base,async()=>true),400);
  assert.equal(await enqueue(store,{...near,id:'8'.repeat(64),runAt:base+12*86400000},base,async()=>true),422);
});
test('internal runner requires the platform to accept the background invocation',async()=>{
  const origin='https://answercraft-clock.netlify.app';
  for(const status of [200,202,403]) {
    assert.equal(await dispatchJob(origin,job,secret,async(url,req)=>{
      assert.equal(url,origin+dispatchPath);
      assert(await authentic(new Headers(req.headers),dispatchPath,req.body,secret));
      return new Response(null,{status});
    }),status===202);
  }
});
test('persistent job fires at its exact instant, retries without changing the body, then deduplicates',async()=>{
  const store=blobs(),near={...job,runAt:base+30000};
  await enqueue(store,near,base,async()=>true);
  let now=base,attempts=0;
  const deps={clock:()=>now,sleep:async ms=>{now+=ms;},send:async(url,req)=>{
    assert.equal(url,'https://app.answercraftai.com'+callbackPath);
    assert(now>=near.runAt);
    assert(await authentic(new Headers(req.headers),callbackPath,req.body,callback,now));
    assert.deepEqual(JSON.parse(req.body),near);
    return new Response(null,{status:++attempts===1?503:204});
  }};
  await deliver(store,near,callback,deps);
  await deliver(store,near,callback,deps);
  assert.equal(attempts,2);
  assert.equal(await enqueue(store,near,now,async()=>{throw Error('Already delivered');}),200);
  assert(![...store.data.keys()].some(k=>k.startsWith('pending/')));
  await prune(store,now+13*86400000);
  assert(store.data.has('jobs/'+near.id+'/cutoff'));
  await prune(store,now+15*86400000);
  assert.equal(store.data.size,0);
});
test('failed upstream callback remains durably pending and the next sweeper retries it',async()=>{
  const store=blobs(),near={...job,runAt:base};
  await enqueue(store,near,base,async()=>true);
  await assert.rejects(deliver(store,near,callback,{clock:()=>base,sleep:async()=>{},send:async()=>new Response(null,{status:503})}));
  const jobs=[];
  await sweep(store,base+60000,async j=>{jobs.push(j);return true;});
  assert.deepEqual(jobs,[near]);
});
