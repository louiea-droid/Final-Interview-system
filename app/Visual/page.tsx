'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Candidate = {
  id: string;
  name: string;
  photo_url: string | null;
  client_code: string;
  position: string | null;
  status: string;
  sort_order: number;
};

export default function BoardPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // No-login board:
  // visit /?client=CLIENT-A
  const clientCode = useMemo(() => {
    if (typeof window === 'undefined') return 'CLIENT-A';
    return new URLSearchParams(window.location.search).get('client') || 'CLIENT-A';
  }, []);

  async function loadBoard() {
    const { data } = await supabase
      .from('candidates')
      .select('id,name,photo_url,client_code,position,status,sort_order')
      .eq('client_code', clientCode)
      .order('sort_order', { ascending: true });
    setCandidates(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadBoard();

    const channel = supabase
      .channel(`board-${clientCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'candidates', filter: `client_code=eq.${clientCode}` },
        () => loadBoard()
      )
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientCode]);

  return (
    <main className="board">
      <header className="header">
        <div>
          <div className="eyebrow">FINAL INTERVIEW</div>
          <h1>Interview Candidates</h1>
        </div>
        <div className="live">
          <span className={connected ? 'dot live-dot' : 'dot'} />
          {connected ? 'LIVE' : 'CONNECTING'}
        </div>
      </header>

      {loading ? (
        <div className="center">Loading candidates…</div>
      ) : candidates.length === 0 ? (
        <div className="center">No final-interview candidates currently listed.</div>
      ) : (
        <section className={`grid count-${Math.min(candidates.length, 12)}`}>
          {candidates.map((c) => (
            <article className={`card status-${c.status.toLowerCase().replaceAll(' ', '-')}`} key={c.id}>
              <div className="photo-wrap">
                {c.photo_url ? <img src={c.photo_url} alt="" /> : <div className="placeholder">PHOTO</div>}
              </div>
              <div className="name">{c.name}</div>
              {c.position && <div className="position">{c.position}</div>}
              <div className="status">{c.status}</div>
            </article>
          ))}
        </section>
      )}

      <footer>
        Client: {clientCode} · Updates appear automatically
      </footer>
    </main>
  );
}
