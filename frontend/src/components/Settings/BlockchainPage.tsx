import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  ChevronLeft, ChevronRight, ExternalLink,
  CheckCircle, Clock, XCircle, Shield, Hash, Link, Blocks
} from "lucide-react"
import api from "@/lib/axios"

interface BlockchainData {
  id: number
  sessionId: string
  dataHash: string | null
  txHash: string | null
  blockNumber: number | null
  status: string
  retryCount: number
  confirmedAt: string | null
  createdAt: string
  studentName: string
  studentId: string
  roomCode: string
  subjectName: string
  verdict: string
}

const statusMap: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  confirmed: { label: 'Đã xác nhận', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  pending: { label: 'Đang chờ', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  failed: { label: 'Thất bại', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
}

const BlockchainPage = () => {
  const [records, setRecords] = useState<BlockchainData[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState("all")
  const [stats, setStats] = useState({ total: 0, confirmed: 0, pending: 0, failed: 0 })

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true)
      const params: any = { page, limit: 15 }
      if (statusFilter !== "all") params.status = statusFilter

      const res = await api.get("/blockchain", { params })
      setRecords(res.data.data || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.totalPages || 1)
    } catch (error) {
      console.error("Lỗi:", error)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  const fetchStats = async () => {
    try {
      const res = await api.get("/blockchain/stats")
      setStats(res.data.data)
    } catch (error) { console.error(error) }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const getExplorerUrl = (txHash: string) => `https://sepolia.etherscan.io/tx/${txHash}`

  const shorten = (str: string | null, len = 10) => {
    if (!str) return '—'
    return str.length > len * 2 ? `${str.slice(0, len)}...${str.slice(-len)}` : str
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Blocks className="size-6 text-violet-600" />
          Blockchain Records
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Lịch sử giao dịch đã ghi lên blockchain
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-violet-100">
          <CardContent className="pt-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <Blocks className="size-5 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Tổng giao dịch</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-100">
          <CardContent className="pt-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{stats.confirmed}</p>
              <p className="text-xs text-muted-foreground">Đã xác nhận</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-100">
          <CardContent className="pt-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Clock className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">Đang chờ</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-100">
          <CardContent className="pt-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <XCircle className="size-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              <p className="text-xs text-muted-foreground">Thất bại</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-[180px] h-10 rounded-xl">
            <SelectValue placeholder="Tất cả trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="confirmed">✅ Đã xác nhận</SelectItem>
            <SelectItem value="pending">⏳ Đang chờ</SelectItem>
            <SelectItem value="failed">❌ Thất bại</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{total} giao dịch</span>
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left py-3 px-4 font-semibold">Sinh viên</th>
                  <th className="text-left py-3 px-4 font-semibold">Phòng</th>
                  <th className="text-left py-3 px-4 font-semibold">
                    <span className="flex items-center gap-1.5"><Link className="size-3.5" />Tx Hash</span>
                  </th>
                  <th className="text-center py-3 px-4 font-semibold">
                    <span className="flex items-center justify-center gap-1.5"><Hash className="size-3.5" />Block</span>
                  </th>
                  <th className="text-center py-3 px-4 font-semibold">Trạng thái</th>
                  <th className="text-center py-3 px-4 font-semibold">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-muted-foreground">
                      Đang tải...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-muted-foreground">
                      Chưa có giao dịch blockchain nào
                    </td>
                  </tr>
                ) : (
                  records.map((r) => {
                    const st = statusMap[r.status] || statusMap.pending
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-medium">{r.studentName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{r.studentId}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs text-violet-600 font-medium">{r.roomCode}</span>
                        </td>
                        <td className="py-3 px-4">
                          {r.txHash ? (
                            <a href={getExplorerUrl(r.txHash)} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline font-mono text-xs">
                              {shorten(r.txHash, 8)}
                              <ExternalLink className="size-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-xs">
                          {r.blockNumber ? `#${r.blockNumber}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.color}`}>
                            <st.icon className="size-3.5" />{st.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-xs text-muted-foreground">
                          {r.confirmedAt ? new Date(r.confirmedAt).toLocaleString("vi-VN") : '—'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">Trang {page}/{totalPages}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
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

export default BlockchainPage