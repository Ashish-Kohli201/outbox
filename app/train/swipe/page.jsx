'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, post } from '@/lib/client';
import { confetti, buzz } from '@/lib/fun';

const CHIPS = {
  like: ['Great opening', 'Right length', 'Sounds like me', 'Warm tone', 'Strong ask'],
  dislike: ['Too long', 'Too formal', 'Too salesy', "Doesn't sound like me", 'Weak opening', 'Too casual']
};
const bold = t => String(t).split('**').map((s, i) => (i % 2 ? <b key={i}>{s}</b> : s));

export default function Swipe() {
  const [queue, setQueue] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [why, setWhy] = useState('');
  const [chips, setChips] = useState([]);
  const [drag, setDrag] = useState({ x: 0, y: 0, on: false });
  const [gone, setGone] = useState(null); // { v, x, y } while the card flies off
  const [learned, setLearned] = useState(false);
  const start = useRef(null);
  const busy = useRef(false);

  const done = useRef(new Set());
  const last = useRef(0);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);

  // Show what we had last time instantly, then top up from the server (which never loses unswiped cards).
  useEffect(() => {
    try {
      done.current = new Set(JSON.parse(localStorage.getItem('swipe_done') || '[]'));
      const cached = JSON.parse(localStorage.getItem('swipe_q') || '[]').filter(c => !done.current.has(c.id));
      if (cached.length) { setQueue(cached); setReady(true); }
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem('swipe_q', JSON.stringify(queue.slice(0, 20))); } catch {} }, [queue]);

  const more = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; last.current = Date.now(); setErr('');
    try {
      const d = await api('/api/swipe');
      setQueue(q => { const have = new Set(q.map(c => c.id)); return [...q, ...d.cards.filter(c => !have.has(c.id) && !done.current.has(c.id))]; });
      setCounts(d.counts);
    } catch (e) { setErr(e.message); }
    busy.current = false; setReady(true); setLoading(false); setTick(t => t + 1);
  }, []);
  useEffect(() => { more(); }, [more]);
  // Empty deck: keep checking until the background batch lands. Running low: top up, at most every 8s.
  useEffect(() => {
    if (!ready || err) return;
    const wait = queue.length === 0 ? 3000 : queue.length <= 4 ? Math.max(0, 8000 - (Date.now() - last.current)) : null;
    if (wait === null) return;
    const t = setTimeout(more, wait);
    return () => clearTimeout(t);
  }, [queue.length, ready, err, tick, more]);

  const card = queue[0], next = queue[1];

  const decide = useCallback(v => {
    if (!card || gone) return;
    const comment = [...chips, why.trim()].filter(Boolean).join('. ');
    buzz(v === 'super' ? [20, 40, 20] : 15);
    if (v === 'super') confetti();
    setGone({ v, x: v === 'like' ? 700 : v === 'dislike' ? -700 : 0, y: v === 'super' ? -800 : 60 });
    done.current.add(card.id);
    try { localStorage.setItem('swipe_done', JSON.stringify([...done.current].slice(-300))); } catch {}
    post('/api/swipe', { v, card, comment }).then(r => { setCounts(r.counts); if (r.learned) { setLearned(true); setTimeout(() => setLearned(false), 3500); } }).catch(e => setErr(e.message));
    setTimeout(() => { setQueue(q => q.slice(1)); setGone(null); setDrag({ x: 0, y: 0, on: false }); setWhy(''); setChips([]); }, 230);
  }, [card, gone, chips, why]);

  useEffect(() => {
    const k = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') decide('like'); else if (e.key === 'ArrowLeft') decide('dislike'); else if (e.key === 'ArrowUp') decide('super');
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [decide]);

  // Horizontal drag only: vertical gestures belong to scrolling a long email.
  const down = e => { if (gone) return; start.current = { x: e.clientX }; setDrag({ x: 0, y: 0, on: true }); };
  const move = e => { if (!start.current) return; setDrag({ x: e.clientX - start.current.x, y: 0, on: true }); };
  const up = () => {
    if (!start.current) return; start.current = null;
    const { x } = drag;
    if (x > 90) decide('like');
    else if (x < -90) decide('dislike');
    else setDrag({ x: 0, y: 0, on: false });
  };

  const pos = gone || drag;
  const dx = pos.x, dy = pos.y;
  const verdict = gone ? gone.v : dx > 40 ? 'like' : dx < -40 ? 'dislike' : '';
  const strength = gone ? 1 : Math.min(1, Math.abs(dx) / 110);
  const mood = (verdict === 'dislike' ? 'dislike' : 'like');

  return (
    <div className="swipe-page">
      <div className="sw-head">
        <Link href="/train" className="small">← Voice</Link>
        {counts && <span className="small muted">♥ {counts.like} · ✕ {counts.dislike} · ⭐ {counts.super}{learned ? ' · ✨ Voice updated' : ''}</span>}
      </div>

      <div className="deck">
        {!card && !err && <div className="sw-card sw-skel"><span className="spin" /></div>}
        {next && <div className="sw-card sw-behind" aria-hidden="true" />}
        {card && (
          <div key={card.id} className={'sw-card sw-top' + (drag.on ? ' dragging' : '')} data-verdict={verdict}
            style={{ transform: `translateX(${dx}px) rotate(${dx / 18}deg)` }}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <span className="pill">{card.scenario}</span>
            <p className="sw-sub">{card.subject}</p>
            <div className="sw-body">{bold(card.body)}</div>
          </div>
        )}
        {card && ['like', 'dislike', 'super'].map(k => <span key={k} className={'sw-stamp ' + k} style={{ opacity: verdict === k ? 0.4 + strength * 0.6 : 0 }}>{k === 'like' ? 'LIKE' : k === 'dislike' ? 'NOPE' : 'LOVE'}</span>)}
        
      </div>

      {card && <div className="sw-foot">
        <div className="sw-actions">
          <button className="sw-btn no" onClick={() => decide('dislike')} aria-label="Dislike"><span>✕</span><small>Nope</small></button>
          <button className="sw-btn star" onClick={() => decide('super')} aria-label="Superlike"><span>⭐</span><small>Love</small></button>
          <button className="sw-btn yes" onClick={() => decide('like')} aria-label="Like"><span>♥</span><small>Like</small></button>
        </div>
        <div className="sw-chips" role="group" aria-label="Why">
          {CHIPS[mood].map(c => <button key={c} className="pill chipbtn" aria-pressed={chips.includes(c)} onClick={() => setChips(chips.includes(c) ? chips.filter(x => x !== c) : [...chips, c])}>{c}</button>)}
        </div>
        <input value={why} onChange={e => setWhy(e.target.value)} placeholder="Why? (optional)" aria-label="Why" />
      </div>}
      {err && <p className="note err">{err} <button className="btn ghost small" onClick={more}>Retry</button></p>}
    </div>
  );
}
