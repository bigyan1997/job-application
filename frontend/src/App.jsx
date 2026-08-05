import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider, useAuth } from './context/AuthContext'
import TopNav from './components/TopNav'
import Dashboard from './pages/Dashboard'
import Setup from './pages/Setup'
import Login from './pages/Login'

function AuthedApp() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <BrowserRouter>
      <TopNav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/setup" element={<Setup />} />
      </Routes>
    </BrowserRouter>
  )
}

function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <AuthedApp />
      </AuthProvider>
    </GoogleOAuthProvider>
  )
}

export default App
