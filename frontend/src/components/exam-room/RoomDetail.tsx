import { useEffect, useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft, Play, Square, RefreshCw, AlertTriangle, Camera, ShieldCheck, ShieldX, Clock
} from "lucide-react"
import api from "@/lib/axios"
import { toast } from "sonner"
import SessionDetailDialog from "./SessionDetailDialog"

const API_BASE = "http://localhost:5001"

interface ExamRoom {
  id: number
  code: string
  subject_name: string
  status: 'pending' | 'active' | 'ended'
  monitor_level: 'LOW' | 'MEDIUM' | 'HIGH'
}

interface ViolationSummary {
  id: string
  type: string
  severity: string | null
  timestamp: string
  details: Record<string, unknown>
  image_url: string | null
}

interface MonitoringSession {
  id: string
  status: 'authenticated' | 'active' | 'ended' | 'finalized'
  start_time: string | null
  end_time: string | null
  end_reason: string | null
  screenshot_url: string | null
  verdict: 'clean' | 'violated' | 'pending' | null
  violations: ViolationSummary[]
}

interface Participant {
  id: number
  student_name: string
  student_id_string: string
  status: 'offline' | 'online' | 'suspicious'
  joined_at: string | null
  sessions: MonitoringSession[]
}

const roomStatusMap = {
  pending:  { label: 'Chờ bắt đầu',  color: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  active:   { label: 'Đang diễn ra', color: 'bg-green-100  text-green-700  border border-green-200'  },
  ended:    { label: 'Đã kết thúc',  color: 'bg-gray-100   text-gray-600   border border-gray-200'   },
}

const participantStatusMap = {
  online:     { label: 'Online',    dot: 'bg-green-500',  text: 'text-green-600' },
  offline:    { label: 'Offline',   dot: 'bg-gray-400',   text: 'text-gray-500'  },
  suspicious: { label: 'Đáng ngờ', dot: 'bg-red-500',    text: 'text-red-600'   },
}

const verdictMap = {
  clean:    { label: 'Sạch',      icon: ShieldCheck, color: 'text-green-600' },
  violated: { label: 'Vi phạm',   icon: ShieldX,     color: 'text-red-600'   },
  pending:  { label: 'Chờ xét',   icon: Clock,       color: 'text-yellow-600'},
}

const RoomDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [room, setRoom]                   = useState<ExamRoom | null>(null)
  const [participants, setParticipants]   = useState<Participant[]>([])
  const [refreshing, setRefreshing]       = useState(false)
  const [selectedSession, setSelectedSession] = useState<MonitoringSession | null>(null)

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

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchRoom(), fetchParticipants()])
    setRefreshing(false)
  }

  useEffect(() => {
    fetchRoom()
    fetchParticipants()

    // Auto-refresh mỗi 15s khi phòng thi đang active
    const interval = setInterval(() => {
      fetchParticipants()
    }, 15000)
    return () => clearInterval(interval)
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

  // Lấy session mới nhất của participant
  const getLatestSession = (p: Participant): MonitoringSession | null => {
    if (!p.sessions || p.sessions.length === 0) return null
    return p.sessions[p.sessions.length - 1]
  }

  // Thống kê nhanh
  const onlineCount     = participants.filter(p => p.status === 'online').length
  const suspiciousCount = participants.filter(p => p.status === 'suspicious').length
  const violatedCount   = participants.filter(p => {
    const s = getLatestSession(p)
    return s?.verdict === 'violated'
  }).length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rooms')}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{room?.subject_name}</h1>
          <p className="text-muted-foreground font-mono text-sm">{room?.code}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          {room && (
            <>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${roomStatusMap[room.status].color}`}>
                {roomStatusMap[room.status].label}
              </span>
              {room.status === 'pending' && (
                <Button size="sm" className="gap-1" onClick={handleStart}>
                  <Play className="size-3" /> Bắt đầu
                </Button>
              )}
              {room.status === 'active' && (
                <Button size="sm" variant="destructive" className="gap-1" onClick={handleEnd}>
                  <Square className="size-3" /> Kết thúc
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="py-4">
          <CardContent className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Đang online</p>
              <p className="text-2xl font-bold">{onlineCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center gap-3">
            <AlertTriangle className="size-5 text-yellow-500" />
            <div>
              <p className="text-xs text-muted-foreground">Đáng ngờ</p>
              <p className="text-2xl font-bold">{suspiciousCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center gap-3">
            <ShieldX className="size-5 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">Vi phạm</p>
              <p className="text-2xl font-bold">{violatedCount}</p>
            </div>
          </CardContent>
        </Card>
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
                <th className="text-left py-3 pr-4 font-medium">#</th>
                <th className="text-left py-3 pr-4 font-medium">Họ và tên</th>
                <th className="text-left py-3 pr-4 font-medium">MSSV</th>
                <th className="text-left py-3 pr-4 font-medium">Trạng thái</th>
                <th className="text-left py-3 pr-4 font-medium">Vi phạm</th>
                <th className="text-left py-3 pr-4 font-medium">AI phát hiện</th>
                <th className="text-left py-3 pr-4 font-medium">Kết quả</th>
                <th className="text-left py-3 pr-4 font-medium">Ảnh cuối</th>
                <th className="text-left py-3 font-medium">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {participants.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-muted-foreground">
                    Chưa có sinh viên nào tham gia
                  </td>
                </tr>
              ) : (
                participants.map((p, index) => {
                  const session = getLatestSession(p)
                  const totalViolations  = session?.violations?.length ?? 0
                  const aiViolations     = session?.violations?.filter(v => v.type === 'ai_violation').length ?? 0
                  const verdict          = session?.verdict ?? null
                  const verdictInfo      = verdict ? verdictMap[verdict] : null
                  const screenshotUrl    = session?.screenshot_url
                    ? `${API_BASE}${session.screenshot_url}`
                    : null

                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 pr-4 text-muted-foreground">{index + 1}</td>
                      <td className="py-3 pr-4 font-medium">{p.student_name}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{p.student_id_string || '--'}</td>

                      {/* Trạng thái */}
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${participantStatusMap[p.status].dot}`} />
                          <span className={participantStatusMap[p.status].text}>
                            {participantStatusMap[p.status].label}
                          </span>
                        </div>
                      </td>

                      {/* Số vi phạm */}
                      <td className="py-3 pr-4">
                        {totalViolations > 0 ? (
                          <span className="inline-flex items-center gap-1 text-orange-600 font-semibold">
                            <AlertTriangle className="size-3" />
                            {totalViolations}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* AI violations */}
                      <td className="py-3 pr-4">
                        {aiViolations > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                            <Camera className="size-3" />
                            {aiViolations}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Verdict */}
                      <td className="py-3 pr-4">
                        {verdictInfo ? (
                          <span className={`inline-flex items-center gap-1 font-medium ${verdictInfo.color}`}>
                            <verdictInfo.icon className="size-3" />
                            {verdictInfo.label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Screenshot thumbnail */}
                      <td className="py-3 pr-4">
                        {screenshotUrl ? (
                          <a href={screenshotUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={screenshotUrl}
                              alt="screenshot"
                              className="w-16 h-10 object-cover rounded border hover:opacity-80 transition-opacity"
                            />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Chi tiết */}
                      <td className="py-3">
                        {session ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => setSelectedSession(session)}
                          >
                            Xem
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">Chưa có</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Session detail dialog */}
      {selectedSession && (
        <SessionDetailDialog
          session={selectedSession}
          apiBase={API_BASE}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  )
}

export default RoomDetailPage