/**
 * Column Header Mapping
 * 
 * This file defines all column headers from the Google Form responses sheet.
 * Uses exact header names to ensure compatibility even if column order changes.
 */

const COLS = {
  TIMESTAMP: 'Timestamp',
  NAME: 'Name',
  EMAIL: 'Email',
  COUNTRY: 'Country',
  WHATSAPP: 'WhatsApp Number',
  PREFERRED_CONTACT_METHOD: 'Preferred Contact Method',
  TIME_ZONE: 'Time Zone',
  PREFERRED_CONTACT_DATE: 'Preferred Contact Date',
  BEST_TIME: 'Best Time to Contact',
  SERVICE_TYPE: 'Service Type',
  COMPANY: 'Company',
  PROJECT_URL: 'Project or Files URL',
  PROJECT_SUMMARY: 'Project Summery',  // Note: Exact spelling from sheet (with typo)
  NDA: 'NDA / Confidentiality',
  URGENCY: 'Urgency',
  BUDGET_RANGE: 'Budget Range',
  HOW_FOUND: 'How You Find Me?',
  TICKET_ID: 'Ticket ID',
  SOURCE_PAGE: 'Source Page',
  USER_AGENT: 'User Agent',
  DEVICE_TYPE: 'Device Type',
  PRIORITY: 'Priority',
  STATUS: 'Status',
  
  // Apps Script managed columns (not in form)
  TAGS: 'Tags',
  IS_VIP: 'Is VIP',
  INTERNAL_EMAIL_LOG: 'Internal Email Log',
  CLIENT_EMAIL_LOG: 'Client Email Log',
  VIP_NOTES: 'VIP Notes'
};

/**
 * Build a header index map from sheet row 1
 * 
 * @param {Sheet} sheet - The Google Sheets sheet object
 * @returns {Object} Map of header names to column indices (0-based)
 */
function buildHeaderIndex_(sheet) {
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headerIndex = {};
  
  headerRow.forEach((header, index) => {
    if (header) {
      headerIndex[header.toString().trim()] = index;
    }
  });
  
  return headerIndex;
}

/**
 * Get column index by header name
 * 
 * @param {Object} headerIndex - Header index map from buildHeaderIndex_
 * @param {string} headerName - The header name to look up
 * @returns {number} Column index (0-based) or -1 if not found
 */
function getColumnIndex_(headerIndex, headerName) {
  return headerIndex.hasOwnProperty(headerName) ? headerIndex[headerName] : -1;
}

/**
 * Find or create a helper column by header name
 * Helper columns are created starting from column X (after form columns A-V and Status in W)
 * 
 * @param {Sheet} sheet - The Google Sheets sheet object
 * @param {string} headerName - The header name to find or create
 * @returns {number} Column index (1-based) of the found or created column
 */
function findOrCreateHelperColumn_(sheet, headerName) {
  const headerIndex = buildHeaderIndex_(sheet);
  
  // Check if column already exists
  if (headerIndex.hasOwnProperty(headerName)) {
    return headerIndex[headerName] + 1;  // Return 1-based index
  }
  
  // Column doesn't exist - create it in the next available column
  const lastCol = sheet.getLastColumn();
  const newColIndex = Math.max(lastCol + 1, 24);  // Start from column X (24) minimum
  
  // Set the header
  sheet.getRange(1, newColIndex).setValue(headerName);
  
  Logger.log('Created new helper column: ' + headerName + ' at column ' + newColIndex);
  
  return newColIndex;
}

/**
 * Setup Status column with data validation dropdown
 * Column W (23) is reserved for Status
 * 
 * @param {Sheet} sheet - The Google Sheets sheet object
 */
function setupStatusColumn_(sheet) {
  try {
    const STATUS_COL = 23;  // Column W
    const MAX_ROWS = 1000;   // Apply validation to first 1000 rows
    
    // Set header if not already set
    const headerCell = sheet.getRange(1, STATUS_COL);
    if (!headerCell.getValue() || headerCell.getValue().toString().trim() !== 'Status') {
      headerCell.setValue('Status');
    }
    
    // Define allowed status values
    const statusValues = [
      'New',
      'In Progress',
      'Waiting on Client',
      'Resolved',
      'Spam',
      'Closed'
    ];
    
    // Create data validation rule
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(statusValues, true)  // true = show dropdown
      .setAllowInvalid(false)
      .build();
    
    // Apply to Status column (W2:W1000)
    const validationRange = sheet.getRange(2, STATUS_COL, MAX_ROWS, 1);
    validationRange.setDataValidation(rule);
    
    Logger.log('Status column (W) configured with data validation');
    
  } catch (error) {
    Logger.log('Error setting up Status column: ' + error.toString());
  }
}

/**
 * Write a timestamped log entry to a helper column
 * 
 * @param {Sheet} sheet - The Google Sheets sheet object
 * @param {number} row - Row number (1-based)
 * @param {string} columnName - Header name of the log column
 * @param {string} message - Log message to append
 */
function appendToLog_(sheet, row, columnName, message) {
  try {
    const colIndex = findOrCreateHelperColumn_(sheet, columnName);
    const cell = sheet.getRange(row, colIndex);
    
    // Get current value
    const currentValue = cell.getValue().toString().trim();
    
    // Create timestamped entry (GMT+6)
    const now = new Date();
    const gmtPlus6 = new Date(now.getTime() + (6 * 60 * 60 * 1000));
    const timeStr = Utilities.formatDate(gmtPlus6, 'GMT+6', 'yyyy-MM-dd HH:mm:ss');
    const logEntry = '[' + timeStr + ' GMT+6] ' + message;
    
    // Append or set
    const newValue = currentValue ? currentValue + '\n' + logEntry : logEntry;
    cell.setValue(newValue);
    
  } catch (error) {
    Logger.log('Error appending to log: ' + error.toString());
  }
}
