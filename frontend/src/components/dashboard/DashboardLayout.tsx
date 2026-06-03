import { Outlet } from 'react-router'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import StatsCards from '@/components/dashboard/StatsCards'
import ExamRoomTable from './ExamRoomTable'
import LogTable from './Logtable'
import ViolationStatistics from './ViolationStatistics'

const DashboardLayout = () => {
  return (
    <div className="flex flex-col flex-1">
      <DashboardHeader />
      <main className="flex-1 p-6 flex flex-col gap-6">
        <StatsCards />
        <ViolationStatistics/>
         <ExamRoomTable />
         <LogTable/>
        <Outlet />
      </main>
    </div>
  )
}

export default DashboardLayout