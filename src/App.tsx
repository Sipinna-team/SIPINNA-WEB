import './App.css'
import InteractiveMap from './pages/InteractiveMap'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import RootRedirect from './components/RootRedirect'
import ForgotPassword from './pages/ForgotPassword'
import NotFound from './pages/NotFound'
import Reports from './pages/Reports'
import AuthCallback from './pages/AuthCallback'
import CitizenHome from './pages/CitizenHome'

/**
 * Raíz de la app: define las rutas públicas y las protegidas por sesión.
 * Cualquier ruta desconocida muestra la página 404 en vez de quedar en blanco.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/map" element={<ProtectedRoute><InteractiveMap /></ProtectedRoute>} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/inicio" element={<ProtectedRoute><CitizenHome /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}/>
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App