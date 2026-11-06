'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, post } from '@/lib/client';

const TEXT_EXT = /\.(txt|md|eml|text)$/i;

async function readDocx(f) {
  const mammoth = (await import('mammoth/mammoth.browser')).default || (await import('mammoth/mammoth.browser'));
  const r = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
  return r.value;
}

export default function Train() {
  const [d, setD] = useState({ notes: [], voice: null, gmail: null });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [paste, setPaste] = useState('');
  const fileRef = useRef();
  const merge = x => setD(p => ({ ...p, ...x }));
  useEffect(() => { api('/api/train').then(setD).catch(e => setMsg(e.message)); }, []);

  const run = async (key, fn) => { setBusy(key); setMsg(''); try { await fn(); } catch (e) { setMsg(e.message); } setBusy(''); };

  const gmail = restart => run('gmail', async () => {
    const r = await post('/api/train', { action: 'gmail', restart });
    merge(r);
    setMsg(r.added ? `Read ${r.seen} sent emails, learned from ${r.added} new ones.${r.done ? ' That is your whole Sent folder.' : ' Tap again to go further back.'}`
      : r.done ? 'No more sent emails to learn from.' : `Read ${r.seen} sent emails, nothing new that looked like your own writing. Tap again to go further back.`);
  });

  const upload = e => run('upload', async () => {
    const files = [...e.target.files]; e.target.value = '';
    const texts = [], ai = [];
    for (const f of files) {
      if (TEXT_EXT.test(f.name) || f.type.startsWith('text/')) texts.push({ title: f.name, body: await f.text() });
      else if (/\.docx$/i.test(f.name)) texts.push({ title: f.name, body: await readDocx(f) });
      else ai.push(f);
    }
    let added = 0;
    if (texts.length) { const r = await post('/api/train', { action: 'add', items: texts }); added += r.added; merge(r); }
    if (ai.length) { const fd = new FormData(); ai.forEach(f => fd.append('files', f)); const r = await api('/api/train', { method: 'POST', body: fd }); added += r.added; merge(r); }
    if (!added) throw new Error('Could not find enough writing in those files. Try a .docx, .pdf or .txt.');
    merge(await post('/api/train', { action: 'rebuild' }));
    setMsg(`Learned from ${added} document${added === 1 ? '' : 's'}. Voice updated.`);
  });

  const addPaste = () => run('paste', async () => {
    const r = await post('/api/train', { action: 'add', items: [{ title: 'Pasted', body: paste }] });
    if (!r.added) throw new Error('Paste a bit more - at least a few sentences.');
    setPaste(''); merge(r); merge(await post('/api/train', { action: 'rebuild' })); setMsg('Learned it. Voice updated.');
  });

  const v = d.voice;
  return (
    <>
      <h1>Your voice</h1>

      <Link href="/train/swipe" className="swipe-cta">
        <span className="swipe-cta-ico" aria-hidden="true">🔥</span>
        <span style={{ flex: 1 }}>
          <b className="display" style={{ fontSize: 20, display: 'block' }}>Swipe to train</b>
          
          {d.swipes?.total > 0 && <span className="small" style={{ display: 'block', marginTop: 4, opacity: 0.85 }}>♥ {d.swipes.like} · ✕ {d.swipes.dislike} · ⭐ {d.swipes.super}</span>}
        </span>
        <span aria-hidden="true" style={{ fontSize: 22 }}>→</span>
      </Link>

      {d.gmailConnected && (      <div className="box">
        <h2>📬 Learn from my Gmail</h2>
        {d.gmail?.total > 0 && <p className="muted small">Learned from {d.gmail.total} emails</p>}
        <div className="row">
          <button className="btn yellow" disabled={!!busy} onClick={() => gmail(false)}>{busy === 'gmail' ? <><span className="spin" /> Reading</> : d.gmail?.total ? 'Go further back' : 'Learn from Gmail'}</button>
          {d.gmail?.total > 0 && <button className="btn ghost" disabled={!!busy} onClick={() => gmail(true)}>Start over</button>}
        </div>
      </div>
      )}

      <div className="box">
        <h2>📎 Upload things I wrote</h2>
        <button className="btn" disabled={!!busy} onClick={() => fileRef.current.click()}>{busy === 'upload' ? <><span className="spin" /> Reading</> : 'Choose files'}</button>
        <input ref={fileRef} type="file" multiple hidden accept=".docx,.pdf,.txt,.md,.eml,image/*" onChange={upload} />
        <details style={{ marginTop: 10 }}><summary>Or paste text</summary>
          <textarea rows={6} value={paste} onChange={e => setPaste(e.target.value)} placeholder="Paste an email or anything you wrote" />
          <button className="btn primary" style={{ marginTop: 8 }} disabled={!!busy || paste.trim().length < 80} onClick={addPaste}>{busy === 'paste' ? <span className="spin" /> : 'Learn from this'}</button>
        </details>
      </div>

      {msg && <p className="note">{msg}</p>}

      <div className="box">
        <h2>✍️ What it knows about how you write</h2>
        {v?.text ? <>
          <textarea rows={12} defaultValue={v.text} key={v.at} onBlur={e => { if (e.target.value !== v.text) run('save', async () => { merge(await post('/api/train', { action: 'saveVoice', text: e.target.value })); setMsg('Saved.'); }); }} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" disabled={!!busy} onClick={() => run('rebuild', async () => { merge(await post('/api/train', { action: 'rebuild' })); setMsg('Voice rebuilt.'); })}>{busy === 'rebuild' ? <span className="spin" /> : 'Rebuild'}</button>
            <span className="muted small">Updated {new Date(v.at).toLocaleDateString()}</span>
          </div>
        </> : null}
      </div>

      {d.notes.length > 0 && <div className="box">
        <details><summary>Learned from ({d.notes.length})</summary>
          {d.notes.map(n => (
            <div key={n.id} className="q">
              <p className="small" style={{ margin: 0 }}>{n.source?.startsWith('gmail') ? '📬' : '📎'} <b>{n.title}</b></p>
              <p className="muted small" style={{ margin: '2px 0' }}>{n.preview}{n.chars > 400 ? '…' : ''}</p>
              <button className="btn ghost small" onClick={async () => merge(await api('/api/train', { method: 'DELETE', body: JSON.stringify({ id: n.id }) }))}>Remove</button>
            </div>
          ))}
        </details>
      </div>}
    </>
  );
}
