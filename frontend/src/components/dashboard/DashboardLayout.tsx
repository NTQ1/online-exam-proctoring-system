import { Outlet } from 'react-router'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import StatsCards from '@/components/dashboard/StatsCards'
import ExamRoomTable from './ExamRoomTable'

const DashboardLayout = () => {
  return (
    <div className="flex flex-col flex-1">
      <DashboardHeader />
      <main className="flex-1 p-6 flex flex-col gap-6">
        <StatsCards />
         <ExamRoomTable />
        <Outlet />
      </main>
    </div>
  )
}

export default DashboardLayout