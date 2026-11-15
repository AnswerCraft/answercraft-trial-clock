import {sweep} from '../../src/clock.mjs';
import {runtime} from '../../src/runtime.mjs';
export const config={schedule:'* * * * *'};
export default async function wake() {
  const {store,dispatch}=runtime();
  await sweep(store,Date.now(),dispatch);
}
