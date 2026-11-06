'use client';
import { useEffect, useState } from 'react';
import { supabase, pushSession, config } from '@/lib/supabase-client';

export default function Login() {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState({});

  // Already signed in (or just came back from a magic link / Google)? Skip straight in.
  useEffect(() => {
    config().then(setCfg);
    supabase().then(async sb => {
      const { data } = await sb.auth.getSession();
      if (data.session && (await pushSession(data.session))) location.replace('/');
    }).catch(e => setMsg(e.message));
  }, []);

  const done = async session => { if (session && (await pushSession(session))) location.replace('/'); else setMsg('Could not start your session.'); };
  const run = async fn => { setBusy(true); setMsg(''); try { await fn(await supabase()); } catch (e) { setMsg(e.message); } setBusy(false); };

  const submit = e => { e.preventDefault(); run(async sb => {
    if (mode === 'in') { const { data, error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; await done(data.session); }
    else { const { data, error } = await sb.auth.signUp({ email, password: pw }); if (error) throw error; if (data.session) await done(data.session); else setMsg('Check your email to confirm, then sign in.'); }
  }); };
  const magic = () => run(async sb => { if (!email) throw new Error('Enter your email first.'); const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/login' } }); if (error) throw error; setMsg('Link sent - check your email.'); });
  const google = () => run(async sb => { const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/login' } }); if (error) throw error; });

  return (
    <form onSubmit={submit} className="box" style={{ marginTop: 48 }}>
      <h1 style={{ marginTop: 0 }}>Outbox</h1>
      <p className="muted" style={{ marginTop: 0 }}>Your job-search autopilot.</p>
      {cfg.googleLogin && <><button type="button" className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={google} disabled={busy}>Continue with Google</button><p className="muted small" style={{ textAlign: 'center', margin: '10px 0' }}>or</p></>}
      <label htmlFor="em">Email</label>
      <input id="em" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
      <label htmlFor="pw">Password</label>
      <input id="pw" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={e => setPw(e.target.value)} minLength={mode === 'up' ? 8 : undefined} />
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={busy}>{busy ? <span className="spin" /> : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="btn ghost" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}>{mode === 'in' ? 'New here? Sign up' : 'Have an account? Sign in'}</button>
      </div>
      <button type="button" className="btn ghost small" style={{ marginTop: 6 }} onClick={magic} disabled={busy}>Email me a sign-in link</button>
      {msg && <p className="note err" style={{ marginTop: 10 }}>{msg}</p>}
    </form>
  );
}
