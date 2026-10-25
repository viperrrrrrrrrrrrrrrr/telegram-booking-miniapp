import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { CatalogStaff } from '../../shared/types';

export function Avatar({ staff, size = 44 }: { staff?: Pick<CatalogStaff, 'name' | 'colors'> | null; size?: number }) {
  const [a, b] = staff?.colors ?? ['#c9b8f5', '#7a5bd6'];
  return (
    <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full font-semibold text-white shadow-sm"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(135deg, ${a}, ${b})` }}>
      {staff ? staff.name[0] : '✦'}
    </span>
  );
}

export function Section({ title, children, aside, className = '' }: { title?: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={`mb-5 ${className}`}>
      {title && (
        <div className="mb-1.5 flex items-baseline justify-between px-4">
          <h2 className="text-[13px] font-semibold tracking-wide text-tg-section-header uppercase">{title}</h2>
          {aside}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl bg-tg-section shadow-[0_1px_0_rgb(0_0_0/0.03)]">{children}</div>
    </section>
  );
}

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return <span role="status" aria-label="Loading" className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

export function SoftButton({ children, className = '', tone = 'accent', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'accent' | 'danger' | 'plain' }) {
  const color = tone === 'danger' ? 'text-tg-destructive' : tone === 'plain' ? 'text-tg-text' : 'text-tg-accent';
  return (
    <button type="button" {...rest}
      className={`tap inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-tg-bg px-3.5 text-[15px] font-medium ${color} disabled:opacity-50 ${className}`}>
      {children}
    </button>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-xl ${className}`} />;
}
