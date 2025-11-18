/**
 * Central Configuration for Contact Form Automation
 * 
 * This file contains all configuration settings for the email automation system.
 * Update CONFIG.internalEmail with your actual notification email address.
 */

const CONFIG = {
  // Sheet names
  sheetName: 'Form Responses 1',
  vipSheetName: 'VIP List',
  
  // Time zone settings
  myTimeZone: 'Asia/Dhaka',  // Your local time zone for time conversions
  
  // Email settings
  internalEmail: 'concat@redwan.work', // TODO: Update with your actual email
  senderName: 'Md. Redwan Ahmed',
  
  // Brand information
  personalName: 'Md. Redwan Ahmed',
  personalRole: 'Founder & CEO, Fast Cyber Defense (FCD)',
  website: 'https://redwan.work',
  tagline: 'Professional Cybersecurity Services',
  
  // Email signatures
  signature: 'Md. Redwan Ahmed\nFounder & CEO, Fast Cyber Defense (FCD)\nhttps://redwan.work'
};
