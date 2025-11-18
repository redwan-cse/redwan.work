/**
 * One-Time Cleanup Script
 * 
 * Run this function ONCE to clean up duplicate Status columns
 * and ensure proper column structure
 * 
 * USAGE:
 * 1. Copy this file to your Apps Script project
 * 2. Click on "cleanupDuplicateStatusColumns" function
 * 3. Click Run (▶) button
 * 4. Check the logs to see what was cleaned up
 * 5. Delete this file after running (optional)
 */

/**
 * Main cleanup function - run this once
 */
function cleanupDuplicateStatusColumns() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.sheetName);
    
    if (!sheet) {
      Logger.log('ERROR: Sheet "' + CONFIG.sheetName + '" not found');
      return;
    }
    
    Logger.log('Starting cleanup of duplicate Status columns...');
    
    const STATUS_COL = 23;  // Column W
    const lastCol = sheet.getLastColumn();
    
    Logger.log('Sheet has ' + lastCol + ' columns');
    
    // Ensure Status is properly set in column W
    const statusHeader = sheet.getRange(1, STATUS_COL);
    statusHeader.setValue(COLS.STATUS);
    Logger.log('✓ Status header set in column W (23)');
    
    // Find and handle duplicate Status columns
    if (lastCol <= STATUS_COL) {
      Logger.log('No columns after Status - nothing to clean up');
      return;
    }
    
    const headerRow = sheet.getRange(1, STATUS_COL + 1, 1, lastCol - STATUS_COL).getValues()[0];
    let duplicatesFound = 0;
    
    headerRow.forEach((header, index) => {
      const colIndex = STATUS_COL + 1 + index;  // Actual column number (1-based)
      const colLetter = columnToLetter_(colIndex);
      
      if (header && header.toString().trim() === COLS.STATUS) {
        duplicatesFound++;
        Logger.log('Found duplicate Status in column ' + colLetter + ' (' + colIndex + ')');
        
        // Check if this column has any data
        const hasData = checkColumnHasData_(sheet, colIndex);
        
        if (hasData) {
          Logger.log('  → Column has data - renaming to "Status (Old)"');
          sheet.getRange(1, colIndex).setValue('Status (Old)');
        } else {
          Logger.log('  → Column is empty - clearing header');
          sheet.getRange(1, colIndex).setValue('');
        }
      }
    });
    
    if (duplicatesFound === 0) {
      Logger.log('✓ No duplicate Status columns found');
    } else {
      Logger.log('✓ Cleaned up ' + duplicatesFound + ' duplicate Status column(s)');
    }
    
    // Setup Status column validation
    Logger.log('Setting up Status column validation...');
    setupStatusColumn_(sheet);
    
    Logger.log('✓ Cleanup complete!');
    Logger.log('');
    Logger.log('NEXT STEPS:');
    Logger.log('1. Check column W - should have Status with dropdown');
    Logger.log('2. Check columns X onwards - should have Tags, Is VIP, Email Logs, etc.');
    Logger.log('3. If you see "Status (Old)" columns, review the data and delete them manually');
    Logger.log('4. Submit a test form to verify everything works');
    
  } catch (error) {
    Logger.log('ERROR during cleanup: ' + error.toString());
    Logger.log(error.stack);
  }
}

/**
 * Helper: Check if a column has any data (excluding header)
 */
function checkColumnHasData_(sheet, colIndex) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return false;  // Only header row exists
  }
  
  const values = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues();
  
  // Check if any cell has a value
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] && values[i][0].toString().trim() !== '') {
      return true;
    }
  }
  
  return false;
}

/**
 * Helper: Convert column number to letter (e.g., 1 → A, 24 → X)
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
 * Test function - check current column structure
 */
function showCurrentColumnStructure() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.sheetName);
    
    if (!sheet) {
      Logger.log('ERROR: Sheet not found');
      return;
    }
    
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    Logger.log('Current Column Structure:');
    Logger.log('========================');
    
    headers.forEach((header, index) => {
      const colNum = index + 1;
      const colLetter = columnToLetter_(colNum);
      const headerText = header ? header.toString() : '(empty)';
      
      if (colNum >= 22 && colNum <= 30) {  // Show columns V-AD
        Logger.log(colLetter + ' (' + colNum + '): ' + headerText);
      }
    });
    
    Logger.log('========================');
    Logger.log('Total columns: ' + lastCol);
    
  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
  }
}
