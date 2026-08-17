import { Navigate, Route, Routes } from 'react-router-dom'
import Shell from './components/shell'
import AnalyzePage from './pages/analyze'
import DashboardPage from './pages/dashboard'
import KnowledgePage from './pages/knowledge'
import OpportunitiesPage from './pages/opportunities'
import OpportunityDetailPage from './pages/opportunity-detail'
import ProductsPage from './pages/products'
import RelationshipsPage from './pages/relationships'
import WorkspacePage from './pages/workspace'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<WorkspacePage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="relationships" element={<RelationshipsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="opportunities" element={<OpportunitiesPage />} />
        <Route path="opportunities/:id" element={<OpportunityDetailPage />} />
        <Route path="analyze" element={<AnalyzePage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
