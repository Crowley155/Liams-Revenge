import { BrowserRouter, Navigate, Routes, Route, useParams } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
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
import Timeline from './views/Timeline';
import Contradictions from './views/Contradictions';
import EvidenceGaps from './views/EvidenceGaps';
import EvaluateCase from './views/EvaluateCase';
import Cases from './views/Cases';
import CaseDetail from './views/CaseDetail';

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
                  <Route path="overview" element={<Overview />} />
                  <Route path="people" element={<People />} />
                  <Route path="people/:personId" element={<ProfileDetail />} />
                  <Route path="entities" element={<Entities />} />
                  <Route path="entities/:entityId" element={<EntityDetail />} />
                  <Route path="entities/:entityId/members/:name" element={<MemberPreview />} />
                  <Route path="non-compliance" element={<NonCompliance />} />
                  <Route path="contradictions" element={<Contradictions />} />
                  <Route path="evidence-gaps" element={<EvidenceGaps />} />
                  <Route path="timeline" element={<Timeline />} />
                  <Route path="sources" element={<Sources />} />
                  <Route path="policy-reforms" element={<PolicyReforms />} />
                </Route>

                <Route path="policy-reforms" element={<LegacyCaseRedirect section="policy-reforms" />} />
                <Route path="people" element={<LegacyCaseRedirect section="people" />} />
                <Route path="people/:id" element={<LegacyCaseRedirect section="people" />} />
                <Route path="entities" element={<LegacyCaseRedirect section="entities" />} />
                <Route path="entities/:id" element={<LegacyCaseRedirect section="entities" />} />
                <Route path="non-compliance" element={<LegacyCaseRedirect section="non-compliance" />} />
                <Route path="contradictions" element={<LegacyCaseRedirect section="contradictions" />} />
                <Route path="evidence-gaps" element={<LegacyCaseRedirect section="evidence-gaps" />} />
                <Route path="timeline" element={<LegacyCaseRedirect section="timeline" />} />
                <Route path="sources" element={<LegacyCaseRedirect section="sources" />} />
              </Route>
            </Route>
          </Routes>
        </EvidencePanelProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
