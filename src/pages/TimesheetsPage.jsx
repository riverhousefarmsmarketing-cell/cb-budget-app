import { useState } from 'react'
import { BRAND } from '../lib/brand'
import { Icons } from '../components/Icons'
import { SectionHeader } from '../components/SharedUI'

export default function TimesheetsPage({ embedded }) {
  const [uploadStatus, setUploadStatus] = useState(null)

  const handleUpload = () => {
    // TODO: Connect to validate-timesheet-upload Edge Function
    setUploadStatus('processing')
    setTimeout(() => setUploadStatus('success'), 1500)
    setTimeout(() => setUploadStatus(null), 4000)
  }

  return (
    <div>
      {!embedded && <SectionHeader title="Timesheets" subtitle="Upload and reconcile timesheet data" />}

      {/* Upload Section */}
      <div style={{
        background: BRAND.white,
        border: `2px dashed ${BRAND.greyBorder}`,
        padding: '40px 24px',
        textAlign: 'left',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ color: BRAND.purple }}><Icons.Upload /></div>
          <div>
            <p style={{ fontSize: '14px', color: BRAND.purple, margin: '0 0 4px' }}>Upload Timesheet CSV</p>
            <p style={{ fontSize: '12px', color: BRAND.coolGrey, margin: '0 0 12px' }}>
              Upload a CSV file with columns: employee_code, project_code, week_ending, hours.
              The Edge Function validates entries against employees and projects before importing.
            </p>
            <button
              onClick={handleUpload}
              style={{
                padding: '8px 20px',
                background: BRAND.purple,
                color: BRAND.white,
                border: 'none',
                cursor: 'pointer',
                fontFamily: BRAND.font,
                fontSize: '13px',
                letterSpacing: '0.02em',
              }}
            >
              Select File and Upload
            </button>
          </div>
        </div>
        {uploadStatus === 'processing' && (
          <div style={{ marginTop: '16px', padding: '10px 16px', background: '#E8F4FD', color: BRAND.blue, fontSize: '13px' }}>
            Validating and importing timesheet data...
          </div>
        )}
        {uploadStatus === 'success' && (
          <div style={{ marginTop: '16px', padding: '10px 16px', background: '#E8F5E8', color: BRAND.green, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icons.Check /> Timesheet uploaded successfully.
          </div>
        )}
      </div>

      <div style={{ padding: '24px', background: BRAND.white, border: `1px solid ${BRAND.greyBorder}`, color: BRAND.coolGrey, fontSize: '14px' }}>
        Timesheet entries will appear here once CSV files are uploaded. Each upload is validated by the Edge Function and recorded in the timesheet_uploads audit table.
      </div>
    </div>
  )
}
