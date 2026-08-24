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

## Google Forms Integration

### How It Works

1. User fills out form and clicks "Send Message"
2. Client-side validation runs
3. If valid, data is formatted and POST to Google Forms
4. Uses `no-cors` mode (response not readable, but submission works)
5. Success assumed if no error thrown
6. Success message shown with Ticket ID

### Field Mapping

Each form field maps to a Google Forms entry ID (e.g., `entry.123456789`).

**Setup Steps:**

1. Create a Google Form with 19 fields matching the form
2. Get the form action URL:
   - Open form in edit mode
   - Replace `/viewform` with `/formResponse` in URL
3. Inspect form to find entry IDs:
   - Right-click field → Inspect
   - Look for `entry.XXXXXXXXX` in HTML
4. Update mappings in `/components/enhanced-contact-form.tsx`
5. Set environment variable:
   ```env
   NEXT_PUBLIC_GOOGLE_FORM_ACTION_URL=https://docs.google.com/forms/d/e/FORM_ID/formResponse
   ```

### Google Sheets Integration

Google Forms automatically saves to linked Google Sheets with columns:
1. Timestamp (auto)
2. Ticket ID
3. Full Name
4. Email
5. Country
6. WhatsApp Number
7. Preferred Contact Method
8. Time Zone
9. Preferred Contact Date
10. Best Time to Contact
11. Service Type
12. Company
13. Budget Range
14. Project Summary
15. How Did You Find Me
16. Urgency
17. NDA Required
18. GDPR Consent
19. Source Page
20. User Agent
21. Device Type
22. Priority
23. Status

**Optional:** Use Google Apps Script to:
- Send email notifications on new submission
- Auto-assign priority/status
- Trigger webhooks to CRM

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
- Check `NEXT_PUBLIC_GOOGLE_FORM_ACTION_URL` is set
- Verify Google Form is set to "Anyone can respond"
- Check entry IDs match between form and Google Form
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

**Last Updated:** August 2026  
**Maintainer:** Md Redwan Ahmed
