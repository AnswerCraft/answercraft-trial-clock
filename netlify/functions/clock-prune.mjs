import {prune} from '../../src/clock.mjs';
import {runtime} from '../../src/runtime.mjs';
export const config={schedule:'7 4 * * *'};
export default async function cleanup() {
  const {store}=runtime();
  await prune(store,Date.now());
}
