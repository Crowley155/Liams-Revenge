import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Routes, Route, useParams } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import { fetchCase } from './api/client';
import { EvidencePanelProvider } from './components/EvidencePanel';
import Layout from './components/Layout';
import CaseFileLayout from './components/CaseFileLayout';
import Login from './views/Login';
import PublicHome from './views/PublicHome';
import Overview from './views/Overview';
import People from './views/People';
import NonCompliance from './views/NonCompliance';
import Sources from './views/Sources';
import WhatsNext from './views/WhatsNext';
import PolicyReforms from './views/PolicyReforms';
import ProfileDetail from './views/ProfileDetail';
import Entities from './views/Entities';
import EntityDetail from './views/EntityDetail';
import MemberPreview from './views/MemberPreview';
import Contradictions from './views/Contradictions';
import EvidenceGaps from './views/EvidenceGaps';
import EvaluateCase from './views/EvaluateCase';
import Cases from './views/Cases';
import CaseDetail from './views/CaseDetail';
import EvidenceLocker from './views/EvidenceLocker';
import RecordsRequests from './views/RecordsRequests';
import CaseEvaluation from './views/CaseEvaluation';
import SelfAdvocacyPacket from './views/SelfAdvocacyPacket';

function restoreGithubPagesSpaPath() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const spaPath = url.searchParams.get('__spa_path');
  if (!spaPath) return;
  window.history.replaceState(null, '', spaPath.startsWith('/') ? spaPath : `/${spaPath}`);
}

function LegacyCaseRedirect({ section = '' }) {
  const params = useParams();
  const itemId = params.personId || params.entityId || params.id;
  const suffix = itemId ? `/${itemId}` : '';
  return <Navigate to={`/cases/crowley-v-usd232/${section}${suffix}`} replace />;
}

function CaseSectionRedirect({ section = '' }) {
  const { caseId } = useParams();
  return <Navigate to={`/cases/${caseId}${section ? `/${section}` : ''}`} replace />;
}

function DemoOnlyRoute({ children, fallbackSection = '' }) {
  const { caseId } = useParams();
  const [caseRecord, setCaseRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCase(caseId)
      .then((record) => {
        if (!cancelled) setCaseRecord(record);
      })
      .catch(() => {
        if (!cancelled) setCaseRecord(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (loading) {
    return <div className="grid min-h-[40vh] place-items-center text-sm text-text-dim">Loading case...</div>;
  }

  if (caseRecord?.status !== 'demo') {
    return <CaseSectionRedirect section={fallbackSection} />;
  }

  return children;
}

export default function App() {
  restoreGithubPagesSpaPath();

  return (
    <AuthProvider>
      <BrowserRouter>
        <EvidencePanelProvider>
          <Routes>
            <Route element={<Layout />}>
              {/* Public routes */}
              <Route index element={<PublicHome />} />
              <Route path="whats-next" element={<WhatsNext />} />
              <Route path="login" element={<Login />} />

              {/* Protected routes */}
              <Route element={<RequireAuth />}>
                <Route path="evaluate" element={<EvaluateCase />} />
                <Route path="cases" element={<Cases />} />
                <Route path="cases/:caseId" element={<CaseFileLayout />}>
                  <Route index element={<CaseDetail />} />
                  <Route path="locker" element={<EvidenceLocker />} />
                  <Route path="records" element={<RecordsRequests />} />
                  <Route path="people" element={<People />} />
                  <Route path="people/:personId" element={<ProfileDetail />} />
                  <Route path="evaluation" element={<CaseEvaluation />} />
                  <Route path="packet" element={<SelfAdvocacyPacket />} />
                  <Route path="overview" element={<DemoOnlyRoute><Overview /></DemoOnlyRoute>} />
                  <Route path="entities" element={<DemoOnlyRoute><Entities /></DemoOnlyRoute>} />
                  <Route path="entities/:entityId" element={<DemoOnlyRoute><EntityDetail /></DemoOnlyRoute>} />
                  <Route path="entities/:entityId/members/:name" element={<DemoOnlyRoute><MemberPreview /></DemoOnlyRoute>} />
                  <Route path="non-compliance" element={<DemoOnlyRoute><NonCompliance /></DemoOnlyRoute>} />
                  <Route path="contradictions" element={<DemoOnlyRoute><Contradictions /></DemoOnlyRoute>} />
                  <Route path="evidence-gaps" element={<DemoOnlyRoute fallbackSection="records"><EvidenceGaps /></DemoOnlyRoute>} />
                  <Route path="timeline" element={<CaseSectionRedirect />} />
                  <Route path="sources" element={<DemoOnlyRoute fallbackSection="locker"><Sources /></DemoOnlyRoute>} />
                  <Route path="policy-reforms" element={<DemoOnlyRoute><PolicyReforms /></DemoOnlyRoute>} />
                </Route>

                <Route path="policy-reforms" element={<LegacyCaseRedirect section="policy-reforms" />} />
                <Route path="people" element={<LegacyCaseRedirect section="people" />} />
                <Route path="people/:id" element={<LegacyCaseRedirect section="people" />} />
                <Route path="entities" element={<LegacyCaseRedirect section="entities" />} />
                <Route path="entities/:id" element={<LegacyCaseRedirect section="entities" />} />
                <Route path="non-compliance" element={<LegacyCaseRedirect section="non-compliance" />} />
                <Route path="contradictions" element={<LegacyCaseRedirect section="contradictions" />} />
                <Route path="evidence-gaps" element={<LegacyCaseRedirect section="evidence-gaps" />} />
                <Route path="timeline" element={<LegacyCaseRedirect />} />
                <Route path="sources" element={<LegacyCaseRedirect section="sources" />} />
              </Route>
            </Route>
          </Routes>
        </EvidencePanelProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
