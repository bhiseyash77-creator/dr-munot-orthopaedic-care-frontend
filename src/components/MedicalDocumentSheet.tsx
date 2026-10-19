import { DOC_TYPES, BODY_FIELDS, typeInfo } from '../lib/medicalDocs'
import type { MedicalDocType } from '../lib/medicalDocs'
import { fmtDate, fmtTime } from '../lib/utils'

export interface SheetData {
  type: MedicalDocType
  documentDate: string
  docNumber?: string | null
  patientName: string
  patientCode: string
  content: Record<string, string>
}

/**
 * The CONTENT of a medical document, and nothing else: no logo, clinic name, address, contacts, border, background or watermark.
 * The clinic's letterhead is already printed on the physical paper; this block is positioned inside its blank area by the print page.
 * Black text only. Empty fields are not printed at all.
 */
export function MedicalDocumentSheet({ data }: { data: SheetData }) {
  const info = typeInfo(data.type) ?? DOC_TYPES[0]
  const c = data.content
  const rows = BODY_FIELDS[data.type].filter((f) => (c[f.key] ?? '').trim())
  const show = (kind: string, v: string) => (kind === 'date' ? fmtDate(v) : kind === 'time' ? fmtTime(v) : v)
  return (
    <div data-testid="medical-sheet" className="text-black" style={{ color: '#000', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10.5pt', lineHeight: 1.4 }}>
      <h1 className="text-center font-bold" style={{ fontSize: '14pt', marginBottom: '10pt', color: '#000', fontFamily: 'inherit', letterSpacing: 'normal' }}>{info.title}</h1>
      <div className="flex justify-between" style={{ marginBottom: '8pt' }}>
        <span>{data.docNumber ? `Ref. No.: ${data.docNumber}` : ''}</span>
        <span>{info.dateLabel}: {fmtDate(data.documentDate)}</span>
      </div>
      <dl>
        <Row label="Patient name" value={data.patientName} />
        <Row label="Patient ID" value={data.patientCode} />
        {rows.map((f) => <Row key={f.key} label={f.label} value={show(f.kind, c[f.key])} multiline />)}
      </dl>
      <div style={{ marginTop: '30pt', marginLeft: '55%', breakInside: 'avoid' }}>
        <div style={{ height: '18mm' }} />
        <div style={{ borderTop: '0.6pt solid #000', paddingTop: '3pt' }}>
          <p style={{ fontSize: '9pt' }}>Signature</p>
          <p className="font-bold">{c.doctorName}</p>
          {c.doctorQualification && <p>{c.doctorQualification}</p>}
          {c.doctorRegistrationNumber && <p>Reg. No.: {c.doctorRegistrationNumber}</p>}
        </div>
      </div>
    </div>
  )
}

/** One label / value line. A plain grid per row (no display:contents) so every browser / print engine lays it out identically. */
function Row({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '32% 68%', marginBottom: '6pt', breakInside: 'avoid' }}>
      <dt className="font-bold" style={{ paddingRight: '8pt' }}>{label}</dt>
      <dd style={multiline ? { whiteSpace: 'pre-line', overflowWrap: 'anywhere' } : undefined}>{value}</dd>
    </div>
  )
}
