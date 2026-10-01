import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import RecordsDashboard from './pages/RecordsDashboard';
import SecurityPortal from './pages/SecurityPortal';
import VerificationWorkspace from './pages/VerificationWorkspace';
import ComparisonPage from './pages/ComparisonPage';
 
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/records" element={<RecordsDashboard />} />
        <Route path="/login" element={<SecurityPortal />} />
        <Route path="/upload" element={<VerificationWorkspace />} />
        <Route path="/compare/:validationId" element={<ComparisonPage />} />
        <Route path="/dashboard" element={<Navigate to="/records" replace />} />
        <Route path="/pending" element={<Navigate to="/records" replace />} />
        <Route path="/archive" element={<Navigate to="/records" replace />} />
        <Route path="/settings" element={<Navigate to="/login" replace />} />
        <Route path="/support" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
 
