/**
 * Contact Form Submit Handler
 * 
 * ============================================================================
 * WHAT THIS SCRIPT DOES:
 * ============================================================================
 * 
 * 1. Triggers on Google Form submission
 * 2. Writes Status = "New" to column X (with dropdown validation)
 * 3. Detects VIP clients from VIP List sheet (by email or domain)
 * 4. Generates automatic tags based on submission data
 * 5. Sends confirmation email to client
 * 6. Sends notification email to internal team
 * 7. Logs all email activity with timestamps (GMT+6)
 * 
 * ============================================================================
 * File Location: /.apps-script/scripts/contact_onSubmit.gs
 * ============================================================================
 * 
 * SETUP: Install this as an onFormSubmit trigger in Apps Script
 */

/**
 * Main handler for form submissions
 * 
 * @param {Object} e - The event object from the trigger
 */
function onFormSubmit(e) {
  try {
    // Guard clause: only process the configured sheet
    const sheet = e.range.getSheet();
    if (sheet.getName() !== CONFIG.sheetName) {
      Logger.log('Ignoring submission from sheet: ' + sheet.getName());
      return;
    }
    
    Logger.log('Processing new form submission...');
    
    // Build header index
    const headerIndex = buildHeaderIndex_(sheet);
    
    // Get the submitted row values
    const row = e.range.getRow();
    const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Helper function to get value by header name
    const get = (headerName) => {
      const idx = getColumnIndex_(headerIndex, headerName);
      if (idx === -1) return '';
      const value = values[idx];
      return value ? value.toString().trim() : '';
    };
    
    // Build submission object
    const submission = {
      rowIndex: row,
      timestamp: get(COLS.TIMESTAMP),
      name: get(COLS.NAME),
      email: get(COLS.EMAIL),
      country: get(COLS.COUNTRY),
      whatsapp: get(COLS.WHATSAPP),
      preferredContactMethod: get(COLS.PREFERRED_CONTACT_METHOD),
      timeZone: get(COLS.TIME_ZONE),
      preferredContactDate: get(COLS.PREFERRED_CONTACT_DATE),
      bestTime: get(COLS.BEST_TIME),
      serviceTypeRaw: get(COLS.SERVICE_TYPE),
      company: get(COLS.COMPANY),
      projectUrl: get(COLS.PROJECT_URL),
      projectSummary: get(COLS.PROJECT_SUMMARY),
      ndaText: get(COLS.NDA),
      urgency: get(COLS.URGENCY),
      budgetRange: get(COLS.BUDGET_RANGE),
      howFound: get(COLS.HOW_FOUND),
      ticketId: get(COLS.TICKET_ID),  // Use existing ticket ID from form
      sourcePage: get(COLS.SOURCE_PAGE),
      userAgent: get(COLS.USER_AGENT),
      deviceType: get(COLS.DEVICE_TYPE),
      priority: get(COLS.PRIORITY),  // Read from form (internal use only)
      status: 'New'  // Default status (managed by Apps Script, not form)
    };
    
    // Derive NDA required flag
    submission.ndaRequired = submission.ndaText.toLowerCase().includes('nda') || 
                             submission.ndaText.toLowerCase().includes('confidential');
    
    //==========================================================================
    // VIP DETECTION
    //==========================================================================
    // Check if email is VIP based on VIP List sheet (separate sheet in workbook)
    // VIP List sheet columns: Email | Domain | Notes
    // - Exact email match: Returns isVip=true with reason
    // - Domain match (e.g., @company.com): Returns isVip=true with reason
    // - No match: Returns isVip=false
    const vipInfo = isVip_(submission.email);
    
    //==========================================================================
    // TAG GENERATION
    //==========================================================================
    // Auto-generate tags based on submission data (service type, urgency, VIP, etc.)
    const tags = buildTags_(submission, vipInfo);
    
    //==========================================================================
    // WRITE STATUS TO COLUMN X (24)
    //==========================================================================
    // Status is ALWAYS in column X, never in W (W is blank spacer)
    // Sets Status = "New" for new submissions
    // Also ensures dropdown validation is configured
    setupStatusColumn_(sheet);  // Ensure column X has Status header + dropdown
    sheet.getRange(row, 24).setValue('New');  // Column X = 24
    Logger.log('Set Status = "New" in column X');
    
    //==========================================================================
    // WRITE TAGS (Column AC / 29 or next available)
    //==========================================================================
    const tagsColIdx = findOrCreateManagedColumn_(sheet, COLS.TAGS);
    sheet.getRange(row, tagsColIdx).setValue(tags);
    Logger.log('Tags written: ' + tags);
    
    //==========================================================================
    // WRITE VIP STATUS AND NOTES
    //==========================================================================
    const vipColIdx = findOrCreateManagedColumn_(sheet, COLS.IS_VIP);
    
    if (vipInfo.isVip) {
      // Write "Yes" to Is VIP column (Y / 25)
      sheet.getRange(row, vipColIdx).setValue('Yes');
      
      // Write VIP detection reason to VIP Notes column (AB / 28)
      appendToLog_(sheet, row, COLS.VIP_NOTES, vipInfo.reason);
      
      Logger.log('VIP detected: ' + vipInfo.reason);
    } else {
      // Write "No" to Is VIP column
      sheet.getRange(row, vipColIdx).setValue('No');
      Logger.log('Not a VIP client');
    }
    
    //==========================================================================
    // EMAIL SENDING + LOGGING
    //==========================================================================
    // Context flags for email templates
    const isHighPriority = submission.priority.toLowerCase() === 'high' || 
                           submission.urgency.toLowerCase().includes('immediate');
    const isReferral = submission.howFound.toLowerCase().includes('referr');
    
    // Send client confirmation email
    Logger.log('Sending client autoresponder email...');
    try {
      sendClientNewTicketEmail_(submission, vipInfo, isHighPriority, isReferral);
      appendToLog_(sheet, row, COLS.CLIENT_EMAIL_LOG, 'New ticket confirmation sent to ' + submission.email);
    } catch (emailError) {
      Logger.log('Error sending client email: ' + emailError.toString());
      appendToLog_(sheet, row, COLS.CLIENT_EMAIL_LOG, 'ERROR: Failed to send email - ' + emailError.toString());
    }
    
    // Send internal notification email
    Logger.log('Sending internal notification email...');
    try {
      sendInternalNewTicketEmail_(submission, vipInfo, tags, isHighPriority);
      appendToLog_(sheet, row, COLS.INTERNAL_EMAIL_LOG, 'Internal notification sent to ' + CONFIG.internalEmail);
    } catch (emailError) {
      Logger.log('Error sending internal email: ' + emailError.toString());
      appendToLog_(sheet, row, COLS.INTERNAL_EMAIL_LOG, 'ERROR: Failed to send email - ' + emailError.toString());
    }
    
    Logger.log('Form submission processed successfully for Ticket: ' + submission.ticketId);
    
  } catch (error) {
    Logger.log('ERROR in onFormSubmit: ' + error.toString());
    Logger.log(error.stack);
    
    // Don't throw - we don't want to break future submissions
    // Just log the error for manual review
  }
}

/**
 * Send new ticket confirmation email to client
 * 
 * @param {Object} submission - The submission data object
 * @param {Object} vipInfo - VIP information
 * @param {boolean} isHighPriority - Whether this is high priority
 * @param {boolean} isReferral - Whether this came from a referral
 */
function sendClientNewTicketEmail_(submission, vipInfo, isHighPriority, isReferral) {
  try {
    // Render HTML template
    const htmlBody = renderTemplate_('Client_NewTicket', {
      sub: submission,
      vip: vipInfo,
      isHighPriority: isHighPriority,
      isReferral: isReferral,
      config: CONFIG
    });
    
    // Build subject with badges
    const badges = [];
    if (vipInfo.isVip) badges.push('VIP');
    if (isHighPriority) badges.push('High Priority');
    
    const subject = buildSubject_(badges, 'We received your request', submission.ticketId);
    
    // Plain text fallback
    const plainText = 'Hi ' + submission.name + ',\n\n' +
                      'Thank you for contacting Fast Cyber Defense. We have received your request.\n\n' +
                      'Your Ticket ID: ' + submission.ticketId + '\n\n' +
                      'We will review your request and get back to you soon.\n\n' +
                      'Best regards,\n' + CONFIG.signature;
    
    // Send email
    sendHtmlEmail_(submission.email, subject, htmlBody, plainText);
    
  } catch (error) {
    Logger.log('Error sending client email: ' + error.toString());
    throw error;
  }
}

/**
 * Send internal notification email
 * 
 * @param {Object} submission - The submission data object
 * @param {Object} vipInfo - VIP information
 * @param {string} tags - Comma-separated tags
 * @param {boolean} isHighPriority - Whether this is high priority
 */
function sendInternalNewTicketEmail_(submission, vipInfo, tags, isHighPriority) {
  try {
    // Build preferred time info (client time vs my time)
    const timeInfo = buildPreferredTimeInfo_(submission);
    
    // Get spreadsheet URL
    const ss = SpreadsheetApp.getActive();
    const sheetUrl = ss.getUrl();
    
    // Render HTML template
    const htmlBody = renderTemplate_('Internal_NewTicket', {
      sub: submission,
      vip: vipInfo,
      tags: tags,
      isHighPriority: isHighPriority,
      clientTimeDisplay: timeInfo.clientTimeDisplay,
      myTimeDisplay: timeInfo.myTimeDisplay,
      sheetUrl: sheetUrl,
      config: CONFIG
    });
    
    // Build subject with badges
    const badges = [];
    if (vipInfo.isVip) badges.push('VIP');
    if (isHighPriority) badges.push('High');
    if (submission.ndaRequired) badges.push('NDA');
    badges.push('New');
    
    // Get first service type for subject
    const serviceShort = submission.serviceTypeRaw.split(',')[0].trim();
    
    const subject = buildSubject_(badges, serviceShort, '- ' + submission.ticketId);
    
    // Plain text fallback
    const plainText = 'New Ticket: ' + submission.ticketId + '\n\n' +
                      'From: ' + submission.name + ' (' + submission.email + ')\n' +
                      'Service: ' + submission.serviceTypeRaw + '\n' +
                      'Priority: ' + submission.priority + '\n' +
                      'Urgency: ' + submission.urgency + '\n\n' +
                      'Summary: ' + submission.projectSummary;
    
    // Send email
    sendHtmlEmail_(CONFIG.internalEmail, subject, htmlBody, plainText);
    
  } catch (error) {
    Logger.log('Error sending internal email: ' + error.toString());
    throw error;
  }
}

/**
 * Build preferred contact time information for internal email
 * 
 * Converts client's preferred contact time to my local time (Asia/Dhaka)
 * 
 * @param {Object} submission - The submission data object
 * @returns {Object} { clientTimeDisplay: string, myTimeDisplay: string }
 */
function buildPreferredTimeInfo_(submission) {
  try {
    // Check if we have required fields
    const hasDate = submission.preferredContactDate && submission.preferredContactDate.trim() !== '';
    const hasBestTime = submission.bestTime && submission.bestTime.trim() !== '';
    const hasTimeZone = submission.timeZone && submission.timeZone.trim() !== '';
    
    // If flexible or missing data, return flexible status
    if (!hasDate || !hasBestTime || !hasTimeZone || 
        submission.bestTime.toLowerCase() === 'flexible') {
      return {
        clientTimeDisplay: 'Flexible',
        myTimeDisplay: ''
      };
    }
    
    // Map Best Time to approximate hour in 24-hour format
    const timeOfDayMap = {
      'morning': 10,
      'afternoon': 15,
      'evening': 20
    };
    
    const bestTimeLower = submission.bestTime.toLowerCase();
    let hour = timeOfDayMap[bestTimeLower];
    
    if (!hour) {
      // Unknown time, treat as flexible
      return {
        clientTimeDisplay: 'Flexible',
        myTimeDisplay: ''
      };
    }
    
    // Parse the preferred contact date
    let contactDate;
    if (submission.preferredContactDate instanceof Date) {
      contactDate = submission.preferredContactDate;
    } else {
      // Try parsing the date string
      contactDate = new Date(submission.preferredContactDate);
    }
    
    // Check if date is valid
    if (isNaN(contactDate.getTime())) {
      return {
        clientTimeDisplay: submission.bestTime,
        myTimeDisplay: ''
      };
    }
    
    // Set the hour in the date
    contactDate.setHours(hour, 0, 0, 0);
    
    // Format client's time in their timezone
    const clientTimeStr = Utilities.formatDate(
      contactDate, 
      submission.timeZone, 
      "dd MMM yyyy, hh:mm a"
    );
    
    const clientTimeDisplay = clientTimeStr + ' (' + submission.timeZone + ')';
    
    // Convert to my timezone (Asia/Dhaka)
    const myTimeStr = Utilities.formatDate(
      contactDate,
      CONFIG.myTimeZone,
      "dd MMM yyyy, hh:mm a"
    );
    
    const myTimeDisplay = myTimeStr + ' (' + CONFIG.myTimeZone + ', GMT+6)';
    
    return {
      clientTimeDisplay: clientTimeDisplay,
      myTimeDisplay: myTimeDisplay
    };
    
  } catch (error) {
    Logger.log('Error building time info: ' + error.toString());
    // Return safe defaults on error
    return {
      clientTimeDisplay: '',
      myTimeDisplay: ''
    };
  }
}
