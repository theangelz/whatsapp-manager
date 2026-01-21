import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { MainLayout } from '@/components/layout/MainLayout'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Instances } from '@/pages/Instances'
import { Messages } from '@/pages/Messages'
import { Contacts } from '@/pages/Contacts'
import { Campaigns } from '@/pages/Campaigns'
import { Templates } from '@/pages/Templates'
import { Typebot } from '@/pages/Typebot'
import { Webhooks } from '@/pages/Webhooks'
import { Settings } from '@/pages/Settings'
import { ApiDocs } from '@/pages/ApiDocs'
import { Flows } from '@/pages/Flows'
import { FlowEditor } from '@/pages/FlowEditor'
import { Admin } from '@/pages/Admin'
import { Groups } from '@/pages/Groups'
import { WebhookEvents } from '@/pages/WebhookEvents'
import { Automations } from '@/pages/Automations'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      <Route
        element={
          <PrivateRoute>
            <MainLayout />
          </PrivateRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/instances" element={<Instances />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/typebot" element={<Typebot />} />
        <Route path="/webhooks" element={<Webhooks />} />
        <Route path="/api-docs" element={<ApiDocs />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/flows" element={<Flows />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/webhook-events" element={<WebhookEvents />} />
        <Route path="/automations" element={<Automations />} />
      </Route>

      {/* FlowEditor has its own layout */}
      <Route
        path="/flows/:id"
        element={
          <PrivateRoute>
            <FlowEditor />
          </PrivateRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
