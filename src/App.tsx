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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* La raíz manda directo a /login sin sesión, o al dashboard si ya hay una. */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="/map" element={<ProtectedRoute><InteractiveMap /></ProtectedRoute>} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}/>
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        {/* Cualquier ruta desconocida muestra la página 404 en vez de quedar en blanco. */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App