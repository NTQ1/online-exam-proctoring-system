import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Shield, Camera, Eye, Blocks, Zap, Users,
  CheckCircle, ArrowRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useNavigate } from "react-router"

const AboutPage = () => {
  const navigate = useNavigate()

  const features = [
    {
      icon: Camera,
      title: "AI Giám sát thông minh",
      desc: "Phát hiện gian lận bằng AI: nhận diện khuôn mặt, phát hiện điện thoại, tài liệu lạ trong khung hình.",
      color: "from-red-500 to-pink-500",
    },
    {
      icon: Eye,
      title: "Theo dõi hành vi",
      desc: "Phát hiện chuyển tab, thoát fullscreen, mở DevTools, copy/paste - mọi hành vi bất thường đều được ghi lại.",
      color: "from-orange-500 to-yellow-500",
    },
    {
      icon: Blocks,
      title: "Blockchain bảo chứng",
      desc: "Dữ liệu vi phạm được ghi lên blockchain Ethereum, không thể chỉnh sửa hay xóa, đảm bảo minh bạch tuyệt đối.",
      color: "from-violet-500 to-purple-600",
    },
    {
      icon: Zap,
      title: "Giám sát real-time",
      desc: "Theo dõi trực tiếp trạng thái sinh viên, nhận cảnh báo ngay khi có vi phạm xảy ra.",
      color: "from-blue-500 to-cyan-500",
    },
    {
      icon: Shield,
      title: "Bảo mật & Riêng tư",
      desc: "Dữ liệu được mã hóa, chỉ giáo viên được phân quyền mới có thể xem kết quả giám sát.",
      color: "from-green-500 to-emerald-500",
    },
    {
      icon: Users,
      title: "Quản lý đa phòng thi",
      desc: "Tạo và quản lý nhiều phòng thi cùng lúc, mỗi phòng có mã riêng, dễ dàng phân biệt.",
      color: "from-indigo-500 to-blue-600",
    },
  ]

  const steps = [
    { step: "01", title: "Tạo phòng thi", desc: "Giáo viên tạo phòng, nhận mã code chia sẻ cho sinh viên." },
    { step: "02", title: "Sinh viên tham gia", desc: "Cài extension, nhập mã phòng, bắt đầu làm bài thi." },
    { step: "03", title: "AI giám sát", desc: "Camera + AI phát hiện gian lận, ghi nhận mọi hành vi." },
    { step: "04", title: "Blockchain xác thực", desc: "Kết quả được ghi lên blockchain, không thể thay đổi." },
  ]

  return (
    <div className="flex flex-col gap-12 max-w-5xl mx-auto py-8">
      {/* Hero */}
      <div className="text-center space-y-6">
        <Badge className="px-4 py-1.5 text-sm bg-violet-100 text-violet-700 border-violet-200">
          🚀 Hệ thống giám sát thi trực tuyến
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight">
          Exam <span className="text-violet-600">Monitor</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Nền tảng giám sát thi trực tuyến sử dụng AI và Blockchain, 
          đảm bảo tính minh bạch và công bằng cho mọi kỳ thi.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button 
            size="lg" 
            className="gap-2 bg-violet-600 hover:bg-violet-700 rounded-xl"
            onClick={() => navigate("/rooms")}
          >
            Bắt đầu ngay <ArrowRight className="size-4" />
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            className="rounded-xl"
            onClick={() => navigate("/history")}
          >
            Xem lịch sử
          </Button>
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-4 gap-4">
        {steps.map((s, i) => (
          <Card key={i} className="border-violet-100 text-center hover:shadow-md transition-shadow">
            <CardContent className="pt-6 pb-4">
              <span className="text-3xl font-bold text-violet-200">{s.step}</span>
              <h3 className="font-semibold mt-2">{s.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Features */}
      <div>
        <h2 className="text-2xl font-bold text-center mb-8">Tính năng nổi bật</h2>
        <div className="grid grid-cols-3 gap-5">
          {features.map((f, i) => (
            <Card key={i} className="border-violet-50 hover:shadow-lg hover:border-violet-200 transition-all group">
              <CardContent className="pt-6">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <f.icon className="size-6 text-white" />
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Tech stack */}
      <div className="text-center py-8 border-t">
        <p className="text-sm text-muted-foreground">
          🛠 React • Node.js • Sequelize • MySQL • TensorFlow.js • Ethereum • Solidity
        </p>
      </div>
    </div>
  )
}

export default AboutPage