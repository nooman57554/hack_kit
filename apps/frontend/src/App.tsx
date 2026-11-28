import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { PublicOnlyRoute } from "./auth/PublicOnlyRoute";
import { BatchDetailPage } from "./pages/BatchDetailPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PartnerKeysPage } from "./pages/PartnerKeysPage";
import { PartnerVerifyDemoPage } from "./pages/PartnerVerifyDemoPage";
import { RegisterPage } from "./pages/RegisterPage";
import { VerifyCertificatePage } from "./pages/VerifyCertificatePage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/verify" element={<VerifyCertificatePage />} />
          <Route
            path="/verify/:verificationCode"
            element={<VerifyCertificatePage />}
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/batches/:batchId"
            element={
              <ProtectedRoute>
                <BatchDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/partner-keys"
            element={
              <ProtectedRoute>
                <PartnerKeysPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/partner-verify-demo"
            element={
              <ProtectedRoute>
                <PartnerVerifyDemoPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnlyRoute>
                <RegisterPage />
              </PublicOnlyRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
