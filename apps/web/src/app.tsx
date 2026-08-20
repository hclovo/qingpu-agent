import { Navigate, Route, Routes } from 'react-router-dom'
import Shell from './components/shell'
import { RequireAuth, RequirePermission, useAuth } from './lib/auth'
import AnalyzePage from './pages/analyze'
import DashboardPage from './pages/dashboard'
import KnowledgePage from './pages/knowledge'
import LoginPage from './pages/login'
import OpportunitiesPage from './pages/opportunities'
import OpportunityDetailPage from './pages/opportunity-detail'
import ProductsPage from './pages/products'
import RelationshipsPage from './pages/relationships'
import RolesPage from './pages/roles'
import UsersPage from './pages/users'
import WorkspacePage from './pages/workspace'

function HomeRoute() {
  const { has } = useAuth()
  return has('agent.chat') ? <WorkspacePage /> : <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<HomeRoute />} />
        <Route path="dashboard" element={<RequirePermission permission="dashboard.read"><DashboardPage /></RequirePermission>} />
        <Route path="relationships" element={<RequirePermission permission="relationships.read"><RelationshipsPage /></RequirePermission>} />
        <Route path="knowledge" element={<RequirePermission permission="knowledge.read"><KnowledgePage /></RequirePermission>} />
        <Route path="opportunities" element={<RequirePermission permission="opportunities.read"><OpportunitiesPage /></RequirePermission>} />
        <Route path="opportunities/:id" element={<RequirePermission permission="opportunities.read"><OpportunityDetailPage /></RequirePermission>} />
        <Route path="analyze" element={<RequirePermission permission="opportunities.analyze"><AnalyzePage /></RequirePermission>} />
        <Route path="products" element={<RequirePermission permission="products.read"><ProductsPage /></RequirePermission>} />
        <Route path="settings/users" element={<RequirePermission permission="users.read" fallback="/"><UsersPage /></RequirePermission>} />
        <Route path="settings/roles" element={<RequirePermission permission="roles.read" fallback="/"><RolesPage /></RequirePermission>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
