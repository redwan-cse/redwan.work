/**
 * Column Header Mapping
 * 
 * ============================================================================
 * COLUMN LAYOUT RULES:
 * ============================================================================
 * 
 * Columns A-V (1-22):  Google Form fields ONLY (never modified by script)
 *   - A: Timestamp
 *   - B-U: Form fields (Name, Email, Country, etc.)
 *   - V: Priority (last form field)
 * 
 * Column W (23):       BLANK SPACER (intentionally left empty as visual separator)
 *   - Never write headers or data here
 *   - Acts as buffer between form columns and script-managed columns
 * 
 * Columns X+ (24+):    Apps Script managed columns ONLY
 *   - X: Status (with dropdown: New, In Progress, Waiting on Client, etc.)
 *   - Y: Is VIP (Yes/No)
 *   - Z: Client Email Log (timestamped entries)
 *   - AA: Internal Email Log (timestamped entries)
 *   - AB: VIP Notes (VIP detection reason + notes)
 *   - AC: Tags (auto-generated categorization tags)
 *   - AD+: Future helper columns as needed
 * 
 * ============================================================================
 * File Location: /.apps-script/scripts/columns.gs
 * ============================================================================
 */

const COLS = {
  // Google Form columns (A-V: columns 1-22)
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
  PRIORITY: 'Priority',  // Last form column (V/22)
  
  // Column W (23) = BLANK SPACER - do not use
  
  // Apps Script managed columns (X+ / 24+)
  STATUS: 'Status',                      // X / 24
  IS_VIP: 'Is VIP',                      // Y / 25
  CLIENT_EMAIL_LOG: 'Client Email Log',  // Z / 26
  INTERNAL_EMAIL_LOG: 'Internal Email Log',  // AA / 27
  VIP_NOTES: 'VIP Notes',                // AB / 28
  TAGS: 'Tags'                           // AC / 29
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
 * Find or create an Apps Script managed column (X onwards)
 * 
 * IMPORTANT: This function ONLY works with columns X (24) and beyond.
 * Column W (23) is reserved as a blank spacer and is never used.
 * 
 * @param {Sheet} sheet - The Google Sheets sheet object
 * @param {string} headerName - The header name to find or create
 * @returns {number} Column index (1-based) of the found or created column
 */
function findOrCreateManagedColumn_(sheet, headerName) {
  const FIRST_MANAGED_COL = 24;  // Column X - first Apps Script column
  
  const headerIndex = buildHeaderIndex_(sheet);
  
  // Check if column already exists (must be in X or beyond)
  if (headerIndex.hasOwnProperty(headerName)) {
    const colIndex = headerIndex[headerName];
    
    // If found before column X, it's in the wrong place - create new one
    if (colIndex < FIRST_MANAGED_COL - 1) {  // -1 because headerIndex is 0-based
      Logger.log('WARNING: Found "' + headerName + '" in column ' + (colIndex + 1) + 
                 ' (before X). Creating new column in correct location.');
    } else {
      return colIndex + 1;  // Return 1-based index
    }
  }
  
  // Column doesn't exist - create it starting from column X (24) onwards
  const lastCol = sheet.getLastColumn();
  const newColIndex = Math.max(lastCol + 1, FIRST_MANAGED_COL);
  
  // Set the header
  sheet.getRange(1, newColIndex).setValue(headerName);
  
  Logger.log('Created managed column: ' + headerName + ' at column ' + newColIndex + 
             ' (' + columnToLetter_(newColIndex) + ')');
  
  return newColIndex;
}

/**
 * Convert column number to letter (A, B, ..., Z, AA, AB, ...)
 * 
 * @param {number} column - Column number (1-based)
 * @returns {string} Column letter(s)
 */
function columnToLetter_(column) {
  let temp;
  let letter = '';
  
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  
  return letter;
}

/**
 * Setup Status column with data validation dropdown
 * 
 * Status is ALWAYS in column X (24).
 * This ensures the header exists and applies dropdown validation.
 * 
 * @param {Sheet} sheet - The Google Sheets sheet object
 */
function setupStatusColumn_(sheet) {
  try {
    const STATUS_COL = 24;  // Column X
    const MAX_ROWS = 1000;   // Apply validation to first 1000 rows
    
    // Ensure header is set correctly in column X
    const headerCell = sheet.getRange(1, STATUS_COL);
    headerCell.setValue(COLS.STATUS);
    
    Logger.log('Status header set in column X (24)');
    
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
    
    // Apply to Status column (X2:X1000)
    const validationRange = sheet.getRange(2, STATUS_COL, MAX_ROWS, 1);
    validationRange.setDataValidation(rule);
    
    Logger.log('Status column (X) configured with data validation dropdown');
    
  } catch (error) {
    Logger.log('Error setting up Status column: ' + error.toString());
  }
}

/**
 * Write a timestamped log entry to a managed column
 * 
 * @param {Sheet} sheet - The Google Sheets sheet object
 * @param {number} row - Row number (1-based)
 * @param {string} columnName - Header name of the log column
 * @param {string} message - Log message to append
 */
function appendToLog_(sheet, row, columnName, message) {
  try {
    const colIndex = findOrCreateManagedColumn_(sheet, columnName);
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
