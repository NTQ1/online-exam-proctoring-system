import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "../ui/scroll-area"
import type { ElementType } from "react"
import {
  Camera, ShieldCheck, ShieldX, Clock,
  AlertTriangle, Wifi, WifiOff, Maximize2,
  MonitorOff, KeyboardOff
} from "lucide-react"

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

interface Props {
  session: MonitoringSession
  apiBase: string
  onClose: () => void
}

// Map loại vi phạm → icon & nhãn hiển thị
const violationTypeMap: Record<string, { label: string; Icon: ElementType; color: string }> = {
  ai_violation:            { label: 'AI phát hiện',         Icon: Camera,       color: 'text-red-600'    },
  TAB_SWITCH:              { label: 'Chuyển tab',            Icon: MonitorOff,   color: 'text-orange-600' },
  tab_switch:              { label: 'Chuyển tab',            Icon: MonitorOff,   color: 'text-orange-600' },
  FULLSCREEN_EXIT:         { label: 'Thoát toàn màn hình',  Icon: Maximize2,    color: 'text-orange-600' },
  fullscreen_exit:         { label: 'Thoát toàn màn hình',  Icon: Maximize2,    color: 'text-orange-600' },
  DEVTOOLS:                { label: 'Mở DevTools',           Icon: MonitorOff,   color: 'text-purple-600' },
  devtools:                { label: 'Mở DevTools',           Icon: MonitorOff,   color: 'text-purple-600' },
  BLOCK_COPY:              { label: 'Cố sao chép',           Icon: KeyboardOff,  color: 'text-yellow-600' },
  BLOCK_PASTE:             { label: 'Cố dán',                Icon: KeyboardOff,  color: 'text-yellow-600' },
  BLOCK_SCREENSHOT:        { label: 'Cố chụp màn hình',     Icon: Camera,       color: 'text-yellow-600' },
  disconnect:              { label: 'Mất kết nối',           Icon: WifiOff,      color: 'text-gray-600'   },
  offline_violation:       { label: 'Vi phạm offline',       Icon: Wifi,         color: 'text-gray-600'   },
}

const severityBadge = (severity: string | null) => {
  if (severity === 'high')    return <Badge variant="destructive" className="text-xs">Nghiêm trọng</Badge>
  if (severity === 'warning') return <Badge variant="outline"     className="text-xs text-orange-600 border-orange-300">Cảnh báo</Badge>
  return null
}

const verdictConfig = {
  clean:    { label: 'Không vi phạm',  Icon: ShieldCheck, cls: 'text-green-600 bg-green-50 border-green-200'  },
  violated: { label: 'Có vi phạm',     Icon: ShieldX,     cls: 'text-red-600   bg-red-50   border-red-200'    },
  pending:  { label: 'Chưa xét',       Icon: Clock,       cls: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
}

const fmt = (ts: string | null) =>
  ts ? new Date(ts).toLocaleString('vi-VN') : '—'

const SessionDetailDialog = ({ session, apiBase, onClose }: Props) => {
  const aiViolations  = session.violations.filter(v => v.type === 'ai_violation')
  const otherViolations = session.violations.filter(v => v.type !== 'ai_violation')
  const verdict       = session.verdict ? verdictConfig[session.verdict] : null
  const screenshotUrl = session.screenshot_url ? `${apiBase}${session.screenshot_url}` : null

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-3">
            Chi tiết phiên giám sát
            {verdict && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${verdict.cls}`}>
                <verdict.Icon className="size-3.5" />
                {verdict.label}
              </span>
            )}
          </DialogTitle>

          {/* Meta info */}
          <div className="grid grid-cols-3 gap-4 mt-3 text-sm text-muted-foreground">
            <div>
              <span className="block font-medium text-foreground text-xs uppercase tracking-wide mb-0.5">Bắt đầu</span>
              {fmt(session.start_time)}
            </div>
            <div>
              <span className="block font-medium text-foreground text-xs uppercase tracking-wide mb-0.5">Kết thúc</span>
              {fmt(session.end_time)}
            </div>
            <div>
              <span className="block font-medium text-foreground text-xs uppercase tracking-wide mb-0.5">Lý do kết thúc</span>
              {session.end_reason || '—'}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-6">

            {/* Screenshot cuối */}
            {screenshotUrl && (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Camera className="size-4 text-muted-foreground" />
                  Ảnh chụp màn hình cuối phiên
                </h3>
                <a href={screenshotUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={screenshotUrl}
                    alt="Screenshot cuối phiên"
                    className="rounded-lg border w-full max-h-64 object-contain bg-muted hover:opacity-90 transition-opacity cursor-zoom-in"
                  />
                </a>
              </section>
            )}

            {/* AI Violations */}
            {aiViolations.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Camera className="size-4 text-red-500" />
                  AI phát hiện bất thường
                  <Badge variant="destructive" className="ml-auto text-xs">{aiViolations.length}</Badge>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {aiViolations.map((v) => {
                    const detections = (v.details?.detections as Array<{ className: string; confidence: number }>) || []
                    const imgUrl = v.image_url ? `${apiBase}${v.image_url}` : null
                    return (
                      <div key={v.id} className="rounded-lg border bg-red-50/40 p-3 space-y-2">
                        {imgUrl && (
                          <a href={imgUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={imgUrl}
                              alt="AI violation"
                              className="w-full h-28 object-cover rounded border cursor-zoom-in hover:opacity-80 transition-opacity"
                            />
                          </a>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            {detections.map((d, i) => (
                              <p key={i} className="text-xs font-medium text-red-700">
                                {d.className} — {(d.confidence * 100).toFixed(1)}%
                              </p>
                            ))}
                            {detections.length === 0 && (
                              <p className="text-xs text-muted-foreground">Không có chi tiết</p>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(v.timestamp).toLocaleTimeString('vi-VN')}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Other violations */}
            {otherViolations.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="size-4 text-orange-500" />
                  Vi phạm hành vi
                  <Badge variant="outline" className="ml-auto text-xs border-orange-300 text-orange-600">
                    {otherViolations.length}
                  </Badge>
                </h3>
                <div className="space-y-1.5">
                  {otherViolations.map((v) => {
                    const vInfo = violationTypeMap[v.type] || {
                      label: v.type, Icon: AlertTriangle, color: 'text-muted-foreground'
                    }
                    return (
                      <div
                        key={v.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg border bg-muted/30 text-sm"
                      >
                        <vInfo.Icon className={`size-4 shrink-0 ${vInfo.color}`} />
                        <span className={`flex-1 font-medium ${vInfo.color}`}>{vInfo.label}</span>
                        {severityBadge(v.severity)}
                        <span className="text-xs text-muted-foreground">
                          {new Date(v.timestamp).toLocaleTimeString('vi-VN')}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {session.violations.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <ShieldCheck className="size-10 mx-auto mb-2 text-green-400" />
                Không ghi nhận vi phạm nào trong phiên này
              </div>
            )}

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default SessionDetailDialog
