import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-night-2 border border-ink',
  secondary: 'bg-surface text-ink border border-line hover:bg-raised',
  ghost: 'text-ink-2 hover:text-ink hover:bg-raised border border-transparent',
  danger: 'bg-surface text-negative border border-line hover:bg-negative-wash',
  accent: 'bg-accent text-white border border-accent hover:bg-accent-ink',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-sm gap-2 rounded-md',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string): string {
  return cx(
    'inline-flex items-center justify-center font-medium transition-colors duration-150 ease-ease',
    'disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={props.disabled || loading} {...props}>
      {loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: {
  to: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-lg border border-line bg-surface', className)}>{children}</div>;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-negative">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  'h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink transition-colors duration-150 ease-ease hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, 'pr-8', props.className)} />;
}

export function SectionHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-medium text-ink">{title}</h2>
        {detail ? <p className="mt-0.5 text-[13px] text-ink-2">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">{eyebrow}</p> : null}
        <h1 className="text-[26px] leading-tight tracking-[-0.01em] text-ink">{title}</h1>
        {detail ? <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-6 text-ink-2">{detail}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function StatusDot({ tone = 'neutral', label }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'accent'; label: string }) {
  const color =
    tone === 'ok'
      ? 'bg-positive'
      : tone === 'warn'
        ? 'bg-warn'
        : tone === 'bad'
          ? 'bg-negative'
          : tone === 'accent'
            ? 'bg-accent'
            : 'bg-ink-3';
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
      <span className={cx('h-[5px] w-[5px] rounded-full', color)} aria-hidden />
      {label}
    </span>
  );
}

export function Notice({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: 'neutral' | 'warn' | 'bad' | 'ok';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    neutral: 'border-line bg-surface text-ink-2',
    warn: 'border-warn/25 bg-warn-wash text-warn',
    bad: 'border-negative/25 bg-negative-wash text-negative',
    ok: 'border-positive/25 bg-positive-wash text-positive',
  };
  return (
    <div className={cx('rounded-md border px-3.5 py-3 text-[13px] leading-5', tones[tone])}>
      {title ? <p className="mb-1 font-medium">{title}</p> : null}
      <div className={tone === 'neutral' ? 'text-ink-2' : undefined}>{children}</div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon?: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-ink-3">{icon}</div> : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {detail ? <p className="mt-1 max-w-[46ch] text-[13px] leading-5 text-ink-2">{detail}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-[13px] text-ink-3">
      <Loader2 size={15} className="animate-spin" aria-hidden />
      {label}
    </div>
  );
}

/** The signature detail: a numbered tick against a hairline rule. */
export function StepTick({ index, tone = 'light' }: { index: number; tone?: 'light' | 'dark' }) {
  return (
    <span className="relative flex w-7 shrink-0 justify-center self-stretch">
      <span
        className={cx('absolute bottom-0 left-[13px] top-0 w-px', tone === 'dark' ? 'bg-night-line' : 'bg-line')}
        aria-hidden
      />
      <span
        className={cx(
          'relative z-10 mt-3 h-[7px] w-[7px]',
          tone === 'dark' ? 'bg-night-ink-3' : 'bg-ink-2',
        )}
        aria-hidden
      />
      <span className={cx('sr-only')}>{index}</span>
    </span>
  );
}

export function MonoLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3', className)}>{children}</span>
  );
}
