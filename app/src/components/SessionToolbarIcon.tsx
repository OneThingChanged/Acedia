export function SessionToolbarIcon({ name }: { name: "recover" | "bell" | "bell-off" | "workers" | "chat" | "terminal" }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "recover" && <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></>}
    {(name === "bell" || name === "bell-off") && <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>{name === "bell-off" && <path d="m3 3 18 18"/>}</>}
    {name === "workers" && <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/></>}
    {name === "chat" && <path d="M21 11a8 8 0 0 1-8 8H7l-5 3V10a8 8 0 0 1 8-8h3a8 8 0 0 1 8 9Z"/>}
    {name === "terminal" && <><rect x="2" y="3" width="20" height="18" rx="3"/><path d="m6 8 4 4-4 4m8 0h4"/></>}
  </svg>;
}
