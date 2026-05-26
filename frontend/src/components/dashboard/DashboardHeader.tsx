import { Bell } from "lucide-react"
import { useAuthStore } from "@/stores/useAuthStore"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const DashboardHeader = () => {
  const { user } = useAuthStore()

  const fullName = user ? `${user.last_name} ${user.first_name}` : ''
  const initials = user ? `${user.last_name[0]}${user.first_name[0]}` : 'U'
  const role = user?.role === 'admin' ? 'Giảng viên' : 'Sinh viên'

  return (
    <div className="flex items-center justify-end gap-4 px-6 py-3 border-b bg-white">
      {/* Thông báo */}
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="size-5" />
        <span className="absolute top-1 right-1 w-4 h-4 bg-destructive text-white text-xs rounded-full flex items-center justify-center">
          8
        </span>
      </Button>

      {/* User info */}
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback className="bg-primary text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="text-sm">
          <p className="font-semibold ">{fullName}</p>
          <p className="text-muted-foreground text-xs">{role}</p>
        </div>
      </div>
    </div>
  )
}

export default DashboardHeader