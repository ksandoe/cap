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

            -- ── Content blocks ────────────────────────────────────────────────
            'contentBlocks', jsonb_build_array(

                -- Block 1: Conceptual — Overview
                jsonb_build_object(
                    'blockId',   'block-conceptual-1',
                    'type',      'conceptual',
                    'title',     'The sales cycle: why three documents?',
                    'body',      E'## Why does a sale require three documents?\n\nIn real business, a customer rarely places an order out of nowhere. They first ask "can you supply this, and at what price?" — that is an **Inquiry**. The supplier responds with a formal **Quotation** committing to specific terms. Only when the customer accepts does a **Sales Order** get created, triggering the actual work of fulfilling the sale.\n\nThis three-step process protects both parties:\n- The customer can shop around without committing\n- The supplier can check inventory and capacity before committing to a price\n- The Sales Order creates a legal and operational commitment on both sides\n\nIn SAP, each step creates a distinct document with its own number, and each subsequent document *references* the one before it — this creates the **document flow**, which gives managers and auditors a traceable record of every sale.\n\n## The documents at a glance\n\n| Document | SAP Transaction | Who creates it | What it means |\n|----------|----------------|----------------|---------------|\n| Inquiry  | VA11           | Sales rep (on behalf of customer) | "We might want to buy this" — no commitment |\n| Quotation| VA21           | Sales rep      | "We will sell it at this price" — company commits |\n| Sales Order | VA01        | Sales rep      | "We are buying this" — both parties commit |',
                    'isGate',    FALSE
                ),

                -- Block 2: Conceptual — SAP Navigation
                jsonb_build_object(
                    'blockId',   'block-conceptual-2',
                    'type',      'conceptual',
                    'title',     'Navigating SAP for this activity',
                    'body',      E'## Getting around SAP\n\nYou will use the SAP Easy Access menu or transaction codes (T-codes) to complete this activity. T-codes are shortcuts that take you directly to a function without navigating menus.\n\nThe three T-codes you need:\n- **VA11** — Create Inquiry\n- **VA21** — Create Quotation (with reference to your Inquiry)\n- **VA01** — Create Sales Order (with reference to your Quotation)\n\n## Working with reference documents\n\nA key skill in SAP is creating documents *with reference* to a previous document. When you create a Quotation from an Inquiry, SAP copies the relevant data automatically. This prevents data entry errors and maintains the document flow.\n\nYou will use this technique for both the Quotation (referencing the Inquiry) and the Sales Order (referencing the Quotation).\n\n## Your test data\n\nFor this activity you will use:\n- **Customer number**: 1000 (Domestic US customer)\n- **Material number**: M-01 (a standard test material)\n- **Sales organization**: 1000\n- **Distribution channel**: 10\n- **Division**: 00\n\nYour instructor has pre-loaded this data into the sandbox system.',
                    'isGate',    FALSE
                ),

                -- Block 3: Instructional (steps for Inquiry)
                jsonb_build_object(
                    'blockId',   'block-instructional-inquiry',
                    'type',      'instructional',
                    'title',     'Step-by-step: creating the Inquiry',
                    'isGate',    FALSE,
                    'steps', jsonb_build_array(
                        jsonb_build_object(
                            'stepNumber',        1,
                            'description',       'Log into the SAP sandbox using the username and password provided by your instructor. You should see the SAP Easy Access screen.',
                            'outcomeTagIndices', jsonb_build_array(),
                            'understandingNote', ''
                        ),
                        jsonb_build_object(
                            'stepNumber',        2,
                            'description',       'Enter transaction code VA11 in the command field (top-left box) and press Enter. This opens the Create Inquiry screen.',
                            'outcomeTagIndices', jsonb_build_array(0),
                            'understandingNote', 'Student should understand that VA11 is the entry point for capturing initial customer interest — not a commitment from either party.'
                        ),
                        jsonb_build_object(
                            'stepNumber',        3,
                            'description',       'On the Create Inquiry screen, enter Order Type "IN" (standard inquiry), Sales Organization "1000", Distribution Channel "10", and Division "00". Press Enter.',
                            'outcomeTagIndices', jsonb_build_array(0),
                            'understandingNote', 'Student should understand that these organizational fields determine which sales area processes this inquiry — they route it to the right business unit.'
                        ),
                        jsonb_build_object(
                            'stepNumber',        4,
                            'description',       'Enter Customer number "1000" in the Sold-to party field. Tab to the PO Number field and enter any reference (e.g. your initials + today''s date). Set a valid-from date (today) and valid-to date (30 days from now).',
                            'outcomeTagIndices', jsonb_build_array(0),
                            'understandingNote', 'Student should understand the validity period: the inquiry represents a window of interest. If the customer doesn''t follow up, the inquiry expires.'
                        ),
                        jsonb_build_object(
                            'stepNumber',        5,
                            'description',       'Scroll down to the line items section. Enter Material "M-01" and Quantity "10". Press Enter to allow SAP to validate the material.',
                            'outcomeTagIndices', jsonb_build_array(0, 3),
                            'understandingNote', 'Student should understand that the line item is what the customer is asking about — the specific product and tentative quantity. SAP validates that the material exists and is available for this sales area.'
                        ),
                        jsonb_build_object(
                            'stepNumber',        6,
                            'description',       'Click the Save button (floppy disk icon) or press Ctrl+S. SAP will display an Inquiry number at the bottom of the screen. Write this number down — you will need it in the next section.',
                            'outcomeTagIndices', jsonb_build_array(0, 3),
                            'understandingNote', 'Student should understand that saving creates the Inquiry document in the system, giving it a unique number that will link to the Quotation. This is the start of the document flow.'
                        )
                    )
                ),

                -- Block 4: SAP activity (Inquiry)
                jsonb_build_object(
                    'blockId',   'block-sap-inquiry',
                    'type',      'sap',
                    'title',     'Create your Inquiry in SAP (VA11)',
                    'taskPrompt', 'Using the steps on the left, create an Inquiry in your SAP sandbox. When you have saved the Inquiry and noted your Inquiry number, click "I completed this step" below.',
                    'isGate',    TRUE
                ),

                -- Block 5: Instructional (steps for Quotation)
                jsonb_build_object(
                    'blockId',   'block-instructional-quotation',
                    'type',      'instructional',
                    'title',     'Step-by-step: creating the Quotation',
                    'isGate',    FALSE,
                    'steps', jsonb_build_array(
                        jsonb_build_object(
                            'stepNumber',        1,
                            'description',       'Enter transaction code VA21 and press Enter. This opens the Create Quotation screen.',
                            'outcomeTagIndices', jsonb_build_array(1),
                            'understandingNote', 'Student should understand that VA21 is how the company responds formally to the customer''s inquiry — this is the company making a commitment.'
                        ),
                        jsonb_build_object(
                            'stepNumber',        2,
                            'description',       'On the initial screen, click "Create with Reference". In the dialog that appears, enter your Inquiry number from the previous step and click Copy.',
                            'outcomeTagIndices', jsonb_build_array(1, 3),
                            'understandingNote', 'Creating with reference is critical — it links the Quotation to the Inquiry in the document flow. SAP copies the customer and material data, reducing errors and maintaining traceability.'
                        ),
                        jsonb_build_object(
                            'stepNumber',        3,
                            'description',       'Review the copied data. Set a valid-from date (today) and valid-to date (14 days from now). This is the window during which the quoted price is guaranteed.',
                            'outcomeTagIndices', jsonb_build_array(1),
                            'understandingNote', 'Student should understand that the validity period on a Quotation is a commitment — the company is legally bound to honor the price if the customer accepts within this window.'
                        ),
                        jsonb_build_object(
                            'stepNumber',        4,
                            'description',       'Check the pricing in the line item. SAP should have determined a price based on the material and customer. Note the price per unit.',
                            'outcomeTagIndices', jsonb_build_array(1),
                            'understandingNote', 'Student should understand that pricing in SAP is determined by condition records — pre-configured rules for this customer/material combination. The sales rep doesn''t manually type a price; SAP looks it up.'
                        ),
                        jsonb_build_object(
                            'stepNumber',        5,
                            'description',       'Save the Quotation (Ctrl+S). Note the Quotation number displayed at the bottom of the screen.',
                            'outcomeTagIndices', jsonb_build_array(1, 3),
                            'understandingNote', 'The Quotation number links back to the Inquiry and will link forward to the Sales Order, completing the document chain.'
                        )
                    )
                ),

                -- Block 6: SAP activity (Quotation)
                jsonb_build_object(
                    'blockId',   'block-sap-quotation',
                    'type',      'sap',
                    'title',     'Create your Quotation in SAP (VA21)',
                    'taskPrompt', 'Using the steps on the left, create a Quotation with reference to your Inquiry. When you have saved the Quotation and noted your Quotation number, click "I completed this step" below.',
                    'isGate',    TRUE
                ),

                -- Block 7: Instructional (steps for Sales Order)
                jsonb_build_object(
                    'blockId',   'block-instructional-sales-order',
                    'type',      'instructional',
                    'title',     'Step-by-step: creating the Sales Order',
                    'isGate',    FALSE,
                    'steps', jsonb_build_array(
                        jsonb_build_object(
                            'stepNumber',        1,
                            'description',       'Enter transaction code VA01 and press Enter.',
                            'outcomeTagIndices', jsonb_build_array(2),
                            'understandingNote', 'VA01 is where a sale becomes real — a formal commitment that will drive delivery and billing.'
                        ),
                        jsonb_build_object(
                            'stepNumber',        2,
                            'description',       'Select Order Type "OR" (standard order). Click "Create with Reference" and enter your Quotation number. Click Copy.',
                            'outcomeTagIndices', jsonb_build_array(2, 3),
                            'understandingNote', 'Student should understand that creating the Sales Order from the Quotation means the customer has accepted the quoted terms. The price and conditions are locked in at the Quotation values.'
                        ),
                        jsonb_build_object(
                            'stepNumber',        3,
                            'description',       'Review the Sales Order header. Notice the requested delivery date field — enter a date 7 days from today. This is when the customer expects to receive the goods.',
                            'outcomeTagIndices', jsonb_build_array(2),
                            'understandingNote', 'The requested delivery date triggers SAP''s availability check and scheduling — it determines whether the company can actually fulfill the order on time.'
                        ),
                        jsonb_build_object(
                            'stepNumber',        4,
                            'description',       'Check the line item for any warnings or error messages (indicated by colored icons). If SAP shows a delivery date issue, note it but proceed.',
                            'outcomeTagIndices', jsonb_build_array(2),
                            'understandingNote', 'SAP runs an availability check (ATP — Available to Promise) when a Sales Order is created. Warnings here mean the system cannot guarantee delivery on the requested date — a real-world signal to the sales rep to communicate with the customer.'
                        ),
                        jsonb_build_object(
                            'stepNumber',        5,
                            'description',       'Save the Sales Order (Ctrl+S). Note the Sales Order number. You have now completed the full Inquiry → Quotation → Sales Order cycle.',
                            'outcomeTagIndices', jsonb_build_array(2, 3),
                            'understandingNote', 'Student should understand that saving the Sales Order triggers downstream processes in SAP — warehouse management, delivery scheduling, and billing will all reference this document number.'
                        )
                    )
                ),

                -- Block 8: SAP activity (Sales Order)
                jsonb_build_object(
                    'blockId',   'block-sap-sales-order',
                    'type',      'sap',
                    'title',     'Create your Sales Order in SAP (VA01)',
                    'taskPrompt', 'Using the steps on the left, create a Sales Order with reference to your Quotation. When you have saved the Sales Order and noted your Sales Order number, click "I completed this step" below.',
                    'isGate',    TRUE
                )
            ),

            -- ── Concurrent pairs ──────────────────────────────────────────────
            -- Each instructional block is paired with its SAP activity block
            -- so students can view instructions and SAP side by side.
            'concurrentPairs', jsonb_build_array(
                jsonb_build_object(
                    'pairId',          'pair-inquiry',
                    'instructionalId', 'block-instructional-inquiry',
                    'sapId',           'block-sap-inquiry'
                ),
                jsonb_build_object(
                    'pairId',          'pair-quotation',
                    'instructionalId', 'block-instructional-quotation',
                    'sapId',           'block-sap-quotation'
                ),
                jsonb_build_object(
                    'pairId',          'pair-sales-order',
                    'instructionalId', 'block-instructional-sales-order',
                    'sapId',           'block-sap-sales-order'
                )
            ),

            -- ── Sequence ──────────────────────────────────────────────────────
            -- Author-defined macro order. Conceptual blocks first, then
            -- each instruction/SAP concurrent pair in sequence.
            'sequence', jsonb_build_array(
                jsonb_build_object('kind', 'block', 'blockId', 'block-conceptual-1'),
                jsonb_build_object('kind', 'block', 'blockId', 'block-conceptual-2'),
                jsonb_build_object('kind', 'pair',  'pairId',  'pair-inquiry'),
                jsonb_build_object('kind', 'pair',  'pairId',  'pair-quotation'),
                jsonb_build_object('kind', 'pair',  'pairId',  'pair-sales-order')
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
