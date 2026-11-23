type NotificationIconProps = {
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

/** Shared notification bell shape used throughout the application. */
export function NotificationIcon({ className, 'aria-hidden': ariaHidden = true }: NotificationIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
    >
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </svg>
  )
}
