import DashboardHeader from '@/components/dashboard/DashboardHeader'
import ExamHistory from '@/components/history/ExamHistory'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import React from 'react'

const ExamHistoryPage = () => {
  return (
     <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar/>
        <main className="flex-1">
          <DashboardHeader/>
           <div className="p-6">
            <ExamHistory/>
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

export default ExamHistoryPage
