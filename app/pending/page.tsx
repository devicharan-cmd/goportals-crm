import { Hourglass } from 'lucide-react'
import { StatusScreen } from '@/components/shared/StatusScreen'

export const metadata = { title: 'Awaiting approval' }

export default function PendingPage() {
  return (
    <StatusScreen icon={Hourglass} tone="amber" title="Thanks — we're reviewing your account">
      Your details and agreement have been received. Our team will review and activate your account shortly —
      you&apos;ll be able to sign in and raise requests as soon as it&apos;s approved.
    </StatusScreen>
  )
}
