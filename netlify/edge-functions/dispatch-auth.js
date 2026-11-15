import {authentic,boundedBody,dispatchPath} from '../../src/auth.mjs';

export default async function guard(request,context) {
  if(request.method!=='POST')return new Response(null,{status:405});
  try {
    const raw=await boundedBody(request.clone());
    if(raw===null||!await authentic(request.headers,dispatchPath,raw,Netlify.env.get('TRIAL_SCHEDULE_SECRET')))
      return new Response(null,{status:403});
    return context.next();
  } catch { return new Response(null,{status:403}); }
}
