import { useEffect, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import api from "@/lib/axios"

interface RoomViolation {
  room_code: string
  subject_name: string
  total_violations: number
}

const ViolationStatistics = () => {
  const [rooms, setRooms] = useState<RoomViolation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStatistics()
  }, [])

  const fetchStatistics = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await api.get("/violations/statistics")
      setRooms(res.data.data || [])
    } catch (error: any) {
      console.error("Lỗi lấy thống kê vi phạm:", error)
      setError(error?.response?.data?.message || "Không thể tải dữ liệu thống kê")
    } finally {
      setLoading(false)
    }
  }

  const top5Rooms = [...rooms]
    .sort((a, b) => b.total_violations - a.total_violations)
    .slice(0, 5)

  const totalViolations = rooms.reduce((sum, r) => sum + r.total_violations, 0)

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="h-6 w-48 bg-gray-200 animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-[350px] bg-gray-100 animate-pulse rounded" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="h-6 w-40 bg-gray-200 animate-pulse rounded" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 animate-pulse rounded" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-600">⚠️ {error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
     

      {/* Biểu đồ + Top 5 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Số lượng vi phạm theo phòng thi</CardTitle>
          </CardHeader>
          <CardContent>
            {rooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[350px] text-muted-foreground">
                <p className="text-4xl mb-4">📊</p>
                <p>Chưa có dữ liệu vi phạm</p>
              </div>
            ) : (
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rooms}>
                    <defs>
                      <linearGradient id="violetGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a78bfa" />
                        <stop offset="100%" stopColor="#7c3aed" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="room_code" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => [`${value} vi phạm`, "Số lượng"]}
                      labelFormatter={(label: string) => `Phòng: ${label}`}
                    />
                    <Bar
                      name="Vi phạm"
                      dataKey="total_violations"
                      fill="url(#violetGradient)"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top 5 */}
        <Card>
          <CardHeader>
            <CardTitle>Top 5 phòng nhiều lỗi nhất</CardTitle>
          </CardHeader>
          <CardContent>
            {top5Rooms.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Chưa có dữ liệu
              </p>
            ) : (
              <div className="space-y-3">
                {top5Rooms.map((room, index) => (
                  <div
                    key={room.room_code}
                    className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">
                          {index === 0 && "🥇 "}
                          {index === 1 && "🥈 "}
                          {index === 2 && "🥉 "}
                          {index > 2 && `${index + 1}. `}
                          {room.room_code}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {room.subject_name}
                        </p>
                      </div>
                      <div className="text-right ml-3">
                        <p className="font-bold text-lg text-violet-600">
                          {room.total_violations}
                        </p>
                        <p className="text-xs text-muted-foreground">vi phạm</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ViolationStatistics