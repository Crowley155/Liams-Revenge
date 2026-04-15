import { useState, useEffect, useRef, useCallback } from 'react';
import { getJobStatus } from '../api/client';

const TERMINAL = new Set(['complete', 'failed']);
const POLL_MS = 2000;
const REFRESH_EVERY = 3;

export default function useResearchJob({ onComplete, onPoll } = {}) {
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const onCompleteRef = useRef(onComplete);
  const onPollRef = useRef(onPoll);
  onCompleteRef.current = onComplete;
  onPollRef.current = onPoll;

  const timerRef = useRef(null);
  const tickRef = useRef(0);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    tickRef.current = 0;

    async function poll() {
      try {
        const data = await getJobStatus(jobId);
        if (cancelled) return;
        setJob(data);

        tickRef.current += 1;
        if (tickRef.current % REFRESH_EVERY === 0) {
          onPollRef.current?.(data);
        }

        if (TERMINAL.has(data.status)) {
          onCompleteRef.current?.(data);
          return;
        }
        timerRef.current = setTimeout(poll, POLL_MS);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [jobId]);

  const start = useCallback((id) => {
    setJob(null);
    setError(null);
    setJobId(id);
  }, []);

  const reset = useCallback(() => {
    setJobId(null);
    setJob(null);
    setError(null);
  }, []);

  return {
    job,
    isRunning: !!jobId && job && !TERMINAL.has(job.status),
    isDone: job && TERMINAL.has(job.status),
    error,
    start,
    reset,
  };
}
