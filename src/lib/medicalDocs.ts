/** Medical documents: types, field catalogue (mirrors the backend's MedicalDocRules) and print-position calibration. */

export type MedicalDocType = 'MEDICAL_CERTIFICATE' | 'PHYSIOTHERAPY' | 'IMPLANT' | 'ADMISSION_ADVICE'
export type MedicalDocStatus = 'DRAFT' | 'ISSUED'
export type FieldKind = 'text' | 'long' | 'date' | 'time'

export interface DocField { key: string; label: string; kind: FieldKind; required?: boolean; hint?: string }

export interface MedicalDocView {
  id: number; patientId: number; patientName: string; patientCode: string; doctorId: number
  type: MedicalDocType; status: MedicalDocStatus; docNumber?: string | null; documentDate: string
  content: Record<string, string>; issuedAt?: string | null; createdAt: string; updatedAt: string
}
export interface DoctorProfileView { fullName: string; qualification?: string | null; registrationNumber?: string | null }

export const MAX_TEXT = 200
export const MAX_LONG = 1500

export const DOC_TYPES: { id: MedicalDocType; tab: string; title: string; dateLabel: string }[] = [
  { id: 'MEDICAL_CERTIFICATE', tab: 'Medical Certificate', title: 'MEDICAL CERTIFICATE', dateLabel: 'Certificate date' },
  { id: 'PHYSIOTHERAPY', tab: 'Physiotherapy', title: 'PHYSIOTHERAPY REFERRAL', dateLabel: 'Referral date' },
  { id: 'IMPLANT', tab: 'Implant Certificate', title: 'IMPLANT CERTIFICATE', dateLabel: 'Certificate date' },
  { id: 'ADMISSION_ADVICE', tab: 'Admission / Operation Advice', title: 'HOSPITAL ADMISSION / OPERATION ADVICE', dateLabel: 'Advice date' },
]
export const typeInfo = (t: MedicalDocType) => DOC_TYPES.find((x) => x.id === t)!

export const BODY_FIELDS: Record<MedicalDocType, DocField[]> = {
  MEDICAL_CERTIFICATE: [
    { key: 'condition', label: 'Medical condition / reason', kind: 'long', required: true },
    { key: 'treatmentStart', label: 'Treatment start date', kind: 'date' },
    { key: 'treatmentEnd', label: 'Treatment end date', kind: 'date' },
    { key: 'restAdvised', label: 'Rest advised', kind: 'text', hint: 'Type it exactly as it should print' },
    { key: 'fitToResumeDate', label: 'Fit to resume work / regular duties on', kind: 'date' },
  ],
  PHYSIOTHERAPY: [
    { key: 'diagnosis', label: 'Diagnosis / clinical reason', kind: 'long', required: true },
    { key: 'startDate', label: 'Physiotherapy start date', kind: 'date' },
    { key: 'duration', label: 'Recommended duration', kind: 'text', hint: 'Left blank unless you enter it' },
    { key: 'endDate', label: 'Physiotherapy end date', kind: 'date' },
    { key: 'instructions', label: 'Treatment instructions', kind: 'long' },
  ],
  IMPLANT: [
    { key: 'diagnosis', label: 'Diagnosis / medical reason', kind: 'long' },
    { key: 'implantType', label: 'Implant type', kind: 'text' },
    { key: 'implantLocation', label: 'Implant location', kind: 'text' },
    { key: 'implantDetails', label: 'Implant details', kind: 'long' },
    { key: 'surgeryDate', label: 'Surgery date', kind: 'date' },
    { key: 'notes', label: 'Medical notes', kind: 'long' },
  ],
  ADMISSION_ADVICE: [
    { key: 'diagnosis', label: 'Diagnosis / reason for admission', kind: 'long', required: true },
    { key: 'admissionDate', label: 'Hospital admission date', kind: 'date' },
    { key: 'operationDate', label: 'Proposed operation date', kind: 'date' },
    { key: 'plannedProcedure', label: 'Planned procedure', kind: 'long' },
    { key: 'anaesthesiaAssessment', label: 'Anaesthesia assessment / fitness instructions', kind: 'long' },
    { key: 'nbmInstructions', label: 'NBM (nil by mouth) instructions', kind: 'long' },
    { key: 'nbmTime', label: 'NBM from (time)', kind: 'time' },
    { key: 'otherInstructions', label: 'Other pre-operative instructions', kind: 'long' },
  ],
}

export const DOCTOR_FIELDS: DocField[] = [
  { key: 'doctorName', label: "Doctor's name", kind: 'text', required: true },
  { key: 'doctorQualification', label: 'Qualification', kind: 'text' },
  { key: 'doctorRegistrationNumber', label: 'Medical registration number', kind: 'text', required: true },
]

/** Nothing is ever pre-filled except the doctor's own details; every clinical field starts empty. */
export function blankContent(profile?: DoctorProfileView | null): Record<string, string> {
  const c: Record<string, string> = {}
  if (profile?.fullName) c.doctorName = profile.fullName
  if (profile?.qualification) c.doctorQualification = profile.qualification
  if (profile?.registrationNumber) c.doctorRegistrationNumber = profile.registrationNumber
  return c
}

/** Same rules the server applies when issuing (the server is the authority; this gives instant feedback). */
export function problemsForIssue(type: MedicalDocType, c: Record<string, string>): string[] {
  const v = (k: string) => (c[k] ?? '').trim()
  const p: string[] = []
  for (const f of [...BODY_FIELDS[type], ...DOCTOR_FIELDS]) if (f.required && !v(f.key)) p.push(`${f.label} is required`)
  const order = (a: string, b: string, msg: string) => { if (v(a) && v(b) && v(b) < v(a)) p.push(msg) }
  if (type === 'MEDICAL_CERTIFICATE') {
    order('treatmentStart', 'treatmentEnd', 'Treatment end date cannot be before the start date')
    order('treatmentStart', 'fitToResumeDate', 'The date fit to resume cannot be before the treatment start date')
  }
  if (type === 'PHYSIOTHERAPY') order('startDate', 'endDate', 'Physiotherapy end date cannot be before the start date')
  if (type === 'ADMISSION_ADVICE') order('admissionDate', 'operationDate', 'The operation date cannot be before the admission date')
  if (type === 'IMPLANT' && !BODY_FIELDS.IMPLANT.some((f) => v(f.key))) p.push('Enter at least one implant detail before issuing')
  return p
}

/** Drops blank values so only what the doctor entered is sent / printed. */
export function compact(c: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(c)) if (v.trim()) out[k] = v.trim()
  return out
}

/* ---------- Print position (calibrated once per computer / printer) ---------- */

export interface PrintMargins { top: number; bottom: number; left: number; right: number }
/** Starting values only. The real blank area depends on your pre-printed letterhead: set it once with the calibration controls. */
export const DEFAULT_MARGINS: PrintMargins = { top: 60, bottom: 35, left: 20, right: 20 }
const KEY = 'munot_mdoc_margins'
const LIMITS: Record<keyof PrintMargins, [number, number]> = { top: [0, 150], bottom: [0, 100], left: [0, 60], right: [0, 60] }

export function clampMargins(m: PrintMargins): PrintMargins {
  const f = (k: keyof PrintMargins) => {
    const n = Number(m[k])
    const [lo, hi] = LIMITS[k]
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 2) / 2)) : DEFAULT_MARGINS[k]
  }
  return { top: f('top'), bottom: f('bottom'), left: f('left'), right: f('right') }
}

export function loadMargins(): PrintMargins {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return clampMargins({ ...DEFAULT_MARGINS, ...JSON.parse(raw) })
  } catch { /* storage unavailable or corrupt: use defaults */ }
  return DEFAULT_MARGINS
}

export function saveMargins(m: PrintMargins) {
  try { localStorage.setItem(KEY, JSON.stringify(clampMargins(m))) } catch { /* ignore */ }
}

export const marginQuery = (m: PrintMargins) => `top=${m.top}&bottom=${m.bottom}&left=${m.left}&right=${m.right}`
