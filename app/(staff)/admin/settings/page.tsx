import { requireSuperAdmin } from '@/lib/auth'
import { getStaffLookups } from '@/lib/queries'
import { Card, CardHeader } from '@/components/ui/primitives'
import { DepartmentsEditor, PlatformsEditor, ServicesEditor } from '@/components/admin/MasterData'

export const metadata = { title: 'Platforms & services' }

export default async function SettingsPage() {
  await requireSuperAdmin()
  const { platforms, services, departments } = await getStaffLookups()
  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Platforms" description="Marketplaces, quick commerce and D2C channels" />
          <PlatformsEditor platforms={platforms} />
        </Card>
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title="Services" description="What clients can request. The department decides which managers see new requests." />
            <ServicesEditor services={services} departments={departments} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Departments" />
            <DepartmentsEditor departments={departments} />
          </Card>
        </div>
      </div>
    </>
  )
}
