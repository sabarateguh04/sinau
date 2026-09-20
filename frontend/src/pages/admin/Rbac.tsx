import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { get, put, del, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Badge, Button, Card, Checkbox, Loading, PageHeader, Select, cx } from '@/components/ui';
import { Dict, ROLE_LABELS, Role } from '@/lib/types';

export default function Rbac() {
  const { has, user } = useAuth();
  const platform = !!user?.is_super_admin && !user.tenant;
  const [perms, setPerms] = useState<Dict[]>([]);
  const [matrix, setMatrix] = useState<{ roles: { code: string; label: string; permissions: string[]; customized: boolean; defaults: string[] }[] } | null>(null);
  const [role, setRole] = useState<string>('GURU');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const canWrite = has('rbac:write');
  const load = useCallback(async () => { const [p, m] = await Promise.all([get<Dict[]>('/rbac/permissions'), get<typeof matrix>('/rbac/matrix', { scope: platform ? 'platform' : undefined })]); setPerms(p); setMatrix(m); }, [platform]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const r = matrix?.roles.find((x) => x.code === role); setSel(new Set(r?.permissions ?? [])); }, [matrix, role]);
  const grouped = useMemo(() => { const g: Record<string, Dict[]> = {}; for (const p of perms) (g[p.module as string] ??= []).push(p); return g; }, [perms]);
  if (!matrix) return <Loading />;
  const current = matrix.roles.find((x) => x.code === role);
  const save = async () => { setBusy(true); try { await put(`/rbac/matrix/${role}`, { permissions: [...sel], scope: platform ? 'platform' : 'tenant' }); toast.success('Izin peran disimpan'); load(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  const reset = async () => { if (!confirm('Kembalikan ke bawaan?')) return; await del(`/rbac/matrix/${role}${platform ? '?scope=platform' : ''}`); toast.success('Dikembalikan ke bawaan'); load(); };
  const toggleModule = (mod: string, on: boolean) => setSel((s) => { const n = new Set(s); for (const p of grouped[mod]) { if (on) n.add(p.code as string); else n.delete(p.code as string); } return n; });
  return (
    <div>
      <PageHeader title={platform ? 'Peran & Izin Platform (template)' : 'Peran & Izin'} subtitle={platform ? 'Template bawaan untuk semua lembaga yang belum menyesuaikan sendiri.' : 'Sesuaikan izin tiap peran untuk lembaga ini. Admin tidak bisa memberi izin yang tidak dimilikinya.'} actions={canWrite && <><Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={reset} disabled={!current?.customized}>Bawaan</Button><Button loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>Simpan</Button></>} />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card padded={false}><ul className="divide-y divide-line">{matrix.roles.map((r) => <li key={r.code}><button onClick={() => setRole(r.code)} className={cx('flex w-full items-center justify-between px-4 py-2.5 text-left text-sm', role === r.code ? 'bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900/30 dark:text-brand-100' : 'hover:bg-surface-2')}><span>{ROLE_LABELS[r.code as Role] ?? r.label}</span>{r.customized && <Badge tone="amber">ubah</Badge>}</button></li>)}</ul></Card>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2"><ShieldCheck className="h-4 w-4 text-brand-700" /><b>{ROLE_LABELS[role as Role]}</b> · {sel.size} izin aktif{current?.customized ? ' · disesuaikan' : ' · bawaan'}<Select value={role} onChange={(e) => setRole(e.target.value)} className="ml-auto w-56 lg:hidden" options={matrix.roles.map((r) => ({ value: r.code, label: r.label }))} /></div>
          {Object.entries(grouped).map(([mod, list]) => { const all = list.every((p) => sel.has(p.code as string)); const some = list.some((p) => sel.has(p.code as string)); return (
            <Card key={mod} padded={false}>
              <div className="flex items-center justify-between border-b border-line px-4 py-2"><span className="text-sm font-semibold capitalize">{mod}</span>{canWrite && <button className="text-xs text-brand-700" onClick={() => toggleModule(mod, !all)}>{all ? 'Hapus semua' : some ? 'Pilih semua' : 'Pilih semua'}</button>}</div>
              <div className="grid gap-x-4 gap-y-2 p-4 sm:grid-cols-2 lg:grid-cols-3">{list.map((p) => <Checkbox key={p.code as string} checked={sel.has(p.code as string)} onChange={(v) => canWrite && setSel((s) => { const n = new Set(s); if (v) n.add(p.code as string); else n.delete(p.code as string); return n; })} label={<span><code className="text-xs">{(p.code as string).split(':')[1]}</code>{current?.defaults.includes(p.code as string) !== sel.has(p.code as string) ? <span className="ml-1 text-[10px] text-amber-600">•</span> : null}</span>} />)}</div>
            </Card>
          ); })}
        </div>
      </div>
    </div>
  );
}
