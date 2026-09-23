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

            -- ── Module steps ─────────────────────────────────────────────────
            -- Content model: module → steps → content blocks.
            -- Step 1: conceptual background (rich text + knowledge check).
            -- Steps 2–4: one step per SAP document — numbered instructions in a
            -- rich-text block alongside an embedded-tool gate, a self-check
            -- checklist, and a troubleshooting branching note.
            'steps', jsonb_build_array(

                -- Step 1: Background
                jsonb_build_object(
                    'stepId',      'st-background',
                    'stepNumber',  1,
                    'title',       'The sales cycle and your SAP environment',
                    'description', 'Read the background on why a sale uses three linked documents, and get oriented in SAP.',
                    'outcomeTagIndices', jsonb_build_array(3),
                    'understandingNote', 'Student should grasp the inquiry → quotation → order chain and the document flow that links them, before touching the system.',
                    'blocks', jsonb_build_array(
                        jsonb_build_object(
                            'blockId', 'blk-cycle-overview',
                            'type',    'rich_text',
                            'title',   'The sales cycle: why three documents?',
                            'body',    E'## Why does a sale require three documents?\n\nIn real business, a customer rarely places an order out of nowhere. They first ask "can you supply this, and at what price?" — that is an **Inquiry**. The supplier responds with a formal **Quotation** committing to specific terms. Only when the customer accepts does a **Sales Order** get created, triggering the actual work of fulfilling the sale.\n\nThis three-step process protects both parties:\n- The customer can shop around without committing\n- The supplier can check inventory and capacity before committing to a price\n- The Sales Order creates a legal and operational commitment on both sides\n\nIn SAP, each step creates a distinct document with its own number, and each subsequent document *references* the one before it — this creates the **document flow**, which gives managers and auditors a traceable record of every sale.\n\n## The documents at a glance\n\n| Document | SAP Transaction | Who creates it | What it means |\n|----------|----------------|----------------|---------------|\n| Inquiry  | VA11           | Sales rep (on behalf of customer) | "We might want to buy this" — no commitment |\n| Quotation| VA21           | Sales rep      | "We will sell it at this price" — company commits |\n| Sales Order | VA01        | Sales rep      | "We are buying this" — both parties commit |'
                        ),
                        jsonb_build_object(
                            'blockId', 'blk-sap-navigation',
                            'type',    'rich_text',
                            'title',   'Navigating SAP for this activity',
                            'body',    E'## Getting around SAP\n\nYou will use the SAP Easy Access menu or transaction codes (T-codes) to complete this activity. T-codes are shortcuts that take you directly to a function without navigating menus.\n\nThe three T-codes you need:\n- **VA11** — Create Inquiry\n- **VA21** — Create Quotation (with reference to your Inquiry)\n- **VA01** — Create Sales Order (with reference to your Quotation)\n\n## Working with reference documents\n\nA key skill in SAP is creating documents *with reference* to a previous document. When you create a Quotation from an Inquiry, SAP copies the relevant data automatically. This prevents data entry errors and maintains the document flow.\n\nYou will use this technique for both the Quotation (referencing the Inquiry) and the Sales Order (referencing the Quotation).\n\n## Your test data\n\nFor this activity you will use:\n- **Customer number**: 1000 (Domestic US customer)\n- **Material number**: M-01 (a standard test material)\n- **Sales organization**: 1000\n- **Distribution channel**: 10\n- **Division**: 00\n\nYour instructor has pre-loaded this data into the sandbox system.'
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
                    'title',       'Create the Inquiry (VA11)',
                    'description', 'Log into the SAP sandbox and create an Inquiry for customer 1000, material M-01, quantity 10. Save and note the Inquiry number.',
                    'outcomeTagIndices', jsonb_build_array(0, 3),
                    'understandingNote', 'Student should understand: VA11 captures initial customer interest with no commitment from either party; the organizational fields route the inquiry to the right sales area; the validity period is a window of interest; saving creates the first document in the flow.',
                    'blocks', jsonb_build_array(
                        jsonb_build_object(
                            'blockId', 'blk-inquiry-instructions',
                            'type',    'rich_text',
                            'title',   'Step-by-step instructions',
                            'body',    E'1. Log into the SAP sandbox using the username and password provided by your instructor. You should see the SAP Easy Access screen.\n2. Enter transaction code **VA11** in the command field (top-left box) and press Enter.\n3. On the Create Inquiry screen, enter Order Type "IN" (standard inquiry), Sales Organization "1000", Distribution Channel "10", and Division "00". Press Enter.\n4. Enter Customer number "1000" in the Sold-to party field. Tab to the PO Number field and enter any reference (e.g. your initials + today''s date). Set a valid-from date (today) and valid-to date (30 days from now).\n5. Scroll down to the line items section. Enter Material "M-01" and Quantity "10". Press Enter to allow SAP to validate the material.\n6. Click the Save button (floppy disk icon) or press Ctrl+S. SAP will display an Inquiry number at the bottom of the screen — **write it down**.'
                        ),
                        jsonb_build_object(
                            'blockId', 'blk-inquiry-sap',
                            'type',    'embedded_tool',
                            'title',   'Create your Inquiry in SAP (VA11)',
                            'tool',    'sap',
                            'launch',  'link',
                            'taskPrompt', 'Using the instructions above, create an Inquiry in your SAP sandbox. When you have saved the Inquiry and noted your Inquiry number, confirm below.',
                            'isGate',  TRUE
                        ),
                        jsonb_build_object(
                            'blockId', 'blk-inquiry-checklist',
                            'type',    'checklist',
                            'title',   'Before you continue',
                            'items',   jsonb_build_array(
                                jsonb_build_object('itemId', 'i1', 'label', 'I saved the Inquiry in SAP.'),
                                jsonb_build_object('itemId', 'i2', 'label', 'I wrote down my Inquiry number — I will need it for the Quotation.')
                            )
                        ),
                        jsonb_build_object(
                            'blockId', 'blk-inquiry-trouble',
                            'type',    'branching_note',
                            'trigger', 'Something went wrong in VA11?',
                            'paths',   jsonb_build_array(
                                jsonb_build_object(
                                    'pathId', 'p1', 'label', 'A field was rejected (e.g. material or customer not found)',
                                    'body', 'Double-check the test data: customer 1000, material M-01, sales org 1000, channel 10, division 00. Typos in these fields are the most common cause — SAP validates them against pre-loaded master data.'
                                ),
                                jsonb_build_object(
                                    'pathId', 'p2', 'label', 'You cannot find where to enter the T-code',
                                    'body', 'The command field is the small box at the top-left of the SAP window. Type VA11 and press Enter — do not navigate through the menu tree.'
                                )
                            )
                        )
                    )
                ),

                -- Step 3: Quotation (VA21)
                jsonb_build_object(
                    'stepId',      'st-quotation',
                    'stepNumber',  3,
                    'title',       'Create the Quotation (VA21)',
                    'description', 'Create a Quotation with reference to your Inquiry, review the copied data and pricing, save, and note the Quotation number.',
                    'outcomeTagIndices', jsonb_build_array(1, 3),
                    'understandingNote', 'Student should understand: VA21 is the company making a formal commitment in response to the inquiry; creating with reference links the documents and copies data forward; the validity period is a price-commitment window; pricing is determined by condition records, not typed manually.',
                    'blocks', jsonb_build_array(
                        jsonb_build_object(
                            'blockId', 'blk-quotation-instructions',
                            'type',    'rich_text',
                            'title',   'Step-by-step instructions',
                            'body',    E'1. Enter transaction code **VA21** and press Enter.\n2. On the initial screen, click "Create with Reference". In the dialog, enter your **Inquiry number** from the previous step and click Copy.\n3. Review the copied data. Set a valid-from date (today) and valid-to date (14 days from now). This is the window during which the quoted price is guaranteed.\n4. Check the pricing in the line item. SAP should have determined a price based on the material and customer — note the price per unit.\n5. Save the Quotation (Ctrl+S). Note the **Quotation number** displayed at the bottom of the screen.'
                        ),
                        jsonb_build_object(
                            'blockId', 'blk-quotation-sap',
                            'type',    'embedded_tool',
                            'title',   'Create your Quotation in SAP (VA21)',
                            'tool',    'sap',
                            'launch',  'link',
                            'taskPrompt', 'Using the instructions above, create a Quotation with reference to your Inquiry. When you have saved it and noted your Quotation number, confirm below.',
                            'isGate',  TRUE
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
                        ),
                        jsonb_build_object(
                            'blockId', 'blk-quotation-trouble',
                            'type',    'branching_note',
                            'trigger', 'Something went wrong in VA21?',
                            'paths',   jsonb_build_array(
                                jsonb_build_object(
                                    'pathId', 'p1', 'label', 'SAP says the Inquiry number does not exist',
                                    'body', 'Make sure you saved the Inquiry in the previous step and copied the number exactly — leading zeros matter in SAP document numbers. You can search for it with the matchcode button beside the field.'
                                ),
                                jsonb_build_object(
                                    'pathId', 'p2', 'label', 'No price appears in the line item',
                                    'body', 'Pricing comes from condition records maintained for the customer/material combination. If the field is blank, check you are working with customer 1000 and material M-01, then contact your instructor if it persists.'
                                )
                            )
                        )
                    )
                ),

                -- Step 4: Sales Order (VA01)
                jsonb_build_object(
                    'stepId',      'st-sales-order',
                    'stepNumber',  4,
                    'title',       'Create the Sales Order (VA01)',
                    'description', 'Create a Sales Order with reference to your Quotation, set the requested delivery date, check for availability warnings, save, and note the Sales Order number.',
                    'outcomeTagIndices', jsonb_build_array(2, 3),
                    'understandingNote', 'Student should understand: VA01 is where the sale becomes a real commitment driving delivery and billing; creating from the Quotation means the customer accepted the quoted terms; the requested delivery date triggers the ATP availability check; saving kicks off downstream processes.',
                    'blocks', jsonb_build_array(
                        jsonb_build_object(
                            'blockId', 'blk-order-instructions',
                            'type',    'rich_text',
                            'title',   'Step-by-step instructions',
                            'body',    E'1. Enter transaction code **VA01** and press Enter.\n2. Select Order Type "OR" (standard order). Click "Create with Reference" and enter your **Quotation number**. Click Copy.\n3. Review the Sales Order header. Notice the requested delivery date field — enter a date 7 days from today. This is when the customer expects to receive the goods.\n4. Check the line item for any warnings or error messages (indicated by colored icons). If SAP shows a delivery date issue, note it but proceed.\n5. Save the Sales Order (Ctrl+S). Note the **Sales Order number**. You have now completed the full Inquiry → Quotation → Sales Order cycle.'
                        ),
                        jsonb_build_object(
                            'blockId', 'blk-order-sap',
                            'type',    'embedded_tool',
                            'title',   'Create your Sales Order in SAP (VA01)',
                            'tool',    'sap',
                            'launch',  'link',
                            'taskPrompt', 'Using the instructions above, create a Sales Order with reference to your Quotation. When you have saved it and noted your Sales Order number, confirm below.',
                            'isGate',  TRUE
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
