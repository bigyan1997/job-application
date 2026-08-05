import { createContext, useContext, useState } from 'react'
import { setAuthToken, getAuthToken } from '../api'

const AuthContext = createContext(null)

function loadStoredUser() {
  const raw = localStorage.getItem('auth_user')
  return raw ? JSON.parse(raw) : null
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getAuthToken())
  const [user, setUser] = useState(loadStoredUser())

  function login(newToken, newUser) {
    setAuthToken(newToken)
    localStorage.setItem('auth_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  function logout() {
    setAuthToken('')
    localStorage.removeItem('auth_user')
    setToken('')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
