import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import {
  fetchCase,
  fetchCaseExport,
  fetchEvidenceChecklist,
  fetchRecordsRequestDrafts,
  fetchSelfAdvocacyPacket,
} from '../api/client';
import { printDocument } from '../utils/printPdf';
import {
  Panel,
  StatusPill,
  buildPacketText,
  formatLabel,
} from './caseShared';

export default function SelfAdvocacyPacket() {
  const { caseId } = useParams();
  const [caseRecord, setCaseRecord] = useState(null);
  const [packet, setPacket] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [recordsDrafts, setRecordsDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadPacket = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextCase, nextPacket, nextChecklist, nextRecords] = await Promise.all([
        fetchCase(caseId),
        fetchSelfAdvocacyPacket(caseId).catch(() => null),
        fetchEvidenceChecklist(caseId).catch(() => ({ items: [] })),
        fetchRecordsRequestDrafts(caseId).catch(() => ({ records: [] })),
      ]);
      setCaseRecord(nextCase);
      setPacket(nextPacket);
      setChecklist(nextChecklist.items || []);
      setRecordsDrafts(nextRecords.records || []);
    } catch (err) {
      setError(err.message || 'Failed to load packet');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadPacket();
  }, [loadPacket]);

  const handlePrintPacket = () => {
    printDocument({
      title: packet?.title || `Self-Advocacy Packet - ${caseRecord?.title || 'Case'}`,
      body: buildPacketText(packet, caseRecord),
      meta: {
        District: caseRecord?.intake?.district,
        School: caseRecord?.intake?.school,
        Generated: packet?.generated_at,
      },
    });
  };

  const handleExportCase = async () => {
    setBusy(true);
    setError('');
    try {
      const exported = await fetchCaseExport(caseId);
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `usdwatch-case-${caseId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to export case');
    } finally {
      setBusy(false);
    }
  };

  const evidenceItems = packet?.evidence_checklist || checklist;
  const recordItems = packet?.records_request_drafts || recordsDrafts;

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8 animate-fade-up">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium text-accent/80">Working output</p>
          <h2 className="mt-1 text-3xl font-bold">Self-Advocacy Packet</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-dim">
            A plain-language packet you can print, review before meetings, and update as new evidence comes in.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            disabled={busy || !packet}
            onClick={handlePrintPacket}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print / Save PDF
          </button>
          <button
            disabled={busy}
            onClick={handleExportCase}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export Case JSON
          </button>
        </div>
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {loading && <p className="text-sm text-text-dim">Loading packet...</p>}

      {!loading && !packet && (
        <Panel title="Packet Not Ready Yet" eyebrow="Next step">
          <p className="text-sm leading-relaxed text-text-dim">
            Run a Case Read first. USDWatch will use your story, evidence, and gaps to build the packet.
          </p>
        </Panel>
      )}

      {!loading && packet && (
        <>
          <Panel title="Case Summary" eyebrow="Share carefully">
            <p className="max-w-4xl text-sm leading-relaxed text-text-dim">
              {packet.parent_story || 'No parent story has been entered yet.'}
            </p>
            <p className="mt-4 max-w-4xl text-xs leading-relaxed text-text-dim">
              {packet.disclaimer || 'This packet is informational and is not legal advice.'}
            </p>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Evidence Checklist" eyebrow="What supports the story">
              <div className="divide-y divide-border">
                {evidenceItems.map((item) => (
                  <div key={item.item} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-text">{item.item}</h3>
                      <StatusPill status={item.status} />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-text-dim">{item.why_it_matters}</p>
                  </div>
                ))}
                {!evidenceItems.length && <p className="text-sm text-text-dim">No evidence checklist has been generated yet.</p>}
              </div>
            </Panel>

            <Panel title="Records Request Drafts" eyebrow="Fill the gaps">
              <div className="divide-y divide-border">
                {recordItems.map((record) => (
                  <div key={`${record.title}-${record.custodian}`} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-text">{record.title}</h3>
                      <StatusPill status={record.priority} />
                      {record.record_type && <StatusPill status={record.record_type} />}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-text-dim">{record.reason}</p>
                    <p className="mt-2 text-xs leading-relaxed text-text">{record.request_language}</p>
                  </div>
                ))}
                {!recordItems.length && <p className="text-sm text-text-dim">No records drafts have been generated yet.</p>}
              </div>
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Questions To Ask" eyebrow="Meeting prep">
              <ul className="space-y-2 text-sm leading-relaxed text-text-dim">
                {(packet.questions_to_ask_school || []).map((question) => <li key={question}>{question}</li>)}
                {!packet.questions_to_ask_school?.length && <li>No meeting questions have been generated yet.</li>}
              </ul>
            </Panel>

            <Panel title="Next-Step Plan" eyebrow="Practical actions">
              <ol className="space-y-2 text-sm leading-relaxed text-text-dim">
                {(packet.next_steps || []).map((step) => <li key={step}>{step}</li>)}
                {!packet.next_steps?.length && <li>No next steps have been generated yet.</li>}
              </ol>
              {packet.evidence_strength && (
                <p className="mt-4 text-xs text-text-dim">
                  Evidence strength: <strong className="text-text">{formatLabel(packet.evidence_strength)}</strong>
                </p>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
