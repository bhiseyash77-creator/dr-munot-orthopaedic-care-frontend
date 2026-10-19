import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Printer, RotateCcw } from 'lucide-react'
import { api, downloadFile, errMsg } from '../lib/api'
import { useLoad } from '../lib/hooks'
import { DEFAULT_MARGINS, clampMargins, loadMargins, marginQuery, saveMargins, typeInfo } from '../lib/medicalDocs'
import type { MedicalDocView, PrintMargins } from '../lib/medicalDocs'
import { Button, ErrorBox, Field, Input, PageLoader, useUI } from '../components/ui'
import { MedicalDocumentSheet } from '../components/MedicalDocumentSheet'

/**
 * Print-only CSS, mounted ONLY while this page is open (so the existing prescription / report printing is unaffected).
 * - @page margin 0 : the browser has no page margin to draw its own date / URL / page-number header and footer in.
 * - everything positioned by millimetre offsets (top / left / right / bottom of the blank area of the pre-printed letterhead).
 * - the dashboard, buttons, guides and calibration controls are `no-print`; no background, border or colour is printed.
 */
const PRINT_CSS = `
@page { size: A4 portrait; margin: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .no-print, .mdoc-guide { display: none !important; }
  .mdoc-stage { padding: 0 !important; background: none !important; overflow: visible !important; display: block !important; }
  .mdoc-paper { margin: 0 !important; width: 210mm !important; min-height: 0 !important; box-shadow: none !important; background: none !important; }
  thead { display: table-header-group; } tfoot { display: table-footer-group; }
}
`
const MM = 96 / 25.4
const FIELDS: { key: keyof PrintMargins; label: string }[] = [
  { key: 'top', label: 'Top (mm)' }, { key: 'bottom', label: 'Bottom (mm)' }, { key: 'left', label: 'Left (mm)' }, { key: 'right', label: 'Right (mm)' },
]

export function MedicalDocumentPrint() {
  const { id } = useParams()
  const { toast } = useUI()
  const { data: doc, loading, error, reload } = useLoad<MedicalDocView>(() => api.get(`/medical-documents/${id}`).then((r) => r.data), [id])
  const [text, setText] = useState<Record<keyof PrintMargins, string>>(() => {
    const m = loadMargins()
    return { top: String(m.top), bottom: String(m.bottom), left: String(m.left), right: String(m.right) }
  })
  const [outline, setOutline] = useState(false) // alignment test only; never remembered
  const [overflow, setOverflow] = useState(false)
  const paperRef = useRef<HTMLDivElement>(null)
  const m = clampMargins({ top: Number(text.top), bottom: Number(text.bottom), left: Number(text.left), right: Number(text.right) })

  useEffect(() => { saveMargins(m) }, [m.top, m.bottom, m.left, m.right]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!doc?.docNumber) return
    const prev = document.title
    document.title = doc.docNumber // used as the default file name when saving as PDF
    return () => { document.title = prev }
  }, [doc?.docNumber])
  useLayoutEffect(() => { if (paperRef.current) setOverflow(paperRef.current.scrollHeight > 297 * MM + 2) }, [doc, m.top, m.bottom, m.left, m.right])

  if (loading) return <PageLoader />
  if (error || !doc) return <div className="p-6"><ErrorBox message={error ?? 'Document not found'} onRetry={reload} /></div>
  if (doc.status !== 'ISSUED') return <div className="p-6 text-sm text-slate-700">This document is still a draft. Issue it from <b>Medical documents</b> before printing.</div>

  const reset = () => setText({ top: String(DEFAULT_MARGINS.top), bottom: String(DEFAULT_MARGINS.bottom), left: String(DEFAULT_MARGINS.left), right: String(DEFAULT_MARGINS.right) })
  const data = { type: doc.type, documentDate: doc.documentDate, docNumber: doc.docNumber, patientName: doc.patientName, patientCode: doc.patientCode, content: doc.content }

  return (
    <>
      <style>{PRINT_CSS}</style>

      <div className="no-print border-b border-slate-200 bg-white p-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-semibold text-slate-900">{typeInfo(doc.type).title} <span className="font-normal text-slate-500">{doc.docNumber}</span></p>
            <p className="mt-1 max-w-xl text-xs text-slate-500">
              Load your letterhead paper (A4, portrait). In the print dialog choose <b>Paper: A4</b>, <b>Margins: None</b>, <b>Scale: 100%</b>, and switch <b>Headers and footers</b> and <b>Background graphics</b> off.
              The grey bands below show where your printed letterhead is; nothing is printed there.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => downloadFile(`/medical-documents/${doc.id}/pdf?${marginQuery(m)}`, `${doc.docNumber}.pdf`).catch((e) => toast.error(errMsg(e)))}><Download className="h-4 w-4" /> Download PDF</Button>
            <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          </div>
        </div>
        <div className="mx-auto mt-3 flex max-w-5xl flex-wrap items-end gap-3" aria-label="Print position">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} className="w-28">
              <Input type="number" min={0} step={0.5} value={text[f.key]} onChange={(e) => setText({ ...text, [f.key]: e.target.value })} />
            </Field>
          ))}
          <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" /> Reset</Button>
          <label className="flex items-center gap-2 pb-2 text-xs text-slate-600">
            <input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} />
            Alignment test: also print a thin outline of the writing area (use plain paper, then untick)
          </label>
          <p className="pb-2 text-xs text-slate-500">Saved on this computer. These offsets are also used for the PDF.</p>
        </div>
        {overflow && <p role="alert" className="mx-auto mt-3 max-w-5xl rounded-lg bg-amber-50 p-2 text-xs text-amber-800">The content is longer than the blank area and will continue on a second page. Shorten the text or reduce the top / bottom margin.</p>}
      </div>

      <div className="mdoc-stage flex justify-center overflow-x-auto bg-slate-100 p-6">
        <div ref={paperRef} className="mdoc-paper relative bg-white shadow" style={{ width: '210mm', minHeight: '297mm' }}>
          <div aria-hidden className="mdoc-guide no-print pointer-events-none absolute inset-x-0 top-0 grid place-items-center bg-slate-100 text-center text-[10px] uppercase tracking-wide text-slate-400" style={{ height: `${m.top}mm` }}>Letterhead area - already printed on your paper</div>
          <div aria-hidden className="mdoc-guide no-print pointer-events-none absolute inset-x-0 bottom-0 grid place-items-center bg-slate-100 text-center text-[10px] uppercase tracking-wide text-slate-400" style={{ height: `${m.bottom}mm` }}>Letterhead footer area</div>
          <div aria-hidden className="mdoc-guide no-print pointer-events-none absolute border border-dashed border-slate-300" style={{ top: `${m.top}mm`, bottom: `${m.bottom}mm`, left: `${m.left}mm`, right: `${m.right}mm` }} />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><td style={{ height: `${m.top}mm`, padding: 0 }} /></tr></thead>
            <tbody><tr><td style={{ padding: `0 ${m.right}mm 0 ${m.left}mm`, verticalAlign: 'top' }}>
              <div style={outline ? { outline: '0.25mm dashed #000' } : undefined}><MedicalDocumentSheet data={data} /></div>
            </td></tr></tbody>
            <tfoot><tr><td style={{ height: `${m.bottom}mm`, padding: 0 }} /></tr></tfoot>
          </table>
        </div>
      </div>
    </>
  )
}

export const openMedicalDocumentPrint = (id: number) => window.open(`/print/medical-document/${id}`, '_blank', 'noopener')
