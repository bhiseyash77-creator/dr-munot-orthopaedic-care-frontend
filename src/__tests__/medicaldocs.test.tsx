import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { apiMock, ok, Providers } from './mocks'

const downloadFile = vi.fn(() => Promise.resolve())
vi.mock('../lib/api', () => ({ api: apiMock, errMsg: () => 'error', downloadFile: (...a: unknown[]) => (downloadFile as (...x: unknown[]) => unknown)(...a), openFile: vi.fn(), fetchBlobUrl: vi.fn() }))
vi.mock('../components/PatientParts', () => ({
  PatientPicker: ({ onChange }: { onChange: (p: unknown) => void }) => (
    <button onClick={() => onChange({ id: 7, patientCode: 'PAT-000007', fullName: 'Test Patient', phone: '9999999999', hasPortalAccount: false, createdAt: '2030-01-01T00:00:00' })}>pick-patient</button>),
}))
import { MedicalDocuments } from '../pages/doctor/MedicalDocuments'
import { MedicalDocumentPrint } from '../pages/MedicalDocumentPrint'
import { MedicalDocumentSheet } from '../components/MedicalDocumentSheet'
import { DEFAULT_MARGINS, clampMargins, compact, loadMargins, problemsForIssue, saveMargins } from '../lib/medicalDocs'
import type { MedicalDocView } from '../lib/medicalDocs'

const profile = { fullName: 'Dr. Test Doctor', qualification: 'MS Ortho', registrationNumber: 'REG-123' }
const doc = (over: Partial<MedicalDocView> = {}): MedicalDocView => ({
  id: 5, patientId: 7, patientName: 'Test Patient', patientCode: 'PAT-000007', doctorId: 1, type: 'MEDICAL_CERTIFICATE', status: 'ISSUED', docNumber: 'MC-000005',
  documentDate: '2030-01-02', content: { condition: 'Fracture', doctorName: 'Dr. Test Doctor', doctorRegistrationNumber: 'REG-123' }, issuedAt: '2030-01-02T10:00:00', createdAt: '2030-01-02T10:00:00', updatedAt: '2030-01-02T10:00:00', ...over,
})
const reset = () => { Object.values(apiMock).forEach((f) => typeof f === 'function' && 'mockReset' in f && f.mockReset()); downloadFile.mockClear(); localStorage.clear() }

describe('medical document rules (client mirror of the server rules)', () => {
  it('compact drops blanks and trims', () => { expect(compact({ a: ' x ', b: '  ', c: '' })).toEqual({ a: 'x' }) })
  it('certificate needs condition, doctor name and registration number', () => {
    expect(problemsForIssue('MEDICAL_CERTIFICATE', {})).toHaveLength(3)
    expect(problemsForIssue('MEDICAL_CERTIFICATE', { condition: 'x', doctorName: 'd', doctorRegistrationNumber: 'r' })).toEqual([])
  })
  it('physiotherapy duration is never required; implant needs at least one detail; operation cannot precede admission', () => {
    expect(problemsForIssue('PHYSIOTHERAPY', { diagnosis: 'x', doctorName: 'd', doctorRegistrationNumber: 'r' })).toEqual([])
    expect(problemsForIssue('IMPLANT', { doctorName: 'd', doctorRegistrationNumber: 'r' })).toHaveLength(1)
    expect(problemsForIssue('IMPLANT', { implantLocation: 'Knee', doctorName: 'd', doctorRegistrationNumber: 'r' })).toEqual([])
    expect(problemsForIssue('ADMISSION_ADVICE', { diagnosis: 'x', admissionDate: '2030-03-02', operationDate: '2030-03-01', doctorName: 'd', doctorRegistrationNumber: 'r' })).toHaveLength(1)
  })
  it('print margins are clamped, persisted and survive corrupt storage', () => {
    localStorage.clear()
    expect(loadMargins()).toEqual(DEFAULT_MARGINS)
    expect(clampMargins({ top: 999, bottom: -5, left: NaN, right: 12.3 })).toEqual({ top: 150, bottom: 0, left: DEFAULT_MARGINS.left, right: 12.5 })
    saveMargins({ top: 70, bottom: 40, left: 15, right: 15 })
    expect(loadMargins()).toEqual({ top: 70, bottom: 40, left: 15, right: 15 })
    localStorage.setItem('munot_mdoc_margins', '{not json')
    expect(loadMargins()).toEqual(DEFAULT_MARGINS)
  })
})

describe('printable sheet', () => {
  it('prints only the entered content: no clinic branding, empty fields omitted', () => {
    const { container } = render(<MedicalDocumentSheet data={{ type: 'MEDICAL_CERTIFICATE', documentDate: '2030-01-02', docNumber: 'MC-000005', patientName: 'Test Patient', patientCode: 'PAT-000007',
      content: { condition: 'Fracture', doctorName: 'Dr. Test Doctor', doctorRegistrationNumber: 'REG-123' } }} />)
    expect(screen.getByText('MEDICAL CERTIFICATE')).toBeInTheDocument()
    expect(screen.getByText('Fracture')).toBeInTheDocument()
    expect(screen.getByText('Reg. No.: REG-123')).toBeInTheDocument()
    expect(screen.queryByText('Treatment start date')).toBeNull() // not entered -> not printed
    expect(screen.queryByText('Rest advised')).toBeNull()
    expect(container.querySelector('img, svg, canvas')).toBeNull() // no logo / graphics
    // pre-printed paper: pure black, the app's global heading colour / font must not leak in
    expect(screen.getByText('MEDICAL CERTIFICATE')).toHaveStyle({ color: '#000', letterSpacing: 'normal' })
    expect(screen.getByTestId('medical-sheet')).toHaveStyle({ color: '#000' })
    expect(container.textContent).not.toMatch(/Dr\. Munot|Orthopaedic Care|Phone|Email|Fee|Bill|Invoice|Amount/i)
  })
})

describe('Medical documents page (doctor)', () => {
  beforeEach(() => {
    reset()
    apiMock.get.mockImplementation((url: string) => (url === '/medical-documents/doctor-profile' ? ok(profile) : ok([])))
  })
  const pick = async () => { render(<Providers><MedicalDocuments /></Providers>); await userEvent.click(screen.getByText('pick-patient')) }

  it('offers all four document types and pre-fills ONLY the doctor details', async () => {
    await pick()
    for (const t of ['Medical Certificate', 'Physiotherapy', 'Implant Certificate', 'Admission / Operation Advice']) expect(await screen.findByRole('tab', { name: new RegExp(t) })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText(/Doctor's name/)).toHaveValue('Dr. Test Doctor'))
    expect(screen.getByLabelText(/Medical registration number/)).toHaveValue('REG-123')
    expect(screen.getByLabelText(/Medical condition/)).toHaveValue('') // clinical content is never invented
    await userEvent.click(screen.getByRole('tab', { name: /Physiotherapy/ }))
    expect(screen.getByLabelText(/Recommended duration/)).toHaveValue('') // no automatic duration
    await userEvent.click(screen.getByRole('tab', { name: /Admission/ }))
    expect(screen.getByLabelText(/NBM from/)).toHaveValue('')
    expect(screen.getByLabelText(/Hospital admission date/)).toHaveValue('')
  })

  it('saves a draft with only the entered fields', async () => {
    apiMock.post.mockImplementation(() => ok(doc({ status: 'DRAFT', docNumber: null })))
    await pick()
    await userEvent.type(await screen.findByLabelText(/Medical condition/), 'Fracture')
    await userEvent.click(screen.getByRole('button', { name: /Save draft/ }))
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1))
    const [url, body] = apiMock.post.mock.calls[0]
    expect(url).toBe('/medical-documents')
    expect(body).toMatchObject({ patientId: 7, type: 'MEDICAL_CERTIFICATE' })
    expect(body.content).toEqual({ condition: 'Fracture', doctorName: 'Dr. Test Doctor', doctorQualification: 'MS Ortho', doctorRegistrationNumber: 'REG-123' })
  })

  it('will not issue an incomplete document; issuing needs the doctor to confirm they verified it', async () => {
    apiMock.post.mockImplementation((url: string) => ok(url.endsWith('/issue') ? doc() : doc({ status: 'DRAFT', docNumber: null })))
    await pick()
    await screen.findByLabelText(/Medical condition/)
    await userEvent.click(screen.getByRole('button', { name: /Review & issue/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Medical condition / reason is required')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(apiMock.post).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText(/Medical condition/), 'Fracture')
    await userEvent.click(screen.getByRole('button', { name: /Review & issue/ }))
    const dlg = await screen.findByRole('dialog')
    const issueBtn = within(dlg).getByRole('button', { name: /Issue document/ })
    expect(issueBtn).toBeDisabled()
    await userEvent.click(within(dlg).getByRole('checkbox'))
    await userEvent.click(issueBtn)
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/medical-documents/5/issue'))
    expect(await screen.findByText(/Issued/, { selector: 'b, span' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Print/ })).toBeEnabled() // print / PDF only after issuing
  })

  it('draft documents have no Print or PDF action; issued ones do, and PDF uses the saved print position', async () => {
    apiMock.get.mockImplementation((url: string) => (url === '/medical-documents/doctor-profile' ? ok(profile) : ok([doc({ id: 9, status: 'DRAFT', docNumber: null }), doc()])))
    saveMargins({ top: 72, bottom: 30, left: 18, right: 18 })
    await pick()
    expect(await screen.findByRole('button', { name: /Edit Medical Certificate draft/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Print draft/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF MC-000005' }))
    expect(downloadFile).toHaveBeenCalledWith('/medical-documents/5/pdf?top=72&bottom=30&left=18&right=18', 'MC-000005.pdf')
  })
})

describe('Print page', () => {
  const renderPrint = () => render(<Providers route="/print/medical-document/5"><Routes><Route path="/print/medical-document/:id" element={<MedicalDocumentPrint />} /></Routes></Providers>)
  beforeEach(reset)

  it('prints on pre-printed paper: A4 portrait, zero page margin (no browser header/footer), controls hidden, no extra content', async () => {
    apiMock.get.mockImplementation(() => ok(doc()))
    const { container } = renderPrint()
    expect(await screen.findByTestId('medical-sheet')).toBeInTheDocument()
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\n')
    expect(css).toMatch(/@page\s*{\s*size:\s*A4 portrait;\s*margin:\s*0;\s*}/)
    expect(css).toMatch(/\.no-print[^{]*{\s*display:\s*none/)
    // toolbar + guides are screen-only
    expect(screen.getByRole('button', { name: /Print$/ }).closest('.no-print')).not.toBeNull()
    expect(container.querySelectorAll('.mdoc-guide').length).toBeGreaterThan(0)
    container.querySelectorAll('.mdoc-guide').forEach((g) => expect(g.className).toContain('no-print'))
    // the only thing in the printable region is the medical document
    const printable = container.querySelector('.mdoc-paper')!.cloneNode(true) as HTMLElement
    printable.querySelectorAll('.mdoc-guide').forEach((n) => n.remove())
    expect(printable.textContent).toMatch(/^MEDICAL CERTIFICATE/)
    expect(printable.textContent).not.toMatch(/Dr\. Munot|Orthopaedic Care|Phone|Email|Bill|Invoice/i)
    expect(printable.querySelector('img, svg')).toBeNull()
  })

  it('positions the content with the saved millimetre offsets and remembers changes', async () => {
    apiMock.get.mockImplementation(() => ok(doc()))
    const { container } = renderPrint()
    await screen.findByTestId('medical-sheet')
    const thead = container.querySelector('thead td') as HTMLElement
    expect(thead.style.height).toBe(`${DEFAULT_MARGINS.top}mm`)
    const top = screen.getByLabelText('Top (mm)')
    await userEvent.clear(top); await userEvent.type(top, '75')
    await waitFor(() => expect((container.querySelector('thead td') as HTMLElement).style.height).toBe('75mm'))
    expect(loadMargins().top).toBe(75)
  })

  it('refuses to print a draft', async () => {
    apiMock.get.mockImplementation(() => ok(doc({ status: 'DRAFT', docNumber: null })))
    renderPrint()
    expect(await screen.findByText(/still a draft/)).toBeInTheDocument()
    expect(screen.queryByTestId('medical-sheet')).toBeNull()
  })
})
