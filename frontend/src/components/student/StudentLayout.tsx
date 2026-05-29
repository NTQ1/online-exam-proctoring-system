import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuthStore } from "@/stores/useAuthStore"
import api from "@/lib/axios"
import { toast } from "sonner"
import { ShieldCheck, LogOut } from "lucide-react"

const StudentLayout = () => {
  const { user, signOut } = useAuthStore()
  const [roomCode, setRoomCode] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [joined, setJoined] = useState(false)
  const [roomInfo, setRoomInfo] = useState<any>(null)

  const handleJoin = async () => {
    if (!roomCode.trim()) {
      toast.error("Vui lòng nhập mã phòng thi")
      return
    }

    try {
      setLoading(true)
      const res = await api.post('/exam-participants/join', {
        code: roomCode,
        password: password || null,
      })
      setRoomInfo(res.data.room)
      setJoined(true)
      toast.success("Tham gia phòng thi thành công!")
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Tham gia thất bại")
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    window.location.href = '/signin'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <ShieldCheck className="size-4 text-white" />
            </div>
            <span className="font-bold text-violet-700">Exam Monitor</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1 text-muted-foreground">
            <LogOut className="size-4" />
            Đăng xuất
          </Button>
        </div>

        {/* Thông tin sinh viên */}
        <Card className="border border-violet-200">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold">
              {user?.last_name?.[0]}{user?.first_name?.[0]}
            </div>
            <div>
              <p className="font-semibold">{user?.last_name} {user?.first_name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </CardContent>
        </Card>

     {joined && (
  <Card className="border border-green-200 bg-green-50">
    <CardContent className="flex flex-col items-center gap-3 py-6">
      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
        <ShieldCheck className="size-6 text-green-600" />
      </div>
      <div className="text-center">
        <p className="font-bold text-green-700">Đã tham gia phòng thi!</p>
        <p className="text-sm text-muted-foreground mt-1">{roomInfo?.subject_name}</p>
        <p className="font-mono font-bold text-green-600 mt-1">{roomInfo?.code}</p>
      </div>

      {/* Hướng dẫn */}
      <div className="w-full bg-white rounded-lg border border-green-200 p-3 flex flex-col gap-2 text-sm">
        <p className="font-semibold text-green-700">Các bước tiếp theo:</p>
        <p>1. Mở <strong>Chrome Extension</strong> Exam Monitor</p>
        <p>2. Nhập mã phòng thi <strong className="font-mono">{roomInfo?.code}</strong></p>
        <p>3. Nhấn <strong>Bắt đầu giám sát</strong></p>
        <p>4. Mở trang thi của bạn</p>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Vui lòng chờ giảng viên bắt đầu phòng thi
      </p>
    </CardContent>
  </Card>
)}

      </div>
    </div>
  )
}

export default StudentLayout