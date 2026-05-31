import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Users, BookOpen, AlertTriangle, CheckCircle } from "lucide-react"
import api from "@/lib/axios"

interface Stats {
  totalRooms: number
  totalParticipants: number
  totalWarnings: number
  endedRooms: number
}

const StatsCards = () => {
  const [stats, setStats] = useState<Stats>({
    totalRooms: 0,
    totalParticipants: 0,
    totalWarnings: 0,
    endedRooms: 0,
  })

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/exam-rooms/stats')
        setStats(res.data)
      } catch (error) {
        console.error(error)
      }
    }
    fetchStats()
  }, [])

  const cards = [
    {
      title: "Tổng số phòng thi",
      value: stats.totalRooms,
      icon: BookOpen,
      color: "bg-blue-500",
      link: "/rooms"
    },
    {
      title: "Sinh viên tham gia",
      value: stats.totalParticipants,
      icon: Users,
      color: "bg-green-500",
      link: "/rooms"
    },
    {
      title: "Cảnh báo (Hôm nay)",
      value: stats.totalWarnings,
      icon: AlertTriangle,
      color: "bg-orange-500",
      link: "/reports"
    },
    {
      title: "Phòng thi hoàn thành",
      value: stats.endedRooms,
      icon: CheckCircle,
      color: "bg-purple-500",
      link: "/history"
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="flex items-center gap-4 p-6">
            <div className={`${card.color} p-3 rounded-lg`}>
              <card.icon className="size-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">{card.title}</p>
              <p className="text-3xl font-bold">{card.value}</p>
              
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default StatsCards