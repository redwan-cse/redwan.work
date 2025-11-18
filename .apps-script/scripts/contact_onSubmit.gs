/**
 * Contact Form Submit Handler
 * 
 * This file handles the onFormSubmit trigger for new contact form submissions.
 * It sends HTML emails to clients and internal notifications.
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
    
    // Check VIP status
    const vipInfo = isVip_(submission.email);
    
    // Build tags
    const tags = buildTags_(submission, vipInfo);
    
    // Write Status (column W - managed by Apps Script)
    const statusColIndex = findOrCreateHelperColumn_(sheet, COLS.STATUS);
    sheet.getRange(row, statusColIndex).setValue('New');
    
    // Write tags and VIP status back to sheet
    const tagsColIdx = getColumnIndex_(headerIndex, COLS.TAGS);
    if (tagsColIdx !== -1) {
      sheet.getRange(row, tagsColIdx + 1).setValue(tags);
    }
    
    // Write VIP status and notes
    if (vipInfo.isVip) {
      // Write Is VIP column
      const vipColIdx = findOrCreateHelperColumn_(sheet, COLS.IS_VIP);
      sheet.getRange(row, vipColIdx).setValue('Yes');
      
      // Write VIP reason to VIP Notes column
      appendToLog_(sheet, row, COLS.VIP_NOTES, vipInfo.reason);
    } else {
      const vipColIdx = findOrCreateHelperColumn_(sheet, COLS.IS_VIP);
      sheet.getRange(row, vipColIdx).setValue('No');
    }
    
    // Context flags for emails
    const isHighPriority = submission.priority.toLowerCase() === 'high' || 
                           submission.urgency.toLowerCase().includes('immediate');
    const isReferral = submission.howFound.toLowerCase().includes('referr');
    
    // Send emails and log them
    Logger.log('Sending client autoresponder email...');
    try {
      sendClientNewTicketEmail_(submission, vipInfo, isHighPriority, isReferral);
      appendToLog_(sheet, row, COLS.CLIENT_EMAIL_LOG, 'New ticket confirmation sent to ' + submission.email);
    } catch (emailError) {
      Logger.log('Error sending client email: ' + emailError.toString());
      appendToLog_(sheet, row, COLS.CLIENT_EMAIL_LOG, 'ERROR: Failed to send email - ' + emailError.toString());
    }
    
    Logger.log('Sending internal notification email...');
    try {
      sendInternalNewTicketEmail_(submission, vipInfo, tags, isHighPriority);
      appendToLog_(sheet, row, COLS.INTERNAL_EMAIL_LOG, 'Internal notification sent to ' + CONFIG.internalEmail);
    } catch (emailError) {
      Logger.log('Error sending internal email: ' + emailError.toString());
      appendToLog_(sheet, row, COLS.INTERNAL_EMAIL_LOG, 'ERROR: Failed to send email - ' + emailError.toString());
    }
    
    // Setup Status column with data validation (ensures dropdown is configured)
    setupStatusColumn_(sheet);
    
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
    // Render HTML template
    const htmlBody = renderTemplate_('Internal_NewTicket', {
      sub: submission,
      vip: vipInfo,
      tags: tags,
      isHighPriority: isHighPriority,
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
