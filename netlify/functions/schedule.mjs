import {schedulePath, authentic, boundedBody} from '../../src/auth.mjs';
import {enqueue} from '../../src/clock.mjs';
import {runtime} from '../../src/runtime.mjs';

export const config = {path:'/v1/jobs'};
export default async function schedule(request) {
  if (request.method !== 'POST') return new Response(null,{status:405});
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return new Response(null,{status:415});
  try {
    const {store,dispatch,schedule} = runtime();
    const body = await boundedBody(request);
    if (body === null) return new Response(null,{status:413});
    if (!await authentic(request.headers,schedulePath,body,schedule)) return new Response(null,{status:401});
    let job;
    try {job=JSON.parse(body);}catch{return new Response(null,{status:400});}
    const status=await enqueue(store,job,Date.now(),dispatch);
    return Response.json(status===200||status===201?job:{},{status,headers:{'cache-control':'no-store'}});
  } catch { return new Response(null,{status:503}); }
}
