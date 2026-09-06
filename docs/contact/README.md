# Contact Form Documentation

Comprehensive lead capture form with Google Forms backend, field validation, automatic ticket ID generation, and smart country/timezone detection.

## Overview

- **Page:** `/app/contact/page.tsx`
- **Form Component:** `/components/enhanced-contact-form.tsx`
- **Backend:** Google Forms (no-cors submission)
- **Total Fields:** 19 (visible + hidden)

## Form Fields

### Required Fields

1. **Full Name** - Text input, min 2 characters
2. **Email Address** - Valid email format required
3. **Country** - Searchable dropdown with flag icons
4. **Preferred Contact Method** - WhatsApp, Email, or Both
5. **WhatsApp Number** - Required if contact method is WhatsApp or Both
6. **Time Zone** - Auto-selected based on country
7. **Service Type** - Multi-select checkboxes (at least one required)
8. **Project Summary** - Textarea, min 20 characters
9. **Urgency** - Dropdown (As soon as possible, Within a week, etc.)
10. **GDPR Consent** - Checkbox, must be checked

### Optional Fields

11. **Company/Organization** - Text input
12. **How Did You Find Me?** - Dropdown (Referral, Upwork, LinkedIn, etc.)
13. **Budget Range** - Min and max budget fields
14. **Preferred Contact Date** - Date picker (today or future dates)
15. **Best Time to Contact** - Time picker
16. **NDA Required?** - Checkbox
17. **Service Type (Other)** - Text input, shown only if "Other" service is selected

### Hidden/Automatic Fields

Auto-populated and sent with submission:

18. **Ticket ID** - 8-character hex ID (e.g., `A3F2B9E1`)
19. **Source Page** - Always `/contact` for this form
20. **User Agent** - Browser/device info
21. **Device Type** - Mobile, Desktop, or Tablet
22. **Priority** - Derived from urgency (High, Medium, Low)
23. **Status** - Always "New"
24. **Timestamp** - ISO 8601 format submission time

## Special Features

### Contact Method Logic

**Rule:** WhatsApp number is required **only if**:
- Preferred Contact Method = "WhatsApp", OR
- Preferred Contact Method = "Both"

If user selects "Email", WhatsApp field is optional.

### Country & Timezone Auto-Detection

**On Page Load:**
1. Detect browser's timezone using `Intl.DateTimeFormat()`
2. Match timezone to country in database
3. Auto-populate:
   - Country dropdown
   - WhatsApp dial code
   - Timezone dropdown

**Manual Country Selection:**
1. User selects country from dropdown
2. Auto-updates:
   - WhatsApp dial code (e.g., +880 for Bangladesh)
   - Available timezones for that country
   - First timezone in list is auto-selected

### Ticket ID Generation

Generated client-side using `crypto.getRandomValues()`:
- 8 characters (hex)
- Uppercase (e.g., `7D4A9C2E`)
- Displayed to user after successful submission
- Sent to Google Forms for tracking

### Validation Popup

If validation fails on submit:
1. Popup dialog appears listing all missing/invalid fields
2. Fields are highlighted in red
3. Auto-scroll to first error field
4. Focus placed on first error for keyboard users

**Example popup text:**
> **Required Fields Missing**
> 
> Please fill in the following required fields before submitting:
> 
> • Full Name
> • Time Zone
> • GDPR Consent

## Google Forms Integration (RETIRED 2026-08-24)

The Google Forms + Sheets backend was retired by the P1 Supabase-only cutover
(see [Phase 1: Supabase Leads Sink](#phase-1-supabase-leads-sink) below).
`/api/contact` stores every lead in Supabase Postgres only; no `LEADS_SINK`
flag exists and no Google endpoint is called. The client sends raw-named
fields only — the old `entry.*` mirrors were removed with the cutover.

This section is kept as a historical record of the pre-P1 setup (19-field
form, `entry.*` IDs, linked Sheet, Apps Script notifications). Do not
reintroduce it: the client-generated ticket ID it relied on was spoofable
(known S6 issue, now closed by server-issued ticket refs).

## Extending the Form

### Adding a New Field

1. **Add state to FormData type:**
   ```typescript
   interface FormData {
     // ... existing fields
     newField: string;
   }
   ```

2. **Add default value:**
   ```typescript
   const [formData, setFormData] = useState<FormData>({
     // ... existing defaults
     newField: "",
   });
   ```

3. **Add validation (if required):**
   ```typescript
   const validateForm = () => {
     // ... existing validation
     if (!formData.newField.trim()) {
       newErrors.newField = true;
       errorMessages.push("• New Field");
     }
   };
   ```

4. **Add form input in JSX:**
   ```tsx
   <div ref={newFieldRef}>
     <Label htmlFor="newField">New Field *</Label>
     <Input
       id="newField"
       value={formData.newField}
       onChange={(e) => handleInputChange("newField", e.target.value)}
       className={errors.newField ? "border-red-500" : ""}
     />
   </div>
   ```

5. **Add to Google Forms mapping:**
   - Add field to Google Form
   - Get entry ID
   - Update submission data:
     ```typescript
     formDataToSend.append('entry.NEWID', formData.newField);
     ```

### Changing Field Labels

Edit the JSX in `/components/enhanced-contact-form.tsx`:
```tsx
<Label htmlFor="fieldName">
  New Label Text *
</Label>
```

### Modifying Validation

Edit `validateForm()` function:
```typescript
// Example: Change email validation
if (!formData.email.includes('@')) {
  newErrors.email = true;
  errorMessages.push("• Valid Email");
}

// Example: Change min length
if (formData.projectSummary.length < 50) {
  newErrors.projectSummary = true;
  errorMessages.push("• Project Summary (min 50 characters)");
}
```

### Customizing Success Message

Edit the success state JSX:
```tsx
{isSubmitted && (
  <div className="text-center space-y-4">
    <h3>Custom Success Message</h3>
    <p>Your ticket ID: {submittedTicketId}</p>
  </div>
)}
```

## Country & Timezone Data

**Data Source:** `/lib/countries-data.ts`

Contains:
- 195+ countries with names, codes, flags, phone codes
- Full timezone database (linked to countries)
- Helper functions: `getCountryByCode()`, `getTimezonesByCountry()`

**To update:**
1. Edit `/lib/countries-data.ts`
2. Add/modify country objects:
   ```typescript
   {
     name: "Country Name",
     code: "CC",
     phoneCode: "+00",
     flag: "🇦🇧",
     timezones: ["Continent/City"]
   }
   ```

## Troubleshooting

**Form submission doesn't work:**
- Check Supabase credentials (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`) and `LEAD_IP_HASH_SALT` are set
- Check Turnstile keys are valid and the token isn't being reused
- Open browser console for errors

**Validation not working:**
- Check all required fields have validation in `validateForm()`
- Ensure field refs are created: `const fieldRef = useRef(null)`
- Verify `errors` state is being updated

**Timezone not auto-selecting:**
- Check browser supports `Intl.DateTimeFormat()`
- Verify country has timezones in `/lib/countries-data.ts`
- Check console for timezone detection logs

**WhatsApp dial code not auto-filling:**
- Ensure country has `phoneCode` in data
- Check `handleCountryChange()` is updating `whatsAppCountryCode`
- Verify Select component is using correct value prop

## Phase 1: Supabase Leads Sink

The `/api/contact` route stores every lead in **Supabase Postgres only** — the Google Forms sink has been retired (2026-08-24). No `LEADS_SINK` flag exists anymore; missing Supabase credentials return a 500 config error rather than falling back.

### Storage Flow

1. Same-origin check → Turnstile siteverify → memory + DB rate limits → replay guard
2. `parseLeadPayload()` normalizes/validates the raw-named fields mirrored by the client
3. `insertLead()` writes via the service-role admin client and returns the server ticket ref
4. The API responds with `{ success, message, ticketRef }`

- RLS is enabled on both tables with **zero policies** — anon/authenticated clients are denied; only the service role reads/writes
- The `rate_limits` RPC is locked to `service_role` (revoked from `public`/`anon`/`authenticated`)

### `leads` Table Schema

Defined in `supabase/migrations/0001_leads_and_rate_limits.sql`. **Pushed to the remote project on 2026-08-24.**

Key columns:

- **`ticket_number`** - int from a sequence (starts at 1000); rendered to users as `TKT-<n>`
- **`name`**, **`email`**, **`country`** - identity fields
- **`whatsapp_e164`** - WhatsApp number normalized to E.164
- **`timezone`** - IANA timezone string
- **`services`** - jsonb array of selected service types
- **`budget_min`** / **`budget_max`** - budget range ints
- **`urgency`**, **`project_summary`** - enquiry details
- **`source_page`**, **`device_type`**, **`user_agent`** - technical/auto fields
- **`ip_hash`** - **salted SHA-256 of the client IP; raw IPs are never stored**
- **`consent_at`** - timestamptz recording when consent was given (not null)
- **`attachments`** - jsonb array of attachment metadata (`key`, `filename`, `mime`, `size_bytes`, optional admin-set `retained`); the files themselves live in private R2 object storage — see [`docs/r2/README.md`](../r2/README.md)
- **`status`** - enum `lead_status`: `new` / `contacted` / `won` / `lost`
- **`email_verified_at`**, **`marketing_opt_in`** - reserved for future phases

Plus optional fields (company, project_url, nda_required, how_found, preferred_contact_date, best_time_to_contact) and `created_at`/`updated_at`.

### Server Ticket Refs Replace Client IDs

With the Supabase sink active, the ticket shown to the user is **generated server-side** (`TKT-<ticket_number>`) and returned in the API response only after the row insert succeeds. The success card now displays this server-issued ref.

This replaces the previous client-generated 8-character hex ID, which was spoofable — anyone POSTing directly to the legacy Google Forms sink could inject arbitrary ticket IDs (known S6 issue, now closed). The client still mirrors raw field names alongside Google entry IDs; the Supabase parser reads only the raw names.

### Rate Limiting & Replay Guard

Two layers, keyed only by one-way hashes (no plaintext identifiers persisted):

1. **Memory pre-layer** - per-instance sliding window (5 requests/hour/IP) rejects floods before any DB call
2. **DB layer** - atomic `consume_rate_limit(kind, key_hash, window_seconds, max_count)` RPC over the `rate_limits` table (kind + key_hash + window counters):
   - `kind='ip'` - key is the salted SHA-256 IP hash (active when `LEAD_IP_HASH_SALT` is set)
   - `kind='turnstile'` - key is the hashed Turnstile token with a 1-per-5-minute window → **single-use replay guard**

If Supabase is unconfigured, only the memory pre-layer applies. Expired windows reset automatically; rows older than 7 days are pruned by the RPC.

---

## Phase 2: R2 File Attachments

The form accepts optional file attachments, uploaded directly from the browser to a **private** Cloudflare R2 bucket via short-lived presigned PUT URLs (the server never proxies file bytes).

### Rules at a glance

- Up to **5 files** per submission
- **10 MB maximum per file**
- Allowed types: `.pdf`, `.docx`, `.doc`, `.xlsx`, `.png`, `.jpg`, `.zip`
- Attachments are optional — the no-file submission flow is unchanged

### Flow

1. Client pre-validates count/type/size, then requests presigned URLs from `/api/uploads/presign` (Turnstile-gated, same-origin checked, 20 req/hour/IP fail-closed)
2. Browser PUTs each file straight to R2 (`contact/<folder-uuid>/<file-uuid>.<ext>` in the private bucket)
3. On submit, `/api/contact` re-validates every attachment entry and stores the metadata array in `leads.attachments`
4. A fresh Turnstile token is executed for the submit call itself — see [`docs/r2/README.md`](../r2/README.md) for the full flow

### Storage & retention

- Files are stored in **private object storage** — never publicly reachable; access requires server-side credentials or a presigned URL
- Uploaded files are **automatically deleted after 90 days** unless an admin flags an attachment `retained: true` via SQL on its lead record (submitters cannot set this flag)
- The metadata (filename, mime type, size) persists with the lead record even after the file is deleted
- Daily purge: `GET /api/cron/r2-retention` via Vercel Cron (03:00 UTC), bearer-authenticated with `CRON_SECRET`

Operations (retention flagging SQL, manual deletion, CORS prerequisite, cron setup): see [`docs/r2/README.md`](../r2/README.md).

---

**Last Updated:** August 2026  
**Maintainer:** Md Redwan Ahmed
