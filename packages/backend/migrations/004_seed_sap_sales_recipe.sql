-- =============================================================================
-- CAP Migration 004 — Seed: SAP Sales Process module
-- Run order: after 003
-- Description: Inserts a complete instructional recipe and module config for
--   the SAP Sales Process module. This is the Phase 1 pilot module.
--
-- What this creates:
--   1. A recipe record with the full SAP Sales Process content
--   2. A module_config record linking the recipe to the module
--   3. An IRB config record (approved = FALSE — research data off by default)
--   4. A default admin user for initial setup (password must be changed)
--
-- Content model: module → steps → content blocks.
-- Block types:   rich_text | guided_tool | knowledge_check | checklist.
-- Guided-tool instructions use {key} placeholders bound per-student from the
-- module parameter table (one row per pooled SAP account).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Insert the SAP Sales Process recipe
-- ---------------------------------------------------------------------------
WITH inserted_recipe AS (
    INSERT INTO public.recipes (
        module_id,
        version,
        module_title,
        is_active,
        recipe_data
    ) VALUES (
        'sap-sales-process',
        1,
        'The Sales Process',
        TRUE,
        jsonb_build_object(
            -- ── Module identity ──────────────────────────────────────────────
            'moduleId',          'sap-sales-process',
            'moduleTitle',       'The Sales Process',
            'moduleDescription', 'Students learn the fundamental documents in the SAP sales cycle — Inquiry, Quotation, and Sales Order — and practice creating each one in a sandboxed SAP environment. The module emphasizes understanding the business purpose of each document, not just the system steps.',

            -- ── Learning outcomes ─────────────────────────────────────────────
            'learningOutcomes', jsonb_build_array(
                'Explain what an Inquiry is and why a customer submits one instead of placing an order directly.',
                'Describe how a Quotation differs from an Inquiry and what it commits the selling company to.',
                'Explain what triggers the creation of a Sales Order and what it legally represents.',
                'Articulate how the three documents connect as a sequence in the sales cycle.',
                'Identify at least two transferable professional skills practiced during this activity.'
            ),

            -- ── Key concepts ─────────────────────────────────────────────────
            'keyConcepts', jsonb_build_array(
                jsonb_build_object('term', 'Inquiry (VA11)',        'definition', 'A non-binding request from a customer asking a company to propose pricing and availability for goods or services. It initiates the sales cycle without any commitment from either party.'),
                jsonb_build_object('term', 'Quotation (VA21)',      'definition', 'A binding offer from the selling company to the customer specifying price, quantity, and delivery terms, valid for a defined period. The company is committed to the terms if the customer accepts.'),
                jsonb_build_object('term', 'Sales Order (VA01)',    'definition', 'A confirmed agreement to sell specific goods or services to a customer at an agreed price. It triggers downstream processes including delivery and billing.'),
                jsonb_build_object('term', 'Sales cycle',           'definition', 'The end-to-end process from initial customer interest through to fulfilled sale. In SAP SD, the cycle is typically: Inquiry → Quotation → Sales Order → Delivery → Billing.'),
                jsonb_build_object('term', 'Document flow',         'definition', 'The chain of linked SAP documents created during the sales cycle. Each subsequent document references its predecessor, creating a traceable audit trail.'),
                jsonb_build_object('term', 'SAP SD (Sales & Distribution)', 'definition', 'The SAP ERP module that manages the sales cycle, from customer inquiries through delivery and invoicing.')
            ),

            -- ── Per-student parameters ───────────────────────────────────────
            -- Keys used as {key} placeholders in guided-tool instructions.
            -- Values come from the parameter table row for the student's
            -- assigned SAP pool account — different-but-known task data.
            'parameters', jsonb_build_array(
                jsonb_build_object('key', 'customer',     'label', 'Customer number'),
                jsonb_build_object('key', 'material',     'label', 'Material number'),
                jsonb_build_object('key', 'orderQty',     'label', 'Order quantity'),
                jsonb_build_object('key', 'discountRate', 'label', 'Discount rate')
            ),

            -- ── Module steps ─────────────────────────────────────────────────
            -- Step 1: conceptual background (rich text + knowledge check).
            -- Steps 2–4: one step per SAP document — a guided_tool block carries
            -- the parameterized instructions, per-instruction branches, and the
            -- app frame; a checklist closes each step.
            'steps', jsonb_build_array(

                -- Step 1: Introduction
                jsonb_build_object(
                    'stepId',      'st-introduction',
                    'stepNumber',  1,
                    'title',       'Introduction',
                    'description', 'Read the background on why a sale uses three linked documents, and get oriented in SAP.',
                    'outcomeTagIndices', jsonb_build_array(3),
                    'understandingNote', 'Student should grasp the inquiry → quotation → order chain and the document flow that links them, before touching the system.',
                    'blocks', jsonb_build_array(
                        jsonb_build_object(
                            'blockId', 'blk-cycle-overview',
                            'type',    'rich_text',
                            'title',   'The sales cycle: why three documents?',
                            'body',    '<p>In real business, a customer rarely places an order out of nowhere. They first ask "can you supply this, and at what price?" — that is an <strong>Inquiry</strong>. The supplier responds with a formal <strong>Quotation</strong> committing to specific terms. Only when the customer accepts does a <strong>Sales Order</strong> get created, triggering the actual work of fulfilling the sale.</p><p>This three-step process protects both parties:</p><ul><li>The customer can shop around without committing</li><li>The supplier can check inventory and capacity before committing to a price</li><li>The Sales Order creates a legal and operational commitment on both sides</li></ul><p>In SAP, each step creates a distinct document with its own number, and each subsequent document <em>references</em> the one before it — this creates the <strong>document flow</strong>, which gives managers and auditors a traceable record of every sale.</p>'
                        ),
                        jsonb_build_object(
                            'blockId', 'blk-sap-navigation',
                            'type',    'rich_text',
                            'title',   'Navigating SAP for this activity',
                            'body',    '<p>You will use transaction codes (T-codes) to complete this activity:</p><ul><li><strong>VA11</strong> — Create Inquiry</li><li><strong>VA21</strong> — Create Quotation (with reference to your Inquiry)</li><li><strong>VA01</strong> — Create Sales Order (with reference to your Quotation)</li></ul><p>A key skill in SAP is creating documents <em>with reference</em> to a previous document — SAP copies the relevant data automatically, preventing entry errors and maintaining the document flow.</p><p>Your assigned values (customer, material, quantity, discount) appear inline in the instructions for each step.</p>'
                        ),
                        jsonb_build_object(
                            'blockId', 'blk-orient-check',
                            'type',    'knowledge_check',
                            'title',   'Quick self-check',
                            'questions', jsonb_build_array(
                                jsonb_build_object(
                                    'questionId', 'kc-1', 'type', 'multiple_choice',
                                    'prompt', 'Which document commits the selling company to a price?',
                                    'options', jsonb_build_array('Inquiry', 'Quotation', 'Sales Order'),
                                    'correctAnswer', 'Quotation',
                                    'feedback', 'The Quotation is the binding offer — the Inquiry carries no commitment, and the Sales Order comes later.'
                                ),
                                jsonb_build_object(
                                    'questionId', 'kc-2', 'type', 'true_false',
                                    'prompt', 'Creating a document "with reference" means re-typing the customer data into a new form.',
                                    'correctAnswer', 'false',
                                    'feedback', 'Creating with reference copies data forward automatically and links the documents in the flow — nothing is re-keyed.'
                                )
                            )
                        )
                    )
                ),

                -- Step 2: Inquiry (VA11)
                jsonb_build_object(
                    'stepId',      'st-inquiry',
                    'stepNumber',  2,
                    'title',       'Inquiry',
                    'description', 'Log into the SAP sandbox and create an Inquiry for your assigned customer, material, and quantity. Save and note the Inquiry number.',
                    'outcomeTagIndices', jsonb_build_array(0, 3),
                    'understandingNote', 'Student should understand: VA11 captures initial customer interest with no commitment from either party; the organizational fields route the inquiry to the right sales area; the validity period is a window of interest; saving creates the first document in the flow.',
                    'blocks', jsonb_build_array(
                        jsonb_build_object(
                            'blockId', 'blk-inquiry-tool',
                            'type',    'guided_tool',
                            'title',   'Create your Inquiry in SAP (VA11)',
                            'tool',    'sap',
                            'layout',  'side_by_side',
                            'isGate',  TRUE,
                            'instructions', jsonb_build_array(
                                jsonb_build_object(
                                    'instructionId', 'gi-1',
                                    'text', 'Log into your assigned SAP sandbox account and open transaction VA11 (Create Inquiry).',
                                    'branches', jsonb_build_array(
                                        jsonb_build_object(
                                            'branchId', 'gb-1', 'condition', 'If you cannot find where to enter the T-code',
                                            'text', 'The command field is the small box at the top-left of the SAP window. Type VA11 and press Enter — do not navigate the menu tree.'
                                        )
                                    )
                                ),
                                jsonb_build_object(
                                    'instructionId', 'gi-2',
                                    'text', 'Enter Order Type "IN", Sales Organization "1000", Distribution Channel "10", Division "00" — then press Enter.',
                                    'branches', jsonb_build_array(
                                        jsonb_build_object(
                                            'branchId', 'gb-1', 'condition', 'If a field is rejected',
                                            'text', 'Check the org data exactly: sales org 1000, channel 10, division 00 — typos here are the most common cause.'
                                        )
                                    )
                                ),
                                jsonb_build_object(
                                    'instructionId', 'gi-3',
                                    'text', 'Enter customer {customer} as the Sold-to party, add a PO reference (e.g. your initials + today''s date), and set validity dates (today → +30 days).'
                                ),
                                jsonb_build_object(
                                    'instructionId', 'gi-4',
                                    'text', 'Add material {material} with quantity {orderQty} and press Enter so SAP validates the line item.',
                                    'branches', jsonb_build_array(
                                        jsonb_build_object(
                                            'branchId', 'gb-1', 'condition', 'If the material is not found',
                                            'text', 'Re-check the material number — it must be {material} exactly. SAP validates against pre-loaded master data.'
                                        )
                                    )
                                ),
                                jsonb_build_object(
                                    'instructionId', 'gi-5',
                                    'text', 'Save (Ctrl+S) and write down the Inquiry number — you will need it for the Quotation.'
                                )
                            )
                        ),
                        jsonb_build_object(
                            'blockId', 'blk-inquiry-checklist',
                            'type',    'checklist',
                            'title',   'Before you continue',
                            'items',   jsonb_build_array(
                                jsonb_build_object('itemId', 'i1', 'label', 'I saved the Inquiry in SAP.'),
                                jsonb_build_object('itemId', 'i2', 'label', 'I wrote down my Inquiry number — I will need it for the Quotation.')
                            )
                        )
                    )
                ),

                -- Step 3: Quotation (VA21)
                jsonb_build_object(
                    'stepId',      'st-quotation',
                    'stepNumber',  3,
                    'title',       'Quotation',
                    'description', 'Create a Quotation with reference to your Inquiry, review the copied data and pricing, apply your assigned discount, save, and note the Quotation number.',
                    'outcomeTagIndices', jsonb_build_array(1, 3),
                    'understandingNote', 'Student should understand: VA21 is the company making a formal commitment in response to the inquiry; creating with reference links the documents and copies data forward; the validity period is a price-commitment window; pricing is determined by condition records, not typed manually.',
                    'blocks', jsonb_build_array(
                        jsonb_build_object(
                            'blockId', 'blk-quotation-tool',
                            'type',    'guided_tool',
                            'title',   'Create your Quotation in SAP (VA21)',
                            'tool',    'sap',
                            'layout',  'side_by_side',
                            'isGate',  TRUE,
                            'instructions', jsonb_build_array(
                                jsonb_build_object(
                                    'instructionId', 'gi-1',
                                    'text', 'Open transaction VA21 (Create Quotation).'
                                ),
                                jsonb_build_object(
                                    'instructionId', 'gi-2',
                                    'text', 'Click "Create with Reference", enter your Inquiry number, and click Copy — do not re-type the data into a blank form.',
                                    'branches', jsonb_build_array(
                                        jsonb_build_object(
                                            'branchId', 'gb-1', 'condition', 'If SAP says the Inquiry number does not exist',
                                            'text', 'Make sure you saved the Inquiry in the previous step and copied the number exactly — leading zeros matter in SAP document numbers.'
                                        )
                                    )
                                ),
                                jsonb_build_object(
                                    'instructionId', 'gi-3',
                                    'text', 'Confirm the carried-forward data — customer {customer}, material {material}, quantity {orderQty} — then set validity dates (today → +14 days).'
                                ),
                                jsonb_build_object(
                                    'instructionId', 'gi-4',
                                    'text', 'Apply a {discountRate} discount to the line item and note the price SAP determined per unit.',
                                    'branches', jsonb_build_array(
                                        jsonb_build_object(
                                            'branchId', 'gb-1', 'condition', 'If no price appears in the line item',
                                            'text', 'Pricing comes from condition records for the customer/material combination. Confirm you are using customer {customer} and material {material}, then ask your instructor if it persists.'
                                        )
                                    )
                                ),
                                jsonb_build_object(
                                    'instructionId', 'gi-5',
                                    'text', 'Save (Ctrl+S) and write down the Quotation number.'
                                )
                            )
                        ),
                        jsonb_build_object(
                            'blockId', 'blk-quotation-checklist',
                            'type',    'checklist',
                            'title',   'Before you continue',
                            'items',   jsonb_build_array(
                                jsonb_build_object('itemId', 'i1', 'label', 'I created the Quotation with reference to my Inquiry (not from scratch).'),
                                jsonb_build_object('itemId', 'i2', 'label', 'I saved the Quotation and wrote down its number.'),
                                jsonb_build_object('itemId', 'i3', 'label', 'I noted the price SAP determined for the material.')
                            )
                        )
                    )
                ),

                -- Step 4: Sales Order (VA01)
                jsonb_build_object(
                    'stepId',      'st-sales-order',
                    'stepNumber',  4,
                    'title',       'Sales Order',
                    'description', 'Create a Sales Order with reference to your Quotation, set the requested delivery date, save, and confirm the document flow.',
                    'outcomeTagIndices', jsonb_build_array(2, 3),
                    'understandingNote', 'Student should understand: VA01 is where the sale becomes a real commitment driving delivery and billing; creating from the Quotation means the customer accepted the quoted terms; the requested delivery date triggers the ATP availability check; saving kicks off downstream processes.',
                    'blocks', jsonb_build_array(
                        jsonb_build_object(
                            'blockId', 'blk-order-tool',
                            'type',    'guided_tool',
                            'title',   'Create your Sales Order in SAP (VA01)',
                            'tool',    'sap',
                            'layout',  'side_by_side',
                            'isGate',  TRUE,
                            'instructions', jsonb_build_array(
                                jsonb_build_object(
                                    'instructionId', 'gi-1',
                                    'text', 'Open transaction VA01 (Create Sales Order) with Order Type "OR".'
                                ),
                                jsonb_build_object(
                                    'instructionId', 'gi-2',
                                    'text', 'Click "Create with Reference", enter your Quotation number, and click Copy.'
                                ),
                                jsonb_build_object(
                                    'instructionId', 'gi-3',
                                    'text', 'Confirm the carried-forward data — customer {customer}, material {material}, quantity {orderQty}, discount {discountRate} — then enter a requested delivery date 7 days from today.'
                                ),
                                jsonb_build_object(
                                    'instructionId', 'gi-4',
                                    'text', 'Check the line item for warnings or error icons; note any delivery-date issue and proceed.',
                                    'branches', jsonb_build_array(
                                        jsonb_build_object(
                                            'branchId', 'gb-1', 'condition', 'If SAP warns about the delivery date',
                                            'text', 'The warning means the requested date fails the availability (ATP) check. Note it, accept the proposed date, and continue.'
                                        )
                                    )
                                ),
                                jsonb_build_object(
                                    'instructionId', 'gi-5',
                                    'text', 'Save the Sales Order, note its number, then open the document flow view and confirm Inquiry → Quotation → Sales Order are linked.'
                                )
                            )
                        ),
                        jsonb_build_object(
                            'blockId', 'blk-order-checklist',
                            'type',    'checklist',
                            'title',   'Before you continue',
                            'items',   jsonb_build_array(
                                jsonb_build_object('itemId', 'i1', 'label', 'I created the Sales Order with reference to my Quotation.'),
                                jsonb_build_object('itemId', 'i2', 'label', 'I saved the Sales Order and wrote down its number.'),
                                jsonb_build_object('itemId', 'i3', 'label', 'I can see the document flow connecting Inquiry → Quotation → Sales Order.')
                            )
                        )
                    )
                )
            ),

            -- ── Instructional recipe ──────────────────────────────────────────
            'rubricDimensions', jsonb_build_array(
                jsonb_build_object('name', 'Process understanding',  'description', 'Can the student explain the purpose of each document and how they connect in the sales cycle, beyond describing what buttons they clicked?'),
                jsonb_build_object('name', 'Conceptual grasp',       'description', 'Does the student understand the business logic behind the process — who commits to what, when, and why?'),
                jsonb_build_object('name', 'System proficiency',     'description', 'Can the student articulate what they did in SAP and why each system step mattered, including the significance of creating documents with reference?'),
                jsonb_build_object('name', 'Durable skills transfer','description', 'Can the student connect this activity to transferable skills (attention to detail, process thinking, professional communication) and their future career?')
            ),

            'probingRules', jsonb_build_array(
                jsonb_build_object(
                    'trigger',   'Student describes creating a document without explaining its purpose',
                    'followUp',  'Ask: "That explains what you did — can you tell me why that step exists in the process? What would happen if a business skipped it?"'
                ),
                jsonb_build_object(
                    'trigger',   'Student conflates Inquiry and Quotation or says they are the same thing',
                    'followUp',  'Ask: "Let''s slow down there — if you were the customer, what are you asking for when you submit an inquiry? And what changes when you receive a quotation back?"'
                ),
                jsonb_build_object(
                    'trigger',   'Student describes creating with reference without explaining why',
                    'followUp',  'Ask: "Why does SAP let you create a quotation from an inquiry rather than starting from scratch? What problem does that solve?"'
                ),
                jsonb_build_object(
                    'trigger',   'Student says the Sales Order is just another form',
                    'followUp',  'Ask: "What does the Sales Order trigger in the rest of the business that the Quotation doesn''t? Think about what happens after you save it."'
                ),
                jsonb_build_object(
                    'trigger',   'Student only mentions technical skills when asked about what they learned',
                    'followUp',  'Ask: "Those are valuable — what about softer skills? Things like following a process carefully, attention to detail, or understanding a customer''s perspective?"'
                )
            ),

            'vagueAnswerTriggers', jsonb_build_array(
                'Student says "I just followed the steps" without articulating understanding',
                'Student describes clicking buttons without explaining business purpose',
                'Student gives a one-word or very short answer to an open question',
                'Student says "I don''t know" or "I''m not sure" without attempting an answer'
            ),

            'careerTransferPrompts', jsonb_build_array(
                'If you were working in a sales role, procurement, or operations at a company that uses SAP or a similar ERP system, how might understanding this process help you do your job better?',
                'What skills did you practice during this activity that you think will be useful regardless of which software tools you use in your career?',
                'If a colleague who had never used SAP asked you to explain what you did today in plain language, what would you say?'
            ),

            'toneGuidance', 'Many students completing this module have little to no prior business or ERP experience. Be patient and encouraging. Acknowledge that the SAP interface can feel unfamiliar and that understanding the business logic takes time. Celebrate specific moments of understanding — when a student makes a connection between the documents and real business situations, affirm it explicitly before pushing deeper.',

            'maxTurns', 24,

            -- ── Content stub ─────────────────────────────────────────────────
            'contentStub', jsonb_build_object(
                'summaryText', 'In this module you will learn how businesses use SAP to manage the early stages of a sale — from a customer''s first inquiry through to a confirmed sales order. You will practice creating three core documents in SAP''s Sales & Distribution module: an Inquiry, a Quotation, and a Sales Order. By the end of the activity you should be able to explain not just what each document is, but why it exists and how the three documents connect as a sequence.',
                'resourceLinks', jsonb_build_array(
                    jsonb_build_object('url', 'https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/sd', 'label', 'SAP SD documentation', 'type', 'reading'),
                    jsonb_build_object('url', 'https://www.sap.com/products/erp/what-is-erp.html',   'label', 'What is ERP? (SAP overview)', 'type', 'reading')
                )
            )
        )
    )
    RETURNING recipe_id, module_id
)

-- ---------------------------------------------------------------------------
-- 2. Insert module config
-- ---------------------------------------------------------------------------
INSERT INTO public.module_config (
    module_id,
    recipe_id,
    required_sap_doc_types,
    sap_timeout_seconds,
    badge_template_id,
    retry_limit,
    max_session_age_hours,
    sap_stub_enabled
)
SELECT
    r.module_id,
    r.recipe_id,
    ARRAY['VA11','VA21','VA01'],    -- Inquiry, Quotation, Sales Order
    15,
    NULL,                           -- No badge in Phase 1
    2,
    8,
    TRUE                            -- Phase 1: SAP gate is self-report
FROM inserted_recipe r;


-- ---------------------------------------------------------------------------
-- 3. Insert IRB config (not approved — research data collection off)
-- ---------------------------------------------------------------------------
INSERT INTO public.module_irb_config (
    module_id,
    approved,
    notes
) VALUES (
    'sap-sales-process',
    FALSE,
    'IRB approval pending. Research data collection not yet enabled for this module.'
)
ON CONFLICT (module_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. Default admin user (CHANGE PASSWORD BEFORE SHARING)
-- ---------------------------------------------------------------------------
-- Password is 'changeme' — bcrypt hash generated with cost factor 12.
-- Replace this with a real bcrypt hash before deploying to a shared environment.
-- In Phase 2 this will be replaced by institutional SSO.
INSERT INTO public.admin_users (
    email,
    password_hash,
    role,
    display_name
) VALUES (
    'admin@example.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RdWCr8vQ2',  -- 'changeme'
    'admin',
    'Initial Admin'
)
ON CONFLICT (email) DO NOTHING;


COMMIT;


INSERT INTO public.schema_migrations (version, description)
VALUES ('004', 'Seed SAP Sales Process recipe and module config')
ON CONFLICT (version) DO NOTHING;
