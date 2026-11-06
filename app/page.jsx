'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, fmt, titleOf } from '@/lib/client';
import { STAMP, greeting, confetti } from '@/lib/fun';

const needsYou = it =>
  ['queued', 'processing', 'review', 'error'].includes(it.status) ||
  (it.status === 'sent' && it.follow?.body) ||
  (['replied', 'interview'].includes(it.status) && it.reply?.body);

function look(it) {
  if (it.status === 'sent' && it.follow?.body) return { s: STAMP.follow, m: 'Follow-up ready - approve it' };
  const m = {
    queued: 'Reading and drafting…', processing: 'Reading and drafting…', error: 'Didn’t work - tap to retry',
    review: `Draft ready${it.info?.fit ? ` · ${it.info.fit} fit` : ''}`,
    scheduled: `Sends ${it.email?.sendAt ? new Date(it.email.sendAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'soon'}`,
    sent: it.next_follow_at ? `Sent ${fmt(it.sent_at)} · follow-up ${fmt(it.next_follow_at)}` : `Sent ${fmt(it.sent_at)}`,
    replied: `${it.reply?.summary || 'They replied'}`, interview: `Interview! ${it.reply?.summary || ''}`,
    closed: 'Closed', skipped: 'Skipped'
  }[it.status] || it.status;
  return { s: STAMP[it.status] || STAMP.review, m };
}

function Postmark({ sent = 0, goal = 10 }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 120); return () => clearTimeout(t); }, []);
  const pct = on ? Math.min(1, sent / Math.max(goal, 1)) : 0, r = 46, C = 2 * Math.PI * r;
  return (
    <svg className="postmark" viewBox="0 0 120 120" role="img" aria-label={`${sent} of ${goal} sent this week`}>
      <circle cx="60" cy="60" r="56" fill="none" stroke="var(--red)" strokeWidth="2" strokeDasharray="3 3" />
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--red)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${pct * C} ${C}`} transform="rotate(-90 60 60)" style={{ transition: 'stroke-dasharray 1s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="60" y="62" textAnchor="middle" fontSize="30" fontWeight="800">{sent}/{goal}</text>
      <text x="60" y="80" textAnchor="middle" fontSize="11" fontWeight="700">sent this week</text>
    </svg>
  );
}

const PROMPTS = ['Paste a link, post, email or screenshot…'];

export default function Inbox() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('needs');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hint, setHint] = useState(0);
  const fileRef = useRef();
  const router = useRouter();

  const load = () => api('/api/items').then(d => { if (d.me && !d.me.onboarded) { router.replace('/onboarding'); return; } setData(d); }).catch(e => setErr(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 30000), h = setInterval(() => setHint(x => (x + 1) % PROMPTS.length), 3500);
    return () => { clearInterval(t); clearInterval(h); };
  }, []);

  const onPaste = e => { const p = [...(e.clipboardData?.files || [])]; if (p.length) { e.preventDefault(); setFiles(f => [...f, ...p]); } };
  const add = async () => {
    if (!text.trim() && !files.length) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('text', text); files.forEach(f => fd.append('files', f));
      const { item } = await api('/api/items', { method: 'POST', body: fd });
      router.push(`/item/${item.id}`);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  const items = data?.items || [], st = data?.stats;
  useEffect(() => {
    if (!st || st.sentWeek < st.goal) return;
    try { const k = 'goal-' + new Date().toDateString(); if (!localStorage.getItem(k)) { localStorage.setItem(k, '1'); setTimeout(confetti, 600); } } catch {}
  }, [st?.sentWeek, st?.goal]);
  const groups = { needs: items.filter(needsYou), waiting: items.filter(it => it.status === 'scheduled' || (it.status === 'sent' && !it.follow?.body)), all: items };
  const list = groups[tab];

  return (
    <>
      <h1>{greeting(data?.me?.name)}</h1>
      <p className="muted">{data ? (groups.needs.length ? `${groups.needs.length} waiting on you` : 'All caught up') : ''}</p>

      {st && <div className="hero">
        <Postmark sent={st.sentWeek} goal={st.goal} />
        <div className="chips">
          <span className="chip">🔥 <b>{st.streak}</b> day streak</span>
          <span className="chip">💬 <b>{st.replies}</b> replies</span>
          <span className="chip">🎉 <b>{st.interviews}</b> interviews</span>
        </div>
      </div>}

      <div className="drop">
        <textarea aria-label="Drop a lead" value={text} onChange={e => setText(e.target.value)} onPaste={onPaste} placeholder={PROMPTS[hint]} />
        {files.length > 0 && <div className="files">{files.map((f, i) => <span key={i} className="pill">📎 {f.name || 'image'} <button className="btn ghost" style={{ padding: '0 2px' }} onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove">✕</button></span>)}</div>}
        <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={() => fileRef.current.click()}>📎 Attach</button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={e => setFiles(f => [...f, ...e.target.files])} />
          <button className="btn send" onClick={add} disabled={busy}>{busy ? <><span className="spin" /> Posting</> : 'Drop it in'}</button>
        </div>
        {err && <p className="note err" style={{ marginTop: 8 }}>{err}</p>}
      </div>

      <div className="tabs">
        <div className="seg" role="tablist">
          {[['needs', 'Needs you'], ['waiting', 'Waiting'], ['all', 'All']].map(([k, l]) =>
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} {groups[k].length}</button>)}
        </div>
      </div>

      <div className="list">
        {!data && [0, 1, 2, 3].map(i => <div key={i} className="lead skel" style={{ '--i': i }}><span className="stamp" /><span style={{ flex: 1 }}><span className="skel-line" style={{ width: '62%' }} /><span className="skel-line" style={{ width: '38%', height: 10 }} /></span></div>)}
        {data && !list.length && <div className="empty"><div className="big">{tab === 'needs' ? '📭' : '🛫'}</div>{tab === 'needs' ? 'All clear' : 'Nothing yet'}</div>}
        {list.map((it, i) => {
          const { s, m } = look(it);
          return (
            <Link key={it.id} href={`/item/${it.id}`} className="lead rise" style={{ '--i': Math.min(i, 12) }}>
              <span className="stamp" style={{ '--s': s[1] }} aria-hidden="true"><span>{s[0]}</span></span>
              <span style={{ minWidth: 0 }}>
                <span className="t" style={{ display: 'block' }}>{titleOf(it)}</span>
                <span className="m">{(it.status === 'queued' || it.status === 'processing') && <span className="spin" />} {m}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
