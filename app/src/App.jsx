import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import { CaseProvider } from './data/useCase';
import { EvidencePanelProvider } from './components/EvidencePanel';
import Layout from './components/Layout';
import Login from './views/Login';
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <CaseProvider>
          <EvidencePanelProvider>
            <Routes>
              <Route element={<Layout />}>
                {/* Public routes */}
                <Route index element={<Overview />} />
                <Route path="whats-next" element={<WhatsNext />} />
                <Route path="policy-reforms" element={<PolicyReforms />} />
                <Route path="login" element={<Login />} />

                {/* Protected routes */}
                <Route element={<RequireAuth />}>
                  <Route path="evaluate" element={<EvaluateCase />} />
                  <Route path="cases" element={<Cases />} />
                  <Route path="cases/:id" element={<CaseDetail />} />
                  <Route path="people" element={<People />} />
                  <Route path="people/:id" element={<ProfileDetail />} />
                  <Route path="entities" element={<Entities />} />
                  <Route path="entities/:id" element={<EntityDetail />} />
                  <Route path="entities/:entityId/members/:name" element={<MemberPreview />} />
                  <Route path="non-compliance" element={<NonCompliance />} />
                  <Route path="contradictions" element={<Contradictions />} />
                  <Route path="evidence-gaps" element={<EvidenceGaps />} />
                  <Route path="timeline" element={<Timeline />} />
                  <Route path="sources" element={<Sources />} />
                </Route>
              </Route>
            </Routes>
          </EvidencePanelProvider>
        </CaseProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
