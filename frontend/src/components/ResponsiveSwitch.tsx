import type { ReactNode } from 'react';

export function ResponsiveSwitch(props: { mobile: ReactNode; desktop: ReactNode }) {
  return (
    <>
      <div className="md:hidden">{props.mobile}</div>
      <div className="hidden md:block">{props.desktop}</div>
    </>
  );
}

