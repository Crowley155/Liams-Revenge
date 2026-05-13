import { lazy, Suspense, useEffect, useState } from 'react';
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react';
import { BrowserRouter, Navigate, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import { fetchCase, openOrCreateDraftCase } from './api/client';
import { EvidencePanelProvider } from './components/EvidencePanel';
import Layout from './components/Layout';
import { hasCasePolicyReforms } from './utils/casePolicyReforms';

const CaseFileLayout = lazy(() => import('./components/CaseFileLayout'));
const Login = lazy(() => import('./views/Login'));
const PublicHome = lazy(() => import('./views/PublicHome'));
const StaticEditorialPage = lazy(() => import('./views/StaticEditorialPage'));
const Overview = lazy(() => import('./views/Overview'));
const People = lazy(() => import('./views/People'));
const NonCompliance = lazy(() => import('./views/NonCompliance'));
const Sources = lazy(() => import('./views/Sources'));
const WhatsNext = lazy(() => import('./views/WhatsNext'));
const PolicyReforms = lazy(() => import('./views/PolicyReforms'));
const ProfileDetail = lazy(() => import('./views/ProfileDetail'));
const Entities = lazy(() => import('./views/Entities'));
const EntityDetail = lazy(() => import('./views/EntityDetail'));
const MemberPreview = lazy(() => import('./views/MemberPreview'));
const Contradictions = lazy(() => import('./views/Contradictions'));
const EvidenceGaps = lazy(() => import('./views/EvidenceGaps'));
const Cases = lazy(() => import('./views/Cases'));
const CaseDetail = lazy(() => import('./views/CaseDetail'));
const EvidenceLocker = lazy(() => import('./views/EvidenceLocker'));
const DocumentReview = lazy(() => import('./views/DocumentReview'));
const RecordsRequests = lazy(() => import('./views/RecordsRequests'));
const SelfAdvocacyPacket = lazy(() => import('./views/SelfAdvocacyPacket'));
const CaseSettings = lazy(() => import('./views/CaseSettings'));

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

function RouteFallback() {
  return <div className="grid min-h-[40vh] place-items-center text-sm text-text-dim">Loading workspace...</div>;
}

function SsoCallback() {
  const fallback = typeof window !== 'undefined'
    ? window.sessionStorage?.getItem('usdwatch:gmail-return-url') || '/cases'
    : '/cases';
  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-text-dim">
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl={fallback}
        signUpFallbackRedirectUrl={fallback}
      />
    </div>
  );
}

function EvaluateRedirect() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    openOrCreateDraftCase()
      .then((caseRecord) => {
        if (!cancelled) navigate(`/cases/${caseRecord.id}?chat=open`, { replace: true });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not open your draft case');
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (error) {
    return <div className="mx-auto max-w-2xl py-10 text-sm text-danger">{error}</div>;
  }

  return <div className="grid min-h-[40vh] place-items-center text-sm text-text-dim">Opening your draft case...</div>;
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

function PolicyReformsRoute() {
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

  if (loading) return <RouteFallback />;
  if (!hasCasePolicyReforms(caseRecord)) return <Navigate to={`/cases/${caseId}`} replace />;
  return <PolicyReforms />;
}

export default function App() {
  restoreGithubPagesSpaPath();

  return (
    <AuthProvider>
      <BrowserRouter>
        <EvidencePanelProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route element={<Layout />}>
                {/* Public routes */}
                <Route index element={<PublicHome />} />
                <Route path="whats-next" element={<WhatsNext />} />
                <Route path="trust" element={<StaticEditorialPage pagePath="/trust" />} />
                <Route path="ai-disclosure" element={<StaticEditorialPage pagePath="/ai-disclosure" />} />
                <Route path="privacy" element={<StaticEditorialPage pagePath="/privacy" />} />
                <Route path="login" element={<Login />} />
                <Route path="sso-callback" element={<SsoCallback />} />

                {/* Protected routes */}
                <Route element={<RequireAuth />}>
                  <Route path="evaluate" element={<EvaluateRedirect />} />
                  <Route path="cases" element={<Cases />} />
                  <Route path="cases/:caseId" element={<CaseFileLayout />}>
                    <Route index element={<CaseDetail />} />
                    <Route path="locker" element={<EvidenceLocker />} />
                    <Route path="locker/:docId" element={<DocumentReview />} />
                    <Route path="records" element={<RecordsRequests />} />
                    <Route path="people" element={<People />} />
                    <Route path="people/:personId" element={<ProfileDetail />} />
                    <Route path="evaluation" element={<CaseSectionRedirect />} />
                    <Route path="packet" element={<SelfAdvocacyPacket />} />
                    <Route path="settings" element={<CaseSettings />} />
                    <Route path="overview" element={<DemoOnlyRoute><Overview /></DemoOnlyRoute>} />
                    <Route path="entities" element={<DemoOnlyRoute><Entities /></DemoOnlyRoute>} />
                    <Route path="entities/:entityId" element={<DemoOnlyRoute><EntityDetail /></DemoOnlyRoute>} />
                    <Route path="entities/:entityId/members/:name" element={<DemoOnlyRoute><MemberPreview /></DemoOnlyRoute>} />
                    <Route path="non-compliance" element={<DemoOnlyRoute><NonCompliance /></DemoOnlyRoute>} />
                    <Route path="contradictions" element={<DemoOnlyRoute><Contradictions /></DemoOnlyRoute>} />
                    <Route path="evidence-gaps" element={<DemoOnlyRoute fallbackSection="records"><EvidenceGaps /></DemoOnlyRoute>} />
                    <Route path="timeline" element={<CaseSectionRedirect />} />
                    <Route path="sources" element={<DemoOnlyRoute fallbackSection="locker"><Sources /></DemoOnlyRoute>} />
                    <Route path="policy-reforms" element={<PolicyReformsRoute />} />
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
          </Suspense>
        </EvidencePanelProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
