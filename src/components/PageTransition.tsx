'use client';
import { usePathname } from 'next/navigation';
import { Children, ReactNode } from 'react';

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname}>
      {Children.map(children, (child, i) => (
        <div
          className="page-transition-child"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
