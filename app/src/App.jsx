import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import EntityDetail from './pages/EntityDetail';
import MemberPreview from './pages/MemberPreview';

function IdentityRedirect() {
  const { id } = useParams();
  return <Navigate to={`/people/${id}`} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
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
                  <Route path="people/:id/identity" element={<IdentityRedirect />} />
                  <Route path="entities/:id" element={<EntityDetail />} />
                  <Route path="entities/:entityId/members/:name" element={<MemberPreview />} />
                  <Route path="non-compliance" element={<NonCompliance />} />
                  <Route path="sources" element={<Sources />} />
                </Route>
              </Route>
            </Routes>
          </EvidencePanelProvider>
        </CaseProvider>
      </HashRouter>
    </AuthProvider>
  );
}
