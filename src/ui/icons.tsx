/** Inline SVG icons (stroke = currentColor). */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 22, ...rest }: P, children: React.ReactNode) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconPlay = (p: P) => base(p, <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" />);
export const IconPause = (p: P) => base(p, <><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></>);
export const IconRestart = (p: P) => base(p, <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4" /></>);
export const IconLoop = (p: P) => base(p, <><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></>);
export const IconMetronome = (p: P) => base(p, <><path d="M9 3h6l4 18H5z" /><path d="M12 15l5-8" /></>);
export const IconBack = (p: P) => base(p, <path d="M15 5l-7 7 7 7" />);
export const IconStar = ({ filled, ...p }: P & { filled?: boolean }) => base(p, <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill={filled ? 'currentColor' : 'none'} />);
export const IconSearch = (p: P) => base(p, <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>);
export const IconPlus = (p: P) => base(p, <path d="M12 5v14M5 12h14" />);
export const IconMinus = (p: P) => base(p, <path d="M5 12h14" />);
export const IconHome = (p: P) => base(p, <><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></>);
export const IconLibrary = (p: P) => base(p, <><path d="M5 4v16" /><path d="M10 4v16" /><path d="M15 4l4 16" /></>);
export const IconPattern = (p: P) => base(p, <><path d="M6 4v12" /><path d="M3 13l3 3 3-3" /><path d="M18 20V8" /><path d="M15 11l3-3 3 3" /></>);
export const IconSettings = (p: P) => base(p, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);
export const IconExpand = (p: P) => base(p, <><path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" /></>);
export const IconClose = (p: P) => base(p, <path d="M6 6l12 12M18 6L6 18" />);
export const IconEdit = (p: P) => base(p, <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>);
export const IconMore = (p: P) => base(p, <><circle cx="5" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="19" cy="12" r="1.5" fill="currentColor" /></>);
export const IconSun = (p: P) => base(p, <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const IconMoon = (p: P) => base(p, <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />);
export const IconUp = (p: P) => base(p, <path d="M6 15l6-6 6 6" />);
export const IconDown = (p: P) => base(p, <path d="M6 9l6 6 6-6" />);
export const IconTrash = (p: P) => base(p, <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>);
export const IconCopy = (p: P) => base(p, <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>);
export const IconDownload = (p: P) => base(p, <><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></>);
export const IconUpload = (p: P) => base(p, <><path d="M12 20V9" /><path d="M7 14l5-5 5 5" /><path d="M5 4h14" /></>);
export const IconInfo = (p: P) => base(p, <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7.5v.5" /></>);
export const IconSpeaker = (p: P) => base(p, <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 0 1 0 6" /></>);
export const IconGuitar = (p: P) => base(p, <><path d="M19 3l2 2-6.5 6.5" /><path d="M13.5 9.5a3.5 3.5 0 0 0-4.6-.2 3 3 0 0 0-1.4 2.4 3 3 0 0 1-2.4 1.4 3.5 3.5 0 0 0 .4 5.1 3.5 3.5 0 0 0 5.1.4 3 3 0 0 1 1.4-2.4 3 3 0 0 0 2.4-1.4 3.5 3.5 0 0 0-.9-3.3z" /><circle cx="10" cy="14" r="1" /></>);
