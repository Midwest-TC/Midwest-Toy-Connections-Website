/* =========================================================
   MIDWEST TOY CONNECTIONS
   ADMIN LEGAL MANAGEMENT
   mtc-admin-legal.js
========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
========================================================= */

const LEGAL_VERSION_HISTORY_PER_PAGE = 10;

/* =========================================================
   LEGAL DOCUMENT DEFINITIONS
========================================================= */

const MTC_LEGAL_DOCUMENTS = {
    terms: {
        type: "terms",
        title: "Terms of Service",
        storefrontPage: "mw-terms.html",
        statusElementId: "mtcAdminLegalTermsStatus",
        updatedElementId: "mtcAdminLegalTermsUpdated",
    },

    privacy: {
        type: "privacy",
        title: "Privacy Policy",
        storefrontPage: "mw-privacy.html",
        statusElementId: "mtcAdminLegalPrivacyStatus",
        updatedElementId: "mtcAdminLegalPrivacyUpdated",
    },
};

const MTC_LEGAL_SECTIONS = {
    terms: [
        { key: "services", title: "Services" },
        { key: "order_payments", title: "Order Payments" },
        { key: "pricing_availability", title: "Pricing & Availability" },
        { key: "shipping_delivery", title: "Shipping & Delivery" },
        { key: "return_requests", title: "Return Requests" },
        { key: "damaged_item_claims", title: "Damaged Item Claims" },
        { key: "tcg_final_sale", title: "Trading Card & TCG Final Sale Items" },
        { key: "events_tournaments", title: "Events & Tournaments" },
        { key: "changes_to_terms", title: "Changes to Terms" },
        { key: "contact_us", title: "Contact Us" }
    ],

    privacy: [
        { key: "information_we_collect", title: "Information We Collect" },
        { key: "how_we_use_information", title: "How We Use Your Information" },
        { key: "payment_information", title: "Payment Information" },
        { key: "shipping_information", title: "Shipping Information" },
        { key: "sharing_information", title: "Sharing Information" },
        { key: "data_security", title: "Data Security" },
        { key: "third_party_services", title: "Third-Party Services" },
        { key: "your_rights", title: "Your Rights" },
        { key: "changes_to_privacy", title: "Changes to This Privacy Policy" },
        { key: "contact_us", title: "Contact Us" }
    ]
};


/* =========================================================
   PAGE STATE
========================================================= */

let mtcLegalDocuments = {
    terms: null,
    privacy: null,
};

let mtcLegalVersionHistory = [];

let mtcLegalVersionCurrentPage = 1;

let mtcLegalActiveDocumentType = null;

let mtcLegalActiveDocument = null;

let mtcLegalEditorOriginalContent = "";

let mtcLegalEditorHasChanges = false;

/* =========================================================
   LEGAL PERMISSIONS
========================================================= */
let canCreateLegal = false;
let canEditLegal = false;
let canPublishLegal = false;
let canDeleteLegal = false;

async function loadMtcLegalPermissions() {
console.log("LEGAL PERMISSION FUNCTION IS RUNNING");
    const {
        data: { session }
    } = await adminSupabase.auth.getSession();

    const accessToken =
        session?.access_token;

    if (!accessToken) {
        return false;
    }

    const permissionHeaders = {
        Authorization: `Bearer ${accessToken}`
    };

    try {

        const [
    createResponse,
    editResponse,
    publishResponse,
    deleteResponse
] = await Promise.all([

            fetch(
                "http://localhost:3000/admin-permission/check?permission=legal.create",
                { headers: permissionHeaders }
            ),

            fetch(
                "http://localhost:3000/admin-permission/check?permission=legal.edit",
                { headers: permissionHeaders }
            ),

            fetch(
                "http://localhost:3000/admin-permission/check?permission=legal.publish",
                { headers: permissionHeaders }
            ),

            fetch(
                "http://localhost:3000/admin-permission/check?permission=legal.delete",
                { headers: permissionHeaders }
            )

        ]);

        const [
    createResult,
    editResult,
    publishResult,
    deleteResult
] = await Promise.all([

            createResponse.json(),
            editResponse.json(),
            publishResponse.json(),
            deleteResponse.json()

        ]);

        canCreateLegal =
            createResult?.allowed === true;

        canEditLegal =
            editResult?.allowed === true;

        canPublishLegal =
            publishResult?.allowed === true;

        canDeleteLegal =
            deleteResult?.allowed === true;

        console.log("LEGAL PERMISSIONS:", {
            canCreateLegal,
            canEditLegal,
            canPublishLegal,
            canDeleteLegal
        });

        return true;

    } catch (error) {

        console.error(
            "LEGAL PERMISSION LOAD ERROR:",
            error
        );

        return false;
    }
}

/* =========================================================
   SUPABASE CLIENT
========================================================= */

function getMtcLegalSupabaseClient() {
    if (typeof adminSupabase !== "undefined" && adminSupabase) {
        return adminSupabase;
    }

    if (typeof window !== "undefined" && window.adminSupabase) {
        return window.adminSupabase;
    }

    if (typeof supabaseClient !== "undefined" && supabaseClient) {
        return supabaseClient;
    }

    if (typeof window !== "undefined" && window.supabaseClient) {
        return window.supabaseClient;
    }

    return null;
}

/* =========================================================
   UTILITY FUNCTIONS
========================================================= */

function escapeLegalHtml(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatLegalDate(dateValue) {
    if (!dateValue) {
        return "Not Published";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Not Published";
    }

    return date.toLocaleString("en-US", {
        timeZone: "America/Chicago",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function getLegalDocumentDefinition(type) {
    return MTC_LEGAL_DOCUMENTS[type] || null;
}

function normalizeLegalStatus(status) {
    const cleanStatus = String(status || "")
        .trim()
        .toLowerCase();

    if (cleanStatus === "published") {
        return "published";
    }

    return "draft";
}

/* =========================================================
   LEGAL NOTIFICATIONS
========================================================= */

function showLegalNotification(message, type = "success") {
    let container = document.getElementById("mtcAdminLegalNotificationContainer");

    if (!container) {
        container = document.createElement("div");

        container.id = "mtcAdminLegalNotificationContainer";

        container.style.position = "fixed";
        container.style.top = "20px";
        container.style.right = "20px";
        container.style.zIndex = "999999";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "10px";

        document.body.appendChild(container);
    }

    const notification = document.createElement("div");

    notification.style.minWidth = "280px";
    notification.style.maxWidth = "420px";
    notification.style.padding = "13px 16px";
    notification.style.borderRadius = "10px";
    notification.style.border = "1px solid rgba(255,255,255,.10)";
    notification.style.background = "#0d1226";
    notification.style.color = "#e5e7eb";
    notification.style.boxShadow = "0 15px 35px rgba(0,0,0,.35)";
    notification.style.fontSize = "12px";
    notification.style.display = "flex";
    notification.style.alignItems = "center";
    notification.style.gap = "10px";

    let icon = "fa-circle-check";
    let iconColor = "#4ade80";

    if (type === "error") {
        icon = "fa-circle-exclamation";
        iconColor = "#f87171";
    }

    if (type === "warning") {
        icon = "fa-triangle-exclamation";
        iconColor = "#fbbf24";
    }

    if (type === "info") {
        icon = "fa-circle-info";
        iconColor = "#60a5fa";
    }

    notification.innerHTML = `
        <i
            class="fa-solid ${icon}"
            style="color:${iconColor};"
        ></i>

        <span>
            ${escapeLegalHtml(message)}
        </span>
    `;

    container.appendChild(notification);

    window.setTimeout(() => {
        notification.remove();

        if (container && container.children.length === 0) {
            container.remove();
        }
    }, 4000);
}

/* ========================================================= CREATE LEGAL EDIT MODAL
========================================================= */ function createLegalEditModal() { if (
document.getElementById( "mtcAdminLegalEditModal" ) ) { return; } const modal = document.createElement("div"); modal.id
= "mtcAdminLegalEditModal"; modal.className = "mtc-admin-legal-modal"; modal.style.display = "none"; modal.innerHTML = `

<div class="mtc-admin-legal-modal-backdrop"></div>

<div class="mtc-admin-legal-modal-dialog">
    <div class="mtc-admin-legal-modal-header">
        <div>
            <h2 id="mtcAdminLegalEditModalTitle">Edit Legal Document</h2>

            <p id="mtcAdminLegalEditModalSubtitle">Make changes to this legal document.</p>
        </div>

        <button type="button" class="mtc-admin-legal-modal-close" id="mtcAdminLegalEditCloseButton" aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>

    <div class="mtc-admin-legal-modal-body">
        <div class="mtc-admin-legal-editor-status-row">
            <div>
                <span> Current Status </span>

                <strong id="mtcAdminLegalEditorCurrentStatus"> Draft </strong>
            </div>

            <div>
                <span> Last Updated </span>

                <strong id="mtcAdminLegalEditorLastUpdated"> Not Published </strong>
            </div>
        </div>

        <label for="mtcAdminLegalEditorContent" class="mtc-admin-legal-editor-label"> Document Content </label>

       <div id="mtcAdminLegalEditorSections" class="mtc-admin-legal-editor-sections"></div>
       <button type="button" class="mtc-admin-legal-add-section-button" id="mtcAdminLegalAddSectionButton"> <i class="fa-solid fa-plus"></i>Add Legal Section</button> 
        <div class="mtc-admin-legal-editor-info">
            <span id="mtcAdminLegalEditorCharacterCount"> 0 characters </span>

            <span id="mtcAdminLegalEditorUnsavedStatus"> No unsaved changes </span>
        </div>
    </div>

    <div class="mtc-admin-legal-modal-footer">
        <button type="button" class="mtc-admin-legal-preview-button" id="mtcAdminLegalEditorPreviewButton">
            <i class="fa-regular fa-eye"></i>
            Preview
        </button>
        <div class="mtc-admin-legal-modal-footer-right">
            <button type="button" class="mtc-admin-legal-preview-button" id="mtcAdminLegalEditorCancelButton">
                Cancel
            </button>
            <button type="button" class="mtc-admin-legal-edit-button" id="mtcAdminLegalSaveDraftButton">
                <i class="fa-solid fa-floppy-disk"></i>
                Save Draft
            </button>
            <button type="button" class="mtc-admin-legal-publish-button" id="mtcAdminLegalPublishButton">
                <i class="fa-solid fa-upload"></i>
                Publish
            </button>
            <button type="button" class="mtc-admin-legal-unpublish-button" id="mtcAdminLegalUnpublishButton">
                <i class="fa-solid fa-eye-slash"></i>
                Unpublish
            </button>
        </div>
    </div>
</div>
`; document.body.appendChild(modal); }

/* =========================================================
   CREATE POLICY MODAL
========================================================= */

function createLegalPolicyModal() {

    if (
        document.getElementById(
            "mtcAdminLegalCreatePolicyModal"
        )
    ) {
        return;
    }

    const modal =
        document.createElement("div");

    modal.id =
        "mtcAdminLegalCreatePolicyModal";

    modal.className =
        "mtc-admin-legal-modal";

    modal.style.display = "none";

    modal.innerHTML = `
        <div class="mtc-admin-legal-modal-backdrop"></div>

        <div class="mtc-admin-legal-modal-dialog">

            <div class="mtc-admin-legal-modal-header">

                <div>
                    <h2>Create Policy</h2>

                    <p>
                        Create a new policy for the
                        Midwest Toy Connections storefront.
                    </p>
                </div>

                <button
                    type="button"
                    class="mtc-admin-legal-modal-close"
                    id="mtcAdminLegalCreatePolicyCloseButton"
                    aria-label="Close"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>

            <div class="mtc-admin-legal-modal-body">

                <label
                    class="mtc-admin-legal-editor-label"
                    for="mtcAdminLegalCreatePolicyName"
                >
                    Policy Name
                </label>

                <input
                    type="text"
                    id="mtcAdminLegalCreatePolicyName"
                    class="mtc-admin-legal-editor-section-title"
                    placeholder="Example: Preorder Policy"
                    autocomplete="off"
                >

            </div>

            <div class="mtc-admin-legal-modal-footer">

                <button
                    type="button"
                    class="mtc-admin-legal-preview-button"
                    id="mtcAdminLegalCreatePolicyCancelButton"
                >
                    Cancel
                </button>

                <button
                    type="button"
                    class="mtc-admin-legal-publish-button"
                    id="mtcAdminLegalCreatePolicyConfirmButton"
                >
                    <i class="fa-solid fa-plus"></i>
                    Create Policy
                </button>

            </div>

        </div>
    `;

    document.body.appendChild(modal);
}

/* ========================================================= CREATE PREVIEW MODAL
========================================================= */ function createLegalPreviewModal() { if (
document.getElementById( "mtcAdminLegalPreviewModal" ) ) { return; } const modal = document.createElement("div");
modal.id = "mtcAdminLegalPreviewModal"; modal.className = "mtc-admin-legal-modal"; modal.style.display = "none";
modal.innerHTML = `

<div class="mtc-admin-legal-modal-backdrop"></div>

<div class="mtc-admin-legal-modal-dialog mtc-admin-legal-preview-dialog">
    <div class="mtc-admin-legal-modal-header">
        <div>
            <h2 id="mtcAdminLegalPreviewTitle">Legal Document Preview</h2>

            <p>Preview how the document content will appear.</p>
        </div>

        <button type="button" class="mtc-admin-legal-modal-close" id="mtcAdminLegalPreviewCloseButton">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>

    <div class="mtc-admin-legal-preview-content" id="mtcAdminLegalPreviewContent"></div>

    <div class="mtc-admin-legal-modal-footer">
        <div></div>

        <button type="button" class="mtc-admin-legal-preview-button" id="mtcAdminLegalPreviewDoneButton">
            Close Preview
        </button>
    </div>
</div>
`; document.body.appendChild(modal); }

/* ========================================================= CREATE PUBLISH CONFIRMATION MODAL
========================================================= */ function createLegalPublishConfirmModal() { if (
document.getElementById( "mtcAdminLegalPublishConfirmModal" ) ) { return; } const modal = document.createElement("div");
modal.id = "mtcAdminLegalPublishConfirmModal"; modal.className = "mtc-admin-legal-modal"; modal.style.display = "none";
modal.innerHTML = `

<div class="mtc-admin-legal-modal-backdrop"></div>

<div class="mtc-admin-legal-modal-dialog mtc-admin-legal-confirm-dialog">
    <div class="mtc-admin-legal-modal-header">
        <div>
            <h2>Publish Legal Document?</h2>

            <p>This will make the new version active on the storefront.</p>
        </div>
    </div>

    <div class="mtc-admin-legal-confirm-body">
        <div class="mtc-admin-legal-confirm-icon">
            <i class="fa-solid fa-triangle-exclamation"></i>
        </div>

        <p>
            Publishing will save the current document as the newest published version. The previous version will remain
            available in Version History.
        </p>
    </div>

    <div class="mtc-admin-legal-modal-footer">
        <button type="button" class="mtc-admin-legal-preview-button" id="mtcAdminLegalPublishCancelButton">
            Cancel
        </button>

        <button type="button" class="mtc-admin-legal-publish-button" id="mtcAdminLegalPublishConfirmButton">
            <i class="fa-solid fa-upload"></i>
            Publish
        </button>
    </div>
</div>
`; document.body.appendChild(modal); }

/* =========================================================
   CREATE UNPUBLISH CONFIRM MODAL
========================================================= */

function createLegalUnpublishConfirmModal() {

    if (
        document.getElementById(
            "mtcAdminLegalUnpublishConfirmModal"
        )
    ) {
        return;
    }

    const modal =
        document.createElement("div");

    modal.id =
    "mtcAdminLegalUnpublishConfirmModal";

    modal.className =
        "mtc-admin-legal-modal";

    modal.style.display =
        "none";

    modal.innerHTML = `
        <div class="mtc-admin-legal-confirm-modal">

            <div class="mtc-admin-legal-confirm-icon mtc-admin-legal-unpublish-confirm-icon">
                <i class="fa-solid fa-eye-slash"></i>
            </div>

            <h2>Unpublish Policy?</h2>

            <p>
                Are you sure you want to unpublish this policy?
                It will no longer be available to customers.
            </p>

            <div class="mtc-admin-legal-confirm-actions">

                <button
                    type="button"
                    class="mtc-admin-legal-preview-button"
                    id="mtcAdminLegalUnpublishCancelButton"
                >
                    Cancel
                </button>

                <button
                    type="button"
                    class="mtc-admin-legal-unpublish-button"
                    id="mtcAdminLegalUnpublishConfirmButton"
                >
                    <i class="fa-solid fa-eye-slash"></i>
                    Yes, Unpublish
                </button>

            </div>

        </div>
    `;

    document.body.appendChild(modal);
}

/* =========================================================
   MODAL HELPERS
========================================================= */

function openLegalModal(modalId) {
    const modal = document.getElementById(modalId);

    if (!modal) {
        return;
    }

    modal.style.display = "flex";

}

function closeLegalModal(modalId) {
    const modal = document.getElementById(modalId);

    if (!modal) {
        return;
    }

    modal.style.display = "none";

    document.body.style.overflow = "";
}

/* =========================================================
   LOAD LEGAL DOCUMENTS
========================================================= */

async function loadLegalDocuments() {
    const client = getMtcLegalSupabaseClient();

    if (!client) {
        console.warn("Legal: Supabase client is not available.");

        return;
    }

    try {
        const { data, error } = await client
            .from("Legal_Documents")
            .select("*")
            .order("created_at", { ascending: true });

        if (error) {
            throw error;
        }

        mtcLegalDocuments.terms = null;
        mtcLegalDocuments.privacy = null;

        for (const documentRecord of data || []) {
            const type = documentRecord.document_type;

            if (!type) {
    continue;
}

mtcLegalDocuments[type] =
    documentRecord;

if (!MTC_LEGAL_DOCUMENTS[type]) {

    MTC_LEGAL_DOCUMENTS[type] = {
        type: type,

        title:
            documentRecord.title ||
            "Legal Policy",

        storefrontPage:
            `mw-policy.html?policy=${encodeURIComponent(type)}`,

        statusElementId:
            `mtcAdminLegalCustomStatus_${type}`,

        updatedElementId:
            `mtcAdminLegalCustomUpdated_${type}`
    };
}

if (!MTC_LEGAL_SECTIONS[type]) {

    MTC_LEGAL_SECTIONS[type] = [];
}
        }

        renderLegalDocumentCards();
    } catch (error) {
        console.error("Error loading legal documents:", error);

        showLegalNotification("Unable to load legal documents.", "error");
    }
}

/* =========================================================
   RENDER LEGAL DOCUMENT CARDS
========================================================= */
function renderLegalDocumentCards() {

    const storePoliciesStatus =
        document.getElementById(
            "mtcAdminLegalStorePoliciesStatus"
        );

    const totalPolicies =
        Object.values(mtcLegalDocuments)
            .filter((documentRecord) =>
                documentRecord
            )
            .length;

    const publishedCount =
        Object.values(mtcLegalDocuments)
            .filter((documentRecord) =>
                documentRecord &&
                normalizeLegalStatus(
                    documentRecord.status
                ) === "published"
            )
            .length;

    if (storePoliciesStatus) {

        storePoliciesStatus.textContent =
            `${publishedCount} of ${totalPolicies} Published`;
    }


    /* =========================================
       TERMS + PRIVACY CARDS
    ========================================= */

    for (
        const type of [
            "terms",
            "privacy"
        ]
    ) {

        const definition =
            MTC_LEGAL_DOCUMENTS[type];

        if (!definition) {
            continue;
        }

        const documentRecord =
            mtcLegalDocuments[type];

        const statusElement =
            document.getElementById(
                definition.statusElementId
            );

        const updatedElement =
            document.getElementById(
                definition.updatedElementId
            );

        if (
            !statusElement ||
            !updatedElement
        ) {
            continue;
        }


        if (!documentRecord) {

            statusElement.textContent =
                "Draft";

            statusElement.className =
                "mtc-admin-legal-status " +
                "mtc-admin-legal-status-draft";

            updatedElement.textContent =
                "Not Published";

            continue;
        }


        const status =
            normalizeLegalStatus(
                documentRecord.status
            );


        if (status === "published") {

            statusElement.textContent =
                "Published";

            statusElement.className =
                "mtc-admin-legal-status " +
                "mtc-admin-legal-status-published";

        } else {

            statusElement.textContent =
                "Draft";

            statusElement.className =
                "mtc-admin-legal-status " +
                "mtc-admin-legal-status-draft";
        }


        updatedElement.textContent =
            formatLegalDate(
                documentRecord.updated_at
            );
    }


    /* =========================================
       CUSTOM POLICY CARDS
    ========================================= */

    const legalGrid =
        document.getElementById(
            "mtcAdminLegalGrid"
        );

    if (!legalGrid) {
        return;
    }


    legalGrid
        .querySelectorAll(
            ".mtc-admin-legal-custom-card"
        )
        .forEach((card) => {
            card.remove();
        });


    Object.entries(
        mtcLegalDocuments
    ).forEach(
        ([type, documentRecord]) => {

            if (
                type === "terms" ||
                type === "privacy" ||
                !documentRecord
            ) {
                return;
            }


            const status =
                normalizeLegalStatus(
                    documentRecord.status
                );

            const statusClass =
                status === "published"
                    ? "mtc-admin-legal-status-published"
                    : "mtc-admin-legal-status-draft";


            const card =
                document.createElement(
                    "article"
                );

            card.className =
                "mtc-admin-legal-card " +
                "mtc-admin-legal-custom-card";

            card.dataset.legalType =
                type;


            card.innerHTML = `
                <div
                    class="mtc-admin-legal-card-icon"
                >
                    <i
                        class="fa-solid fa-file-lines"
                    ></i>
                </div>

                <div
                    class="mtc-admin-legal-card-content"
                >

                    <div
                        class="mtc-admin-legal-card-heading"
                    >

                        <div>

                            <h3>
                                ${escapeLegalHtml(
                                    documentRecord.title ||
                                    "Legal Policy"
                                )}
                            </h3>

                            <p>
                                Custom storefront policy.
                            </p>

                        </div>

                        <span
                            class="mtc-admin-legal-status ${statusClass}"
                        >
                            ${
                                status === "published"
                                    ? "Published"
                                    : "Draft"
                            }
                        </span>

                    </div>


                    <div
                        class="mtc-admin-legal-card-meta"
                    >

                        <span>

                            <i
                                class="fa-regular fa-clock"
                            ></i>

                            Last Updated:

                            <strong>
                                ${escapeLegalHtml(
                                    formatLegalDate(
                                        documentRecord.updated_at
                                    )
                                )}
                            </strong>

                        </span>

                    </div>


                    <div
    class="mtc-admin-legal-card-actions"
>

    ${
        canEditLegal
            ? `
                <button
                    type="button"
                    class="mtc-admin-legal-edit-button"
                    data-legal-action="edit"
                    data-legal-type="${escapeLegalHtml(type)}"
                >
                    <i class="fa-solid fa-pen"></i>
                    Edit
                </button>
            `
            : ""
    }

    <button
        type="button"
        class="mtc-admin-legal-preview-button"
        data-legal-action="preview"
        data-legal-type="${escapeLegalHtml(type)}"
    >
        <i class="fa-regular fa-eye"></i>
        Preview
    </button>

    ${
        canDeleteLegal
            ? `
                <button
                    type="button"
                    class="mtc-admin-legal-delete-policy-button"
                    data-legal-action="delete"
                    data-legal-type="${escapeLegalHtml(type)}"
                    aria-label="Delete Policy"
                    title="Delete Policy"
                >
                    <i class="fa-solid fa-trash"></i>
                </button>
            `
            : ""
    }

</div>
            `;
            legalGrid.appendChild(
                card
            );
        }
    );
    bindLegalCardEvents();
}

/* =========================================================
   LEGAL SECTION DATA HELPERS
========================================================= */
function parseLegalSectionContent(type, storedContent) {
    const defaultSections =
        MTC_LEGAL_SECTIONS[type] || [];

    function getDefaultSections() {
        const sectionData = {};

        defaultSections.forEach((section) => {
            sectionData[section.key] = {
                title: section.title,
                content: ""
            };
        });

        return sectionData;
    }

    // No saved document yet:
    // start with the original default sections.
    if (!storedContent) {
        return getDefaultSections();
    }

    try {
        const parsed =
            JSON.parse(storedContent);

        if (
            !parsed ||
            typeof parsed !== "object" ||
            Array.isArray(parsed)
        ) {
            return getDefaultSections();
        }

        const sectionData = {};

        // IMPORTANT:
        // Only load sections that actually exist
        // in the saved JSON.
        Object.entries(parsed).forEach(
            ([key, savedSection]) => {

                const defaultSection =
                    defaultSections.find(
                        (section) =>
                            section.key === key
                    );

                if (
                    savedSection &&
                    typeof savedSection === "object" &&
                    !Array.isArray(savedSection)
                ) {
                    sectionData[key] = {
                        title: String(
                            savedSection.title ||
                            defaultSection?.title ||
                            "Legal Section"
                        ),

                        content: String(
                            savedSection.content ||
                            ""
                        )
                    };

                    return;
                }

                // Support older saved format.
                if (
                    typeof savedSection === "string"
                ) {
                    sectionData[key] = {
                        title:
                            defaultSection?.title ||
                            "Legal Section",

                        content:
                            savedSection
                    };
                }
            }
        );

        return sectionData;

    } catch (error) {
        console.warn(
            "Legal content is not structured JSON yet.",
            error
        );

        return getDefaultSections();
    }
}

/* =========================================================
   COLLECT CURRENT EDITOR SECTIONS
========================================================= */

function collectLegalEditorSections() {
    const editorSections =
        document.querySelectorAll(
            "#mtcAdminLegalEditorSections .mtc-admin-legal-editor-section"
        );

    const sectionData = {};

    editorSections.forEach(
        (section, index) => {

            const titleInput =
                section.querySelector(
                    "[data-legal-section-title]"
                );

            const contentTextarea =
                section.querySelector(
                    "[data-legal-section]"
                );

            if (
                !titleInput ||
                !contentTextarea
            ) {
                return;
            }

            let sectionKey =
                contentTextarea.dataset
                    .legalSection;

            // Safety fallback in case a section
            // somehow does not have a key.
            if (!sectionKey) {
                sectionKey =
                    `custom_${Date.now()}_${index}`;

                contentTextarea.dataset
                    .legalSection =
                    sectionKey;

                titleInput.dataset
                    .legalSectionTitle =
                    sectionKey;
            }

            sectionData[sectionKey] = {
                title:
                    titleInput.value.trim() ||
                    `Legal Section ${index + 1}`,

                content:
                    contentTextarea.value.trim()
            };
        }
    );

    return sectionData;
}


function addLegalEditorSection() {
    const container = document.getElementById(
        "mtcAdminLegalEditorSections"
    );

    if (!container) {
        return;
    }

    const existingSections =
        container.querySelectorAll(
            ".mtc-admin-legal-editor-section"
        );

    const sectionNumber =
        existingSections.length + 1;

    const sectionKey =
        `custom_${Date.now()}`;

    const sectionElement =
        document.createElement("div");

    sectionElement.className =
        "mtc-admin-legal-editor-section";

    sectionElement.innerHTML = `
        <div class="mtc-admin-legal-editor-section-header">

            <span>
                ${sectionNumber}
            </span>

            <input
                type="text"
                class="mtc-admin-legal-editor-section-title"
                data-legal-section-title="${sectionKey}"
                value="New Legal Section"
                spellcheck="true"
            />

            <button
                type="button"
                class="mtc-admin-legal-delete-section-button"
                aria-label="Delete section"
                title="Delete Section"
                onclick="deleteLegalEditorSection(this)"
            >
                <i class="fa-solid fa-trash"></i>
            </button>

        </div>

        <textarea
            class="mtc-admin-legal-editor-section-textarea"
            data-legal-section="${sectionKey}"
            spellcheck="true"
            placeholder="Enter legal section content..."
        ></textarea>
    `;

    container.appendChild(
        sectionElement
    );

    sectionElement
        .querySelectorAll(
            "[data-legal-section], [data-legal-section-title]"
        )
        .forEach((input) => {
            input.addEventListener(
                "input",
                updateLegalEditorInformation
            );
        });

    updateLegalEditorInformation();

    const titleInput =
        sectionElement.querySelector(
            "[data-legal-section-title]"
        );

    titleInput?.focus();
    titleInput?.select();
}

/* =========================================================
   SERIALIZE LEGAL EDITOR
========================================================= */

function serializeLegalEditorSections() {
    return JSON.stringify(
        collectLegalEditorSections()
    );
}


/* =========================================================
   CHECK FOR LEGAL CONTENT
========================================================= */
function legalSectionsHaveContent(sectionData) {
    if (
        !sectionData ||
        typeof sectionData !== "object"
    ) {
        return false;
    }

    return Object.keys(sectionData).length > 0;
}

/* =========================================================
   RENUMBER LEGAL SECTIONS
========================================================= */

function renumberLegalEditorSections() {
    const sections =
        document.querySelectorAll(
            "#mtcAdminLegalEditorSections .mtc-admin-legal-editor-section"
        );

    sections.forEach(
        (section, index) => {

            const number =
                section.querySelector(
                    ".mtc-admin-legal-editor-section-header > span"
                );

            if (number) {
                number.textContent =
                    index + 1;
            }
        }
    );
}


/* =========================================================
   DELETE LEGAL SECTION
========================================================= */

function deleteLegalEditorSection(
    button
) {
    const section =
        button.closest(
            ".mtc-admin-legal-editor-section"
        );

    if (!section) {
        return;
    }

    const titleInput =
        section.querySelector(
            "[data-legal-section-title]"
        );

    const sectionTitle =
        titleInput?.value.trim() ||
        "this legal section";

    const overlay =
        document.createElement("div");

    overlay.className =
        "mtc-admin-legal-delete-confirm-overlay";

    overlay.innerHTML = `
        <div
            class="mtc-admin-legal-delete-confirm"
        >

            <div
                class="mtc-admin-legal-delete-confirm-icon"
            >
                <i
                    class="fa-solid fa-trash"
                ></i>
            </div>

            <h3>
                Delete Legal Section?
            </h3>

            <p>
                Are you sure you want to delete
                <strong>
                    ${escapeLegalHtml(sectionTitle)}
                </strong>?

                This section will be removed
                from the document.
            </p>

            <div
                class="mtc-admin-legal-delete-confirm-actions"
            >

                <button
                    type="button"
                    class="mtc-admin-legal-delete-cancel"
                >
                    Cancel
                </button>

                <button
                    type="button"
                    class="mtc-admin-legal-delete-confirm-button"
                >
                    <i
                        class="fa-solid fa-trash"
                    ></i>

                    Delete
                </button>

            </div>

        </div>
    `;

    document.body.appendChild(
        overlay
    );

    const cancelButton =
        overlay.querySelector(
            ".mtc-admin-legal-delete-cancel"
        );

    const deleteButton =
        overlay.querySelector(
            ".mtc-admin-legal-delete-confirm-button"
        );

    cancelButton?.addEventListener(
        "click",
        () => {
            overlay.remove();
        }
    );

    deleteButton?.addEventListener(
        "click",
        () => {

            section.remove();

            renumberLegalEditorSections();

            updateLegalEditorInformation();

            overlay.remove();
        }
    );

    overlay.addEventListener(
        "click",
        (event) => {

            if (
                event.target === overlay
            ) {
                overlay.remove();
            }
        }
    );
}

/* =========================================================
   RENDER LEGAL EDITOR SECTIONS
========================================================= */
function renderLegalEditorSections(type, storedContent = "") {
    const container = document.getElementById(
        "mtcAdminLegalEditorSections"
    );

    if (!container) {
        return;
    }

    const savedSections =
        parseLegalSectionContent(
            type,
            storedContent
        );

    const sections =
        Object.entries(savedSections);

    container.innerHTML = sections
        .map(([sectionKey, savedSection], index) => {

            const savedTitle =
                savedSection?.title ||
                `Legal Section ${index + 1}`;

            const savedContent =
                savedSection?.content ||
                "";

            return `
                <div
                    class="mtc-admin-legal-editor-section"
                >

                    <div
                        class="mtc-admin-legal-editor-section-header"
                    >

                        <span>
                            ${index + 1}
                        </span>

                        <input
                            type="text"
                            class="mtc-admin-legal-editor-section-title"
                            data-legal-section-title="${escapeLegalHtml(sectionKey)}"
                            value="${escapeLegalHtml(savedTitle)}"
                            spellcheck="true"
                        />

                        <button
                            type="button"
                            class="mtc-admin-legal-delete-section-button"
                            aria-label="Delete section"
                            title="Delete Section"
                            onclick="deleteLegalEditorSection(this)"
                        >
                            <i
                                class="fa-solid fa-trash"
                            ></i>
                        </button>

                    </div>

                    <textarea
                        class="mtc-admin-legal-editor-section-textarea"
                        data-legal-section="${escapeLegalHtml(sectionKey)}"
                        spellcheck="true"
                        placeholder="Enter legal section content..."
                    >${escapeLegalHtml(savedContent)}</textarea>

                </div>
            `;
        })
        .join("");

    container
        .querySelectorAll(
            "[data-legal-section], [data-legal-section-title]"
        )
        .forEach((input) => {

            input.addEventListener(
                "input",
                updateLegalEditorInformation
            );
        });

    renumberLegalEditorSections();
}

/* =========================================================
   OPEN LEGAL EDITOR
========================================================= */

function openLegalEditor(type) {
    const definition =
        getLegalDocumentDefinition(type);

    if (!definition) {
        return;
    }

    const documentRecord =
        mtcLegalDocuments[type];

    mtcLegalActiveDocumentType = type;

    mtcLegalActiveDocument = documentRecord;

    const title = document.getElementById(
        "mtcAdminLegalEditModalTitle"
    );

    const subtitle = document.getElementById(
        "mtcAdminLegalEditModalSubtitle"
    );

    const status = document.getElementById(
        "mtcAdminLegalEditorCurrentStatus"
    );

    const updated = document.getElementById(
        "mtcAdminLegalEditorLastUpdated"
    );

    title.textContent =
        `Edit ${definition.title}`;

    subtitle.textContent =
        `Manage each section of the ${definition.title} shown on the storefront.`;

    const content =
        documentRecord?.draft_content ??
        documentRecord?.published_content ??
        "";

    renderLegalEditorSections(
        type,
        content
    );

    mtcLegalEditorOriginalContent =
        serializeLegalEditorSections();

    mtcLegalEditorHasChanges = false;

    status.textContent = documentRecord
        ? normalizeLegalStatus(documentRecord.status) === "published"
            ? "Published"
            : "Draft"
        : "Draft";

    updated.textContent = documentRecord
        ? formatLegalDate(documentRecord.updated_at)
        : "Not Published";

    updateLegalEditorInformation();

    const addSectionButton =
        document.getElementById(
            "mtcAdminLegalAddSectionButton"
        );

    const saveDraftButton =
        document.getElementById(
            "mtcAdminLegalSaveDraftButton"
        );

    const publishButton =
        document.getElementById(
            "mtcAdminLegalPublishButton"
        );

    const unpublishButton =
        document.getElementById(
            "mtcAdminLegalUnpublishButton"
        );

    if (addSectionButton) {
        addSectionButton.style.display =
            canEditLegal ? "" : "none";
    }

    if (saveDraftButton) {
        saveDraftButton.style.display =
            canEditLegal ? "" : "none";
    }

    if (publishButton) {
        publishButton.style.display =
            canPublishLegal ? "" : "none";
    }

    if (unpublishButton) {
        unpublishButton.style.display =
            canPublishLegal ? "" : "none";
    }

    document
        .querySelectorAll(
            "#mtcAdminLegalEditorSections .mtc-admin-legal-delete-section-button"
        )
        .forEach((button) => {
            button.style.display =
                canEditLegal ? "" : "none";
        });

    openLegalModal(
        "mtcAdminLegalEditModal"
    );
}


/* =========================================================
   EDITOR CHANGE TRACKING
========================================================= */
function updateLegalEditorInformation() {
    const count = document.getElementById(
        "mtcAdminLegalEditorCharacterCount"
    );

    const unsaved = document.getElementById(
        "mtcAdminLegalEditorUnsavedStatus"
    );

    if (!count || !unsaved) {
        return;
    }

    const sectionData =
        collectLegalEditorSections();

    let totalCharacters = 0;

    Object.values(sectionData).forEach((section) => {
        totalCharacters +=
            String(section.title || "").length;

        totalCharacters +=
            String(section.content || "").length;
    });

    const currentContent =
        JSON.stringify(sectionData);

    count.textContent =
        `${totalCharacters.toLocaleString()} characters`;

    mtcLegalEditorHasChanges =
        currentContent !== mtcLegalEditorOriginalContent;

    unsaved.textContent =
        mtcLegalEditorHasChanges
            ? "Unsaved changes"
            : "No unsaved changes";
}

/* =========================================================
   SAVE LEGAL DRAFT
========================================================= */

async function saveLegalDraft() {

    if (!canEditLegal) {
        showLegalNotification(
            "You do not have permission to edit legal policies.",
            "error"
        );

        return;
    }

    if (!mtcLegalActiveDocumentType) {
        return;
    }

    const client =
        getMtcLegalSupabaseClient();

    if (!client) {
        showLegalNotification(
            "Supabase is not available.",
            "error"
        );

        return;
    }

    const sectionData =
        collectLegalEditorSections();

    if (!legalSectionsHaveContent(sectionData)) {
        showLegalNotification(
            "The legal document cannot be empty.",
            "warning"
        );

        return;
    }

    const content =
        JSON.stringify(sectionData);

    const saveButton =
        document.getElementById(
            "mtcAdminLegalSaveDraftButton"
        );

    saveButton.disabled = true;

    try {
        const now =
            new Date().toISOString();

        const existing =
            mtcLegalDocuments[
                mtcLegalActiveDocumentType
            ];

        let result;

        if (existing?.id) {
            result = await client
                .from("Legal_Documents")
                .update({
                    draft_content: content,
                    status: "draft",
                    updated_at: now,
                })
                .eq("id", existing.id)
                .select()
                .single();
        } else {
            result = await client
                .from("Legal_Documents")
                .insert({
                    document_type:
                        mtcLegalActiveDocumentType,

                    title:
                        MTC_LEGAL_DOCUMENTS[
                            mtcLegalActiveDocumentType
                        ].title,

                    draft_content: content,

                    published_content: null,

                    status: "draft",

                    updated_at: now,
                })
                .select()
                .single();
        }

        if (result.error) {
            throw result.error;
        }

        mtcLegalDocuments[
            mtcLegalActiveDocumentType
        ] = result.data;

        mtcLegalActiveDocument =
            result.data;

        mtcLegalEditorOriginalContent =
            content;

        mtcLegalEditorHasChanges =
            false;

        renderLegalDocumentCards();

        updateLegalEditorInformation();

        const status =
            document.getElementById(
                "mtcAdminLegalEditorCurrentStatus"
            );

        const updated =
            document.getElementById(
                "mtcAdminLegalEditorLastUpdated"
            );

        status.textContent = "Draft";

        updated.textContent =
            formatLegalDate(
                result.data.updated_at
            );

        showLegalNotification(
            "Draft saved successfully."
        );
    } catch (error) {
        console.error(
            "Error saving legal draft:",
            error
        );

        showLegalNotification(
            "Unable to save the legal draft.",
            "error"
        );
    } finally {
        saveButton.disabled = false;
    }
}

/* =========================================================
   UNPUBLISH LEGAL DOCUMENT
========================================================= */

async function unpublishLegalDocument() {

    if (!canPublishLegal) {
        showLegalNotification(
            "You do not have permission to publish or unpublish legal policies.",
            "error"
        );

        return;
    }

    if (!mtcLegalActiveDocumentType) {
        return;
    }

    const client =
        getMtcLegalSupabaseClient();

    if (!client) {
        showLegalNotification(
            "Supabase is not available.",
            "error"
        );

        return;
    }

    const existing =
        mtcLegalDocuments[
            mtcLegalActiveDocumentType
        ];

    if (!existing?.id) {
        showLegalNotification(
            "This policy has not been published yet.",
            "warning"
        );

        return;
    }

    if (
        normalizeLegalStatus(existing.status) !==
        "published"
    ) {
        showLegalNotification(
            "This policy is already unpublished.",
            "info"
        );

        return;
    }

    const unpublishButton =
        document.getElementById(
            "mtcAdminLegalUnpublishButton"
        );

    if (unpublishButton) {
        unpublishButton.disabled = true;
    }

    try {

        const now =
            new Date().toISOString();

        const { data, error } =
            await client
                .from("Legal_Documents")
                .update({
                    status: "draft",
                    updated_at: now
                })
                .eq("id", existing.id)
                .select()
                .single();

        if (error) {
            throw error;
        }

        mtcLegalDocuments[
            mtcLegalActiveDocumentType
        ] = data;

        mtcLegalActiveDocument = data;

        const status =
            document.getElementById(
                "mtcAdminLegalEditorCurrentStatus"
            );

        const updated =
            document.getElementById(
                "mtcAdminLegalEditorLastUpdated"
            );

        if (status) {
            status.textContent = "Draft";
        }

        if (updated) {
            updated.textContent =
                formatLegalDate(
                    data.updated_at
                );
        }

        renderLegalDocumentCards();

        showLegalNotification(
            `${MTC_LEGAL_DOCUMENTS[mtcLegalActiveDocumentType].title} unpublished successfully.`
        );

    } catch (error) {

        console.error(
            "Error unpublishing legal document:",
            error
        );

        showLegalNotification(
            "Unable to unpublish the legal document.",
            "error"
        );

    } finally {

        if (unpublishButton) {
            unpublishButton.disabled = false;
        }
    }
}

/* =========================================================
   START PUBLISH PROCESS
========================================================= */

function requestLegalPublish() {

        if (!canPublishLegal) {
        showLegalNotification(
            "You do not have permission to publish legal policies.",
            "error"
        );

        return;
    }

    if (!mtcLegalActiveDocumentType) {
        return;
    }

    const sectionData =
        collectLegalEditorSections();

    if (!legalSectionsHaveContent(sectionData)) {
        showLegalNotification(
            "The legal document cannot be empty.",
            "warning"
        );

        return;
    }

    openLegalModal(
        "mtcAdminLegalPublishConfirmModal"
    );
}


/* =========================================================
   PUBLISH LEGAL DOCUMENT
========================================================= */

async function publishLegalDocument() {

    if (!canPublishLegal) {
        showLegalNotification(
            "You do not have permission to publish legal policies.",
            "error"
        );

        return;
    }

    if (!mtcLegalActiveDocumentType) {
        return;
    }

    const client =
        getMtcLegalSupabaseClient();

    if (!client) {
        showLegalNotification(
            "Supabase is not available.",
            "error"
        );

        return;
    }

    const sectionData =
        collectLegalEditorSections();

    if (!legalSectionsHaveContent(sectionData)) {
        showLegalNotification(
            "The legal document cannot be empty.",
            "warning"
        );

        return;
    }

    const content =
        JSON.stringify(sectionData);

    const publishButton =
        document.getElementById(
            "mtcAdminLegalPublishConfirmButton"
        );

    publishButton.disabled = true;

    try {
        const now =
            new Date().toISOString();

        const { data: sessionData } =
            await client.auth.getSession();

        const currentUser =
            sessionData?.session?.user ?? null;

        const existing =
            mtcLegalDocuments[
                mtcLegalActiveDocumentType
            ];

        let legalDocument;

        if (existing?.id) {
            const { data, error } =
                await client
                    .from("Legal_Documents")
                    .update({
                        draft_content: content,
                        published_content: content,
                        status: "published",
                        published_at: now,
                        updated_at: now,
                        published_by:
                            currentUser?.id ?? null,
                    })
                    .eq("id", existing.id)
                    .select()
                    .single();

            if (error) {
                throw error;
            }

            legalDocument = data;
        } else {
            const { data, error } =
                await client
                    .from("Legal_Documents")
                    .insert({
                        document_type:
                            mtcLegalActiveDocumentType,

                        title:
                            MTC_LEGAL_DOCUMENTS[
                                mtcLegalActiveDocumentType
                            ].title,

                        draft_content: content,

                        published_content: content,

                        status: "published",

                        published_at: now,

                        updated_at: now,

                        published_by:
                            currentUser?.id ?? null,
                    })
                    .select()
                    .single();

            if (error) {
                throw error;
            }

            legalDocument = data;
        }

        const {
            data: existingVersions,
            error: versionCountError,
        } = await client
            .from("Legal_Versions")
            .select("version_number")
            .eq(
                "document_type",
                mtcLegalActiveDocumentType
            )
            .order(
                "version_number",
                {
                    ascending: false,
                }
            )
            .limit(1);

        if (versionCountError) {
            throw versionCountError;
        }

        let nextVersionNumber = 1;

        if (
            existingVersions &&
            existingVersions.length > 0
        ) {
            nextVersionNumber =
                Number(
                    existingVersions[0]
                        .version_number
                ) + 1;
        }

        const {
            error: versionInsertError,
        } = await client
            .from("Legal_Versions")
            .insert({
                legal_document_id:
                    legalDocument.id,

                document_type:
                    mtcLegalActiveDocumentType,

                title:
                    MTC_LEGAL_DOCUMENTS[
                        mtcLegalActiveDocumentType
                    ].title,

                version_number:
                    nextVersionNumber,

                content: content,

                published_at: now,

                published_by:
                    currentUser?.id ?? null,
            });

        if (versionInsertError) {
            throw versionInsertError;
        }

        mtcLegalDocuments[
            mtcLegalActiveDocumentType
        ] = legalDocument;

        mtcLegalActiveDocument =
            legalDocument;

        mtcLegalEditorOriginalContent =
            content;

        mtcLegalEditorHasChanges =
            false;

        closeLegalModal(
            "mtcAdminLegalPublishConfirmModal"
        );

        closeLegalModal(
            "mtcAdminLegalEditModal"
        );

        renderLegalDocumentCards();

        mtcLegalVersionCurrentPage = 1;

        await loadLegalVersionHistory();

        showLegalNotification(
            `${MTC_LEGAL_DOCUMENTS[mtcLegalActiveDocumentType].title} published successfully.`
        );
    } catch (error) {
        console.error(
            "Error publishing legal document:",
            error
        );

        showLegalNotification(
            "Unable to publish the legal document.",
            "error"
        );
    } finally {
        publishButton.disabled = false;
    }
}


/* =========================================================
   BUILD LEGAL PREVIEW
========================================================= */
function buildLegalSectionPreview(
    type,
    storedContent
) {
    const sectionData =
        parseLegalSectionContent(
            type,
            storedContent
        );

    const sections =
        Object.entries(sectionData);

    return sections
        .map(
            ([sectionKey, savedSection], index) => {

                const sectionTitle =
                    savedSection?.title ||
                    `Legal Section ${index + 1}`;

                const sectionContent =
                    savedSection?.content ||
                    "";

                return `
                    <div
                        class="mtc-admin-legal-preview-section"
                    >

                        <h3>
                            ${index + 1}. ${escapeLegalHtml(sectionTitle)}
                        </h3>

                        <div>
                            ${escapeLegalHtml(sectionContent)
                                .replace(/\n/g, "<br>")}
                        </div>

                    </div>
                `;
            }
        )
        .join("");
}
/* =========================================================
   PREVIEW CURRENT DOCUMENT
========================================================= */

function previewLegalDocument(
    type,
    useEditor = false
) {
    const definition =
        getLegalDocumentDefinition(type);

    if (!definition) {
        return;
    }

    let content = "";

    if (useEditor) {
        content =
            serializeLegalEditorSections();
    } else {
        const documentRecord =
            mtcLegalDocuments[type];

        content =
            documentRecord?.published_content ||
            documentRecord?.draft_content ||
            "";
    }

    const title =
        document.getElementById(
            "mtcAdminLegalPreviewTitle"
        );

    const preview =
        document.getElementById(
            "mtcAdminLegalPreviewContent"
        );

    title.textContent =
        definition.title;

    const sectionData =
        parseLegalSectionContent(
            type,
            content
        );

    if (!legalSectionsHaveContent(sectionData)) {
        preview.innerHTML = `
            <div class="mtc-admin-legal-preview-empty">

                <i class="fa-regular fa-file-lines"></i>

                <p>
                    No content has been saved yet.
                </p>

            </div>
        `;
    } else {
        preview.innerHTML =
            buildLegalSectionPreview(
                type,
                content
            );
    }

    openLegalModal(
        "mtcAdminLegalPreviewModal"
    );
}

async function loadLegalVersionHistory() {
    const client = getMtcLegalSupabaseClient();

    if (!client) {
        console.warn("Legal: Supabase client unavailable for version history.");

        return;
    }

    try {
        const { data, error } = await client.from("Legal_Versions").select("*").order("published_at", {
            ascending: false,
        });

        if (error) {
            throw error;
        }

        mtcLegalVersionHistory = Array.isArray(data) ? data : [];

        renderLegalVersionHistory();
    } catch (error) {
        console.error("Error loading legal version history:", error);

        showLegalNotification("Unable to load version history.", "error");
    }
}

/* =========================================================
   RENDER VERSION HISTORY
========================================================= */

function renderLegalVersionHistory() {
    const historySection = document.getElementById("mtcAdminLegalHistory");

    if (!historySection) {
        return;
    }

    const existingContent = document.getElementById("mtcAdminLegalHistoryContent");

    if (existingContent) {
        existingContent.remove();
    }

    const oldEmptyState = document.getElementById("mtcAdminLegalHistoryEmpty");

    if (oldEmptyState) {
        oldEmptyState.style.display = mtcLegalVersionHistory.length ? "none" : "flex";
    }

    if (mtcLegalVersionHistory.length === 0) {
        return;
    }

    const totalPages = Math.max(1, Math.ceil(mtcLegalVersionHistory.length / LEGAL_VERSION_HISTORY_PER_PAGE));

    if (mtcLegalVersionCurrentPage > totalPages) {
        mtcLegalVersionCurrentPage = totalPages;
    }

    const startIndex = (mtcLegalVersionCurrentPage - 1) * LEGAL_VERSION_HISTORY_PER_PAGE;

    const endIndex = startIndex + LEGAL_VERSION_HISTORY_PER_PAGE;

    const pageVersions = mtcLegalVersionHistory.slice(startIndex, endIndex);

    const content = document.createElement("div");

    content.id = "mtcAdminLegalHistoryContent";

    content.className = "mtc-admin-legal-history-content";

    const rowsHtml = pageVersions
        .map((version) => {
            const definition = getLegalDocumentDefinition(version.document_type);

            const title = definition?.title || version.title || "Legal Document";

            return `

                    <div
                        class="mtc-admin-legal-history-row"
                    >

                        <div
                            class="mtc-admin-legal-history-document"
                        >

                            <div
                                class="mtc-admin-legal-history-document-icon"
                            >
                                <i
                                    class="fa-solid fa-file-contract"
                                ></i>
                            </div>

                            <div>

                                <strong>
                                    ${escapeLegalHtml(title)}
                                </strong>

                                <span>
                                    Version ${escapeLegalHtml(version.version_number)}
                                </span>

                            </div>

                        </div>


                        <div
                            class="mtc-admin-legal-history-date"
                        >
                            <span>
                                Published
                            </span>

                            <strong>
                                ${escapeLegalHtml(formatLegalDate(version.published_at))}
                            </strong>
                        </div>


                        <div
                            class="mtc-admin-legal-history-action"
                        >

                            <button
                                type="button"
                                class="mtc-admin-legal-preview-button"
                                data-legal-history-view="${escapeLegalHtml(version.id)}"
                            >
                                <i class="fa-regular fa-eye"></i>
                                View
                            </button>

                        </div>

                    </div>
                `;
        })
        .join("");

    content.innerHTML = `

        <div
            class="mtc-admin-legal-history-list"
        >
            ${rowsHtml}
        </div>


        <div
            class="mtc-admin-legal-history-pagination"
        >

            <button
                type="button"
                class="mtc-admin-legal-preview-button"
                id="mtcAdminLegalHistoryPrevious"
                ${mtcLegalVersionCurrentPage <= 1 ? "disabled" : ""}
            >
                <i class="fa-solid fa-chevron-left"></i>
                Previous
            </button>


            <span
                id="mtcAdminLegalHistoryPageIndicator"
            >
                Page
                ${mtcLegalVersionCurrentPage}
                of
                ${totalPages}
            </span>


            <button
                type="button"
                class="mtc-admin-legal-preview-button"
                id="mtcAdminLegalHistoryNext"
                ${mtcLegalVersionCurrentPage >= totalPages ? "disabled" : ""}
            >
                Next
                <i class="fa-solid fa-chevron-right"></i>
            </button>

        </div>
    `;

    historySection.appendChild(content);

    bindLegalVersionHistoryEvents();
}

/* =========================================================
   VERSION HISTORY EVENTS
========================================================= */

function bindLegalVersionHistoryEvents() {
    const previousButton = document.getElementById("mtcAdminLegalHistoryPrevious");

    const nextButton = document.getElementById("mtcAdminLegalHistoryNext");

    if (previousButton) {
        previousButton.addEventListener("click", () => {
            if (mtcLegalVersionCurrentPage > 1) {
                mtcLegalVersionCurrentPage--;

                renderLegalVersionHistory();
            }
        });
    }

    if (nextButton) {
        nextButton.addEventListener("click", () => {
            const totalPages = Math.max(1, Math.ceil(mtcLegalVersionHistory.length / LEGAL_VERSION_HISTORY_PER_PAGE));

            if (mtcLegalVersionCurrentPage < totalPages) {
                mtcLegalVersionCurrentPage++;

                renderLegalVersionHistory();
            }
        });
    }

    const viewButtons = document.querySelectorAll("[data-legal-history-view]");

    viewButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const versionId = button.dataset.legalHistoryView;

            openLegalHistoryVersion(versionId);
        });
    });
}

/* =========================================================
   VIEW VERSION HISTORY DOCUMENT
========================================================= */

function openLegalHistoryVersion(versionId) {
    const version = mtcLegalVersionHistory.find((item) => String(item.id) === String(versionId));

    if (!version) {
        showLegalNotification("Unable to find that version.", "error");

        return;
    }

    const definition = getLegalDocumentDefinition(version.document_type);

    const title = document.getElementById("mtcAdminLegalPreviewTitle");

    const content = document.getElementById("mtcAdminLegalPreviewContent");

    title.textContent = `${definition?.title || version.title || "Legal Document"} — Version ${version.version_number}`;

    content.innerHTML = `
        <div
            class="mtc-admin-legal-version-preview-meta"
        >
            Published:
            ${escapeLegalHtml(formatLegalDate(version.published_at))}
        </div>

        <div class="mtc-admin-legal-version-preview-body">

    ${buildLegalSectionPreview(
        version.document_type,
        version.content
    )}

</div>
    `;

    openLegalModal("mtcAdminLegalPreviewModal");
}

/* =========================================================
   CUSTOM LEGAL POLICY HELPERS
========================================================= */

let mtcLegalPolicyPendingDeleteType = null;


function openDeleteLegalPolicyConfirmation(type) {

    if (
        !type ||
        type === "terms" ||
        type === "privacy"
    ) {
        return;
    }

    const documentRecord =
        mtcLegalDocuments[type];

    if (!documentRecord) {
        return;
    }

    mtcLegalPolicyPendingDeleteType =
        type;


    let overlay =
        document.getElementById(
            "mtcAdminLegalDeletePolicyOverlay"
        );


    if (!overlay) {

        overlay =
            document.createElement("div");

        overlay.id =
            "mtcAdminLegalDeletePolicyOverlay";

        overlay.className =
            "mtc-admin-legal-delete-policy-overlay";

        document.body.appendChild(
            overlay
        );
    }


    overlay.innerHTML = `
        <div class="mtc-admin-legal-delete-policy-confirm">

            <div class="mtc-admin-legal-delete-policy-icon">
                <i class="fa-solid fa-trash"></i>
            </div>

            <h3>
                Delete Policy?
            </h3>

            <p>
                Are you sure you want to delete
                <strong>
                    ${escapeLegalHtml(
                        documentRecord.title ||
                        "this policy"
                    )}
                </strong>?
                This action cannot be undone.
            </p>

            <div class="mtc-admin-legal-delete-policy-actions">

                <button
                    type="button"
                    class="mtc-admin-legal-delete-policy-cancel"
                    id="mtcAdminLegalDeletePolicyCancel"
                >
                    Cancel
                </button>

                <button
                    type="button"
                    class="mtc-admin-legal-delete-policy-confirm-button"
                    id="mtcAdminLegalDeletePolicyConfirm"
                >
                    <i class="fa-solid fa-trash"></i>
                    Delete Policy
                </button>

            </div>

        </div>
    `;


    overlay.style.display =
        "flex";


    document
        .getElementById(
            "mtcAdminLegalDeletePolicyCancel"
        )
        ?.addEventListener(
            "click",
            closeDeleteLegalPolicyConfirmation
        );


    document
        .getElementById(
            "mtcAdminLegalDeletePolicyConfirm"
        )
        ?.addEventListener(
            "click",
            deleteCustomLegalPolicy
        );


    overlay.onclick = (event) => {

        if (event.target === overlay) {

            closeDeleteLegalPolicyConfirmation();
        }
    };
}


function closeDeleteLegalPolicyConfirmation() {

    const overlay =
        document.getElementById(
            "mtcAdminLegalDeletePolicyOverlay"
        );

    if (overlay) {

        overlay.style.display =
            "none";
    }

    mtcLegalPolicyPendingDeleteType =
        null;
}


async function deleteCustomLegalPolicy() {

    const type =
        mtcLegalPolicyPendingDeleteType;

    if (
        !type ||
        type === "terms" ||
        type === "privacy"
    ) {
        return;
    }


    const documentRecord =
        mtcLegalDocuments[type];

    if (
        !documentRecord ||
        !documentRecord.id
    ) {
        return;
    }


    const client =
        getMtcLegalSupabaseClient();

    if (!client) {

        showLegalNotification(
            "Supabase is not available.",
            "error"
        );

        return;
    }


    const deleteButton =
        document.getElementById(
            "mtcAdminLegalDeletePolicyConfirm"
        );

    if (deleteButton) {

        deleteButton.disabled =
            true;
    }


    try {

        const policyTitle =
            documentRecord.title ||
            "Legal Policy";


        /*
         * Legal_Versions uses ON DELETE CASCADE
         * through legal_document_id, so deleting
         * the document also removes its versions.
         */

        const { error } =
            await client
                .from("Legal_Documents")
                .delete()
                .eq(
                    "id",
                    documentRecord.id
                );


        if (error) {
            throw error;
        }


        delete mtcLegalDocuments[type];

        delete MTC_LEGAL_DOCUMENTS[type];

        delete MTC_LEGAL_SECTIONS[type];


        mtcLegalVersionHistory =
            mtcLegalVersionHistory.filter(
                (version) =>
                    version.document_type !== type
            );


        closeDeleteLegalPolicyConfirmation();

        renderLegalDocumentCards();

        renderLegalVersionHistory();


        showLegalNotification(
            `${policyTitle} deleted successfully.`
        );

    } catch (error) {

        console.error(
            "DELETE LEGAL POLICY ERROR:",
            error
        );


        showLegalNotification(
            "Unable to delete the policy.",
            "error"
        );


        if (deleteButton) {

            deleteButton.disabled =
                false;
        }
    }
}


function createLegalPolicySlug(value) {

    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}


function openCreateLegalPolicyModal() {

    const nameInput =
        document.getElementById(
            "mtcAdminLegalCreatePolicyName"
        );

    if (nameInput) {
        nameInput.value = "";
    }

    openLegalModal(
        "mtcAdminLegalCreatePolicyModal"
    );

    window.setTimeout(() => {
        nameInput?.focus();
    }, 50);
}


async function createCustomLegalPolicy() {

    const client =
        getMtcLegalSupabaseClient();

    const nameInput =
        document.getElementById(
            "mtcAdminLegalCreatePolicyName"
        );

    const createButton =
        document.getElementById(
            "mtcAdminLegalCreatePolicyConfirmButton"
        );

    const policyName =
        nameInput?.value.trim() || "";

    if (!policyName) {

        showLegalNotification(
            "Enter a policy name.",
            "warning"
        );

        nameInput?.focus();

        return;
    }

    const policyType =
        createLegalPolicySlug(
            policyName
        );

    if (!policyType) {

        showLegalNotification(
            "Enter a valid policy name.",
            "warning"
        );

        return;
    }

    if (
        policyType === "terms" ||
        policyType === "privacy"
    ) {

        showLegalNotification(
            "That policy already exists.",
            "warning"
        );

        return;
    }

    if (!client) {

        showLegalNotification(
            "Supabase is not available.",
            "error"
        );

        return;
    }

    createButton.disabled = true;

    try {

        const {
            data: existingPolicy,
            error: existingError
        } =
            await client
                .from("Legal_Documents")
                .select("id")
                .eq(
                    "document_type",
                    policyType
                )
                .maybeSingle();

        if (existingError) {
            throw existingError;
        }

        if (existingPolicy) {

            showLegalNotification(
                "A policy with that name already exists.",
                "warning"
            );

            return;
        }

        const now =
            new Date().toISOString();

        const initialContent =
            JSON.stringify({
                introduction: {
                    title: "Introduction",
                    content: ""
                }
            });

        const {
            data,
            error
        } =
            await client
                .from("Legal_Documents")
                .insert({
                    document_type:
                        policyType,

                    title:
                        policyName,

                    draft_content:
                        initialContent,

                    published_content:
                        null,

                    status:
                        "draft",

                    updated_at:
                        now
                })
                .select()
                .single();

        if (error) {
            throw error;
        }

        MTC_LEGAL_DOCUMENTS[
            policyType
        ] = {
            type:
                policyType,

            title:
                policyName,

            storefrontPage:
                `mw-policy.html?policy=${encodeURIComponent(policyType)}`,

            statusElementId:
                `mtcAdminLegal${policyType}Status`,

            updatedElementId:
                `mtcAdminLegal${policyType}Updated`
        };

        MTC_LEGAL_SECTIONS[
            policyType
        ] = [
            {
                key:
                    "introduction",

                title:
                    "Introduction"
            }
        ];

        mtcLegalDocuments[
            policyType
        ] = data;

        closeLegalModal(
            "mtcAdminLegalCreatePolicyModal"
        );

        showLegalNotification(
            `${policyName} created successfully.`
        );

        renderLegalDocumentCards();

    } catch (error) {

        console.error(
            "CREATE POLICY ERROR:",
            error
        );

        showLegalNotification(
            "Unable to create the policy.",
            "error"
        );

    } finally {

        createButton.disabled = false;
    }
}

/* =========================================================
   LEGAL CARD EVENTS
========================================================= */
function bindLegalCardEvents() {

    const legalGrid =
        document.getElementById(
            "mtcAdminLegalGrid"
        );

    if (
        !legalGrid ||
        legalGrid.dataset.eventsBound === "true"
    ) {
        return;
    }

    legalGrid.dataset.eventsBound =
        "true";


    legalGrid.addEventListener(
        "click",
        (event) => {

            const button =
                event.target.closest(
                    "[data-legal-action]"
                );

            if (
                !button ||
                !legalGrid.contains(button)
            ) {
                return;
            }


            const action =
                button.dataset.legalAction;

            const type =
                button.dataset.legalType;


            if (
                !type ||
                !getLegalDocumentDefinition(type)
            ) {
                return;
            }


            /* EDIT */

            if (action === "edit") {

    if (!canEditLegal) {

        showLegalNotification(
            "You do not have permission to edit legal policies.",
            "error"
        );

        return;
    }

    openLegalEditor(type);

    return;
}


            /* PREVIEW */

            if (action === "preview") {

                previewLegalDocument(
                    type,
                    false
                );

                return;
            }


            /* DELETE */

            if (action === "delete") {

    if (!canDeleteLegal) {

        showLegalNotification(
            "You do not have permission to delete legal policies.",
            "error"
        );

        return;
    }

    openDeleteLegalPolicyConfirmation(
        type
    );

    return;
}

        }
    );
}
/* =========================================================
   MODAL EVENTS
========================================================= */
function bindLegalModalEvents() {

    /* =========================================
       CREATE POLICY
    ========================================= */

    const createPolicyButton =
        document.getElementById(
            "mtcAdminLegalCreatePolicyButton"
        );

    const createPolicyCloseButton =
        document.getElementById(
            "mtcAdminLegalCreatePolicyCloseButton"
        );

    const createPolicyCancelButton =
        document.getElementById(
            "mtcAdminLegalCreatePolicyCancelButton"
        );

    const createPolicyConfirmButton =
        document.getElementById(
            "mtcAdminLegalCreatePolicyConfirmButton"
        );

    const createPolicyNameInput =
        document.getElementById(
            "mtcAdminLegalCreatePolicyName"
        );


    if (createPolicyButton) {

    if (canCreateLegal) {

        createPolicyButton.style.display = "";

        createPolicyButton.addEventListener(
            "click",
            openCreateLegalPolicyModal
        );

    } else {

        createPolicyButton.style.display =
            "none";
    }
}


    createPolicyCloseButton?.addEventListener(
        "click",
        () => {

            closeLegalModal(
                "mtcAdminLegalCreatePolicyModal"
            );
        }
    );


    createPolicyCancelButton?.addEventListener(
        "click",
        () => {

            closeLegalModal(
                "mtcAdminLegalCreatePolicyModal"
            );
        }
    );


    createPolicyConfirmButton?.addEventListener(
    "click",
    () => {

        if (!canCreateLegal) {
            showLegalNotification(
                "You do not have permission to create legal policies.",
                "error"
            );

            return;
        }

        createCustomLegalPolicy();
    }
);


createPolicyNameInput?.addEventListener(
    "keydown",
    (event) => {

        if (event.key === "Enter") {

            event.preventDefault();

            if (!canCreateLegal) {
                showLegalNotification(
                    "You do not have permission to create legal policies.",
                    "error"
                );

                return;
            }

            createCustomLegalPolicy();
        }
    }
);


    /* =========================================
       ADD LEGAL SECTION
    ========================================= */

    const addSectionButton =
        document.getElementById(
            "mtcAdminLegalAddSectionButton"
        );

    addSectionButton?.addEventListener(
        "click",
        addLegalEditorSection
    );


    /* =========================================
       EDIT LEGAL DOCUMENT
    ========================================= */

    document
        .getElementById(
            "mtcAdminLegalEditCloseButton"
        )
        ?.addEventListener(
            "click",
            () => {

                closeLegalEditor();
            }
        );


    document
        .getElementById(
            "mtcAdminLegalEditorCancelButton"
        )
        ?.addEventListener(
            "click",
            () => {

                closeLegalEditor();
            }
        );


    document
        .getElementById(
            "mtcAdminLegalSaveDraftButton"
        )
        ?.addEventListener(
            "click",
            saveLegalDraft
        );


    document
        .getElementById(
            "mtcAdminLegalPublishButton"
        )
        ?.addEventListener(
            "click",
            requestLegalPublish
        );

document
    .getElementById(
        "mtcAdminLegalUnpublishButton"
    )
    ?.addEventListener(
        "click",
        () => {
            openLegalModal(
                "mtcAdminLegalUnpublishConfirmModal"
            );
        }
    );

    /* =========================================
       PUBLISH
    ========================================= */

    document
        .getElementById(
            "mtcAdminLegalPublishConfirmButton"
        )
        ?.addEventListener(
            "click",
            publishLegalDocument
        );


    document
        .getElementById(
            "mtcAdminLegalPublishCancelButton"
        )
        ?.addEventListener(
            "click",
            () => {

                closeLegalModal(
                    "mtcAdminLegalPublishConfirmModal"
                );
            }
        );


    /* =========================================
       PREVIEW
    ========================================= */

    document
        .getElementById(
            "mtcAdminLegalEditorPreviewButton"
        )
        ?.addEventListener(
            "click",
            () => {

                if (
                    !mtcLegalActiveDocumentType
                ) {
                    return;
                }

                previewLegalDocument(
                    mtcLegalActiveDocumentType,
                    true
                );
            }
        );


    document
        .getElementById(
            "mtcAdminLegalPreviewCloseButton"
        )
        ?.addEventListener(
            "click",
            () => {

                closeLegalModal(
                    "mtcAdminLegalPreviewModal"
                );
            }
        );


    document
        .getElementById(
            "mtcAdminLegalPreviewDoneButton"
        )
        ?.addEventListener(
            "click",
            () => {

                closeLegalModal(
                    "mtcAdminLegalPreviewModal"
                );
            }
        );
}
/* =========================================================
   CLOSE LEGAL EDITOR
========================================================= */

function closeLegalEditor() {
    if (mtcLegalEditorHasChanges) {
        const shouldClose = window.confirm("You have unsaved changes. Close without saving?");

        if (!shouldClose) {
            return;
        }
    }

    closeLegalModal("mtcAdminLegalEditModal");

    mtcLegalActiveDocumentType = null;

    mtcLegalActiveDocument = null;

    mtcLegalEditorOriginalContent = "";

    mtcLegalEditorHasChanges = false;
}

/* =========================================================
   UNSAVED CHANGE PROTECTION
========================================================= */

window.addEventListener("beforeunload", (event) => {
    if (!mtcLegalEditorHasChanges) {
        return;
    }

    event.preventDefault();
    event.returnValue = "";
});

/* =========================================================
   LEGAL MOBILE SIDEBAR / HAMBURGER
========================================================= */

function initializeLegalHamburgerMenu() {
    const menuButton = document.getElementById(
        "mtcAdminLegalMenuButton"
    );

    const sidebar = document.querySelector(
        ".mw-dashboard-sidebar"
    );

    if (!menuButton || !sidebar) {
        return;
    }

    menuButton.addEventListener("click", (event) => {
        event.stopPropagation();

        sidebar.classList.toggle("sidebar-open");
    });
}

/* =========================================================
   INITIALIZE ADMIN LEGAL
========================================================= */

async function initializeMtcAdminLegal() {
    const legalMain = document.getElementById(
        "mtcAdminLegalMain"
    );

    if (!legalMain) {
        return;
    }

console.log("MTC Admin Legal initializing...");

await loadMtcLegalPermissions();

createLegalEditModal();

createLegalPolicyModal();

createLegalPreviewModal();

    createLegalPublishConfirmModal();

    createLegalUnpublishConfirmModal();

    document
    .getElementById(
        "mtcAdminLegalUnpublishCancelButton"
    )
    ?.addEventListener(
        "click",
        () => {
            closeLegalModal(
                "mtcAdminLegalUnpublishConfirmModal"
            );
        }
    );

document
    .getElementById(
        "mtcAdminLegalUnpublishConfirmButton"
    )
    ?.addEventListener(
        "click",
        async () => {

            closeLegalModal(
                "mtcAdminLegalUnpublishConfirmModal"
            );

            await unpublishLegalDocument();
        }
    );

    bindLegalCardEvents();

    bindLegalModalEvents();

    initializeLegalHamburgerMenu();

    await loadLegalDocuments();

    await loadLegalVersionHistory();

    console.log("MTC Admin Legal initialized.");
}

/* =========================================================
   DOM READY
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeMtcAdminLegal
    );
} else {
    initializeMtcAdminLegal();
}

/* =========================================================
   END OF MTC ADMIN LEGAL
========================================================= */