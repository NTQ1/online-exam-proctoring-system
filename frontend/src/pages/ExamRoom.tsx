import DashboardHeader from '@/components/dashboard/DashboardHeader'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import React from 'react'

const ExamRoom = () => {
  return (
     <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar/>
        <main className="flex-1">
          <DashboardHeader/>
        </main>
      </div>
    </SidebarProvider>
  )
}

export default ExamRoom
