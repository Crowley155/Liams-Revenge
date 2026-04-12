import { useState, useEffect, useRef, useCallback } from 'react';
import { getJobStatus } from '../api/client';

const TERMINAL = new Set(['complete', 'failed']);
const POLL_MS = 2000;

export default function useResearchJob({ onComplete } = {}) {
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const timerRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await getJobStatus(jobId);
        if (cancelled) return;
        setJob(data);
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
