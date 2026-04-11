import { HashRouter, Routes, Route } from 'react-router-dom';
import { CaseProvider } from './data/useCase';
import { EvidencePanelProvider } from './components/EvidencePanel';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import People from './pages/People';
import NonCompliance from './pages/NonCompliance';
import Sources from './pages/Sources';

export default function App() {
  return (
    <HashRouter>
      <CaseProvider>
        <EvidencePanelProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Overview />} />
              <Route path="people" element={<People />} />
              <Route path="non-compliance" element={<NonCompliance />} />
              <Route path="sources" element={<Sources />} />
            </Route>
          </Routes>
        </EvidencePanelProvider>
      </CaseProvider>
    </HashRouter>
  );
}
