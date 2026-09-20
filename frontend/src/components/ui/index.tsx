import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Loader2, Check, AlertTriangle, Info, CheckCircle2, XCircle, Search, ChevronDown, Inbox } from 'lucide-react';
import { useUi } from '@/store/ui';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

// ---------- Button ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'accent';
type Size = 'sm' | 'md' | 'lg' | 'icon';
export function Button({ variant = 'primary', size = 'md', loading, className, children, icon, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: React.ReactNode }) {
  const v: Record<Variant, string> = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm shadow-brand-700/20',
    accent: 'bg-accent-500 text-ink hover:bg-accent-600 shadow-sm',
    secondary: 'bg-surface-3 text-ink hover:bg-line',
    outline: 'border border-line bg-surface text-ink hover:bg-surface-2',
    ghost: 'text-ink-2 hover:bg-surface-3 hover:text-ink',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  const s: Record<Size, string> = { sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-5 text-base gap-2', icon: 'h-9 w-9 p-0' };
  return (
    <button {...rest} disabled={rest.disabled || loading} className={cx('inline-flex items-center justify-center rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap', v[variant], s[size], className)}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---------- Form primitives ----------
export function Field({ label, hint, error, required, children, className }: { label?: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}{required && <span className="text-red-500"> *</span>}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx('input', className)} />;
});
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} rows={p.rows ?? 4} {...p} className={cx('input resize-y', className)} />;
});
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { options?: { value: string | number; label: string }[]; placeholder?: string }>(function Select({ className, options, placeholder, children, ...p }, ref) {
  return (
    <div className="relative">
      <select ref={ref} {...p} className={cx('input appearance-none pr-9', className)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
    </div>
  );
});
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)} className={cx('inline-flex items-center gap-2 text-sm', disabled && 'opacity-50')}>
      <span className={cx('relative inline-flex h-6 w-11 items-center rounded-full transition', checked ? 'bg-brand-600' : 'bg-line')}>
        <span className={cx('inline-block h-5 w-5 rounded-full bg-white shadow transition', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </span>
      {label && <span className="text-ink-2">{label}</span>}
    </button>
  );
}
export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; className?: string }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2 text-sm', className)}>
      <span onClick={(e) => { e.preventDefault(); onChange(!checked); }} className={cx('flex h-5 w-5 items-center justify-center rounded-md border transition', checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface')}>{checked && <Check className="h-3.5 w-3.5" />}</span>
      {label}
    </label>
  );
}
export function SearchInput({ value, onChange, placeholder = 'Cari…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input pl-9" />
    </div>
  );
}

// ---------- Layout bits ----------
export function Card({ className, children, title, action, padded = true }: { className?: string; children: React.ReactNode; title?: React.ReactNode; action?: React.ReactNode; padded?: boolean }) {
  return (
    <section className={cx('card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {action}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}
export function PageHeader({ title, subtitle, actions, breadcrumb }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; breadcrumb?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {breadcrumb && <div className="mb-1 text-xs text-ink-3">{breadcrumb}</div>}
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
export function Badge({ children, tone = 'gray', className }: { children: React.ReactNode; tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'brand' | 'purple'; className?: string }) {
  const t = {
    gray: 'bg-surface-3 text-ink-2', green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200', red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200', blue: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200', brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200',
    purple: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  };
  return <span className={cx('chip', t[tone], className)}>{children}</span>;
}
export function StatCard({ label, value, hint, icon, tone = 'brand', onClick }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: 'brand' | 'accent' | 'green' | 'red' | 'blue' | 'purple'; onClick?: () => void }) {
  const tones = { brand: 'bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200', accent: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200', green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200', red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200', blue: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200', purple: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200' };
  return (
    <div onClick={onClick} className={cx('card flex items-center gap-4 p-4', onClick && 'cursor-pointer hover:border-brand-300')}>
      {icon && <div className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-ink-2">{label}</div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {hint && <div className="text-xs text-ink-3">{hint}</div>}
      </div>
    </div>
  );
}
export function EmptyState({ title = 'Belum ada data', description, action, icon }: { title?: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-3 text-ink-3">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <div className="text-sm font-semibold">{title}</div>
      {description && <div className="mt-1 max-w-sm text-sm text-ink-2">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) { return <div className={cx('skeleton', className)} />; }
export function Spinner({ className }: { className?: string }) { return <Loader2 className={cx('h-5 w-5 animate-spin text-brand-600', className)} />; }
export function Loading({ label = 'Memuat…' }: { label?: string }) { return <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-2"><Spinner /> {label}</div>; }
export function Avatar({ src, name, size = 'md', className }: { src?: string | null; name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const s = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm', xl: 'h-20 w-20 text-xl' }[size];
  const initials = name.split(' ').slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  return src ? <img src={src} alt={name} className={cx('rounded-full object-cover', s, className)} /> : <span className={cx('inline-flex items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800 dark:bg-brand-900/50 dark:text-brand-200', s, className)}>{initials}</span>;
}
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: React.ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('flex gap-1 overflow-x-auto rounded-xl bg-surface-3 p-1', className)}>
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} className={cx('flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition', value === t.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className="rounded-full bg-surface-3 px-1.5 text-[10px]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function Progress({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'green' | 'amber' | 'red' }) {
  const t = { brand: 'bg-brand-600', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' }[tone];
  return <div className={cx('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}><div className={cx('h-full rounded-full transition-all', t)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

// ---------- Modal / Drawer ----------
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' }) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-[96vw]' }[size];
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 24, opacity: 0, scale: 0.98 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }} className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl', w)}>
            <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <h2 className="text-base font-semibold">{title}</h2>
              <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>, document.body,
  );
}
export function Confirm({ open, onClose, onConfirm, title = 'Yakin?', message, danger = true, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title?: string; message?: React.ReactNode; danger?: boolean; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>Ya, lanjutkan</Button></>}>
      <div className="flex gap-3 text-sm text-ink-2"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" /><div>{message ?? 'Tindakan ini tidak dapat dibatalkan.'}</div></div>
    </Modal>
  );
}
export function Dropdown({ trigger, children, align = 'right' }: { trigger: React.ReactNode; children: React.ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className={cx('absolute z-40 mt-1.5 min-w-48 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-xl', align === 'right' ? 'right-0' : 'left-0')} onClick={() => setOpen(false)}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export const MenuItem = ({ children, onClick, danger, icon }: { children: React.ReactNode; onClick?: () => void; danger?: boolean; icon?: React.ReactNode }) => (
  <button onClick={onClick} className={cx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-3', danger ? 'text-red-600' : 'text-ink')}>{icon}{children}</button>
);

// ---------- Table & pagination ----------
export interface Column<T> { key: string; header: React.ReactNode; render?: (row: T) => React.ReactNode; className?: string; sortable?: boolean; width?: string }
export function Table<T extends { id?: string | number }>({ columns, rows, loading, empty, onRowClick, rowKey, dense }: { columns: Column<T>[]; rows: T[]; loading?: boolean; empty?: React.ReactNode; onRowClick?: (r: T) => void; rowKey?: (r: T, i: number) => string | number; dense?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
            {columns.map((c) => <th key={c.key} style={{ width: c.width }} className={cx('px-3 py-2.5 font-semibold', c.className)}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 && Array.from({ length: 5 }).map((_, i) => <tr key={i} className="border-b border-line">{columns.map((c) => <td key={c.key} className="px-3 py-3"><Skeleton className="h-4 w-3/4" /></td>)}</tr>)}
          {!loading && rows.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-ink-3">{empty ?? 'Tidak ada data'}</td></tr>}
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r, i) : (r.id ?? i)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-surface-2')}>
              {columns.map((c) => <td key={c.key} className={cx('px-3 align-middle', dense ? 'py-1.5' : 'py-3', c.className)}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pagination({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return <div className="px-1 py-2 text-xs text-ink-3">{total} data</div>;
  return (
    <div className="flex items-center justify-between gap-2 px-1 py-2 text-xs text-ink-2">
      <span>{(page - 1) * limit + 1}–{Math.min(page * limit, total)} dari {total}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />} />
        <span className="px-2">Hal. {page}/{pages}</span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} icon={<ChevronRight className="h-4 w-4" />} />
      </div>
    </div>
  );
}

// ---------- Toasts ----------
export function Toaster() {
  const { toasts, dismiss } = useUi();
  const icons = { success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />, error: <XCircle className="h-5 w-5 text-red-500" />, info: <Info className="h-5 w-5 text-sky-500" />, warning: <AlertTriangle className="h-5 w-5 text-amber-500" /> };
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:items-end sm:px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface p-3 shadow-xl">
            {icons[t.kind]}
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{t.title}</div>{t.body && <div className="text-xs text-ink-2">{t.body}</div>}</div>
            <button onClick={() => dismiss(t.id)} className="text-ink-3 hover:text-ink"><X className="h-4 w-4" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>, document.body,
  );
}

// ---------- Misc ----------
export function useDebounce<T>(value: T, ms = 350): T { const [v, setV] = useState(value); useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]); return v; }
export function Kbd({ children }: { children: React.ReactNode }) { return <kbd className="rounded border border-line bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">{children}</kbd>; }
export function Stat({ label, value }: { label: string; value: React.ReactNode }) { return <div><div className="text-xs text-ink-3">{label}</div><div className="font-semibold">{value}</div></div>; }
export function useUniqueId(prefix = 'id') { const id = useId(); return `${prefix}-${id}`; }
