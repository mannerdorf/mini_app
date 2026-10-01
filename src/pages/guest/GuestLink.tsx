import React from 'react';

/** Real links remain navigable before JavaScript and support open-in-new-tab. */
export const GuestLink = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: () => void }>(function GuestLink({ onNavigate, ...props }, ref) {
  return <a {...props} ref={ref} style={{textDecoration:"none", ...props.style}} onClick={event => {
    props.onClick?.(event);
    if (!event.defaultPrevented && onNavigate && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      onNavigate();
    }
  }} />;
});
