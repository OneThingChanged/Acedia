const paths = {
  plus: <path d="M12 5v14M5 12h14" />,
  send: <path d="M12 19V5m-6 6 6-6 6 6" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  queue: <><path d="M4 6h12M4 11h8M4 16h6M17 11v10m-4-4 4 4 4-4" /></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  computer: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  edit: <path d="m4 16-1 5 5-1L20 8l-4-4ZM14 6l4 4" />,
  quote: <><path d="M10 7H4v7h6V7ZM4 14v2a4 4 0 0 0 4 4M20 7h-6v7h6V7ZM14 14v2a4 4 0 0 0 4 4" /></>,
  file: <path d="M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h6" />,
  open: <path d="M13 4h7v7M20 4 10 14M10 4H4v16h16v-6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
} as const;

export function ChatIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="chat-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
