# Google Apps Script Deployment Guide

## 📦 Complete File List

Upload these files to your Apps Script project in this exact order:

### Code Files (.gs) - 6 files
1. `config.gs` - Configuration settings
2. `columns.gs` - Column mapping
3. `email_utils.gs` - Email utilities
4. `vip_tags.gs` - VIP and tagging
5. `contact_onSubmit.gs` - Form submission handler
6. `contact_onEdit.gs` - Edit handler

### HTML Templates (.html) - 4 files
1. `Client_NewTicket.html`
2. `Internal_NewTicket.html`
3. `Client_StatusUpdate.html`
4. `Client_Resolved.html`

## 🚀 Deployment Steps

### Step 1: Access Apps Script Editor

1. Open your Google Sheet (Form Responses)
2. Click **Extensions** in the menu
3. Click **Apps Script**
4. You'll see the Apps Script editor with default `Code.gs`

### Step 2: Clean Default Project

1. In the editor, you'll see `Code.gs` in the left sidebar
2. Click the three dots (⋮) next to `Code.gs`
3. Click **Remove**
4. Confirm deletion

### Step 3: Add Configuration File First

1. Click the **+** icon next to "Files"
2. Select **Script** (.gs)
3. Name it: `config`
4. Copy the entire contents of `config.gs` from this folder
5. Paste into the editor
6. **IMPORTANT:** Update line 10:
   ```javascript
   internalEmail: 'your-email@example.com'  // Replace with YOUR email
   ```
7. Click **Save** (💾 icon) or Ctrl+S

### Step 4: Add Remaining Code Files

Repeat for each .gs file:

**Add columns.gs:**
1. Click **+** > **Script**
2. Name: `columns`
3. Copy entire contents from `columns.gs`
4. Paste and save

**Add email_utils.gs:**
1. Click **+** > **Script**
2. Name: `email_utils`
3. Copy entire contents from `email_utils.gs`
4. Paste and save

**Add vip_tags.gs:**
1. Click **+** > **Script**
2. Name: `vip_tags`
3. Copy entire contents from `vip_tags.gs`
4. Paste and save

**Add contact_onSubmit.gs:**
1. Click **+** > **Script**
2. Name: `contact_onSubmit`
3. Copy entire contents from `contact_onSubmit.gs`
4. Paste and save

**Add contact_onEdit.gs:**
1. Click **+** > **Script**
2. Name: `contact_onEdit`
3. Copy entire contents from `contact_onEdit.gs`
4. Paste and save

### Step 5: Add HTML Template Files

Repeat for each .html file:

**Add Client_NewTicket.html:**
1. Click **+** > **HTML**
2. Name: `Client_NewTicket`
3. Copy entire contents from `Client_NewTicket.html`
4. Paste and save

**Add Internal_NewTicket.html:**
1. Click **+** > **HTML**
2. Name: `Internal_NewTicket`
3. Copy entire contents from `Internal_NewTicket.html`
4. Paste and save

**Add Client_StatusUpdate.html:**
1. Click **+** > **HTML**
2. Name: `Client_StatusUpdate`
3. Copy entire contents from `Client_StatusUpdate.html`
4. Paste and save

**Add Client_Resolved.html:**
1. Click **+** > **HTML**
2. Name: `Client_Resolved`
3. Copy entire contents from `Client_Resolved.html`
4. Paste and save

### Step 6: Verify Project Structure

Your Apps Script editor should now show:

```
📁 Files
├── 📄 config.gs
├── 📄 columns.gs
├── 📄 email_utils.gs
├── 📄 vip_tags.gs
├── 📄 contact_onSubmit.gs
├── 📄 contact_onEdit.gs
├── 📄 Client_NewTicket.html
├── 📄 Internal_NewTicket.html
├── 📄 Client_StatusUpdate.html
└── 📄 Client_Resolved.html
```

### Step 7: Save Project with Name

1. Click "Untitled project" at the top
2. Rename to: `Contact Form Email Automation`
3. Press Enter to save

### Step 8: Install Triggers

**Install Form Submit Trigger:**
1. Click the **clock icon** (⏰) in the left sidebar (Triggers)
2. Click **+ Add Trigger** (bottom right)
3. Configure:
   - Choose which function to run: `onFormSubmit`
   - Choose which deployment should run: `Head`
   - Select event source: `From spreadsheet`
   - Select event type: `On form submit`
4. Click **Save**

**Install Edit Trigger:**
1. Click **+ Add Trigger** again
2. Configure:
   - Choose which function to run: `onEdit`
   - Choose which deployment should run: `Head`
   - Select event source: `From spreadsheet`
   - Select event type: `On edit`
3. Click **Save**

### Step 9: Grant Permissions (First Run)

1. In the Apps Script editor, select `onFormSubmit` from the function dropdown
2. Click **Run** (▶️ icon)
3. A dialog will appear: "Authorization required"
4. Click **Review permissions**
5. Choose your Google account
6. You'll see a warning: "Google hasn't verified this app"
7. Click **Advanced**
8. Click **Go to Contact Form Email Automation (unsafe)**
9. Review the permissions:
   - Send email as you
   - View and manage spreadsheets
10. Click **Allow**
11. Wait for execution to complete
12. Check **Execution log** at the bottom - should show "Execution completed"

### Step 10: Test the System

**Test 1 - Manual Trigger Test:**
1. In your Google Sheet, find a row with form data
2. Select the entire row
3. In Apps Script, run `onFormSubmit` manually
4. Check your email (both client email and internal email)

**Test 2 - Real Form Submission:**
1. Fill out and submit your Google Form
2. Wait 30 seconds
3. Check the client's email inbox
4. Check your internal notification email
5. Verify the sheet now has Tags and Is VIP columns populated

**Test 3 - Status Change:**
1. In the sheet, find the "Status" column
2. Change a status to "In Progress"
3. Wait 10 seconds
4. Check client email for status update

## 🔍 Verification Steps

### Check Triggers Are Active

1. Click the **clock icon** (Triggers) in sidebar
2. You should see 2 active triggers:
   ```
   Function         Event Type        Status
   onFormSubmit     On form submit    ✓ Active
   onEdit           On edit           ✓ Active
   ```

### Check Execution History

1. Click **Executions** in the left sidebar
2. You should see recent executions
3. Status should be "Completed" (green checkmark)
4. If you see errors (red X), click to view details

### View Execution Logs

1. After running a function, scroll down to see logs
2. Or click **Executions** > Select an execution > View logs
3. Look for:
   ```
   Processing new form submission...
   Sending client autoresponder email...
   Email sent successfully to: [email]
   Sending internal notification email...
   Email sent successfully to: [email]
   Form submission processed successfully for Ticket: #XXXXXXXX
   ```

## 🐛 Troubleshooting Deployment

### Error: "CONFIG is not defined"

**Cause:** config.gs file not loaded or saved

**Solution:**
1. Verify config.gs exists in Files list
2. Open config.gs and click Save
3. Try running function again

### Error: "HtmlService.createTemplateFromFile not found"

**Cause:** HTML template file missing or wrong name

**Solution:**
1. Check all 4 .html files are present
2. Verify file names match exactly (case-sensitive)
3. No spaces or extra characters in names

### Error: "Permission denied to send email"

**Cause:** Gmail permissions not granted

**Solution:**
1. Go to **Executions**
2. Find the failed execution
3. Click to view error
4. Re-run the authorization process (Step 9)

### Error: "Cannot read property 'getSheet' of undefined"

**Cause:** Event object missing (normal for manual runs)

**Solution:**
1. This is expected when running manually
2. Test with actual form submission
3. Or test with actual sheet edit

### Trigger Not Firing

**Cause:** Trigger not installed or disabled

**Solution:**
1. Check **Triggers** page
2. Verify triggers show "Active" status
3. If missing, re-add triggers (Step 8)
4. Check trigger filters match sheet name

## 📧 Email Testing

### Test with Gmail Alias

To test without spamming real clients:
1. Use your.email+test@gmail.com format
2. Gmail treats these as aliases (same inbox)
3. You can see both client and internal emails

### Check Spam Folder

If emails not arriving:
1. Check client's spam/junk folder
2. Mark as "Not spam" if found
3. Add sender to contacts

### Verify Sender Name

Emails should show:
- **From:** Your Gmail address
- **Display Name:** Md. Redwan Ahmed

## 🎯 Post-Deployment Tasks

- [ ] Update Internal_NewTicket.html "Open Sheet" button URL
- [ ] Add real VIP entries to VIP List sheet
- [ ] Test all email types at least once
- [ ] Set up email notifications for script failures
- [ ] Document any custom modifications
- [ ] Schedule monthly review of execution logs

## 📱 Optional: Mobile App Access

1. Install **Google Sheets** app on mobile
2. Install **Gmail** app to check notifications
3. You can monitor and edit from phone

## 🔒 Security Checklist

- [ ] Never share Apps Script project link publicly
- [ ] Don't commit config.gs with real email to public repos
- [ ] Regularly review Executions for suspicious activity
- [ ] Use strong password for Google account
- [ ] Enable 2FA on Google account

## 📊 Success Metrics

After deployment, you should see:
- ✅ Triggers: 2 active
- ✅ Executions: Completing successfully
- ✅ Emails: Sending within 60 seconds
- ✅ Tags: Auto-populating in sheet
- ✅ No errors in execution log

## 🆘 Getting Help

If you encounter issues:

1. **Check Execution Log:**
   - Apps Script > Executions
   - Click on failed execution
   - Read error message

2. **Common Fixes:**
   - Re-save all files
   - Re-grant permissions
   - Check CONFIG.internalEmail is set
   - Verify sheet column headers match

3. **Debug Mode:**
   - Add `Logger.log("Debug: variableName", variableName);`
   - Run function
   - Check Execution log for output

4. **Reset:**
   - Remove all triggers
   - Re-grant permissions
   - Re-add triggers

---

**Deployment Complete!** 🎉

Your contact form automation is now live and ready to handle submissions.

**Next Steps:**
- Monitor first few real submissions
- Fine-tune VIP list
- Customize email templates if needed
- Plan for Phase 2 features
