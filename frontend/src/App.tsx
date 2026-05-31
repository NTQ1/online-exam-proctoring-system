import { BrowserRouter, Routes, Route } from 'react-router'
import SigninPage from './pages/SigninPage'
import SignupPage from './pages/SignupPage'
import DashboardPage from './pages/DashboardPage'
import { Toaster } from 'sonner'
import ProtectedRoute from './components/auth/ProtectedRoute'
import { TooltipProvider } from '@/components/ui/tooltip'
import ExamRoom from './pages/ExamRoomPage'
import RoomDetailPage from './pages/RoomDetailPage'
import StudentPage from './pages/StudentPage'

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

            {/* admin routes */}
            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/rooms" element={<ExamRoom />} />
              <Route path="/rooms/:id" element={<RoomDetailPage />} />
            </Route>

            {/* student routes */}
            <Route element={<ProtectedRoute allowedRoles={['student']} />}>
              <Route path="/student" element={<StudentPage />} />
            </Route>

            <Route path="/unauthorized" element={
              <div className="flex h-screen items-center justify-center flex-col gap-4">
                <h1 className="text-2xl font-bold text-destructive">Không có quyền truy cập</h1>
                <a href="/signin" className="text-primary underline">Đăng nhập tài khoản khác</a>
              </div>
            } />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </>
  )
}

export default App