import { ShieldOff } from 'lucide-react'
import { StatusScreen } from '@/components/shared/StatusScreen'

export const metadata = { title: 'Account unavailable' }

export default function BlockedPage() {
  return (
    <StatusScreen icon={ShieldOff} tone="red" title="Your account is not active">
      This account has been suspended or was not approved. If you think this is a mistake, please contact GoPortals.
    </StatusScreen>
  )
}
