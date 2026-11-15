import {getStore} from '@netlify/blobs';
import {dispatchJob} from './clock.mjs';

export function runtime() {
  const schedule = Netlify.env.get('TRIAL_SCHEDULE_SECRET');
  const callback = Netlify.env.get('TRIAL_CALLBACK_SECRET');
  const origin = Netlify.env.get('TRIAL_CLOCK_ORIGIN');
  if (!schedule || !callback || schedule === callback || Math.min(schedule.length,callback.length) < 32)
    throw Error('Clock credentials are not configured');
  if (!origin || !/^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(origin)) throw Error('Clock origin is not configured');
  return {store:getStore({name:'trial-deadlines',consistency:'strong'}), schedule,callback,
    dispatch:job=>dispatchJob(origin,job,schedule)};
}
