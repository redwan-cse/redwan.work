export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          client_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_hash: string | null
          metadata: Json
          order_id: string | null
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string
          client_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          order_id?: string | null
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          client_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          order_id?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_requests: {
        Row: {
          created_at: string
          id: string
          order_id: string
          reason: string
          requested_by: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          reason: string
          requested_by: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          reason?: string
          requested_by?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          company: string | null
          created_at: string
          email: string
          expires_at: string
          full_name: string | null
          id: string
          invited_by: string | null
          status: string
          tier: Database["public"]["Enums"]["client_tier"]
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          company?: string | null
          created_at?: string
          email: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          status?: string
          tier?: Database["public"]["Enums"]["client_tier"]
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          company?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          status?: string
          tier?: Database["public"]["Enums"]["client_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "client_invitations_accepted_user_id_fkey"
            columns: ["accepted_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          author_id: string
          body: string
          client_id: string
          created_at: string
          followup_date: string | null
          id: string
          is_pinned: boolean
          note_type: string
        }
        Insert: {
          author_id: string
          body: string
          client_id: string
          created_at?: string
          followup_date?: string | null
          id?: string
          is_pinned?: boolean
          note_type?: string
        }
        Update: {
          author_id?: string
          body?: string
          client_id?: string
          created_at?: string
          followup_date?: string | null
          id?: string
          is_pinned?: boolean
          note_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_profiles: {
        Row: {
          acquisition_source: string
          average_rating: number | null
          billing_address: Json
          company_name: string | null
          company_role: string | null
          completed_orders_count: number
          created_at: string
          industry: string | null
          lifetime_value_usd_cents: number
          next_followup_at: string | null
          preferred_currency: string
          relationship_summary: string | null
          tags: string[]
          tax_id: string | null
          tier: Database["public"]["Enums"]["client_tier"]
          total_orders_count: number
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          acquisition_source?: string
          average_rating?: number | null
          billing_address?: Json
          company_name?: string | null
          company_role?: string | null
          completed_orders_count?: number
          created_at?: string
          industry?: string | null
          lifetime_value_usd_cents?: number
          next_followup_at?: string | null
          preferred_currency?: string
          relationship_summary?: string | null
          tags?: string[]
          tax_id?: string | null
          tier?: Database["public"]["Enums"]["client_tier"]
          total_orders_count?: number
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          acquisition_source?: string
          average_rating?: number | null
          billing_address?: Json
          company_name?: string | null
          company_role?: string | null
          completed_orders_count?: number
          created_at?: string
          industry?: string | null
          lifetime_value_usd_cents?: number
          next_followup_at?: string | null
          preferred_currency?: string
          relationship_summary?: string | null
          tags?: string[]
          tax_id?: string | null
          tier?: Database["public"]["Enums"]["client_tier"]
          total_orders_count?: number
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_reviews: {
        Row: {
          client_id: string
          created_at: string
          headline: string | null
          id: string
          is_public_approved: boolean
          order_id: string
          rating_communication: number
          rating_overall: number
          rating_quality: number
          rating_timeliness: number
          review_text: string
        }
        Insert: {
          client_id: string
          created_at?: string
          headline?: string | null
          id?: string
          is_public_approved?: boolean
          order_id: string
          rating_communication?: number
          rating_overall: number
          rating_quality?: number
          rating_timeliness?: number
          review_text: string
        }
        Update: {
          client_id?: string
          created_at?: string
          headline?: string | null
          id?: string
          is_public_approved?: boolean
          order_id?: string
          rating_communication?: number
          rating_overall?: number
          rating_quality?: number
          rating_timeliness?: number
          review_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_policies: {
        Row: {
          canonical: string
          created_at: string
          hash: string
          is_active: boolean
          version: string
        }
        Insert: {
          canonical: string
          created_at?: string
          hash: string
          is_active?: boolean
          version: string
        }
        Update: {
          canonical?: string
          created_at?: string
          hash?: string
          is_active?: boolean
          version?: string
        }
        Relationships: []
      }
      credit_notes: {
        Row: {
          amount_cents: number
          client_id: string
          code: string | null
          created_at: string
          currency: string
          fx_rate_to_usd: number
          id: string
          invoice_id: string
          issued_by: string
          number: number
          reason: string
        }
        Insert: {
          amount_cents: number
          client_id: string
          code?: string | null
          created_at?: string
          currency?: string
          fx_rate_to_usd?: number
          id?: string
          invoice_id: string
          issued_by: string
          number?: number
          reason: string
        }
        Update: {
          amount_cents?: number
          client_id?: string
          code?: string | null
          created_at?: string
          currency?: string
          fx_rate_to_usd?: number
          id?: string
          invoice_id?: string
          issued_by?: string
          number?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          auto_accept_at: string | null
          client_feedback: string | null
          code: string | null
          id: string
          is_final_delivery: boolean
          milestone_id: string | null
          number: number
          order_id: string
          release_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["deliverable_status"]
          submitted_at: string
          submitted_by: string | null
          title: string
          version_label: string
        }
        Insert: {
          auto_accept_at?: string | null
          client_feedback?: string | null
          code?: string | null
          id?: string
          is_final_delivery?: boolean
          milestone_id?: string | null
          number?: number
          order_id: string
          release_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["deliverable_status"]
          submitted_at?: string
          submitted_by?: string | null
          title: string
          version_label?: string
        }
        Update: {
          auto_accept_at?: string | null
          client_feedback?: string | null
          code?: string | null
          id?: string
          is_final_delivery?: boolean
          milestone_id?: string | null
          number?: number
          order_id?: string
          release_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["deliverable_status"]
          submitted_at?: string
          submitted_by?: string | null
          title?: string
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "order_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          id: string
          resend_id: string | null
          status: string
          subject: string | null
          template: string
          to_email: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          resend_id?: string | null
          status: string
          subject?: string | null
          template: string
          to_email: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          resend_id?: string | null
          status?: string
          subject?: string | null
          template?: string
          to_email?: string
        }
        Relationships: []
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          last_error: string | null
          locked_at: string | null
          next_attempt_at: string
          payload: Json
          resend_id: string | null
          sent_at: string | null
          status: string
          subject: string
          template: string
          to_email: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          payload?: Json
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template: string
          to_email: string
        }
        Update: {
          attempts?: number
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          payload?: Json
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template?: string
          to_email?: string
        }
        Relationships: []
      }
      engagement_authorizations: {
        Row: {
          authorized_targets: string[]
          client_id: string
          emergency_contact_name: string
          emergency_contact_phone: string
          excluded_systems: string | null
          id: string
          order_id: string
          ownership_attested: boolean
          signed_at: string
          signer_full_name: string
          signer_ip_hash: string | null
          signer_title: string | null
          testing_window_end: string
          testing_window_start: string
        }
        Insert: {
          authorized_targets: string[]
          client_id: string
          emergency_contact_name: string
          emergency_contact_phone: string
          excluded_systems?: string | null
          id?: string
          order_id: string
          ownership_attested: boolean
          signed_at?: string
          signer_full_name: string
          signer_ip_hash?: string | null
          signer_title?: string | null
          testing_window_end: string
          testing_window_start: string
        }
        Update: {
          authorized_targets?: string[]
          client_id?: string
          emergency_contact_name?: string
          emergency_contact_phone?: string
          excluded_systems?: string | null
          id?: string
          order_id?: string
          ownership_attested?: boolean
          signed_at?: string
          signer_full_name?: string
          signer_ip_hash?: string | null
          signer_title?: string | null
          testing_window_end?: string
          testing_window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_authorizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_authorizations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          best_time_to_contact: string | null
          budget_max: number | null
          budget_min: number | null
          code: string | null
          company: string | null
          consent_at: string
          consent_capture_method: string | null
          consent_policy_hash: string | null
          consent_policy_version: string | null
          converted_client_id: string | null
          converted_order_id: string | null
          country: string | null
          created_at: string
          device_type: string | null
          email: string
          how_found: string | null
          id: string
          ip_hash: string | null
          is_custom_deal: boolean
          name: string
          nda_required: boolean
          preferred_contact_date: string | null
          preferred_contact_method: string | null
          project_summary: string
          project_url: string | null
          proposed_budget_cents: number | null
          proposed_delivery_days: number | null
          selected_package_tier: string | null
          selected_service_slug: string | null
          service_pillar: Database["public"]["Enums"]["service_pillar"]
          services: Json
          source_page: string | null
          status: Database["public"]["Enums"]["inquiry_status"]
          ticket_number: number
          timezone: string | null
          updated_at: string
          urgency: string | null
          user_agent: string | null
          whatsapp_e164: string | null
        }
        Insert: {
          best_time_to_contact?: string | null
          budget_max?: number | null
          budget_min?: number | null
          code?: string | null
          company?: string | null
          consent_at?: string
          consent_capture_method?: string | null
          consent_policy_hash?: string | null
          consent_policy_version?: string | null
          converted_client_id?: string | null
          converted_order_id?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          email: string
          how_found?: string | null
          id?: string
          ip_hash?: string | null
          is_custom_deal?: boolean
          name: string
          nda_required?: boolean
          preferred_contact_date?: string | null
          preferred_contact_method?: string | null
          project_summary: string
          project_url?: string | null
          proposed_budget_cents?: number | null
          proposed_delivery_days?: number | null
          selected_package_tier?: string | null
          selected_service_slug?: string | null
          service_pillar?: Database["public"]["Enums"]["service_pillar"]
          services?: Json
          source_page?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          ticket_number?: number
          timezone?: string | null
          updated_at?: string
          urgency?: string | null
          user_agent?: string | null
          whatsapp_e164?: string | null
        }
        Update: {
          best_time_to_contact?: string | null
          budget_max?: number | null
          budget_min?: number | null
          code?: string | null
          company?: string | null
          consent_at?: string
          consent_capture_method?: string | null
          consent_policy_hash?: string | null
          consent_policy_version?: string | null
          converted_client_id?: string | null
          converted_order_id?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          email?: string
          how_found?: string | null
          id?: string
          ip_hash?: string | null
          is_custom_deal?: boolean
          name?: string
          nda_required?: boolean
          preferred_contact_date?: string | null
          preferred_contact_method?: string | null
          project_summary?: string
          project_url?: string | null
          proposed_budget_cents?: number | null
          proposed_delivery_days?: number | null
          selected_package_tier?: string | null
          selected_service_slug?: string | null
          service_pillar?: Database["public"]["Enums"]["service_pillar"]
          services?: Json
          source_page?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          ticket_number?: number
          timezone?: string | null
          updated_at?: string
          urgency?: string | null
          user_agent?: string | null
          whatsapp_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_attachments: {
        Row: {
          created_at: string
          filename: string
          id: string
          inquiry_id: string
          mime: string
          r2_key: string
          retained: boolean
          size_bytes: number
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          inquiry_id: string
          mime: string
          r2_key: string
          retained?: boolean
          size_bytes: number
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          inquiry_id?: string
          mime?: string
          r2_key?: string
          retained?: boolean
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_attachments_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total_cents: number | null
          position: number
          qty: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total_cents?: number | null
          position?: number
          qty?: number
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total_cents?: number | null
          position?: number
          qty?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid_cents: number
          client_id: string
          code: string | null
          created_at: string
          credited_cents: number
          currency: string
          discount_cents: number
          due_at: string | null
          fx_rate_to_usd: number
          id: string
          immutable_snapshot: Json | null
          is_deposit_invoice: boolean
          issued_at: string | null
          milestone_id: string | null
          notes: string | null
          number: number
          order_id: string | null
          paid_at: string | null
          payment_instructions: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tax_cents: number
          tax_rate_bps: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          amount_paid_cents?: number
          client_id: string
          code?: string | null
          created_at?: string
          credited_cents?: number
          currency?: string
          discount_cents?: number
          due_at?: string | null
          fx_rate_to_usd?: number
          id?: string
          immutable_snapshot?: Json | null
          is_deposit_invoice?: boolean
          issued_at?: string | null
          milestone_id?: string | null
          notes?: string | null
          number?: number
          order_id?: string | null
          paid_at?: string | null
          payment_instructions?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bps?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          amount_paid_cents?: number
          client_id?: string
          code?: string | null
          created_at?: string
          credited_cents?: number
          currency?: string
          discount_cents?: number
          due_at?: string | null
          fx_rate_to_usd?: number
          id?: string
          immutable_snapshot?: Json | null
          is_deposit_invoice?: boolean
          issued_at?: string | null
          milestone_id?: string | null
          notes?: string | null
          number?: number
          order_id?: string | null
          paid_at?: string | null
          payment_instructions?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bps?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "order_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          category: string
          created_at: string
          href: string | null
          id: string
          is_read: boolean
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          href?: string | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          href?: string | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          attachment_file_ids: string[]
          author_id: string
          body: string
          created_at: string
          id: string
          is_internal_note: boolean
          order_id: string
        }
        Insert: {
          attachment_file_ids?: string[]
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          order_id: string
        }
        Update: {
          attachment_file_ids?: string[]
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_milestones: {
        Row: {
          amount_cents: number
          completed_at: string | null
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          id: string
          order_id: string
          position: number
          status: string
          title: string
          weight_percent: number
        }
        Insert: {
          amount_cents?: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          order_id: string
          position?: number
          status?: string
          title: string
          weight_percent?: number
        }
        Update: {
          amount_cents?: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          order_id?: string
          position?: number
          status?: string
          title?: string
          weight_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_milestones_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_requirements: {
        Row: {
          access_instructions: string | null
          client_id: string
          id: string
          order_id: string
          responses: Json
          submitted_at: string
          target_scope_notes: string | null
          updated_at: string
          verified_by_admin_at: string | null
        }
        Insert: {
          access_instructions?: string | null
          client_id: string
          id?: string
          order_id: string
          responses?: Json
          submitted_at?: string
          target_scope_notes?: string | null
          updated_at?: string
          verified_by_admin_at?: string | null
        }
        Update: {
          access_instructions?: string | null
          client_id?: string
          id?: string
          order_id?: string
          responses?: Json
          submitted_at?: string
          target_scope_notes?: string | null
          updated_at?: string
          verified_by_admin_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_requirements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_requirements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          is_client_visible: boolean
          is_completed: boolean
          milestone_id: string | null
          order_id: string
          position: number
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_client_visible?: boolean
          is_completed?: boolean
          milestone_id?: string | null
          order_id: string
          position?: number
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_client_visible?: boolean
          is_completed?: boolean
          milestone_id?: string | null
          order_id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "order_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          archived_at: string | null
          auto_accept_days: number
          client_id: string
          code: string | null
          completed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          deposit_percent: number
          description: string | null
          discount_cents: number
          due_at: string | null
          id: string
          inquiry_id: string | null
          is_custom_deal: boolean
          nda_accepted_at: string | null
          nda_required: boolean
          number: number
          package_id: string | null
          pillar: Database["public"]["Enums"]["service_pillar"]
          pricing_model: Database["public"]["Enums"]["pricing_model"]
          priority: Database["public"]["Enums"]["order_priority"]
          progress_percent: number
          proposal_id: string | null
          proposed_budget_cents: number | null
          proposed_delivery_days: number | null
          requires_roe: boolean
          revisions_included: number
          revisions_used: number
          roe_signed_at: string | null
          service_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          tax_cents: number
          title: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          auto_accept_days?: number
          client_id: string
          code?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          deposit_percent?: number
          description?: string | null
          discount_cents?: number
          due_at?: string | null
          id?: string
          inquiry_id?: string | null
          is_custom_deal?: boolean
          nda_accepted_at?: string | null
          nda_required?: boolean
          number?: number
          package_id?: string | null
          pillar?: Database["public"]["Enums"]["service_pillar"]
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
          priority?: Database["public"]["Enums"]["order_priority"]
          progress_percent?: number
          proposal_id?: string | null
          proposed_budget_cents?: number | null
          proposed_delivery_days?: number | null
          requires_roe?: boolean
          revisions_included?: number
          revisions_used?: number
          roe_signed_at?: string | null
          service_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tax_cents?: number
          title: string
          total_cents?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          auto_accept_days?: number
          client_id?: string
          code?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          deposit_percent?: number
          description?: string | null
          discount_cents?: number
          due_at?: string | null
          id?: string
          inquiry_id?: string | null
          is_custom_deal?: boolean
          nda_accepted_at?: string | null
          nda_required?: boolean
          number?: number
          package_id?: string | null
          pillar?: Database["public"]["Enums"]["service_pillar"]
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
          priority?: Database["public"]["Enums"]["order_priority"]
          progress_percent?: number
          proposal_id?: string | null
          proposed_budget_cents?: number | null
          proposed_delivery_days?: number | null
          requires_roe?: boolean
          revisions_included?: number
          revisions_used?: number
          roe_signed_at?: string | null
          service_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tax_cents?: number
          title?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          client_id: string
          code: string | null
          currency: string
          fx_rate_to_usd: number
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          number: number
          order_id: string | null
          proof_file_id: string | null
          reference: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["payment_status"]
          submitted_at: string
          usd_equivalent_cents: number | null
        }
        Insert: {
          amount_cents: number
          client_id: string
          code?: string | null
          currency?: string
          fx_rate_to_usd?: number
          id?: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          number?: number
          order_id?: string | null
          proof_file_id?: string | null
          reference: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_at?: string
          usd_equivalent_cents?: number | null
        }
        Update: {
          amount_cents?: number
          client_id?: string
          code?: string | null
          currency?: string
          fx_rate_to_usd?: number
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          number?: number
          order_id?: string | null
          proof_file_id?: string | null
          reference?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_at?: string
          usd_equivalent_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_proof_file_id_fkey"
            columns: ["proof_file_id"]
            isOneToOne: false
            referencedRelation: "vault_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          approach: string[]
          challenge: string
          client_sector: string
          code: string
          created_at: string
          external_url: string | null
          headline_metric: string
          id: string
          is_featured: boolean
          is_published: boolean
          outcomes: string[]
          pillar: Database["public"]["Enums"]["service_pillar"]
          pillar_label: string
          related_service_slug: string | null
          slug: string
          sort_order: number
          stack: string[]
          summary: string
          title: string
          updated_at: string
          year: string
        }
        Insert: {
          approach?: string[]
          challenge: string
          client_sector: string
          code: string
          created_at?: string
          external_url?: string | null
          headline_metric: string
          id?: string
          is_featured?: boolean
          is_published?: boolean
          outcomes?: string[]
          pillar?: Database["public"]["Enums"]["service_pillar"]
          pillar_label?: string
          related_service_slug?: string | null
          slug: string
          sort_order?: number
          stack?: string[]
          summary: string
          title: string
          updated_at?: string
          year?: string
        }
        Update: {
          approach?: string[]
          challenge?: string
          client_sector?: string
          code?: string
          created_at?: string
          external_url?: string | null
          headline_metric?: string
          id?: string
          is_featured?: boolean
          is_published?: boolean
          outcomes?: string[]
          pillar?: Database["public"]["Enums"]["service_pillar"]
          pillar_label?: string
          related_service_slug?: string | null
          slug?: string
          sort_order?: number
          stack?: string[]
          summary?: string
          title?: string
          updated_at?: string
          year?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          country: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          mfa_enforced: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          timezone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          last_seen_at?: string | null
          mfa_enforced?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          mfa_enforced?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      proposal_milestones: {
        Row: {
          amount_cents: number
          created_at: string
          description: string | null
          due_days_offset: number
          id: string
          position: number
          proposal_id: string
          title: string
          weight_percent: number
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description?: string | null
          due_days_offset?: number
          id?: string
          position?: number
          proposal_id: string
          title: string
          weight_percent?: number
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string | null
          due_days_offset?: number
          id?: string
          position?: number
          proposal_id?: string
          title?: string
          weight_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_milestones_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          accepted_at: string | null
          auto_accept_days: number
          client_id: string | null
          code: string | null
          created_at: string
          created_by: string | null
          currency: string
          decline_reason: string | null
          declined_at: string | null
          deliverables_summary: string
          deposit_percent: number
          discount_cents: number
          estimated_days: number
          id: string
          inquiry_id: string | null
          number: number
          pillar: Database["public"]["Enums"]["service_pillar"]
          pricing_model: Database["public"]["Enums"]["pricing_model"]
          recipient_email: string
          recipient_name: string
          requires_roe: boolean
          revisions_included: number
          scope_summary: string
          service_id: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          subtotal_cents: number
          tax_cents: number
          tax_rate_bps: number
          title: string
          total_cents: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          auto_accept_days?: number
          client_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          decline_reason?: string | null
          declined_at?: string | null
          deliverables_summary: string
          deposit_percent?: number
          discount_cents?: number
          estimated_days?: number
          id?: string
          inquiry_id?: string | null
          number?: number
          pillar?: Database["public"]["Enums"]["service_pillar"]
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
          recipient_email: string
          recipient_name: string
          requires_roe?: boolean
          revisions_included?: number
          scope_summary: string
          service_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          subtotal_cents: number
          tax_cents?: number
          tax_rate_bps?: number
          title: string
          total_cents: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          auto_accept_days?: number
          client_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          decline_reason?: string | null
          declined_at?: string | null
          deliverables_summary?: string
          deposit_percent?: number
          discount_cents?: number
          estimated_days?: number
          id?: string
          inquiry_id?: string | null
          number?: number
          pillar?: Database["public"]["Enums"]["service_pillar"]
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
          recipient_email?: string
          recipient_name?: string
          requires_roe?: boolean
          revisions_included?: number
          scope_summary?: string
          service_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bps?: number
          title?: string
          total_cents?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          id: string
          key_hash: string
          kind: string
          window_started_at: string
        }
        Insert: {
          count?: number
          id?: string
          key_hash: string
          kind: string
          window_started_at?: string
        }
        Update: {
          count?: number
          id?: string
          key_hash?: string
          kind?: string
          window_started_at?: string
        }
        Relationships: []
      }
      resume_items: {
        Row: {
          badge_label: string | null
          created_at: string
          description: string | null
          highlights: string[]
          id: string
          is_visible: boolean
          location: string | null
          organization: string
          period: string | null
          role_type: string | null
          section: string
          sort_order: number
          title: string
          updated_at: string
          verification_url: string | null
        }
        Insert: {
          badge_label?: string | null
          created_at?: string
          description?: string | null
          highlights?: string[]
          id?: string
          is_visible?: boolean
          location?: string | null
          organization?: string
          period?: string | null
          role_type?: string | null
          section: string
          sort_order?: number
          title: string
          updated_at?: string
          verification_url?: string | null
        }
        Update: {
          badge_label?: string | null
          created_at?: string
          description?: string | null
          highlights?: string[]
          id?: string
          is_visible?: boolean
          location?: string | null
          organization?: string
          period?: string | null
          role_type?: string | null
          section?: string
          sort_order?: number
          title?: string
          updated_at?: string
          verification_url?: string | null
        }
        Relationships: []
      }
      retainer_plans: {
        Row: {
          billing_cycle: string
          client_id: string
          created_at: string
          currency: string
          current_period_end: string
          current_period_start: string
          hours_per_month: number
          hours_used_current_period: number
          id: string
          monthly_fee_cents: number
          next_invoice_date: string
          notes: string | null
          pillar: Database["public"]["Enums"]["service_pillar"]
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          client_id: string
          created_at?: string
          currency?: string
          current_period_end?: string
          current_period_start?: string
          hours_per_month?: number
          hours_used_current_period?: number
          id?: string
          monthly_fee_cents: number
          next_invoice_date?: string
          notes?: string | null
          pillar?: Database["public"]["Enums"]["service_pillar"]
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          client_id?: string
          created_at?: string
          currency?: string
          current_period_end?: string
          current_period_start?: string
          hours_per_month?: number
          hours_used_current_period?: number
          id?: string
          monthly_fee_cents?: number
          next_invoice_date?: string
          notes?: string | null
          pillar?: Database["public"]["Enums"]["service_pillar"]
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retainer_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_packages: {
        Row: {
          auto_accept_days: number
          created_at: string
          currency: string
          delivery_days: number
          deposit_percent: number
          features: Json
          id: string
          intake_questions: Json
          is_active: boolean
          is_popular: boolean
          is_starting_price: boolean
          package_name: string
          price_cents: number
          revisions_included: number
          service_id: string
          sort_order: number
          summary: string
          tier_name: string
        }
        Insert: {
          auto_accept_days?: number
          created_at?: string
          currency?: string
          delivery_days?: number
          deposit_percent?: number
          features?: Json
          id?: string
          intake_questions?: Json
          is_active?: boolean
          is_popular?: boolean
          is_starting_price?: boolean
          package_name?: string
          price_cents?: number
          revisions_included?: number
          service_id: string
          sort_order?: number
          summary: string
          tier_name: string
        }
        Update: {
          auto_accept_days?: number
          created_at?: string
          currency?: string
          delivery_days?: number
          deposit_percent?: number
          features?: Json
          id?: string
          intake_questions?: Json
          is_active?: boolean
          is_popular?: boolean
          is_starting_price?: boolean
          package_name?: string
          price_cents?: number
          revisions_included?: number
          service_id?: string
          sort_order?: number
          summary?: string
          tier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_packages_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          delivery_days_max: number
          delivery_days_min: number
          description: string
          highlights: string[]
          icon_name: string
          id: string
          is_featured: boolean
          is_public: boolean
          pillar: Database["public"]["Enums"]["service_pillar"]
          requires_roe: boolean
          slug: string
          sort_order: number
          starting_price_cents: number
          tagline: string
          title: string
          tools_tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_days_max?: number
          delivery_days_min?: number
          description: string
          highlights?: string[]
          icon_name?: string
          id?: string
          is_featured?: boolean
          is_public?: boolean
          pillar: Database["public"]["Enums"]["service_pillar"]
          requires_roe?: boolean
          slug: string
          sort_order?: number
          starting_price_cents?: number
          tagline: string
          title: string
          tools_tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_days_max?: number
          delivery_days_min?: number
          description?: string
          highlights?: string[]
          icon_name?: string
          id?: string
          is_featured?: boolean
          is_public?: boolean
          pillar?: Database["public"]["Enums"]["service_pillar"]
          requires_roe?: boolean
          slug?: string
          sort_order?: number
          starting_price_cents?: number
          tagline?: string
          title?: string
          tools_tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          cal_com_url: string
          company_name: string
          company_url: string
          credentials: Json
          email: string
          executive_summary: string
          full_name: string
          github_url: string
          hobbies: Json
          id: string
          linkedin_url: string
          location: string
          other_skills: string[]
          phone: string
          references_list: Json
          research_interests: string[]
          resume_pdf_url: string
          role_title: string
          short_role: string
          soft_skills: string[]
          subtitle: string
          tagline: string
          technical_skills: Json
          updated_at: string
          website_url: string
          whatsapp_number: string
        }
        Insert: {
          cal_com_url?: string
          company_name?: string
          company_url?: string
          credentials?: Json
          email?: string
          executive_summary?: string
          full_name?: string
          github_url?: string
          hobbies?: Json
          id?: string
          linkedin_url?: string
          location?: string
          other_skills?: string[]
          phone?: string
          references_list?: Json
          research_interests?: string[]
          resume_pdf_url?: string
          role_title?: string
          short_role?: string
          soft_skills?: string[]
          subtitle?: string
          tagline?: string
          technical_skills?: Json
          updated_at?: string
          website_url?: string
          whatsapp_number?: string
        }
        Update: {
          cal_com_url?: string
          company_name?: string
          company_url?: string
          credentials?: Json
          email?: string
          executive_summary?: string
          full_name?: string
          github_url?: string
          hobbies?: Json
          id?: string
          linkedin_url?: string
          location?: string
          other_skills?: string[]
          phone?: string
          references_list?: Json
          research_interests?: string[]
          resume_pdf_url?: string
          role_title?: string
          short_role?: string
          soft_skills?: string[]
          subtitle?: string
          tagline?: string
          technical_skills?: Json
          updated_at?: string
          website_url?: string
          whatsapp_number?: string
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          attachment_file_ids: string[]
          author_id: string
          body: string
          created_at: string
          id: string
          is_internal_note: boolean
          ticket_id: string
        }
        Insert: {
          attachment_file_ids?: string[]
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          ticket_id: string
        }
        Update: {
          attachment_file_ids?: string[]
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          category: Database["public"]["Enums"]["ticket_category"]
          client_id: string
          code: string | null
          created_at: string
          first_responded_at: string | null
          id: string
          last_message_at: string
          number: number
          order_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolved_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["ticket_category"]
          client_id: string
          code?: string | null
          created_at?: string
          first_responded_at?: string | null
          id?: string
          last_message_at?: string
          number?: number
          order_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["ticket_category"]
          client_id?: string
          code?: string | null
          created_at?: string
          first_responded_at?: string | null
          id?: string
          last_message_at?: string
          number?: number
          order_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_files: {
        Row: {
          archived_at: string | null
          bucket: string
          category: string
          created_at: string
          deliverable_id: string | null
          download_count: number
          filename: string
          id: string
          invoice_id: string | null
          last_downloaded_at: string | null
          mime_type: string
          order_id: string | null
          owner_client_id: string | null
          r2_key: string
          retention_until: string | null
          sha256_checksum: string | null
          size_bytes: number
          ticket_id: string | null
          uploaded_by: string
        }
        Insert: {
          archived_at?: string | null
          bucket?: string
          category?: string
          created_at?: string
          deliverable_id?: string | null
          download_count?: number
          filename: string
          id?: string
          invoice_id?: string | null
          last_downloaded_at?: string | null
          mime_type: string
          order_id?: string | null
          owner_client_id?: string | null
          r2_key: string
          retention_until?: string | null
          sha256_checksum?: string | null
          size_bytes: number
          ticket_id?: string | null
          uploaded_by: string
        }
        Update: {
          archived_at?: string | null
          bucket?: string
          category?: string
          created_at?: string
          deliverable_id?: string | null
          download_count?: number
          filename?: string
          id?: string
          invoice_id?: string | null
          last_downloaded_at?: string | null
          mime_type?: string
          order_id?: string | null
          owner_client_id?: string | null
          r2_key?: string
          retention_until?: string | null
          sha256_checksum?: string | null
          size_bytes?: number
          ticket_id?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_files_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_files_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_files_owner_client_id_fkey"
            columns: ["owner_client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_proposal_and_create_order: {
        Args: { p_actor_id: string; p_proposal_id: string }
        Returns: Json
      }
      admin_command_center_metrics: { Args: never; Returns: Json }
      caller_account_state: { Args: never; Returns: string }
      claim_pending_email_outbox: {
        Args: { p_limit?: number; p_stale_seconds?: number }
        Returns: Database["public"]["Tables"]["email_outbox"]["Row"][]
      }
      client_portal_overview: { Args: { p_client_id: string }; Returns: Json }
      consume_rate_limit: {
        Args: {
          p_key_hash: string
          p_kind: string
          p_max_count: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      contact_consent_control: {
        Args: { p_displayed_version?: string }
        Returns: Json
      }
      create_admin_order_atomic: {
        Args: {
          p_admin_id: string
          p_client_id: string
          p_deposit_percent: number
          p_description?: string | null
          p_due_days: number
          p_pillar: Database["public"]["Enums"]["service_pillar"]
          p_requires_roe: boolean
          p_title: string
          p_total_cents: number
        }
        Returns: Json
      }
      create_package_order_atomic: {
        Args: {
          p_client_id: string
          p_delivery_days: number
          p_deposit_item_label: string
          p_deposit_percent: number
          p_description: string
          p_initial_message: string
          p_is_custom_deal: boolean
          p_milestone_titles: string[]
          p_pillar: Database["public"]["Enums"]["service_pillar"]
          p_requirements_responses: Json
          p_requires_roe: boolean
          p_revisions_included: number
          p_service_id?: string | null
          p_target_scope_notes: string
          p_title: string
          p_total_cents: number
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      increment_vault_file_download: {
        Args: { p_file_id: string }
        Returns: undefined
      }
      issue_invoice_atomic: {
        Args: {
          p_client_id: string
          p_currency: string
          p_discount_cents: number
          p_due_days: number
          p_fx_rate_to_usd: number
          p_is_deposit: boolean
          p_item_description: string
          p_notes?: string | null
          p_order_id?: string | null
          p_subtotal_cents: number
          p_tax_rate_bps: number
        }
        Returns: Json
      }
      review_invoice_payment: {
        Args: {
          p_admin_id: string
          p_decision: string
          p_fx_rate?: number
          p_payment_id: string
          p_reason?: string
        }
        Returns: Json
      }
      review_order_deliverable: {
        Args: {
          p_actor_id: string
          p_decision: string
          p_deliverable_id: string
          p_feedback?: string
        }
        Returns: Json
      }
      run_auto_accept_deliverables: { Args: never; Returns: number }
    }
    Enums: {
      client_tier: "standard" | "vip" | "retainer" | "enterprise"
      deliverable_status: "submitted" | "accepted" | "revision_requested"
      inquiry_status:
        | "new"
        | "reviewing"
        | "proposal_sent"
        | "converted"
        | "archived"
      invoice_status:
        | "draft"
        | "issued"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "void"
      order_priority: "standard" | "priority" | "urgent_24h"
      order_status:
        | "awaiting_payment"
        | "pending_requirements"
        | "queued"
        | "in_progress"
        | "in_review"
        | "delivered"
        | "revision_requested"
        | "completed"
        | "on_hold"
        | "cancelled"
      payment_method:
        | "bank_transfer"
        | "bkash"
        | "nagad"
        | "wise"
        | "payoneer"
        | "paypal"
        | "manual"
      payment_status: "submitted" | "confirmed" | "rejected"
      pricing_model:
        | "fixed_package"
        | "custom_milestone"
        | "hourly"
        | "retainer"
      proposal_status:
        | "draft"
        | "sent"
        | "viewed"
        | "accepted"
        | "declined"
        | "expired"
      service_pillar:
        | "cybersecurity"
        | "development"
        | "cloud_devops"
        | "ai_ml"
        | "tech_support"
      ticket_category:
        | "technical_support"
        | "security_incident"
        | "order_question"
        | "billing"
        | "retainer_request"
        | "general"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status:
        | "open"
        | "in_progress"
        | "answered"
        | "awaiting_client"
        | "resolved"
        | "closed"
      user_role: "admin" | "client"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      client_tier: ["standard", "vip", "retainer", "enterprise"],
      deliverable_status: ["submitted", "accepted", "revision_requested"],
      inquiry_status: [
        "new",
        "reviewing",
        "proposal_sent",
        "converted",
        "archived",
      ],
      invoice_status: [
        "draft",
        "issued",
        "partially_paid",
        "paid",
        "overdue",
        "void",
      ],
      order_priority: ["standard", "priority", "urgent_24h"],
      order_status: [
        "awaiting_payment",
        "pending_requirements",
        "queued",
        "in_progress",
        "in_review",
        "delivered",
        "revision_requested",
        "completed",
        "on_hold",
        "cancelled",
      ],
      payment_method: [
        "bank_transfer",
        "bkash",
        "nagad",
        "wise",
        "payoneer",
        "paypal",
        "manual",
      ],
      payment_status: ["submitted", "confirmed", "rejected"],
      pricing_model: [
        "fixed_package",
        "custom_milestone",
        "hourly",
        "retainer",
      ],
      proposal_status: [
        "draft",
        "sent",
        "viewed",
        "accepted",
        "declined",
        "expired",
      ],
      service_pillar: [
        "cybersecurity",
        "development",
        "cloud_devops",
        "ai_ml",
        "tech_support",
      ],
      ticket_category: [
        "technical_support",
        "security_incident",
        "order_question",
        "billing",
        "retainer_request",
        "general",
      ],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: [
        "open",
        "in_progress",
        "answered",
        "awaiting_client",
        "resolved",
        "closed",
      ],
      user_role: ["admin", "client"],
    },
  },
} as const

