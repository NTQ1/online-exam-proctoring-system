"use client"

import * as React from "react"
import { useNavigate, useLocation } from "react-router"
import { useAuthStore } from "@/stores/useAuthStore"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboard,
  BookOpen,
  FileBarChart,
  History,
  Settings,
  LogOut,
  
} from "lucide-react"

const menuItems = [
  { title: "Tổng quan", icon: LayoutDashboard, path: "/" },
  { title: "Phòng thi", icon: BookOpen, path: "/rooms" },
  { title: "Blockchain", icon: FileBarChart, path: "/blockchain" },
  { title: "Lịch sử thi", icon: History, path: "/history" },
  { title: "Giới thiệu", icon: Settings, path: "/settings" },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuthStore()

  const handleSignOut = async () => {
    await signOut()
    navigate("/signin")
  }

  return (
    <Sidebar variant="sidebar" {...props}>
      <div className="flex flex-col h-full"
        style={{
          background:
                "linear-gradient(90deg, #7b2ff7 0%, #a62cff 45%, #c13cff 75%, #ff4fd8 100%)",
            }}
      >
        {/* Header */}
        <SidebarHeader className="bg-transparent py-6 px-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <img src="/logo_white.svg" alt="Logo" />
            </div>
            <div>
              <p className="font-bold text-white text-base tracking-wide">Exam Monitor</p>
              <p className="text-violet-200 text-xs">Hệ thống giám sát thi</p>
            </div>
          </div>
        </SidebarHeader>

        {/* Divider */}
        <div className="mx-4 h-px bg-white/10 mb-2" />

        {/* Menu items */}
        <SidebarContent className="bg-transparent px-3 py-2 flex-1">
          <SidebarMenu className="gap-1">
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  className={`
                    cursor-pointer rounded-xl px-3 py-2.5 text-violet-100
                    hover:bg-white/15 hover:text-white transition-all duration-200
                    data-[active=true]:bg-white/25 data-[active=true]:text-white 
                    data-[active=true]:font-semibold data-[active=true]:shadow-md
                    data-[active=true]:backdrop-blur-sm
                  `}
                >
                  <item.icon className="size-4" />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        {/* Divider */}
        <div className="mx-4 h-px bg-white/10 mt-2" />

        {/* Footer */}
        <SidebarFooter className="bg-transparent px-3 py-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleSignOut}
                className="cursor-pointer rounded-xl px-3 py-2.5 text-violet-200 hover:bg-red-400/20 hover:text-red-300 transition-all duration-200"
              >
                <LogOut className="size-4" />
                <span>Đăng xuất</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </div>
    </Sidebar>
  )
}