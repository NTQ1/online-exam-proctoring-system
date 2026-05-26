import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { AppSidebar } from "@/components/sidebar/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar";

const DashboardPage = () => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar/>
        <main className="flex-1">
          <DashboardLayout/>
        </main>
      </div>
    </SidebarProvider>
  )
}

export default DashboardPage