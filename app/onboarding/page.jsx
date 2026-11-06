'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, post } from '@/lib/client';
import { config } from '@/lib/supabase-client';
import { TONES } from '@/lib/defaults';

async function docxText(f) {
  const mammoth = (await import('mammoth/mammoth.browser')).default || (await import('mammoth/mammoth.browser'));
  return (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value;
}

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState({});
  const [P, setP] = useState(null);
  const [hasAi, setHasAi] = useState(false);
  const [key, setKey] = useState('');
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    Promise.all([config(), api('/api/profile')]).then(([c, d]) => {
      setCfg(c); setP(d.profile); setHasAi(d.hasAi);
      setStep(!d.hasAi ? 0 : !d.profile.cv_data ? 1 : 2);
      if (!d.profile.timezone || d.profile.timezone === 'UTC') setP(x => ({ ...x, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }));
    }).catch(e => setErr(e.message));
  }, []);

  const run = async (k, fn) => { setBusy(k); setErr(''); try { await fn(); } catch (e) { setErr(e.message); } setBusy(''); };

  const saveKey = () => run('key', async () => { await post('/api/settings/ai', { gemini: key }); setHasAi(true); setStep(1); });
  const importFile = e => run('cv', async () => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    let d;
    if (/\.docx$/i.test(f.name)) d = await post('/api/profile/import', { text: await docxText(f) });
    else if (/\.(txt|md)$/i.test(f.name)) d = await post('/api/profile/import', { text: await f.text() });
    else { const fd = new FormData(); fd.append('file', f); d = await api('/api/profile/import', { method: 'POST', body: fd }); }
    setP(x => ({ ...x, ...d.profile, timezone: x.timezone })); setStep(2);
  });
  const importPaste = () => run('cv', async () => { const d = await post('/api/profile/import', { text: paste }); setP(x => ({ ...x, ...d.profile, timezone: x.timezone })); setStep(2); });
  const finish = () => run('done', async () => {
    const { name, email, phone, headline, target, links, tone, timezone } = P;
    await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ name, email, phone, headline, target, links, tone, timezone, onboarded: true }) });
    router.replace('/');
  });
  const set = patch => setP(x => ({ ...x, ...patch }));
  if (!P) return <p className="muted" style={{ marginTop: 40 }}>{err || 'Loading…'}</p>;

  const steps = ['AI', 'CV', 'You'];
  return (
    <>
      <h1>Welcome</h1>
      <ol className="stepper" aria-label="Setup">
        {steps.map((l, i) => <li key={l} className={i < step ? 'done' : i === step ? 'now' : ''}><span>{i < step ? '✓' : i + 1}</span>{l}</li>)}
      </ol>
      {err && <p className="note err">{err}</p>}

      {step === 0 && <div className="box">
        <h2>Add your free Gemini key</h2>
        <a className="btn yellow" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a key ↗</a>
        <label htmlFor="gk">Paste it here</label>
        <input id="gk" value={key} onChange={e => setKey(e.target.value)} placeholder="AIza…" autoComplete="off" />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!key.trim() || !!busy} onClick={saveKey}>{busy === 'key' ? <span className="spin" /> : 'Continue'}</button>
          {cfg.sharedAi && <button className="btn ghost" onClick={() => setStep(1)}>Use the server’s key</button>}
        </div>
      </div>}

      {step === 1 && <div className="box">
        <h2>Your CV</h2>
        <button className="btn primary" disabled={!!busy} onClick={() => fileRef.current.click()}>{busy === 'cv' ? <><span className="spin" /> Reading</> : 'Upload PDF or Word'}</button>
        <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.txt,.md,image/*" onChange={importFile} />
        <details style={{ marginTop: 12 }}><summary>Paste text instead</summary>
          <textarea rows={8} value={paste} onChange={e => setPaste(e.target.value)} />
          <button className="btn" style={{ marginTop: 8 }} disabled={paste.trim().length < 80 || !!busy} onClick={importPaste}>Use this</button>
        </details>
      </div>}

      {step === 2 && <div className="box">
        <h2>You</h2>
        <label htmlFor="nm">Name</label><input id="nm" value={P.name || ''} onChange={e => set({ name: e.target.value })} />
        <label htmlFor="hl">Who you are, in one line</label><input id="hl" value={P.headline || ''} onChange={e => set({ headline: e.target.value })} />
        <label htmlFor="tg">What you’re looking for</label><input id="tg" value={P.target || ''} onChange={e => set({ target: e.target.value })} placeholder="e.g. product internships" />
        <div className="row">
          <div style={{ flex: 1, minWidth: 150 }}><label htmlFor="ph">Phone</label><input id="ph" value={P.phone || ''} onChange={e => set({ phone: e.target.value })} /></div>
          <div style={{ flex: 1, minWidth: 170 }}><label htmlFor="em">Email</label><input id="em" type="email" value={P.email || ''} onChange={e => set({ email: e.target.value })} /></div>
        </div>
        <label>How you write</label>
        <div className="seg" role="group" aria-label="Tone">
          {Object.entries(TONES).map(([k, t]) => <button key={k} aria-pressed={P.tone === k} onClick={() => set({ tone: k })}>{t.label}</button>)}
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" disabled={!P.name || !!busy} onClick={finish}>{busy === 'done' ? <span className="spin" /> : 'Start'}</button>
          <button className="btn ghost" onClick={() => setStep(1)}>Re-import CV</button>
        </div>
      </div>}
    </>
  );
}
