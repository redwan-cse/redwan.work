"use client"

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, Loader2, CheckCircle, User, Mail, Globe, Phone, Briefcase, DollarSign, Clock, Info, CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { countries, getCountryByCode, getTimezonesByCountry, allTimezones, Country } from "@/lib/countries-data";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Enhanced Contact Form Component
 * 
 * This component collects rich lead data for cybersecurity services.
 * It submits directly to Google Forms using the no-cors mode.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a Google Form with all required fields (19 fields total)
 * 2. Get the form's "formResponse" URL (replace /viewform with /formResponse)
 * 3. Inspect each field to get entry IDs (entry.XXXXXXXXX)
 * 4. Update the GOOGLE_FORM_URL and entry IDs in the handleSubmit function below
 * 5. Apps Script in Google Sheets will handle email notifications and data processing
 * 
 * FIELD MAPPING:
 * Each form field maps to a Google Form entry ID.
 * Hidden/derived fields (sourcePage, userAgent, deviceType, priority, status)
 * are automatically collected and sent along with user inputs.
 * Google Forms automatically adds a timestamp as the first column in the linked Sheet.
 */

/**
 * Google Form Configuration
 * 
 * The form submission URL is stored in environment variables:
 * NEXT_PUBLIC_GOOGLE_FORM_ACTION_URL=https://docs.google.com/forms/d/e/FORM_ID/formResponse
 * 
 * This allows easy updates without modifying code.
 */
const GOOGLE_FORM_ACTION_URL = process.env.NEXT_PUBLIC_GOOGLE_FORM_ACTION_URL;

// Service type options - easily extensible
const serviceTypes = [
  "Technical Support",
  "Vulnerability Assessment",
  "Penetration Testing",
  "Security Hardening",
  "Training / Workshop",
  "Consulting",
  "Incident Response",
  "Security Audit",
  "Compliance Assessment",
  "OSINT Investigation",
  "Other"
];

// How did you find me options
const referralSources = [
  "Referral",
  "Upwork",
  "LinkedIn",
  "Google",
  "YouTube",
  "Other"
];

// Urgency options
const urgencyOptions = [
  { value: "immediately", label: "Immediately", priority: "High" },
  { value: "within_1_week", label: "Within 1 week", priority: "High" },
  { value: "within_1_month", label: "Within 1 month", priority: "Medium" },
  { value: "flexible", label: "Flexible", priority: "Low" }
];

interface FormData {
  // Visible fields
  name: string;
  email: string;
  country: string;
  whatsAppCountryCode: string; // Country code for WhatsApp
  whatsAppNumber: string;      // Local WhatsApp number (combined with code on submit)
  preferredContactMethod: 'Email' | 'WhatsApp' | 'Both' | '';
  timeZone: string;
  preferredContactDate: string; // Optional ISO date
  bestTimeToContact: string;    // Morning/Afternoon/Evening/Flexible
  serviceType: string[];
  serviceTypeOther: string;     // Additional input when "Other" is selected
  company: string;
  projectUrlOrFiles: string;
  projectSummary: string;
  ndaConfidentiality: string;   // Non-empty if checked
  urgency: string;
  budgetMin: string;
  budgetMax: string;
  howDidYouFindMe: string;
  howDidYouFindMeOther: string;    // Additional input when "Other" is selected
  howDidYouFindMeReferral: string; // Additional input when "Referral" is selected
  ticketId: string;
  gdprConsent: boolean;         // Required checkbox (frontend only)
}

interface FormErrors {
  [key: string]: string;
}

interface HiddenFields {
  sourcePage: string;
  userAgent: string;
  deviceType: 'Mobile' | 'Desktop' | 'Tablet';
  priority: 'High' | 'Medium' | 'Low';
  timestamp: string;
}

export default function EnhancedContactForm() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    country: '',
    whatsAppCountryCode: '+880',
    whatsAppNumber: '',
    preferredContactMethod: '',
    timeZone: '',
    preferredContactDate: '',
    bestTimeToContact: '',
    serviceType: [],
    serviceTypeOther: '',
    company: '',
    projectUrlOrFiles: '',
    projectSummary: '',
    ndaConfidentiality: '',
    urgency: '',
    budgetMin: '',
    budgetMax: '',
    howDidYouFindMe: '',
    howDidYouFindMeOther: '',
    howDidYouFindMeReferral: '',
    ticketId: '',
    gdprConsent: false,
  });
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null);

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState('');
  const [selectedWhatsAppCountryCode, setSelectedWhatsAppCountryCode] = useState('');
  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  const [isPreferredDateOpen, setIsPreferredDateOpen] = useState(false);
  
  // Validation dialog state
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  // Refs for form fields to enable scrolling and focusing
  const nameRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const countryRef = React.useRef<HTMLButtonElement>(null);
  const whatsAppNumberRef = React.useRef<HTMLInputElement>(null);
  const timeZoneRef = React.useRef<HTMLButtonElement>(null);
  const serviceTypeRef = React.useRef<HTMLDivElement>(null);
  const projectSummaryRef = React.useRef<HTMLTextAreaElement>(null);
  const urgencyRef = React.useRef<HTMLButtonElement>(null);
  const gdprConsentRef = React.useRef<HTMLButtonElement>(null);

  // Generate 9-character ticket ID with # prefix + 8-character hex
  const generateTicketId = (): string => {
    const array = new Uint8Array(4);
    crypto.getRandomValues(array);
    const hexId = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    return '#' + hexId;
  };

  // Auto-detect timezone, country, and WhatsApp dial code on mount
  useEffect(() => {
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Try to find a country that uses this timezone
    let detectedCountry: Country | undefined;
    for (const country of countries) {
      if (country.timezones.includes(detectedTimezone)) {
        detectedCountry = country;
        break;
      }
    }
    
    if (detectedCountry) {
      setSelectedCountryCode(detectedCountry.code);
      setSelectedWhatsAppCountryCode(detectedCountry.code);
      setFormData(prev => ({
        ...prev,
        country: detectedCountry!.name,
        whatsAppCountryCode: detectedCountry!.phoneCode,
        timeZone: detectedTimezone
      }));
    } else {
      // Fallback: just set timezone
      setFormData(prev => ({
        ...prev,
        timeZone: detectedTimezone
      }));
    }
  }, []);

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleServiceTypeToggle = (service: string) => {
    setFormData(prev => {
      const currentServices = prev.serviceType;
      const newServices = currentServices.includes(service)
        ? currentServices.filter(s => s !== service)
        : [...currentServices, service];
      return { ...prev, serviceType: newServices };
    });
    if (errors.serviceType) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.serviceType;
        return newErrors;
      });
    }
  };

  const handleCountryChange = (countryCode: string) => {
    const country = getCountryByCode(countryCode);
    setSelectedCountryCode(countryCode);
    setSelectedWhatsAppCountryCode(country?.code || '');
    setCountryPopoverOpen(false); // Close the popover after selection
    
    // Get timezones for this country
    const countryTimezones = getTimezonesByCountry(country?.name || '');
    
    // Always set the first timezone if available, overriding any previous selection
    const autoSelectedTimezone = countryTimezones.length > 0 ? countryTimezones[0] : '';

    // Update all related fields in one state update
    setFormData(prev => ({
      ...prev,
      country: country?.name || countryCode,
      whatsAppCountryCode: country?.phoneCode || '', // Auto-set WhatsApp dial code
      timeZone: autoSelectedTimezone // This will update both formData AND the Select component's value
    }));

    // Clear timezone error if we successfully set a timezone
    if (autoSelectedTimezone && errors.timeZone) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.timeZone;
        return newErrors;
      });
    }
  };

  /**
   * Validates the form and returns validation results
   * @returns Object with isValid flag and array of missing field labels
   */
  const validateForm = (): { isValid: boolean; errors: string[] } => {
    const newErrors: FormErrors = {};
    const missingFields: string[] = [];

    // Required fields validation with user-friendly labels
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
      missingFields.push('Full Name');
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
      missingFields.push('Email Address');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address';
      missingFields.push('Valid Email Address');
    }

    if (!formData.country) {
      newErrors.country = 'Country is required';
      missingFields.push('Country');
    }

    if (!formData.timeZone) {
      newErrors.timeZone = 'Time zone is required';
      missingFields.push('Time Zone');
    }

    if (formData.serviceType.length === 0) {
      newErrors.serviceType = 'Please select at least one service type';
      missingFields.push('Service Type(s) Needed');
    }

    if (!formData.projectSummary.trim()) {
      newErrors.projectSummary = 'Project summary is required';
      missingFields.push('Project Summary / Message');
    } else if (formData.projectSummary.trim().length < 30) {
      newErrors.projectSummary = 'Please provide at least 30 characters describing your project';
      missingFields.push('Project Summary / Message (minimum 30 characters)');
    }

    if (!formData.urgency) {
      newErrors.urgency = 'Please select urgency level';
      missingFields.push('Urgency');
    }

    // WhatsApp validation
    // 1. If WhatsApp is selected as preferred contact method, it's required
    if ((formData.preferredContactMethod === 'WhatsApp' || formData.preferredContactMethod === 'Both') && !formData.whatsAppNumber.trim()) {
      newErrors.whatsAppNumber = 'WhatsApp number is required when WhatsApp is selected as a contact method';
      missingFields.push('WhatsApp Number (required for selected contact method)');
    }
    // 2. If provided, should have enough digits (7+ digits)
    else if (formData.whatsAppNumber && !/\d{7,}/.test(formData.whatsAppNumber.replace(/\D/g, ''))) {
      newErrors.whatsAppNumber = 'Please provide a valid WhatsApp number';
      missingFields.push('Valid WhatsApp Number');
    }

    // GDPR consent is required
    if (!formData.gdprConsent) {
      newErrors.gdprConsent = 'You must agree to the data and privacy policy to submit';
      missingFields.push('Data & Privacy consent');
    }

    // Budget validation
    const hasMinBudget = formData.budgetMin.trim() !== '';
    const hasMaxBudget = formData.budgetMax.trim() !== '';

    if (hasMinBudget || hasMaxBudget) {
      if (!hasMinBudget) {
        newErrors.budgetMin = 'Please enter minimum budget';
        missingFields.push('Minimum Budget');
      } else if (isNaN(Number(formData.budgetMin)) || Number(formData.budgetMin) < 0) {
        newErrors.budgetMin = 'Please enter a valid positive number';
        missingFields.push('Valid Minimum Budget');
      }

      if (!hasMaxBudget) {
        newErrors.budgetMax = 'Please enter maximum budget';
        missingFields.push('Maximum Budget');
      } else if (isNaN(Number(formData.budgetMax)) || Number(formData.budgetMax) < 0) {
        newErrors.budgetMax = 'Please enter a valid positive number';
        missingFields.push('Valid Maximum Budget');
      }

      if (hasMinBudget && hasMaxBudget) {
        const min = Number(formData.budgetMin);
        const max = Number(formData.budgetMax);
        if (min > max) {
          newErrors.budgetMax = 'Maximum budget must be greater than or equal to minimum';
          missingFields.push('Valid Budget Range (max ≥ min)');
        }
      }
    }

    setErrors(newErrors);
    return {
      isValid: Object.keys(newErrors).length === 0,
      errors: missingFields
    };
  };

  const getDeviceType = (userAgent: string): 'Mobile' | 'Desktop' | 'Tablet' => {
    if (/mobile/i.test(userAgent)) return 'Mobile';
    if (/tablet|ipad/i.test(userAgent)) return 'Tablet';
    return 'Desktop';
  };

  const getPriority = (urgency: string): 'High' | 'Medium' | 'Low' => {
    const urgencyOption = urgencyOptions.find(opt => opt.value === urgency);
    return (urgencyOption?.priority as 'High' | 'Medium' | 'Low') || 'Low';
  };

  /**
   * Scrolls to and focuses the first invalid field
   */
  const scrollToFirstError = () => {
    const errorFieldMap: Record<string, React.RefObject<HTMLElement | null>> = {
      name: nameRef as React.RefObject<HTMLElement | null>,
      email: emailRef as React.RefObject<HTMLElement | null>,
      country: countryRef as React.RefObject<HTMLElement | null>,
      whatsAppNumber: whatsAppNumberRef as React.RefObject<HTMLElement | null>,
      timeZone: timeZoneRef as React.RefObject<HTMLElement | null>,
      serviceType: serviceTypeRef as React.RefObject<HTMLElement | null>,
      projectSummary: projectSummaryRef as React.RefObject<HTMLElement | null>,
      urgency: urgencyRef as React.RefObject<HTMLElement | null>,
      gdprConsent: gdprConsentRef as React.RefObject<HTMLElement | null>,
    };

    // Find the first error field
    for (const [field, ref] of Object.entries(errorFieldMap)) {
      if (errors[field] && ref.current) {
        // Scroll to the element with smooth behavior
        ref.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center'
        });
        
        // Focus the element after a short delay to ensure scroll completes
        setTimeout(() => {
          ref.current?.focus();
        }, 300);
        
        break;
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateForm();
    
    if (!validation.isValid) {
      // Show validation dialog with missing fields
      setValidationErrors(validation.errors);
      setShowValidationDialog(true);
      return;
    }

    setIsSubmitting(true);

    try {
      // Generate Ticket ID
      const ticketId = generateTicketId();
      setSubmittedTicketId(ticketId);

      // Collect hidden/derived fields
      const hiddenFields: HiddenFields = {
        sourcePage: typeof window !== 'undefined' ? window.location.pathname : '/contact',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
        deviceType: typeof navigator !== 'undefined' ? getDeviceType(navigator.userAgent) : 'Desktop',
        priority: getPriority(formData.urgency),
        timestamp: new Date().toISOString()
      };

      // Format budget range as single string (e.g., "$500 - $5000")
      let budgetRangeFormatted = '';
      if (formData.budgetMin || formData.budgetMax) {
        const min = formData.budgetMin || 'Not specified';
        const max = formData.budgetMax || 'Not specified';
        budgetRangeFormatted = `$${min} - $${max}`;
      }

      // Combine all fields into a flat object ready for Google Forms
      const submissionData = {
        // Visible fields
        name: formData.name.trim(),
        email: formData.email.trim(),
        country: formData.country,
        whatsAppNumber: formData.whatsAppCountryCode && formData.whatsAppNumber 
          ? `${formData.whatsAppCountryCode}${formData.whatsAppNumber.trim()}`
          : formData.whatsAppNumber.trim(),
        preferredContactMethod: formData.preferredContactMethod || '',
        timeZone: formData.timeZone,
        preferredContactDate: formData.preferredContactDate || '',
        bestTimeToContact: formData.bestTimeToContact || '',
        serviceType: formData.serviceType.includes('Other') && formData.serviceTypeOther
          ? formData.serviceType.filter(s => s !== 'Other').concat([`Other: ${formData.serviceTypeOther.trim()}`]).join(', ')
          : formData.serviceType.join(', '),
        company: formData.company.trim(),
        projectUrlOrFiles: formData.projectUrlOrFiles.trim(),
        projectSummary: formData.projectSummary.trim(),
        ndaConfidentiality: formData.ndaConfidentiality || '',
        urgency: formData.urgency,
        budgetRange: budgetRangeFormatted,
        howDidYouFindMe: formData.howDidYouFindMe === 'Referral' && formData.howDidYouFindMeReferral
          ? `Referred by ${formData.howDidYouFindMeReferral.trim()}`
          : formData.howDidYouFindMe === 'Other' && formData.howDidYouFindMeOther
          ? `Other: ${formData.howDidYouFindMeOther.trim()}`
          : formData.howDidYouFindMe,
        
        // Ticket ID for tracking
        ticketId: ticketId,
        
        // Hidden/derived fields (timestamp excluded - Google Forms adds its own)
        sourcePage: hiddenFields.sourcePage,
        userAgent: hiddenFields.userAgent,
        deviceType: hiddenFields.deviceType,
        priority: hiddenFields.priority,
        
        // Note: Status is managed by Apps Script (default = "New"), not from form
        // Note: automatedMailSent will be set by Apps Script after sending confirmation
      };

      // Log data for debugging
      console.log('📋 Form Submission Data:', submissionData);

      /**
       * GOOGLE FORMS ENTRY ID MAPPING
       * 
       * These entry IDs map to the actual Google Form questions.
       * Entry IDs are obtained by inspecting the Google Form fields.
       * 
       * NOTE: budgetMin/budgetMax are merged into budgetRange (e.g., "$500 - $5000")
       * NOTE: timestamp is NOT included - Google Forms adds its own timestamp automatically
       */
      const formFields = {
        // Visible fields
        'entry.1040615996': submissionData.name,                    // Name (required)
        'entry.527020986': submissionData.email,                    // Email (required)
        'entry.275586996': submissionData.country,                  // Country (required)
        'entry.691109542': submissionData.whatsAppNumber,           // WhatsApp Number (merged "+code + number")
        'entry.2004275388': submissionData.preferredContactMethod,  // Preferred Contact Method
        'entry.876535023': submissionData.timeZone,                 // Time Zone (required)
        'entry.825634052': submissionData.preferredContactDate,     // Preferred Contact Date (optional)
        'entry.2142614790': submissionData.bestTimeToContact,       // Best Time to Contact (optional)
        'entry.762760499': submissionData.serviceType,              // Service Type(s) (required)
        'entry.554909735': submissionData.company,                  // Company (optional)
        'entry.688437948': submissionData.projectUrlOrFiles,        // Project URL/Files (optional)
        'entry.428546032': submissionData.projectSummary,           // Project Summary (required)
        'entry.739578366': submissionData.ndaConfidentiality,       // NDA / Confidentiality (optional)
        'entry.663205754': submissionData.urgency,                  // Urgency (required)
        'entry.1932264358': submissionData.budgetRange,             // Budget Range (formatted as "$min - $max")
        'entry.1784832711': submissionData.howDidYouFindMe,         // How did you find me (optional)
        'entry.233094040': submissionData.ticketId,                 // Ticket ID (9-char: # + 8-char hex)
        
        // Hidden/derived fields
        'entry.209109331': submissionData.sourcePage,               // Source Page (e.g., "/contact")
        'entry.1734132568': submissionData.userAgent,               // User Agent
        'entry.1030161553': submissionData.deviceType,              // Device Type (Mobile/Desktop/Tablet)
        'entry.279561249': submissionData.priority,                 // Priority (High/Medium/Low)
      };

      const formBody = new URLSearchParams(formFields as Record<string, string>);

      // Validate environment variable is set
      if (!GOOGLE_FORM_ACTION_URL) {
        throw new Error('Google Form URL is not configured. Please set NEXT_PUBLIC_GOOGLE_FORM_ACTION_URL in your environment variables.');
      }

      // Submit to Google Forms
      await fetch(GOOGLE_FORM_ACTION_URL, {
        method: 'POST',
        body: formBody,
        mode: 'no-cors', // Required for Google Forms cross-origin submission
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      // Since we use no-cors mode, we can't read the response
      // Assume success if no error is thrown
      console.log('✅ Form submitted successfully to Google Forms');

      // Show success message
      setSubmitSuccess(true);
      setFormData({
        name: '',
        email: '',
        country: '',
        whatsAppCountryCode: '+880',
        whatsAppNumber: '',
        preferredContactMethod: '',
        timeZone: '',
        preferredContactDate: '',
        bestTimeToContact: '',
        serviceType: [],
        serviceTypeOther: '',
        company: '',
        projectUrlOrFiles: '',
        projectSummary: '',
        ndaConfidentiality: '',
        urgency: '',
        budgetMin: '',
        budgetMax: '',
        howDidYouFindMe: '',
        howDidYouFindMeOther: '',
        howDidYouFindMeReferral: '',
        ticketId: '',
        gdprConsent: false,
      });
      setSelectedCountryCode('+880');
      setSelectedWhatsAppCountryCode('');

      // Auto-hide success message after 5 seconds
      setTimeout(() => {
        setSubmitSuccess(false);
        setSubmittedTicketId(null);
      }, 5000);

    } catch (error) {
      console.error('❌ Form submission error:', error);
      setErrors({ submit: 'Failed to submit form. Please try again or contact us directly.' });
      setSubmittedTicketId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableTimezones = formData.country 
    ? getTimezonesByCountry(formData.country) 
    : allTimezones;

  const whatsAppSelectValue = selectedWhatsAppCountryCode 
    || countries.find((c: Country) => c.phoneCode === formData.whatsAppCountryCode)?.code 
    || '';

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {/* Contact Details Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-primary/20">
            <User className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Contact Details</h3>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-1">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                ref={nameRef}
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="John Doe"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "name-error" : undefined}
                className={errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {errors.name && (
                <p id="name-error" className="text-sm text-destructive" role="alert">
                  {errors.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1">
                Email Address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                ref={emailRef}
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="john@example.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                className={errors.email ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive" role="alert">
                  {errors.email}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country" className="flex items-center gap-1">
                Country <span className="text-destructive">*</span>
              </Label>
              {/* Searchable country selector with keyboard navigation */}
              <Popover open={countryPopoverOpen} onOpenChange={setCountryPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="country"
                    ref={countryRef}
                    variant="outline"
                    role="combobox"
                    aria-expanded={countryPopoverOpen}
                    aria-invalid={!!errors.country}
                    aria-describedby={errors.country ? "country-error" : undefined}
                    className={cn(
                      "w-full justify-between",
                      errors.country ? "border-destructive focus:ring-destructive" : "",
                      !selectedCountryCode && "text-muted-foreground"
                    )}
                  >
                    {selectedCountryCode ? (
                      <span className="flex items-center gap-2">
                        <span>{getCountryByCode(selectedCountryCode)?.flag}</span>
                        <span>{getCountryByCode(selectedCountryCode)?.name}</span>
                      </span>
                    ) : (
                      "Select your country"
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search country..." />
                    <CommandList>
                      <CommandEmpty>No country found.</CommandEmpty>
                      <CommandGroup>
                        {[...countries].sort((a, b) => a.name.localeCompare(b.name)).map((country: Country) => (
                          <CommandItem
                            key={country.code}
                            value={country.name}
                            onSelect={() => handleCountryChange(country.code)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCountryCode === country.code ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="mr-2">{country.flag}</span>
                            <span>{country.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {errors.country && (
                <p id="country-error" className="text-sm text-destructive" role="alert">
                  {errors.country}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsApp" className="flex items-center gap-1">
                <Phone className="h-4 w-4" />
                WhatsApp Number <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <div className="flex gap-2">
                <Select 
                  value={whatsAppSelectValue}
                  onValueChange={(value) => {
                    // Find the country by code and get its phone code
                    const selectedCountry = countries.find((c: Country) => c.code === value);
                    if (selectedCountry) {
                      handleInputChange('whatsAppCountryCode', selectedCountry.phoneCode);
                      setSelectedWhatsAppCountryCode(selectedCountry.code);
                    }
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Code" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {[...countries].sort((a, b) => a.name.localeCompare(b.name)).map((country: Country) => (
                      <SelectItem key={country.code} value={country.code}>
                        <span className="flex items-center gap-2">
                          <span>{country.flag}</span>
                          <span>{country.phoneCode}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="whatsApp"
                  ref={whatsAppNumberRef}
                  type="tel"
                  value={formData.whatsAppNumber}
                  onChange={(e) => handleInputChange('whatsAppNumber', e.target.value)}
                  placeholder="1234567890"
                  aria-invalid={!!errors.whatsAppNumber}
                  aria-describedby={errors.whatsAppNumber ? "whatsApp-error" : undefined}
                  className={`flex-1 ${errors.whatsAppNumber ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
              </div>
              {errors.whatsAppNumber && (
                <p id="whatsApp-error" className="text-sm text-destructive" role="alert">
                  {errors.whatsAppNumber}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Used for quick, cost-effective communication. Country code auto-selected from your country.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone" className="flex items-center gap-1">
              Time Zone <span className="text-destructive">*</span>
            </Label>
            <Select 
              key={`timezone-${formData.country}`} 
              value={formData.timeZone} 
              onValueChange={(value) => handleInputChange('timeZone', value)}
            >
              <SelectTrigger
                id="timezone"
                ref={timeZoneRef}
                className={errors.timeZone ? "border-destructive focus:ring-destructive" : ""}
                aria-invalid={!!errors.timeZone}
                aria-describedby={errors.timeZone ? "timezone-error" : undefined}
              >
                <SelectValue placeholder="Select your time zone" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {availableTimezones.map((tz: string) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.timeZone && (
              <p id="timezone-error" className="text-sm text-destructive" role="alert">
                {errors.timeZone}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Auto-selected based on your country. Adjust if needed.
            </p>
          </div>

          {/* Contact Preferences */}
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="preferredContactMethod">
                Preferred Contact Method <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Select 
                value={formData.preferredContactMethod} 
                onValueChange={(value) => handleInputChange('preferredContactMethod', value as 'Email' | 'WhatsApp' | 'Both' | '')}
              >
                <SelectTrigger id="preferredContactMethod">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Email">Email</SelectItem>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  <SelectItem value="Both">Both</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How would you prefer to be contacted?
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bestTimeToContact">
                Best Time to Contact <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Select 
                value={formData.bestTimeToContact} 
                onValueChange={(value) => handleInputChange('bestTimeToContact', value)}
              >
                <SelectTrigger id="bestTimeToContact">
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Flexible">Flexible</SelectItem>
                  <SelectItem value="Morning (your local time)">Morning</SelectItem>
                  <SelectItem value="Afternoon (your local time)">Afternoon</SelectItem>
                  <SelectItem value="Evening (your local time)">Evening</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                What time works best for you?
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferredContactDate">
                Preferred Contact Date <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Popover open={isPreferredDateOpen} onOpenChange={setIsPreferredDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="preferredContactDate"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.preferredContactDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.preferredContactDate ? (
                      formData.preferredContactDate
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={
                      formData.preferredContactDate
                        ? new Date(formData.preferredContactDate)
                        : undefined
                    }
                    onSelect={(date) => {
                      if (date) {
                        const googleFormsDate = format(date, "MM/dd/yyyy");
                        handleInputChange("preferredContactDate", googleFormsDate);
                        setIsPreferredDateOpen(false);
                      } else {
                        handleInputChange("preferredContactDate", "");
                      }
                    }}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const threeMonthsFromNow = new Date();
                      threeMonthsFromNow.setDate(threeMonthsFromNow.getDate() + 90);
                      threeMonthsFromNow.setHours(23, 59, 59, 999);
                      return date < today || date > threeMonthsFromNow;
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Select a date within the next 3 months
              </p>
            </div>
          </div>
        </div>
        {/* Project Details Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-primary/20">
            <Briefcase className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Project Details</h3>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Service Type(s) Needed <span className="text-destructive">*</span>
            </Label>
            <div ref={serviceTypeRef} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {serviceTypes.map((service) => (
                <div key={service} className="flex items-center space-x-2">
                  <Checkbox
                    id={`service-${service}`}
                    checked={formData.serviceType.includes(service)}
                    onCheckedChange={() => handleServiceTypeToggle(service)}
                    aria-invalid={!!errors.serviceType}
                  />
                  <Label
                    htmlFor={`service-${service}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {service}
                  </Label>
                </div>
              ))}
            </div>
            {errors.serviceType && (
              <p className="text-sm text-destructive" role="alert">
                {errors.serviceType}
              </p>
            )}
            
            {/* Show additional text input when "Other" is selected */}
            {formData.serviceType.includes('Other') && (
              <div className="pt-2">
                <Input
                  id="serviceTypeOther"
                  type="text"
                  value={formData.serviceTypeOther}
                  onChange={(e) => handleInputChange('serviceTypeOther', e.target.value)}
                  placeholder="Please specify the type of service you need"
                  className="text-sm"
                />
              </div>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company">
                Company / Organization <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => handleInputChange('company', e.target.value)}
                placeholder="Acme Corporation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectUrl">
                Project URL or Files <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="projectUrl"
                value={formData.projectUrlOrFiles}
                onChange={(e) => handleInputChange('projectUrlOrFiles', e.target.value)}
                placeholder="https://example.com or mention files"
              />
              <p className="text-xs text-muted-foreground">
                Share a URL or mention that you'll send files separately
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="projectSummary" className="flex items-center gap-1">
              Project Summary / Message <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="projectSummary"
              ref={projectSummaryRef}
              value={formData.projectSummary}
              onChange={(e) => handleInputChange('projectSummary', e.target.value)}
              placeholder="Please describe your security needs, challenges, or questions in detail..."
              className={`min-h-[150px] ${errors.projectSummary ? "border-destructive focus-visible:ring-destructive" : ""}`}
              aria-invalid={!!errors.projectSummary}
              aria-describedby={errors.projectSummary ? "projectSummary-error" : undefined}
            />
            {errors.projectSummary && (
              <p id="projectSummary-error" className="text-sm text-destructive" role="alert">
                {errors.projectSummary}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Minimum 30 characters. Be specific about your requirements.
            </p>
          </div>

          <div className="flex items-center space-x-3 p-4 border rounded-lg bg-muted/30">
            <Checkbox
              id="ndaConfidentiality"
              checked={!!formData.ndaConfidentiality}
              onCheckedChange={(checked) => 
                handleInputChange('ndaConfidentiality', checked ? 'Yes - NDA or strict confidentiality required' : '')
              }
              className="mt-0.5"
            />
            <Label
              htmlFor="ndaConfidentiality"
              className="text-sm font-normal cursor-pointer leading-normal"
            >
              This project may require an NDA or strict confidentiality agreement.
            </Label>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="urgency" className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Urgency <span className="text-destructive">*</span>
              </Label>
              <Select value={formData.urgency} onValueChange={(value) => handleInputChange('urgency', value)}>
                <SelectTrigger
                  id="urgency"
                  ref={urgencyRef}
                  className={errors.urgency ? "border-destructive focus:ring-destructive" : ""}
                  aria-invalid={!!errors.urgency}
                  aria-describedby={errors.urgency ? "urgency-error" : undefined}
                >
                  <SelectValue placeholder="Select urgency" />
                </SelectTrigger>
                <SelectContent>
                  {urgencyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.urgency && (
                <p id="urgency-error" className="text-sm text-destructive" role="alert">
                  {errors.urgency}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="budgetMin" className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                Budget Min (USD) <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="budgetMin"
                type="number"
                min="0"
                step="100"
                value={formData.budgetMin}
                onChange={(e) => handleInputChange('budgetMin', e.target.value)}
                placeholder="1000"
                aria-invalid={!!errors.budgetMin}
                aria-describedby={errors.budgetMin ? "budgetMin-error" : undefined}
                className={errors.budgetMin ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {errors.budgetMin && (
                <p id="budgetMin-error" className="text-sm text-destructive" role="alert">
                  {errors.budgetMin}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="budgetMax" className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                Budget Max (USD) <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="budgetMax"
                type="number"
                min="0"
                step="100"
                value={formData.budgetMax}
                onChange={(e) => handleInputChange('budgetMax', e.target.value)}
                placeholder="5000"
                aria-invalid={!!errors.budgetMax}
                aria-describedby={errors.budgetMax ? "budgetMax-error" : undefined}
                className={errors.budgetMax ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {errors.budgetMax && (
                <p id="budgetMax-error" className="text-sm text-destructive" role="alert">
                  {errors.budgetMax}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Additional Information Section */}
          <div className="flex items-center gap-2 pb-2 border-b border-primary/20">
            <Info className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Additional Information</h3>
          </div>

          <div className="space-y-2">
            <Label htmlFor="howDidYouFindMe">
              How did you find me? <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Select value={formData.howDidYouFindMe} onValueChange={(value) => {
              handleInputChange('howDidYouFindMe', value);
              // Clear the "Other" field if user changes selection away from "Other"
              if (value !== 'Other') {
                handleInputChange('howDidYouFindMeOther', '');
              }
              // Clear the "Referral" field if user changes selection away from "Referral"
              if (value !== 'Referral') {
                handleInputChange('howDidYouFindMeReferral', '');
              }
            }}>
              <SelectTrigger id="howDidYouFindMe">
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {referralSources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Show additional text input when "Referral" is selected */}
            {formData.howDidYouFindMe === 'Referral' && (
              <div className="pt-2">
                <Input
                  id="howDidYouFindMeReferral"
                  type="text"
                  value={formData.howDidYouFindMeReferral}
                  onChange={(e) => handleInputChange('howDidYouFindMeReferral', e.target.value)}
                  placeholder="Who referred you? (optional but appreciated)"
                  className="text-sm"
                />
              </div>
            )}
            
            {/* Show additional text input when "Other" is selected */}
            {formData.howDidYouFindMe === 'Other' && (
              <div className="pt-2">
                <Input
                  id="howDidYouFindMeOther"
                  type="text"
                  value={formData.howDidYouFindMeOther}
                  onChange={(e) => handleInputChange('howDidYouFindMeOther', e.target.value)}
                  placeholder="Please specify (e.g., Twitter, Conference, etc.)"
                  className="text-sm"
                />
              </div>
            )}
          </div>
        </div>

        {/* GDPR Consent */}
        <div className="flex items-start space-x-3 p-4 border-2 rounded-lg bg-muted/30">
          <Checkbox
            id="gdprConsent"
            ref={gdprConsentRef}
            checked={formData.gdprConsent}
            onCheckedChange={(checked) => handleInputChange('gdprConsent', !!checked)}
            aria-invalid={!!errors.gdprConsent}
            className={`mt-0.5 ${errors.gdprConsent ? "border-destructive" : ""}`}
          />
          <div className="space-y-1 flex-1">
            <Label
              htmlFor="gdprConsent"
              className="text-sm font-medium cursor-pointer leading-normal inline"
            >
              <span className="text-destructive">*</span>{" "}
              I agree that my data will be used to review and respond to my request, as described on the{" "}
              <Link href="/privacy" className="text-primary hover:underline" target="_blank">
                Data & Privacy page
              </Link>.
            </Label>
            {errors.gdprConsent && (
              <p className="text-xs text-destructive mt-2" role="alert">
                {errors.gdprConsent}
              </p>
            )}
          </div>
        </div>

        {/* Privacy Notice */}
        <Card className="bg-muted/50 border-primary/20">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Privacy & Data Usage:</span> We only use your details to respond to your inquiry and provide the services you request. 
              Your information is stored securely and never shared with third parties.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Note: Technical data (device type, browser info) is collected automatically for security and spam prevention purposes only.
            </p>
          </CardContent>
        </Card>

        {/* Submission Status Messages */}
        {submitSuccess && submittedTicketId && (
          <Card className="border-green-500 bg-green-500/10">
            <CardContent className="flex items-center gap-3 p-4">
              <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-500">Thank you! Your request has been received.</p>
                <p className="text-sm text-muted-foreground">
                  I'll review your inquiry and get back to you within 24 hours.
                </p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">
                    Your Ticket ID: <span className="font-mono font-bold text-green-600 dark:text-green-400">{submittedTicketId}</span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(submittedTicketId);
                      // Optional: Show a toast notification
                      const button = document.activeElement as HTMLButtonElement;
                      if (button) {
                        const originalText = button.innerHTML;
                        button.innerHTML = 'Copied!';
                        setTimeout(() => {
                          button.innerHTML = originalText;
                        }, 2000);
                      }
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    Copy
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {errors.submit && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-destructive">{errors.submit}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Please try again or contact us directly via WhatsApp or email.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Submit Button */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">
            <span className="text-destructive">*</span> Required fields
          </p>
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full sm:w-auto min-w-[200px] bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-5 w-5" />
                Send Request
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Validation Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent hideCloseButton className="w-[90vw] max-w-sm md:max-w-md my-6 rounded-2xl shadow-xl p-0 gap-0 animate-in fade-in-0 zoom-in-95 duration-150">
          <DialogHeader className="px-6 pt-5 pb-3 space-y-3">
            <DialogTitle className="text-base md:text-lg font-semibold flex items-center justify-center gap-2 leading-tight">
              <Info className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <span>Please complete the required fields</span>
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed text-center">
              Before sending your request, please fill in the following:
            </DialogDescription>
          </DialogHeader>
          
          <div className="px-6 pb-6">
            <ul className="space-y-1.5 mb-6 pl-2">
              {validationErrors.map((error, index) => (
                <li key={index} className="flex items-start gap-2.5 text-sm group">
                  <span className="flex-shrink-0 w-1 h-1 rounded-full bg-destructive mt-2" />
                  <span className="text-foreground leading-relaxed">{error}</span>
                </li>
              ))}
            </ul>
            
            <div className="mt-6 flex justify-center">
              <Button
                onClick={() => {
                  setShowValidationDialog(false);
                  // Scroll to first error after dialog closes
                  setTimeout(() => {
                    scrollToFirstError();
                  }, 100);
                }}
                className="w-full md:w-auto min-w-[140px] h-11 text-base font-medium bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-md"
              >
                Got it
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
