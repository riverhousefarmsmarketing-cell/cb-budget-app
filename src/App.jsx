import { useAuth } from './hooks/useAuth'
import { NavProvider, useNav } from './hooks/useNav'
import AppShell from './layouts/AppShell'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import EmployeesPage from './pages/EmployeesPage'
import WorkPage from './pages/WorkPage'
import HoursRevenuePage from './pages/HoursRevenuePage'
import CommercialPage from './pages/CommercialPage'
import ForecastPlannerPage from './pages/ForecastPlannerPage'
import SettingsPage from './pages/SettingsPage'
import ProjectProfilePage from './pages/ProjectProfilePage'
import EmployeeProfilePage from './pages/EmployeeProfilePage'
import ClientProfilePage from './pages/ClientProfilePage'

const VIEW_MAP = {
  dashboard: DashboardPage,
  people: EmployeesPage,
  work: WorkPage,
  hoursrevenue: HoursRevenuePage,
  commercial: CommercialPage,
  forecast: ForecastPlannerPage,
  settings: SettingsPage,
}

function AppContent() {
  const { session, loading, signIn, signOut } = useAuth()
  const { activeView, navigate, drillDown, goBack } = useNav()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif", color: '#63666A',
      }}>Loading...</div>
    )
  }

  if (!session) return <LoginPage onSignIn={signIn} />

  // Global drill-down: profile pages overlay from any context
  let content
  if (drillDown?.type === 'project') {
    content = <ProjectProfilePage projectId={drillDown.id} onBack={goBack} />
  } else if (drillDown?.type === 'employee') {
    content = <EmployeeProfilePage employeeId={drillDown.id} onBack={goBack} />
  } else if (drillDown?.type === 'client') {
    content = <ClientProfilePage clientId={drillDown.id} onBack={goBack} />
  } else {
    const ActivePage = VIEW_MAP[activeView] || DashboardPage
    content = <ActivePage onNavigate={navigate} />
  }

  return (
    <AppShell activeView={activeView} onNavigate={navigate} onSignOut={signOut}>
      {content}
    </AppShell>
  )
}

export default function App() {
  return (
    <NavProvider>
      <AppContent />
    </NavProvider>
  )
}
