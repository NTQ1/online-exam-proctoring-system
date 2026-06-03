import DashboardHeader from '@/components/dashboard/DashboardHeader'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'

import React from 'react'
import SettingsPage from '@/components/Settings/SettingsPage'

const SettingsPages = () => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar/>
        <main className="flex-1">
          
           <div className="p-6">
            <SettingsPage/>
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

export default SettingsPages
