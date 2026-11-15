import {dispatchPath, authentic, boundedBody} from '../../src/auth.mjs';
import {deliver} from '../../src/clock.mjs';
import {runtime} from '../../src/runtime.mjs';

export const config = {background:true,path:'/internal/deliver'};
export default async function callback(request) {
  if(request.method!=='POST')return;
  const {store,schedule,callback}=runtime();
  const raw=await boundedBody(request);
  if(raw===null || !await authentic(request.headers,dispatchPath,raw,schedule))return;
  await deliver(store,JSON.parse(raw),callback);
}
