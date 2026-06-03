import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import api from "@/lib/axios"

interface ViolationLog {
  id: string
  type: string
  severity: string
  timestamp: string
  violationParticipant: {
    student_name: string
  }
}

const violationTypeMap: Record<string, string> = {
  multiple_faces: "Phát hiện nhiều khuôn mặt",
  no_face_detected: "Không phát hiện khuôn mặt",
  tab_switch: "Chuyển tab",
  TAB_AWAY: "Rời khỏi tab thi",
  TAB_RETURN: "Quay lại tab thi",
  window_blur: "Mất tiêu điểm cửa sổ",
  fullscreen_exit: "Thoát chế độ toàn màn hình",
  FULLSCREEN_EXIT: "Thoát chế độ toàn màn hình",
  copy_paste: "Sao chép/Dán",
  devtools_open: "Mở DevTools",
  ai_violation: "Vi phạm do AI phát hiện",
  disconnect: "Mất kết nối",
  unknown: "Vi phạm khác",
}

const severityMap: Record<string, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-700",
  warning: "bg-orange-100 text-orange-700",
  LOW: "bg-blue-100 text-blue-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HIGH: "bg-red-100 text-red-700",
  WARNING: "bg-orange-100 text-orange-700",
}

const LogTable = () => {
  const [logs, setLogs] = useState<ViolationLog[]>([])

  const fetchLogs = useCallback(async () => {
    try {
      const res = await api.get("/violations/recent")
      setLogs(res.data.data || [])
    } catch (error) {
      console.error("Lỗi lấy log vi phạm:", error)
    }
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nhật ký vi phạm</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="max-h-72 overflow-y-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-3 px-4 font-medium">
                  Sinh viên
                </th>

                <th className="text-left py-3 px-4 font-medium">
                  Loại lỗi
                </th>

                <th className="text-left py-3 px-4 font-medium">
                  Mức độ
                </th>

                <th className="text-left py-3 px-4 font-medium">
                  Thời gian
                </th>
              </tr>
            </thead>

            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Chưa có vi phạm nào
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b hover:bg-muted/50 transition-colors"
                  >
                    <td className="py-3 px-4 font-medium">
                      {log.violationParticipant?.student_name || "Không xác định"}
                    </td>

                    <td className="py-3 px-4">
                      {violationTypeMap[log.type] || log.type}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          severityMap[log.severity] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {log.severity || "UNKNOWN"}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      {new Date(log.timestamp).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export default LogTable