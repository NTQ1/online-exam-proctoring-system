import DashboardHeader from '@/components/dashboard/DashboardHeader'
import RoomDetail from '@/components/exam-room/RoomDetail'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import React from 'react'

const RoomDetailPage = () => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar/>
        <main className="flex-1">
          <DashboardHeader/>
           <div className="p-6">
            <RoomDetail/>
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

export default RoomDetailPage
