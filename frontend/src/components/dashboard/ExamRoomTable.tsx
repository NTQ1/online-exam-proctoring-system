import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, MoreVertical } from "lucide-react"
import api from "@/lib/axios"
import CreateExamRoomDialog from "./CreateExamRoomDialog"

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

const ExamRoomTable = () => {
  const [rooms, setRooms] = useState<ExamRoom[]>([])
  const [openDialog, setOpenDialog] = useState(false)

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

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Phòng thi</CardTitle>
          <Button className="gap-2" onClick={() => setOpenDialog(true)}>
            <Plus className="size-4" />
            Tạo phòng thi
          </Button>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-3 font-medium">Mã phòng thi</th>
                <th className="text-left py-3 font-medium">Môn học</th>
                <th className="text-left py-3 font-medium">Mức giám sát</th>
                <th className="text-left py-3 font-medium">Trạng thái</th>
                <th className="text-left py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rooms.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-muted-foreground">
                    Chưa có phòng thi nào
                  </td>
                </tr>
              ) : (
                rooms.map((room) => (
                  <tr key={room.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 font-mono font-semibold">{room.code}</td>
                    <td className="py-3">{room.subject_name}</td>
                    <td className="py-3">{room.monitor_level}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusMap[room.status].color}`}>
                        {statusMap[room.status].label}
                      </span>
                    </td>
                    <td className="py-3">
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CreateExamRoomDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        onCreated={fetchRooms}
      />
    </>
  )
}

export default ExamRoomTable