import { getSetting, getProfile } from './db';
import { DEFAULT_KEYWORDS, defaultSignature } from './defaults';

export const DEFAULT_PREFS = {
  nudges: true,
  nudgeTimes: ['10:00', '13:30', '17:30', '21:00'],   // in the user's own timezone
  keywords: DEFAULT_KEYWORDS,
  weeklyGoal: 10,
  signatures: null,            // filled from the profile when empty
  defaultSignature: 'default'
};

export async function prefs() {
  const p = { ...DEFAULT_PREFS, ...((await getSetting('prefs')) || {}) };
  if (!p.signatures?.length) p.signatures = [{ id: 'default', name: 'Default', text: defaultSignature(await getProfile()) }];
  return p;
}
