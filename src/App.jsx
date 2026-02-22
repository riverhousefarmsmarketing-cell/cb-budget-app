import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { NavProvider, useNav } from './hooks/useNav'
import LandingPage, { isDemoAuthenticated } from './pages/LandingPage'
import AppShell from './layouts/AppShell'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import EmployeesPage from './pages/EmployeesPage'
import WorkPage from './pages/WorkPage'
import HoursRevenuePage from './pages/HoursRevenuePage'
import CommercialPage from './pages/CommercialPage'
import ForecastPlannerPage from './pages/ForecastPlannerPage'
import ActionTrackerPage from './pages/ActionTrackerPage'
import RAIDLogPage from './pages/RAIDLogPage'
import QualityDashboardPage from './pages/QualityDashboardPage'
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
  actions: ActionTrackerPage,
  raid: RAIDLogPage,
  quality: QualityDashboardPage,
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
  const [demoAccess, setDemoAccess] = useState(isDemoAuthenticated())

  // Landing page gate — must enter access code before reaching the app
  if (!demoAccess) {
    return <LandingPage onEnter={() => setDemoAccess(true)} />
  }

  return (
    <NavProvider>
      <AppContent />
    </NavProvider>
  )
}
