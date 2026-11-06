'use client';
import { useEffect, useRef, useState } from 'react';
import { api, post } from '@/lib/client';
import { Rich } from '@/lib/rich';
import { config, signOut } from '@/lib/supabase-client';
import { TONES } from '@/lib/defaults';

function keyBytes(s) { const p = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }

export default function Settings() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [cfg, setCfg] = useState({});
  const [prof, setProf] = useState(null);
  const load = () => api('/api/settings').then(setS).catch(e => setMsg(e.message));
  useEffect(() => {
    load();
    config().then(setCfg);
    api('/api/profile').then(d => setProf(d.profile)).catch(() => {});
    const g = new URLSearchParams(location.search).get('gmail');
    if (g) setMsg(g === 'ok' ? '✅ Gmail connected.' : 'Gmail: ' + g);
  }, []);

  const enablePush = async () => {
    setBusy('push'); setMsg('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Open the installed app (home screen icon) in Chrome, then try again.');
      if (!cfg.vapidPublicKey) throw new Error('Push notifications are not set up on this server.');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Notifications are blocked. Chrome → ⋮ → Settings → Site settings → Notifications → allow this site.');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.vapidPublicKey) });
      await post('/api/push/subscribe', sub.toJSON());
      await post('/api/push/test', {});
      setMsg('🔔 Notifications on - a test ping is on its way.'); load();
    } catch (e) { setMsg(e.message); }
    setBusy('');
  };
  const savePrefs = async patch => { try { const d = await post('/api/settings', patch); setS({ ...s, prefs: d.prefs }); setMsg('Saved.'); } catch (e) { setMsg(e.message); } };
  const p = s?.prefs;

  return (
    <>
      <h1>Settings</h1>
      {msg && <p className="note">{msg}</p>}

      {prof && <Profile prof={prof} setProf={setProf} setMsg={setMsg} />}

      <div className="box">
        <h2>📮 Gmail</h2>
        <p className="muted">{s ? (s.gmail ? `Connected as ${s.gmail}` : 'Not connected') : 'Loading…'}</p>
        {cfg.gmail !== false && <div className="row">
          <a className="btn" href="/api/google/auth">{s?.gmail ? 'Reconnect' : 'Connect Gmail'}</a>
          {s?.gmail && <button className="btn ghost" onClick={async () => { await post('/api/google/disconnect', {}); load(); }}>Disconnect</button>}
        </div>}
        {cfg.gmail === false && <p className="muted small">Not set up on this server. You can still send by opening each draft in Gmail.</p>}
      </div>

      <div className="box">
        <h2>🔔 Notifications</h2>
        <p className="muted">{s ? (s.pushDevices ? `On for ${s.pushDevices} device${s.pushDevices === 1 ? '' : 's'}.` : 'Off.') : ''}</p>
        <button className="btn primary" disabled={busy === 'push'} onClick={enablePush}>{busy === 'push' ? <span className="spin" /> : s?.pushDevices ? 'Re-enable on this phone' : 'Turn on for this phone'}</button>
      </div>

      {p && <div className="box">
        <h2>🎯 Daily nudges</h2>
        <div className="seg" role="group" aria-label="Nudges">
          <button aria-pressed={p.nudges} onClick={() => savePrefs({ nudges: true })}>On</button>
          <button aria-pressed={!p.nudges} onClick={() => savePrefs({ nudges: false })}>Off</button>
        </div>
        <label>Times (India time)</label>
        <div className="row">{p.nudgeTimes.map((t, i) => (
          <input key={i} type="time" defaultValue={t} style={{ width: 'auto' }} onBlur={e => { const n = [...p.nudgeTimes]; n[i] = e.target.value; savePrefs({ nudgeTimes: n.filter(Boolean) }); }} />
        ))}</div>
        <label htmlFor="kw">What to search for (one per line)</label>
        <textarea id="kw" rows={5} defaultValue={p.keywords.join('\n')} onBlur={e => savePrefs({ keywords: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })} />
        <label htmlFor="goal">Weekly goal (emails sent)</label>
        <input id="goal" type="number" min="1" max="100" defaultValue={p.weeklyGoal} style={{ width: 120 }} onBlur={e => savePrefs({ weeklyGoal: Number(e.target.value) || 10 })} />
      </div>}

      {p && <Signatures sigs={p.signatures} def={p.defaultSignature} onSave={savePrefs} />}

      {s && <Cvs cvs={s.cvs || []} reload={load} setMsg={setMsg} />}

      {s && <AiKey ai={s.ai} shared={cfg.sharedAi} reload={load} setMsg={setMsg} />}

      <div className="box">
        <h2>👤 Account</h2>
        <p className="muted">{s?.account?.email}</p>
        <div className="row">
          <button className="btn" onClick={signOut}>Sign out</button>
          <a className="btn ghost" href="/api/account">Download my data</a>
          <button className="btn ghost" onClick={async () => { if (prompt('This permanently deletes your account, emails and files. Type DELETE to confirm.') !== 'DELETE') return; try { await api('/api/account', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) }); location.href = '/login'; } catch (e) { setMsg(e.message); } }}>Delete account</button>
        </div>
      </div>
    </>
  );
}

function Signatures({ sigs, def, onSave }) {
  const [list, setList] = useState(sigs || []);
  const [d, setD] = useState(def);
  const commit = (l, dd = d) => onSave({ signatures: l, defaultSignature: dd });
  const edit = (i, patch) => setList(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = () => { const n = [...list, { id: Math.random().toString(36).slice(2, 8), name: 'New signature', text: 'Best regards,' }]; setList(n); commit(n); };
  // Select some text, tap Link, paste the URL: it becomes [text](url). With nothing selected it asks for both.
  const addLink = i => {
    const el = document.getElementById('sig-' + list[i].id);
    const a = el.selectionStart, b = el.selectionEnd, t = list[i].text;
    let label = t.slice(a, b);
    if (!label) { label = prompt('Link text', 'LinkedIn'); if (!label) return; }
    const url = prompt('Paste the link for "' + label + '"', 'https://');
    if (!url || url === 'https://') return;
    const next = t.slice(0, a) + '[' + label + '](' + url.trim() + ')' + t.slice(b);
    const n = list.map((x, j) => (j === i ? { ...x, text: next } : x));
    setList(n); commit(n);
  };
  const del = i => { const n = list.filter((_, j) => j !== i); const nd = n.some(x => x.id === d) ? d : n[0]?.id || ''; setList(n); setD(nd); commit(n, nd); };
  return (
    <div className="box">
      <h2>✍️ Signatures</h2>
      {list.map((x, i) => (
        <div key={x.id} className="q">
          <div className="row">
            <input value={x.name} onChange={e => edit(i, { name: e.target.value })} onBlur={() => commit(list)} style={{ flex: 1 }} aria-label="Name" />
            <button className="btn ghost small" aria-pressed={d === x.id} onClick={() => { setD(x.id); commit(list, x.id); }}>{d === x.id ? '★ Default' : 'Make default'}</button>
          </div>
          <textarea id={'sig-' + x.id} rows={5} value={x.text} onChange={e => edit(i, { text: e.target.value })} onBlur={() => commit(list)} />
          <div className="row" style={{ margin: '6px 0' }}><button className="btn small" onClick={() => addLink(i)}>🔗 Add link</button></div>
          <div className="note small"><Rich text={x.text} /></div>
          {list.length > 1 && <button className="btn ghost small" onClick={() => del(i)}>Delete</button>}
        </div>
      ))}
      <button className="btn" onClick={add}>Add signature</button>
    </div>
  );
}

function Cvs({ cvs, reload, setMsg }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  const upload = async e => {
    const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
    setBusy(true);
    try { const fd = new FormData(); files.forEach(f => fd.append('files', f)); await api('/api/cvs', { method: 'POST', body: fd }); setMsg(`${files.length} CV${files.length === 1 ? '' : 's'} added.`); reload(); } catch (err) { setMsg(err.message); }
    setBusy(false);
  };
  const rename = async (id, label) => { try { await api('/api/cvs', { method: 'PATCH', body: JSON.stringify({ id, label }) }); reload(); } catch (err) { setMsg(err.message); } };
  const del = async c => { if (!confirm(`Delete "${c.label}"?`)) return; try { await api('/api/cvs', { method: 'DELETE', body: JSON.stringify({ id: c.id }) }); reload(); } catch (err) { setMsg(err.message); } };
  return (
    <div className="box">
      <h2>📄 Your CVs</h2>
      {cvs.map(c => (
        <div key={c.id} className="q">
          <div className="row">
            <input defaultValue={c.label} onBlur={e => e.target.value !== c.label && rename(c.id, e.target.value)} style={{ flex: 1 }} aria-label="CV name" />
            <a className="btn ghost small" href={`/api/cvs?id=${c.id}`} target="_blank" rel="noopener">👀 View</a>
            <button className="btn ghost small" onClick={() => del(c)}>Delete</button>
          </div>
          <p className="muted small" style={{ margin: '2px 0 0' }}>{c.name}</p>
        </div>
      ))}
      <div style={{ marginTop: 10 }}>
        <button className="btn" disabled={busy} onClick={() => ref.current.click()}>{busy ? <span className="spin" /> : cvs.length ? 'Add more PDFs' : 'Upload PDFs'}</button>
        <input ref={ref} type="file" accept="application/pdf" multiple hidden onChange={upload} />
      </div>
    </div>
  );
}

function Profile({ prof, setProf, setMsg }) {
  const set = patch => setProf({ ...prof, ...patch });
  const save = async patch => { try { const d = await api('/api/profile', { method: 'PATCH', body: JSON.stringify(patch ?? prof) }); setProf(d.profile); setMsg('Saved.'); } catch (e) { setMsg(e.message); } };
  const links = prof.links || [];
  return (
    <div className="box">
      <h2>🧑 Profile</h2>
      <label htmlFor="pn">Name</label><input id="pn" value={prof.name || ''} onChange={e => set({ name: e.target.value })} onBlur={() => save({ name: prof.name })} />
      <label htmlFor="ph1">One line about you</label><input id="ph1" value={prof.headline || ''} onChange={e => set({ headline: e.target.value })} onBlur={() => save({ headline: prof.headline })} />
      <label htmlFor="pt">Looking for</label><input id="pt" value={prof.target || ''} onChange={e => set({ target: e.target.value })} onBlur={() => save({ target: prof.target })} />
      <label>Tone</label>
      <div className="seg" role="group" aria-label="Tone">
        {Object.entries(TONES).map(([k, t]) => <button key={k} aria-pressed={prof.tone === k && !prof.personality} onClick={() => { set({ tone: k, personality: '' }); save({ tone: k, personality: '' }); }}>{t.label}</button>)}
      </div>
      <details style={{ marginTop: 10 }}><summary>Personality, links and sample email</summary>
        <label htmlFor="pp">How you write (edit freely)</label>
        <textarea id="pp" rows={6} value={prof.personality || ''} placeholder={TONES[prof.tone]?.text} onChange={e => set({ personality: e.target.value })} onBlur={() => save({ personality: prof.personality })} />
        <label htmlFor="pse">A cold email you wrote and liked</label>
        <textarea id="pse" rows={6} value={prof.sample_email || ''} onChange={e => set({ sample_email: e.target.value })} onBlur={() => save({ sample_email: prof.sample_email })} />
        <label>Links</label>
        {links.map((l, i) => (
          <div key={i} className="row" style={{ marginBottom: 6 }}>
            <input style={{ width: 110 }} value={l.label} onChange={e => set({ links: links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} onBlur={() => save({ links: prof.links })} aria-label="Label" />
            <input style={{ flex: 1, minWidth: 160 }} value={l.url} onChange={e => set({ links: links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} onBlur={() => save({ links: prof.links })} aria-label="URL" />
            <button className="btn ghost small" onClick={() => { const n = links.filter((_, j) => j !== i); set({ links: n }); save({ links: n }); }}>✕</button>
          </div>
        ))}
        <button className="btn small" onClick={() => set({ links: [...links, { label: 'LinkedIn', url: 'https://' }] })}>Add link</button>
      </details>
      <p style={{ marginTop: 10 }}><a href="/onboarding">Re-import CV</a></p>
    </div>
  );
}

function AiKey({ ai, shared, reload, setMsg }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await post('/api/settings/ai', { gemini: key }); setKey(''); setMsg('Key saved.'); reload(); } catch (e) { setMsg(e.message); } setBusy(false); };
  return (
    <div className="box">
      <h2>🤖 AI</h2>
      <p className="muted">{ai.gemini ? 'Your Gemini key is saved.' : shared ? 'Using the server’s key.' : 'No key yet.'}</p>
      <div className="row">
        <input style={{ flex: 1, minWidth: 180 }} value={key} onChange={e => setKey(e.target.value)} placeholder={ai.gemini ? 'Replace key' : 'Gemini key'} autoComplete="off" aria-label="Gemini key" />
        <button className="btn primary" disabled={!key.trim() || busy} onClick={save}>{busy ? <span className="spin" /> : 'Save'}</button>
        <a className="btn ghost small" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a key ↗</a>
        {ai.gemini && <button className="btn ghost small" onClick={async () => { await post('/api/settings/ai', { remove: 'gemini' }); reload(); }}>Remove</button>}
      </div>
    </div>
  );
}
