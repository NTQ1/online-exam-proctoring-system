import DashboardHeader from '@/components/dashboard/DashboardHeader'

import ExamRoom from '@/components/exam-room/examRoom'

import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import React from 'react'

const ExamRoomPage = () => {
  return (
     <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar/>
        <main className="flex-1">
          <DashboardHeader/>
           <div className="p-6">
            <ExamRoom/>
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

export default ExamRoomPage
