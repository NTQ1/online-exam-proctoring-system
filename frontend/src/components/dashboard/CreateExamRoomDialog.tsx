import { useState } from "react"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import api from "@/lib/axios"
import { toast } from "sonner"
import { XIcon } from "lucide-react"

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const CreateExamRoomDialog = ({ open, onClose, onCreated }: Props) => {
  const [subjectName, setSubjectName] = useState("")
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
      })
      toast.success("Tạo phòng thi thành công!")
      setSubjectName("")
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
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0 rounded-xl border border-violet-500" showCloseButton={false}>
        
        <div className="px-4 py-3 flex items-center justify-between" style={{
          background: "linear-gradient(90deg, #7b2ff7 0%, #a62cff 45%, #c13cff 75%, #ff4fd8 100%)"
        }}>
          <h2 className="text-white font-bold text-base">Tạo phòng thi mới</h2>
          <button onClick={onClose} className="text-white hover:text-white/70 transition-colors">
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-2">
            <Label>Tên môn học <span className="text-destructive">*</span></Label>
            <Input
              placeholder="VD: Cấu trúc dữ liệu"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
            />
          </div>
        </div>

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