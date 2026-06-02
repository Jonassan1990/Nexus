-- PostgreSQL/Aurora-compatible baseline schema for NEXUS Portal.
-- Use UUID generation through pgcrypto in local PostgreSQL.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE prus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ticket_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    default_workflow_template_id UUID,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    escalation_policy_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name, version)
);

ALTER TABLE ticket_types
    ADD CONSTRAINT fk_ticket_types_workflow
    FOREIGN KEY (default_workflow_template_id)
    REFERENCES workflow_templates(id);

CREATE TABLE workflow_template_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    step_key TEXT NOT NULL,
    label TEXT NOT NULL,
    owner_role_id UUID NOT NULL REFERENCES roles(id),
    sort_order INTEGER NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT true,
    parallel_group TEXT,
    sla_hours INTEGER NOT NULL,
    allow_delegation BOOLEAN NOT NULL DEFAULT false,
    allow_clarification BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (workflow_template_id, step_key)
);

CREATE TABLE sla_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    priority TEXT NOT NULL,
    response_hours INTEGER NOT NULL,
    resolution_hours INTEGER NOT NULL,
    escalation_matrix_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    state TEXT NOT NULL,
    pru_id UUID REFERENCES prus(id),
    site_id UUID REFERENCES sites(id),
    product_id UUID REFERENCES products(id),
    module_name TEXT NOT NULL,
    priority TEXT NOT NULL,
    risk TEXT NOT NULL,
    sla_policy_id UUID REFERENCES sla_policies(id),
    sla_due_at TIMESTAMPTZ,
    description TEXT NOT NULL,
    dynamic_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    related_jira_key TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_state ON tickets(state);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_product ON tickets(product_id);
CREATE INDEX idx_tickets_sla_due_at ON tickets(sla_due_at);
CREATE INDEX idx_tickets_dynamic_fields_gin ON tickets USING GIN(dynamic_fields);

CREATE TABLE ticket_workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    template_step_id UUID REFERENCES workflow_template_steps(id),
    label TEXT NOT NULL,
    owner_role_id UUID NOT NULL REFERENCES roles(id),
    owner_subject TEXT,
    status TEXT NOT NULL,
    sla_state TEXT NOT NULL,
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    delegated_to_subject TEXT,
    parallel_group TEXT,
    sort_order INTEGER NOT NULL
);

CREATE INDEX idx_ticket_workflow_steps_ticket ON ticket_workflow_steps(ticket_id, sort_order);
CREATE INDEX idx_ticket_workflow_steps_status ON ticket_workflow_steps(status);

CREATE TABLE ticket_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role_label TEXT NOT NULL,
    access_level TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    granted_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_participants_ticket ON ticket_participants(ticket_id);
CREATE INDEX idx_ticket_participants_expiry ON ticket_participants(expires_at);

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_subject TEXT NOT NULL,
    author_display_name TEXT NOT NULL,
    body TEXT NOT NULL,
    visibility TEXT NOT NULL,
    source TEXT NOT NULL,
    jira_comment_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_ticket_created ON comments(ticket_id, created_at DESC);
CREATE INDEX idx_comments_visibility ON comments(visibility);

CREATE TABLE clarification_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    level_label TEXT NOT NULL,
    question TEXT NOT NULL,
    status TEXT NOT NULL,
    requested_by_subject TEXT NOT NULL,
    assigned_to_subject TEXT NOT NULL,
    due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clarification_threads_ticket ON clarification_threads(ticket_id);
CREATE INDEX idx_clarification_threads_status ON clarification_threads(status);

CREATE TABLE clarification_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clarification_thread_id UUID NOT NULL REFERENCES clarification_threads(id) ON DELETE CASCADE,
    author_subject TEXT NOT NULL,
    author_display_name TEXT NOT NULL,
    body TEXT NOT NULL,
    visibility TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clarification_messages_thread ON clarification_messages(clarification_thread_id, created_at);

CREATE TABLE escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    escalation_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    reason TEXT NOT NULL,
    impact TEXT NOT NULL,
    urgency TEXT NOT NULL,
    requested_action TEXT NOT NULL,
    mitigation_plan TEXT NOT NULL,
    decision_maker_subject TEXT NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_escalations_ticket ON escalations(ticket_id);
CREATE INDEX idx_escalations_status_due ON escalations(status, due_at);

CREATE TABLE jira_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    project_key TEXT NOT NULL,
    board_name TEXT,
    sprint_name TEXT,
    backlog_name TEXT,
    fix_version TEXT,
    components TEXT[] NOT NULL DEFAULT '{}',
    labels TEXT[] NOT NULL DEFAULT '{}',
    priority TEXT,
    estimate_hours NUMERIC(10, 2),
    story_points NUMERIC(10, 2),
    description TEXT,
    acceptance_criteria TEXT,
    assignee_subject TEXT,
    linked_epic_key TEXT,
    status TEXT NOT NULL,
    jira_issue_key TEXT,
    metadata_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jira_drafts_status ON jira_drafts(status);
CREATE INDEX idx_jira_drafts_issue_key ON jira_drafts(jira_issue_key);

CREATE TABLE attachment_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size BIGINT NOT NULL,
    checksum_sha256 TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    relation_id UUID,
    storage_provider TEXT NOT NULL DEFAULT 'local',
    bucket_name TEXT,
    object_key TEXT,
    local_path TEXT,
    preview_available BOOLEAN NOT NULL DEFAULT false,
    uploaded_by TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachment_objects_ticket ON attachment_objects(ticket_id);
CREATE INDEX idx_attachment_objects_relation ON attachment_objects(relation_type, relation_id);
CREATE INDEX idx_attachment_objects_storage ON attachment_objects(storage_provider, bucket_name);

CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    actor_subject TEXT NOT NULL,
    visibility TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    correlation_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_events_ticket_created ON audit_events(ticket_id, created_at DESC);
CREATE INDEX idx_audit_events_correlation ON audit_events(correlation_id);
CREATE INDEX idx_audit_events_visibility ON audit_events(visibility);

CREATE TABLE notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    recipient_subject TEXT NOT NULL,
    channel TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    action_url TEXT,
    visibility TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_notification_events_recipient ON notification_events(recipient_subject, created_at DESC);
CREATE INDEX idx_notification_events_status ON notification_events(delivery_status);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_events_status_available ON outbox_events(status, available_at);
