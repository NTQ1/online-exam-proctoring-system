import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import api from "@/lib/axios"
import { toast } from "sonner"

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const CreateExamRoomDialog = ({ open, onClose, onCreated }: Props) => {
  const [subjectName, setSubjectName] = useState("")
  const [monitorLevel, setMonitorLevel] = useState("MEDIUM")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!subjectName.trim()) {
      toast.error("Vui lòng nhập tên môn học")
      return
    }

    try {
      setLoading(true)
      await api.post('/exam-rooms', {
        subject_name: subjectName,
        monitor_level: monitorLevel,
        password: password || null,
      })
      toast.success("Tạo phòng thi thành công!")
      setSubjectName("")
      setMonitorLevel("MEDIUM")
      setPassword("")
      onCreated()
      onClose()
    } catch (error) {
      toast.error("Tạo phòng thi thất bại")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
<DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0 rounded-xl border border-violet-500 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:hover:bg-white/20">        
        {/* Header tím sát viền */}
        <div className="px-4 py-3 flex items-center justify-between" style={{
            background: "linear-gradient(90deg, #7b2ff7 0%, #a62cff 45%, #c13cff 75%, #ff4fd8 100%)"
            }}>
            <h2 className="text-white font-bold text-base">Tạo phòng thi mới</h2>
            </div>

        {/* Content */}
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-2">
            <Label>Tên môn học <span className="text-destructive">*</span></Label>
            <Input
              placeholder="VD: Cấu trúc dữ liệu"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Mức độ giám sát</Label>
            <Select value={monitorLevel} onValueChange={setMonitorLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Thấp</SelectItem>
                <SelectItem value="MEDIUM">Trung bình</SelectItem>
                <SelectItem value="HIGH">Cao</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Mật khẩu phòng thi <span className="text-muted-foreground text-xs">(tuỳ chọn)</span></Label>
            <Input
              placeholder="Để trống nếu không cần"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Huỷ
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Đang tạo..." : "Tạo phòng thi"}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  )
}

export default CreateExamRoomDialog