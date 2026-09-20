/**
 * Generic list + form page bound to a backend crudRouter resource.
 * Config-driven: columns for the table, fields for the create/edit modal, filters for the toolbar.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Plus, Pencil, Trash2, RefreshCw, Download } from 'lucide-react';
import { getPaged, post, put, del, toApiError, get } from '@/lib/api';
import { Button, Card, Column, Confirm, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Switch, Table, Textarea, useDebounce, cx } from '@/components/ui';
import { toast } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { Dict } from '@/lib/types';

export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'switch' | 'date' | 'datetime' | 'time' | 'color' | 'email' | 'password' | 'json' | 'async-select' | 'custom';
export interface FormField {
  name: string; label: string; type?: FieldType; required?: boolean; placeholder?: string; hint?: string; options?: { value: string | number; label: string }[];
  /** async-select: endpoint returning {data:[...]} (paged or plain) + mapping */
  source?: { url: string; params?: Dict; value?: string; label?: string | ((r: Dict) => string) };
  span?: 1 | 2; min?: number; max?: number; step?: number; disabled?: boolean; showIf?: (values: Dict) => boolean; render?: (p: { value: unknown; onChange: (v: unknown) => void; values: Dict }) => React.ReactNode;
  /** Value transform before submit */
  toValue?: (v: unknown) => unknown; defaultValue?: unknown; createOnly?: boolean;
}
export interface FilterDef { name: string; label: string; type?: 'select' | 'text' | 'async-select' | 'bool'; options?: { value: string; label: string }[]; source?: FormField['source'] }
export interface CrudConfig<T extends Dict = Dict> {
  title: string; subtitle?: string; endpoint: string; columns: Column<T>[]; fields?: FormField[]; filters?: FilterDef[]; searchPlaceholder?: string; searchable?: boolean;
  perm?: { write?: string; delete?: string }; canCreate?: boolean; canEdit?: boolean; canDelete?: boolean; defaultParams?: Dict; rowActions?: (row: T, reload: () => void) => React.ReactNode;
  onRowClick?: (row: T) => void; extraActions?: React.ReactNode; exportUrl?: string; modalSize?: 'sm' | 'md' | 'lg' | 'xl'; presentForm?: (row: T) => Dict; entityLabel?: string; sort?: string; order?: 'ASC' | 'DESC'; limit?: number;
  afterSave?: (row: Dict, isCreate: boolean) => void; emptyText?: string; noHeader?: boolean; headerActions?: React.ReactNode;
}

export function useResource<T = Dict>(endpoint: string, params: Dict, deps: unknown[] = []) {
  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(params);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getPaged<T>(endpoint, params).then((r) => { if (!alive) return; setRows(r.data); setMeta(r.meta); }).catch((e) => toast.error('Gagal memuat', toApiError(e).message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, key, tick, ...deps]);
  return { rows, meta, loading, reload: () => setTick((t) => t + 1), setRows };
}

export function AsyncOptions({ source }: { source: NonNullable<FormField['source']> }) {
  const [opts, setOpts] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    let alive = true;
    get<unknown>(source.url, { limit: 500, ...(source.params ?? {}) }).then((d) => {
      if (!alive) return;
      const arr = (Array.isArray(d) ? d : (d as { data?: Dict[] })?.data ?? []) as Dict[];
      setOpts(arr.map((r) => ({ value: String(r[source.value ?? 'id']), label: typeof source.label === 'function' ? source.label(r) : String(r[source.label ?? 'name'] ?? '') })));
    }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.url, JSON.stringify(source.params)]);
  return <>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</>;
}
export function useAsyncOptions(source?: FormField['source']) {
  const [opts, setOpts] = useState<{ value: string; label: string }[]>([]);
  const key = source ? source.url + JSON.stringify(source.params ?? {}) : '';
  useEffect(() => {
    if (!source) return;
    let alive = true;
    get<unknown>(source.url, { limit: 500, ...(source.params ?? {}) }).then((d) => {
      if (!alive) return;
      const arr = (Array.isArray(d) ? d : (d as { data?: Dict[] })?.data ?? []) as Dict[];
      setOpts(arr.map((r) => ({ value: String(r[source.value ?? 'id']), label: typeof source.label === 'function' ? source.label(r) : String(r[source.label ?? 'name'] ?? '') })));
    }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return opts;
}

/** Renders one form field bound to react-hook-form. */
export function FormFieldInput({ f, control, register, errors, values }: { f: FormField; control: ReturnType<typeof useForm>['control']; register: ReturnType<typeof useForm>['register']; errors: Record<string, { message?: string } | undefined>; values: Dict }) {
  const err = errors[f.name]?.message as string | undefined;
  const t = f.type ?? 'text';
  const common = { disabled: f.disabled };
  const ph = { placeholder: f.placeholder };
  if (f.showIf && !f.showIf(values)) return null;
  const wrap = (child: React.ReactNode) => <Field key={f.name} label={f.label} required={f.required} hint={f.hint} error={err} className={f.span === 2 ? 'sm:col-span-2' : ''}>{child}</Field>;
  if (t === 'custom' && f.render) return wrap(<Controller name={f.name} control={control} render={({ field }) => <>{f.render!({ value: field.value, onChange: field.onChange, values })}</>} />);
  if (t === 'textarea') return wrap(<Textarea {...register(f.name, { required: f.required && 'Wajib diisi' })} {...common} {...ph} />);
  if (t === 'json') return wrap(<Controller name={f.name} control={control} render={({ field }) => <Textarea value={typeof field.value === 'string' ? field.value : JSON.stringify(field.value ?? null, null, 2)} onChange={(e) => field.onChange(e.target.value)} className="font-mono text-xs" rows={6} />} />);
  if (t === 'switch') return wrap(<Controller name={f.name} control={control} render={({ field }) => <div className="pt-1"><Switch checked={!!field.value} onChange={field.onChange} label={f.placeholder} /></div>} />);
  if (t === 'select') return wrap(<Select {...register(f.name, { required: f.required && 'Wajib dipilih' })} placeholder={f.placeholder ?? '— pilih —'} options={f.options} {...common} />);
  if (t === 'async-select') return wrap(<Select {...register(f.name, { required: f.required && 'Wajib dipilih' })} placeholder={f.placeholder ?? '— pilih —'} {...common}>{f.source && <AsyncOptions source={f.source} />}</Select>);
  if (t === 'number') return wrap(<Input type="number" step={f.step ?? 'any'} min={f.min} max={f.max} {...register(f.name, { required: f.required && 'Wajib diisi', valueAsNumber: true })} {...common} {...ph} />);
  const type = t === 'datetime' ? 'datetime-local' : t;
  return wrap(<Input type={type} {...register(f.name, { required: f.required && 'Wajib diisi' })} {...common} {...ph} />);
}

export function cleanValues(fields: FormField[], values: Dict, isCreate: boolean): Dict {
  const out: Dict = {};
  for (const f of fields) {
    if (!isCreate && f.createOnly) continue;
    if (f.showIf && !f.showIf(values)) continue;
    let v = values[f.name];
    if (f.type === 'number') v = v === '' || v === null || v === undefined || Number.isNaN(v) ? null : Number(v);
    else if (f.type === 'switch') v = !!v;
    else if (f.type === 'json') { if (typeof v === 'string') { try { v = v.trim() ? JSON.parse(v) : null; } catch { throw new Error(`${f.label}: JSON tidak valid`); } } }
    else if (typeof v === 'string') v = v.trim() === '' ? null : v;
    if (f.type === 'datetime' && v) v = new Date(String(v)).toISOString();
    if (f.type === 'password' && !v) continue;
    if (f.toValue) v = f.toValue(v);
    if (v === undefined) continue;
    if (v === null && f.required && isCreate) continue;
    out[f.name] = v;
  }
  return out;
}

export function CrudPage<T extends Dict = Dict>(cfg: CrudConfig<T>) {
  const { has } = useAuth();
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Dict>({});
  const [editing, setEditing] = useState<T | null | 'new'>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const params = useMemo(() => ({ page, limit: cfg.limit ?? 20, q: dq || undefined, sort: cfg.sort, order: cfg.order, ...(cfg.defaultParams ?? {}), ...filters }), [page, dq, filters, cfg.defaultParams, cfg.sort, cfg.order, cfg.limit]);
  const { rows, meta, loading, reload } = useResource<T>(cfg.endpoint, params);
  useEffect(() => { setPage(1); }, [dq, filters]);
  const canWrite = cfg.perm?.write ? has(cfg.perm.write) : true;
  const canDelete = cfg.perm?.delete ? has(cfg.perm.delete) : canWrite;

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await del(`${cfg.endpoint}/${deleting.id}`); toast.success('Data dihapus'); setDeleting(null); reload(); } catch (e) { toast.error('Gagal menghapus', toApiError(e).message); } finally { setBusy(false); }
  };

  const actionCol: Column<T> | null = (cfg.canEdit !== false || cfg.canDelete !== false || cfg.rowActions) && (canWrite || cfg.rowActions)
    ? { key: '__actions', header: '', className: 'text-right whitespace-nowrap', render: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {cfg.rowActions?.(r, reload)}
          {cfg.canEdit !== false && canWrite && cfg.fields && <Button size="icon" variant="ghost" title="Ubah" onClick={() => setEditing(r)} icon={<Pencil className="h-4 w-4" />} />}
          {cfg.canDelete !== false && canDelete && <Button size="icon" variant="ghost" title="Hapus" className="text-red-600" onClick={() => setDeleting(r)} icon={<Trash2 className="h-4 w-4" />} />}
        </div>
      ) }
    : null;
  const columns = actionCol ? [...cfg.columns, actionCol] : cfg.columns;

  return (
    <div>
      {!cfg.noHeader && <PageHeader title={cfg.title} subtitle={cfg.subtitle} actions={<>
        {cfg.headerActions}
        {cfg.exportUrl && <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => window.open(cfg.exportUrl)}>Ekspor</Button>}
        {cfg.extraActions}
        {cfg.canCreate !== false && canWrite && cfg.fields && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Tambah</Button>}
      </>} />}
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          {cfg.searchable !== false && <SearchInput value={q} onChange={setQ} placeholder={cfg.searchPlaceholder} className="w-full sm:w-64" />}
          {cfg.filters?.map((f) => <FilterControl key={f.name} f={f} value={filters[f.name]} onChange={(v) => setFilters((s) => ({ ...s, [f.name]: v }))} />)}
          <div className="ml-auto flex items-center gap-2 text-xs text-ink-3"><span>{meta.total} data</span><Button size="icon" variant="ghost" onClick={reload} icon={<RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />} /></div>
        </div>
        <Table<T> columns={columns} rows={rows} loading={loading} onRowClick={cfg.onRowClick} empty={cfg.emptyText} />
        <div className="border-t border-line px-2"><Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} /></div>
      </Card>
      {cfg.fields && <CrudForm open={editing !== null} row={editing === 'new' ? null : editing} cfg={cfg} onClose={() => setEditing(null)} onSaved={(row, isCreate) => { setEditing(null); reload(); cfg.afterSave?.(row, isCreate); }} />}
      <Confirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy} title={`Hapus ${cfg.entityLabel ?? 'data'}?`} message="Data yang dihapus tidak bisa dikembalikan." />
    </div>
  );
}

function FilterControl({ f, value, onChange }: { f: FilterDef; value: unknown; onChange: (v: unknown) => void }) {
  if (f.type === 'text') return <Input value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)} placeholder={f.label} className="w-40" />;
  if (f.type === 'bool') return <Select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)} className="w-40" placeholder={f.label} options={[{ value: '1', label: 'Ya' }, { value: '0', label: 'Tidak' }]} />;
  if (f.type === 'async-select' && f.source) return <Select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)} className="w-48" placeholder={f.label}><AsyncOptions source={f.source} /></Select>;
  return <Select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)} className="w-44" placeholder={f.label} options={f.options} />;
}

export function CrudForm<T extends Dict>({ open, row, cfg, onClose, onSaved }: { open: boolean; row: T | null; cfg: CrudConfig<T>; onClose: () => void; onSaved: (row: Dict, isCreate: boolean) => void }) {
  const fields = cfg.fields ?? [];
  const defaults = useMemo(() => { const d: Dict = {}; for (const f of fields) d[f.name] = f.defaultValue ?? (f.type === 'switch' ? false : ''); return d; }, [fields]);
  const { register, handleSubmit, reset, control, watch, formState: { errors, isSubmitting } } = useForm<Dict>({ defaultValues: defaults });
  const values = watch();
  useEffect(() => {
    if (!open) return;
    if (row) { const src = cfg.presentForm ? cfg.presentForm(row) : row; const v: Dict = {}; for (const f of fields) { let x = src[f.name]; if (f.type === 'switch') x = !!x; else if (f.type === 'datetime' && x) x = new Date(String(x)).toISOString().slice(0, 16); else if (f.type === 'date' && x) x = String(x).slice(0, 10); else if (f.type === 'json' && x && typeof x !== 'string') x = JSON.stringify(x, null, 2); v[f.name] = x ?? (f.type === 'switch' ? false : ''); } reset(v); }
    else reset(defaults);
  }, [open, row, reset, defaults, fields, cfg]);
  const submit = useCallback(async (v: Dict) => {
    try {
      const body = cleanValues(fields, v, !row);
      const saved = row ? await put<Dict>(`${cfg.endpoint}/${row.id}`, body) : await post<Dict>(cfg.endpoint, body);
      toast.success(row ? 'Perubahan disimpan' : 'Data ditambahkan');
      onSaved(saved, !row);
    } catch (e) {
      const err = toApiError(e);
      const details = Array.isArray(err.details) ? (err.details as { path: string; message: string }[]).map((d) => `${d.path}: ${d.message}`).join(', ') : undefined;
      toast.error(err.message, details ?? (e instanceof Error && !(e as { response?: unknown }).response ? e.message : undefined));
    }
  }, [fields, row, cfg.endpoint, onSaved]);
  return (
    <Modal open={open} onClose={onClose} size={cfg.modalSize ?? 'md'} title={`${row ? 'Ubah' : 'Tambah'} ${cfg.entityLabel ?? cfg.title}`} footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={isSubmitting} onClick={handleSubmit(submit)}>Simpan</Button></>}>
      <form onSubmit={handleSubmit(submit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.filter((f) => !(row && f.createOnly)).map((f) => <FormFieldInput key={f.name} f={f} control={control} register={register} errors={errors as Record<string, { message?: string }>} values={values} />)}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
