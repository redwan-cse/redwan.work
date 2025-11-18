/**
 * VIP Detection and Tagging System
 * 
 * ============================================================================
 * HOW VIP DETECTION WORKS:
 * ============================================================================
 * 
 * This system detects VIP clients based on a separate "VIP List" sheet within
 * the same Google Spreadsheet.
 * 
 * VIP LIST SHEET STRUCTURE:
 * --------------------------
 * Sheet Name: "VIP List" (configurable in config.gs as CONFIG.vipSheetName)
 * 
 * Required Columns (row 1 headers):
 *   - Email:  Full email address of VIP client (e.g., "ceo@company.com")
 *   - Domain: Email domain for VIP organizations (e.g., "company.com" or "@company.com")
 *   - Notes:  Free-text notes about why they're VIP or any special handling
 * 
 * DETECTION LOGIC:
 * ----------------
 * 1. Exact Email Match (highest priority):
 *    - If incoming email exactly matches an entry in the Email column
 *    - Returns: { isVip: true, reason: "Exact email match: ceo@company.com" }
 * 
 * 2. Domain Match (second priority):
 *    - If incoming email's domain (part after @) matches an entry in Domain column
 *    - Example: john@company.com matches Domain "company.com"
 *    - Returns: { isVip: true, reason: "Domain match (company.com): Notes text" }
 * 
 * 3. No Match:
 *    - Returns: { isVip: false, reason: '' }
 * 
 * HOW TO POPULATE VIP LIST:
 * -------------------------
 * 1. Create a new sheet in your spreadsheet named "VIP List"
 * 2. Add headers in row 1: Email | Domain | Notes
 * 3. Add VIP entries:
 * 
 *    | Email             | Domain         | Notes                           |
 *    |-------------------|----------------|---------------------------------|
 *    | ceo@bigcorp.com   |                | CEO of major client            |
 *    | vip@startup.com   |                | Premium support contract       |
 *    |                   | enterprise.com | All emails from this company   |
 *    |                   | partner.org    | Strategic partner organization |
 * 
 * 4. Leave Email blank if you want to match entire domain
 * 5. Leave Domain blank if you want to match specific email only
 * 
 * ============================================================================
 * File Location: /.apps-script/scripts/vip_tags.gs
 * ============================================================================
 */

/**
 * Check if an email is VIP
 * 
 * @param {string} email - Email address to check
 * @returns {Object} Object with isVip boolean and reason string
 */
function isVip_(email) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const vipSheet = ss.getSheetByName(CONFIG.vipSheetName);
    
    // If VIP sheet doesn't exist, return not VIP
    if (!vipSheet) {
      return { isVip: false, reason: '' };
    }
    
    const data = vipSheet.getDataRange().getValues();
    
    // If sheet is empty or only has headers, return not VIP
    if (data.length <= 1) {
      return { isVip: false, reason: '' };
    }
    
    // Build header index for VIP sheet
    const headers = data[0];
    const emailColIdx = headers.indexOf('Email');
    const domainColIdx = headers.indexOf('Domain');
    const notesColIdx = headers.indexOf('Notes');
    
    if (emailColIdx === -1 && domainColIdx === -1) {
      Logger.log('VIP sheet missing Email and Domain columns');
      return { isVip: false, reason: '' };
    }
    
    // Extract domain from email
    const emailLower = email.toLowerCase().trim();
    const emailDomain = emailLower.split('@')[1] || '';
    
    // Check each row for match
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // Check exact email match
      if (emailColIdx !== -1 && row[emailColIdx]) {
        const vipEmail = row[emailColIdx].toString().toLowerCase().trim();
        if (vipEmail === emailLower) {
          const notes = notesColIdx !== -1 ? row[notesColIdx] : '';
          return {
            isVip: true,
            reason: 'Exact email match' + (notes ? ': ' + notes : '')
          };
        }
      }
      
      // Check domain match
      if (domainColIdx !== -1 && row[domainColIdx] && emailDomain) {
        const vipDomain = row[domainColIdx].toString().toLowerCase().trim();
        if (vipDomain === emailDomain) {
          const notes = notesColIdx !== -1 ? row[notesColIdx] : '';
          return {
            isVip: true,
            reason: 'Domain match (' + emailDomain + ')' + (notes ? ': ' + notes : '')
          };
        }
      }
    }
    
    return { isVip: false, reason: '' };
    
  } catch (error) {
    Logger.log('Error checking VIP status: ' + error.toString());
    return { isVip: false, reason: '' };
  }
}

/**
 * Build tags string from submission data
 * 
 * @param {Object} submission - Normalized submission object
 * @param {Object} vipInfo - VIP information object from isVip_()
 * @returns {string} Comma-separated tags string
 */
function buildTags_(submission, vipInfo) {
  const tags = [];
  
  try {
    // Service type tags
    if (submission.serviceTypeRaw) {
      const serviceType = submission.serviceTypeRaw.toLowerCase();
      
      if (serviceType.includes('technical support')) {
        tags.push('service_technical_support');
      }
      if (serviceType.includes('vulnerability assessment')) {
        tags.push('service_vulnerability_assessment');
      }
      if (serviceType.includes('penetration testing')) {
        tags.push('service_penetration_testing');
      }
      if (serviceType.includes('security hardening')) {
        tags.push('service_security_hardening');
      }
      if (serviceType.includes('training') || serviceType.includes('workshop')) {
        tags.push('service_training');
      }
      if (serviceType.includes('consulting')) {
        tags.push('service_consulting');
      }
      if (serviceType.includes('incident response')) {
        tags.push('service_incident_response');
      }
      if (serviceType.includes('security audit')) {
        tags.push('service_security_audit');
      }
      if (serviceType.includes('compliance')) {
        tags.push('service_compliance');
      }
      if (serviceType.includes('osint')) {
        tags.push('service_osint');
      }
      if (serviceType.includes('other:')) {
        tags.push('service_other');
      }
    }
    
    // NDA tag
    if (submission.ndaRequired) {
      tags.push('nda_required');
    }
    
    // Priority tags
    if (submission.priority) {
      const priority = submission.priority.toLowerCase();
      if (priority === 'high') {
        tags.push('priority_high');
      } else if (priority === 'medium') {
        tags.push('priority_medium');
      } else if (priority === 'low') {
        tags.push('priority_low');
      }
    }
    
    // Urgency tags
    if (submission.urgency) {
      const urgency = submission.urgency.toLowerCase();
      if (urgency.includes('immediate')) {
        tags.push('urgency_immediately');
      } else if (urgency.includes('1_week') || urgency.includes('week')) {
        tags.push('urgency_within_1_week');
      } else if (urgency.includes('2_week')) {
        tags.push('urgency_within_2_weeks');
      } else if (urgency.includes('month')) {
        tags.push('urgency_within_month');
      } else if (urgency.includes('flexible')) {
        tags.push('urgency_flexible');
      }
    }
    
    // Device type tags
    if (submission.deviceType) {
      const device = submission.deviceType.toLowerCase();
      if (device.includes('mobile')) {
        tags.push('device_mobile');
      } else if (device.includes('desktop')) {
        tags.push('device_desktop');
      } else if (device.includes('tablet')) {
        tags.push('device_tablet');
      }
    }
    
    // Country tag
    if (submission.country) {
      const countryTag = 'country_' + submission.country
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      tags.push(countryTag);
    }
    
    // Source page tag
    if (submission.sourcePage) {
      const sourceTag = 'source_' + submission.sourcePage
        .replace(/^\//, '')  // Remove leading slash
        .replace(/[\/\?\&#]/g, '_')  // Replace special chars with underscore
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
      if (sourceTag !== 'source_') {
        tags.push(sourceTag);
      }
    }
    
    // VIP tag
    if (vipInfo && vipInfo.isVip) {
      tags.push('vip');
    }
    
    // Budget tags
    if (submission.budgetRange) {
      const budget = submission.budgetRange.toLowerCase();
      if (budget.includes('500') || budget.includes('1000')) {
        tags.push('budget_small');
      } else if (budget.includes('2000') || budget.includes('5000')) {
        tags.push('budget_medium');
      } else if (budget.includes('10000') || budget.includes('20000')) {
        tags.push('budget_large');
      }
    }
    
    // Contact method tags
    if (submission.preferredContactMethod) {
      const method = submission.preferredContactMethod.toLowerCase();
      if (method.includes('whatsapp')) {
        tags.push('contact_whatsapp');
      }
      if (method.includes('email')) {
        tags.push('contact_email');
      }
    }
    
  } catch (error) {
    Logger.log('Error building tags: ' + error.toString());
  }
  
  return tags.join(', ');
}

/**
 * Normalize service type text
 * Handles "Other: custom text" format
 * 
 * @param {string} serviceTypeRaw - Raw service type from form
 * @returns {string} Normalized service type
 */
function normalizeServiceType_(serviceTypeRaw) {
  if (!serviceTypeRaw) return 'Not specified';
  
  // If it's a comma-separated list, just return it as-is
  // The form already merges "Other" with custom text
  return serviceTypeRaw.trim();
}
