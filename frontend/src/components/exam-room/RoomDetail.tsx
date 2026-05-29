import { useEffect, useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Play, Square } from "lucide-react"
import api from "@/lib/axios"
import { toast } from "sonner"

interface ExamRoom {
  id: number
  code: string
  subject_name: string
  status: 'pending' | 'active' | 'ended'
  monitor_level: 'LOW' | 'MEDIUM' | 'HIGH'
}

interface Participant {
  id: number
  status: 'offline' | 'online' | 'suspicious'
  joined_at: string
  online_duration: number
  student: {
    id: number
    username: string
    first_name: string
    last_name: string
    student_id: string
    email: string
  }
}

const statusMap = {
  pending: { label: 'Chờ bắt đầu', color: 'bg-yellow-100 text-yellow-700' },
  active: { label: 'Đang diễn ra', color: 'bg-green-100 text-green-700' },
  ended: { label: 'Đã kết thúc', color: 'bg-gray-100 text-gray-700' },
}

const participantStatusMap = {
  online: { label: 'Online', color: 'text-green-600', dot: 'bg-green-500' },
  offline: { label: 'Offline', color: 'text-gray-500', dot: 'bg-gray-400' },
  suspicious: { label: 'Đáng ngờ', color: 'text-red-600', dot: 'bg-red-500' },
}

const RoomDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState<ExamRoom | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])

  const fetchRoom = useCallback(async () => {
    try {
      const res = await api.get('/exam-rooms')
      const found = res.data.rooms.find((r: ExamRoom) => r.id === Number(id))
      if (found) setRoom(found)
    } catch (error) {
      console.error(error)
    }
  }, [id])

  const fetchParticipants = useCallback(async () => {
    try {
      const res = await api.get(`/exam-participants/${id}/participants`)
      setParticipants(res.data.participants)
    } catch (error) {
      console.error(error)
    }
  }, [id])

  useEffect(() => {
    fetchRoom()
    fetchParticipants()
  }, [fetchRoom, fetchParticipants])

  const handleStart = async () => {
    try {
      await api.patch(`/exam-rooms/${id}/start`)
      toast.success("Bắt đầu phòng thi thành công!")
      fetchRoom()
    } catch {
      toast.error("Không thể bắt đầu phòng thi")
    }
  }

  const handleEnd = async () => {
    try {
      await api.patch(`/exam-rooms/${id}/end`)
      toast.success("Kết thúc phòng thi thành công!")
      fetchRoom()
    } catch {
      toast.error("Không thể kết thúc phòng thi")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rooms')}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{room?.subject_name}</h1>
          <p className="text-muted-foreground font-mono">{room?.code}</p>
        </div>
        {room && (
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusMap[room.status].color}`}>
              {statusMap[room.status].label}
            </span>
            {room.status === 'pending' && (
              <Button size="sm" className="gap-1" onClick={handleStart}>
                <Play className="size-3" />
                Bắt đầu
              </Button>
            )}
            {room.status === 'active' && (
              <Button size="sm" variant="destructive" className="gap-1" onClick={handleEnd}>
                <Square className="size-3" />
                Kết thúc
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Danh sách sinh viên */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách sinh viên ({participants.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-3 font-medium">#</th>
                <th className="text-left py-3 font-medium">Họ và tên</th>
                <th className="text-left py-3 font-medium">MSSV</th>
                <th className="text-left py-3 font-medium">Email</th>
                <th className="text-left py-3 font-medium">Trạng thái</th>
                <th className="text-left py-3 font-medium">Tham gia lúc</th>
              </tr>
            </thead>
            <tbody>
              {participants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-muted-foreground">
                    Chưa có sinh viên nào tham gia
                  </td>
                </tr>
              ) : (
                participants.map((p, index) => (
                  <tr key={p.id} className="border-b hover:bg-muted/50">
                    <td className="py-3">{index + 1}</td>
                    <td className="py-3 font-medium">{p.student.last_name} {p.student.first_name}</td>
                    <td className="py-3">{p.student.student_id || '--'}</td>
                    <td className="py-3">{p.student.email}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${participantStatusMap[p.status].dot}`} />
                        <span className={participantStatusMap[p.status].color}>
                          {participantStatusMap[p.status].label}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {new Date(p.joined_at).toLocaleTimeString('vi-VN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

export default RoomDetailPage