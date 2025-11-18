/**
 * Email Utility Functions
 * 
 * This file provides helper functions for rendering HTML templates
 * and sending HTML emails with the correct sender display name.
 */

/**
 * Render an HTML template with data
 * 
 * @param {string} filename - Name of the HTML template file (without .html extension)
 * @param {Object} dataObj - Object containing data to pass to the template
 * @returns {string} Rendered HTML content
 */
function renderTemplate_(filename, dataObj) {
  try {
    const template = HtmlService.createTemplateFromFile(filename);
    
    // Assign each property from dataObj to the template
    if (dataObj) {
      Object.keys(dataObj).forEach(key => {
        template[key] = dataObj[key];
      });
    }
    
    return template.evaluate().getContent();
  } catch (error) {
    Logger.log('Error rendering template ' + filename + ': ' + error.toString());
    throw error;
  }
}

/**
 * Send an HTML email with proper sender name
 * 
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} htmlBody - HTML content of the email
 * @param {string} plainTextFallback - Plain text version (optional)
 * @param {Object} extraOptions - Additional GmailApp options (optional)
 */
function sendHtmlEmail_(to, subject, htmlBody, plainTextFallback, extraOptions) {
  try {
    // Default plain text fallback if not provided
    if (!plainTextFallback) {
      plainTextFallback = 'Your email client does not support HTML. Please view this email in a modern email client.';
    }
    
    // Build options object with sender name
    const options = {
      htmlBody: htmlBody,
      name: CONFIG.senderName  // Display name for the sender
    };
    
    // Merge any additional options
    if (extraOptions) {
      Object.keys(extraOptions).forEach(key => {
        options[key] = extraOptions[key];
      });
    }
    
    // Send the email
    GmailApp.sendEmail(to, subject, plainTextFallback, options);
    
    Logger.log('Email sent successfully to: ' + to + ' | Subject: ' + subject);
  } catch (error) {
    Logger.log('Error sending email to ' + to + ': ' + error.toString());
    throw error;
  }
}

/**
 * Build email subject with prefix badges
 * 
 * @param {Array<string>} badges - Array of badge strings (e.g., ['VIP', 'High Priority'])
 * @param {string} mainText - Main subject text
 * @param {string} ticketId - Ticket ID to append (optional)
 * @returns {string} Formatted subject line
 */
function buildSubject_(badges, mainText, ticketId) {
  let subject = '';
  
  // Add badges
  if (badges && badges.length > 0) {
    badges.forEach(badge => {
      subject += '[' + badge + '] ';
    });
  }
  
  // Add main text
  subject += mainText;
  
  // Add ticket ID if provided
  if (ticketId) {
    subject += ' ' + ticketId;
  }
  
  return subject;
}

/**
 * Sanitize text for HTML display
 * 
 * @param {string} text - Text to sanitize
 * @returns {string} HTML-safe text
 */
function sanitizeHtml_(text) {
  if (!text) return '';
  
  return text
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format a date/time string for display
 * 
 * @param {string} dateString - Date string to format
 * @returns {string} Formatted date string
 */
function formatDate_(dateString) {
  if (!dateString) return 'Not specified';
  
  try {
    const date = new Date(dateString);
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM dd, yyyy');
  } catch (error) {
    return dateString;
  }
}
