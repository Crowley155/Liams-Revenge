import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import { CaseProvider } from './data/useCase';
import { EvidencePanelProvider } from './components/EvidencePanel';
import Layout from './components/Layout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import People from './pages/People';
import NonCompliance from './pages/NonCompliance';
import Sources from './pages/Sources';
import WhatsNext from './pages/WhatsNext';
import PolicyReforms from './pages/PolicyReforms';
import ProfileDetail from './pages/ProfileDetail';
import Entities from './pages/Entities';
import EntityDetail from './pages/EntityDetail';
import MemberPreview from './pages/MemberPreview';
import Timeline from './pages/Timeline';
import Contradictions from './pages/Contradictions';
import EvidenceGaps from './pages/EvidenceGaps';

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
