import { useState } from 'react';
import { FileDown, PenLine } from 'lucide-react';
import { post, downloadFile, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge, Button, Tabs } from '@/components/ui';
import { fmtDate, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Letters() {
  const { has } = useAuth();
  const [tab, setTab] = useState<'surat' | 'template'>('surat');
  return (
    <div>
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'surat', label: 'Surat' }, ...(has('letter:write') ? [{ value: 'template' as const, label: 'Template' }] : [])]} />
      {tab === 'surat' ? (
        <CrudPage<Dict> title="Surat Resmi" subtitle="Surat keterangan, undangan, dan surat lain dengan penomoran otomatis dari template." endpoint="/kesiswaan/letters" entityLabel="surat" modalSize="lg" perm={{ write: 'letter:write' }}
          columns={[{ key: 'letter_date', header: 'Tanggal', render: (r) => fmtDate(r.letter_date as string) }, { key: 'number', header: 'Nomor', render: (r) => <code className="text-xs">{r.number as string}</code> }, { key: 'subject', header: 'Perihal', render: (r) => <div><div className="font-medium">{r.subject as string}</div><div className="text-xs text-ink-3">{r.recipient as string}</div></div> }, { key: 'template_name', header: 'Template' }, { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'SIGNED' ? 'green' : tone(r.status as string)}>{r.status === 'SIGNED' ? 'Ditandatangani' : label(r.status as string)}</Badge> }]}
          filters={[{ name: 'status', label: 'Status', options: [{ value: 'DRAFT', label: 'Draf' }, { value: 'SUBMITTED', label: 'Diajukan' }, { value: 'SIGNED', label: 'Ditandatangani' }] }]}
          rowActions={(r, reload) => <div className="flex gap-1">{has('letter:sign') && r.status !== 'SIGNED' && <Button size="sm" variant="outline" icon={<PenLine className="h-4 w-4" />} onClick={async () => { try { await post(`/kesiswaan/letters/${r.id}/sign`); toast.success('Ditandatangani'); reload(); } catch (e) { toast.error(toApiError(e).message); } }}>Tanda tangani</Button>}<Button size="sm" variant="ghost" icon={<FileDown className="h-4 w-4" />} onClick={() => downloadFile(`/kesiswaan/letters/${r.id}/pdf?download=1`, `surat-${r.number}.pdf`)} /></div>}
          fields={[{ name: 'template_id', label: 'Template', type: 'async-select', source: { url: '/kesiswaan/letters/templates', label: 'name' }, createOnly: true }, { name: 'student_id', label: 'Siswa terkait (untuk isi otomatis)', type: 'async-select', source: { url: '/users', params: { role: 'SISWA', limit: 500 }, label: 'full_name' }, createOnly: true }, { name: 'subject', label: 'Perihal', required: true, span: 2 }, { name: 'recipient', label: 'Penerima' }, { name: 'letter_date', label: 'Tanggal surat', type: 'date', required: true, defaultValue: new Date().toISOString().slice(0, 10) }, { name: 'number', label: 'Nomor (kosongkan = otomatis)' }, { name: 'status', label: 'Status', type: 'select', defaultValue: 'DRAFT', options: [{ value: 'DRAFT', label: 'Draf' }, { value: 'SUBMITTED', label: 'Ajukan tanda tangan' }] }, { name: 'body', label: 'Isi surat (kosongkan = dari template)', type: 'textarea', span: 2 }]} />
      ) : (
        <CrudPage<Dict> title="Template Surat" subtitle="Variabel: {{school}}, {{student_name}}, {{nis}}, {{nisn}}, {{class}}, {{academic_year}}, {{date}}; nomor: {{seq}}, {{month_roman}}, {{year}}" endpoint="/kesiswaan/letters/templates" entityLabel="template" modalSize="lg" perm={{ write: 'letter:write' }}
          columns={[{ key: 'code', header: 'Kode' }, { key: 'name', header: 'Nama' }, { key: 'number_format', header: 'Format nomor', render: (r) => <code className="text-xs">{r.number_format as string}</code> }, { key: 'is_active', header: 'Aktif', render: (r) => (r.is_active ? 'Ya' : '-') }]}
          fields={[{ name: 'code', label: 'Kode', required: true }, { name: 'name', label: 'Nama', required: true }, { name: 'number_format', label: 'Format nomor', placeholder: '{{seq}}/SKA/{{month_roman}}/{{year}}', span: 2 }, { name: 'body_template', label: 'Isi template', type: 'textarea', span: 2 }, { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true }]} />
      )}
    </div>
  );
}
