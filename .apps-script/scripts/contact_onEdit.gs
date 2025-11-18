/**
 * Contact Form Edit Handler
 * 
 * FILE: /.apps-script/scripts/contact_onEdit.gs
 * 
 * WHAT THIS SCRIPT DOES:
 * - Monitors manual edits to the Google Sheet
 * - Detects when Status column (column X / index 24) is changed
 * - Sends appropriate email to client based on new status:
 *   * "In Progress" → Status update email
 *   * "Resolved" or "Closed" → Ticket resolved email
 *   * Other statuses → No automatic email
 * - Logs activity to console (viewable in Apps Script Executions)
 * 
 * COLUMN ARCHITECTURE:
 * - Status is ALWAYS in column X (24)
 * - Column W (23) is blank spacer (never used)
 * - This script uses buildHeaderIndex_() to find Status dynamically
 * - Works even if column headers move (as long as header name matches)
 * 
 * TRIGGER SETUP:
 * - Function: onEdit
 * - Event source: From spreadsheet
 * - Event type: On edit
 * 
 * IMPORTANT:
 * - Only edits to Status column trigger emails
 * - Status = "Spam" does NOT send client email
 * - All email activity is logged to console
 */

/**
 * Main handler for cell edits
 * 
 * @param {Object} e - The event object from the trigger
 */
function onEdit(e) {
  try {
    // Guard clause: check if event object exists
    if (!e || !e.range) {
      return;
    }
    
    const sheet = e.range.getSheet();
    const row = e.range.getRow();
    const col = e.range.getColumn();
    
    // Guard clause: only process the configured sheet
    if (sheet.getName() !== CONFIG.sheetName) {
      return;
    }
    
    // Guard clause: ignore header row
    if (row === 1) {
      return;
    }
    
    // Build header index
    const headerIndex = buildHeaderIndex_(sheet);
    
    // Check if edited column is Status
    const statusColIdx = getColumnIndex_(headerIndex, COLS.STATUS);
    if (statusColIdx === -1 || col !== statusColIdx + 1) {
      return;  // Not editing the Status column
    }
    
    // Get old and new status values
    const oldStatus = e.oldValue || '';
    const newStatus = e.value || '';
    
    // Guard clause: status must have changed and new status must not be empty
    if (!newStatus || newStatus === oldStatus) {
      return;
    }
    
    Logger.log('Status changed from "' + oldStatus + '" to "' + newStatus + '" on row ' + row);
    
    // Read the full row to get submission data
    const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Helper function to get value by header name
    const get = (headerName) => {
      const idx = getColumnIndex_(headerIndex, headerName);
      if (idx === -1) return '';
      const value = values[idx];
      return value ? value.toString().trim() : '';
    };
    
    // Build lightweight submission object (only what we need for status emails)
    const submission = {
      rowIndex: row,
      name: get(COLS.NAME),
      email: get(COLS.EMAIL),
      ticketId: get(COLS.TICKET_ID),
      serviceTypeRaw: get(COLS.SERVICE_TYPE),
      priority: get(COLS.PRIORITY),
      urgency: get(COLS.URGENCY),
      status: newStatus,
      country: get(COLS.COUNTRY),
      timeZone: get(COLS.TIME_ZONE),
      projectSummary: get(COLS.PROJECT_SUMMARY)
    };
    
    // Guard clause: must have email and ticket ID
    if (!submission.email || !submission.ticketId) {
      Logger.log('Cannot send status email: missing email or ticket ID');
      return;
    }
    
    // Handle status-specific emails
    const newStatusLower = newStatus.toLowerCase();
    
    if (newStatusLower === 'in progress') {
      Logger.log('Sending "In Progress" email to client...');
      sendStatusUpdateEmail_(submission, oldStatus, newStatus);
    } else if (newStatusLower === 'closed' || newStatusLower === 'resolved') {
      Logger.log('Sending "Resolved" email to client...');
      sendResolvedEmail_(submission, oldStatus, newStatus);
    } else {
      Logger.log('Status "' + newStatus + '" - no automatic email configured');
    }
    
  } catch (error) {
    Logger.log('ERROR in onEdit: ' + error.toString());
    Logger.log(error.stack);
    
    // Don't throw - we don't want to break the edit operation
  }
}

/**
 * Send status update email to client (In Progress)
 * 
 * @param {Object} submission - The submission data object
 * @param {string} oldStatus - Previous status
 * @param {string} newStatus - New status
 */
function sendStatusUpdateEmail_(submission, oldStatus, newStatus) {
  try {
    // Render HTML template
    const htmlBody = renderTemplate_('Client_StatusUpdate', {
      sub: submission,
      oldStatus: oldStatus,
      newStatus: newStatus,
      config: CONFIG
    });
    
    // Build subject
    const subject = 'We\'re working on your request – ' + submission.ticketId;
    
    // Plain text fallback
    const plainText = 'Hi ' + submission.name + ',\n\n' +
                      'Good news! We\'ve started working on your request.\n\n' +
                      'Ticket ID: ' + submission.ticketId + '\n' +
                      'Status: ' + newStatus + '\n\n' +
                      'We\'ll keep you updated on the progress.\n\n' +
                      'Best regards,\n' + CONFIG.signature;
    
    // Send email
    sendHtmlEmail_(submission.email, subject, htmlBody, plainText);
    
    Logger.log('Status update email sent successfully');
    
  } catch (error) {
    Logger.log('Error sending status update email: ' + error.toString());
    throw error;
  }
}

/**
 * Send ticket resolved email to client
 * 
 * @param {Object} submission - The submission data object
 * @param {string} oldStatus - Previous status
 * @param {string} newStatus - New status
 */
function sendResolvedEmail_(submission, oldStatus, newStatus) {
  try {
    // Render HTML template
    const htmlBody = renderTemplate_('Client_Resolved', {
      sub: submission,
      oldStatus: oldStatus,
      newStatus: newStatus,
      config: CONFIG
    });
    
    // Build subject
    const subject = 'Your ticket ' + submission.ticketId + ' has been resolved';
    
    // Plain text fallback
    const plainText = 'Hi ' + submission.name + ',\n\n' +
                      'Your support ticket has been resolved.\n\n' +
                      'Ticket ID: ' + submission.ticketId + '\n' +
                      'Final Status: ' + newStatus + '\n\n' +
                      'If you need further assistance, please reply to this email.\n\n' +
                      'Best regards,\n' + CONFIG.signature;
    
    // Send email
    sendHtmlEmail_(submission.email, subject, htmlBody, plainText);
    
    Logger.log('Resolved email sent successfully');
    
  } catch (error) {
    Logger.log('Error sending resolved email: ' + error.toString());
    throw error;
  }
}
