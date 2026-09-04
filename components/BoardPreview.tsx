'use client';

import { useEffect, useMemo, useState } from 'react';
import { Poppins } from 'next/font/google';

import { supabase } from '../lib/supabase';
import { isShownOnBoard } from '../lib/candidateVisibility';

/*
 * A self-contained mimic of the /visual display board, built and
 * styled independently of app/visual/page.tsx on purpose — it must
 * never require editing that page just to fix how this small
 * dashboard preview looks. It fetches the same live candidate data
 * and follows the same "even sets, max 4 per set" rotation, but owns
 * its own markup and CSS end to end.
 */

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['700', '800'],
});

type PreviewCandidate = {
  id: string;
  name: string;
  photo_url: string | null;
  sort_order: number;
  show_in_visual?: boolean | null;
};

const MAX_CANDIDATES_PER_SET = 4;
const SET_DURATION = 8000;

/*
 * Longer names get a smaller font so every nameplate stays on one
 * line and the same height as its neighbors, instead of wrapping.
 */
function getNameFontSize(name: string): string {
  const length = name.length;

  if (length <= 10) return '14px';
  if (length <= 14) return '12px';
  if (length <= 18) return '10.5px';
  return '9px';
}

export default function BoardPreview() {
  const [candidates, setCandidates] = useState<PreviewCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSet, setCurrentSet] = useState(0);

  useEffect(() => {
    async function loadCandidates() {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, name, photo_url, sort_order, show_in_visual')
        .order('sort_order', { ascending: true });

      if (!error) {
        setCandidates((data ?? []).filter(isShownOnBoard));
      }

      setLoading(false);
    }

    loadCandidates();

    const channel = supabase
      .channel('board-preview')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'candidates' },
        loadCandidates
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const setSizes = useMemo(() => {
    const count = candidates.length;
    if (count === 0) return [];

    const setCount = Math.ceil(count / MAX_CANDIDATES_PER_SET);
    const base = Math.floor(count / setCount);
    const remainder = count % setCount;

    return Array.from({ length: setCount }, (_, index) => base + (index < remainder ? 1 : 0));
  }, [candidates.length]);

  const totalSets = Math.max(1, setSizes.length);

  useEffect(() => {
    if (currentSet >= totalSets) setCurrentSet(0);
  }, [currentSet, totalSets]);

  useEffect(() => {
    if (totalSets <= 1) return;

    const timer = window.setInterval(() => {
      setCurrentSet((previous) => (previous + 1) % totalSets);
    }, SET_DURATION);

    return () => window.clearInterval(timer);
  }, [totalSets]);

  const visibleCandidates = useMemo(() => {
    if (setSizes.length === 0) return [];

    const safeSet = Math.min(currentSet, setSizes.length - 1);
    const start = setSizes.slice(0, safeSet).reduce((total, size) => total + size, 0);

    return candidates.slice(start, start + setSizes[safeSet]);
  }, [candidates, currentSet, setSizes]);

  const columns = visibleCandidates.length || 1;

  return (
    <div className="board-preview">
      <div className="board-preview-glow" aria-hidden="true" />

      <div className="board-preview-content">
        <img src="/visual/logo.png" alt="" className="board-preview-logo" />

        <h3 className={`board-preview-title ${poppins.className}`}>
          Final Interview Applicants
        </h3>

        {loading ? (
          <div className="board-preview-empty">Loading...</div>
        ) : visibleCandidates.length === 0 ? (
          <div className="board-preview-empty">No candidates listed.</div>
        ) : (
          <div
            className="board-preview-row"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {visibleCandidates.map((candidate) => (
              <div className="board-preview-box" key={candidate.id}>
                <div
                  className="board-preview-photo"
                  style={
                    candidate.photo_url
                      ? { backgroundImage: `url("${candidate.photo_url}")` }
                      : undefined
                  }
                />

                <div
                  className="board-preview-name"
                  style={{ fontSize: getNameFontSize(candidate.name) }}
                  title={candidate.name}
                >
                  {candidate.name}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="board-preview-footer">Best of Luck!</div>
      </div>
    </div>
  );
}
