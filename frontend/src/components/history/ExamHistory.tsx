import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Search, ChevronLeft, ChevronRight,
  ShieldCheck, ShieldX, Clock, History,
  User, BookOpen, Hash, Timer, AlertCircle
} from "lucide-react"
import api from "@/lib/axios"

interface ExamSession {
  id: string
  roomCode: string
  subjectName: string
  studentName: string
  studentId: string
  status: string
  verdict: string
  startTime: string | null
  endTime: string | null
  duration: number | null
  screenshotUrl: string | null
  totalViolations: number
  aiViolations: number
  violationTypes: string[]
}

const verdictMap: Record<string, { label: string; icon: any; color: string; bg: string; border: string }> = {
  clean: { 
    label: 'Không vi phạm', 
    icon: ShieldCheck, 
    color: 'text-emerald-600', 
    bg: 'bg-emerald-50', 
    border: 'border-emerald-200' 
  },
  violated: { 
    label: 'Có vi phạm', 
    icon: ShieldX, 
    color: 'text-red-600', 
    bg: 'bg-red-50', 
    border: 'border-red-200' 
  },
  pending: { 
    label: 'Chưa xét', 
    icon: Clock, 
    color: 'text-amber-600', 
    bg: 'bg-amber-50', 
    border: 'border-amber-200' 
  },
}

const violationTypeLabels: Record<string, { label: string; color: string }> = {
  TAB_AWAY: { label: 'Rời tab', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  TAB_RETURN: { label: 'Quay lại', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  FULLSCREEN_EXIT: { label: 'Thoát full', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  ai_violation: { label: 'AI', color: 'bg-red-100 text-red-700 border-red-200' },
  devtools_open: { label: 'DevTools', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  copy_paste: { label: 'Copy/Paste', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  disconnect: { label: 'Mất KN', color: 'bg-gray-100 text-gray-700 border-gray-200' },
}

const ExamHistory = () => {
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Filters
  const [search, setSearch] = useState("")
  const [verdictFilter, setVerdictFilter] = useState("all")
  const [roomFilter, setRoomFilter] = useState("all")
  const [rooms, setRooms] = useState<any[]>([])

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const params: any = { page, limit: 15 }
      if (search) params.search = search
      if (verdictFilter !== "all") params.verdict = verdictFilter
      if (roomFilter !== "all") params.roomId = roomFilter

      const res = await api.get("/exam-history", { params })
      setSessions(res.data.data || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.totalPages || 1)
    } catch (error) {
      console.error("Lỗi lấy lịch sử thi:", error)
    } finally {
      setLoading(false)
    }
  }, [page, search, verdictFilter, roomFilter])

  const fetchRooms = async () => {
    try {
      const res = await api.get("/exam-rooms")
      setRooms(res.data.rooms || [])
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    fetchRooms()
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const fmt = (ts: string | null) =>
    ts ? new Date(ts).toLocaleString("vi-VN") : "—"

  // Stats
  const cleanCount = sessions.filter(s => s.verdict === 'clean').length
  const violatedCount = sessions.filter(s => s.verdict === 'violated').length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="size-6 text-violet-600" />
            Lịch sử thi
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Theo dõi tất cả phiên thi đã diễn ra
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700">
            <ShieldCheck className="size-4" />
            <span className="font-medium">{cleanCount}</span> sạch
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700">
            <ShieldX className="size-4" />
            <span className="font-medium">{violatedCount}</span> vi phạm
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-sm border-violet-100">
            <CardContent className="pt-6 pb-4">
                <div className="flex flex-wrap gap-4 items-end">
                {/* Search - làm nổi bật */}
                <div className="flex-1 min-w-[280px]">
                    <label className="text-xs font-medium mb-1.5 block text-muted-foreground uppercase tracking-wide">
                    Tìm kiếm sinh viên
                    </label>
                    <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-purple-500 rounded-xl opacity-0 group-hover:opacity-100 blur transition-opacity duration-300" />
                    <div className="relative flex items-center bg-white rounded-xl border-2 border-violet-200 group-hover:border-violet-400 transition-all duration-300 overflow-hidden shadow-sm group-hover:shadow-md">
                        <div className="pl-4 pr-2">
                        <Search className="size-5 text-violet-400 group-hover:text-violet-600 transition-colors" />
                        </div>
                        <Input
                        placeholder="Nhập tên sinh viên hoặc MSSV..."
                        className="flex-1 border-0 bg-transparent h-12 text-base placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                        />
                        {search && (
                        <button
                            onClick={() => { setSearch(""); setPage(1) }}
                            className="pr-4 text-gray-400 hover:text-red-500 transition-colors"
                        >
                            ✕
                        </button>
                        )}
                        <button
                        onClick={() => fetchHistory()}
                        className="h-12 px-5 bg-violet-600 hover:bg-violet-700 text-white font-medium text-sm transition-colors flex items-center gap-1.5"
                        >
                        <Search className="size-4" />
                        Tìm
                        </button>
                    </div>
                    </div>
                    {search && (
                    <p className="text-xs text-violet-600 mt-1.5 ml-1">
                        Đang tìm: <span className="font-medium">"{search}"</span>
                    </p>
                    )}
                </div>

                {/* Verdict filter */}
                <div className="w-[170px]">
                    <label className="text-xs font-medium mb-1.5 block text-muted-foreground uppercase tracking-wide">
                    Kết quả
                    </label>
                    <Select value={verdictFilter} onValueChange={(v) => { setVerdictFilter(v); setPage(1) }}>
                    <SelectTrigger className="h-12 rounded-xl border-2 border-gray-200 hover:border-violet-200 transition-colors">
                        <SelectValue placeholder="Tất cả" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">🏷 Tất cả kết quả</SelectItem>
                        <SelectItem value="clean">✅ Không vi phạm</SelectItem>
                        <SelectItem value="violated">❌ Có vi phạm</SelectItem>
                        <SelectItem value="pending">⏳ Chưa xét</SelectItem>
                    </SelectContent>
                    </Select>
                </div>

                {/* Room filter */}
                <div className="w-[230px]">
                    <label className="text-xs font-medium mb-1.5 block text-muted-foreground uppercase tracking-wide">
                    Phòng thi
                    </label>
                    <Select value={roomFilter} onValueChange={(v) => { setRoomFilter(v); setPage(1) }}>
                    <SelectTrigger className="h-12 rounded-xl border-2 border-gray-200 hover:border-violet-200 transition-colors">
                        <SelectValue placeholder="Tất cả phòng" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">🏫 Tất cả phòng thi</SelectItem>
                        {rooms.map((r: any) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                            {r.code} — {r.subject_name}
                        </SelectItem>
                        ))}
                    </SelectContent>
                    </Select>
                </div>

                {/* Clear all */}
                {(verdictFilter !== "all" || roomFilter !== "all" || search) && (
                    <div className="flex items-end pb-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-1"
                        onClick={() => { setSearch(""); setVerdictFilter("all"); setRoomFilter("all"); setPage(1) }}
                    >
                        ✕ Xóa bộ lọc
                    </Button>
                    </div>
                )}
                </div>

                {/* Active filters tags */}
                {(verdictFilter !== "all" || roomFilter !== "all") && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    <span className="text-xs text-muted-foreground">Đang lọc:</span>
                    {verdictFilter !== "all" && (
                    <Badge 
                        variant="secondary" 
                        className="text-xs gap-1 cursor-pointer hover:bg-red-100 transition-colors"
                        onClick={() => setVerdictFilter("all")}
                    >
                        {verdictFilter === "clean" ? "✅ Sạch" : verdictFilter === "violated" ? "❌ Vi phạm" : "⏳ Chờ xét"}
                        <span className="ml-0.5">✕</span>
                    </Badge>
                    )}
                    {roomFilter !== "all" && (
                    <Badge 
                        variant="secondary" 
                        className="text-xs gap-1 cursor-pointer hover:bg-red-100 transition-colors"
                        onClick={() => setRoomFilter("all")}
                    >
                        🏫 {rooms.find(r => String(r.id) === roomFilter)?.code || `Phòng ${roomFilter}`}
                        <span className="ml-0.5">✕</span>
                    </Badge>
                    )}
                </div>
                )}
            </CardContent>
            </Card>

      {/* Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              Danh sách phiên thi
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({total} phiên)
              </span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left py-3 px-4 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <User className="size-3.5" /> Sinh viên
                    </span>
                  </th>
                  <th className="text-left py-3 px-4 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Hash className="size-3.5" /> MSSV
                    </span>
                  </th>
                  <th className="text-left py-3 px-4 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="size-3.5" /> Phòng — Môn
                    </span>
                  </th>
                  <th className="text-center py-3 px-4 font-semibold w-20">Vi phạm</th>
                  <th className="text-center py-3 px-4 font-semibold w-32">Loại</th>
                  <th className="text-center py-3 px-4 font-semibold">
                    <span className="flex items-center justify-center gap-1.5">
                      <Timer className="size-3.5" /> Thời gian
                    </span>
                  </th>
                  <th className="text-center py-3 px-4 font-semibold w-36">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                        <span className="text-muted-foreground">Đang tải dữ liệu...</span>
                      </div>
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="size-10 text-muted-foreground/40" />
                        <p className="text-muted-foreground font-medium">Không có dữ liệu</p>
                        <p className="text-xs text-muted-foreground">Chưa có phiên thi nào được ghi nhận</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sessions.map((s, index) => {
                    const verdict = verdictMap[s.verdict] || verdictMap.pending
                    return (
                      <tr 
                        key={s.id} 
                        className="border-t hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium">{s.studentName}</p>
                        </td>
                        <td className="py-3 px-4">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                            {s.studentId}
                          </code>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <span className="font-mono text-xs text-violet-600 font-medium">
                              {s.roomCode}
                            </span>
                            <span className="text-muted-foreground mx-1.5">—</span>
                            <span className="text-sm">{s.subjectName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {s.totalViolations > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-bold text-sm">
                              {s.totalViolations}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-sm">
                              0
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1 justify-center flex-wrap">
                            {s.violationTypes.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <>
                                {s.violationTypes.slice(0, 2).map((t) => {
                                  const vt = violationTypeLabels[t] || { label: t, color: 'bg-gray-100 text-gray-700' }
                                  return (
                                    <Badge key={t} className={`text-[10px] px-1.5 py-0 border ${vt.color}`}>
                                      {vt.label}
                                    </Badge>
                                  )
                                })}
                                {s.violationTypes.length > 2 && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    +{s.violationTypes.length - 2}
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="text-xs">
                            <p className="text-muted-foreground">
                              {s.startTime ? new Date(s.startTime).toLocaleDateString("vi-VN") : "—"}
                            </p>
                            <p className="font-medium">
                              {s.duration ? `${s.duration} phút` : "—"}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${verdict.bg} ${verdict.color} ${verdict.border}`}>
                            <verdict.icon className="size-3.5" />
                            {verdict.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                Trang {page} / {totalPages} — <span className="font-medium">{total}</span> kết quả
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm" 
                  variant="outline"
                  className="h-8 w-8 p-0"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (page <= 3) {
                    pageNum = i + 1
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = page - 2 + i
                  }
                  return (
                    <Button
                      key={pageNum}
                      size="sm"
                      variant={page === pageNum ? "default" : "outline"}
                      className="h-8 w-8 p-0"
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  )
                })}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ExamHistory