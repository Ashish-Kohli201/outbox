// Who is this request for? Set once per request (or per cron job) and read anywhere below it.
// AsyncLocalStorage follows the async call chain, so db helpers never need a user argument.
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

export const runAs = (userId, fn) => als.run({ uid: userId, cache: {} }, fn);
export const store = () => als.getStore();
export function uid() {
  const s = als.getStore();
  if (!s?.uid) throw new Error('Not signed in');
  return s.uid;
}
/** Per-request memo (e.g. the profile is read once per request). */
export function memo(key, make) {
  const s = als.getStore();
  if (!s) return make();
  if (!(key in s.cache)) s.cache[key] = make();
  return s.cache[key];
}
export const forget = key => { const s = als.getStore(); if (s) delete s.cache[key]; };
