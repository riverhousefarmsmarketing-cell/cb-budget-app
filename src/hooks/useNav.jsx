import { createContext, useContext, useState, useCallback } from 'react'

const NavContext = createContext(null)

export function NavProvider({ children }) {
  const [activeView, setActiveView] = useState('dashboard')
  const [drillDown, setDrillDown] = useState(null) // { type: 'project'|'employee'|'client', id, returnView }

  const navigate = useCallback((view) => {
    setDrillDown(null)
    setActiveView(view)
  }, [])

  const openProject = useCallback((id) => {
    setDrillDown({ type: 'project', id, returnView: activeView })
  }, [activeView])

  const openEmployee = useCallback((id) => {
    setDrillDown({ type: 'employee', id, returnView: activeView })
  }, [activeView])

  const openClient = useCallback((id) => {
    setDrillDown({ type: 'client', id, returnView: activeView })
  }, [activeView])

  const goBack = useCallback(() => {
    setDrillDown(null)
  }, [])

  return (
    <NavContext.Provider value={{ activeView, navigate, drillDown, openProject, openEmployee, openClient, goBack }}>
      {children}
    </NavContext.Provider>
  )
}

export function useNav() {
  return useContext(NavContext)
}
