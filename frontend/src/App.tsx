import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import AuditLogPage from '@/pages/AuditLogPage'
import CredentialsPage from '@/pages/CredentialsPage'
import DashboardPage from '@/pages/DashboardPage'
import DeployPage from '@/pages/DeployPage'
import HistoryPage from '@/pages/HistoryPage'
import InventoryPage from '@/pages/InventoryPage'
import LoginPage from '@/pages/LoginPage'
import MonitorPage from '@/pages/MonitorPage'
import TemplatesPage from '@/pages/TemplatesPage'
import UsersPage from '@/pages/UsersPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/monitor" element={<MonitorPage />} />
            <Route path="/credentials" element={<CredentialsPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/deploy" element={<DeployPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/audit" element={<AuditLogPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
