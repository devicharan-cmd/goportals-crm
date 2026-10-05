import { redirect } from 'next/navigation'

// Self-signup is switched off for now: clients are added by a super admin (Clients → Add client,
// or Users & invites → Invite a client). The previous signup form is in git history.
export default function SignupPage() {
  redirect('/login')
}
