import { BrowserRouter, Routes, Route } from 'react-router'
import SigninPage from './pages/SigninPage'
import SignupPage from './pages/SignupPage'
import DashboardPage from './pages/DashboardPage'
import { Toaster } from 'sonner'
import ProtectedRoute from './components/auth/ProtectedRoute'
import { TooltipProvider } from '@/components/ui/tooltip'
import ExamRoom from './pages/ExamRoom'

function App() {

  return (  
   <>
   <Toaster richColors/>
   <TooltipProvider>
   <BrowserRouter>
    <Routes>
      {/* public routes */}
      <Route path="/signin" element={<SigninPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* private routes */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/rooms" element={<ExamRoom />} />
      </Route>
    </Routes>
   </BrowserRouter>
   </TooltipProvider>
   </>
  )
}

export default App
