import './App.css'
import { lazy, Suspense } from 'react'
import Login from './pages/Login'
import Register from './pages/Register'
import { createBrowserRouter, createRoutesFromElements, Outlet, Route, RouterProvider } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { STAFF_ROLES } from './context/auth'
import RootRedirect from './components/RootRedirect'
import ForgotPassword from './pages/ForgotPassword'
import NotFound from './pages/NotFound'
import AuthCallback from './pages/AuthCallback'
import CitizenHome from './pages/CitizenHome'
import AcceptInvitation from './pages/AcceptInvitation'
import TrackReport from './pages/TrackReport'
import MyReports from './pages/MyReports'
import PrivacyNotice from './pages/PrivacyNotice'
import './pages/InteractiveMap.css'
import './pages/Dashboard.css'
import './pages/Reports.css'
import './pages/Account.css'
import './Viewport.css'

const InteractiveMap = lazy(() => import('./pages/InteractiveMap'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Reports = lazy(() => import('./pages/Reports'))
const NewReport = lazy(() => import('./pages/NewReport'))
const Account = lazy(() => import('./pages/Account'))

const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<Suspense fallback={<main className="sip-loading" role="status">Cargando pantalla…</main>}><Outlet /></Suspense>}>
    <Route path="/" element={<RootRedirect />} />
    <Route path="/map" element={<ProtectedRoute roles={STAFF_ROLES}><InteractiveMap /></ProtectedRoute>} />
    <Route path="/login" element={<Login />} />
    <Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/aceptar-invitacion" element={<AcceptInvitation />} />
    <Route path="/inicio" element={<CitizenHome />} />
    <Route path="/reportar" element={<NewReport />} />
    <Route path="/mis-reportes" element={<MyReports />} />
    <Route path="/consultar-folio" element={<TrackReport />} />
    <Route path="/aviso-privacidad" element={<PrivacyNotice />} />
    <Route path="/mi-cuenta" element={<ProtectedRoute><Account /></ProtectedRoute>} />
    <Route path="/dashboard" element={<ProtectedRoute roles={STAFF_ROLES}><Dashboard /></ProtectedRoute>} />
    <Route path="/reports" element={<ProtectedRoute roles={STAFF_ROLES}><Reports /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Route>,
))

function App() {
  return <RouterProvider router={router} />
}

export default App
