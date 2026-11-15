import {callbackPath, dispatchPath, signedHeaders, isJob} from './auth.mjs';

const day = 86400000;
const lead = 110000;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const identity = job => job.id + '/' + job.kind;
const pendingKey = job => 'pending/' + String(job.runAt).padStart(14, '0') + '/' + identity(job);
const opts = {type:'json', consistency:'strong'};
const newly = {onlyIfNew:true};

export async function enqueue(store, job, now, dispatch) {
  if (!isJob(job)) return 400;
  const key = 'jobs/' + identity(job);
  const old = await store.get(key, opts);
  if (!old && (job.runAt < now-day || job.runAt > now+11*day)) return 422;
  if (old && old.runAt !== job.runAt) return 409;
  const created = old ? false : (await store.setJSON(key, job, newly)).modified;
  if (!created && !old && (await store.get(key,opts))?.runAt !== job.runAt) return 409;
  if (await store.get('done/'+identity(job),opts)) return 200;
  await store.setJSON(pendingKey(job), job, newly);
  // Keep the sweeper healthy even for future jobs. A stale heartbeat means no
  // new controlled call is admitted until the scheduled function recovers.
  if (job.runAt > now+lead) {
    const heartbeat = await store.get('sweeper',opts);
    if (!heartbeat || now-heartbeat.at > 105000) return 503;
  } else if (!await dispatch(job)) return 503;
  return created ? 201 : 200;
}

export async function dispatchJob(origin, job, secret, send = fetch) {
  const body = JSON.stringify(job);
  const response = await send(origin+dispatchPath,{method:'POST',redirect:'error',body,
    headers:await signedHeaders(dispatchPath,body,secret),signal:AbortSignal.timeout(5000)});
  await response.body?.cancel();
  return response.status === 202;
}

export async function sweep(store, now, dispatch) {
  // Include overdue jobs on recovery. Site-global storage survives new deploys.
  let due = [];
  for await (const page of store.list({prefix:'pending/',paginate:true})) {
    for (const {key} of page.blobs) {
      const [,timestamp,id,kind] = key.split('/');
      const job = {id,kind,runAt:Number(timestamp)};
      if (isJob(job) && job.runAt <= now+lead) due.push(job);
    }
  }
  due.sort((a,b) => a.runAt-b.runAt);
  let failed = false;
  for (let from = 0; from < due.length; from += 12) {
    const batch = await Promise.allSettled(due.slice(from,from+12).map(dispatch));
    if (batch.some(r=>r.status!=='fulfilled'||!r.value)) failed = true;
  }
  if (failed) throw Error('One or more dispatch requests were deferred');
  await store.setJSON('sweeper',{at:now});
}

export async function deliver(store, job, callbackSecret, {send=fetch,clock=Date.now,sleep=wait}={}) {
  if (!isJob(job)) return;
  const id = identity(job);
  const queued = await store.get('jobs/'+id,opts);
  if (!queued || queued.runAt !== job.runAt || job.runAt-clock()>lead) return;
  const pending = pendingKey(job);
  const done = 'done/'+id;
  if (await store.get(done,opts)) { await store.delete(pending); return; }
  const delay = job.runAt-clock();
  if (delay>0) await sleep(delay);
  const body=JSON.stringify(job);
  for (let attempt=0;attempt<4;attempt++) {
    if (await store.get(done,opts)) { await store.delete(pending); return; }
    try {
      const response=await send('https://app.answercraftai.com'+callbackPath,{method:'POST',body,redirect:'error',
        headers:await signedHeaders(callbackPath,body,callbackSecret,clock()),signal:AbortSignal.timeout(9000)});
      await response.body?.cancel();
      if (response.ok) {
        await store.setJSON(done,{at:clock()},newly);
        await store.delete(pending);
        return;
      }
    } catch { /* Leave the durable job pending for a retry. */ }
    if (attempt<3) await sleep(500 * 2**attempt);
  }
  throw Error('Trial callback deferred');
}

export async function prune(store, now) {
  // Completed jobs remain immutable through the full 11-day acceptance window.
  for await (const page of store.list({prefix:'done/',paginate:true})) {
    for (const {key} of page.blobs) {
      const receipt = await store.get(key,opts);
      if (receipt && receipt.at < now-14*day) {
        await store.delete('jobs/'+key.slice(5));
        await store.delete(key);
      }
    }
  }
}
