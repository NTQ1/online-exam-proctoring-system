import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Play, Square, Trash2 } from "lucide-react"
import api from "@/lib/axios"
import { toast } from "sonner"
import CreateExamRoomDialog from "@/components/dashboard/CreateExamRoomDialog"
import { useNavigate } from "react-router"

interface ExamRoom {
  id: number
  code: string
  subject_name: string
  status: 'pending' | 'active' | 'ended'
  monitor_level: 'LOW' | 'MEDIUM' | 'HIGH'
  createdAt: string
}

const statusMap = {
  pending: { label: 'Chờ bắt đầu', color: 'bg-yellow-100 text-yellow-700' },
  active: { label: 'Đang diễn ra', color: 'bg-green-100 text-green-700' },
  ended: { label: 'Đã kết thúc', color: 'bg-gray-100 text-gray-700' },
}

const monitorMap = {
  LOW: { label: 'Thấp', color: 'text-green-600' },
  MEDIUM: { label: 'Trung bình', color: 'text-yellow-600' },
  HIGH: { label: 'Cao', color: 'text-red-600' },
}

const RoomsPage = () => {
  const [rooms, setRooms] = useState<ExamRoom[]>([])
  const [openDialog, setOpenDialog] = useState(false)
  const navigate = useNavigate()

  const fetchRooms = useCallback(async () => {
    try {
      const res = await api.get('/exam-rooms')
      setRooms(res.data.rooms)
    } catch (error) {
      console.error(error)
    }
  }, [])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  const handleStart = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    try {
      await api.patch(`/exam-rooms/${id}/start`)
      toast.success("Bắt đầu phòng thi thành công!")
      fetchRooms()
    } catch (error) {
      toast.error("Không thể bắt đầu phòng thi")
    }
  }

  const handleEnd = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    try {
      await api.patch(`/exam-rooms/${id}/end`)
      toast.success("Kết thúc phòng thi thành công!")
      fetchRooms()
    } catch (error) {
      toast.error("Không thể kết thúc phòng thi")
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    try {
      await api.delete(`/exam-rooms/${id}`)
      toast.success("Xóa phòng thi thành công!")
      fetchRooms()
    } catch (error) {
      toast.error("Không thể xóa phòng thi")
    }
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Phòng thi</h1>
          <Button className="gap-2" onClick={() => setOpenDialog(true)}>
            <Plus className="size-4" />
            Tạo phòng thi
          </Button>
        </div>

        {rooms.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Chưa có phòng thi nào
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <Card
                key={room.id}
                className="border border-violet-100 hover:shadow-md transition-shadow cursor-pointer hover:border-violet-300 hover:bg-gradient-to-br hover:from-violet-50 hover:to-purple-50"
                onClick={() => navigate(`/rooms/${room.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-violet-700 text-lg">{room.code}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusMap[room.status].color}`}>
                      {statusMap[room.status].label}
                    </span>
                  </div>
                  <CardTitle className="text-base">{room.subject_name}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Mức giám sát</span>
                    <span className={`font-semibold ${monitorMap[room.monitor_level].color}`}>
                      {monitorMap[room.monitor_level].label}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-1">
                    {room.status === 'pending' && (
                      <>
                        <Button size="sm" className="flex-1 gap-1" onClick={(e) => handleStart(e, room.id)}>
                          <Play className="size-3" />
                          Bắt đầu
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={(e) => handleDelete(e, room.id)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </>
                    )}
                    {room.status === 'active' && (
                      <Button size="sm" variant="destructive" className="flex-1 gap-1" onClick={(e) => handleEnd(e, room.id)}>
                        <Square className="size-3" />
                        Kết thúc
                      </Button>
                    )}
                    {room.status === 'ended' && (
                      <Button size="sm" variant="outline" className="flex-1" disabled>
                        Đã kết thúc
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateExamRoomDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        onCreated={fetchRooms}
      />
    </>
  )
}

export default RoomsPage