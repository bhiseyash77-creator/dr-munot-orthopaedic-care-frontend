import { useEffect, useState } from 'react'
import { Copy, Download, Eye, FilePlus2, FileSignature, Pencil, Printer, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { api, downloadFile, errMsg } from '../../lib/api'
import { useLoad } from '../../lib/hooks'
import { fmtDate, todayISO } from '../../lib/utils'
import { BODY_FIELDS, DOCTOR_FIELDS, DOC_TYPES, MAX_LONG, MAX_TEXT, blankContent, compact, loadMargins, marginQuery, problemsForIssue, typeInfo } from '../../lib/medicalDocs'
import type { DocField, DoctorProfileView, MedicalDocType, MedicalDocView } from '../../lib/medicalDocs'
import type { PatientView } from '../../lib/types'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Spinner, Tabs, Textarea, useUI } from '../../components/ui'
import { PatientPicker } from '../../components/PatientParts'
import { MedicalDocumentSheet } from '../../components/MedicalDocumentSheet'
import { openMedicalDocumentPrint } from '../MedicalDocumentPrint'

/** Doctor dashboard > Medical documents: certificate, physiotherapy referral, implant certificate, admission / operation advice. */
export function MedicalDocuments() {
  const { toast, confirm } = useUI()
  const [patient, setPatient] = useState<PatientView | null>(null)
  const { data: profile } = useLoad<DoctorProfileView>(() => api.get('/medical-documents/doctor-profile').then((r) => r.data), [])
  const list = useLoad<MedicalDocView[]>(() => api.get('/medical-documents', { params: { patientId: patient?.id } }).then((r) => r.data), [patient?.id], { skip: !patient })

  const [type, setType] = useState<MedicalDocType>('MEDICAL_CERTIFICATE')
  const [current, setCurrent] = useState<MedicalDocView | null>(null) // the saved document being edited / viewed; null = a new one
  const [date, setDate] = useState(todayISO())
  const [values, setValues] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState<'preview' | 'issue' | null>(null)
  const [verified, setVerified] = useState(false)
  const [showProblems, setShowProblems] = useState(false)

  const issued = current?.status === 'ISSUED'
  const problems = problemsForIssue(type, values)

  // a brand-new form starts empty except for the doctor's own details (taken from the profile; editable)
  useEffect(() => { if (!current && !dirty) setValues(blankContent(profile)) }, [profile, current, dirty, type, patient?.id])

  const startNew = (t: MedicalDocType) => { setCurrent(null); setType(t); setDate(todayISO()); setValues(blankContent(profile)); setDirty(false); setShowProblems(false); setVerified(false) }
  const discardOk = async () => !dirty || confirm({ title: 'Discard changes?', message: 'This form has changes that are not saved.', confirmLabel: 'Discard', danger: true })

  const pickPatient = async (p: PatientView | null) => { if (!(await discardOk())) return; setPatient(p); startNew(type) }
  const pickType = async (t: MedicalDocType) => { if (t === type && !current) return; if (!(await discardOk())) return; startNew(t) }
  const openDoc = async (d: MedicalDocView) => {
    if (!(await discardOk())) return
    setCurrent(d); setType(d.type); setDate(d.documentDate); setValues({ ...d.content }); setDirty(false); setShowProblems(false); setVerified(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const copyAsDraft = () => { if (!current) return; setValues({ ...current.content }); setCurrent(null); setDate(todayISO()); setDirty(true); toast.info('Copied into a new draft. Review every field, then save or issue.') }

  const set = (k: string, v: string) => { setValues((x) => ({ ...x, [k]: v })); setDirty(true) }

  async function save(): Promise<MedicalDocView | null> {
    if (!patient) return null
    setBusy(true)
    try {
      const body = { documentDate: date, content: compact(values) }
      const r = current ? await api.put(`/medical-documents/${current.id}`, body) : await api.post('/medical-documents', { ...body, patientId: patient.id, type })
      setCurrent(r.data); setDirty(false); list.reload()
      return r.data as MedicalDocView
    } catch (e) { toast.error(errMsg(e)); return null } finally { setBusy(false) }
  }

  async function saveDraft() { if (await save()) toast.success('Draft saved') }

  async function issue() {
    const saved = !current || dirty ? await save() : current
    if (!saved) return
    setBusy(true)
    try {
      const r = await api.post(`/medical-documents/${saved.id}/issue`)
      setCurrent(r.data); setReview(null); setVerified(false); setShowProblems(false); list.reload()
      toast.success(`Issued ${r.data.docNumber}. You can now print it or download the PDF.`)
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }

  async function remove() {
    if (!current || issued) return
    if (!(await confirm({ title: 'Delete this draft?', message: 'The draft will be removed. Issued documents can never be deleted.', confirmLabel: 'Delete draft', danger: true }))) return
    try { await api.delete(`/medical-documents/${current.id}`); toast.success('Draft deleted'); startNew(type); list.reload() } catch (e) { toast.error(errMsg(e)) }
  }

  const pdf = (d: MedicalDocView) => downloadFile(`/medical-documents/${d.id}/pdf?${marginQuery(loadMargins())}`, `${d.docNumber}.pdf`).catch((e) => toast.error(errMsg(e)))

  const sheetData = patient ? { type, documentDate: date, docNumber: current?.docNumber, patientName: patient.fullName, patientCode: patient.patientCode, content: compact(values) } : null

  const renderField = (f: DocField) => {
    const common = { value: values[f.key] ?? '', onChange: (e: { target: { value: string } }) => set(f.key, e.target.value), disabled: issued }
    return (
      <Field key={f.key} label={f.label + (f.required ? ' *' : '')} hint={f.hint} className={f.kind === 'long' ? 'sm:col-span-2' : ''}>
        {f.kind === 'long' ? <Textarea rows={3} maxLength={MAX_LONG} {...common} />
          : <Input type={f.kind === 'date' ? 'date' : f.kind === 'time' ? 'time' : 'text'} maxLength={f.kind === 'text' ? MAX_TEXT : undefined} {...common} />}
      </Field>
    )
  }

  return (
    <>
      <PageHeader title="Medical documents" subtitle="Certificates, referrals and advice - printed on your own letterhead paper" />
      <Card className="mb-4 max-w-2xl p-5"><PatientPicker value={patient} onChange={pickPatient} /></Card>

      {!patient ? <Empty title="Select a patient" hint="Search your patients above to create or view their medical documents." icon={<FileSignature />} /> : (
        <>
          <Card className="mb-4">
            <div className="px-4 pt-2"><Tabs value={type} onChange={pickType} tabs={DOC_TYPES.map((t) => ({ id: t.id, label: t.tab }))} /></div>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600">
                  {issued ? <>Issued <b>{current?.docNumber}</b>. Issued documents cannot be changed; make a corrected copy if needed.</>
                    : current ? <>Editing a <b>draft</b>.</> : <>New {typeInfo(type).tab.toLowerCase()} for <b>{patient.fullName}</b> ({patient.patientCode}).</>}
                </p>
                {current && <Badge tone={issued ? 'green' : 'amber'}>{issued ? 'Issued' : 'Draft'}</Badge>}
              </div>

              {issued && sheetData ? (
                <div className="rounded-xl border border-slate-200 bg-white p-6"><MedicalDocumentSheet data={sheetData} /></div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={typeInfo(type).dateLabel + ' *'}><Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDirty(true) }} /></Field>
                    <div className="hidden sm:block" />
                    {BODY_FIELDS[type].map(renderField)}
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-semibold text-slate-800">Doctor details <span className="font-normal text-slate-500">(printed in the signature area; pre-filled from your profile - please check)</span></p>
                    <div className="grid gap-4 sm:grid-cols-2">{DOCTOR_FIELDS.map(renderField)}</div>
                  </div>
                  {showProblems && problems.length > 0 && (
                    <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p className="font-medium">Before issuing:</p><ul className="list-inside list-disc">{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
                  )}
                </>
              )}

              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {issued ? (
                  <>
                    <Button onClick={() => openMedicalDocumentPrint(current!.id)}><Printer className="h-4 w-4" /> Print</Button>
                    <Button variant="outline" onClick={() => pdf(current!)}><Download className="h-4 w-4" /> Download PDF</Button>
                    <Button variant="outline" onClick={copyAsDraft}><Copy className="h-4 w-4" /> Copy as new draft</Button>
                    <Button variant="ghost" onClick={() => pickType(type)}><FilePlus2 className="h-4 w-4" /> New document</Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" loading={busy} onClick={saveDraft}><Save className="h-4 w-4" /> Save draft</Button>
                    <Button variant="outline" onClick={() => setReview('preview')}><Eye className="h-4 w-4" /> Preview</Button>
                    <Button onClick={() => { if (problems.length) { setShowProblems(true); return } setReview('issue') }}><ShieldCheck className="h-4 w-4" /> Review &amp; issue</Button>
                    {current && <Button variant="ghost" className="ml-auto text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete draft</Button>}
                  </>
                )}
              </div>
              {!issued && <p className="text-xs text-slate-500">Printing and PDF are available once the document is issued. Nothing is added to what you type, and empty fields are not printed.</p>}
            </div>
          </Card>

          <Card>
            <div className="border-b border-slate-100 px-5 py-3"><h2 className="font-semibold text-slate-900">Saved documents for {patient.fullName}</h2></div>
            <div className="p-5">
              {list.loading ? <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner className="h-4 w-4" /> Loading...</div>
                : list.error ? <ErrorBox message={list.error} onRetry={list.reload} />
                : !list.data?.length ? <Empty title="No documents yet" hint="Documents you save or issue for this patient appear here." icon={<FileSignature />} />
                : (
                  <div className="overflow-x-auto"><table className="min-w-full">
                    <thead><tr><th className="th">Document</th><th className="th">Ref. no.</th><th className="th">Date</th><th className="th">Status</th><th className="th" /></tr></thead>
                    <tbody className="divide-y divide-slate-100">{list.data.map((d) => (
                      <tr key={d.id}>
                        <td className="td">{typeInfo(d.type).tab}</td><td className="td">{d.docNumber ?? '-'}</td><td className="td">{fmtDate(d.documentDate)}</td>
                        <td className="td"><Badge tone={d.status === 'ISSUED' ? 'green' : 'amber'}>{d.status === 'ISSUED' ? 'Issued' : 'Draft'}</Badge></td>
                        <td className="td"><div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" aria-label={`${d.status === 'ISSUED' ? 'View' : 'Edit'} ${typeInfo(d.type).tab} ${d.docNumber ?? 'draft'}`} onClick={() => openDoc(d)}>{d.status === 'ISSUED' ? <><Eye className="h-4 w-4" /> View</> : <><Pencil className="h-4 w-4" /> Edit</>}</Button>
                          {d.status === 'ISSUED' && <>
                            <Button size="sm" variant="outline" aria-label={`Print ${d.docNumber}`} onClick={() => openMedicalDocumentPrint(d.id)}><Printer className="h-4 w-4" /></Button>
                            <Button size="sm" variant="outline" aria-label={`Download PDF ${d.docNumber}`} onClick={() => pdf(d)}><Download className="h-4 w-4" /></Button></>}
                        </div></td>
                      </tr>))}</tbody>
                  </table></div>)}
            </div>
          </Card>
        </>
      )}

      <Modal open={review !== null} onClose={() => setReview(null)} wide title={review === 'issue' ? 'Review and issue' : 'Preview'}
        footer={review === 'issue'
          ? <><Button variant="outline" onClick={() => setReview(null)}>Back to editing</Button><Button loading={busy} disabled={!verified} onClick={issue}><ShieldCheck className="h-4 w-4" /> Issue document</Button></>
          : <Button variant="outline" onClick={() => setReview(null)}>Close</Button>}>
        <p className="mb-3 text-xs text-slate-500">This shows the content only. Your clinic letterhead (logo, name, address) is already on the paper and is not reproduced here.</p>
        {sheetData && <div className="rounded-xl border border-slate-200 bg-white p-6"><MedicalDocumentSheet data={sheetData} /></div>}
        {review === 'issue' && (
          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
            <span>I have checked the patient details and every entry in this document, and I am issuing it under my own name and registration number.</span>
          </label>)}
      </Modal>
    </>
  )
}
