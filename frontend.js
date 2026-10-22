// =========================================================
// MIDWEST TOY CONNECTIONS
// STRIPE + SUPABASE BACKEND
// =========================================================
require("dotenv").config();
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_REPLY_TEMPLATE_ID = process.env.EMAILJS_REPLY_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

// ================= IMPORTS =================
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const { rateLimit } = require("express-rate-limit");
function capitalizeFirstLetter(value) {
    if (!value) {
        return "";
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}
// ================= APP SETUP =================
const app = express();
app.set("trust proxy", 1);
app.use(cors());

// =========================================================
// STRIPE
// =========================================================
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// =========================================================
// PAYPAL
// =========================================================

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_ENVIRONMENT =
    process.env.PAYPAL_ENVIRONMENT || "sandbox";

const PAYPAL_BASE_URL =
    PAYPAL_ENVIRONMENT === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

async function getPayPalAccessToken() {
    const credentials = Buffer.from(
        `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch(
        `${PAYPAL_BASE_URL}/v1/oauth2/token`,
        {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type":
                    "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
        }
    );

    const data = await response.json();

    if (!response.ok || !data.access_token) {
        console.error("PAYPAL ACCESS TOKEN ERROR:", data);
        throw new Error(
            "Unable to authenticate with PayPal."
        );
    }

    return data.access_token;
}

async function createPayPalOrder({
    amount,
    orderUUID,
    orderNumber
}) {
    const accessToken =
        await getPayPalAccessToken();

    const response = await fetch(
        `${PAYPAL_BASE_URL}/v2/checkout/orders`,
        {
            method: "POST",

            headers: {
                Authorization:
                    `Bearer ${accessToken}`,

                "Content-Type":
                    "application/json",

                "PayPal-Request-Id":
                    `mtc-${orderUUID}`,
            },

            body: JSON.stringify({
                intent: "CAPTURE",

                payment_source: {
                paypal: {
                    experience_context: {
                            return_url:
                                "https://midwest-tc.github.io/Midwest-Toy-Connections-Website/mw-payment-success.html?payment=paypal",
                            cancel_url:
                                "https://midwest-tc.github.io/Midwest-Toy-Connections-Website/mw-shoppingcart.html?paypal=cancelled",
                        user_action: "PAY_NOW"
                    }
                }
            },

                purchase_units: [
                    {
                        reference_id:
                            String(orderUUID),

                        custom_id:
                            String(orderNumber),

                        amount: {
                            currency_code: "USD",

                            value:
                                Number(amount)
                                    .toFixed(2),
                        },
                    },
                ],
            }),
        }
    );

    const data = await response.json();

    if (!response.ok || !data.id) {
        console.error(
            "PAYPAL CREATE ORDER ERROR:",
            data
        );

        throw new Error(
            "Unable to create PayPal order."
        );
    }

    return data;
}

async function capturePayPalOrder(paypalOrderId) {
    const accessToken =
        await getPayPalAccessToken();

    const response = await fetch(
        `${PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
        {
            method: "POST",

            headers: {
    Authorization:
        `Bearer ${accessToken}`,

    "Content-Type":
        "application/json",

    "PayPal-Request-Id":
        `mtc-capture-${paypalOrderId}`,
},
        }
    );

    const data = await response.json();

    if (!response.ok) {
        console.error(
            "PAYPAL CAPTURE ERROR:",
            data
        );

        throw new Error(
            "Unable to capture PayPal payment."
        );
    }

    return data;
}

// =========================================================
// SUPABASE
// =========================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqd2Vsd2VxcWp5emtuc3NxZ3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxOTQwNDgsImV4cCI6MjEwMjc3MDA0OH0.oqVIrfixxHzukjYSAB8VP8pprSL8wCq21MmqdiyyvTM";

const authSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
});

// =================================================
// RECORD PAYPAL SALES TAX IN STRIPE TAX
// =================================================

async function retryPayPalTaxRecording(orderUUID) {
    const { data: order, error: orderError } = await supabase
        .from("Orders")
        .select(`
            id,
            order_id,
            payment_status,
            tax_amount,
            paypal_order_id,
            paypal_tax_calculation_id,
            paypal_tax_recorded,
            paypal_tax_transaction_id
        `)
        .eq("id", orderUUID)
        .single();

    if (orderError) throw orderError;

    if (
        !order ||
        String(order.payment_status).toLowerCase() !== "paid" ||
        !order.paypal_order_id ||
        !order.paypal_tax_calculation_id ||
        order.paypal_tax_recorded === true
    ) {
        return false;
    }

    if (order.paypal_tax_transaction_id) {
        const { error } = await supabase
            .from("Orders")
            .update({
                paypal_tax_recorded: true,
                paypal_tax_recorded_at: new Date().toISOString()
            })
            .eq("id", orderUUID);

        if (error) throw error;
        return true;
    }

    if (Number(order.tax_amount || 0) <= 0) {
        return false;
    }

    const { data: payment, error: paymentError } = await supabase
        .from("Payments")
        .select("paypal_capture_id")
        .eq("order_id", orderUUID)
        .single();

    if (paymentError) throw paymentError;

    if (!payment?.paypal_capture_id) {
        throw new Error("PayPal capture ID missing from Payments.");
    }

    const transaction =
        await stripe.tax.transactions.createFromCalculation(
            {
                calculation: order.paypal_tax_calculation_id,
                reference: `mtc-paypal-${orderUUID}`,
                metadata: {
                    order_id: String(order.order_id),
                    paypal_order_id: String(order.paypal_order_id),
                    paypal_capture_id: String(payment.paypal_capture_id)
                }
            },
            {
                idempotencyKey: `mtc-paypal-tax-${orderUUID}`
            }
        );

    const { error: saveError } = await supabase
        .from("Orders")
        .update({
            paypal_tax_recorded: true,
            paypal_tax_transaction_id: transaction.id,
            paypal_tax_recorded_at: new Date().toISOString()
        })
        .eq("id", orderUUID);

    if (saveError) throw saveError;

    console.log("✅ PAYPAL TAX RECORDED:", order.order_id);
    return true;
}

async function verifyActiveAdminSession(token) {
    if (!token) {
        return {
            active: false,
        };
    }

    try {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));

        const authSessionId = payload.session_id || null;

        if (!authSessionId) {
            return {
                active: false,
            };
        }

        const { data: activeSession, error: activeSessionError } = await supabase
            .from("Admin_Active_Sessions")
            .select(
                `
                    id,
                    is_active,
                    last_activity_at
                `
            )
            .eq("auth_session_id", authSessionId)
            .eq("is_active", true)
            .maybeSingle();

        if (activeSessionError || !activeSession) {
            return {
                active: false,
            };
        }

        // =============================================
        // LOAD SESSION TIMEOUT SETTING
        // =============================================

        const { data: securitySettings, error: securitySettingsError } = await supabase
            .from("Admin_Security_Settings")
            .select("session_timeout_minutes")
            .limit(1)
            .maybeSingle();

        if (securitySettingsError || !securitySettings) {
            console.error("SESSION TIMEOUT SETTINGS ERROR:", securitySettingsError);

            return {
                active: false,
            };
        }

        const sessionTimeoutMinutes = Number(securitySettings.session_timeout_minutes);

        // =============================================
        // CHECK SESSION TIMEOUT
        // =============================================

        const lastActivityTime = new Date(activeSession.last_activity_at).getTime();

        const sessionTimeoutMilliseconds = sessionTimeoutMinutes * 60 * 1000;

        const sessionExpired = Date.now() - lastActivityTime >= sessionTimeoutMilliseconds;

        if (sessionExpired) {
            const { error: expireSessionError } = await supabase
                .from("Admin_Active_Sessions")
                .update({
                    is_active: false,

                    revoked_at: new Date().toISOString(),
                })
                .eq("id", activeSession.id);

            if (expireSessionError) {
                console.error("ADMIN SESSION TIMEOUT UPDATE ERROR:", expireSessionError);
            }

            return {
                active: false,
                expired: true,
            };
        }

        // =============================================
        // UPDATE LAST ACTIVITY
        // =============================================

        const currentActivityTime = new Date().toISOString();

        const { error: activityUpdateError } = await supabase
            .from("Admin_Active_Sessions")
            .update({
                last_activity_at: currentActivityTime,
            })
            .eq("id", activeSession.id);

        if (activityUpdateError) {
            console.error("ADMIN SESSION ACTIVITY UPDATE ERROR:", activityUpdateError);
        }

        return {
            active: true,

            sessionId: activeSession.id,

            authSessionId: authSessionId,

            lastActivityAt: currentActivityTime,

            sessionTimeoutMinutes: sessionTimeoutMinutes,
        };
    } catch (error) {
        console.error("ACTIVE ADMIN SESSION VERIFY ERROR:", error);

        return {
            active: false,
        };
    }
}

// =========================================================
// CHECK ADMIN PERMISSION
// =========================================================

async function adminHasPermission(userId, permissionKey) {
    // =========================================
    // OWNER + WEB DEVELOPER ALWAYS ALLOWED
    // =========================================

    const { data: topLevelRoles, error: topLevelRolesError } = await supabase
        .from("Admin_Roles")
        .select(
            `
            Admin_Positions (
                name
            )
        `
        )
        .eq("user_id", userId);

    if (topLevelRolesError) {
        console.error("LOAD TOP LEVEL ADMIN ROLES ERROR:", topLevelRolesError);

        return false;
    }

    const isTopLevelAdmin = (topLevelRoles || []).some(
        (role) => role.Admin_Positions?.name === "Owner" || role.Admin_Positions?.name === "Web Developer"
    );

    if (isTopLevelAdmin) {
        return true;
    }

    // =========================================
    // CHECK INDIVIDUAL USER OVERRIDE FIRST
    // =========================================

    const { data: userPermission, error: userPermissionError } = await supabase
        .from("Admin_User_Permissions")
        .select(
            `
            permission_state,
            Admin_Permissions!inner (
                permission_key
            )
        `
        )
        .eq("user_id", userId)
        .eq("Admin_Permissions.permission_key", permissionKey)
        .maybeSingle();

    if (userPermissionError) {
        console.error("LOAD USER PERMISSION ERROR:", userPermissionError);

        return false;
    }

    if (userPermission?.permission_state === "deny") {
        return false;
    }

    if (userPermission?.permission_state === "allow") {
        return true;
    }

    // =========================================
    // LOAD ADMIN POSITIONS
    // =========================================

    const { data: roles, error: rolesError } = await supabase
        .from("Admin_Roles")
        .select("position_id")
        .eq("user_id", userId);

    if (rolesError) {
        console.error("LOAD ADMIN PERMISSION ROLES ERROR:", rolesError);

        return false;
    }

    const positionIds = (roles || []).map((role) => role.position_id).filter(Boolean);

    if (positionIds.length === 0) {
        return false;
    }

    // =========================================
    // CHECK POSITION PERMISSION
    // =========================================

    const { data: permissionRows, error: permissionError } = await supabase
        .from("Admin_Position_Permissions")
        .select(
            `
            permission_id,
            Admin_Permissions!inner (
                permission_key
            )
        `
        )
        .in("position_id", positionIds)
        .eq("Admin_Permissions.permission_key", permissionKey)
        .limit(1);

    if (permissionError) {
        console.error("CHECK ADMIN PERMISSION ERROR:", permissionError);

        return false;
    }

    return permissionRows?.length > 0;
}

// =========================================================
// CHECK STRICT ADMIN PERMISSION
// No Owner / Web Developer automatic bypass
// =========================================================

async function adminHasStrictPermission(userId, permissionKey) {
    // =========================================
    // CHECK INDIVIDUAL USER OVERRIDE FIRST
    // =========================================

    const { data: userPermission, error: userPermissionError } = await supabase
        .from("Admin_User_Permissions")
        .select(
            `
                permission_state,
                Admin_Permissions!inner (
                    permission_key
                )
            `
        )
        .eq("user_id", userId)
        .eq("Admin_Permissions.permission_key", permissionKey)
        .maybeSingle();

    if (userPermissionError) {
        console.error("LOAD STRICT USER PERMISSION ERROR:", userPermissionError);

        return false;
    }

    if (userPermission?.permission_state === "deny") {
        return false;
    }

    if (userPermission?.permission_state === "allow") {
        return true;
    }

    // =========================================
    // LOAD ADMIN POSITIONS
    // =========================================

    const { data: roles, error: rolesError } = await supabase
        .from("Admin_Roles")
        .select("position_id")
        .eq("user_id", userId);

    if (rolesError) {
        console.error("LOAD STRICT ADMIN ROLES ERROR:", rolesError);

        return false;
    }

    const positionIds = (roles || []).map((role) => role.position_id).filter(Boolean);

    if (positionIds.length === 0) {
        return false;
    }

    // =========================================
    // CHECK POSITION PERMISSION
    // =========================================

    const { data: permissionRows, error: permissionError } = await supabase
        .from("Admin_Position_Permissions")
        .select(
            `
                permission_id,
                Admin_Permissions!inner (
                    permission_key
                )
            `
        )
        .in("position_id", positionIds)
        .eq("Admin_Permissions.permission_key", permissionKey)
        .limit(1);

    if (permissionError) {
        console.error("CHECK STRICT ADMIN PERMISSION ERROR:", permissionError);

        return false;
    }

    return permissionRows?.length > 0;
}

// =========================================================
// CHECK CURRENT ADMIN PERMISSION
// =========================================================

app.get("/admin-permission/check", async (req, res) => {
    try {
        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const permissionKey = String(req.query.permission || "").trim();

        if (!permissionKey) {
            return res.status(400).json({
                success: false,
                error: "Permission is required.",
            });
        }

        const al60ProtectedPermissionKeys = new Set([
            "accounts.create_position",
            "accounts.delete_position",
            "refunds.process",
        ]);

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select("authority_level")
            .eq("user_id", authData.user.id)
            .maybeSingle();

        if (currentAdminError || !currentAdmin) {
            return res.status(403).json({
                success: false,
                allowed: false,
                error: "Unable to verify administrator authority level.",
            });
        }

        const currentAuthorityLevel = Number(currentAdmin.authority_level) || 0;

        if (al60ProtectedPermissionKeys.has(permissionKey) && currentAuthorityLevel < 60) {
            return res.json({
                success: true,
                allowed: false,
            });
        }

        const allowed = al60ProtectedPermissionKeys.has(permissionKey)
            ? await adminHasStrictPermission(authData.user.id, permissionKey)
            : await adminHasPermission(authData.user.id, permissionKey);
        return res.json({
            success: true,
            allowed,
        });
    } catch (error) {
        console.error("ADMIN PERMISSION CHECK ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to check permission.",
        });
    }
});

// =========================================================
// ADMIN ACTIVITY LOGGER
// =========================================================
async function logAdminActivity({
    adminId = null,
    adminEmail = null,
    adminName = null,
    position = null,

    category,
    action,
    description = null,

    targetType = null,
    targetId = null,
    targetName = null,

    ipAddress = null,
    userAgent = null,

    metadata = {},
}) {
    try {
        const { error } = await supabase.from("Admin_Activity_Log").insert({
            admin_id: adminId,

            admin_email: adminEmail,

            admin_name: adminName,

            position: position,

            category: category,

            action: action,

            description: description,

            target_type: targetType,

            target_id: targetId,

            target_name: targetName,

            ip_address: ipAddress,

            user_agent: userAgent,

            metadata: metadata,
        });

        if (error) {
            console.error("ADMIN ACTIVITY LOG ERROR:", error);
        }
    } catch (error) {
        console.error("ADMIN ACTIVITY LOGGER FAILED:", error);
    }
}

// =========================================================
// STRIPE WEBHOOK
// =========================================================
// Must come BEFORE express.json()
// =========================================================
app.post(
    "/webhook",
    express.raw({
        type: "application/json",
    }),
    async (req, res) => {
        let event;

        try {
            event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], endpointSecret);
        } catch (err) {
            console.error("❌ Webhook signature error:", err.message);

            return res.sendStatus(400);
        }

        // =====================================================
        // CHECKOUT COMPLETED
        // =====================================================
        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            // Do not fulfill an order until Stripe confirms payment.
if (session.payment_status !== "paid") {
    console.log(
        "Stripe checkout completed without payment:",
        session.id,
        session.payment_status
    );

    return res.status(200).json({
        received: true,
        message: "Payment not yet confirmed"
    });
}
            let stripeWebhookClaimToken = null;

            console.log("💰 MTC PAYMENT COMPLETED:", session.id);
            console.log("📦 Stripe metadata:", session.metadata);

            try {
                if (session.metadata?.checkout_type !== "store") {
                    console.log("ℹ️ Not a regular store checkout.");
                } else {
                    const orderUUID = session.metadata?.order_uuid;
                    const orderNumber = session.metadata?.order_id;

                    if (!orderUUID) {
                        throw new Error(
                            "Stripe session is missing order_uuid."
                        );
                    }

            // =====================================================
            // PREVENT DUPLICATE WEBHOOK PROCESSING
            // =====================================================

            const {
                data: existingPaidOrder,
                error: existingPaidOrderError
            } = await supabase
                .from("Orders")
                .select(`
                    id,
                    payment_status,
                    inventory_processed,
                    stripe_webhook_processed
                `)
                .eq("id", orderUUID)
                .maybeSingle();

            if (existingPaidOrderError) {
                throw existingPaidOrderError;
            }

            if (!existingPaidOrder) {
                throw new Error(
                    "Order could not be found for this Stripe session."
                );
            }

           // =====================================================
// CLAIM STRIPE WEBHOOK PROCESSING
// =====================================================

const { data: claimResult, error: claimError } =
    await supabase.rpc("claim_stripe_webhook", {
        p_order_id: orderUUID
    });

if (claimError) {
    throw claimError;
}

if (claimResult === "completed") {
    console.log("ℹ️ ORDER ALREADY PROCESSED:", orderNumber);
    return res.sendStatus(200);
}

if (claimResult === "processing") {
    console.log("⏳ ORDER ALREADY BEING PROCESSED:", orderNumber);

    // Retry later instead of acknowledging unfinished work.
    return res.sendStatus(500);
}

if (claimResult === "not_found") {
    throw new Error("Stripe webhook order not found.");
}

// =====================================================
// VERIFY CLAIM RESULT AND SAVE CLAIM TOKEN
// =====================================================

if (
    typeof claimResult !== "string" ||
    !/^claimed:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claimResult)
) {
    throw new Error("Unexpected Stripe webhook claim result.");
}

stripeWebhookClaimToken = claimResult.substring("claimed:".length);

console.log("🔒 STRIPE WEBHOOK CLAIMED:", orderNumber);

// =====================================================
// RECORD LOCAL PICKUP TAX IN STRIPE TAX
// =====================================================

const pickupCalculationId =
    session.metadata?.pickup_tax_calculation_id;

if (
    session.metadata?.shipping_method_name === "Local Pickup" &&
    pickupCalculationId &&
    Number(session.metadata?.pickup_tax_cents || 0) > 0
) {
    const taxTransaction =
        await stripe.tax.transactions.createFromCalculation(
            {
                calculation: pickupCalculationId,
                reference: `mtc-pickup-${orderUUID}`,
                metadata: {
                    order_id: String(orderNumber),
                    payment_intent: String(session.payment_intent || "")
                }
            },
            {
                idempotencyKey: `mtc-pickup-tax-${orderUUID}`
            }
        );

    console.log(
        "✅ LOCAL PICKUP TAX RECORDED:",
        taxTransaction.id
    );
}

// =====================================================
// RENEW STRIPE WEBHOOK CLAIM
// =====================================================

const renewStripeWebhookClaim = async () => {
    const { data: renewed, error: renewError } =
        await supabase.rpc("renew_stripe_webhook_claim", {
            p_order_id: orderUUID,
            p_claim_token: stripeWebhookClaimToken
        });

    if (renewError) {
        throw renewError;
    }

    if (renewed !== true) {
        throw new Error(
            "Stripe webhook claim expired or ownership was lost."
        );
    }

    console.log("🔒 STRIPE WEBHOOK CLAIM RENEWED:", orderNumber);
};

                       // =====================================================
            // PROCESS DISCOUNT USAGE
            // DELETE WHEN USAGE LIMIT IS REACHED
            // =====================================================
            const discountId =
                session.metadata?.discount_id || null;
            
            const { error: discountProcessError } = await supabase.rpc(
                "process_order_discount",
                {
                    p_order_id: orderUUID,
                    p_discount_id: discountId
                }
            );
            
            if (discountProcessError) {
                throw discountProcessError;
            }
            
            console.log("✅ ORDER DISCOUNT PROCESSED");
                       
            // =====================================================
            // LOAD SHIPPING RESTRICTIONS
            // =====================================================

            const {
                data: shippingRestrictionSettings,
                error: shippingRestrictionSettingsError
            } = await supabase
                .from("Shipping_Settings")
                .select(`
                    domestic_shipping_enabled,
                    international_shipping_enabled,
                    restricted_locations
                `)
                .limit(1)
                .maybeSingle();

            if (shippingRestrictionSettingsError) {
                throw shippingRestrictionSettingsError;
            }


            // =====================================================
// GET SERVER-VALIDATED MTC SHIPPING ADDRESS
// =====================================================

const metadataShippingDetails =
    session.metadata?.shipping_address_line1
        ? {
            name: [
                session.metadata
                    ?.shipping_first_name,

                session.metadata
                    ?.shipping_last_name
            ]
                .filter(Boolean)
                .join(" "),

            address: {
                line1:
                    session.metadata
                        ?.shipping_address_line1 ||
                    null,

                line2:
                    session.metadata
                        ?.shipping_address_line2 ||
                    null,

                city:
                    session.metadata
                        ?.shipping_city ||
                    null,

                state:
                    session.metadata
                        ?.shipping_state ||
                    null,

                postal_code:
                    session.metadata
                        ?.shipping_postal_code ||
                    null,

                country:
                    session.metadata
                        ?.shipping_country ||
                    null
            }
        }
        : null;


const stripeShippingDetails =
    metadataShippingDetails ||
    session.collected_information
        ?.shipping_details ||
    session.shipping_details ||
    null;


const stripeShippingAddress =
    stripeShippingDetails?.address ||
    null;


const shippingCountry =
    String(
        stripeShippingAddress?.country || ""
    )
        .trim()
        .toUpperCase();


const shippingState =
    String(
        stripeShippingAddress?.state || ""
    )
        .trim()
        .toUpperCase();


            // =====================================================
            // NORMALIZE RESTRICTED LOCATIONS
            // =====================================================

            const restrictedLocations =
                Array.isArray(
                    shippingRestrictionSettings?.restricted_locations
                )
                    ? shippingRestrictionSettings
                        .restricted_locations
                        .map(location =>
                            String(location)
                                .trim()
                                .toUpperCase()
                        )
                        .filter(Boolean)
                    : [];


            // =====================================================
            // SHIPPING AVAILABILITY
            // =====================================================

           // Domestic U.S. shipping is always enabled
            const domesticAllowed = true;

            const internationalAllowed =
                shippingRestrictionSettings
                    ?.international_shipping_enabled === true;

            const isDomesticAddress =
                shippingCountry === "US";

            const locationIsRestricted =
                restrictedLocations.includes(
                    shippingState
                );


            // =====================================================
            // LOCAL PICKUP EXCEPTION
            // =====================================================

            const selectedShippingMethodName =
                String(
                    session.metadata
                        ?.shipping_method_name || ""
                )
                    .trim()
                    .toLowerCase();

            const isLocalPickup =
                selectedShippingMethodName ===
                "local pickup";


            // =====================================================
            // DETERMINE IF SHIPPING IS RESTRICTED
            // =====================================================

            const shippingIsRestricted =
                !isLocalPickup &&
                (
                    (isDomesticAddress &&
                        !domesticAllowed) ||

                    (!isDomesticAddress &&
                        !internationalAllowed) ||

                    locationIsRestricted
                );


            // =====================================================
            // GET ACTUAL STRIPE SALES TAX
            // =====================================================
            
            const stripeTaxAmount =
    session.metadata?.shipping_method_name === "Local Pickup"
        ? Number(session.metadata?.pickup_tax_cents || 0) / 100
        : Number(session.total_details?.amount_tax || 0) / 100;
            
            const stripeTotalAmount =
                Number(session.amount_total || 0) / 100;
            
            console.log("STRIPE SALES TAX:", stripeTaxAmount);
            console.log("STRIPE TOTAL PAID:", stripeTotalAmount);
            
            // =====================================================
            // UPDATE ORDER
            // =====================================================
            
            const {
                data: updatedOrder,
                error: updateError
            } = await supabase
                .from("Orders")
                .update({
                    payment_status: "Paid",
            
                    tax_amount: stripeTaxAmount,
            
                })
                .eq("id", orderUUID)
                .select(`
                    id,
                    order_id,
                    payment_status,
                    order_status
                `)
                .single();

            if (updateError) {
                throw updateError;
            }


            // =====================================================
            // LOG RESTRICTED SHIPPING
            // =====================================================

            if (shippingIsRestricted) {
                console.warn(
                    "⚠️ SHIPPING RESTRICTION DETECTED:",
                    {
                        orderUUID,
                        orderNumber,
                        shippingCountry,
                        shippingState,
                        restrictedLocations
                    }
                );
            }

            console.log(
                "✅ ORDER UPDATED:",
                updatedOrder
            );

            console.log(
                "✅ ORDER NUMBER:",
                orderNumber
            );

                    await renewStripeWebhookClaim();
                    // =====================================================
                    // PROCESS INVENTORY
                    // =====================================================

                    const { error: inventoryError } = await supabase.rpc("process_order_inventory", {
                        p_order_id: orderUUID,
                    });

                    if (inventoryError) {
                        throw inventoryError;
                    }

                    console.log("✅ INVENTORY UPDATED");

                    // =====================================================
                    // CREATE LOW STOCK ADMIN NOTIFICATIONS
                    // =====================================================

                    try {
                        // Get products that were part of this order
                        const { data: lowStockOrderItems, error: lowStockOrderItemsError } = await supabase
                        .from("Order_items")
                        .select(
                            `
                                product_id,
                                item_quantity
                            `
                        )
                        .eq("order_id", orderUUID);

                        if (lowStockOrderItemsError) {
                            console.error("LOW STOCK ORDER ITEMS ERROR:", lowStockOrderItemsError);
                        } else {
                            const lowStockProductIds = [
                                ...new Set((lowStockOrderItems || []).map((item) => item.product_id).filter(Boolean)),
                            ];

                            if (lowStockProductIds.length > 0) {
                                // Get the NEW inventory quantities after checkout
                                const { data: lowStockInventoryRows, error: lowStockInventoryError } = await supabase
                                    .from("Inventory")
                                    .select(
                                        `
                    product_id,
                    quantity
                `
                                    )
                                    .in("product_id", lowStockProductIds);

                                if (lowStockInventoryError) {
                                    console.error("LOW STOCK INVENTORY LOOKUP ERROR:", lowStockInventoryError);
                                } else {
                                    // =========================================
                                    // LOW STOCK THRESHOLD
                                    // =========================================

                                    const LOW_STOCK_THRESHOLD = 5;

                                    const productsBelowThreshold = (lowStockInventoryRows || []).filter(
                                        (inventoryRow) => Number(inventoryRow.quantity || 0) <= LOW_STOCK_THRESHOLD
                                    );
                                    
                                    console.log("🔎 LOW STOCK DEBUG:", {
                                        orderUUID,
                                        lowStockProductIds,
                                        inventoryRows: lowStockInventoryRows,
                                        productsBelowThreshold
                                    });

                                    if (productsBelowThreshold.length > 0) {
                                        // Get active admins
                                        const { data: lowStockAdmins, error: lowStockAdminsError } = await supabase
                                            .from("Admins")
                                            .select(
                                                `
                            user_id,
                            status
                        `
                                            )
                                            .eq("status", "Active");

                                        if (lowStockAdminsError) {
                                            console.error("LOW STOCK ADMIN LOOKUP ERROR:", lowStockAdminsError);
                                        } else {
                                            const activeLowStockAdminUserIds = [
                                                ...new Set(
                                                    (lowStockAdmins || []).map((admin) => admin.user_id).filter(Boolean)
                                                ),
                                            ];

                                            let lowStockAdminUserIds = [];

                                            if (activeLowStockAdminUserIds.length > 0) {
                                                const {
                                                    data: lowStockNotificationSettings,
                                                    error: lowStockNotificationSettingsError,
                                                } = await supabase
                                                    .from("Admin_Notification_Settings")
                                                    .select(
                                                        `
            admin_id,
            low_stock
        `
                                                    )
                                                    .in("admin_id", activeLowStockAdminUserIds);

                                                if (lowStockNotificationSettingsError) {
                                                    console.error(
                                                        "LOW STOCK NOTIFICATION SETTINGS ERROR:",
                                                        lowStockNotificationSettingsError
                                                    );
                                                } else {
                                                    const lowStockSettingsByAdmin = new Map(
                                                        (lowStockNotificationSettings || []).map((setting) => [
                                                            setting.admin_id,
                                                            setting,
                                                        ])
                                                    );

                                                    lowStockAdminUserIds = activeLowStockAdminUserIds.filter(
                                                        (adminUserId) => {
                                                            const settings = lowStockSettingsByAdmin.get(adminUserId);

                                                            // No settings row = default ON
                                                            if (!settings) {
                                                                return true;
                                                            }

                                                            return settings.low_stock === true;
                                                        }
                                                    );
                                                }
                                            }

                                            // =========================================
                                            // CREATE ONE NOTIFICATION PER PRODUCT
                                            // FOR EACH ACTIVE ADMIN
                                            // =========================================

                                            const lowStockNotifications = [];

                                            for (const inventoryRow of productsBelowThreshold) {
                                                for (const adminUserId of lowStockAdminUserIds) {
                                                    lowStockNotifications.push({
                                                        admin_user_id: adminUserId,

                                                        notification_type: "Low Stock",

                                                        title: "Low Stock",

                                                        message: `A product is low on stock. ${Number(
                                                            inventoryRow.quantity || 0
                                                        )} remaining.`,

                                                        related_product_id: inventoryRow.product_id,

                                                        destination_page: "products",

                                                        destination_action: "open_product",

                                                        is_read: false,
                                                    });
                                                }
                                            }

                                            if (lowStockNotifications.length > 0) {
                                                // =========================================
                                                // CHECK FOR EXISTING UNREAD LOW STOCK ALERTS
                                                // =========================================

                                                const {
                                                    data: existingLowStockNotifications,
                                                    error: existingLowStockNotificationsError,
                                                } = await supabase
                                                    .from("Admin_Notifications")
                                                    .select(
                                                        `
            admin_user_id,
            related_product_id
        `
                                                    )
                                                    .eq("notification_type", "Low Stock")
                                                    .eq("is_read", false)
                                                    .in("related_product_id", lowStockProductIds);

                                                if (existingLowStockNotificationsError) {
                                                    console.error(
                                                        "LOW STOCK DUPLICATE CHECK ERROR:",
                                                        existingLowStockNotificationsError
                                                    );
                                                } else {
                                                    // =========================================
                                                    // BUILD EXISTING ADMIN + PRODUCT PAIRS
                                                    // =========================================

                                                    const existingLowStockPairs = new Set(
                                                        (existingLowStockNotifications || []).map(
                                                            (notification) =>
                                                                `${notification.admin_user_id}:${notification.related_product_id}`
                                                        )
                                                    );

                                                    // =========================================
                                                    // REMOVE DUPLICATES
                                                    // =========================================

                                                    const newLowStockNotifications = lowStockNotifications.filter(
                                                        (notification) => {
                                                            const notificationKey = `${notification.admin_user_id}:${notification.related_product_id}`;

                                                            return !existingLowStockPairs.has(notificationKey);
                                                        }
                                                    );

                                                    // =========================================
                                                    // INSERT ONLY NEW LOW STOCK ALERTS
                                                    // =========================================

                                                    if (newLowStockNotifications.length > 0) {
                                                        const { error: lowStockNotificationError } = await supabase
                                                            .from("Admin_Notifications")
                                                            .insert(newLowStockNotifications);

                                                        if (lowStockNotificationError) {
                                                            console.error(
                                                                "LOW STOCK NOTIFICATION CREATE ERROR:",
                                                                lowStockNotificationError
                                                            );
                                                        } else {
                                                            console.log(
                                                                "🔔 LOW STOCK NOTIFICATIONS CREATED:",
                                                                newLowStockNotifications.length
                                                            );
                                                        }
                                                    } else {
                                                        console.log(
                                                            "🔔 LOW STOCK NOTIFICATION SKIPPED - EXISTING UNREAD ALERT"
                                                        );
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (lowStockNotificationError) {
                        console.error("LOW STOCK NOTIFICATION ERROR:", lowStockNotificationError);
                    }

                    await renewStripeWebhookClaim();
                    // =====================================================
                    // CUSTOMER DETAILS
                    // =====================================================

                    const customerDetails = session.customer_details;

                    if (!customerDetails?.email) {
                        throw new Error("Stripe customer email is missing.");
                    }

                    const fullName = customerDetails.name || "";

                    const nameParts = fullName.trim().split(/\s+/);

                    const firstName = nameParts[0] || null;

                    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

                    // =====================================================
                    // FIND EXISTING CUSTOMER
                    // =====================================================

                    let customerId = null;

                    const { data: existingCustomer, error: customerLookupError } = await supabase
                        .from("Customers")
                        .select("id")
                        .eq("email", customerDetails.email)
                        .maybeSingle();

                    if (customerLookupError) {
                        throw customerLookupError;
                    }

                    if (existingCustomer) {
                        customerId = existingCustomer.id;

                        console.log("✅ EXISTING CUSTOMER FOUND:", customerId);
                    } else {
                        // ===================================================
                        // CREATE CUSTOMER
                        // ===================================================

                        const { data: newCustomer, error: customerCreateError } = await supabase
                            .from("Customers")
                            .insert({
                                email: customerDetails.email,

                                first_name: firstName,

                                last_name: lastName,

                                phone: customerDetails.phone || null,

                                account_status: "guest",
                            })
                            .select("id")
                            .single();

                        if (customerCreateError) {
                            throw customerCreateError;
                        }

                        customerId = newCustomer.id;

                        console.log("✅ CUSTOMER CREATED:", customerId);
                    }

                    // =====================================================
                    // LINK CUSTOMER TO ORDER
                    // =====================================================

                    const { error: customerOrderUpdateError } = await supabase
                        .from("Orders")
                        .update({
                            customer_id: customerId,

                            customer_email: customerDetails.email,

                            customer_name: customerDetails.name || null,

                            stripe_payment_intent: session.payment_intent || null,
                        })
                        .eq("id", orderUUID);

                    if (customerOrderUpdateError) {
                        throw customerOrderUpdateError;
                    }

                    console.log("✅ CUSTOMER LINKED TO ORDER");

                    // =====================================================
                    // SAVE PAYMENT RECORD
                    // =====================================================

                    const paymentIntentId = session.payment_intent || null;

                    let cardLast4 = null;

                    let paymentMethod = null;

                    if (paymentIntentId) {
                        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
                            expand: ["payment_method"],
                        });

                        const paymentMethodObject = paymentIntent.payment_method;

                        if (paymentMethodObject && typeof paymentMethodObject === "object") {
                            paymentMethod = paymentMethodObject.type || null;

                            if (paymentMethodObject.type === "card" && paymentMethodObject.card) {
                                cardLast4 = paymentMethodObject.card.last4 || null;
                            }
                        }
                    }

                    const { error: paymentError } = await supabase.from("Payments").upsert(
                        {
                            order_id: orderUUID,

                            customer_id: customerId,

                            stripe_payment_intent: paymentIntentId,

                            stripe_checkout_session: session.id,

                            amount: Number(session.amount_total || 0) / 100,

                            currency: session.currency || "usd",

                            payment_method: paymentMethod,

                            card_last4: cardLast4,

                            payment_status: "paid",

                        },
                        {
                            onConflict: "order_id",
                            ignoreDuplicates: true
                        }
                    );

                    if (paymentError) {
                        throw paymentError;
                    }

                    console.log("✅ PAYMENT RECORD SAVED");

                    // =====================================================
                    // CREATE SHIPPING RECORD
                    // =====================================================

                    const { data: orderShipping, error: orderShippingLookupError } = await supabase
                        .from("Orders")
                        .select("shipping_amount")
                        .eq("id", orderUUID)
                        .single();

                    if (orderShippingLookupError) {
                        throw orderShippingLookupError;
                    }

                   const shippingCost =
    Number(orderShipping?.shipping_amount || 0);

const shippingMethod =
    session.metadata?.shipping_method_name ||
    "Standard Shipping";

                   const { error: shippingError } = await supabase
                    .from("Shipping")
                    .upsert(
                        {
                            order_id: orderUUID,
                            shipping_method: shippingMethod,
                            shipping_cost: shippingCost
                        },
                        {
                            onConflict: "order_id",
                            ignoreDuplicates: true
                        }
                    );

                    if (shippingError) {
                        throw shippingError;
                    }

                    console.log("✅ SHIPPING RECORD CREATED");

                    // =====================================================
                    // SHIPPING ADDRESS
                    // =====================================================
                    
                    const shippingDetails =
                        metadataShippingDetails ||
                        session.shipping_details ||
                        session.collected_information
                            ?.shipping_details ||
                        null;
                    
                    
                    const address =
                        shippingDetails?.address ||
                        null;
                    
                    
                    const shippingName =
                        shippingDetails?.name ||
                        "";
                    
                    
                    const shippingNameParts =
                        shippingName
                            .trim()
                            .split(/\s+/);
                    
                    
                    const shippingFirstName =
                        shippingNameParts[0] ||
                        null;
                    
                    
                    const shippingLastName =
                        shippingNameParts.length > 1
                            ? shippingNameParts
                                .slice(1)
                                .join(" ")
                            : null;
                    
                    
                    if (address && customerId) {
                    
                                            const { error: addressError } = await supabase
                        .from("Addresses")
                        .upsert(
                            {
                                order_id: orderUUID,
                                customer_id: customerId,
                                address_type: "shipping",
                                first_name: shippingFirstName,
                                last_name: shippingLastName,
                                address_line_1: address.line1 || null,
                                address_line_2: address.line2 || null,
                                city: address.city || null,
                                state: address.state || null,
                                postal_code: address.postal_code || null,
                                country: address.country || "US",
                                phone: customerDetails?.phone || null,
                                is_default: false
                            },
                            {
                                onConflict: "order_id"
                            }
                        );
                    
                    if (addressError) {
                        throw addressError;
                    }

                        console.log("✅ SHIPPING ADDRESS SAVED");
                        }

                        // =====================================================
                        // SEND ORDER CONFIRMATION EMAIL
                        // =====================================================
                        
                        try {
                            const { data: emailOrder, error: emailLookupError } =
                                await supabase
                                    .from("Orders")
                                    .select("confirmation_email_sent")
                                    .eq("id", orderUUID)
                                    .single();
                        
                            if (emailLookupError) {
                                throw emailLookupError;
                            }
                        
                            if (emailOrder.confirmation_email_sent !== true) {
                                await sendOrderConfirmationEmail({
                                    email: customerDetails.email,
                                    customerName: customerDetails.name,
                                    orderNumber: orderNumber,
                                    orderId: orderUUID
                                });
                        
                                const { error: emailUpdateError } = await supabase
                                    .from("Orders")
                                    .update({
                                        confirmation_email_sent: true
                                    })
                                    .eq("id", orderUUID);
                        
                                if (emailUpdateError) {
                                    throw emailUpdateError;
                                }
                        
                                console.log("✅ ORDER CONFIRMATION EMAIL SENT");
                            } else {
                                console.log("ℹ️ ORDER CONFIRMATION EMAIL ALREADY SENT");
                            }
                        
                        } catch (emailError) {
                            console.error(
                                "⚠️ ORDER CONFIRMATION EMAIL ERROR:",
                                emailError.message
                            );
                        
                            throw emailError;
                        }

                        // =====================================================
                        // CREATE NEW ORDER ADMIN NOTIFICATIONS
                        // =====================================================

                        try {
                            const { data: orderNotificationAdmins, error: orderNotificationAdminsError } =
                                await supabase
                                    .from("Admins")
                                    .select(
                                        `
            user_id,
            status
        `
                                    )
                                    .eq("status", "Active");

                            if (orderNotificationAdminsError) {
                                console.error(
                                    "NEW ORDER NOTIFICATION ADMIN LOOKUP ERROR:",
                                    orderNotificationAdminsError
                                );
                            } else {
                                const activeOrderAdminUserIds = [
                                    ...new Set(
                                        (orderNotificationAdmins || []).map((admin) => admin.user_id).filter(Boolean)
                                    ),
                                ];

                                let orderNotificationUserIds = [];

                                if (activeOrderAdminUserIds.length > 0) {
                                    const { data: orderNotificationSettings, error: orderNotificationSettingsError } =
                                        await supabase
                                            .from("Admin_Notification_Settings")
                                            .select(
                                                `
            admin_id,
            new_orders
        `
                                            )
                                            .in("admin_id", activeOrderAdminUserIds);

                                    if (orderNotificationSettingsError) {
                                        console.error(
                                            "NEW ORDER NOTIFICATION SETTINGS ERROR:",
                                            orderNotificationSettingsError
                                        );
                                    } else {
                                        const orderSettingsByAdmin = new Map(
                                            (orderNotificationSettings || []).map((setting) => [
                                                setting.admin_id,
                                                setting,
                                            ])
                                        );

                                        orderNotificationUserIds = activeOrderAdminUserIds.filter((adminUserId) => {
                                            const settings = orderSettingsByAdmin.get(adminUserId);

                                            // No settings row = default ON
                                            if (!settings) {
                                                return true;
                                            }

                                            return settings.new_orders === true;
                                        });
                                    }
                                }

                                const orderNotifications = orderNotificationUserIds.map((adminUserId) => ({
                                    admin_user_id: adminUserId,

                                    notification_type: "New Order",

                                    title: "New Order",

                                    message: `Order ${orderNumber} has been placed.`,

                                    related_order_id: orderUUID,

                                    destination_page: "orders",

                                    destination_action: "open_order_details",

                                    is_read: false,
                                }));

                                if (orderNotifications.length > 0) {
                                    for (const notification of orderNotifications) {
                                        const { error: orderNotificationError } =
                                            await supabase.rpc("create_new_order_notification", {
                                                p_admin_user_id: notification.admin_user_id,
                                                p_order_id: orderUUID,
                                                p_order_number: orderNumber
                                            });
                                
                                        if (orderNotificationError) {
                                            throw orderNotificationError;
                                        }
                                    }
                                
                                    console.log(
                                        "🔔 NEW ORDER ADMIN NOTIFICATIONS PROCESSED:",
                                        orderNumber
                                    );
                                }
                            }
                        } catch (orderNotificationError) {
                        console.error("NEW ORDER NOTIFICATION ERROR:", orderNotificationError);
                        throw orderNotificationError;
                    }
                    // =====================================================
                    // MARK STRIPE WEBHOOK AS COMPLETED
                    // =====================================================

                    await renewStripeWebhookClaim();
                    // =====================================================
                    // COMPLETE STRIPE WEBHOOK WITH CLAIM TOKEN
                    // =====================================================
                    
                    const { data: webhookCompleted, error: webhookCompleteError } =
                        await supabase.rpc("complete_stripe_webhook", {
                            p_order_id: orderUUID,
                            p_claim_token: stripeWebhookClaimToken
                        });
                    
                    if (webhookCompleteError) {
                        throw webhookCompleteError;
                    }
                    
                    if (webhookCompleted !== true) {
                        throw new Error(
                            "Stripe webhook completion failed: claim token mismatch."
                        );
                    }
                    
                    console.log("✅ STRIPE WEBHOOK FULLY PROCESSED:", orderNumber);
                }
                
            } catch (error) {
    console.error("❌ STORE ORDER PAYMENT UPDATE ERROR:", error);

    const failedOrderUUID = session.metadata?.order_uuid;

    if (failedOrderUUID && stripeWebhookClaimToken) {
        try {
            const { data: lockReleased, error: releaseError } =
                await supabase.rpc(
                    "release_stripe_webhook",
                    {
                        p_order_id: failedOrderUUID,
                        p_claim_token: stripeWebhookClaimToken
                    }
                );

            if (releaseError) {
                console.error(
                    "❌ STRIPE WEBHOOK LOCK RELEASE ERROR:",
                    releaseError
                );
            } else {
                console.log(
                    "🔓 STRIPE WEBHOOK LOCK RELEASED:",
                    failedOrderUUID
                );
            }
        } catch (releaseError) {
            console.error(
                "❌ STRIPE WEBHOOK LOCK RELEASE FAILED:",
                releaseError
            );
        }
    }

    return res.status(500).json({
        received: false,
        error: "Order processing failed."
    });
}
        }

        return res.json({
            received: true,
        });
    }
);

// =========================================================
// JSON BODY PARSER
// =========================================================
app.use(express.json());

// =========================================================
// CREATE PAYPAL CHECKOUT
// =========================================================

app.post("/create-paypal-order", async (req, res) => {
    try {

        const {
            cart,
            shippingMethodId,
            shippingAddress,
            discountCode
        } = req.body;

        // =================================================
        // VALIDATE CART USING SHARED MTC VALIDATOR
        // =================================================

        const {
            products,
            variants,
            validatedItems,
            subtotal
        } = await buildValidatedMTCCart(cart);

        console.log(
            "✅ PAYPAL CART VALIDATED:",
            validatedItems.length,
            "items | Subtotal:",
            subtotal
        );

// =================================================
// LOAD SHIPPING SETTINGS
// =================================================

const {
    data: shippingSettings,
    error: shippingSettingsError
} = await supabase
    .from("Shipping_Settings")
    .select(`
        free_shipping_enabled,
        free_shipping_minimum,
        local_pickup_enabled,
        local_pickup_address,
        local_pickup_instructions,
        local_pickup_ready_time
    `)
    .limit(1)
    .maybeSingle();


if (shippingSettingsError) {

    console.error(
        "❌ SHIPPING SETTINGS LOOKUP ERROR:",
        shippingSettingsError
    );

    return res.status(500).json({
        error: "Unable to load shipping settings.",
    });
}


// =================================================
// LOCAL PICKUP
// =================================================

let selectedShippingMethod = null;
let shippingAmount = 0;

const isLocalPickup =
    String(shippingMethodId) === "local-pickup";


if (isLocalPickup) {

    // ---------------------------------------------
    // VERIFY LOCAL PICKUP IS STILL ENABLED
    // ---------------------------------------------

    if (shippingSettings?.local_pickup_enabled !== true) {

        return res.status(400).json({
            error: "Local Pickup is currently unavailable.",
        });
    }


    // ---------------------------------------------
    // REQUIRE PICKUP ADDRESS
    // FAIL CLOSED
    // ---------------------------------------------

    const pickupAddress =
        String(
            shippingSettings?.local_pickup_address || ""
        ).trim();

    if (!pickupAddress) {

        return res.status(400).json({
            error: "Local Pickup is currently unavailable.",
        });
    }


    // ---------------------------------------------
    // CREATE SERVER-VERIFIED PICKUP METHOD
    // ---------------------------------------------

    selectedShippingMethod = {
        id: "local-pickup",
        name: "Local Pickup",
        price: 0,
        is_local_pickup: true
    };

    shippingAmount = 0;

} else {

    // =================================================
    // REGULAR SHIPPING METHOD
    // =================================================

    const {
        data: databaseShippingMethod,
        error: shippingMethodError
    } = await supabase
        .from("Shipping_Methods")
        .select(`
            id,
            name,
            price,
            estimated_delivery,
            is_active
        `)
        .eq("id", shippingMethodId)
        .eq("is_active", true)
        .maybeSingle();


    if (shippingMethodError) {

        console.error(
            "❌ SHIPPING METHOD LOOKUP ERROR:",
            shippingMethodError
        );

        return res.status(500).json({
            error: "Unable to load shipping method.",
        });
    }


    if (!databaseShippingMethod) {

        return res.status(400).json({
            error:
                "The selected shipping method is unavailable.",
        });
    }


    selectedShippingMethod =
        databaseShippingMethod;

    shippingAmount =
        Number(selectedShippingMethod.price || 0);


    // =================================================
    // FREE STANDARD SHIPPING
    // =================================================

    const freeShippingEnabled =
        shippingSettings?.free_shipping_enabled === true;

    const freeShippingMinimum =
        Number(
            shippingSettings?.free_shipping_minimum || 0
        );

    const isStandardShipping =
        selectedShippingMethod.name
            ?.toLowerCase()
            .includes("standard") === true;


    if (
        freeShippingEnabled &&
        isStandardShipping &&
        subtotal >= freeShippingMinimum
    ) {
        shippingAmount = 0;
    }
}

// =================================================
// VALIDATE SHIPPING ADDRESS + SHIPPING AVAILABILITY
// BEFORE CREATING ORDER OR STRIPE SESSION
// =================================================

let normalizedShippingAddress = null;


// =================================================
// LOAD SHIPPING RESTRICTIONS
// =================================================

const {
    data: shippingRestrictionSettings,
    error: shippingRestrictionSettingsError
} = await supabase
    .from("Shipping_Settings")
    .select(`
        domestic_shipping_enabled,
        international_shipping_enabled,
        restricted_locations
    `)
    .limit(1)
    .maybeSingle();


if (shippingRestrictionSettingsError) {

    console.error(
        "SHIPPING RESTRICTIONS LOAD ERROR:",
        shippingRestrictionSettingsError
    );

    return res.status(500).json({
        error:
            "Unable to verify shipping availability."
    });
}


if (!shippingRestrictionSettings) {

    return res.status(500).json({
        error:
            "Shipping settings could not be found."
    });
}


// =================================================
// SERVER-SIDE ADDRESS VALIDATION
// =================================================

if (!isLocalPickup) {

    if (
        !shippingAddress ||
        typeof shippingAddress !== "object" ||
        Array.isArray(shippingAddress)
    ) {
        return res.status(400).json({
            error:
                "Please enter a valid shipping address."
        });
    }


    // =============================================
    // NORMALIZE CUSTOMER INPUT
    //
    // This does NOT make unsafe HTML safe.
    // Customer values must still NEVER be inserted
    // into raw innerHTML.
    // =============================================

    const cleanAddressValue = (
        value,
        maxLength
    ) => {

        return String(value ?? "")
            .replace(
                /[\u0000-\u001F\u007F]/g,
                ""
            )
            .trim()
            .slice(0, maxLength);
    };


    const firstName =
        cleanAddressValue(
            shippingAddress.firstName,
            60
        );

    const lastName =
        cleanAddressValue(
            shippingAddress.lastName,
            60
        );

    const line1 =
        cleanAddressValue(
            shippingAddress.line1,
            120
        );

    const line2 =
        cleanAddressValue(
            shippingAddress.line2,
            120
        );

    const city =
        cleanAddressValue(
            shippingAddress.city,
            100
        );

    const state =
        cleanAddressValue(
            shippingAddress.state,
            2
        ).toUpperCase();

    const postalCode =
        cleanAddressValue(
            shippingAddress.postalCode,
            10
        ).toUpperCase();

    const country =
        cleanAddressValue(
            shippingAddress.country,
            2
        ).toUpperCase();


    // =============================================
    // REQUIRED FIELDS
    // =============================================

    if (
        !firstName ||
        !lastName ||
        !line1 ||
        !city ||
        !state ||
        !postalCode ||
        !country
    ) {

        return res.status(400).json({
            error:
                "Please complete your shipping address."
        });
    }


    // =============================================
    // CURRENT MTC FORM IS US-ONLY
    // =============================================

    if (country !== "US") {

        return res.status(400).json({
            error:
                "International shipping is currently unavailable."
        });
    }


    // =============================================
    // STATE FORMAT
    // =============================================

    if (!/^[A-Z]{2}$/.test(state)) {

        return res.status(400).json({
            error:
                "Please select a valid state."
        });
    }


    // =============================================
    // ZIP CODE FORMAT
    // =============================================

    if (!/^\d{5}(-\d{4})?$/.test(postalCode)) {

        return res.status(400).json({
            error:
                "Please enter a valid ZIP code."
        });
    }


    normalizedShippingAddress = {
        firstName,
        lastName,
        line1,
        line2,
        city,
        state,
        postalCode,
        country
    };


    // =============================================
// SHIPPING SETTINGS
// =============================================

// Domestic U.S. shipping is always enabled
const domesticShippingEnabled = true;

const internationalShippingEnabled =
    shippingRestrictionSettings
        .international_shipping_enabled === true;


const restrictedShippingLocations =
    Array.isArray(
        shippingRestrictionSettings
            .restricted_locations
    )
        ? shippingRestrictionSettings
            .restricted_locations
            .map(location =>
                String(location)
                    .trim()
                    .toUpperCase()
            )
            .filter(Boolean)
        : [];

    // =============================================
    // CHECK DOMESTIC SHIPPING
    // =============================================

    const isDomesticAddress =
        normalizedShippingAddress.country === "US";


    if (
        isDomesticAddress &&
        !domesticShippingEnabled
    ) {

        return res.status(400).json({
            error:
                "Domestic shipping is currently unavailable."
        });
    }


    // =============================================
    // CHECK INTERNATIONAL SHIPPING
    // =============================================

    if (
        !isDomesticAddress &&
        !internationalShippingEnabled
    ) {

        return res.status(400).json({
            error:
                "International shipping is currently unavailable."
        });
    }


    // =============================================
    // CHECK RESTRICTED LOCATIONS
    // =============================================

    const locationIsRestricted =
        restrictedShippingLocations.includes(
            normalizedShippingAddress.state
        ) ||
        restrictedShippingLocations.includes(
            normalizedShippingAddress.country
        );


    if (locationIsRestricted) {

        return res.status(400).json({
            error:
                "We're sorry, but we currently do not ship to this location."
        });
    }
}

        // =================================================
        // FINAL DISCOUNT VALIDATION
        // SERVER IS THE SOURCE OF TRUTH
        // =================================================

        let appliedDiscount = null;
        let discountAmount = 0;


        const normalizedDiscountCode =
            String(discountCode || "")
                .trim()
                .toUpperCase();


        if (normalizedDiscountCode) {

            const discountResult =
                await validateStoreDiscount(
                    normalizedDiscountCode,
                    subtotal
                );


            if (!discountResult.valid) {

                return res.status(
                    discountResult.serverError
                        ? 500
                        : 400
                ).json({
                    error:
                        discountResult.error
                });
            }


            appliedDiscount =
                discountResult.discount;


            discountAmount =
                Number(
                    appliedDiscount.amount || 0
                );
        }

// =================================================
// CALCULATE PAYPAL SALES TAX USING STRIPE TAX
// =================================================

const discountedSubtotal = Math.max(
    0,
    subtotal - discountAmount
);

const discountRatio =
    subtotal > 0 ? discountedSubtotal / subtotal : 0;

const taxAddress = isLocalPickup
    ? {
        line1: "5601 S Pennsylvania Ave",
        city: "Cudahy",
        state: "WI",
        postal_code: "53110",
        country: "US"
    }
    : {
        line1: normalizedShippingAddress.line1,
        city: normalizedShippingAddress.city,
        state: normalizedShippingAddress.state,
        postal_code: normalizedShippingAddress.postalCode,
        country: normalizedShippingAddress.country || "US"
    };

const paypalTaxCalculation =
    await stripe.tax.calculations.create({
        currency: "usd",

        shipping_cost: {
            amount: Math.round(shippingAmount * 100)
        },

        line_items: validatedItems.map(item => ({
            amount: Math.round(item.price * discountRatio * 100),
            quantity: item.quantity,
            reference: String(item.product.id)
        })),

        customer_details: {
            address: taxAddress,
            address_source: "shipping"
        }
    });

const paypalTaxCents =
    Number(paypalTaxCalculation.tax_amount_exclusive || 0) +
    Number(paypalTaxCalculation.tax_amount_inclusive || 0);

const paypalTax = paypalTaxCents / 100;

console.log("PAYPAL STRIPE TAX:", {
    tax: paypalTax,
    calculationId: paypalTaxCalculation.id
});

        // =================================================
        // CREATE REAL MTC ORDER
        // =================================================

        const {
            data: newOrder,
            error: orderError
        } = await supabase
            .from("Orders")
            .insert({
                subtotal: subtotal,
                shipping_amount: shippingAmount,
                tax_amount: paypalTax,
                discount_amount: discountAmount,
                payment_status: "pending",
                order_status: "Pending"
            })
            .select("id, order_id")
            .single();

            if (orderError || !newOrder) {

            console.error(
                "PAYPAL MTC ORDER ERROR:",
                orderError
            );

            throw new Error(
                "Unable to create MTC order."
            );
        }

        console.log(
            "✅ PAYPAL MTC ORDER CREATED:",
            newOrder.order_id
        );

        // =================================================
        // CREATE PAYPAL ORDER ITEMS
        // =================================================

        const orderItems = validatedItems.map(
            ({ product, variant, quantity, price }) => ({
                order_id: newOrder.id,
                order_number: newOrder.order_id,
                product_id: product.id,
                variant_id: variant ? variant.id : null,
                product_name: product.product_name,
                sku: variant?.sku || product.sku || null,
                item_quantity: quantity,
                unit_price: price,
                total_price: Number(
                    (price * quantity).toFixed(2)
                )
            })
        );

        const {
            error: orderItemsError
        } = await supabase
            .from("Order_items")
            .insert(orderItems);

        if (orderItemsError) {

            console.error(
                "PAYPAL ORDER ITEMS ERROR:",
                orderItemsError
            );

            await supabase
                .from("Orders")
                .delete()
                .eq("id", newOrder.id);

            throw new Error(
                "Unable to create order items."
            );
        }

        console.log(
            "✅ PAYPAL ORDER ITEMS CREATED:",
            orderItems.length
        );

        const paypalTotal = Number(
            Math.max(
                0,
                subtotal + shippingAmount - discountAmount + paypalTax
            ).toFixed(2)
        );

       let paypalOrder;

        try {

            paypalOrder = await createPayPalOrder({
                amount: paypalTotal,
                orderUUID: newOrder.id,
                orderNumber: newOrder.order_id
            });

        } catch (paypalError) {

            console.error(
                "PAYPAL ORDER CREATION FAILED:",
                paypalError
            );

            // Delete the order items first
            await supabase
                .from("Order_items")
                .delete()
                .eq("order_id", newOrder.id);

            // Then delete the pending MTC order
            await supabase
                .from("Orders")
                .delete()
                .eq("id", newOrder.id);

            throw paypalError;
        }

        console.log(
            "✅ PAYPAL ORDER CREATED:",
            paypalOrder.id
        );

        const paypalApprovalUrl =
            paypalOrder.links?.find(
                link =>
                    link.rel === "approve" ||
                    link.rel === "payer-action"
            )?.href;

        if (!paypalApprovalUrl) {

            throw new Error(
                "PayPal approval URL was not returned."
            );
        }

        // =================================================
        // SAVE PAYPAL ORDER ID TO MTC ORDER
        // =================================================

        const {
            error: paypalOrderSaveError
        } = await supabase
            .from("Orders")
            .update({
                paypal_order_id: paypalOrder.id,

                paypal_tax_calculation_id:
                    paypalTaxCalculation.id,

                paypal_shipping_method:
                    selectedShippingMethod?.name || null,

                paypal_shipping_address:
                    normalizedShippingAddress,

                paypal_discount_id:
                    appliedDiscount?.id || null
            })
            .eq("id", newOrder.id);

        if (paypalOrderSaveError) {

            console.error(
                "PAYPAL ORDER ID SAVE ERROR:",
                paypalOrderSaveError
            );

            throw new Error(
                "Unable to link PayPal order to MTC order."
            );
        }

        console.log(
            "✅ PAYPAL LINKED:",
            newOrder.order_id,
            "->",
            paypalOrder.id
        );

        return res.json({
            success: true,
            paypalOrderId: paypalOrder.id,
            approvalUrl: paypalApprovalUrl,
            orderId: newOrder.id,
            orderNumber: newOrder.order_id
    });

    
    } catch (error) {

        console.error(
            "❌ PAYPAL CHECKOUT ERROR:",
            error
        );

        return res.status(400).json({
            success: false,
            error:
                error.message ||
                "Unable to start PayPal checkout."
        });
    }
});

// =========================================================
// CAPTURE PAYPAL ORDER
// =========================================================

app.post("/capture-paypal-order", async (req, res) => {

    try {

        const paypalOrderId =
            String(
                req.body?.paypalOrderId || ""
            ).trim();

        if (!paypalOrderId) {

            return res.status(400).json({
                success: false,
                error:
                    "PayPal order ID is required."
            });
        }


        // =================================================
        // FIND MTC ORDER
        // =================================================

        const {
            data: mtcOrder,
            error: mtcOrderError
        } = await supabase
            .from("Orders")
            .select("*")
            .eq(
                "paypal_order_id",
                paypalOrderId
            )
            .maybeSingle();


        if (mtcOrderError) {
            throw mtcOrderError;
        }


        if (!mtcOrder) {

            return res.status(404).json({
                success: false,
                error:
                    "MTC order could not be found."
            });
        }


        const orderUUID =
            mtcOrder.id;

        const orderNumber =
            mtcOrder.order_id;


        // =================================================
        // ALREADY COMPLETED
        // =================================================

        if (
            String(
                mtcOrder.payment_status || ""
            )
                .trim()
                .toLowerCase() === "paid" &&
            mtcOrder.inventory_processed === true
        ) {

            console.log(
                "ℹ️ PAYPAL ORDER ALREADY PROCESSED:",
                orderNumber
            );

            return res.json({
                success: true,
                alreadyPaid: true,
                orderId: orderUUID,
                orderNumber: orderNumber,
                paymentStatus:
                    mtcOrder.payment_status,
                orderStatus:
                    mtcOrder.order_status
            });
        }

// =================================================
// FINAL PAYPAL INVENTORY CHECK
// CHECK STOCK BEFORE CAPTURING CUSTOMER PAYMENT
// =================================================

if (
    mtcOrder.inventory_processed !== true
) {

    const {
        data: paypalOrderItems,
        error: paypalOrderItemsError
    } = await supabase
        .from("Order_items")
        .select(`
            product_id,
            variant_id,
            item_quantity
        `)
        .eq(
            "order_id",
            orderUUID
        );


    if (paypalOrderItemsError) {
        throw paypalOrderItemsError;
    }


    if (
        !paypalOrderItems ||
        paypalOrderItems.length === 0
    ) {

        throw new Error(
            "No items were found for this PayPal order."
        );
    }


    for (
        const item of paypalOrderItems
    ) {

        const requestedQuantity =
            Number(
                item.item_quantity || 0
            );


        if (
            !Number.isInteger(
                requestedQuantity
            ) ||
            requestedQuantity <= 0
        ) {

            throw new Error(
                "Invalid PayPal order quantity."
            );
        }

// =============================================
// CHECK INVENTORY
// SAME INVENTORY TABLE USED BY THE RPC
// =============================================

let inventoryQuery =
    supabase
        .from("Inventory")
        .select(`
            product_id,
            variant_id,
            quantity
        `)
        .eq(
            "product_id",
            item.product_id
        );


if (item.variant_id) {

    inventoryQuery =
        inventoryQuery.eq(
            "variant_id",
            item.variant_id
        );

} else {

    inventoryQuery =
        inventoryQuery.is(
            "variant_id",
            null
        );
}


const {
    data: inventoryRecord,
    error: inventoryCheckError
} = await inventoryQuery
    .maybeSingle();


if (inventoryCheckError) {
    throw inventoryCheckError;
}


if (
    !inventoryRecord ||
    Number(
        inventoryRecord.quantity || 0
    ) < requestedQuantity
) {

    return res.status(409).json({
        success: false,

        error:
            "One or more items no longer have enough inventory. Please return to your cart and update the quantity.",

        inventoryError:
            true
    });
}

    }


    console.log(
        "✅ PAYPAL FINAL INVENTORY CHECK PASSED:",
        orderNumber
    );
}
        // =================================================
// VERIFY PAYPAL ORDER BEFORE CAPTURE
// =================================================

const accessToken = await getPayPalAccessToken();

const verifyResponse = await fetch(
    `${PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
    {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    }
);

if (!verifyResponse.ok) {
    throw new Error("Unable to verify PayPal order.");
}

const verifiedPayPalOrder = await verifyResponse.json();

const verifiedUnit = verifiedPayPalOrder.purchase_units?.[0];

const expectedPayPalTotal = Number(
    (
        Number(mtcOrder.subtotal || 0) +
        Number(mtcOrder.shipping_amount || 0) -
        Number(mtcOrder.discount_amount || 0) +
        Number(mtcOrder.tax_amount || 0)
    ).toFixed(2)
);

if (
    verifiedPayPalOrder.status !== "APPROVED" ||
    verifiedPayPalOrder.purchase_units?.length !== 1 ||
    String(verifiedUnit?.reference_id || "") !== String(orderUUID) ||
    String(verifiedUnit?.custom_id || "") !== String(orderNumber) ||
    verifiedUnit?.amount?.currency_code !== "USD" ||
    !Number.isFinite(Number(verifiedUnit?.amount?.value)) ||
    Math.round(Number(verifiedUnit.amount.value) * 100) !==
        Math.round(expectedPayPalTotal * 100)
) {
    throw new Error(
        "PayPal order verification failed. Payment was not captured."
    );
}

console.log("PAYPAL PRE-CAPTURE VERIFIED:", {
    orderNumber,
    expectedTotal: expectedPayPalTotal
});

        // =================================================
        // CAPTURE PAYPAL PAYMENT
        // =================================================

        console.log(
            "💰 CAPTURING PAYPAL ORDER:",
            paypalOrderId
        );


        const paypalCapture =
            await capturePayPalOrder(
                paypalOrderId
            );


        if (
            String(
                paypalCapture?.status || ""
            ).toUpperCase() !==
            "COMPLETED"
        ) {

            throw new Error(
                "PayPal payment was not completed."
            );
        }


        // =================================================
        // VERIFY PAYPAL ORDER BELONGS TO MTC ORDER
        // =================================================

        const purchaseUnit =
            paypalCapture
                ?.purchase_units?.[0];


        if (!purchaseUnit) {

            throw new Error(
                "PayPal purchase information is missing."
            );
        }


        if (
            String(
                purchaseUnit.reference_id || ""
            ) !== String(orderUUID)
        ) {

            throw new Error(
                "PayPal order reference does not match the MTC order."
            );
        }

        // =================================================
        // GET PAYPAL CAPTURE
        // =================================================

        const capture =
            purchaseUnit
                ?.payments
                ?.captures?.[0];


        if (!capture?.id) {

            throw new Error(
                "PayPal capture ID is missing."
            );
        }


        if (
            String(
                capture.status || ""
            ).toUpperCase() !==
            "COMPLETED"
        ) {

            throw new Error(
                "PayPal capture was not completed."
            );
        }


        // =================================================
        // VERIFY PAYMENT AMOUNT
        // =================================================

        const expectedTotal =
            Number(
                (
                    Number(
                        mtcOrder.subtotal || 0
                    ) +

                    Number(
                        mtcOrder.shipping_amount || 0
                    ) -

                    Number(
                        mtcOrder.discount_amount || 0
                    ) +

                    Number(
                        mtcOrder.tax_amount || 0
                    )
                ).toFixed(2)
            );


        const capturedTotal =
            Number(
                capture?.amount?.value
            );


        const capturedCurrency =
            String(
                capture
                    ?.amount
                    ?.currency_code || ""
            ).toUpperCase();


        if (
            !Number.isFinite(
                capturedTotal
            ) ||
            capturedTotal.toFixed(2) !==
                expectedTotal.toFixed(2)
        ) {

            throw new Error(
                "PayPal payment amount does not match the MTC order."
            );
        }


        if (
            capturedCurrency !== "USD"
        ) {

            throw new Error(
                "PayPal payment currency is invalid."
            );
        }


        // =================================================
        // CUSTOMER INFORMATION FROM PAYPAL
        // =================================================

        const paypalEmail =
            String(
                paypalCapture
                    ?.payer
                    ?.email_address || ""
            )
                .trim()
                .toLowerCase();


        if (!paypalEmail) {

            throw new Error(
                "PayPal customer email is missing."
            );
        }


        const firstName =
            String(
                paypalCapture
                    ?.payer
                    ?.name
                    ?.given_name || ""
            ).trim() || null;


        const lastName =
            String(
                paypalCapture
                    ?.payer
                    ?.name
                    ?.surname || ""
            ).trim() || null;


        const fullName =
            [firstName, lastName]
                .filter(Boolean)
                .join(" ") ||
            null;


        // =================================================
        // FIND / CREATE CUSTOMER
        // =================================================

        let customerId = null;


        const {
            data: existingCustomer,
            error: customerLookupError
        } = await supabase
            .from("Customers")
            .select("id")
            .ilike(
                "email",
                paypalEmail
            )
            .maybeSingle();


        if (customerLookupError) {
            throw customerLookupError;
        }


        if (existingCustomer) {

            customerId =
                existingCustomer.id;

        } else {

            const {
                data: newCustomer,
                error: customerCreateError
            } = await supabase
                .from("Customers")
                .insert({
                    email:
                        paypalEmail,

                    first_name:
                        firstName,

                    last_name:
                        lastName,

                    account_status:
                        "guest"
                })
                .select("id")
                .single();


            if (customerCreateError) {
                throw customerCreateError;
            }


            customerId =
                newCustomer.id;
        }


       // =================================================
// LINK PAYPAL CUSTOMER TO MTC ORDER
// DO NOT MARK PAID UNTIL INVENTORY SUCCEEDS
// =================================================

const {
    error: orderUpdateError
} = await supabase
    .from("Orders")
    .update({
        customer_id:
            customerId,

        customer_email:
            paypalEmail,

        customer_name:
            fullName
    })
    .eq(
        "id",
        orderUUID
    );


if (orderUpdateError) {
    throw orderUpdateError;
}


console.log(
    "✅ PAYPAL CUSTOMER LINKED TO ORDER:",
    orderNumber
);


        // =================================================
        // PROCESS INVENTORY
        // =================================================

        if (
            mtcOrder.inventory_processed !==
            true
        ) {

            const {
                error: inventoryError
            } = await supabase.rpc(
                "process_order_inventory",
                {
                    p_order_id:
                        orderUUID
                }
            );


            if (inventoryError) {
                throw inventoryError;
            }

            console.log(
                "✅ PAYPAL INVENTORY UPDATED"
            );
        }



        // =================================================
        // SAVE PAYMENT
        // =================================================

        const {
            error: paymentError
        } = await supabase
            .from("Payments")
            .upsert(
                {
                    order_id:
                        orderUUID,

                    customer_id:
                        customerId,

                    paypal_order_id:
                        paypalOrderId,

                    paypal_capture_id:
                        capture.id,

                    amount:
                        capturedTotal,

                    currency:
                        capturedCurrency
                            .toLowerCase(),

                    payment_method:
                        "paypal",

                    card_last4:
                        null,

                    payment_status:
                        "paid",

                    refund_amount:
                        0
                },
                {
                    onConflict:
                        "order_id"
                }
            );


        if (paymentError) {
            throw paymentError;
        }


        console.log(
            "✅ PAYPAL PAYMENT RECORD SAVED"
        );

// =================================================
// MARK PAYPAL ORDER PAID
// INVENTORY + PAYMENT RECORD HAVE SUCCEEDED
// =================================================

const {
    error: paidOrderUpdateError
} = await supabase
    .from("Orders")
    .update({
        payment_status:
            "Paid",

        order_status:
            "Pending"
    })
    .eq(
        "id",
        orderUUID
    );


if (paidOrderUpdateError) {
    throw paidOrderUpdateError;
}


console.log(
    "✅ PAYPAL ORDER MARKED PAID:",
    orderNumber
);

// =================================================
// RECORD PAYPAL TAX AFTER SUCCESSFUL PAYMENT
// =================================================

try {
    await retryPayPalTaxRecording(orderUUID);
} catch (taxError) {
    console.error(
        "❌ PAYPAL TAX RECORDING FAILED:",
        orderNumber,
        taxError
    );

    // Payment succeeded. Do not capture PayPal again.
}

// =================================================
// PAYPAL LOW STOCK ADMIN NOTIFICATIONS
// =================================================

try {

    const {
        data: lowStockOrderItems,
        error: lowStockOrderItemsError
    } = await supabase
        .from("Order_items")
        .select(`
            product_id,
            item_quantity
        `)
        .eq(
            "order_id",
            orderUUID
        );


    if (lowStockOrderItemsError) {

        console.error(
            "PAYPAL LOW STOCK ORDER ITEMS ERROR:",
            lowStockOrderItemsError
        );

    } else {

        const lowStockProductIds = [
            ...new Set(
                (lowStockOrderItems || [])
                    .map(
                        item =>
                            item.product_id
                    )
                    .filter(Boolean)
            )
        ];


        if (
            lowStockProductIds.length > 0
        ) {

            const {
                data: lowStockInventoryRows,
                error: lowStockInventoryError
            } = await supabase
                .from("Inventory")
                .select(`
                    product_id,
                    quantity
                `)
                .in(
                    "product_id",
                    lowStockProductIds
                );


            if (lowStockInventoryError) {

                console.error(
                    "PAYPAL LOW STOCK INVENTORY ERROR:",
                    lowStockInventoryError
                );

            } else {

                const LOW_STOCK_THRESHOLD = 5;


                const productsBelowThreshold =
                    (
                        lowStockInventoryRows ||
                        []
                    ).filter(
                        inventoryRow =>
                            Number(
                                inventoryRow
                                    .quantity ||
                                0
                            ) <=
                            LOW_STOCK_THRESHOLD
                    );


                console.log(
                    "🔎 PAYPAL LOW STOCK DEBUG:",
                    {
                        orderUUID,
                        lowStockProductIds,
                        inventoryRows:
                            lowStockInventoryRows,
                        productsBelowThreshold
                    }
                );


                if (
                    productsBelowThreshold.length >
                    0
                ) {

                    const {
                        data: lowStockAdmins,
                        error: lowStockAdminsError
                    } = await supabase
                        .from("Admins")
                        .select(`
                            user_id,
                            status
                        `)
                        .eq(
                            "status",
                            "Active"
                        );


                    if (lowStockAdminsError) {

                        console.error(
                            "PAYPAL LOW STOCK ADMIN ERROR:",
                            lowStockAdminsError
                        );

                    } else {

                        const activeAdminIds = [
                            ...new Set(
                                (
                                    lowStockAdmins ||
                                    []
                                )
                                    .map(
                                        admin =>
                                            admin.user_id
                                    )
                                    .filter(Boolean)
                            )
                        ];


                        let lowStockAdminUserIds =
                            [];


                        if (
                            activeAdminIds.length >
                            0
                        ) {

                            const {
                                data:
                                    notificationSettings,
                                error:
                                    notificationSettingsError
                            } = await supabase
                                .from(
                                    "Admin_Notification_Settings"
                                )
                                .select(`
                                    admin_id,
                                    low_stock
                                `)
                                .in(
                                    "admin_id",
                                    activeAdminIds
                                );


                            if (
                                notificationSettingsError
                            ) {

                                console.error(
                                    "PAYPAL LOW STOCK SETTINGS ERROR:",
                                    notificationSettingsError
                                );

                            } else {

                                const settingsByAdmin =
                                    new Map(
                                        (
                                            notificationSettings ||
                                            []
                                        ).map(
                                            setting => [
                                                setting.admin_id,
                                                setting
                                            ]
                                        )
                                    );


                                lowStockAdminUserIds =
                                    activeAdminIds.filter(
                                        adminUserId => {

                                            const settings =
                                                settingsByAdmin.get(
                                                    adminUserId
                                                );

                                            // No row means default ON.
                                            if (!settings) {
                                                return true;
                                            }

                                            return (
                                                settings.low_stock ===
                                                true
                                            );
                                        }
                                    );
                            }
                        }


                        const lowStockNotifications =
                            [];


                        for (
                            const inventoryRow
                            of productsBelowThreshold
                        ) {

                            for (
                                const adminUserId
                                of lowStockAdminUserIds
                            ) {

                                lowStockNotifications.push({
                                    admin_user_id:
                                        adminUserId,

                                    notification_type:
                                        "Low Stock",

                                    title:
                                        "Low Stock",

                                    message:
                                        `A product is low on stock. ${Number(
                                            inventoryRow.quantity ||
                                            0
                                        )} remaining.`,

                                    related_product_id:
                                        inventoryRow.product_id,

                                    destination_page:
                                        "products",

                                    destination_action:
                                        "open_product",

                                    is_read:
                                        false
                                });
                            }
                        }


                        if (
                            lowStockNotifications.length >
                            0
                        ) {

                            const {
                                data:
                                    existingNotifications,
                                error:
                                    existingNotificationsError
                            } = await supabase
                                .from(
                                    "Admin_Notifications"
                                )
                                .select(`
                                    admin_user_id,
                                    related_product_id
                                `)
                                .eq(
                                    "notification_type",
                                    "Low Stock"
                                )
                                .eq(
                                    "is_read",
                                    false
                                )
                                .in(
                                    "related_product_id",
                                    lowStockProductIds
                                );


                            if (
                                existingNotificationsError
                            ) {

                                console.error(
                                    "PAYPAL LOW STOCK DUPLICATE CHECK ERROR:",
                                    existingNotificationsError
                                );

                            } else {

                                const existingPairs =
                                    new Set(
                                        (
                                            existingNotifications ||
                                            []
                                        ).map(
                                            notification =>
                                                `${notification.admin_user_id}:${notification.related_product_id}`
                                        )
                                    );


                                const newNotifications =
                                    lowStockNotifications.filter(
                                        notification => {

                                            const key =
                                                `${notification.admin_user_id}:${notification.related_product_id}`;

                                            return (
                                                !existingPairs.has(
                                                    key
                                                )
                                            );
                                        }
                                    );


                                if (
                                    newNotifications.length >
                                    0
                                ) {

                                    const {
                                        error:
                                            insertNotificationError
                                    } = await supabase
                                        .from(
                                            "Admin_Notifications"
                                        )
                                        .insert(
                                            newNotifications
                                        );


                                    if (
                                        insertNotificationError
                                    ) {

                                        console.error(
                                            "PAYPAL LOW STOCK NOTIFICATION ERROR:",
                                            insertNotificationError
                                        );

                                    } else {

                                        console.log(
                                            "🔔 PAYPAL LOW STOCK NOTIFICATIONS CREATED:",
                                            newNotifications.length
                                        );
                                    }

                                } else {

                                    console.log(
                                        "🔔 PAYPAL LOW STOCK SKIPPED - EXISTING UNREAD ALERT"
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }

} catch (lowStockNotificationError) {

    console.error(
        "PAYPAL LOW STOCK NOTIFICATION ERROR:",
        lowStockNotificationError
    );
}

        // =================================================
        // SHIPPING RECORD
        // =================================================

        const shippingMethod =
            mtcOrder
                .paypal_shipping_method ||
            "Standard Shipping";


        const {
            error: shippingError
        } = await supabase
            .from("Shipping")
            .upsert(
                {
                    order_id:
                        orderUUID,

                    shipping_method:
                        shippingMethod,

                    shipping_cost:
                        Number(
                            mtcOrder
                                .shipping_amount ||
                            0
                        ),

                    shipping_status:
                        "Not Shipped",

                    carrier:
                        null,

                    tracking_number:
                        null
                },
                {
                    onConflict:
                        "order_id"
                }
            );


        if (shippingError) {
            throw shippingError;
        }


        console.log(
            "✅ PAYPAL SHIPPING RECORD SAVED"
        );


        // =================================================
        // SHIPPING ADDRESS
        // =================================================

        const address =
            mtcOrder
                .paypal_shipping_address;


        if (
            address &&
            customerId
        ) {

            const {
                error: addressError
            } = await supabase
                .from("Addresses")
                .insert({
                    customer_id:
                        customerId,

                    address_type:
                        "shipping",

                    first_name:
                        address.firstName ||
                        firstName,

                    last_name:
                        address.lastName ||
                        lastName,

                    address_line_1:
                        address.line1 ||
                        null,

                    address_line_2:
                        address.line2 ||
                        null,

                    city:
                        address.city ||
                        null,

                    state:
                        address.state ||
                        null,

                    postal_code:
                        address.postalCode ||
                        null,

                    country:
                        address.country ||
                        "US",

                    phone:
                        null,

                    is_default:
                        false
                });


            if (addressError) {
                throw addressError;
            }


            console.log(
                "✅ PAYPAL SHIPPING ADDRESS SAVED"
            );
        }


        // =================================================
        // PROCESS DISCOUNT USAGE
        // =================================================

        if (
            mtcOrder.paypal_discount_id
        ) {

            const {
                data: usedDiscount,
                error: discountLookupError
            } = await supabase
                .from("Discounts")
                .select(`
                    id,
                    code,
                    usage_limit,
                    times_used
                `)
                .eq(
                    "id",
                    mtcOrder.paypal_discount_id
                )
                .maybeSingle();


            if (discountLookupError) {
                throw discountLookupError;
            }


            if (usedDiscount) {

                const newTimesUsed =
                    Number(
                        usedDiscount
                            .times_used || 0
                    ) + 1;


                const usageLimit =
                    usedDiscount
                        .usage_limit === null
                        ? null
                        : Number(
                            usedDiscount
                                .usage_limit
                        );


                if (
                    usageLimit !== null &&
                    newTimesUsed >= usageLimit
                ) {

                    const {
                        error: deleteDiscountError
                    } = await supabase
                        .from("Discounts")
                        .delete()
                        .eq(
                            "id",
                            usedDiscount.id
                        );


                    if (
                        deleteDiscountError
                    ) {
                        throw deleteDiscountError;
                    }

                } else {

                    const {
                        error: discountUpdateError
                    } = await supabase
                        .from("Discounts")
                        .update({
                            times_used:
                                newTimesUsed
                        })
                        .eq(
                            "id",
                            usedDiscount.id
                        );


                    if (
                        discountUpdateError
                    ) {
                        throw discountUpdateError;
                    }
                }
            }
        }


        // =================================================
        // ORDER CONFIRMATION EMAIL
        // =================================================

        try {

            await sendOrderConfirmationEmail({
                email:
                    paypalEmail,

                customerName:
                    fullName,

                orderNumber:
                    orderNumber,

                orderId:
                    orderUUID
            });


            console.log(
                "✅ PAYPAL ORDER CONFIRMATION EMAIL SENT"
            );

        } catch (emailError) {

            console.error(
                "⚠️ PAYPAL ORDER EMAIL FAILED:",
                emailError.message
            );
        }


        // =================================================
        // NEW ORDER ADMIN NOTIFICATIONS
        // =================================================

        try {

            const {
                data: admins,
                error: adminsError
            } = await supabase
                .from("Admins")
                .select(`
                    user_id,
                    status
                `)
                .eq(
                    "status",
                    "Active"
                );


            if (adminsError) {
                throw adminsError;
            }


            const activeAdminIds =
                [
                    ...new Set(
                        (admins || [])
                            .map(
                                admin =>
                                    admin.user_id
                            )
                            .filter(Boolean)
                    )
                ];


            if (
                activeAdminIds.length >
                0
            ) {

                const {
                    data: settings
                } = await supabase
                    .from(
                        "Admin_Notification_Settings"
                    )
                    .select(`
                        admin_id,
                        new_orders
                    `)
                    .in(
                        "admin_id",
                        activeAdminIds
                    );


                const settingsMap =
                    new Map(
                        (settings || [])
                            .map(
                                setting => [
                                    setting.admin_id,
                                    setting
                                ]
                            )
                    );


                const notifyAdminIds =
                    activeAdminIds.filter(
                        adminId => {

                            const setting =
                                settingsMap.get(
                                    adminId
                                );

                            return (
                                !setting ||
                                setting.new_orders ===
                                    true
                            );
                        }
                    );


                const notifications =
                    notifyAdminIds.map(
                        adminId => ({
                            admin_user_id:
                                adminId,

                            notification_type:
                                "New Order",

                            title:
                                "New Order",

                            message:
                                `Order ${orderNumber} has been placed.`,

                            related_order_id:
                                orderUUID,

                            destination_page:
                                "orders",

                            destination_action:
                                "open_order_details",

                            is_read:
                                false
                        })
                    );


                if (
                    notifications.length >
                    0
                ) {

                    const {
                        error:
                            notificationError
                    } = await supabase
                        .from(
                            "Admin_Notifications"
                        )
                        .insert(
                            notifications
                        );


                    if (
                        notificationError
                    ) {
                        throw notificationError;
                    }
                }
            }


            console.log(
                "🔔 PAYPAL NEW ORDER NOTIFICATIONS CREATED"
            );

        } catch (
            notificationError
        ) {

            console.error(
                "PAYPAL NEW ORDER NOTIFICATION ERROR:",
                notificationError
            );
        }


        // =================================================
        // SUCCESS
        // =================================================

        console.log(
            "🎉 PAYPAL ORDER COMPLETE:",
            orderNumber
        );


return res.json({
    success: true,

    orderId:
        orderUUID,

    orderNumber:
        orderNumber,

    paymentStatus:
        "Paid",

    orderStatus:
        "Pending",

    paypalOrderId:
        paypalOrderId,

    paypalCaptureId:
        capture.id
});


    } catch (error) {

        console.error(
            "❌ PAYPAL CAPTURE ROUTE ERROR:",
            error
        );


        return res.status(500).json({
            success: false,

            error:
                error.message ||
                "Unable to capture PayPal payment."
        });
    }
});

// =========================================================
// PUBLIC NEWSLETTER SUBSCRIPTION
// =========================================================

// Limit repeated subscription requests from the same IP.
// This protects the public endpoint from basic spam/abuse.
const newsletterSubscribeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,

    standardHeaders: "draft-7",
    legacyHeaders: false,

    message: {
        success: false,
        error: "Too many subscription attempts. Please try again later.",
    },
});


// =========================================================
// SUBSCRIBE TO NEWSLETTER
// =========================================================

app.post(
    "/subscribe",
    newsletterSubscribeLimiter,
    async (req, res) => {

        try {

            // =============================================
            // GET + NORMALIZE EMAIL
            // =============================================

            const email =
                String(req.body?.email || "")
                    .trim()
                    .toLowerCase();


            // =============================================
            // REQUIRE EMAIL
            // =============================================

            if (!email) {

                return res.status(400).json({
                    success: false,
                    error: "Email address is required.",
                });

            }


            // =============================================
            // EMAIL LENGTH
            // =============================================

            if (email.length > 254) {

                return res.status(400).json({
                    success: false,
                    error: "Please enter a valid email address.",
                });

            }


            // =============================================
            // BASIC EMAIL VALIDATION
            // Server validation is authoritative.
            // =============================================

            const emailPattern =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailPattern.test(email)) {

                return res.status(400).json({
                    success: false,
                    error: "Please enter a valid email address.",
                });

            }


            // =============================================
            // LOOK FOR EXISTING SUBSCRIBER
            // =============================================

            const {
                data: existingSubscriber,
                error: subscriberLookupError,
            } = await supabase
                .from("Subscribers")
                .select(`
                    id,
                    email,
                    is_active,
                    subscribed_at,
                    unsubscribed_at
                `)
                .ilike("email", email)
                .maybeSingle();


            if (subscriberLookupError) {

                console.error(
                    "SUBSCRIBER LOOKUP ERROR:",
                    subscriberLookupError
                );

                return res.status(500).json({
                    success: false,
                    error: "Unable to process subscription.",
                });

            }


            // =============================================
            // ALREADY ACTIVE
            // =============================================

            if (
                existingSubscriber &&
                existingSubscriber.is_active === true
            ) {

                return res.json({
                    success: true,
                    alreadySubscribed: true,
                    message: "You're already subscribed!",
                });

            }


            // =============================================
            // REACTIVATE PREVIOUS SUBSCRIBER
            // =============================================

            if (existingSubscriber) {

                const {
                    error: reactivateError,
                } = await supabase
                    .from("Subscribers")
                    .update({
                        is_active: true,

                        subscribed_at:
                            new Date().toISOString(),

                        unsubscribed_at: null,
                    })
                    .eq(
                        "id",
                        existingSubscriber.id
                    );


                if (reactivateError) {

                    console.error(
                        "SUBSCRIBER REACTIVATE ERROR:",
                        reactivateError
                    );

                    return res.status(500).json({
                        success: false,
                        error: "Unable to process subscription.",
                    });

                }


                return res.json({
                    success: true,
                    reactivated: true,
                    message: "Welcome back! You're subscribed.",
                });

            }


            // =============================================
            // CREATE NEW SUBSCRIBER
            // =============================================

            const {
                data: newSubscriber,
                error: createSubscriberError,
            } = await supabase
                .from("Subscribers")
                .insert({
                    email: email,
                    is_active: true,
                })
                .select(`
                    id,
                    subscribed_at
                `)
                .single();


            if (createSubscriberError) {

                /*
                    PostgreSQL error 23505 = unique violation.

                    The database has a unique normalized-email
                    index, so this also protects against two
                    simultaneous requests creating duplicates.
                */

                if (
                    createSubscriberError.code === "23505"
                ) {

                    return res.json({
                        success: true,
                        alreadySubscribed: true,
                        message: "You're already subscribed!",
                    });

                }


                console.error(
                    "CREATE SUBSCRIBER ERROR:",
                    createSubscriberError
                );

                return res.status(500).json({
                    success: false,
                    error: "Unable to process subscription.",
                });

            }


// =============================================
// CREATE NEW SUBSCRIBER ADMIN NOTIFICATIONS
// =============================================

try {

    // Get all active admins
    const {
        data: subscriberAdmins,
        error: subscriberAdminsError,
    } = await supabase
        .from("Admins")
        .select(`
            user_id,
            status
        `)
        .eq("status", "Active");


    if (subscriberAdminsError) {

        console.error(
            "SUBSCRIBER NOTIFICATION ADMIN LOOKUP ERROR:",
            subscriberAdminsError
        );

    } else {

        const subscriberAdminUserIds = [
            ...new Set(
                (subscriberAdmins || [])
                    .map((admin) => admin.user_id)
                    .filter(Boolean)
            ),
        ];


        const subscriberNotifications =
            subscriberAdminUserIds.map(
                (adminUserId) => ({

                    admin_user_id: adminUserId,

                    notification_type:
                        "New Subscriber",

                    title:
                        "New Subscriber",

                    message:
                        `${email} subscribed to the newsletter.`,

                    destination_page:
                        "subscribers",

                    destination_action:
                        "open_subscribers",

                    is_read: false,

                })
            );


        if (subscriberNotifications.length > 0) {

            const {
                error: subscriberNotificationError,
            } = await supabase
                .from("Admin_Notifications")
                .insert(subscriberNotifications);


            if (subscriberNotificationError) {

                console.error(
                    "NEW SUBSCRIBER NOTIFICATION CREATE ERROR:",
                    subscriberNotificationError
                );

            } else {

                console.log(
                    "🔔 NEW SUBSCRIBER ADMIN NOTIFICATIONS CREATED:",
                    email
                );

            }

        }

    }

} catch (subscriberNotificationError) {

    console.error(
        "NEW SUBSCRIBER NOTIFICATION ERROR:",
        subscriberNotificationError
    );

}


// =============================================
// SUCCESS
// =============================================

return res.status(201).json({
    success: true,
    subscribed: true,
    message:
        "Thanks for subscribing!",
});

} catch (error) {

    console.error(
        "PUBLIC SUBSCRIBE ERROR:",
        error
    );


    return res.status(500).json({
        success: false,
        error:
            "Unable to process subscription.",
    });

}

    }
);

// =========================================================
// END PUBLIC NEWSLETTER SUBSCRIPTION
// =========================================================

// =========================================================
// PUBLIC NEWSLETTER UNSUBSCRIBE
// =========================================================

app.get("/unsubscribe", async (req, res) => {

    try {

        // =============================================
        // GET TOKEN
        // =============================================

        const unsubscribeToken =
            String(
                req.query?.token || ""
            ).trim();


        if (!unsubscribeToken) {

            return res.status(400).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Unsubscribe | Midwest Toy Connections</title>
                </head>
                <body style="
                    margin:0;
                    min-height:100vh;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    background:#050816;
                    color:#ffffff;
                    font-family:Arial,sans-serif;
                ">
                    <div style="
                        max-width:520px;
                        padding:40px;
                        text-align:center;
                        background:#0d1226;
                        border:1px solid rgba(255,255,255,0.08);
                        border-radius:16px;
                    ">
                        <h1>Invalid Unsubscribe Link</h1>
                        <p style="color:#9ca3af;">
                            This unsubscribe link is invalid.
                        </p>
                    </div>
                </body>
                </html>
            `);

        }


        // =============================================
        // FIND SUBSCRIBER
        // =============================================

        const {
            data: subscriber,
            error: subscriberLookupError,
        } =
            await supabase
                .from("Subscribers")
                .select(`
                    id,
                    is_active
                `)
                .eq(
                    "unsubscribe_token",
                    unsubscribeToken
                )
                .maybeSingle();


        if (subscriberLookupError) {

            console.error(
                "UNSUBSCRIBE LOOKUP ERROR:",
                subscriberLookupError
            );

            return res.status(500).send(
                "Unable to process unsubscribe request."
            );

        }


        if (!subscriber) {

            return res.status(404).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Unsubscribe | Midwest Toy Connections</title>
                </head>
                <body style="
                    margin:0;
                    min-height:100vh;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    background:#050816;
                    color:#ffffff;
                    font-family:Arial,sans-serif;
                ">
                    <div style="
                        max-width:520px;
                        padding:40px;
                        text-align:center;
                        background:#0d1226;
                        border:1px solid rgba(255,255,255,0.08);
                        border-radius:16px;
                    ">
                        <h1>Link Not Found</h1>
                        <p style="color:#9ca3af;">
                            This unsubscribe link is no longer valid.
                        </p>
                    </div>
                </body>
                </html>
            `);

        }


        // =============================================
        // DELETE SUBSCRIBER
        // =============================================

        const {
            error: unsubscribeError,
        } =
            await supabase
                .from("Subscribers")
                .delete()
                .eq(
                    "id",
                    subscriber.id
                );


        if (unsubscribeError) {

            console.error(
                "UNSUBSCRIBE DELETE ERROR:",
                unsubscribeError
            );

            return res.status(500).send(
                "Unable to process unsubscribe request."
            );

        }

        // =============================================
        // SUCCESS PAGE
        // =============================================

        return res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Unsubscribed | Midwest Toy Connections</title>
            </head>

            <body style="
                margin:0;
                min-height:100vh;
                display:flex;
                align-items:center;
                justify-content:center;
                background:#050816;
                color:#ffffff;
                font-family:Arial,sans-serif;
            ">

                <div style="
                    width:calc(100% - 40px);
                    max-width:520px;
                    padding:40px;
                    text-align:center;
                    background:#0d1226;
                    border:1px solid rgba(255,255,255,0.08);
                    border-radius:16px;
                    box-sizing:border-box;
                ">

                    <h1 style="margin-top:0;">
                        You've Been Unsubscribed
                    </h1>

                    <p style="
                        color:#9ca3af;
                        line-height:1.6;
                    ">
                        You will no longer receive promotional emails
                        from Midwest Toy Connections.
                    </p>

                    <p style="
                        margin-bottom:0;
                        color:#6b7280;
                        font-size:13px;
                    ">
                        You can subscribe again at any time from our website.
                    </p>

                </div>

            </body>
            </html>
        `);


    } catch (error) {

        console.error(
            "PUBLIC UNSUBSCRIBE ERROR:",
            error
        );

        return res.status(500).send(
            "Unable to process unsubscribe request."
        );

    }

});


// =========================================================
// END PUBLIC NEWSLETTER UNSUBSCRIBE
// =========================================================


// =========================================================
// CREATE CUSTOMER CONTACT MESSAGE
// =========================================================

app.post("/contact-message", async (req, res) => {
    try {
        const name = String(req.body?.name || "").trim();
        const email = String(req.body?.email || "")
            .trim()
            .toLowerCase();
        const subject = String(req.body?.subject || "").trim();
        const message = String(req.body?.message || "").trim();

        if (!name || !email || !subject || !message) {
            return res.status(400).json({
                success: false,
                error: "All contact fields are required."
            });
        }

        const {
            data: newMessage,
            error: messageError
        } = await supabase
            .from("Messages")
            .insert({
                name: name,
                email: email,
                subject: subject,
                message: message,
                status: "New"
            })
            .select("id")
            .single();

        if (messageError || !newMessage) {
            console.error(
                "CONTACT MESSAGE CREATE ERROR:",
                messageError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to save message."
            });
        }

        return res.json({
            success: true,
            messageId: newMessage.id
        });

    } catch (error) {
        console.error(
            "CONTACT MESSAGE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Unable to submit message."
        });
    }
});

// =========================================================
// CUSTOMER MESSAGE ADMIN NOTIFICATION
// =========================================================

app.post("/contact-message-notification", async (req, res) => {
    try {
        const messageId = String(req.body?.messageId || "").trim();

        // =========================================
        // REQUIRE MESSAGE ID
        // =========================================

        if (!messageId) {
            return res.status(400).json({
                success: false,
                error: "Message ID is required.",
            });
        }

        // =========================================
        // VERIFY MESSAGE EXISTS
        // =========================================

        const { data: messageRecord, error: messageLookupError } = await supabase
            .from("Messages")
            .select(
                `
                id,
                name,
                email,
                subject,
                status
            `
            )
            .eq("id", messageId)
            .maybeSingle();

        if (messageLookupError) {
            console.error("MESSAGE NOTIFICATION LOOKUP ERROR:", messageLookupError);

            return res.status(500).json({
                success: false,
                error: "Unable to verify message.",
            });
        }

        if (!messageRecord) {
            return res.status(404).json({
                success: false,
                error: "Message not found.",
            });
        }

        // =========================================
        // GET ACTIVE ADMINS
        // =========================================

        const { data: messageAdmins, error: messageAdminsError } = await supabase
            .from("Admins")
            .select(
                `
                user_id,
                status
            `
            )
            .eq("status", "Active");

        if (messageAdminsError) {
            console.error("MESSAGE NOTIFICATION ADMIN LOOKUP ERROR:", messageAdminsError);

            return res.status(500).json({
                success: false,
                error: "Unable to load admins.",
            });
        }

        const activeMessageAdminUserIds = [
            ...new Set((messageAdmins || []).map((admin) => admin.user_id).filter(Boolean)),
        ];

        let adminUserIds = [];

        if (activeMessageAdminUserIds.length > 0) {
            const { data: messageNotificationSettings, error: messageNotificationSettingsError } = await supabase
                .from("Admin_Notification_Settings")
                .select(
                    `
            admin_id,
            new_messages
        `
                )
                .in("admin_id", activeMessageAdminUserIds);

            if (messageNotificationSettingsError) {
                console.error("NEW MESSAGE NOTIFICATION SETTINGS ERROR:", messageNotificationSettingsError);
            } else {
                const messageSettingsByAdmin = new Map(
                    (messageNotificationSettings || []).map((setting) => [setting.admin_id, setting])
                );

                adminUserIds = activeMessageAdminUserIds.filter((adminUserId) => {
                    const settings = messageSettingsByAdmin.get(adminUserId);

                    // No settings row = default ON
                    if (!settings) {
                        return true;
                    }

                    return settings.new_messages === true;
                });
            }
        }

        if (adminUserIds.length === 0) {
            return res.json({
                success: true,
            });
        }

        // =========================================
        // CHECK EXISTING NOTIFICATIONS
        // PREVENT DUPLICATES
        // =========================================

        const { data: existingNotifications, error: existingNotificationsError } = await supabase
            .from("Admin_Notifications")
            .select(
                `
                admin_user_id,
                related_message_id
            `
            )
            .eq("notification_type", "New Message")
            .eq("related_message_id", messageRecord.id)
            .in("admin_user_id", adminUserIds);

        if (existingNotificationsError) {
            console.error("MESSAGE NOTIFICATION DUPLICATE CHECK ERROR:", existingNotificationsError);

            return res.status(500).json({
                success: false,
                error: "Unable to check message notifications.",
            });
        }

        const existingAdminIds = new Set(
            (existingNotifications || []).map((notification) => notification.admin_user_id).filter(Boolean)
        );

        // =========================================
        // BUILD ONLY MISSING NOTIFICATIONS
        // =========================================

        const messageNotifications = adminUserIds
            .filter((adminUserId) => !existingAdminIds.has(adminUserId))
            .map((adminUserId) => ({
                admin_user_id: adminUserId,

                notification_type: "New Message",

                title: "New Customer Message",

                message: `${messageRecord.name || messageRecord.email || "Customer"} sent a new message${
                    messageRecord.subject ? `: ${messageRecord.subject}` : "."
                }`,

                related_message_id: messageRecord.id,

                destination_page: "messages",

                destination_action: "open_message",

                is_read: false,
            }));

        // =========================================
        // INSERT NOTIFICATIONS
        // =========================================

        if (messageNotifications.length > 0) {
            const { error: messageNotificationError } = await supabase
                .from("Admin_Notifications")
                .insert(messageNotifications);

            if (messageNotificationError) {
                console.error("NEW MESSAGE NOTIFICATION CREATE ERROR:", messageNotificationError);

                return res.status(500).json({
                    success: false,
                    error: "Unable to create message notifications.",
                });
            }
        }

        console.log("🔔 NEW MESSAGE ADMIN NOTIFICATIONS CREATED:", messageRecord.id);

        return res.json({
            success: true,
        });
    } catch (error) {
        console.error("CONTACT MESSAGE NOTIFICATION ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to create message notification.",
        });
    }
});

// =========================================================
// ADMIN SUBSCRIBERS
// Logged-in admins can view subscribers
// =========================================================

app.get("/admin-subscribers", async (req, res) => {

    try {

        // =========================================
        // AUTH TOKEN
        // =========================================

        const authHeader =
            req.headers.authorization || "";

        const token =
            authHeader.startsWith("Bearer ")
                ? authHeader.substring(7)
                : null;

        if (!token) {

            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });

        }

        // =========================================
        // VERIFY ACTIVE ADMIN SESSION
        // =========================================

        const sessionStatus =
            await verifyActiveAdminSession(token);


        if (!sessionStatus.active) {

            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });

        }


        // =========================================
        // VERIFY AUTHENTICATED USER
        // =========================================

        const {
            data: authData,
            error: authError,
        } = await supabase.auth.getUser(token);


        if (
            authError ||
            !authData?.user
        ) {

            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });

        }

        const currentUserId =
            authData.user.id;

        // =========================================
        // LOAD SUBSCRIBERS
        // =========================================

        const {
            data: subscribers,
            error: subscribersError,
        } = await supabase
            .from("Subscribers")
            .select(`
                id,
                email,
                is_active,
                subscribed_at,
                unsubscribed_at,
                created_at
            `)
            .order(
                "subscribed_at",
                {
                    ascending: false,
                }
            );


        if (subscribersError) {

            console.error(
                "LOAD ADMIN SUBSCRIBERS ERROR:",
                subscribersError
            );


            return res.status(500).json({
                success: false,
                error:
                    "Unable to load subscribers.",
            });

        }


        // =========================================
        // RETURN SUBSCRIBERS
        // =========================================

        return res.json({
            success: true,
            subscribers:
                subscribers || [],
        });


    } catch (error) {

        console.error(
            "GET ADMIN SUBSCRIBERS ERROR:",
            error
        );


        return res.status(500).json({
            success: false,
            error:
                "Unable to load subscribers.",
        });

    }

});

// =========================================================
// SEND SUBSCRIBER PROMOTION
// Permission: subscriptions.send_email
// =========================================================

app.post(
    "/admin-subscribers/send-promotion",
    async (req, res) => {

        try {

            // =============================================
            // AUTH TOKEN
            // =============================================

            const authHeader =
                req.headers.authorization || "";

            const token =
                authHeader.startsWith("Bearer ")
                    ? authHeader.substring(7)
                    : null;

            if (!token) {

                return res.status(401).json({
                    success: false,
                    error: "Unauthorized.",
                });

            }


            // =============================================
            // VERIFY ACTIVE ADMIN SESSION
            // =============================================

            const sessionStatus =
                await verifyActiveAdminSession(
                    token
                );

            if (!sessionStatus.active) {

                return res.status(401).json({
                    success: false,
                    error:
                        "Admin session has been revoked.",
                });

            }


            // =============================================
            // VERIFY AUTHENTICATED ADMIN
            // =============================================

            const {
                data: authData,
                error: authError,
            } =
                await supabase.auth.getUser(
                    token
                );

            if (
                authError ||
                !authData?.user
            ) {

                return res.status(401).json({
                    success: false,
                    error: "Unauthorized.",
                });

            }


            const currentUserId =
                authData.user.id;


            // =============================================
            // CHECK SEND EMAIL PERMISSION
            // =============================================

            const canSendPromotion =
                await adminHasPermission(
                    currentUserId,
                    "subscriptions.send_email"
                );

            if (!canSendPromotion) {

                return res.status(403).json({
                    success: false,
                    error:
                        "You do not have permission to send subscriber emails.",
                });

            }


            // =============================================
            // NORMALIZE REQUEST
            // =============================================

            const subscriberIds =
                Array.isArray(
                    req.body?.subscriberIds
                )
                    ? [
                        ...new Set(
                            req.body.subscriberIds
                                .map((id) =>
                                    String(id || "")
                                        .trim()
                                )
                                .filter(Boolean)
                        ),
                    ]
                    : [];


            const subject =
                String(
                    req.body?.subject || ""
                ).trim();


            const message =
                String(
                    req.body?.message || ""
                ).trim();


            const discountId =
                String(
                    req.body?.discountId || ""
                ).trim();


            // =============================================
            // VALIDATE REQUEST
            // =============================================

            if (
                subscriberIds.length === 0
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Select at least one subscriber.",
                });

            }


            if (subscriberIds.length > 100) {

                return res.status(400).json({
                    success: false,
                    error:
                        "You can send to a maximum of 100 subscribers at one time.",
                });

            }


            if (!subject) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Email subject is required.",
                });

            }


            if (subject.length > 150) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Email subject cannot exceed 150 characters.",
                });

            }


            if (!message) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Email message is required.",
                });

            }


            if (message.length > 5000) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Email message cannot exceed 5000 characters.",
                });

            }


            // =============================================
            // LOAD SUBSCRIBERS FROM DATABASE
            //
            // IMPORTANT:
            // Browser only supplies subscriber IDs.
            // Server decides which email addresses are used.
            // =============================================

            const {
                data: subscriberRows,
                error: subscriberError,
            } = await supabase
                .from("Subscribers")
                .select(`
                    id,
                    email,
                    is_active,
                    unsubscribe_token
                `)
                .in(
                    "id",
                    subscriberIds
                )
                .eq(
                    "is_active",
                    true
                );


            if (subscriberError) {

                console.error(
                    "PROMOTION SUBSCRIBER LOOKUP ERROR:",
                    subscriberError
                );

                return res.status(500).json({
                    success: false,
                    error:
                        "Unable to load selected subscribers.",
                });

            }


            const recipients =
                (subscriberRows || [])
                    .filter(
                        (subscriber) =>
                            subscriber.email
                    );


            if (recipients.length === 0) {

                return res.status(400).json({
                    success: false,
                    error:
                        "No active subscribers were found.",
                });

            }


            // =============================================
            // OPTIONAL DISCOUNT
            // =============================================

            let selectedDiscount = null;


            if (discountId) {

                const {
                    data: discount,
                    error: discountError,
                } = await supabase
                    .from("Discounts")
                    .select(`
                        id,
                        code,
                        discount_type,
                        discount_value,
                        minimum_order_amount,
                        starts_at,
                        expires_at,
                        is_active
                    `)
                    .eq(
                        "id",
                        discountId
                    )
                    .eq(
                        "is_active",
                        true
                    )
                    .maybeSingle();


                if (discountError) {

                    console.error(
                        "PROMOTION DISCOUNT LOOKUP ERROR:",
                        discountError
                    );

                    return res.status(500).json({
                        success: false,
                        error:
                            "Unable to verify discount code.",
                    });

                }


                if (!discount) {

                    return res.status(400).json({
                        success: false,
                        error:
                            "The selected discount is no longer active.",
                    });

                }


                const now =
                    Date.now();


                if (
                    discount.starts_at &&
                    new Date(
                        discount.starts_at
                    ).getTime() > now
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            "The selected discount has not started yet.",
                    });

                }


                if (
                    discount.expires_at &&
                    new Date(
                        discount.expires_at
                    ).getTime() < now
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            "The selected discount has expired.",
                    });

                }


                selectedDiscount =
                    discount;

            }


            // =============================================
            // BUILD PROMOTION MESSAGE
            // =============================================

            let promotionMessage =
                message;


            if (selectedDiscount) {

                promotionMessage +=
                    `\n\nDiscount Code: ${selectedDiscount.code}`;

            }


            // =============================================
            // SEND EMAILS
            // =============================================

            let sentCount = 0;

            const failedRecipients = [];


for (
    const subscriber
    of recipients
) {

    try {

        // =============================================
        // BUILD UNIQUE UNSUBSCRIBE LINK
        // =============================================

        const unsubscribeUrl =
            `${req.protocol}://${req.get("host")}/unsubscribe?token=${encodeURIComponent(
                subscriber.unsubscribe_token
            )}`;


        const subscriberPromotionMessage =
            `${promotionMessage}

            You received this email because you subscribed to Midwest Toy Connections promotions.

            Unsubscribe from promotional emails:
            ${unsubscribeUrl}`;


                    const response =
                        await fetch(
                            "https://api.emailjs.com/api/v1.0/email/send",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json",
                                },

                                body:
                                    JSON.stringify({
                                        service_id:
                                            EMAILJS_SERVICE_ID,

                                        template_id:
                                            EMAILJS_TEMPLATE_ID,

                                        user_id:
                                            EMAILJS_PUBLIC_KEY,

                                        accessToken:
                                            EMAILJS_PRIVATE_KEY,

                                        template_params: {
                                            to_email:
                                                subscriber.email,

                                            customer_name:
                                                "Subscriber",

                                            email_subject:
                                                subject,

                                            message:
                                                subscriberPromotionMessage,
                                        },
                                    }),
                            }
                        );


                    if (!response.ok) {

                        const errorText =
                            await response.text();

                        throw new Error(
                            `EmailJS failed: ${response.status} ${errorText}`
                        );

                    }


                    sentCount += 1;

                } catch (emailError) {

                    console.error(
                        "PROMOTION EMAIL SEND ERROR:",
                        subscriber.id,
                        emailError.message
                    );


                    failedRecipients.push(
                        subscriber.id
                    );

                }

            }


            // =============================================
            // NOTHING SENT
            // =============================================

            if (sentCount === 0) {

                return res.status(502).json({
                    success: false,
                    error:
                        "The promotion could not be sent.",
                });

            }


            // =============================================
            // ACTIVITY LOG
            // =============================================

            await logAdminActivity({

                adminId:
                    currentUserId,

                adminEmail:
                    authData.user.email ||
                    null,

                category:
                    "Subscribers",

                action:
                    "Promotion Sent",

                description:
                    `Sent promotion email to ${sentCount} subscriber${sentCount === 1 ? "" : "s"}.`,

                targetType:
                    "Subscribers",

                targetName:
                    subject,

                ipAddress:
                    req.ip || null,

                userAgent:
                    req.headers[
                        "user-agent"
                    ] || null,

                metadata: {
                    recipientCount:
                        recipients.length,

                    sentCount:
                        sentCount,

                    failedCount:
                        failedRecipients.length,

                    discountCode:
                        selectedDiscount?.code ||
                        null,
                },

            });


            // =============================================
            // SUCCESS
            // =============================================

            return res.json({

                success: true,

                message:
                    failedRecipients.length > 0
                        ? `Promotion sent to ${sentCount} subscriber(s). ${failedRecipients.length} email(s) failed.`
                        : `Promotion sent successfully to ${sentCount} subscriber(s).`,

                sentCount:
                    sentCount,

                failedCount:
                    failedRecipients.length,

            });


        } catch (error) {

            console.error(
                "SEND SUBSCRIBER PROMOTION ERROR:",
                error
            );


            return res.status(500).json({
                success: false,
                error:
                    "Unable to send promotion.",
            });

        }

    }
);


// =========================================================
// END ADMIN SUBSCRIBERS
// =========================================================

// =========================================================
// ADMIN DISCOUNTS
// =========================================================


// =========================================================
// CREATE DISCOUNT
// Permission: discounts.create
// =========================================================
app.post("/admin-discounts", async (req, res) => {

    try {

        // =========================================
        // AUTH TOKEN
        // =========================================

        const authHeader =
            req.headers.authorization || "";

        const token =
            authHeader.startsWith("Bearer ")
                ? authHeader.substring(7)
                : null;


        if (!token) {

            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });

        }


        // =========================================
        // VERIFY ACTIVE ADMIN SESSION
        // =========================================

        const sessionStatus =
            await verifyActiveAdminSession(token);


        if (!sessionStatus.active) {

            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });

        }


        // =========================================
        // VERIFY AUTHENTICATED ADMIN
        // =========================================

        const {
            data: authData,
            error: authError,
        } = await supabase.auth.getUser(token);


        if (
            authError ||
            !authData?.user
        ) {

            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });

        }


        const currentUserId =
            authData.user.id;


        // =========================================
        // CHECK CREATE DISCOUNT PERMISSION
        // =========================================

        const canCreateDiscount =
            await adminHasPermission(
                currentUserId,
                "discounts.create"
            );


        if (!canCreateDiscount) {

            return res.status(403).json({
                success: false,
                error:
                    "You do not have permission to create discounts.",
            });

        }


        // =========================================
        // NORMALIZE INPUT
        // =========================================

        const code =
            String(req.body?.code || "")
                .trim()
                .toUpperCase();

        const discountType =
            String(req.body?.discountType || "")
                .trim()
                .toLowerCase();

        const discountValue =
            Number(req.body?.discountValue);

        const minimumOrderAmount =
            req.body?.minimumOrderAmount === "" ||
            req.body?.minimumOrderAmount === null ||
            req.body?.minimumOrderAmount === undefined
                ? null
                : Number(req.body.minimumOrderAmount);

        const usageLimit =
            req.body?.usageLimit === "" ||
            req.body?.usageLimit === null ||
            req.body?.usageLimit === undefined
                ? null
                : Number(req.body.usageLimit);

        const startsAt =
            req.body?.startsAt
                ? new Date(req.body.startsAt)
                : null;

        const expiresAt =
            req.body?.expiresAt
                ? new Date(req.body.expiresAt)
                : null;

        const isActive =
            req.body?.isActive !== false;


        // =========================================
        // VALIDATE CODE
        // =========================================

        if (!code) {

            return res.status(400).json({
                success: false,
                error: "Discount code is required.",
            });

        }


        if (code.length > 40) {

            return res.status(400).json({
                success: false,
                error:
                    "Discount code cannot exceed 40 characters.",
            });

        }


        if (!/^[A-Z0-9_-]+$/.test(code)) {

            return res.status(400).json({
                success: false,
                error:
                    "Discount code may only contain letters, numbers, hyphens, and underscores.",
            });

        }


        // =========================================
        // VALIDATE TYPE
        // =========================================

        if (
            discountType !== "percentage" &&
            discountType !== "fixed"
        ) {

            return res.status(400).json({
                success: false,
                error: "Invalid discount type.",
            });

        }


        // =========================================
        // VALIDATE VALUE
        // =========================================

        if (
            !Number.isFinite(discountValue) ||
            discountValue <= 0
        ) {

            return res.status(400).json({
                success: false,
                error:
                    "Discount value must be greater than 0.",
            });

        }


        if (
            discountType === "percentage" &&
            discountValue > 100
        ) {

            return res.status(400).json({
                success: false,
                error:
                    "Percentage discounts cannot exceed 100%.",
            });

        }


        // =========================================
        // VALIDATE MINIMUM ORDER
        // =========================================

        if (
            minimumOrderAmount !== null &&
            (
                !Number.isFinite(minimumOrderAmount) ||
                minimumOrderAmount < 0
            )
        ) {

            return res.status(400).json({
                success: false,
                error:
                    "Minimum order amount cannot be negative.",
            });

        }


        // =========================================
        // VALIDATE USAGE LIMIT
        // =========================================

        if (
            usageLimit !== null &&
            (
                !Number.isInteger(usageLimit) ||
                usageLimit < 1
            )
        ) {

            return res.status(400).json({
                success: false,
                error:
                    "Usage limit must be a whole number greater than 0.",
            });

        }


        // =========================================
        // VALIDATE DATES
        // =========================================

        if (
            startsAt &&
            Number.isNaN(startsAt.getTime())
        ) {

            return res.status(400).json({
                success: false,
                error: "Invalid start date.",
            });

        }


        if (
            expiresAt &&
            Number.isNaN(expiresAt.getTime())
        ) {

            return res.status(400).json({
                success: false,
                error: "Invalid expiration date.",
            });

        }


        if (
            startsAt &&
            expiresAt &&
            expiresAt <= startsAt
        ) {

            return res.status(400).json({
                success: false,
                error:
                    "Expiration date must be after the start date.",
            });

        }


        // =========================================
        // CHECK FOR EXISTING CODE
        // =========================================

        const {
            data: existingDiscount,
            error: existingDiscountError,
        } = await supabase
            .from("Discounts")
            .select("id")
            .ilike("code", code)
            .maybeSingle();


        if (existingDiscountError) {

            console.error(
                "DISCOUNT CODE LOOKUP ERROR:",
                existingDiscountError
            );

            return res.status(500).json({
                success: false,
                error:
                    "Unable to verify discount code.",
            });

        }


        if (existingDiscount) {

            return res.status(409).json({
                success: false,
                error:
                    "That discount code already exists.",
            });

        }


        // =========================================
        // CREATE DISCOUNT IN DATABASE
        // =========================================

        const {
            data: createdDiscount,
            error: createDiscountError,
        } = await supabase
            .from("Discounts")
            .insert({
                code: code,
                discount_type: discountType,
                discount_value: discountValue,
                minimum_order_amount: minimumOrderAmount,

                starts_at:
                    startsAt
                        ? startsAt.toISOString()
                        : null,

                expires_at:
                    expiresAt
                        ? expiresAt.toISOString()
                        : null,

                usage_limit: usageLimit,
                is_active: isActive,
                created_by: currentUserId,
            })
            .select(`
                id,
                code,
                discount_type,
                discount_value,
                minimum_order_amount,
                starts_at,
                expires_at,
                usage_limit,
                times_used,
                is_active,
                created_at,
                updated_at
            `)
            .single();


        if (createDiscountError) {

            console.error(
                "CREATE DISCOUNT ERROR:",
                createDiscountError
            );


            if (createDiscountError.code === "23505") {

                return res.status(409).json({
                    success: false,
                    error:
                        "That discount code already exists.",
                });

            }


            return res.status(500).json({
                success: false,
                error:
                    "Unable to create discount.",
            });

        }


        // =========================================
        // SUCCESS
        // =========================================

        return res.status(201).json({
            success: true,
            discount: createdDiscount,
        });


    } catch (error) {

        console.error(
            "CREATE ADMIN DISCOUNT ERROR:",
            error
        );


        return res.status(500).json({
            success: false,
            error:
                "Unable to create discount.",
        });

    }

});

// =========================================================
// GET DISCOUNTS
// All authenticated admins can view
// =========================================================

app.get("/admin-discounts", async (req, res) => {

    try {

        // =========================================
        // AUTH TOKEN
        // =========================================

        const authHeader =
            req.headers.authorization || "";

        const token =
            authHeader.startsWith("Bearer ")
                ? authHeader.substring(7)
                : null;


        if (!token) {

            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });

        }


        // =========================================
        // VERIFY ACTIVE ADMIN SESSION
        // =========================================

        const sessionStatus =
            await verifyActiveAdminSession(token);


        if (!sessionStatus.active) {

            return res.status(401).json({
                success: false,
                error:
                    "Admin session has been revoked.",
            });

        }


        // =========================================
        // VERIFY AUTHENTICATED ADMIN
        // =========================================

        const {
            data: authData,
            error: authError,
        } = await supabase.auth.getUser(token);


        if (
            authError ||
            !authData?.user
        ) {

            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });

        }


        // =========================================
        // LOAD DISCOUNTS
        // =========================================

        const {
            data: discounts,
            error: discountsError,
        } = await supabase
            .from("Discounts")
            .select(`
                id,
                code,
                discount_type,
                discount_value,
                minimum_order_amount,
                starts_at,
                expires_at,
                usage_limit,
                times_used,
                is_active,
                created_at,
                updated_at
            `)
            .order(
                "created_at",
                {
                    ascending: false,
                }
            );


        if (discountsError) {

            console.error(
                "LOAD ADMIN DISCOUNTS ERROR:",
                discountsError
            );


            return res.status(500).json({
                success: false,
                error:
                    "Unable to load discounts.",
            });

        }


        // =========================================
        // SUCCESS
        // =========================================

        return res.json({
            success: true,
            discounts: discounts || [],
        });


    } catch (error) {

        console.error(
            "GET ADMIN DISCOUNTS ERROR:",
            error
        );


        return res.status(500).json({
            success: false,
            error:
                "Unable to load discounts.",
        });

    }

});

// =========================================================
// UPDATE DISCOUNT
// Permission: discounts.edit
// =========================================================

app.patch("/admin-discounts/:id", async (req, res) => {
    try {
        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ")
            ? authHeader.substring(7)
            : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =========================================
        // VERIFY ACTIVE ADMIN SESSION
        // =========================================

        const sessionStatus = await verifyActiveAdminSession(token);

        if (!sessionStatus.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        // =========================================
        // VERIFY AUTHENTICATED ADMIN
        // =========================================

        const {
            data: authData,
            error: authError,
        } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // =========================================
        // CHECK EDIT PERMISSION
        // =========================================

        const canEditDiscount = await adminHasPermission(
            currentUserId,
            "discounts.edit"
        );

        if (!canEditDiscount) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to update discounts.",
            });
        }

        // =========================================
        // DISCOUNT ID
        // =========================================

        const discountId = String(req.params.id || "").trim();

        if (!discountId) {
            return res.status(400).json({
                success: false,
                error: "Discount ID is required.",
            });
        }

        // =========================================
        // LOAD EXISTING DISCOUNT
        // =========================================

        const {
            data: existingDiscount,
            error: existingDiscountError,
        } = await supabase
            .from("Discounts")
            .select(`
                id,
                code
            `)
            .eq("id", discountId)
            .maybeSingle();

        if (existingDiscountError) {
            console.error(
                "DISCOUNT LOOKUP ERROR:",
                existingDiscountError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to load discount.",
            });
        }

        if (!existingDiscount) {
            return res.status(404).json({
                success: false,
                error: "Discount not found.",
            });
        }

        // =========================================
        // NORMALIZE INPUT
        // =========================================

        const code = String(req.body?.code || "")
            .trim()
            .toUpperCase();

        const discountType = String(
            req.body?.discountType || ""
        )
            .trim()
            .toLowerCase();

        const discountValue =
            Number(req.body?.discountValue);

        const minimumOrderAmount =
            req.body?.minimumOrderAmount === "" ||
            req.body?.minimumOrderAmount === null ||
            req.body?.minimumOrderAmount === undefined
                ? null
                : Number(req.body.minimumOrderAmount);

        const usageLimit =
            req.body?.usageLimit === "" ||
            req.body?.usageLimit === null ||
            req.body?.usageLimit === undefined
                ? null
                : Number(req.body.usageLimit);

        const startsAt =
            req.body?.startsAt
                ? new Date(req.body.startsAt)
                : null;

        const expiresAt =
            req.body?.expiresAt
                ? new Date(req.body.expiresAt)
                : null;

        const isActive =
            req.body?.isActive !== false;

        // =========================================
        // VALIDATE CODE
        // =========================================

        if (!code) {
            return res.status(400).json({
                success: false,
                error: "Discount code is required.",
            });
        }

        if (code.length > 40) {
            return res.status(400).json({
                success: false,
                error: "Discount code cannot exceed 40 characters.",
            });
        }

        if (!/^[A-Z0-9_-]+$/.test(code)) {
            return res.status(400).json({
                success: false,
                error:
                    "Discount code may only contain letters, numbers, hyphens, and underscores.",
            });
        }

        // =========================================
        // VALIDATE TYPE
        // =========================================

        if (
            discountType !== "percentage" &&
            discountType !== "fixed"
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid discount type.",
            });
        }

        // =========================================
        // VALIDATE VALUE
        // =========================================

        if (
            !Number.isFinite(discountValue) ||
            discountValue <= 0
        ) {
            return res.status(400).json({
                success: false,
                error: "Discount value must be greater than 0.",
            });
        }

        if (
            discountType === "percentage" &&
            discountValue > 100
        ) {
            return res.status(400).json({
                success: false,
                error: "Percentage discount cannot exceed 100%.",
            });
        }

        // =========================================
        // VALIDATE MINIMUM ORDER
        // =========================================

        if (
            minimumOrderAmount !== null &&
            (
                !Number.isFinite(minimumOrderAmount) ||
                minimumOrderAmount < 0
            )
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Minimum order amount cannot be negative.",
            });
        }

        // =========================================
        // VALIDATE USAGE LIMIT
        // =========================================

        if (
            usageLimit !== null &&
            (
                !Number.isInteger(usageLimit) ||
                usageLimit <= 0
            )
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Usage limit must be a positive whole number.",
            });
        }

        // =========================================
        // VALIDATE DATES
        // =========================================

        if (
            startsAt &&
            Number.isNaN(startsAt.getTime())
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid start date.",
            });
        }

        if (
            expiresAt &&
            Number.isNaN(expiresAt.getTime())
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid expiration date.",
            });
        }

        if (
            startsAt &&
            expiresAt &&
            expiresAt <= startsAt
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Expiration date must be after the start date.",
            });
        }

        // =========================================
        // CHECK DUPLICATE CODE
        // Exclude the discount being updated
        // =========================================

        const {
            data: duplicateDiscount,
            error: duplicateError,
        } = await supabase
            .from("Discounts")
            .select("id")
            .ilike("code", code)
            .neq("id", discountId)
            .maybeSingle();

        if (duplicateError) {
            console.error(
                "UPDATE DISCOUNT DUPLICATE CHECK ERROR:",
                duplicateError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to verify discount code.",
            });
        }

        if (duplicateDiscount) {
            return res.status(409).json({
                success: false,
                error: "That discount code already exists.",
            });
        }

        // =========================================
        // UPDATE DISCOUNT
        // =========================================

        const {
            data: updatedDiscount,
            error: updateError,
        } = await supabase
            .from("Discounts")
            .update({
                code: code,
                discount_type: discountType,
                discount_value: discountValue,
                minimum_order_amount: minimumOrderAmount,

                starts_at:
                    startsAt
                        ? startsAt.toISOString()
                        : null,

                expires_at:
                    expiresAt
                        ? expiresAt.toISOString()
                        : null,

                usage_limit: usageLimit,
                is_active: isActive,

                updated_at:
                    new Date().toISOString(),
            })
            .eq("id", discountId)
            .select(`
                id,
                code,
                discount_type,
                discount_value,
                minimum_order_amount,
                starts_at,
                expires_at,
                usage_limit,
                times_used,
                is_active,
                created_at,
                updated_at
            `)
            .single();

        if (updateError) {
            console.error(
                "UPDATE DISCOUNT ERROR:",
                updateError
            );

            if (updateError.code === "23505") {
                return res.status(409).json({
                    success: false,
                    error:
                        "That discount code already exists.",
                });
            }

            return res.status(500).json({
                success: false,
                error: "Unable to update discount.",
            });
        }

        // =========================================
        // ACTIVITY LOG
        // =========================================

        await logAdminActivity({
            adminId: currentUserId,
            adminEmail: authData.user.email || null,

            category: "Discounts",
            action: "Discount Updated",

            description:
                `Updated discount code ${updatedDiscount.code}.`,

            targetType: "Discount",
            targetId: updatedDiscount.id,
            targetName: updatedDiscount.code,

            ipAddress:
                req.ip || null,

            userAgent:
                req.headers["user-agent"] || null,

            metadata: {
                previousCode:
                    existingDiscount.code,
            },
        });

        // =========================================
        // SUCCESS
        // =========================================

        return res.json({
            success: true,
            message: "Discount updated successfully.",
            discount: updatedDiscount,
        });
    } catch (error) {
        console.error(
            "UPDATE DISCOUNT ROUTE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Unable to update discount.",
        });
    }
});


// =========================================================
// DELETE DISCOUNT
// Permission: discounts.delete
// =========================================================

app.delete("/admin-discounts/:id", async (req, res) => {
    try {
        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ")
            ? authHeader.substring(7)
            : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =========================================
        // VERIFY ACTIVE ADMIN SESSION
        // =========================================

        const sessionStatus = await verifyActiveAdminSession(token);

        if (!sessionStatus.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        // =========================================
        // VERIFY AUTHENTICATED ADMIN
        // =========================================

        const {
            data: authData,
            error: authError,
        } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // =========================================
        // CHECK DELETE PERMISSION
        // =========================================

        const canDeleteDiscount = await adminHasPermission(
            currentUserId,
            "discounts.delete"
        );

        if (!canDeleteDiscount) {
            return res.status(403).json({
                success: false,
                error:
                    "You do not have permission to delete discounts.",
            });
        }

        const discountId =
            String(req.params.id || "").trim();

        if (!discountId) {
            return res.status(400).json({
                success: false,
                error: "Discount ID is required.",
            });
        }

        // =========================================
        // LOAD DISCOUNT BEFORE DELETE
        // =========================================

        const {
            data: existingDiscount,
            error: existingDiscountError,
        } = await supabase
            .from("Discounts")
            .select(`
                id,
                code
            `)
            .eq("id", discountId)
            .maybeSingle();

        if (existingDiscountError) {
            console.error(
                "DELETE DISCOUNT LOOKUP ERROR:",
                existingDiscountError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to load discount.",
            });
        }

        if (!existingDiscount) {
            return res.status(404).json({
                success: false,
                error: "Discount not found.",
            });
        }

        // =========================================
        // DELETE DISCOUNT
        // =========================================

        const {
            error: deleteError,
        } = await supabase
            .from("Discounts")
            .delete()
            .eq("id", discountId);

        if (deleteError) {
            console.error(
                "DELETE DISCOUNT ERROR:",
                deleteError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to delete discount.",
            });
        }

        // =========================================
        // ACTIVITY LOG
        // =========================================

        await logAdminActivity({
            adminId: currentUserId,
            adminEmail: authData.user.email || null,

            category: "Discounts",
            action: "Discount Deleted",

            description:
                `Deleted discount code ${existingDiscount.code}.`,

            targetType: "Discount",
            targetId: existingDiscount.id,
            targetName: existingDiscount.code,

            ipAddress:
                req.ip || null,

            userAgent:
                req.headers["user-agent"] || null,
        });

        // =========================================
        // SUCCESS
        // =========================================

        return res.json({
            success: true,
            message: "Discount deleted successfully.",
            deletedDiscountId: existingDiscount.id,
        });
    } catch (error) {
        console.error(
            "DELETE DISCOUNT ROUTE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Unable to delete discount.",
        });
    }
});

// =========================================================
// END ADMIN DISCOUNTS
// =========================================================

// =========================================================
// ADMIN CATEGORIES
// Permission protected category management
// =========================================================

app.get("/admin-categories", async (req, res) => {
    try {
        // -----------------------------------------
        // AUTH TOKEN
        // -----------------------------------------

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // -----------------------------------------
        // VERIFY ACTIVE ADMIN SESSION
        // -----------------------------------------

        const sessionStatus = await verifyActiveAdminSession(token);

        if (!sessionStatus.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        // -----------------------------------------
        // GET AUTHENTICATED ADMIN
        // -----------------------------------------

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // -----------------------------------------
        // LOAD CATEGORIES
        // -----------------------------------------

        const { data: categories, error: categoriesError } = await supabase
            .from("Categories")
            .select("*")
            .order("name", {
                ascending: true,
            });

        if (categoriesError) {
            console.error("LOAD ADMIN CATEGORIES ERROR:", categoriesError);

            return res.status(500).json({
                success: false,
                error: "Unable to load categories.",
            });
        }

        return res.json({
            success: true,
            categories: categories || [],
        });
    } catch (error) {
        console.error("GET ADMIN CATEGORIES ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to load categories.",
        });
    }
});

// =========================================================
// CREATE CATEGORY
// Permission: categories.create
// =========================================================

app.post("/admin-categories/create", async (req, res) => {
    try {
        // -----------------------------------------
        // AUTH TOKEN
        // -----------------------------------------

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // -----------------------------------------
        // VERIFY ACTIVE ADMIN SESSION
        // -----------------------------------------

        const sessionStatus = await verifyActiveAdminSession(token);

        if (!sessionStatus.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        // -----------------------------------------
        // GET AUTHENTICATED ADMIN
        // -----------------------------------------

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // -----------------------------------------
        // CHECK CREATE PERMISSION
        // -----------------------------------------

        const canCreateCategory = await adminHasPermission(currentUserId, "categories.create");

        if (!canCreateCategory) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to create categories.",
            });
        }

        // -----------------------------------------
        // VALIDATE REQUEST
        // -----------------------------------------

        const { name, description = null } = req.body;

        const cleanName = String(name || "").trim();

        if (!cleanName) {
            return res.status(400).json({
                success: false,
                error: "Category name is required.",
            });
        }

        // -----------------------------------------
        // CREATE CATEGORY
        // -----------------------------------------

        const { data: createdCategory, error: createCategoryError } = await supabase
            .from("Categories")
            .insert({
                name: cleanName,
                description: description ? String(description).trim() : null,
            })
            .select("*")
            .single();

        if (createCategoryError) {
            console.error("CREATE CATEGORY DATABASE ERROR:", createCategoryError);

            return res.status(500).json({
                success: false,
                error: "Unable to create category.",
            });
        }

        return res.status(201).json({
            success: true,
            message: "Category created successfully.",
            category: createdCategory,
        });
    } catch (error) {
        console.error("CREATE ADMIN CATEGORY ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to create category.",
        });
    }
});

// =========================================================
// UPDATE CATEGORY
// Permission: categories.edit
// =========================================================

app.post("/admin-categories/update", async (req, res) => {
    try {
        // -----------------------------------------
        // AUTH TOKEN
        // -----------------------------------------

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // -----------------------------------------
        // VERIFY ACTIVE ADMIN SESSION
        // -----------------------------------------

        const sessionStatus = await verifyActiveAdminSession(token);

        if (!sessionStatus.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        // -----------------------------------------
        // GET AUTHENTICATED ADMIN
        // -----------------------------------------

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // -----------------------------------------
        // CHECK EDIT PERMISSION
        // -----------------------------------------

        const canEditCategory = await adminHasPermission(currentUserId, "categories.edit");

        if (!canEditCategory) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to edit categories.",
            });
        }

        // -----------------------------------------
        // VALIDATE REQUEST
        // -----------------------------------------

        const { categoryId, name, description = null } = req.body;

        const cleanCategoryId = String(categoryId || "").trim();

        const cleanName = String(name || "").trim();

        if (!cleanCategoryId) {
            return res.status(400).json({
                success: false,
                error: "Category ID is required.",
            });
        }

        if (!cleanName) {
            return res.status(400).json({
                success: false,
                error: "Category name is required.",
            });
        }

        // -----------------------------------------
        // UPDATE CATEGORY
        // -----------------------------------------

        const { data: updatedCategory, error: updateCategoryError } = await supabase
            .from("Categories")
            .update({
                name: cleanName,

                description: description ? String(description).trim() : null,
            })
            .eq("id", cleanCategoryId)
            .select("*")
            .single();

        if (updateCategoryError) {
            console.error("UPDATE CATEGORY DATABASE ERROR:", updateCategoryError);

            return res.status(500).json({
                success: false,
                error: "Unable to update category.",
            });
        }

        return res.json({
            success: true,
            message: "Category updated successfully.",
            category: updatedCategory,
        });
    } catch (error) {
        console.error("UPDATE ADMIN CATEGORY ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to update category.",
        });
    }
});

// =========================================================
// DELETE CATEGORY
// Permission: categories.delete
// =========================================================

app.post("/admin-categories/delete", async (req, res) => {
    try {
        // -----------------------------------------
        // AUTH TOKEN
        // -----------------------------------------

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // -----------------------------------------
        // VERIFY ACTIVE ADMIN SESSION
        // -----------------------------------------

        const sessionStatus = await verifyActiveAdminSession(token);

        if (!sessionStatus.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        // -----------------------------------------
        // GET AUTHENTICATED ADMIN
        // -----------------------------------------

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // -----------------------------------------
        // CHECK DELETE PERMISSION
        // -----------------------------------------

        const canDeleteCategory = await adminHasPermission(currentUserId, "categories.delete");

        if (!canDeleteCategory) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to delete categories.",
            });
        }

        // -----------------------------------------
        // VALIDATE REQUEST
        // -----------------------------------------

        const { categoryId } = req.body;

        const cleanCategoryId = String(categoryId || "").trim();

        if (!cleanCategoryId) {
            return res.status(400).json({
                success: false,
                error: "Category ID is required.",
            });
        }

        // -----------------------------------------
        // DELETE CATEGORY
        // -----------------------------------------

        const { error: deleteCategoryError } = await supabase.from("Categories").delete().eq("id", cleanCategoryId);

        if (deleteCategoryError) {
            console.error("DELETE CATEGORY DATABASE ERROR:", deleteCategoryError);

            return res.status(500).json({
                success: false,
                error: "Unable to delete category.",
            });
        }

        return res.json({
            success: true,
            message: "Category deleted successfully.",
        });
    } catch (error) {
        console.error("DELETE ADMIN CATEGORY ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to delete category.",
        });
    }
});
// =========================================================
// END ADMIN-CATEGORIES PAGE
// =========================================================

// =========================================================
// CREATE ADMIN REFUND REQUEST
// =========================================================
app.post("/admin-refund-request", async (req, res) => {
    try {
        // =============================================
        // GET AUTH TOKEN
        // =============================================

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =============================================
        // VERIFY ACTIVE ADMIN SESSION
        // =============================================

        const activeSessionCheck = await verifyActiveAdminSession(token);

        if (!activeSessionCheck.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        // =============================================
        // VERIFY SUPABASE USER
        // =============================================

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // =============================================
        // VERIFY ACTIVE ADMIN ACCOUNT
        // =============================================

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select(
                `
            user_id,
            first_name,
            last_name,
            status,
            authority_level
        `
            )
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (currentAdminError || !currentAdmin || currentAdmin.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        // =============================================
        // GET ADMIN POSITIONS
        // =============================================

        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
                        Admin_Positions (
                            name
                        )
                    `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            return res.status(500).json({
                success: false,
                error: "Unable to verify Admin position.",
            });
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        // =============================================
        // CHECK REFUND REQUEST PERMISSION
        // AL10-50 can request.
        // AL60+ requires refunds.request if they cannot process.
        // =============================================

        const currentAdminAuthorityLevel = Number(currentAdmin.authority_level) || 0;

        const hasRequestRefundPermission = await adminHasPermission(currentUserId, "refunds.request");

        const canRequestRefund = currentAdminAuthorityLevel < 60 || hasRequestRefundPermission;

        if (!canRequestRefund) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to request refunds.",
            });
        }

        // =============================================
        // GET REFUND REQUEST DATA
        // =============================================

        const {
            orderId,
            refundAmount,
            refundReason,
            refundRequestId = null,
        } = req.body || {};

        const cleanRefundAmount = Number(refundAmount);

        const cleanRefundReason = String(refundReason || "").trim();

        if (!orderId || !Number.isFinite(cleanRefundAmount) || cleanRefundAmount <= 0 || !cleanRefundReason) {
            return res.status(400).json({
                success: false,
                error: "Order, refund amount, and refund reason are required.",
            });
        }
        
// =============================================
// VERIFY APPROVED REFUND REQUEST IF PROVIDED
// =============================================

let approvedRefundRequest = null;

if (refundRequestId) {
    const {
        data: refundRequest,
        error: refundRequestError,
    } = await supabase
        .from("Refund_Requests")
        .select(`
            id,
            order_id,
            refund_amount,
            request_reason,
            review_reason,
            status,
            reviewed_by,
            reviewed_at
        `)
        .eq("id", refundRequestId)
        .maybeSingle();

    if (refundRequestError) {
        console.error(
            "APPROVED REFUND REQUEST LOOKUP ERROR:",
            refundRequestError
        );

        return res.status(500).json({
            success: false,
            error: "Unable to verify approved refund request.",
        });
    }

    if (!refundRequest) {
        return res.status(404).json({
            success: false,
            error: "Refund request not found.",
        });
    }

const refundRequestStatus =
    String(refundRequest.status || "")
        .trim()
        .toLowerCase();

if (
    refundRequestStatus !== "pending" &&
    refundRequestStatus !== "approved"
) {
    return res.status(409).json({
        success: false,
        error:
            "This refund request can no longer be processed.",
    });
}

    if (String(refundRequest.order_id) !== String(orderId)) {
        return res.status(400).json({
            success: false,
            error: "Refund request does not belong to this order.",
        });
    }

    approvedRefundRequest = refundRequest;
}

        // =============================================
        // LOAD ORDER
        // =============================================

        const { data: order, error: orderError } = await supabase
            .from("Orders")
            .select(
                `
                        id,
                        order_id,
                        customer_email,
                        customer_name,
                        subtotal,
                        shipping_amount,
                        tax_amount,
                        discount_amount,
                        payment_status
                    `
            )
            .eq("id", orderId)
            .maybeSingle();

        if (orderError) {
            console.error("REFUND ORDER LOOKUP ERROR:", orderError);

            return res.status(500).json({
                success: false,
                error: "Unable to load order.",
            });
        }

        if (!order) {
            return res.status(404).json({
                success: false,
                error: "Order was not found.",
            });
        }

        // =============================================
        // ORDER MUST BE PAID
        // =============================================

        if (String(order.payment_status || "").toLowerCase() !== "paid") {
            return res.status(400).json({
                success: false,
                error: "Only paid orders can be refunded.",
            });
        }

        // =============================================
        // CALCULATE ORDER TOTAL SERVER-SIDE
        // =============================================

        const orderTotal =
            Number(order.subtotal || 0) +
            Number(order.shipping_amount || 0) +
            Number(order.tax_amount || 0) -
            Number(order.discount_amount || 0);

        if (cleanRefundAmount > orderTotal) {
            return res.status(400).json({
                success: false,
                error: "Refund amount cannot exceed the order total.",
            });
        }

        // =============================================
        // ADMIN IDENTITY
        // =============================================

        const adminName = [currentAdmin.first_name, currentAdmin.last_name].filter(Boolean).join(" ") || null;

        const adminPosition = currentPositions.join(" • ");

        // =============================================
        // CREATE REFUND REQUEST
        // =============================================

        const { data: refundRequest, error: refundRequestError } = await supabase
            .from("Refund_Requests")
            .insert({
                order_id: order.id,

                order_number: order.order_id,

                customer_name: order.customer_name || null,

                requested_by: currentUserId,

                requested_by_email: authData.user.email || null,

                requested_by_name: adminName,

                requested_by_position: adminPosition,

                refund_amount: cleanRefundAmount,

                request_reason: cleanRefundReason,

                status: "Pending",
            })
            .select(
                `
                    id,
                    order_id,
                    refund_amount,
                    request_reason,
                    status,
                    requested_at
                `
            )
            .single();

        if (refundRequestError) {
            console.error("REFUND REQUEST CREATE ERROR:", refundRequestError);

            return res.status(500).json({
                success: false,
                error: "Unable to create refund request.",
            });
        }

        // =============================================
        // CREATE REFUND REQUEST NOTIFICATIONS
        // =============================================

        console.log("REFUND NOTIFICATION SECTION REACHED", refundRequest.id);

        const { data: refundNotificationAdmins, error: refundNotificationAdminsError } = await supabase.from(
            "Admin_Roles"
        ).select(`
                    user_id,
                    Admin_Positions (
                        name
                    )
                `);

        if (refundNotificationAdminsError) {
            console.error("REFUND NOTIFICATION ADMIN LOOKUP ERROR:", refundNotificationAdminsError);
        } else {
            const refundNotificationUserIds = [];

            for (const role of refundNotificationAdmins || []) {
                const adminUserId = role.user_id;

                if (!adminUserId || refundNotificationUserIds.includes(adminUserId)) {
                    continue;
                }

                // Get this admin's individual Authority Level
                const { data: refundAdminAccount, error: refundAdminAccountError } =
                    await supabase
                        .from("Admins")
                        .select("authority_level, status")
                        .eq("user_id", adminUserId)
                        .maybeSingle();

                if (refundAdminAccountError) {
                    console.error(
                        "REFUND NOTIFICATION ADMIN ACCOUNT ERROR:",
                        refundAdminAccountError
                    );
                    continue;
                }

                // Only active AL60+ admins can receive actionable refund requests
                if (
                    !refundAdminAccount ||
                    refundAdminAccount.status !== "Active" ||
                    Number(refundAdminAccount.authority_level || 0) < 60
                ) {
                    continue;
                }

                const canProcessRefund = await adminHasStrictPermission(
                    adminUserId,
                    "refunds.process"
                );

                if (canProcessRefund) {
                    refundNotificationUserIds.push(adminUserId);
                }
            }

            const refundNotifications = refundNotificationUserIds.map((adminUserId) => ({
                admin_user_id: adminUserId,

                notification_type: "Refund",

                title: "Refund Request",

                message: `${adminName || authData.user.email} requested a $${cleanRefundAmount.toFixed(2)} refund for order ${order.order_id}.`,

                related_order_id: order.id,

                destination_page: "orders",
                destination_action: "open_order_details_read_only",

                is_read: false,
            }));

            if (refundNotifications.length > 0) {
                const { error: refundNotificationError } = await supabase
                    .from("Admin_Notifications")
                    .insert(refundNotifications);

                if (refundNotificationError) {
                    console.error("REFUND NOTIFICATION CREATE ERROR:", refundNotificationError);
                }
            }
        }

        // =============================================
        // ACTIVITY LOG
        // =============================================

        await logAdminActivity({
            adminId: currentUserId,

            adminEmail: authData.user.email || null,

            adminName: adminName,

            position: adminPosition,

            category: "Refund",

            action: "Refund Requested",

            description: `Requested a $${cleanRefundAmount.toFixed(2)} refund for order ${order.order_id}.`,

            targetType: "Order",

            targetId: order.id,

            targetName: order.order_id,

            ipAddress: req.ip || null,

            userAgent: req.headers["user-agent"] || null,

            metadata: {
                refund_request_id: refundRequest.id,

                refund_amount: cleanRefundAmount,

                refund_reason: cleanRefundReason,
            },
        });

        // =============================================
        // SUCCESS
        // =============================================

        return res.json({
            success: true,

            message: "Refund request submitted successfully.",

            refundRequest: refundRequest,
        });
    } catch (error) {
        console.error("ADMIN REFUND REQUEST ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to submit refund request.",
        });
    }
});

// =========================================================
// PROCESS ADMIN STRIPE REFUND
// OWNER + WEB DEVELOPER + OPERATIONS MANAGER + STORE MANAGER
// =========================================================

app.post("/admin-refund", async (req, res) => {
    try {
        // =============================================
        // GET AUTH TOKEN
        // =============================================

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =============================================
        // VERIFY ACTIVE ADMIN SESSION
        // =============================================

        const activeSessionCheck = await verifyActiveAdminSession(token);

        if (!activeSessionCheck.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        // =============================================
        // VERIFY SUPABASE USER
        // =============================================

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // =============================================
        // VERIFY ACTIVE ADMIN ACCOUNT
        // =============================================

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select(
                `
            user_id,
            first_name,
            last_name,
            status,
            authority_level
        `
            )
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (currentAdminError || !currentAdmin || currentAdmin.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        // =============================================
        // GET ADMIN POSITIONS
        // =============================================

        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
                        Admin_Positions (
                            name
                        )
                    `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            return res.status(500).json({
                success: false,
                error: "Unable to verify permissions.",
            });
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        // =============================================
        // CHECK DIRECT REFUND PERMISSION
        // Requires individual AL60+ AND refunds.process
        // =============================================

        const currentAdminAuthorityLevel = Number(currentAdmin.authority_level) || 0;

        const hasProcessRefundPermission = await adminHasStrictPermission(currentUserId, "refunds.process");

        const canProcessRefund = currentAdminAuthorityLevel >= 60 && hasProcessRefundPermission;

        if (!canProcessRefund) {
            return res.status(403).json({
                success: false,
                error:
                    currentAdminAuthorityLevel < 60
                        ? "Authority Level 60 or higher is required to process refunds."
                        : "You do not have permission to process refunds.",
            });
        }

        // =============================================
        // GET REFUND DATA
        // =============================================

        const {
            orderId,
            refundAmount,
            refundReason,
            refundRequestId = null,
        } = req.body || {};

        const cleanRefundAmount = Number(refundAmount);

        const cleanRefundReason = String(refundReason || "").trim();

        if (!orderId || !Number.isFinite(cleanRefundAmount) || cleanRefundAmount <= 0 || !cleanRefundReason) {
            return res.status(400).json({
                success: false,
                error: "Order, refund amount, and refund reason are required.",
            });
        }

        // =============================================
        // VERIFY APPROVED REFUND REQUEST IF PROVIDED
        // =============================================
console.log("🔎 REFUND PROCESS DEBUG:", {
    orderId,
    refundRequestId,
    refundAmount: cleanRefundAmount,
    refundReason: cleanRefundReason,
});

        let approvedRefundRequest = null;

        if (refundRequestId) {
            const {
                data: refundRequest,
                error: refundRequestError,
            } = await supabase
                .from("Refund_Requests")
                .select(`
                    id,
                    order_id,
                    refund_amount,
                    request_reason,
                    review_reason,
                    status,
                    reviewed_by,
                    reviewed_at
                `)
                .eq("id", refundRequestId)
                .maybeSingle();

            if (refundRequestError) {
                console.error(
                    "APPROVED REFUND REQUEST LOOKUP ERROR:",
                    refundRequestError
                );

                return res.status(500).json({
                    success: false,
                    error: "Unable to verify approved refund request.",
                });
            }

            if (!refundRequest) {
                return res.status(404).json({
                    success: false,
                    error: "Refund request not found.",
                });
            }

            const refundRequestStatus =
    String(refundRequest.status || "")
        .trim()
        .toLowerCase();

if (
    refundRequestStatus !== "pending" &&
    refundRequestStatus !== "approved"
) {
    return res.status(409).json({
        success: false,
        error:
            "This refund request can no longer be processed.",
    });
}

            if (
                String(refundRequest.order_id) !==
                String(orderId)
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Refund request does not belong to this order.",
                });
            }

            approvedRefundRequest = refundRequest;
        }



        // =============================================
        // LOAD ORDER
        // =============================================

        const { data: order, error: orderError } = await supabase
            .from("Orders")
            .select(
                `
            id,
            order_id,
            payment_status,
            customer_email,
            customer_name
        `
            )
            .eq("id", orderId)
            .maybeSingle();

        if (orderError) {
            console.error("ADMIN REFUND ORDER LOOKUP ERROR:", orderError);

            return res.status(500).json({
                success: false,
                error: "Unable to load order.",
            });
        }

        if (!order) {
            return res.status(404).json({
                success: false,
                error: "Order was not found.",
            });
        }

        // =============================================
        // LOAD PAYMENT
        // =============================================

        const { data: payment, error: paymentError } = await supabase
            .from("Payments")
            .select(
                `
                        order_id,
                        amount,
                        refund_amount,
                        payment_status,
                        stripe_payment_intent
                    `
            )
            .eq("order_id", orderId)
            .maybeSingle();

        if (paymentError || !payment) {
            return res.status(404).json({
                success: false,
                error: "Payment record was not found.",
            });
        }

        if (!payment.stripe_payment_intent) {
            return res.status(400).json({
                success: false,
                error: "Stripe Payment Intent was not found.",
            });
        }

        // =============================================
        // CALCULATE REFUNDABLE AMOUNT
        // =============================================

        const paymentAmount = Number(payment.amount || 0);

        const alreadyRefunded = Number(payment.refund_amount || 0);

        const remainingRefundable = Number(Math.max(0, paymentAmount - alreadyRefunded).toFixed(2));

        if (remainingRefundable <= 0) {
            return res.status(400).json({
                success: false,
                error: "This payment has already been fully refunded.",
            });
        }

        if (cleanRefundAmount > remainingRefundable) {
            return res.status(400).json({
                success: false,

                error: `Maximum refundable amount is $${remainingRefundable.toFixed(2)}.`,
            });
        }

        // =============================================
        // PROCESS STRIPE REFUND
        // =============================================

        const refundAmountCents = Math.round(cleanRefundAmount * 100);

        const stripeRefund = await stripe.refunds.create({
            payment_intent: payment.stripe_payment_intent,

            amount: refundAmountCents,

            metadata: {
                order_id: String(orderId),

                refunded_by: String(currentUserId),

                reason: cleanRefundReason.slice(0, 500),
            },
        });

        // =============================================
        // UPDATE PAYMENT
        // =============================================

        const newRefundTotal = Number((alreadyRefunded + cleanRefundAmount).toFixed(2));

        const fullyRefunded = newRefundTotal >= paymentAmount;

        const newOrderStatus = fullyRefunded ? "refunded" : "partially_refunded";

        const { error: paymentUpdateError } = await supabase
            .from("Payments")
            .update({
                refund_amount: newRefundTotal,

                payment_status: fullyRefunded ? "refunded" : "partially_refunded",

                last_refunded_at: new Date().toISOString(),
            })
            .eq("order_id", orderId);

        if (paymentUpdateError) {
            throw paymentUpdateError;
        }

        // =============================================
        // UPDATE ORDER
        // =============================================

        const { error: orderUpdateError } = await supabase
            .from("Orders")
            .update({
                order_status: newOrderStatus,

                updated_at: new Date().toISOString(),
            })
            .eq("id", orderId);

        if (orderUpdateError) {
            throw orderUpdateError;
        }
        try {
            await sendRefundEmail({
                email: order.customer_email,
                customerName: order.customer_name,
                orderNumber: order.order_id,
                orderId: order.id,
                refundAmount: cleanRefundAmount,
                totalRefunded: newRefundTotal,
                remainingAmount: Math.max(0, paymentAmount - newRefundTotal),
                fullyRefunded: fullyRefunded,
            });
        } catch (refundEmailError) {
            console.error("Refund email failed:", refundEmailError);
        }

                // =============================================
        // REFUND PROCESSOR DETAILS
        // =============================================

        const adminName =
            [currentAdmin.first_name, currentAdmin.last_name]
                .filter(Boolean)
                .join(" ") || null;

        const adminPosition =
            currentPositions.join(" • ");

        // =============================================
// MARK REFUND REQUEST AS PROCESSED
// =============================================

if (approvedRefundRequest) {

    const processedAt =
        new Date().toISOString();

    const {
        data: processedRefundRequest,
        error: refundRequestProcessedError,
    } = await supabase
        .from("Refund_Requests")
        .update({
            status: "Processed",

            reviewed_by:
                currentUserId,

            reviewed_by_email:
                authData.user.email || null,

            reviewed_by_name:
                adminName,

            reviewed_by_position:
                adminPosition,

            review_reason:
                cleanRefundReason,

            reviewed_at:
                processedAt,

            stripe_refund_id:
                stripeRefund.id,

            refunded_at:
                processedAt,

            updated_at:
                processedAt,
        })
        .eq(
            "id",
            approvedRefundRequest.id
        )
        .select(`
            id,
            status,
            reviewed_by_name,
            reviewed_by_position,
            review_reason,
            reviewed_at,
            refunded_at
        `)
        .maybeSingle();


    if (refundRequestProcessedError) {

        console.error(
            "REFUND REQUEST PROCESSED UPDATE ERROR:",
            refundRequestProcessedError
        );

        return res.status(500).json({
            success: false,
            error:
                "Refund succeeded, but the refund request could not be marked as processed.",
        });
    }


    if (!processedRefundRequest) {

        console.error(
            "REFUND REQUEST WAS NOT UPDATED:",
            approvedRefundRequest.id
        );

        return res.status(500).json({
            success: false,
            error:
                "Refund succeeded, but the refund request record was not updated.",
        });
    }


    console.log(
        "✅ REFUND REQUEST MARKED PROCESSED:",
        processedRefundRequest
    );
}
        // =============================================
        // CREATE REFUND PROCESSED NOTIFICATIONS
        // FOR ALL ACTIVE ADMINS
        // =============================================

        if (approvedRefundRequest) {
            try {
                const {
                    data: refundNotificationAdmins,
                    error: refundNotificationAdminsError,
                } = await supabase
                    .from("Admins")
                    .select(`
                        user_id,
                        status
                    `)
                    .eq("status", "Active");

                if (refundNotificationAdminsError) {
                    console.error(
                        "REFUND PROCESSED NOTIFICATION ADMIN LOOKUP ERROR:",
                        refundNotificationAdminsError
                    );
                } else {
                    const activeAdminUserIds = [
                        ...new Set(
                            (refundNotificationAdmins || [])
                                .map((admin) => admin.user_id)
                                .filter(Boolean)
                        ),
                    ];

                    const refundProcessedNotifications =
                        activeAdminUserIds.map(
                            (adminUserId) => ({
                                admin_user_id:
                                    adminUserId,

                                notification_type:
                                    "Refund Processed",

                                title:
                                    "Refund Processed",

                                message:
                                    `Refund for order ${order.order_id} was processed by ${adminName || authData.user.email || "an administrator"}.`,

                                related_order_id:
                                    order.id,

                                destination_page:
                                    "orders",

                                destination_action:
                                    "open_order_details_read_only",

                                is_read:
                                    false,
                            })
                        );

                    if (
                        refundProcessedNotifications.length >
                        0
                    ) {
                        const {
                            error:
                                refundProcessedNotificationError,
                        } = await supabase
                            .from(
                                "Admin_Notifications"
                            )
                            .insert(
                                refundProcessedNotifications
                            );

                        if (
                            refundProcessedNotificationError
                        ) {
                            console.error(
                                "REFUND PROCESSED NOTIFICATION CREATE ERROR:",
                                refundProcessedNotificationError
                            );
                        } else {
                            console.log(
                                "🔔 REFUND PROCESSED NOTIFICATIONS CREATED:",
                                order.order_id
                            );
                        }
                    }
                }
            } catch (refundNotificationError) {
                console.error(
                    "REFUND PROCESSED NOTIFICATION ERROR:",
                    refundNotificationError
                );
            }
        }

        // =============================================
        // ACTIVITY LOG
        // =============================================

        await logAdminActivity({
            adminId: currentUserId,
            adminEmail: authData.user.email || null,
            adminName: adminName,
            position: adminPosition,

            category: "Refund",
            action: "Refund Processed",

            description: `Processed a $${cleanRefundAmount.toFixed(2)} refund for order ${order.order_id}.`,

            targetType: "Order",

            targetId: order.id,

            targetName: order.order_id,

            ipAddress: req.ip || null,

            userAgent: req.headers["user-agent"] || null,

            metadata: {
                stripe_refund_id: stripeRefund.id,

                refund_amount: cleanRefundAmount,

                total_refunded: newRefundTotal,

                refund_reason: cleanRefundReason,
            },
        });

        // =============================================
        // SUCCESS
        // =============================================

        return res.json({
            success: true,

            stripeRefundId: stripeRefund.id,

            refundedAmount: cleanRefundAmount,

            totalRefunded: newRefundTotal,

            remainingRefundable: Math.max(0, paymentAmount - newRefundTotal),

            orderStatus: newOrderStatus,
        });
    } catch (error) {
        console.error("ADMIN REFUND ERROR:", error);

        return res.status(500).json({
            success: false,

            error: error?.message || "Unable to process refund.",
        });
    }
});

// =========================================================
// GET PENDING REFUND REQUESTS
// OWNER + WEB DEVELOPER + OPERATIONS MANAGER + STORE MANAGER
// =========================================================
app.get("/admin-refund-requests/pending", async (req, res) => {
    try {
        // =============================================
        // GET AUTH TOKEN
        // =============================================

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ")
            ? authHeader.substring(7)
            : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =============================================
        // VERIFY ACTIVE ADMIN SESSION
        // =============================================

        const activeSessionCheck =
            await verifyActiveAdminSession(token);

        if (!activeSessionCheck.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        // =============================================
        // VERIFY SUPABASE USER
        // =============================================

        const { data: authData, error: authError } =
            await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // =============================================
        // VERIFY ACTIVE ADMIN + LOAD AUTHORITY LEVEL
        // =============================================

        const {
            data: currentAdmin,
            error: currentAdminError,
        } = await supabase
            .from("Admins")
            .select(`
                user_id,
                status,
                authority_level
            `)
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (
            currentAdminError ||
            !currentAdmin ||
            currentAdmin.status !== "Active"
        ) {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        // =============================================
        // CHECK REFUND REVIEW PERMISSION
        // AL60+ AND refunds.process REQUIRED
        // =============================================

        const currentAdminAuthorityLevel =
            Number(currentAdmin.authority_level) || 0;

        const hasProcessRefundPermission =
            await adminHasStrictPermission(
                currentUserId,
                "refunds.process"
            );

        const canReviewRefunds =
            currentAdminAuthorityLevel >= 60 &&
            hasProcessRefundPermission;

        if (!canReviewRefunds) {
            return res.status(403).json({
                success: false,
                error:
                    "You do not have permission to review refund requests.",
            });
        }

        // =============================================
        // LOAD PENDING REFUND REQUESTS
        // =============================================

        const {
            data: refundRequests,
            error: refundRequestsError,
        } = await supabase
            .from("Refund_Requests")
            .select(`
                id,
                order_id,
                order_number,
                customer_name,
                requested_by,
                requested_by_email,
                requested_by_name,
                requested_by_position,
                refund_amount,
                request_reason,
                status,
                requested_at
            `)
            .eq("status", "Pending")
            .order("requested_at", {
                ascending: false,
            });

        if (refundRequestsError) {
            console.error(
                "PENDING REFUND REQUESTS LOAD ERROR:",
                refundRequestsError
            );

            return res.status(500).json({
                success: false,
                error:
                    "Unable to load pending refund requests.",
            });
        }

        // =============================================
        // SUCCESS
        // =============================================

        return res.json({
            success: true,
            refundRequests: refundRequests || [],
        });
    } catch (error) {
        console.error(
            "PENDING REFUND REQUESTS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Unable to load pending refund requests.",
        });
    }
});

// =========================================================
// REVIEW ADMIN REFUND REQUEST
// APPROVE OR DECLINE
// =========================================================

app.post("/admin-refund-request/review", async (req, res) => {
    try {
        // =============================================
        // GET AUTH TOKEN
        // =============================================

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ")
            ? authHeader.substring(7)
            : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =============================================
        // VERIFY AUTH USER
        // =============================================

        const { data: authData, error: authError } =
            await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // =============================================
        // VERIFY ACTIVE ADMIN SESSION
        // =============================================

        const sessionCheck =
            await verifyActiveAdminSession(token);

        if (!sessionCheck?.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session is not active.",
            });
        }

        // =============================================
        // LOAD CURRENT ADMIN
        // =============================================

        const {
            data: currentAdmin,
            error: currentAdminError,
        } = await supabase
            .from("Admins")
            .select(`
                user_id,
                first_name,
                last_name,
                authority_level,
                status
            `)
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (
            currentAdminError ||
            !currentAdmin ||
            currentAdmin.status !== "Active"
        ) {
            return res.status(403).json({
                success: false,
                error: "Active administrator account required.",
            });
        }

        // =============================================
        // REQUIRE AL60+
        // =============================================

        const currentAuthorityLevel =
            Number(currentAdmin.authority_level) || 0;

        if (currentAuthorityLevel < 60) {
            return res.status(403).json({
                success: false,
                error:
                    "Authority Level 60 or higher is required.",
            });
        }

        // =============================================
        // REQUIRE refunds.process
        // =============================================

        const canProcessRefund =
            await adminHasStrictPermission(
                currentUserId,
                "refunds.process"
            );

        if (!canProcessRefund) {
            return res.status(403).json({
                success: false,
                error:
                    "You do not have permission to review refunds.",
            });
        }

        // =============================================
        // REQUEST BODY
        // =============================================

        const refundRequestId =
            String(
                req.body?.refundRequestId || ""
            ).trim();

        const decision =
            String(req.body?.decision || "")
                .trim()
                .toLowerCase();

        const reviewReason =
            String(
                req.body?.reviewReason || ""
            ).trim();

        if (!refundRequestId) {
            return res.status(400).json({
                success: false,
                error: "Refund request ID is required.",
            });
        }

        if (
            decision !== "approve" &&
            decision !== "decline"
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Decision must be approve or decline.",
            });
        }

// =============================================
// REVIEW REASON VALIDATION
// Approval and decline both require a reason.
// =============================================

if (!reviewReason) {
    return res.status(400).json({
        success: false,
        error:
            "A reason is required to approve or decline this refund request.",
    });
}

        // =============================================
        // LOAD REFUND REQUEST
        // =============================================

        const {
            data: refundRequest,
            error: refundRequestError,
        } = await supabase
            .from("Refund_Requests")
            .select(`
                id,
                order_id,
                order_number,
                customer_name,
                requested_by,
                requested_by_email,
                requested_by_name,
                requested_by_position,
                refund_amount,
                request_reason,
                status,
                requested_at
            `)
            .eq("id", refundRequestId)
            .maybeSingle();

        if (refundRequestError) {
            console.error(
                "REFUND REQUEST REVIEW LOOKUP ERROR:",
                refundRequestError
            );

            return res.status(500).json({
                success: false,
                error:
                    "Unable to load refund request.",
            });
        }

        if (!refundRequest) {
            return res.status(404).json({
                success: false,
                error: "Refund request not found.",
            });
        }

        // =============================================
        // ONLY PENDING REQUESTS CAN BE REVIEWED
        // =============================================

        if (
            String(refundRequest.status || "")
                .trim()
                .toLowerCase() !== "pending"
        ) {
            return res.status(409).json({
                success: false,
                error:
                    "This refund request has already been reviewed.",
            });
        }

        // =============================================
        // LOAD REVIEWER POSITION
        // =============================================

        const { data: reviewerRoles } =
            await supabase
                .from("Admin_Roles")
                .select(`
                    Admin_Positions (
                        name
                    )
                `)
                .eq("user_id", currentUserId);

        const reviewerPosition =
            (reviewerRoles || [])
                .map(
                    (role) =>
                        role.Admin_Positions?.name
                )
                .filter(Boolean)
                .join(" • ") || null;

        const reviewerName =
            [
                currentAdmin.first_name,
                currentAdmin.last_name,
            ]
                .filter(Boolean)
                .join(" ") ||
            authData.user.email ||
            "Administrator";

        // =============================================
        // SAVE APPROVAL / DECLINE
        // =============================================

        const newStatus =
            decision === "approve"
                ? "Approved"
                : "Declined";

        const reviewedAt =
            new Date().toISOString();

        const {
            data: reviewedRequest,
            error: reviewUpdateError,
        } = await supabase
            .from("Refund_Requests")
            .update({
                status: newStatus,

                reviewed_by: currentUserId,

                reviewed_by_email:
                    authData.user.email || null,

                reviewed_by_name:
                    reviewerName,

                reviewed_by_position:
                    reviewerPosition,

                review_reason:
                    reviewReason,

                reviewed_at:
                    reviewedAt,

                updated_at:
                    reviewedAt,
            })
            .eq("id", refundRequest.id)
            .eq("status", "Pending")
            .select()
            .maybeSingle();

        if (reviewUpdateError) {
            console.error(
                "REFUND REQUEST REVIEW UPDATE ERROR:",
                reviewUpdateError
            );

            return res.status(500).json({
                success: false,
                error:
                    "Unable to review refund request.",
            });
        }

        if (!reviewedRequest) {
            return res.status(409).json({
                success: false,
                error:
                    "This refund request has already been reviewed.",
            });
        }

        // =============================================
        // NOTIFY ALL ACTIVE ADMINS
        // APPROVED / DECLINED RESULT
        // =============================================

        const {
            data: activeAdmins,
            error: activeAdminsError,
        } = await supabase
            .from("Admins")
            .select(`
                user_id,
                status
            `)
            .eq("status", "Active");

        if (activeAdminsError) {
            console.error(
                "REFUND DECISION ACTIVE ADMINS ERROR:",
                activeAdminsError
            );
        } else {
            const activeAdminUserIds = [
                ...new Set(
                    (activeAdmins || [])
                        .map(
                            (admin) =>
                                admin.user_id
                        )
                        .filter(Boolean)
                ),
            ];

            const notificationTitle =
                newStatus === "Approved"
                    ? "Refund Request Approved"
                    : "Refund Request Declined";

            const notificationMessage =
                `Refund request for order ${
                    refundRequest.order_number ||
                    "Unknown"
                } was ${newStatus.toLowerCase()} by ${reviewerName}.`;

            const refundDecisionNotifications =
                activeAdminUserIds.map(
                    (adminUserId) => ({
                        admin_user_id:
                            adminUserId,

                        notification_type:
                            "Refund",

                        title:
                            notificationTitle,

                        message:
                            notificationMessage,

                        related_order_id:
                            refundRequest.order_id,

                        destination_page:
                            "orders",

                        destination_action:
                            "open_order_details_read_only",

                        is_read: false,
                    })
                );

            if (
                refundDecisionNotifications.length > 0
            ) {
                const {
                    error:
                        notificationInsertError,
                } = await supabase
                    .from(
                        "Admin_Notifications"
                    )
                    .insert(
                        refundDecisionNotifications
                    );

                if (notificationInsertError) {
                    console.error(
                        "REFUND DECISION NOTIFICATION ERROR:",
                        notificationInsertError
                    );
                }
            }
        }

        // =============================================
        // LOG REVIEW ACTIVITY
        // =============================================

        await logAdminActivity({
            adminId:
                currentUserId,

            adminEmail:
                authData.user.email || null,

            adminName:
                reviewerName,

            position:
                reviewerPosition,

            category:
                "Refund",

            action:
                newStatus === "Approved"
                    ? "Refund Request Approved"
                    : "Refund Request Declined",

            description:
                `${newStatus} refund request for order ${
                    refundRequest.order_number ||
                    refundRequest.order_id
                }.`,

            targetType:
                "Order",

            targetId:
                refundRequest.order_id,

            targetName:
                refundRequest.order_number ||
                null,

            ipAddress:
                req.ip || null,

            userAgent:
                req.headers["user-agent"] ||
                null,

            metadata: {
                refund_request_id:
                    refundRequest.id,

                refund_amount:
                    Number(
                        refundRequest.refund_amount
                    ),

                request_reason:
                    refundRequest.request_reason,

                review_reason:
                    reviewReason,

                decision:
                    newStatus,
            },
        });

        // =============================================
        // IMPORTANT:
        // APPROVAL DOES NOT RUN STRIPE HERE.
        //
        // APPROVED -> EXISTING /admin-refund
        // DECLINED -> STOPS HERE
        // =============================================

        return res.json({
            success: true,

            decision:
                newStatus,

            refundRequest:
                reviewedRequest,

            requiresRefundProcessing:
                decision === "approve",
        });
    } catch (error) {
        console.error(
            "REFUND REQUEST REVIEW ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "Unable to review refund request.",
        });
    }
});

// =========================================================
// RECORD ADMIN ACTIVITY
// =========================================================

app.post("/admin-activity-log", async (req, res) => {
    try {
        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select(
                `
                        user_id,
                        first_name,
                        last_name,
                        status
                    `
            )
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (currentAdminError || !currentAdmin || currentAdmin.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
                        Admin_Positions (
                            name
                        )
                    `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            return res.status(500).json({
                success: false,
                error: "Unable to verify Admin position.",
            });
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        const { category, action, description, targetType, targetId, targetName, metadata } = req.body;

        if (!category || !action) {
            return res.status(400).json({
                success: false,
                error: "Category and action are required.",
            });
        }

        const adminName = [currentAdmin.first_name, currentAdmin.last_name].filter(Boolean).join(" ") || null;

        await logAdminActivity({
            adminId: currentUserId,

            adminEmail: authData.user.email || null,

            adminName: adminName,

            position: currentPositions.join(" • "),

            category: category,

            action: action,

            description: description || null,

            targetType: targetType || null,

            targetId: targetId || null,

            targetName: targetName || null,

            ipAddress: req.ip || null,

            userAgent: req.headers["user-agent"] || null,

            metadata: metadata || {},
        });

        return res.json({
            success: true,
        });
    } catch (error) {
        console.error("ADMIN ACTIVITY RECORD ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to record Admin activity.",
        });
    }
});

// =========================================================
// ADMIN LOGIN
// =========================================================

app.post("/admin-login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const cleanEmail = String(email || "")
            .trim()
            .toLowerCase();

        if (!cleanEmail || !password) {
            return res.status(400).json({
                success: false,
                error: "Email and password are required.",
            });
        }

        const ipAddress = req.ip || "unknown";

        const userAgent = req.headers["user-agent"] || null;

        console.log("ADMIN LOGIN ATTEMPT:", cleanEmail, ipAddress, userAgent);

        // =============================================
        // LOAD ADMIN SECURITY SETTINGS
        // =============================================

        const { data: securitySettings, error: securitySettingsError } = await supabase
            .from("Admin_Security_Settings")
            .select(
                `
                        failed_attempt_limit,
                        lockout_duration_minutes,
                        session_timeout_minutes
                    `
            )
            .limit(1)
            .maybeSingle();

        if (securitySettingsError || !securitySettings) {
            console.error("ADMIN SECURITY SETTINGS LOAD ERROR:", securitySettingsError);

            return res.status(500).json({
                success: false,
                error: "Unable to load Admin Security Settings.",
            });
        }

        const adminMaxFailedAttempts = Number(securitySettings.failed_attempt_limit);

        const adminLockoutMinutes = Number(securitySettings.lockout_duration_minutes);

        // =============================================
        // CHECK ADMIN LOGIN LOCKOUT
        // =============================================

        const { data: loginLockout, error: loginLockoutError } = await supabase
            .from("Admin_Login_Lockouts")
            .select(
                `
                        id,
                        failed_attempts,
                        locked_until
                    `
            )
            .eq("email", cleanEmail)
            .eq("ip_address", ipAddress)
            .maybeSingle();

        if (loginLockoutError) {
            console.error("LOGIN LOCKOUT CHECK ERROR:", loginLockoutError);

            return res.status(500).json({
                success: false,
                error: "Unable to verify login security.",
            });
        }

        if (loginLockout?.locked_until) {
            const lockedUntil = new Date(loginLockout.locked_until);

            if (Date.now() < lockedUntil.getTime()) {
                return res.status(429).json({
                    success: false,
                    error: "Too many failed login attempts. Try again later.",
                });
            }
        }

        const { data: authData, error: authError } = await authSupabase.auth.signInWithPassword({
            email: cleanEmail,

            password: password,
        });

        if (authError || !authData?.user) {
            const { error: failedAttemptError } = await supabase.from("Admin_Login_Attempts").insert({
                email: cleanEmail,

                success: false,

                failure_reason: "Invalid email or password",

                ip_address: ipAddress,

                user_agent: userAgent,
            });

            if (failedAttemptError) {
                console.error("FAILED LOGIN RECORD ERROR:", failedAttemptError);
            }

            const currentFailedAttempts = Number(loginLockout?.failed_attempts || 0);

            const newFailedAttempts = currentFailedAttempts + 1;

            const shouldLock = newFailedAttempts >= adminMaxFailedAttempts;

            const lockedUntil = shouldLock
                ? new Date(Date.now() + adminLockoutMinutes * 60 * 1000).toISOString()
                : null;

            const { error: lockoutUpdateError } = await supabase.from("Admin_Login_Lockouts").upsert(
                {
                    email: cleanEmail,

                    ip_address: ipAddress,

                    failed_attempts: newFailedAttempts,

                    locked_until: lockedUntil,

                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: "email,ip_address",
                }
            );

            if (lockoutUpdateError) {
                console.error("LOGIN LOCKOUT UPDATE ERROR:", lockoutUpdateError);

                return res.status(500).json({
                    success: false,
                    error: "Unable to update login security.",
                });
            }

            // =============================================
            // CREATE LOGIN LOCKOUT SECURITY ALERTS
            // =============================================

            if (shouldLock) {
                const { data: securityAlertAdmins, error: securityAlertAdminsError } = await supabase.from(
                    "Admin_Roles"
                ).select(`
                                user_id,
                                Admin_Positions (
                                    name
                                )
                            `);

                if (securityAlertAdminsError) {
                    console.error("SECURITY ALERT ADMIN LOOKUP ERROR:", securityAlertAdminsError);
                } else {
                    const securityAlertUserIds = [
                        ...new Set(
                            (securityAlertAdmins || [])
                                .filter((role) => {
                                    const positionName = role.Admin_Positions?.name;

                                    return (
                                        positionName === "Owner" ||
                                        positionName === "Web Developer" ||
                                        positionName === "Operations Manager" ||
                                        positionName === "Store Manager"
                                    );
                                })
                                .map((role) => role.user_id)
                                .filter(Boolean)
                        ),
                    ];

                    if (securityAlertUserIds.length > 0) {
                        const securityNotifications = securityAlertUserIds.map((adminUserId) => ({
                            admin_user_id: adminUserId,

                            notification_type: "Security",
                            title: "Admin Login Lockout",
                            message: `${cleanEmail} was locked after ${newFailedAttempts} failed login attempts.`,
                            related_email: cleanEmail,
                            related_ip_address: ipAddress,

                            destination_page: "security",
                            destination_action: "open_security",

                            is_read: false,
                        }));

                        const { error: securityNotificationError } = await supabase
                            .from("Admin_Notifications")
                            .insert(securityNotifications);

                        if (securityNotificationError) {
                            console.error("LOGIN LOCKOUT SECURITY ALERT ERROR:", securityNotificationError);
                        }
                    }
                }

                return res.status(429).json({
                    success: false,
                    error: `Too many failed login attempts. Try again in ${adminLockoutMinutes} minutes.`,
                });
            }

            return res.status(401).json({
                success: false,
                error: "Invalid email or password.",
            });

            if (loginLockout?.locked_until && Date.now() >= new Date(loginLockout.locked_until).getTime()) {
                const { error: expiredLockoutResetError } = await supabase
                    .from("Admin_Login_Lockouts")
                    .update({
                        failed_attempts: 0,

                        locked_until: null,

                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", loginLockout.id);

                if (expiredLockoutResetError) {
                    console.error("EXPIRED LOCKOUT RESET ERROR:", expiredLockoutResetError);

                    return res.status(500).json({
                        success: false,

                        error: "Unable to reset login security.",
                    });
                }

                if (loginLockout) {
                    loginLockout.failed_attempts = 0;

                    loginLockout.locked_until = null;
                }
            }
        }

        const { data: adminAccount, error: adminAccountError } = await supabase
            .from("Admins")
            .select(
                `
                        user_id,
                        status
                    `
            )
            .eq("user_id", authData.user.id)
            .maybeSingle();

        if (adminAccountError) {
            console.error("ADMIN ACCOUNT LOOKUP ERROR:", adminAccountError);

            return res.status(500).json({
                success: false,
                error: "Unable to verify Admin account.",
            });
        }

        if (!adminAccount || adminAccount.status !== "Active") {
            const { error: unauthorizedAttemptError } = await supabase.from("Admin_Login_Attempts").insert({
                email: cleanEmail,

                success: false,

                failure_reason: "Not authorized for Admin portal",

                ip_address: ipAddress,

                user_agent: userAgent,
            });

            if (unauthorizedAttemptError) {
                console.error("UNAUTHORIZED LOGIN RECORD ERROR:", unauthorizedAttemptError);
            }

            return res.status(403).json({
                success: false,
                error: "You are not authorized.",
            });
        }

        const { error: successfulLoginResetError } = await supabase.from("Admin_Login_Lockouts").upsert(
            {
                email: cleanEmail,

                ip_address: ipAddress,

                failed_attempts: 0,

                locked_until: null,

                updated_at: new Date().toISOString(),
            },
            {
                onConflict: "email,ip_address",
            }
        );

        if (successfulLoginResetError) {
            console.error("SUCCESSFUL LOGIN RESET ERROR:", successfulLoginResetError);

            return res.status(500).json({
                success: false,
                error: "Unable to reset login security.",
            });
        }

        const { error: successfulAttemptError } = await supabase.from("Admin_Login_Attempts").insert({
            email: cleanEmail,

            success: true,

            failure_reason: null,

            ip_address: ipAddress,

            user_agent: userAgent,
        });

        if (successfulAttemptError) {
            console.error("SUCCESSFUL LOGIN RECORD ERROR:", successfulAttemptError);
        }

        const accessTokenPayload = JSON.parse(
            Buffer.from(authData.session.access_token.split(".")[1], "base64url").toString("utf8")
        );

        const authSessionId = accessTokenPayload.session_id || null;

        // =============================================
        // RECORD ACTIVE ADMIN SESSION
        // =============================================

        const { error: activeSessionError } = await supabase.from("Admin_Active_Sessions").insert({
            admin_user_id: authData.user.id,

            email: cleanEmail,

            auth_session_id: authSessionId,

            ip_address: ipAddress,

            user_agent: userAgent,

            signed_in_at: new Date().toISOString(),

            last_activity_at: new Date().toISOString(),

            is_active: true,
        });

        if (activeSessionError) {
            console.error("ACTIVE ADMIN SESSION RECORD ERROR:", activeSessionError);
        }

        return res.json({
            success: true,

            session: {
                access_token: authData.session.access_token,

                refresh_token: authData.session.refresh_token,
            },
        });
    } catch (error) {
        console.error("ADMIN LOGIN ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to log in.",
        });
    }
});

// =========================================================
// MANUAL ADMIN LOGIN UNLOCK
// Owner + Web Developer only
// =========================================================

app.post("/admin-login/unlock", async (req, res) => {
    try {
        // =============================================
        // GET AUTH TOKEN
        // =============================================

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =============================================
        // VERIFY LOGGED-IN USER
        // =============================================

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // =============================================
        // VERIFY ACTIVE ADMIN ACCOUNT
        // =============================================

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select(
                `
                        user_id,
                        status
                    `
            )
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (currentAdminError || !currentAdmin || currentAdmin.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        // =============================================
        // GET CURRENT ADMIN POSITIONS
        // =============================================

        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
                        Admin_Positions (
                            name
                        )
                    `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            console.error("ADMIN UNLOCK ROLE CHECK ERROR:", currentRolesError);

            return res.status(500).json({
                success: false,
                error: "Unable to verify permissions.",
            });
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        // =============================================
        // OWNER + WEB DEVELOPER ONLY
        // =============================================

        const canUnlockLogin = await adminHasPermission(currentUserId, "security.unlock_logins");

        if (!canUnlockLogin) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to unlock Admin logins.",
            });
        }

        // =============================================
        // GET EMAIL + IP ADDRESS
        // =============================================

        const { email, ipAddress } = req.body;

        const cleanEmail = String(email || "")
            .trim()
            .toLowerCase();

        const cleanIpAddress = String(ipAddress || "").trim();

        if (!cleanEmail || !cleanIpAddress) {
            return res.status(400).json({
                success: false,
                error: "Email and IP address are required.",
            });
        }

        // =============================================
        // FIND LOCKOUT RECORD
        // =============================================

        const { data: lockoutRecord, error: lockoutLookupError } = await supabase
            .from("Admin_Login_Lockouts")
            .select(
                `
                        id,
                        email,
                        ip_address,
                        failed_attempts,
                        locked_until
                    `
            )
            .eq("email", cleanEmail)
            .eq("ip_address", cleanIpAddress)
            .maybeSingle();

        if (lockoutLookupError) {
            console.error("ADMIN UNLOCK LOOKUP ERROR:", lockoutLookupError);

            return res.status(500).json({
                success: false,
                error: "Unable to locate Admin login lockout.",
            });
        }

        if (!lockoutRecord) {
            return res.status(404).json({
                success: false,
                error: "No matching Admin login lockout was found.",
            });
        }

        // =============================================
        // RESET LOGIN LOCKOUT
        // =============================================

        const { error: unlockError } = await supabase
            .from("Admin_Login_Lockouts")
            .update({
                failed_attempts: 0,

                locked_until: null,

                updated_at: new Date().toISOString(),
            })
            .eq("id", lockoutRecord.id);

        if (unlockError) {
            console.error("ADMIN LOGIN UNLOCK ERROR:", unlockError);

            return res.status(500).json({
                success: false,
                error: "Unable to unlock Admin login.",
            });
        }

        console.log("✅ ADMIN LOGIN UNLOCKED:", cleanEmail, cleanIpAddress, "BY:", currentUserId);

        await logAdminActivity({
            adminId: currentUserId,

            adminEmail: authData.user.email || null,

            adminName: null,

            position: currentPositions.join(" • "),

            category: "Security",

            action: "Admin Login Unlocked",

            description: `Unlocked login for ${cleanEmail} from IP ${cleanIpAddress}.`,

            targetType: "Admin Login",

            targetId: lockoutRecord.id,

            targetName: cleanEmail,

            ipAddress: req.ip || null,

            userAgent: req.headers["user-agent"] || null,

            metadata: {
                unlocked_email: cleanEmail,

                unlocked_ip_address: cleanIpAddress,
            },
        });

        return res.json({
            success: true,
            message: "Admin login unlocked successfully.",
        });
    } catch (error) {
        console.error("ADMIN LOGIN UNLOCK ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to unlock Admin login.",
        });
    }
});

// =============================================
// GET ADMIN LOGIN LOCKOUTS
// OWNER + WEB DEVELOPER ONLY
// =============================================

app.get("/admin-login/lockouts", async (req, res) => {
    try {
        // =============================================
        // GET AUTH TOKEN
        // =============================================

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =============================================
        // VERIFY SUPABASE USER
        // =============================================

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // =============================================
        // VERIFY ACTIVE ADMIN
        // =============================================

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select(
                `
                        user_id,
                        status
                    `
            )
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (currentAdminError || !currentAdmin || currentAdmin.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        // =============================================
        // GET ADMIN POSITIONS
        // =============================================

        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
                        Admin_Positions (
                            name
                        )
                    `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            console.error("ADMIN LOGIN LOCKOUT LIST ROLE CHECK ERROR:", currentRolesError);

            return res.status(500).json({
                success: false,
                error: "Unable to verify permissions.",
            });
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

// =============================================
// ALL AUTHENTICATED ADMINS CAN VIEW LOCKOUTS
// =============================================

const canViewLoginLockouts = true;

        // =============================================
        // LOAD LOGIN LOCKOUT RECORDS
        // =============================================

        const { data: lockouts, error: lockoutsError } = await supabase
            .from("Admin_Login_Lockouts")
            .select(
                `
                        id,
                        email,
                        ip_address,
                        failed_attempts,
                        locked_until,
                        updated_at
                    `
            )
            .gt("failed_attempts", 0)
            .order("updated_at", {
                ascending: false,
            });

        if (lockoutsError) {
            console.error("ADMIN LOGIN LOCKOUT LIST DATABASE ERROR:", lockoutsError);

            return res.status(500).json({
                success: false,
                error: "Unable to load Admin login lockouts.",
            });
        }

        // =============================================
        // RETURN LOCKOUT LIST
        // =============================================

        return res.json({
            success: true,

            lockouts: lockouts || [],
        });
    } catch (error) {
        console.error("ADMIN LOGIN LOCKOUT LIST ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to load Admin login lockouts.",
        });
    }
});

// =============================================
// GET ADMIN LOGIN ATTEMPT HISTORY
// OWNER + WEB DEVELOPER ONLY
// =============================================
app.get("/admin-login/attempts", async (req, res) => {
    try {
        // =============================================
        // GET AUTH TOKEN
        // =============================================

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =============================================
        // VERIFY SUPABASE USER
        // =============================================

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // =============================================
        // VERIFY ACTIVE ADMIN
        // =============================================

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select(
                `
                    user_id,
                    status
                `
            )
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (currentAdminError || !currentAdmin || currentAdmin.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        // =============================================
        // GET ADMIN POSITIONS
        // =============================================

        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
                    Admin_Positions (
                        name
                    )
                `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            console.error("ADMIN LOGIN ATTEMPT HISTORY ROLE CHECK ERROR:", currentRolesError);

            return res.status(500).json({
                success: false,
                error: "Unable to verify permissions.",
            });
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        // =============================================
        // OWNER + WEB DEVELOPER ONLY
        // =============================================

        const canViewActivityLog = true;

        // =============================================
        // LOAD LOGIN ATTEMPTS
        // =============================================

        const { data: attempts, error: attemptsError } = await supabase
            .from("Admin_Login_Attempts")
            .select(
                `
                    id,
                    email,
                    ip_address,
                    success,
                    failure_reason,
                    user_agent,
                    created_at
                `
            )
            .order("created_at", {
                ascending: false,
            })
            .limit(100);

        if (attemptsError) {
            console.error("ADMIN LOGIN ATTEMPT HISTORY DATABASE ERROR:", attemptsError);

            return res.status(500).json({
                success: false,
                error: "Unable to load Admin login attempt history.",
            });
        }

        // =============================================
        // RETURN LOGIN ATTEMPTS
        // =============================================

        return res.json({
            success: true,
            attempts: attempts || [],
        });
    } catch (error) {
        console.error("ADMIN LOGIN ATTEMPT HISTORY ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to load Admin login attempt history.",
        });
    }
});

// =============================================
// GET ACTIVE ADMIN SESSIONS
// OWNER + WEB DEVELOPER ONLY
// =============================================

app.get("/admin-active-sessions", async (req, res) => {
    try {
        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const activeSessionCheck = await verifyActiveAdminSession(token);

        if (!activeSessionCheck.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select(
                `
                    user_id,
                    status
                `
            )
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (currentAdminError || !currentAdmin || currentAdmin.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
                    Admin_Positions (
                        name
                    )
                `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            return res.status(500).json({
                success: false,
                error: "Unable to verify permissions.",
            });
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        const canViewSessions = true;

        const { data: sessions, error: sessionsError } = await supabase
            .from("Admin_Active_Sessions")
            .select(
                `
                    id,
                    admin_user_id,
                    auth_session_id,
                    email,
                    ip_address,
                    user_agent,
                    signed_in_at,
                    last_activity_at,
                    is_active
                `
            )
            .eq("is_active", true)
            .order("signed_in_at", {
                ascending: false,
            });

        if (sessionsError) {
            console.error("ACTIVE ADMIN SESSIONS DATABASE ERROR:", sessionsError);

            return res.status(500).json({
                success: false,
                error: "Unable to load active Admin sessions.",
            });
        }

        return res.json({
            success: true,
            sessions: sessions || [],
        });
    } catch (error) {
        console.error("ACTIVE ADMIN SESSIONS ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to load active Admin sessions.",
        });
    }
});

// =============================================
// REVOKE ACTIVE ADMIN SESSION
// OWNER + WEB DEVELOPER ONLY
// =============================================

app.post("/admin-active-sessions/revoke", async (req, res) => {
    try {
        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select(
                `
                    user_id,
                    status
                `
            )
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (currentAdminError || !currentAdmin || currentAdmin.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
                    Admin_Positions (
                        name
                    )
                `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            return res.status(500).json({
                success: false,
                error: "Unable to verify permissions.",
            });
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        const canRevokeSessions = await adminHasPermission(currentUserId, "security.revoke_sessions");

        if (!canRevokeSessions) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to revoke Admin sessions.",
            });
        }

        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: "Session ID is required.",
            });
        }

        const { data: targetSession, error: targetSessionError } = await supabase
            .from("Admin_Active_Sessions")
            .select(
                `
                    id,
                    admin_user_id,
                    email,
                    ip_address,
                    auth_session_id,
                    is_active
                `
            )
            .eq("id", sessionId)
            .maybeSingle();

        if (targetSessionError || !targetSession) {
            return res.status(404).json({
                success: false,
                error: "Admin session was not found.",
            });
        }

        // =============================================
        // AUTHORITY LEVEL REVOKE PROTECTION
        // Current Admin must be HIGHER than target Admin
        // =============================================

        // Get current Admin authority level
        const { data: currentAuthorityRoles, error: currentAuthorityError } = await supabase
            .from("Admin_Roles")
            .select(
                `
            Admin_Positions (
                authority_level
            )
        `
            )
            .eq("user_id", currentUserId);

        if (currentAuthorityError) {
            console.error("CURRENT ADMIN AUTHORITY LOOKUP ERROR:", currentAuthorityError);

            return res.status(500).json({
                success: false,
                error: "Unable to verify your authority level.",
            });
        }

        // Get target Admin authority level
        const { data: targetAuthorityRoles, error: targetAuthorityError } = await supabase
            .from("Admin_Roles")
            .select(
                `
            Admin_Positions (
                authority_level
            )
        `
            )
            .eq("user_id", targetSession.admin_user_id);

        if (targetAuthorityError) {
            console.error("TARGET ADMIN AUTHORITY LOOKUP ERROR:", targetAuthorityError);

            return res.status(500).json({
                success: false,
                error: "Unable to verify the target Admin authority level.",
            });
        }

        // If an Admin has multiple positions, use their HIGHEST authority level
        const currentAdminAuthority = Math.max(
            0,
            ...(currentAuthorityRoles || []).map((role) => Number(role.Admin_Positions?.authority_level || 0))
        );

        const targetAdminAuthority = Math.max(
            0,
            ...(targetAuthorityRoles || []).map((role) => Number(role.Admin_Positions?.authority_level || 0))
        );

        console.log("REVOKE AUTHORITY CHECK:", currentAdminAuthority, ">", targetAdminAuthority);

        // Must be STRICTLY higher
        if (currentAdminAuthority <= targetAdminAuthority) {
            return res.status(403).json({
                success: false,
                error: "You cannot revoke a session belonging to an Admin with the same or higher authority level.",
            });
        }

        const { error: revokeSessionError } = await supabase
            .from("Admin_Active_Sessions")
            .update({
                is_active: false,
                revoked_at: new Date().toISOString(),
            })
            .eq("id", targetSession.id);

        if (revokeSessionError) {
            console.error("ADMIN SESSION REVOKE ERROR:", revokeSessionError);

            return res.status(500).json({
                success: false,
                error: "Unable to revoke Admin session.",
            });
        }

        await logAdminActivity({
            adminId: currentUserId,

            adminEmail: authData.user.email || null,

            adminName: null,

            position: currentPositions.join(" • "),

            category: "Security",

            action: "Admin Session Revoked",

            description: `Revoked the active Admin session for ${targetSession.email || "unknown user"}.`,

            targetType: "Admin Session",

            targetId: targetSession.id,

            targetName: targetSession.email || null,

            ipAddress: req.ip || null,

            userAgent: req.headers["user-agent"] || null,

            metadata: {
                revoked_admin_user_id: targetSession.admin_user_id,

                revoked_email: targetSession.email,

                revoked_ip_address: targetSession.ip_address,

                revoked_auth_session_id: targetSession.auth_session_id,
            },
        });

        return res.json({
            success: true,
            message: "Admin session revoked successfully.",
        });
    } catch (error) {
        console.error("ADMIN SESSION REVOKE ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to revoke Admin session.",
        });
    }
});

// =============================================
// UPDATE ADMIN SECURITY SETTINGS
// OWNER + WEB DEVELOPER ONLY
// =============================================

app.put("/admin-security-settings", async (req, res) => {
    try {
        // =============================================
        // GET AUTH TOKEN
        // =============================================

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =============================================
        // VERIFY ACTIVE SESSION
        // =============================================

        const activeSessionCheck = await verifyActiveAdminSession(token);

        if (!activeSessionCheck.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        // =============================================
        // VERIFY SUPABASE USER
        // =============================================

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // =============================================
        // VERIFY ACTIVE ADMIN ACCOUNT
        // =============================================

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select(
                `
                    user_id,
                    email,
                    first_name,
                    last_name,
                    status
                `
            )
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (currentAdminError || !currentAdmin || currentAdmin.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        // =============================================
        // GET CURRENT ADMIN POSITIONS
        // =============================================

        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
                    Admin_Positions (
                        name
                    )
                `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            console.error("SECURITY SETTINGS ROLE CHECK ERROR:", currentRolesError);

            return res.status(500).json({
                success: false,
                error: "Unable to verify permissions.",
            });
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        // =============================================
        // OWNER + WEB DEVELOPER ONLY
        // =============================================

        const canManageSecuritySettings = await adminHasPermission(
            currentUserId,
            "security.manage_settings"
        );

        if (!canManageSecuritySettings) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to change Security Settings.",
            });
        }

        // =============================================
        // GET + VALIDATE SETTINGS
        // =============================================

        const { failedAttemptLimit, lockoutDurationMinutes, sessionTimeoutMinutes } = req.body;

        const cleanFailedAttemptLimit = Number(failedAttemptLimit);

        const cleanLockoutDurationMinutes = Number(lockoutDurationMinutes);

        const cleanSessionTimeoutMinutes = Number(sessionTimeoutMinutes);

        if (!Number.isInteger(cleanFailedAttemptLimit) || cleanFailedAttemptLimit < 1 || cleanFailedAttemptLimit > 20) {
            return res.status(400).json({
                success: false,
                error: "Failed attempt limit must be between 1 and 20.",
            });
        }

        if (
            !Number.isInteger(cleanLockoutDurationMinutes) ||
            cleanLockoutDurationMinutes < 1 ||
            cleanLockoutDurationMinutes > 1440
        ) {
            return res.status(400).json({
                success: false,
                error: "Lockout duration must be between 1 and 1440 minutes.",
            });
        }

        if (
            !Number.isInteger(cleanSessionTimeoutMinutes) ||
            cleanSessionTimeoutMinutes < 5 ||
            cleanSessionTimeoutMinutes > 1440
        ) {
            return res.status(400).json({
                success: false,
                error: "Session timeout must be between 5 and 1440 minutes.",
            });
        }

        // =============================================
        // LOAD CURRENT SECURITY SETTINGS
        // =============================================

        const { data: existingSettings, error: existingSettingsError } = await supabase
            .from("Admin_Security_Settings")
            .select(
                `
                    id,
                    failed_attempt_limit,
                    lockout_duration_minutes,
                    session_timeout_minutes
                `
            )
            .limit(1)
            .maybeSingle();

        if (existingSettingsError || !existingSettings) {
            console.error("SECURITY SETTINGS LOOKUP ERROR:", existingSettingsError);

            return res.status(500).json({
                success: false,
                error: "Unable to load Security Settings.",
            });
        }

        // =============================================
        // UPDATE SECURITY SETTINGS
        // =============================================

        const { data: updatedSettings, error: updateSettingsError } = await supabase
            .from("Admin_Security_Settings")
            .update({
                failed_attempt_limit: cleanFailedAttemptLimit,

                lockout_duration_minutes: cleanLockoutDurationMinutes,

                session_timeout_minutes: cleanSessionTimeoutMinutes,

                updated_at: new Date().toISOString(),

                updated_by: currentUserId,
            })
            .eq("id", existingSettings.id)
            .select(
                `
                    id,
                    failed_attempt_limit,
                    lockout_duration_minutes,
                    session_timeout_minutes,
                    updated_at
                `
            )
            .single();

        if (updateSettingsError) {
            console.error("SECURITY SETTINGS UPDATE ERROR:", updateSettingsError);

            return res.status(500).json({
                success: false,
                error: "Unable to update Security Settings.",
            });
        }

        // =============================================
        // ACTIVITY LOG
        // =============================================

        const adminName = [currentAdmin.first_name, currentAdmin.last_name].filter(Boolean).join(" ") || null;

        await logAdminActivity({
            adminId: currentUserId,

            adminEmail: authData.user.email || null,

            adminName: adminName,

            position: currentPositions.join(" • "),

            category: "Security",

            action: "Security Settings Updated",

            description: "Updated Admin Security Settings.",

            targetType: "Security Settings",

            targetId: existingSettings.id,

            targetName: "Admin Security Settings",

            ipAddress: req.ip || null,

            userAgent: req.headers["user-agent"] || null,

            metadata: {
                previous: {
                    failed_attempt_limit: existingSettings.failed_attempt_limit,

                    lockout_duration_minutes: existingSettings.lockout_duration_minutes,

                    session_timeout_minutes: existingSettings.session_timeout_minutes,
                },

                updated: {
                    failed_attempt_limit: cleanFailedAttemptLimit,

                    lockout_duration_minutes: cleanLockoutDurationMinutes,

                    session_timeout_minutes: cleanSessionTimeoutMinutes,
                },
            },
        });

        // =============================================
        // SUCCESS
        // =============================================

        return res.json({
            success: true,

            message: "Security Settings updated successfully.",

            settings: updatedSettings,
        });
    } catch (error) {
        console.error("SECURITY SETTINGS UPDATE ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to update Security Settings.",
        });
    }
});

// =============================================
// GET ADMIN ACTIVITY LOG
// OWNER + WEB DEVELOPER ONLY
// =============================================
app.get("/admin-activity-log", async (req, res) => {
    try {
        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const activeSessionCheck = await verifyActiveAdminSession(token);

        if (!activeSessionCheck.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select(
                `
                        user_id,
                        status
                    `
            )
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (currentAdminError || !currentAdmin || currentAdmin.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
                        Admin_Positions (
                            name
                        )
                    `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            return res.status(500).json({
                success: false,
                error: "Unable to verify permissions.",
            });
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        const canViewActivityLog = true;

        const { data: activity, error: activityError } = await supabase
            .from("Admin_Activity_Log")
            .select(
                `
                        id,
                        admin_id,
                        admin_email,
                        admin_name,
                        position,
                        category,
                        action,
                        description,
                        target_type,
                        target_id,
                        target_name,
                        ip_address,
                        user_agent,
                        metadata,
                        created_at
                    `
            )
            .order("created_at", {
                ascending: false,
            })
            .limit(100);

        if (activityError) {
            console.error("ADMIN ACTIVITY LOG DATABASE ERROR:", activityError);

            return res.status(500).json({
                success: false,
                error: "Unable to load Admin activity.",
            });
        }

        return res.json({
            success: true,
            activity: activity || [],
        });
    } catch (error) {
        console.error("ADMIN ACTIVITY LOG ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to load Admin activity.",
        });
    }
});

// =============================================
// UPDATE ADMIN ACCOUNT + POSITIONS
// =============================================

app.post("/admin-account/update", async (req, res) => {
    try {
        // =============================================
        // GET AUTH TOKEN
        // =============================================

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =============================================
        // VERIFY ACTIVE ADMIN SESSION
        // =============================================

        const activeSessionCheck = await verifyActiveAdminSession(token);

        if (!activeSessionCheck.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        // =============================================
        // VERIFY LOGGED-IN USER
        // =============================================

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // =============================================
        // VERIFY ACTIVE ADMIN ACCOUNT
        // =============================================

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select(
                `
                user_id,
                email,
                first_name,
                last_name,
                status,
                authority_level
            `
            )
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (currentAdminError || !currentAdmin || currentAdmin.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        // =============================================
        // GET CURRENT ADMIN POSITIONS + AUTHORITY
        // =============================================

        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
        position_id,
        Admin_Positions (
            id,
            name,
            authority_level
        )
    `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            console.error("CURRENT ADMIN ROLE LOOKUP ERROR:", currentRolesError);

            return res.status(500).json({
                success: false,
                error: "Unable to verify permissions.",
            });
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        const currentPositionAuthorityLevel = Math.max(
            ...(currentRoles || []).map((role) => Number(role.Admin_Positions?.authority_level) || 0),
            0
        );

        const currentAuthorityLevel = Number(currentAdmin.authority_level);

        const isTopLevelAdmin = currentPositions.includes("Owner") || currentPositions.includes("Web Developer");
        const currentIsOwner = currentPositions.includes("Owner");
        // =============================================
        // ACCOUNT MANAGEMENT PERMISSIONS
        // =============================================
        const hasEditAdminPermission = await adminHasPermission(currentUserId, "accounts.edit");

        const hasManageEmployeePermissions = await adminHasPermission(currentUserId, "accounts.manage_permissions");

        const hasManageEmployeePositions = await adminHasPermission(currentUserId, "accounts.manage_positions");

        const hasEditAuthorityPermission = await adminHasPermission(currentUserId, "accounts.edit_authority");

        const canEditAdmin = isTopLevelAdmin || hasEditAdminPermission;

        const canManageEmployeePermissions = isTopLevelAdmin || hasManageEmployeePermissions;

        const canManageEmployeePositions = isTopLevelAdmin || hasManageEmployeePositions;

        const canEditAuthority = isTopLevelAdmin || hasEditAuthorityPermission;

        if (!canEditAdmin) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to edit administrator accounts.",
            });
        }

        // =============================================
        // GET REQUEST DATA
        // =============================================

        const {
            userId,
            firstName,
            lastName,
            status,
            authorityLevel,
            selectedPositionIds,
            permissionOverrides = [],
        } = req.body;

        const cleanAuthorityLevel = Number(authorityLevel);

        const allowedAuthorityLevels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

        if (!allowedAuthorityLevels.includes(cleanAuthorityLevel)) {
            return res.status(400).json({
                success: false,
                error: "Invalid authority level.",
            });
        }

        if (
            !userId ||
            !firstName ||
            !lastName ||
            !status ||
            !Array.isArray(selectedPositionIds) ||
            selectedPositionIds.length === 0 ||
            !Array.isArray(permissionOverrides)
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid administrator account update.",
            });
        }

        const cleanUserId = String(userId).trim();

        // =============================================
        // PROTECT SELF MANAGEMENT
        // =============================================

        const isOwnAccount = String(currentUserId) === cleanUserId;

        if (isOwnAccount && !isTopLevelAdmin) {
            return res.status(403).json({
                success: false,
                error: "You cannot modify your own administrator account.",
            });
        }

        // =============================================
        // TOP LEVEL SELF ACCOUNT
        // Owner / Web Developer may only edit
        // their own basic name information.
        // =============================================

        if (isOwnAccount && isTopLevelAdmin) {
            const { error: selfUpdateError } = await supabase
                .from("Admins")
                .update({
                    first_name: String(firstName).trim(),
                    last_name: String(lastName).trim(),
                })
                .eq("user_id", cleanUserId);

            if (selfUpdateError) {
                throw selfUpdateError;
            }

            return res.json({
                success: true,
                message: "Your account information was updated successfully.",
            });
        }

        const allowedStatuses = ["Active", "Disabled"];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: "Invalid Admin account status.",
            });
        }

        const cleanSelectedPositionIds = [
            ...new Set(selectedPositionIds.map((positionId) => String(positionId).trim()).filter(Boolean)),
        ];

        // =============================================
        // REQUIRE EXACTLY ONE ADMIN POSITION
        // =============================================

        if (cleanSelectedPositionIds.length !== 1) {
            return res.status(400).json({
                success: false,
                error: "Exactly one administrator position is required.",
            });
        }

        // =============================================
        // GET TARGET ADMIN
        // =============================================

        const { data: targetAdmin, error: targetAdminError } = await supabase
            .from("Admins")
            .select(
                `
                       user_id,
                        email,
                        first_name,
                        last_name,
                        status,
                        authority_level
                    `
            )
            .eq("user_id", userId)
            .maybeSingle();

        if (targetAdminError) {
            throw targetAdminError;
        }

        if (!targetAdmin) {
            return res.status(404).json({
                success: false,
                error: "Administrator account was not found.",
            });
        }

        // =============================================
        // GET EXISTING TARGET POSITIONS + AUTHORITY
        // =============================================

        const { data: existingRoles, error: existingRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
        position_id,
        Admin_Positions (
            id,
            name,
            authority_level
        )
    `
            )
            .eq("user_id", cleanUserId);

        if (existingRolesError) {
            throw existingRolesError;
        }

        const existingPositionIds = (existingRoles || []).map((role) => role.position_id).filter(Boolean);

        const existingPositionNames = (existingRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        const targetPositionAuthorityLevel = Math.max(
            ...(existingRoles || []).map((role) => Number(role.Admin_Positions?.authority_level) || 0),
            0
        );

        const targetAuthorityLevel = Number(targetAdmin.authority_level);

        const targetIsTopLevel =
            existingPositionNames.includes("Owner") || existingPositionNames.includes("Web Developer");

        // =============================================
        // ENFORCE ACCOUNT AUTHORITY HIERARCHY
        // =============================================

        const authorityWasChanged = cleanAuthorityLevel !== targetAuthorityLevel;

        const currentIsWebDeveloper = currentPositions.includes("Web Developer");

        const targetIsOwner = existingPositionNames.includes("Owner");
        const targetIsWebDeveloper = existingPositionNames.includes("Web Developer");

        // Web Developer is a protected system account.
        // No other administrator, including Owner,
        // may modify another Web Developer account.
        if (targetIsWebDeveloper && !isOwnAccount) {
            return res.status(403).json({
                success: false,
                error: "The Web Developer account is protected and cannot be modified.",
            });
        }

        const webDeveloperManagingOwner = currentIsWebDeveloper && targetIsOwner && !isOwnAccount;
        const ownerTryingToManageOwner = currentIsOwner && !currentIsWebDeveloper && targetIsOwner && !isOwnAccount;

        if (ownerTryingToManageOwner) {
            return res.status(403).json({
                success: false,
                error: "Only the Web Developer can manage an Owner account.",
            });
        }

        // Nobody can modify an account with the same
        // or higher authority than their own.
        if (targetAuthorityLevel >= currentAuthorityLevel && !currentIsWebDeveloper) {
            return res.status(403).json({
                success: false,
                error: "You can only manage administrator accounts below your authority level.",
            });
        }

        // Owner and Web Developer positions remain protected
        // from non-top-level administrators.
        if (!isTopLevelAdmin && targetIsTopLevel) {
            return res.status(403).json({
                success: false,
                error: "You cannot manage an Owner or Web Developer account.",
            });
        }

        // Changing Authority Level requires
        // Edit Authority Level permission.
        if (authorityWasChanged && !canEditAuthority) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to edit administrator authority levels.",
            });
        }

        // =============================================
        // CHECK POSITION CHANGES
        // =============================================

        const requestedPositionIds = [...cleanSelectedPositionIds].sort();

        const currentTargetPositionIds = [...existingPositionIds].sort();

        const positionsWereChanged =
            requestedPositionIds.length !== currentTargetPositionIds.length ||
            requestedPositionIds.some((positionId, index) => positionId !== currentTargetPositionIds[index]);

        if (positionsWereChanged && !canManageEmployeePositions) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to change administrator positions.",
            });
        }

        // =============================================
        // GET SELECTED POSITION NAMES
        // =============================================

        const { data: selectedPositions, error: selectedPositionsError } = await supabase
            .from("Admin_Positions")
            .select(
                `
            id,
            name,
            authority_level
        `
            )
            .in("id", cleanSelectedPositionIds);

        if (selectedPositionsError) {
            throw selectedPositionsError;
        }

        if (selectedPositions.length !== cleanSelectedPositionIds.length) {
            return res.status(400).json({
                success: false,
                error: "One or more selected positions are invalid.",
            });
        }

        // =============================================
        // ENFORCE ASSIGNABLE POSITION AUTHORITY
        // =============================================

        if (positionsWereChanged && !isTopLevelAdmin) {
            const unauthorizedAuthorityPosition = selectedPositions.find(
                (position) => Number(position.authority_level || 0) >= currentAuthorityLevel
            );

            if (unauthorizedAuthorityPosition) {
                return res.status(403).json({
                    success: false,
                    error: `You cannot assign the ${unauthorizedAuthorityPosition.name} position because it is not below your authority level.`,
                });
            }
        }

        // =============================================
        // VERIFY POSITION MANAGEMENT PERMISSIONS
        // =============================================

        const selectedPositionNames = selectedPositions.map((position) => position.name).filter(Boolean);
        const selectedIsOwner = selectedPositionNames.includes("Owner");

        // Normal positions must remain below the
        // logged-in administrator's authority level.
        if (!selectedIsOwner && cleanAuthorityLevel >= currentAuthorityLevel) {
            return res.status(403).json({
                success: false,
                error: `You can only assign an authority level below your own (${currentAuthorityLevel}).`,
            });
        }

        const selectedIsWebDeveloper = selectedPositionNames.includes("Web Developer");

        // Owner always has individual Authority Level 100.
        if (selectedIsOwner && cleanAuthorityLevel !== 100) {
            return res.status(400).json({
                success: false,
                error: "Owner must have Authority Level 100.",
            });
        }

        // Web Developer is a protected system position.
        // It cannot be newly assigned through Account Management.
        if (selectedIsWebDeveloper && !existingPositionNames.includes("Web Developer")) {
            return res.status(403).json({
                success: false,
                error: "The Web Developer position cannot be assigned through Account Management.",
            });
        }

        let allowedPositionNames = [];

        if (currentIsWebDeveloper) {
            // Web Developer may assign/remove protected positions
            // from another administrator account.
            allowedPositionNames = selectedPositions.map((position) => position.name).filter(Boolean);

            existingPositionNames.forEach((positionName) => {
                if (!allowedPositionNames.includes(positionName)) {
                    allowedPositionNames.push(positionName);
                }
            });
        } else {
            // Everyone else, INCLUDING Owner,
            // cannot assign Owner or Web Developer.
            allowedPositionNames = selectedPositions
                .map((position) => position.name)
                .filter((positionName) => positionName !== "Owner" && positionName !== "Web Developer");

            existingPositionNames.forEach((positionName) => {
                if (
                    positionName !== "Owner" &&
                    positionName !== "Web Developer" &&
                    !allowedPositionNames.includes(positionName)
                ) {
                    allowedPositionNames.push(positionName);
                }
            });
        }
        // =============================================
        // CHECK TARGET ACCOUNT PERMISSION
        // =============================================

        const protectedTargetPosition = existingPositionNames.find(
            (positionName) => !allowedPositionNames.includes(positionName)
        );

        if (protectedTargetPosition) {
            return res.status(403).json({
                success: false,
                error: `You do not have permission to manage an account with the ${protectedTargetPosition} position.`,
            });
        }

        // =============================================
        // CHECK POSITIONS BEING ASSIGNED
        // =============================================

        const unauthorizedSelectedPosition = selectedPositionNames.find(
            (positionName) => !allowedPositionNames.includes(positionName)
        );

        if (unauthorizedSelectedPosition) {
            return res.status(403).json({
                success: false,
                error: `You do not have permission to assign the ${unauthorizedSelectedPosition} position.`,
            });
        }

        // =============================================
        // CALCULATE POSITION CHANGES
        // =============================================

        const positionsToAdd = cleanSelectedPositionIds.filter(
            (positionId) => !existingPositionIds.includes(positionId)
        );

        const positionsToRemove = existingPositionIds.filter(
            (positionId) => !cleanSelectedPositionIds.includes(positionId)
        );

        const addedPositionNames = selectedPositions
            .filter((position) => positionsToAdd.includes(position.id))
            .map((position) => position.name);

        const removedPositionNames = (existingRoles || [])
            .filter((role) => positionsToRemove.includes(role.position_id))
            .map((role) => role.Admin_Positions?.name)
            .filter(Boolean);

        const unauthorizedRemovedPosition = removedPositionNames.find(
            (positionName) => !allowedPositionNames.includes(positionName)
        );

        if (unauthorizedRemovedPosition) {
            return res.status(403).json({
                success: false,
                error: `You do not have permission to remove the ${unauthorizedRemovedPosition} position.`,
            });
        }

        // =============================================
        // UPDATE ADMIN ACCOUNT
        // =============================================

        const { error: adminUpdateError } = await supabase
            .from("Admins")
            .update({
                first_name: String(firstName).trim(),
                last_name: String(lastName).trim(),
                status: status,
                authority_level: cleanAuthorityLevel,
            })
            .eq("user_id", cleanUserId);

        if (adminUpdateError) {
            throw adminUpdateError;
        }

        // =============================================
        // ADD NEW POSITIONS
        // =============================================

        if (positionsToAdd.length > 0) {
            const roleRows = positionsToAdd.map((positionId) => ({
                user_id: userId,
                position_id: positionId,
            }));

            const { error: roleInsertError } = await supabase.from("Admin_Roles").insert(roleRows);

            if (roleInsertError) {
                throw roleInsertError;
            }
        }

        // =============================================
        // REMOVE POSITIONS
        // =============================================

        if (positionsToRemove.length > 0) {
            const { error: roleDeleteError } = await supabase
                .from("Admin_Roles")
                .delete()
                .eq("user_id", userId)
                .in("position_id", positionsToRemove);

            if (roleDeleteError) {
                throw roleDeleteError;
            }
        }

        // =============================================
        // TARGET DISPLAY NAME
        // =============================================

        const targetName = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();

        // =============================================
        // LOG ADDED POSITIONS
        // =============================================

        for (const positionName of addedPositionNames) {
            await logAdminActivity({
                adminId: currentUserId,
                adminEmail: authData.user.email || null,
                adminName: `${currentAdmin.first_name || ""} ${currentAdmin.last_name || ""}`.trim() || null,
                position: currentPositions.join(" • "),
                category: "Permissions",
                action: "Admin Position Added",
                description: `Added ${positionName} position to ${targetName}.`,
                targetType: "Admin Account",
                targetId: userId,
                targetName: targetName || targetAdmin.email,
                ipAddress: req.ip || null,
                userAgent: req.headers["user-agent"] || null,
                metadata: {
                    target_email: targetAdmin.email,
                    position: positionName,
                    change: "added",
                },
            });
        }

        // =============================================
        // SAVE INDIVIDUAL PERMISSION OVERRIDES
        // =============================================

        if (canManageEmployeePermissions) {
            const cleanPermissionOverrides = permissionOverrides
                .map((override) => ({
                    permissionId: String(override?.permissionId || "").trim(),

                    permissionState: String(override?.permissionState || "")
                        .trim()
                        .toLowerCase(),
                }))
                .filter(
                    (override) =>
                        override.permissionId &&
                        (override.permissionState === "allow" || override.permissionState === "deny")
                );

            // =========================================
            // REMOVE DUPLICATE PERMISSION IDS
            // =========================================

            const permissionOverrideMap = new Map();

            cleanPermissionOverrides.forEach((override) => {
                permissionOverrideMap.set(override.permissionId, override.permissionState);
            });

            const uniquePermissionOverrides = Array.from(permissionOverrideMap.entries()).map(
                ([permissionId, permissionState]) => ({
                    permissionId,
                    permissionState,
                })
            );

            // =========================================
            // VERIFY PERMISSION IDS ARE REAL
            // =========================================

            let validPermissions = [];

            if (uniquePermissionOverrides.length > 0) {
                const permissionIds = uniquePermissionOverrides.map((override) => override.permissionId);

                const { data, error: validPermissionsError } = await supabase
                    .from("Admin_Permissions")
                    .select("id, permission_key")
                    .in("id", permissionIds);

                if (validPermissionsError) {
                    throw validPermissionsError;
                }

                validPermissions = data || [];

                const validPermissionIds = new Set((validPermissions || []).map((permission) => permission.id));

                const invalidPermission = permissionIds.find((permissionId) => !validPermissionIds.has(permissionId));

                if (invalidPermission) {
                    return res.status(400).json({
                        success: false,
                        error: "One or more permission selections are invalid.",
                    });
                }
            }

            // =========================================
            // PROCESS REFUND AUTHORITY REQUIREMENT
            // Target must be individual AL60+
            // =========================================
            const al60ProtectedPermissionKeys = new Set([
                "accounts.create_position",
                "accounts.delete_position",
                "refunds.process",
            ]);

            const al60ProtectedPermissionIds = new Set(
                (validPermissions || [])
                    .filter((permission) => al60ProtectedPermissionKeys.has(permission.permission_key))
                    .map((permission) => String(permission.id))
            );

            const al60ProtectedOverride = uniquePermissionOverrides.find(
                (override) =>
                    al60ProtectedPermissionIds.has(String(override.permissionId)) &&
                    override.permissionState === "allow"
            );

            const targetAuthorityLevel = cleanAuthorityLevel;

            if (al60ProtectedOverride && targetAuthorityLevel < 60) {
                return res.status(403).json({
                    success: false,
                    error: "Authority Level 60 or higher is required for this permission.",
                });
            }

            // =========================================
            // DELETE OLD INDIVIDUAL OVERRIDES
            // =========================================

            const { error: deleteOverridesError } = await supabase
                .from("Admin_User_Permissions")
                .delete()
                .eq("user_id", cleanUserId);

            if (deleteOverridesError) {
                throw deleteOverridesError;
            }

            // =========================================
            // FORCE AL60 PERMISSIONS OFF BELOW AL60
            // =========================================

            if (cleanAuthorityLevel < 60) {
                const protectedPermissions = await supabase
                    .from("Admin_Permissions")
                    .select("id, permission_key")
                    .in("permission_key", ["accounts.create_position", "accounts.delete_position", "refunds.process"]);

                if (protectedPermissions.error) {
                    throw protectedPermissions.error;
                }

                (protectedPermissions.data || []).forEach((permission) => {
                    const existingOverride = uniquePermissionOverrides.find(
                        (override) => String(override.permissionId) === String(permission.id)
                    );

                    if (existingOverride) {
                        existingOverride.permissionState = "deny";
                    } else {
                        uniquePermissionOverrides.push({
                            permissionId: permission.id,
                            permissionState: "deny",
                        });
                    }
                });
            }

            // =========================================
            // INSERT CURRENT INDIVIDUAL OVERRIDES
            // =========================================

            if (uniquePermissionOverrides.length > 0) {
                const overrideRows = uniquePermissionOverrides.map((override) => ({
                    user_id: cleanUserId,

                    permission_id: override.permissionId,

                    permission_state: override.permissionState,
                }));

                const { error: insertOverridesError } = await supabase
                    .from("Admin_User_Permissions")
                    .insert(overrideRows);

                if (insertOverridesError) {
                    throw insertOverridesError;
                }
            }
        } else if (permissionOverrides.length > 0) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to manage employee permissions.",
            });
        }

        // =============================================
        // SUCCESS
        // =============================================

        return res.json({
            success: true,
            message: "Administrator account updated successfully.",
            addedPositions: addedPositionNames,
            removedPositions: removedPositionNames,
        });
    } catch (error) {
        console.error("ADMIN ACCOUNT UPDATE ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error.message || "Unable to update administrator account.",
        });
    }
});

app.post("/admin-message-reply", async (req, res) => {
    try {
        const { messageId, email, customerName, subject, replyMessage } = req.body;

        if (!messageId || !email || !replyMessage) {
            return res.status(400).json({
                success: false,
                error: "Message ID, email, and reply are required.",
            });
        }

        console.log("EMAIL AT LINE 5067:", email);

        await sendCustomerReplyEmail({
            email,
            customerName,
            subject,
            replyMessage,
        });

        const { error: replyHistoryError } = await supabase.from("Message_replies").insert({
            message_id: messageId,
            sender_type: "Admin",
            sender_name: "Midwest Toy Connections",
            sender_email: email,
            message: replyMessage,
        });

        if (replyHistoryError) {
            throw replyHistoryError;
        }

        const { error: updateError } = await supabase
            .from("Messages")
            .update({
                status: "Replied",
                admin_reply: replyMessage,
                replied_at: new Date().toISOString(),
            })
            .eq("id", messageId);

        if (updateError) {
            throw updateError;
        }

        res.json({
            success: true,
        });
    } catch (error) {
        console.error("ADMIN MESSAGE REPLY ERROR:", error);

        res.status(500).json({
            success: false,
            error: "Unable to send reply.",
        });
    }
});

// =========================================================
// CREATE ADMIN POSITION
// =========================================================

app.post("/admin-position/create", async (req, res) => {
    try {
        // =========================================================
        // AUTH TOKEN
        // =========================================================

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =========================================================
        // VERIFY ACTIVE ADMIN SESSION
        // =========================================================

        const sessionStatus = await verifyActiveAdminSession(token);

        if (!sessionStatus.active) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =========================================================
        // GET AUTHENTICATED ADMIN
        // =========================================================

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // =============================================
        // CREATE POSITION AUTHORITY REQUIREMENT
        // =============================================

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select("authority_level")
            .eq("user_id", currentUserId)
            .single();

        if (currentAdminError || !currentAdmin) {
            return res.status(403).json({
                success: false,
                error: "Unable to verify administrator authority level.",
            });
        }

        const currentAuthorityLevel = Number(currentAdmin.authority_level) || 0;

        if (currentAuthorityLevel < 60) {
            return res.status(403).json({
                success: false,
                error: "Authority Level 60 or higher is required to create positions.",
            });
        }

        // =============================================
        // CREATE POSITION PERMISSION
        // =============================================

        const canCreatePosition = await adminHasStrictPermission(currentUserId, "accounts.create_position");

        if (!canCreatePosition) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to create positions.",
            });
        }

        // =========================================================
        // LOAD CURRENT ADMIN POSITIONS
        // =========================================================

        const { data: currentAdminRoles, error: currentAdminRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
                                position_id,
                                Admin_Positions (
                                        id,
                                        name,
                                        authority_level
                                )
                        `
            )
            .eq("user_id", currentUserId);

        if (currentAdminRolesError) {
            console.error("LOAD CURRENT ADMIN POSITIONS ERROR:", currentAdminRolesError);

            return res.status(500).json({
                success: false,
                error: "Unable to verify administrator permissions.",
            });
        }

        // =========================================================
        // CALCULATE CURRENT ADMIN AUTHORITY
        // =========================================================

        const currentAdminAuthority = Math.max(
            0,
            ...(currentAdminRoles || []).map((role) => {
                return Number(role.Admin_Positions?.authority_level || 0);
            })
        );

        if (currentAdminAuthority <= 0) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to manage positions.",
            });
        }

        // =========================================================
        // CURRENT ADMIN POSITION NAMES
        // =========================================================

        const currentAdminPositionNames = (currentAdminRoles || [])
            .map((role) => role.Admin_Positions?.name)
            .filter(Boolean);

        const isOwner = currentAdminPositionNames.includes("Owner");

        const isWebDeveloper = currentAdminPositionNames.includes("Web Developer");

        const isTopLevelAdmin = isOwner || isWebDeveloper;

        // =========================================================
        // REQUEST DATA
        // =========================================================

        const { positionName, authorityLevel, selectedPermissionIds } = req.body;

        if (!positionName || !Number.isInteger(Number(authorityLevel)) || !Array.isArray(selectedPermissionIds)) {
            return res.status(400).json({
                success: false,
                error: "Invalid position information.",
            });
        }

        const cleanPositionName = String(positionName).trim();

        const newPositionAuthority = Number(authorityLevel);

        if (!cleanPositionName) {
            return res.status(400).json({
                success: false,
                error: "Position name is required.",
            });
        }

        // =========================================================
        // VALIDATE AUTHORITY RANGE
        // =========================================================

        if (newPositionAuthority < 1 || newPositionAuthority > 100) {
            return res.status(400).json({
                success: false,
                error: "Authority level must be between 1 and 100.",
            });
        }

        // =========================================================
        // PROTECTED SYSTEM POSITION NAMES
        // =========================================================

        const protectedPositionNames = ["owner", "web developer"];

        if (protectedPositionNames.includes(cleanPositionName.toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: "That position name is reserved.",
            });
        }

        // =========================================================
        // ENFORCE AUTHORITY HIERARCHY
        // =========================================================

        if (newPositionAuthority >= currentAuthorityLevel) {
            return res.status(403).json({
                success: false,
                error: "You cannot create a position at or above your authority level.",
            });
        }

        // =========================================================
        // CLEAN SELECTED PERMISSION IDS
        // =========================================================

        const uniquePermissionIds = [
            ...new Set(selectedPermissionIds.map((permissionId) => String(permissionId).trim()).filter(Boolean)),
        ];

        // =========================================================
        // VALIDATE SELECTED PERMISSIONS
        // =========================================================

        let validPermissions = [];

        if (uniquePermissionIds.length > 0) {
            const { data: loadedValidPermissions, error: validPermissionsError } = await supabase
                .from("Admin_Permissions")
                .select(
                    `
                id,
                permission_key,
                name,
                category
        `
                )
                .in("id", uniquePermissionIds);
            validPermissions = loadedValidPermissions || [];
            if (validPermissionsError) {
                console.error("VALIDATE POSITION PERMISSIONS ERROR:", validPermissionsError);

                return res.status(500).json({
                    success: false,
                    error: "Unable to validate position permissions.",
                });
            }

            if ((validPermissions || []).length !== uniquePermissionIds.length) {
                return res.status(400).json({
                    success: false,
                    error: "One or more selected permissions are invalid.",
                });
            }

            const includesProtectedOwnerPermission = (validPermissions || []).some(
                (permission) => permission.permission_key === "positions.manage_owner"
            );

            if (includesProtectedOwnerPermission) {
                return res.status(403).json({
                    success: false,
                    error: "Owner position management cannot be delegated.",
                });
            }
        }

        // =========================================================
        // CREATE POSITION
        // =========================================================

        const { data: createdPosition, error: createPositionError } = await supabase
            .from("Admin_Positions")
            .insert({
                name: cleanPositionName,
                is_system: false,
                authority_level: newPositionAuthority,
            })
            .select(
                `
                                id,
                                name,
                                authority_level
                        `
            )
            .single();

        if (createPositionError) {
            console.error("CREATE ADMIN POSITION DATABASE ERROR:", createPositionError);

            return res.status(500).json({
                success: false,
                error: "Unable to create administrator position.",
            });
        }

        // =========================================================
        // SAVE POSITION PERMISSIONS
        // =========================================================

        if (uniquePermissionIds.length > 0) {
            const positionPermissionRows = uniquePermissionIds.map((permissionId) => ({
                position_id: createdPosition.id,

                permission_id: permissionId,
            }));

            const { error: positionPermissionsError } = await supabase
                .from("Admin_Position_Permissions")
                .insert(positionPermissionRows);

            if (positionPermissionsError) {
                console.error("CREATE POSITION PERMISSIONS ERROR:", positionPermissionsError);

                await supabase.from("Admin_Positions").delete().eq("id", createdPosition.id);

                return res.status(500).json({
                    success: false,
                    error: "Unable to save position permissions.",
                });
            }

            // =========================================================
            // LOG PERMISSIONS ASSIGNED TO NEW POSITION
            // =========================================================

            for (const permission of validPermissions || []) {
                await logAdminActivity({
                    adminId: currentUserId,

                    adminEmail: authData.user.email || null,

                    adminName: authData.user.email || null,

                    position: currentAdminPositionNames.join(", "),

                    category: "Position Management",

                    action: "Permission Added",

                    description: `Added "${permission.name}" permission to ${createdPosition.name}.`,

                    targetType: "Admin Position",

                    targetId: createdPosition.id,

                    targetName: createdPosition.name,

                    ipAddress: req.ip || null,

                    userAgent: req.headers["user-agent"] || null,

                    metadata: {
                        permission_id: permission.id,

                        permission_key: permission.permission_key,

                        permission_name: permission.name,

                        permission_category: permission.category,

                        position_authority: createdPosition.authority_level,
                    },
                });
            }
        }

        // =========================================================
        // SUCCESS
        // =========================================================

        return res.status(201).json({
            success: true,

            message: "Administrator position created successfully.",

            position: createdPosition,
        });
    } catch (error) {
        console.error("CREATE ADMIN POSITION ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to create administrator position.",
        });
    }
});

// =========================================================
// DELETE ADMIN POSITION
// Permission: accounts.manage_positions
// =========================================================

app.post("/admin-position/delete", async (req, res) => {
    try {
        // =========================================
        // AUTH TOKEN
        // =========================================

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // =========================================
        // VERIFY ACTIVE ADMIN SESSION
        // =========================================

        const sessionStatus = await verifyActiveAdminSession(token);

        if (!sessionStatus.active) {
            return res.status(401).json({
                success: false,
                error: "Admin session has been revoked.",
            });
        }

        // =========================================
        // GET LOGGED-IN ADMIN
        // =========================================

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }
        const currentUserId = authData.user.id;

        // =========================================
        // DELETE POSITION PERMISSION
        // =========================================
        // =========================================
        // DELETE POSITION AUTHORITY REQUIREMENT
        // =========================================

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select("authority_level")
            .eq("user_id", currentUserId)
            .single();

        if (currentAdminError || !currentAdmin) {
            return res.status(403).json({
                success: false,
                error: "Unable to verify administrator authority level.",
            });
        }

        const currentAuthorityLevel = Number(currentAdmin.authority_level) || 0;

        if (currentAuthorityLevel < 60) {
            return res.status(403).json({
                success: false,
                error: "Authority Level 60 or higher is required to delete positions.",
            });
        }

        const canDeletePosition = await adminHasStrictPermission(currentUserId, "accounts.delete_position");

        if (!canDeletePosition) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to delete administrator positions.",
            });
        }

        // =========================================
        // VALIDATE POSITION IDS
        // =========================================

        const { selectedPositionIds } = req.body || {};

        if (!Array.isArray(selectedPositionIds) || selectedPositionIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Select at least one position.",
            });
        }

        const cleanPositionIds = [...new Set(selectedPositionIds.map((id) => String(id).trim()).filter(Boolean))];

        // =========================================
        // LOAD POSITIONS BEFORE DELETE
        // =========================================

        const { data: positionsToDelete, error: positionsError } = await supabase
            .from("Admin_Positions")
            .select("id, name, authority_level")
            .in("id", cleanPositionIds);

        if (positionsError) {
            throw positionsError;
        }

        if (!positionsToDelete || positionsToDelete.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Position was not found.",
            });
        }

        // Never delete protected positions.
        const protectedPosition = positionsToDelete.find(
            (position) => position.name === "Owner" || position.name === "Web Developer"
        );

        if (protectedPosition) {
            return res.status(403).json({
                success: false,
                error: "Owner and Web Developer positions cannot be deleted.",
            });
        }

        // =========================================
        // FIND USERS USING THESE POSITIONS
        // =========================================

        const { data: affectedRoles, error: affectedRolesError } = await supabase
            .from("Admin_Roles")
            .select("user_id, position_id")
            .in("position_id", cleanPositionIds);

        if (affectedRolesError) {
            throw affectedRolesError;
        }

        const affectedUserIds = [...new Set((affectedRoles || []).map((role) => role.user_id).filter(Boolean))];

        // =========================================
        // DELETE POSITIONS
        // =========================================

        const { error: deletePositionError } = await supabase
            .from("Admin_Positions")
            .delete()
            .in("id", cleanPositionIds);

        if (deletePositionError) {
            throw deletePositionError;
        }

        // =========================================
        // RESET USERS THAT NOW HAVE NO POSITION
        // =========================================

        for (const affectedUserId of affectedUserIds) {
            const { data: remainingRoles, error: remainingRolesError } = await supabase
                .from("Admin_Roles")
                .select("position_id")
                .eq("user_id", affectedUserId);

            if (remainingRolesError) {
                throw remainingRolesError;
            }

            if ((remainingRoles || []).length === 0) {
                // NO POSITION = AL 0
                const { error: resetAuthorityError } = await supabase
                    .from("Admins")
                    .update({
                        authority_level: 0,
                    })
                    .eq("user_id", affectedUserId);

                if (resetAuthorityError) {
                    throw resetAuthorityError;
                }

                // No position also means remove
                // individual permission overrides.
                const { error: clearPermissionsError } = await supabase
                    .from("Admin_User_Permissions")
                    .delete()
                    .eq("user_id", affectedUserId);

                if (clearPermissionsError) {
                    throw clearPermissionsError;
                }
            }
        }

        // =========================================
        // SUCCESS
        // =========================================

        return res.json({
            success: true,
            message: "Administrator position deleted successfully.",
            affectedUsers: affectedUserIds.length,
        });
    } catch (error) {
        console.error("DELETE ADMIN POSITION ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error.message || "Unable to delete administrator position.",
        });
    }
});

// =========================================================
// CREATE ADMIN ACCOUNT
// =========================================================
app.post("/admin/create", async (req, res) => {
    try {
        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;
        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
                Admin_Positions (
                    name
                )
            `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            return res.status(500).json({
                success: false,
                error: "Unable to verify administrator permissions.",
            });
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        const isTopLevelAdmin = currentPositions.includes("Owner") || currentPositions.includes("Web Developer");

        const hasCreateAdminPermission = await adminHasPermission(currentUserId, "accounts.create");

        const canCreateAdmin = isTopLevelAdmin || hasCreateAdminPermission;

        if (!canCreateAdmin) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to create administrator accounts.",
            });
        }

        const { firstName, lastName, email, selectedPositionIds } = req.body;

        if (!firstName || !lastName || !email || !Array.isArray(selectedPositionIds)) {
            return res.status(400).json({
                success: false,
                error: "First name, last name, email, and one position are required.",
            });
        }

        // =============================================
        // REQUIRE EXACTLY ONE ADMIN POSITION
        // =============================================

        const cleanSelectedPositionIds = [
            ...new Set(selectedPositionIds.map((positionId) => String(positionId).trim()).filter(Boolean)),
        ];

        if (cleanSelectedPositionIds.length !== 1) {
            return res.status(400).json({
                success: false,
                error: "Exactly one administrator position is required.",
            });
        }
        const { data: selectedCreatePositions, error: selectedCreatePositionsError } = await supabase
            .from("Admin_Positions")
            .select("id, name, authority_level")
            .in("id", cleanSelectedPositionIds);

        if (selectedCreatePositionsError) {
            throw selectedCreatePositionsError;
        }

        const creatingOwner = (selectedCreatePositions || []).some((position) => position.name === "Owner");

        const creatingWebDeveloper = (selectedCreatePositions || []).some(
            (position) => position.name === "Web Developer"
        );

        const currentIsWebDeveloper = currentPositions.includes("Web Developer");

        // Web Developer is a protected system position.
        // It can never be assigned through Create Account.
        if (creatingWebDeveloper) {
            return res.status(403).json({
                success: false,
                error: "The Web Developer position cannot be assigned through Account Management.",
            });
        }

        // Only Web Developer may create an Owner account.
        if (creatingOwner && !currentIsWebDeveloper) {
            return res.status(403).json({
                success: false,
                error: "Only the Web Developer can assign the Owner position.",
            });
        }
        const cleanEmail = String(email).trim().toLowerCase();

        const { data: newAuthUser, error: createUserError } = await supabase.auth.admin.inviteUserByEmail(cleanEmail, {
            redirectTo: "https://midwest-tc.github.io/Midwest-Toy-Connections-Website/mtc-admin-create-password.html",

            data: {
                first_name: firstName,
                last_name: lastName,
            },
        });

        if (createUserError) {
            console.error("❌ ADMIN AUTH CREATE ERROR:", createUserError);

            return res.status(400).json({
                success: false,
                error: createUserError.message,
            });
        }

        const newUserId = newAuthUser.user.id;
        const selectedCreatePosition = selectedCreatePositions[0];

        const newAdminAuthorityLevel = creatingOwner ? 100 : Number(selectedCreatePosition?.authority_level || 10);

        const { error: adminInsertError } = await supabase.from("Admins").insert({
            user_id: newUserId,
            email: cleanEmail,
            first_name: firstName,
            last_name: lastName,
            status: "Active",
            authority_level: newAdminAuthorityLevel,
        });

        if (adminInsertError) {
            console.error("❌ ADMIN TABLE INSERT ERROR:", adminInsertError);

            await supabase.auth.admin.deleteUser(newUserId);

            return res.status(500).json({
                success: false,
                error: "Unable to add administrator.",
            });
        }

        const newRoleRows = cleanSelectedPositionIds.map((positionId) => ({
            user_id: newUserId,
            position_id: positionId,
        }));

        const { error: roleInsertError } = await supabase.from("Admin_Roles").insert(newRoleRows);

        if (roleInsertError) {
            console.error("❌ ADMIN ROLE INSERT ERROR:", roleInsertError);

            await supabase.from("Admins").delete().eq("user_id", newUserId);

            await supabase.auth.admin.deleteUser(newUserId);

            return res.status(500).json({
                success: false,
                error: "Unable to assign administrator positions.",
            });
        }

        return res.status(201).json({
            success: true,
            message: "Administrator created successfully.",
        });
    } catch (error) {
        console.error("❌ CREATE ADMIN ERROR:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to create administrator.",
        });
    }
});

// =========================================
// DELETE EMPLOYEE ACCOUNT
// =========================================

app.post("/admin/delete", async (req, res) => {
    try {
        // -------------------------------------
        // GET AUTH TOKEN
        // -------------------------------------

        const authHeader = req.headers.authorization || "";

        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        // -------------------------------------
        // VERIFY CURRENT LOGGED-IN USER
        // -------------------------------------

        const { data: authData, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authData?.user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized.",
            });
        }

        const currentUserId = authData.user.id;

        // -------------------------------------
        // GET CURRENT ADMIN ACCOUNT
        // -------------------------------------

        const { data: currentAdmin, error: currentAdminError } = await supabase
            .from("Admins")
            .select(
                `
            user_id,
            status
          `
            )
            .eq("user_id", currentUserId)
            .single();

        if (currentAdminError || !currentAdmin || currentAdmin.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "Access denied.",
            });
        }

        // -------------------------------------
        // GET CURRENT USER POSITIONS
        // -------------------------------------

        const { data: currentRoles, error: currentRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
            Admin_Positions (
              name
            )
          `
            )
            .eq("user_id", currentUserId);

        if (currentRolesError) {
            throw currentRolesError;
        }

        const currentPositions = (currentRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        const currentIsOwner = currentPositions.includes("Owner");

        const currentIsWebDeveloper = currentPositions.includes("Web Developer");

        const currentIsAdmin = currentPositions.includes("Admin");

        const hasDeleteAdminPermission = await adminHasPermission(currentUserId, "accounts.delete");

        const canDeleteAdmin = currentIsOwner || currentIsWebDeveloper || hasDeleteAdminPermission;

        if (!canDeleteAdmin) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to delete employee accounts.",
            });
        }

        // -------------------------------------
        // TARGET ACCOUNT
        // -------------------------------------

        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "Employee user ID is required.",
            });
        }

        // -------------------------------------
        // BLOCK SELF DELETE
        // -------------------------------------

        if (userId === currentUserId) {
            return res.status(400).json({
                success: false,
                error: "You cannot delete your own account.",
            });
        }

        // -------------------------------------
        // GET TARGET POSITIONS
        // -------------------------------------

        const { data: targetRoles, error: targetRolesError } = await supabase
            .from("Admin_Roles")
            .select(
                `
            Admin_Positions (
              name
            )
          `
            )
            .eq("user_id", userId);

        if (targetRolesError) {
            throw targetRolesError;
        }

        const targetPositions = (targetRoles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        const targetIsOwner = targetPositions.includes("Owner");

        const targetIsWebDeveloper = targetPositions.includes("Web Developer");

        // -------------------------------------
        // REGULAR ADMIN PROTECTION
        // -------------------------------------

        if (currentIsAdmin && !currentIsOwner && !currentIsWebDeveloper && (targetIsOwner || targetIsWebDeveloper)) {
            return res.status(403).json({
                success: false,
                error: "Admins cannot delete Owner or Web Developer accounts.",
            });
        }

        // -------------------------------------
        // OWNER ACCOUNT PROTECTION
        // Owner must be removed before the
        // administrator account can be deleted.
        // -------------------------------------

        if (targetIsOwner) {
            return res.status(403).json({
                success: false,
                error: "Remove the Owner position from this account before deleting it.",
            });
        }

        if (targetIsWebDeveloper) {
            return res.status(403).json({
                success: false,
                error: "The Web Developer account is protected and cannot be deleted.",
            });
        }

        // -------------------------------------
        // DELETE DATABASE ACCOUNT
        // Admin_Roles will cascade
        // -------------------------------------

        const { error: deleteAdminError } = await supabase.from("Admins").delete().eq("user_id", userId);

        if (deleteAdminError) {
            throw deleteAdminError;
        }

        // -------------------------------------
        // DELETE SUPABASE AUTH USER
        // -------------------------------------

        const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);

        if (deleteAuthError) {
            console.error("Auth delete error:", deleteAuthError);

            return res.status(500).json({
                success: false,
                error: "Database account was removed, but the Auth user could not be deleted.",
            });
        }

        return res.json({
            success: true,
        });
    } catch (error) {
        console.error("Delete employee error:", error);

        return res.status(500).json({
            success: false,
            error: error.message || "Unable to delete employee account.",
        });
    }
});
// =========================================================
// SUBMIT PRODUCT REVIEW
// =========================================================

app.post("/submit-review", async (req, res) => {
    try {
        const {
            productId,
            customerName,
            customerEmail,
            rating,
            title,
            comment
        } = req.body;

        // =====================================================
        // NORMALIZE INPUT
        // =====================================================

        const cleanName = String(customerName || "")
            .trim()
            .slice(0, 100);

        const cleanEmail = String(customerEmail || "")
            .trim()
            .toLowerCase()
            .slice(0, 254);

        const cleanTitle = String(title || "")
            .trim()
            .slice(0, 150);

        const cleanComment = String(comment || "")
            .trim()
            .slice(0, 2000);

        const numericRating = Number(rating);

        // =====================================================
        // REQUIRED FIELDS
        // =====================================================

        if (
            !productId ||
            !cleanName ||
            !cleanEmail ||
            !cleanTitle ||
            !cleanComment
        ) {
            return res.status(400).json({
                success: false,
                error: "Please complete all review fields."
            });
        }

        // =====================================================
        // EMAIL VALIDATION
        // =====================================================

        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(cleanEmail)) {
            return res.status(400).json({
                success: false,
                error: "Please enter a valid email address."
            });
        }

        // =====================================================
        // RATING VALIDATION
        // =====================================================

        if (
            !Number.isInteger(numericRating) ||
            numericRating < 1 ||
            numericRating > 5
        ) {
            return res.status(400).json({
                success: false,
                error: "Rating must be between 1 and 5."
            });
        }

        // =====================================================
        // VERIFY PRODUCT EXISTS
        // =====================================================

        const {
            data: product,
            error: productError
        } = await supabase
            .from("Products")
            .select(`
                id,
                product_name
            `)
            .eq("id", productId)
            .eq("is_active", true)
            .maybeSingle();

        if (productError) {
            console.error(
                "REVIEW PRODUCT LOOKUP ERROR:",
                productError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to verify product."
            });
        }

        if (!product) {
            return res.status(404).json({
                success: false,
                error: "Product could not be found."
            });
        }

        // =====================================================
        // VERIFY CUSTOMER + PRODUCT PURCHASE
        // SERVER / DATABASE IS SOURCE OF TRUTH
        // =====================================================

        const {
            data: verificationRows,
            error: verificationError
        } = await supabase.rpc(
            "verify_review_purchase",
            {
                p_email: cleanEmail,
                p_product_id: productId
            }
        );

        if (verificationError) {
            console.error(
                "REVIEW PURCHASE VERIFICATION ERROR:",
                verificationError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to verify purchase."
            });
        }

        const verification =
            Array.isArray(verificationRows)
                ? verificationRows[0]
                : verificationRows;

        const verifiedCustomer =
            verification?.verified_customer === true;

        const verifiedPurchase =
            verification?.verified_purchase === true;

        const matchingOrderId =
            verification?.matching_order_id || null;

        // =====================================================
        // PREVENT DUPLICATE PRODUCT REVIEW
        //
        // One email can review a specific product once.
        // =====================================================

        const {
            data: existingReview,
            error: duplicateCheckError
        } = await supabase
            .from("Reviews")
            .select("id")
            .eq("review_type", "product")
            .eq("product_id", productId)
            .ilike("customer_email", cleanEmail)
            .maybeSingle();

        if (duplicateCheckError) {
            console.error(
                "REVIEW DUPLICATE CHECK ERROR:",
                duplicateCheckError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to check existing reviews."
            });
        }

        if (existingReview) {
            return res.status(409).json({
                success: false,
                error:
                    "You have already submitted a review for this product."
            });
        }

        // =====================================================
        // FIND CUSTOMER ID WHEN AVAILABLE
        // =====================================================

        let customerId = null;

        const {
            data: customer,
            error: customerError
        } = await supabase
            .from("Customers")
            .select("id")
            .ilike("email", cleanEmail)
            .maybeSingle();

        if (customerError) {
            console.error(
                "REVIEW CUSTOMER LOOKUP ERROR:",
                customerError
            );
        } else {
            customerId = customer?.id || null;
        }

        // =====================================================
        // CREATE PENDING PRODUCT REVIEW
        // =====================================================

        const {
            data: newReview,
            error: reviewInsertError
        } = await supabase
            .from("Reviews")
            .insert({
                product_id: productId,

                customer_id: customerId,

                order_id: matchingOrderId,

                customer_name: cleanName,

                customer_email: cleanEmail,

                review_type: "product",

                rating: numericRating,

                title: cleanTitle,

                comment: cleanComment,

                is_verified_customer:
                    verifiedCustomer,

                is_verified_purchase:
                    verifiedPurchase,

                is_approved: false,

                is_denied: false
            })
            .select(`
                id,
                product_id,
                customer_name,
                customer_email,
                rating,
                title,
                comment,
                review_type,
                is_verified_customer,
                is_verified_purchase,
                is_approved,
                is_denied,
                created_at
            `)
            .single();

        if (reviewInsertError) {
            console.error(
                "REVIEW INSERT ERROR:",
                reviewInsertError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to submit review."
            });
        }

// =========================================================
// CREATE STORE REVIEW ADMIN NOTIFICATIONS
// =========================================================

try {
    const {
        data: reviewNotificationAdmins,
        error: reviewNotificationAdminsError
    } = await supabase
        .from("Admins")
        .select(`
            user_id,
            status
        `)
        .eq("status", "Active");

    if (reviewNotificationAdminsError) {
        console.error(
            "NEW STORE REVIEW NOTIFICATION ADMIN LOOKUP ERROR:",
            reviewNotificationAdminsError
        );
    } else {
        const activeReviewAdminUserIds = [
            ...new Set(
                (reviewNotificationAdmins || [])
                    .map((admin) => admin.user_id)
                    .filter(Boolean)
            )
        ];

        let reviewNotificationUserIds = [];

        if (activeReviewAdminUserIds.length > 0) {
            const {
                data: reviewNotificationSettings,
                error: reviewNotificationSettingsError
            } = await supabase
                .from("Admin_Notification_Settings")
                .select(`
                    admin_id,
                    new_reviews
                `)
                .in(
                    "admin_id",
                    activeReviewAdminUserIds
                );

            if (reviewNotificationSettingsError) {
                console.error(
                    "NEW STORE REVIEW NOTIFICATION SETTINGS ERROR:",
                    reviewNotificationSettingsError
                );
            } else {
                const reviewSettingsByAdmin = new Map(
                    (reviewNotificationSettings || []).map(
                        (setting) => [
                            setting.admin_id,
                            setting
                        ]
                    )
                );

                reviewNotificationUserIds =
                    activeReviewAdminUserIds.filter(
                        (adminUserId) => {
                            const settings =
                                reviewSettingsByAdmin.get(
                                    adminUserId
                                );

                            // No settings row = default ON
                            if (!settings) {
                                return true;
                            }

                            return settings.new_reviews === true;
                        }
                    );
            }
        }

        const reviewNotifications =
            reviewNotificationUserIds.map(
                (adminUserId) => ({
                    admin_user_id: adminUserId,

                    notification_type: "New Review",

                    title: "New Store Review",

                    message:
                        `A new ${numericRating}-star store review is awaiting approval.`,

                    related_review_id: newReview.id,

                    related_product_id: null,

                    destination_page: "reviews",

                    destination_action: "open_review",

                    is_read: false
                })
            );

        if (reviewNotifications.length > 0) {
            const {
                error: reviewNotificationError
            } = await supabase
                .from("Admin_Notifications")
                .insert(reviewNotifications);

            if (reviewNotificationError) {
                console.error(
                    "NEW STORE REVIEW NOTIFICATION CREATE ERROR:",
                    reviewNotificationError
                );
            } else {
                console.log(
                    "🔔 NEW STORE REVIEW ADMIN NOTIFICATIONS CREATED:",
                    newReview.id
                );
            }
        }
    }
} catch (reviewNotificationError) {
    console.error(
        "NEW STORE REVIEW NOTIFICATION ERROR:",
        reviewNotificationError
    );
}

       // =====================================================
// SUCCESS
// =====================================================

console.log(
    "⭐ STORE REVIEW SUBMITTED:",
    {
        reviewId: newReview.id,
        verifiedCustomer
    }
);

return res.status(201).json({
    success: true,

    message:
        "Your store review has been submitted and is awaiting approval.",

    review: {
        id: newReview.id,

        verifiedCustomer:
            newReview.is_verified_customer
    }
});

} catch (error) {
    console.error(
        "SUBMIT STORE REVIEW ERROR:",
        error
    );

    return res.status(500).json({
        success: false,
        error: "Unable to submit store review."
    });
}
});

// =========================================================
// SUBMIT STORE REVIEW
// =========================================================
app.post("/submit-store-review", async (req, res) => {
    try {
        const {
            customerName,
            customerEmail,
            rating,
            title,
            comment
        } = req.body;
        // =====================================================
        // NORMALIZE INPUT
        // =====================================================

        const cleanName = String(customerName || "")
            .trim()
            .slice(0, 100);

        const cleanEmail = String(customerEmail || "")
            .trim()
            .toLowerCase()
            .slice(0, 254);

        const cleanTitle = String(title || "")
            .trim()
            .slice(0, 150);

        const cleanComment = String(comment || "")
            .trim()
            .slice(0, 2000);

        const numericRating = Number(rating);

        // =====================================================
        // REQUIRED FIELDS
        // =====================================================

        if (
            !cleanName ||
            !cleanEmail ||
            !cleanTitle ||
            !cleanComment
        ) {
            return res.status(400).json({
                success: false,
                error: "Please complete all review fields."
            });
        }

        // =====================================================
        // EMAIL VALIDATION
        // =====================================================

        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(cleanEmail)) {
            return res.status(400).json({
                success: false,
                error: "Please enter a valid email address."
            });
        }

        // =====================================================
        // RATING VALIDATION
        // =====================================================

        if (
            !Number.isInteger(numericRating) ||
            numericRating < 1 ||
            numericRating > 5
        ) {
            return res.status(400).json({
                success: false,
                error: "Rating must be between 1 and 5."
            });
        }

        // =====================================================
        // VERIFY CUSTOMER PURCHASE HISTORY
        // product ID is NULL because this is a store review
        // =====================================================

        const {
            data: verificationRows,
            error: verificationError
        } = await supabase.rpc(
            "verify_review_purchase",
            {
                p_email: cleanEmail,
                p_product_id: null
            }
        );

        if (verificationError) {
            console.error(
                "STORE REVIEW VERIFICATION ERROR:",
                verificationError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to verify customer."
            });
        }

        const verification =
            Array.isArray(verificationRows)
                ? verificationRows[0]
                : verificationRows;

        const verifiedCustomer =
            verification?.verified_customer === true;

        const matchingOrderId =
            verification?.matching_order_id || null;

        // =====================================================
        // PREVENT DUPLICATE STORE REVIEW
        //
        // One store review per email.
        // =====================================================

        const {
            data: existingReview,
            error: duplicateCheckError
        } = await supabase
            .from("Reviews")
            .select("id")
            .eq("review_type", "store")
            .ilike("customer_email", cleanEmail)
            .maybeSingle();

        if (duplicateCheckError) {
            console.error(
                "STORE REVIEW DUPLICATE CHECK ERROR:",
                duplicateCheckError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to check existing reviews."
            });
        }

        if (existingReview) {
            return res.status(409).json({
                success: false,
                error:
                    "You have already submitted a store review."
            });
        }

        // =====================================================
        // FIND CUSTOMER ID WHEN AVAILABLE
        // =====================================================

        let customerId = null;

        const {
            data: customer,
            error: customerError
        } = await supabase
            .from("Customers")
            .select("id")
            .ilike("email", cleanEmail)
            .maybeSingle();

        if (customerError) {
            console.error(
                "STORE REVIEW CUSTOMER LOOKUP ERROR:",
                customerError
            );
        } else {
            customerId = customer?.id || null;
        }

        // =====================================================
        // CREATE PENDING STORE REVIEW
        // =====================================================

        const {
            data: newReview,
            error: reviewInsertError
        } = await supabase
            .from("Reviews")
            .insert({
                product_id: null,

                customer_id: customerId,

                order_id: matchingOrderId,

                customer_name: cleanName,

                customer_email: cleanEmail,

                review_type: "store",

                rating: numericRating,

                title: cleanTitle,

                comment: cleanComment,

                is_verified_customer:
                    verifiedCustomer,

                // Store reviews never receive Verified Purchase
                is_verified_purchase: false,

                is_approved: false,

                is_denied: false
            })
            .select(`
                id,
                customer_name,
                customer_email,
                rating,
                title,
                comment,
                review_type,
                is_verified_customer,
                is_verified_purchase,
                is_approved,
                is_denied,
                created_at
            `)
            .single();

       if (reviewInsertError) {
           console.error("STORE REVIEW INSERT ERROR:", reviewInsertError);

            return res.status(500).json({
                success: false,
                error: "Unable to submit review."
            });
        }


// =========================================================
// CREATE STORE REVIEW ADMIN NOTIFICATIONS
// =========================================================

try {
    // Get all active admins
    const {
        data: storeReviewNotificationAdmins,
        error: storeReviewNotificationAdminsError
    } = await supabase
        .from("Admins")
        .select(`
            user_id,
            status
        `)
        .eq("status", "Active");

    if (storeReviewNotificationAdminsError) {
        console.error(
            "STORE REVIEW NOTIFICATION ADMIN LOOKUP ERROR:",
            storeReviewNotificationAdminsError
        );
    } else {
        const activeStoreReviewAdminUserIds = [
            ...new Set(
                (storeReviewNotificationAdmins || [])
                    .map((admin) => admin.user_id)
                    .filter(Boolean)
            )
        ];

        let storeReviewNotificationUserIds = [];

        if (activeStoreReviewAdminUserIds.length > 0) {
            const {
                data: storeReviewNotificationSettings,
                error: storeReviewNotificationSettingsError
            } = await supabase
                .from("Admin_Notification_Settings")
                .select(`
                    admin_id,
                    new_reviews
                `)
                .in(
                    "admin_id",
                    activeStoreReviewAdminUserIds
                );

            if (storeReviewNotificationSettingsError) {
                console.error(
                    "STORE REVIEW NOTIFICATION SETTINGS ERROR:",
                    storeReviewNotificationSettingsError
                );
            } else {
                const storeReviewSettingsByAdmin = new Map(
                    (storeReviewNotificationSettings || []).map(
                        (setting) => [
                            setting.admin_id,
                            setting
                        ]
                    )
                );

                storeReviewNotificationUserIds =
                    activeStoreReviewAdminUserIds.filter(
                        (adminUserId) => {
                            const settings =
                                storeReviewSettingsByAdmin.get(
                                    adminUserId
                                );

                            // No settings row = default ON
                            if (!settings) {
                                return true;
                            }

                            return settings.new_reviews === true;
                        }
                    );
            }
        }

        const storeReviewNotifications =
            storeReviewNotificationUserIds.map(
                (adminUserId) => ({
                    admin_user_id: adminUserId,

                    notification_type: "New Review",

                    title: "New Store Review",

                    message:
                        `A new ${numericRating}-star store review is awaiting approval.`,

                    related_review_id: newReview.id,

                    related_product_id: null,

                    destination_page: "reviews",

                    destination_action: "open_review",

                    is_read: false
                })
            );

        if (storeReviewNotifications.length > 0) {
            const {
                error: storeReviewNotificationError
            } = await supabase
                .from("Admin_Notifications")
                .insert(storeReviewNotifications);

            if (storeReviewNotificationError) {
                console.error(
                    "STORE REVIEW NOTIFICATION CREATE ERROR:",
                    storeReviewNotificationError
                );
            } else {
                console.log(
                    "🔔 NEW STORE REVIEW ADMIN NOTIFICATIONS CREATED:",
                    newReview.id
                );
            }
        }
    }
} catch (storeReviewNotificationError) {
    console.error(
        "NEW STORE REVIEW NOTIFICATION ERROR:",
        storeReviewNotificationError
    );
}

console.log(
    "⭐ STORE REVIEW SUBMITTED:",
    {
        reviewId: newReview.id,
        verifiedCustomer
    }
);

return res.status(201).json({
    success: true,

    message:
        "Your store review has been submitted and is awaiting approval.",

    review: {
        id: newReview.id,

        verifiedCustomer:
            newReview.is_verified_customer
    }
});

} catch (error) {
    console.error(
        "SUBMIT STORE REVIEW ERROR:",
        error
    );

    return res.status(500).json({
        success: false,
        error: "Unable to submit store review."
    });
}
});

// =========================================================
// HEALTH CHECK
// =========================================================
app.get("/", (req, res) => {
    res.send("Midwest Toy Connections Backend Online");
});

// =========================================================
// SUPABASE TEST
// =========================================================
app.get("/test-supabase", async (req, res) => {
    try {
        const { data, error } = await supabase.from("Orders").select("*").limit(1);

        if (error) {
            console.error("❌ Supabase error:", error);

            return res.status(500).json({
                error: error.message,
            });
        }

        res.json({
            success: true,
            message: "Supabase connected",
            data,
        });
    } catch (err) {
        console.error("❌ Supabase test error:", err);

        res.status(500).json({
            error: err.message,
        });
    }
});

// =========================================================
// GET STORE ORDER BY STRIPE SESSION
// =========================================================
app.get("/store-order-by-session/:sessionId", async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!sessionId) {
            return res.status(400).json({
                error: "Stripe session ID is required.",
            });
        }

        const { data: order, error } = await supabase
            .from("Orders")
            .select(
                `
        id,
        order_id,
        payment_status,
        order_status,
        stripe_session_id
      `
            )
            .eq("stripe_session_id", sessionId)
            .single();

        if (error || !order) {
            console.error("❌ ORDER LOOKUP ERROR:", error);

            return res.status(404).json({
                error: "Order not found.",
            });
        }

        res.json({
            success: true,
            order: {
                orderNumber: order.order_id,
                paymentStatus: order.payment_status,
                orderStatus: order.order_status,
            },
        });
    } catch (error) {
        console.error("❌ ORDER LOOKUP ERROR:", error);

        res.status(500).json({
            error: "Unable to retrieve order.",
        });
    }
});

// =========================================================
// PUBLIC DISCOUNT VALIDATION
// =========================================================

async function validateStoreDiscount(discountCode, subtotal) {

    const code =
        String(discountCode || "")
            .trim()
            .toUpperCase();

    const cleanSubtotal =
        Number(subtotal || 0);


    // =====================================================
    // REQUIRE CODE
    // =====================================================

    if (!code) {
        return {
            valid: false,
            error: "Please enter a discount code."
        };
    }


    // =====================================================
    // VALIDATE CODE FORMAT
    // =====================================================

    if (
        code.length > 40 ||
        !/^[A-Z0-9_-]+$/.test(code)
    ) {
        return {
            valid: false,
            error: "Invalid discount code."
        };
    }


    // =====================================================
    // LOAD DISCOUNT FROM DATABASE
    // =====================================================

    const {
        data: discount,
        error: discountError
    } = await supabase
        .from("Discounts")
        .select(`
            id,
            code,
            discount_type,
            discount_value,
            minimum_order_amount,
            starts_at,
            expires_at,
            usage_limit,
            times_used,
            is_active
        `)
        .ilike("code", code)
        .maybeSingle();


    if (discountError) {

        console.error(
            "PUBLIC DISCOUNT LOOKUP ERROR:",
            discountError
        );

        return {
            valid: false,
            serverError: true,
            error: "Unable to verify discount code."
        };
    }


    // =====================================================
    // CODE DOES NOT EXIST
    // =====================================================

    if (!discount) {
        return {
            valid: false,
            error: "Invalid discount code."
        };
    }


    // =====================================================
    // ACTIVE CHECK
    // =====================================================

    if (discount.is_active !== true) {
        return {
            valid: false,
            error: "This discount code is not active."
        };
    }


    // =====================================================
    // DATE CHECKS
    // =====================================================

    const now = new Date();


    if (
        discount.starts_at &&
        now < new Date(discount.starts_at)
    ) {
        return {
            valid: false,
            error: "This discount code is not active yet."
        };
    }


    if (
        discount.expires_at &&
        now > new Date(discount.expires_at)
    ) {
        return {
            valid: false,
            error: "This discount code has expired."
        };
    }


    // =====================================================
    // MINIMUM ORDER CHECK
    // =====================================================

    const minimumOrderAmount =
        discount.minimum_order_amount === null
            ? null
            : Number(discount.minimum_order_amount);


    if (
        minimumOrderAmount !== null &&
        cleanSubtotal < minimumOrderAmount
    ) {
        return {
            valid: false,
            error:
                `This discount requires a minimum order of $${minimumOrderAmount.toFixed(2)}.`
        };
    }


    // =====================================================
    // USAGE LIMIT CHECK
    // =====================================================

    const usageLimit =
        discount.usage_limit === null
            ? null
            : Number(discount.usage_limit);

    const timesUsed =
        Number(discount.times_used || 0);


    if (
        usageLimit !== null &&
        timesUsed >= usageLimit
    ) {
        return {
            valid: false,
            error: "This discount code has reached its usage limit."
        };
    }


    // =====================================================
    // CALCULATE DISCOUNT
    // =====================================================

    const discountValue =
        Number(discount.discount_value || 0);

    let discountAmount = 0;


    if (discount.discount_type === "percentage") {

        discountAmount =
            cleanSubtotal *
            (discountValue / 100);

    } else if (discount.discount_type === "fixed") {

        discountAmount =
            discountValue;

    } else {

        return {
            valid: false,
            error: "Invalid discount configuration."
        };
    }


    // =====================================================
    // NEVER DISCOUNT BELOW $0
    // =====================================================

    discountAmount =
        Math.min(
            discountAmount,
            cleanSubtotal
        );


    discountAmount =
        Number(
            discountAmount.toFixed(2)
        );


    // =====================================================
    // SUCCESS
    // =====================================================

    return {
        valid: true,

        discount: {
            id: discount.id,

            code: discount.code,

            type: discount.discount_type,

            value: discountValue,

            amount: discountAmount,

            minimumOrderAmount: minimumOrderAmount
        }
    };
}


// =========================================================
// VALIDATE DISCOUNT CODE
// =========================================================

app.post("/validate-discount", async (req, res) => {

    try {

        const discountCode =
            String(
                req.body?.discountCode || ""
            )
                .trim()
                .toUpperCase();


        const cart =
            Array.isArray(req.body?.cart)
                ? req.body.cart
                : [];


        // =================================================
        // REQUIRE CART
        // =================================================

        if (cart.length === 0) {

            return res.status(400).json({
                success: false,
                error: "Cart is empty."
            });
        }


        // =================================================
        // GET PRODUCT IDS
        // =================================================

        const productIds = [
            ...new Set(
                cart
                    .map(item => item.productId)
                    .filter(Boolean)
            )
        ];


        if (productIds.length === 0) {

            return res.status(400).json({
                success: false,
                error: "No valid products found in cart."
            });
        }


        // =================================================
        // LOAD PRODUCTS
        // =================================================

        const {
            data: products,
            error: productError
        } = await supabase
            .from("Products")
            .select(`
                id,
                price,
                is_active
            `)
            .in("id", productIds)
            .eq("is_active", true);


        if (productError) {

            console.error(
                "DISCOUNT PRODUCT LOOKUP ERROR:",
                productError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to verify cart."
            });
        }


        if (
            !products ||
            products.length !== productIds.length
        ) {

            return res.status(400).json({
                success: false,
                error:
                    "One or more products are no longer available."
            });
        }


        // =================================================
        // LOAD VARIANTS
        // =================================================

        const variantIds = [
            ...new Set(
                cart
                    .map(item => item.variantId)
                    .filter(Boolean)
            )
        ];


        let variants = [];


        if (variantIds.length > 0) {

            const {
                data: variantData,
                error: variantError
            } = await supabase
                .from("Product_variants")
                .select(`
                    id,
                    product_id,
                    price,
                    is_active
                `)
                .in("id", variantIds)
                .eq("is_active", true);


            if (variantError) {

                console.error(
                    "DISCOUNT VARIANT LOOKUP ERROR:",
                    variantError
                );

                return res.status(500).json({
                    success: false,
                    error: "Unable to verify cart."
                });
            }


            variants =
                variantData || [];
        }


        // =================================================
        // SERVER CALCULATES SUBTOTAL
        // =================================================

        let subtotal = 0;


        for (const cartItem of cart) {

            const product =
                products.find(
                    item =>
                        String(item.id) ===
                        String(cartItem.productId)
                );


            if (!product) {

                return res.status(400).json({
                    success: false,
                    error: "Product not found."
                });
            }


            let variant = null;


            if (cartItem.variantId) {

                variant =
                    variants.find(
                        item =>
                            String(item.id) ===
                            String(cartItem.variantId)
                    );


                if (
                    !variant ||
                    String(variant.product_id) !==
                        String(product.id)
                ) {

                    return res.status(400).json({
                        success: false,
                        error: "Invalid product variant."
                    });
                }
            }


            const quantity =
                Math.max(
                    1,
                    Math.floor(
                        Number(
                            cartItem.quantity || 1
                        )
                    )
                );


            const price =
                variant
                    ? Number(variant.price || 0)
                    : Number(product.price || 0);


            if (
                !Number.isFinite(price) ||
                price <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    error: "Invalid product price."
                });
            }


            subtotal +=
                price * quantity;
        }


        subtotal =
            Number(
                subtotal.toFixed(2)
            );


        // =================================================
        // VALIDATE DISCOUNT
        // =================================================

        const result =
            await validateStoreDiscount(
                discountCode,
                subtotal
            );


        if (!result.valid) {

            return res
                .status(
                    result.serverError
                        ? 500
                        : 400
                )
                .json({
                    success: false,
                    error: result.error
                });
        }


        // =================================================
        // SUCCESS
        // =================================================

        return res.json({
            success: true,

            code:
                result.discount.code,

            discountType:
                result.discount.type,

            discountValue:
                result.discount.value,

            discountAmount:
            result.discount.amount,

            minimumOrderAmount:
                result.discount.minimumOrderAmount,

            subtotal: subtotal,

            totalAfterDiscount:
                Number(
                    (
                        subtotal -
                        result.discount.amount
                    ).toFixed(2)
                )
        });


    } catch (error) {

        console.error(
            "VALIDATE DISCOUNT ERROR:",
            error
        );


        return res.status(500).json({
            success: false,
            error:
                "Unable to verify discount code."
        });
    }
});

// =========================================================
// BUILD + VALIDATE MTC CART
// Shared by Stripe and PayPal
// =========================================================
async function buildValidatedMTCCart(cart) {

    if (!Array.isArray(cart) || cart.length === 0) {
        throw new Error("Cart is empty.");
    }

    const productIds = [
        ...new Set(
            cart
                .map(item => item.productId)
                .filter(Boolean)
        )
    ];

    if (productIds.length === 0) {
        throw new Error(
            "No valid products found in cart."
        );
    }

    const {
        data: products,
        error: productError
    } = await supabase
        .from("Products")
        .select(`
            id,
            product_name,
            sku,
            price,
            image_url,
            is_active
        `)
        .in("id", productIds)
        .eq("is_active", true);

    if (productError) {
        throw new Error(
            "Unable to verify products."
        );
    }

    if (
        !products ||
        products.length !== productIds.length
    ) {
        throw new Error(
            "One or more products are no longer available."
        );
    }

    const variantIds = [
        ...new Set(
            cart
                .map(item => item.variantId)
                .filter(Boolean)
        )
    ];

    let variants = [];

    if (variantIds.length > 0) {

        const {
            data: variantData,
            error: variantError
        } = await supabase
            .from("Product_variants")
            .select(`
                id,
                product_id,
                sku,
                variant_name,
                price,
                stock_quantity,
                is_active
            `)
            .in("id", variantIds)
            .eq("is_active", true);

        if (variantError) {
            throw new Error(
                "Unable to verify product variants."
            );
        }

        variants = variantData || [];
    }

    let subtotal = 0;

    const validatedItems = [];

    for (const cartItem of cart) {

        const product = products.find(
            item =>
                String(item.id) ===
                String(cartItem.productId)
        );

        if (!product) {
            throw new Error(
                "Product not found."
            );
        }

        let variant = null;

        if (cartItem.variantId) {

            variant = variants.find(
                item =>
                    String(item.id) ===
                    String(cartItem.variantId)
            );

            if (!variant) {
                throw new Error(
                    `Variant not found for ${product.product_name}.`
                );
            }

            if (
                String(variant.product_id) !==
                String(product.id)
            ) {
                throw new Error(
                    "Invalid product variant."
                );
            }
        }

        const quantity = Math.max(
            1,
            Math.floor(
                Number(cartItem.quantity || 1)
            )
        );

        if (
            !Number.isFinite(quantity) ||
            quantity < 1
        ) {
            throw new Error(
                "Invalid product quantity."
            );
        }

        if (variant) {

            const stock =
                Number(
                    variant.stock_quantity || 0
                );

            if (stock < quantity) {
                throw new Error(
                    `${product.product_name} does not have enough stock.`
                );
            }
        }

        const price = variant
            ? Number(variant.price || 0)
            : Number(product.price || 0);

        if (
            !Number.isFinite(price) ||
            price <= 0
        ) {
            throw new Error(
                `${product.product_name} has an invalid price.`
            );
        }

        subtotal += price * quantity;

        validatedItems.push({
            product,
            variant,
            quantity,
            price
        });
    }

    return {
        products,
        variants,
        validatedItems,

        subtotal:
            Number(
                subtotal.toFixed(2)
            )
    };
}


// =========================================================
// ESTIMATE MTC SALES TAX USING STRIPE
// =========================================================

app.post("/calculate-cart-tax", async (req, res) => {
    try {
        const {
            cart,
            shippingAddress,
            shippingMethodId,
            discountCode
        } = req.body;

        const { validatedItems, subtotal } =
        await buildValidatedMTCCart(cart);

        let discountAmount = 0;

        if (discountCode) {
            const discountResult =
                await validateStoreDiscount(discountCode, subtotal);

            if (!discountResult.valid) {
                return res.status(400).json({
                    error: discountResult.error
                });
            }

            discountAmount = Number(
            discountResult.discount.amount || 0
        );
}

            const discountedSubtotal = Math.max(
                0,
                Number(subtotal) - discountAmount
            );

            let shippingAmount = 0;

    const isLocalPickup =
    String(shippingMethodId).trim() === "local-pickup";

console.log("TAX REQUEST DEBUG:", {
    shippingMethodId,
    isLocalPickup,
    shippingAddress
});

            const { data: shippingSettings, error: shippingSettingsError } =
    await supabase
        .from("Shipping_Settings")
        .select(`
            free_shipping_enabled,
            free_shipping_minimum,
            local_pickup_enabled,
            local_pickup_address
        `)
        .limit(1)
        .maybeSingle();

if (shippingSettingsError || !shippingSettings) {
    return res.status(500).json({
        error: "Unable to load shipping settings."
    });
}

if (
    isLocalPickup &&
    shippingSettings.local_pickup_enabled !== true
) {
    return res.status(400).json({
        error: "Local Pickup is currently unavailable."
    });
}

if (!shippingMethodId) {
    return res.status(400).json({
        error: "Please select a shipping method."
    });
}

if (!isLocalPickup) {
    const { data: shippingMethod, error: shippingMethodError } =
        await supabase
            .from("Shipping_Methods")
            .select("id, name, price")
            .eq("id", shippingMethodId)
            .eq("is_active", true)
            .maybeSingle();

    if (shippingMethodError || !shippingMethod) {
        return res.status(400).json({
            error: "The selected shipping method is unavailable."
        });
    }

    shippingAmount = Number(shippingMethod.price || 0);

    if (
        shippingSettings.free_shipping_enabled === true &&
        shippingMethod.name?.toLowerCase().includes("standard") &&
        subtotal >= Number(shippingSettings.free_shipping_minimum || 0)
    ) {
        shippingAmount = 0;
    }
}

        const discountRatio =
            subtotal > 0
                ? discountedSubtotal / subtotal
                : 0;

        if (
            !isLocalPickup &&
            (
                !shippingAddress ||
                !shippingAddress.line1 ||
                !shippingAddress.city ||
                !shippingAddress.state ||
                !shippingAddress.postalCode
            )
        )
        {
            return res.status(400).json({
                error: "Complete shipping address required."
            });
        }

const taxAddress = isLocalPickup
    ? {
        line1: "5601 S Pennsylvania Ave",
        city: "Cudahy",
        state: "WI",
        postal_code: "53110",
        country: "US"
    }
    : {
        line1: shippingAddress.line1,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postal_code: shippingAddress.postalCode,
        country: "US"
    };

        const calculation = await stripe.tax.calculations.create({
            currency: "usd",
            shipping_cost: {
                amount: Math.round(shippingAmount * 100)
            },

            line_items: validatedItems.map(item => ({
                amount: Math.round(
                    item.price * discountRatio * 100
                ),
                quantity: item.quantity,
                reference: String(item.product.id)
            })),

            customer_details: {
                address: taxAddress,
                address_source: "shipping"
            }
        });

       const taxCents =
            Number(calculation.tax_amount_exclusive || 0) +
            Number(calculation.tax_amount_inclusive || 0);

        console.log("STRIPE TAX PREVIEW:", {
            calculationId: calculation.id,
            address: taxAddress,
            taxCents,
            total: calculation.amount_total,
            breakdown: calculation.tax_breakdown
        });

        return res.json({
            tax: taxCents / 100,
            shipping: shippingAmount,
            currency: "usd"
        });

    } catch (error) {
        console.error("CART TAX ERROR:", error);

        return res.status(500).json({
            error: "Unable to calculate sales tax."
        });
    }
});

// =========================================================
// CREATE MTC STORE CHECKOUT SESSION
// =========================================================
// Called by mw-shoppingcart.html
//
// Flow:
// mw-visit-store.html -> Add to Cart -> mw-shoppingcart.html -> Proceed To Checkout -> This route -> Stripe Checkout
// =========================================================
app.post("/create-store-checkout-session", async (req, res) => {
    try {
        const {
            cart,
            shippingMethodId,
            shippingAddress,
            discountCode
        } = req.body;

        // =================================================
        // VALIDATE CART
        // =================================================
        if (!Array.isArray(cart) || cart.length === 0) {
            return res.status(400).json({
                error: "Cart is empty.",
            });
        }

        // =================================================
        // GET PRODUCT IDS
        // =================================================
        const productIds = [...new Set(cart.map((item) => item.productId).filter(Boolean))];

        if (productIds.length === 0) {
            return res.status(400).json({
                error: "No valid products found in cart.",
            });
        }

        // =================================================
        // GET PRODUCTS FROM SUPABASE
        // =================================================
        const { data: products, error: productError } = await supabase
            .from("Products")
            .select(
                `
          id,
          product_name,
          sku,
          price,
          image_url,
          is_active
      `
            )
            .in("id", productIds)
            .eq("is_active", true);

        if (productError) {
            console.error("❌ PRODUCT LOOKUP ERROR:", productError);

            return res.status(500).json({
                error: "Unable to verify products.",
            });
        }

        // =================================================
        // VERIFY PRODUCTS
        // =================================================
        if (!products || products.length !== productIds.length) {
            return res.status(400).json({
                error: "One or more products are no longer available.",
            });
        }

        // =================================================
        // GET VARIANTS
        // =================================================
        const variantIds = [...new Set(cart.map((item) => item.variantId).filter(Boolean))];

        let variants = [];

        if (variantIds.length > 0) {
            const { data: variantData, error: variantError } = await supabase
                .from("Product_variants")
                .select(
                    `
          id,
          product_id,
          sku,
          variant_name,
          price,
          stock_quantity,
          is_active
        `
                )
                .in("id", variantIds)
                .eq("is_active", true);

            if (variantError) {
                console.error("❌ VARIANT LOOKUP ERROR:", variantError);

                return res.status(500).json({
                    error: "Unable to verify product variants.",
                });
            }

            variants = variantData || [];
        }

        // =================================================
        // BUILD STRIPE LINE ITEMS
        // =================================================
        const lineItems = [];
        let subtotal = 0;

        for (const cartItem of cart) {
            const product = products.find((item) => String(item.id) === String(cartItem.productId));

            if (!product) {
                return res.status(400).json({
                    error: "Product not found.",
                });
            }

            // ---------------------------------------------
            // FIND VARIANT
            // ---------------------------------------------
            let variant = null;

            if (cartItem.variantId) {
                variant = variants.find((item) => String(item.id) === String(cartItem.variantId));

                if (!variant) {
                    return res.status(400).json({
                        error: `Variant not found for ${product.product_name}.`,
                    });
                }
            }

            // ---------------------------------------------
            // QUANTITY
            // ---------------------------------------------
            const quantity = Math.max(1, Number(cartItem.quantity || 1));

            // ---------------------------------------------
            // STOCK
            // ---------------------------------------------
            if (variant) {
                const stock = Number(variant.stock_quantity || 0);

                if (stock < quantity) {
                    return res.status(400).json({
                        error: `${product.product_name} does not have enough stock.`,
                    });
                }
            }

            // ---------------------------------------------
            // PRICE
            // ---------------------------------------------
            const price = variant ? Number(variant.price || 0) : Number(product.price || 0);

            if (price <= 0) {
                return res.status(400).json({
                    error: `${product.product_name} has an invalid price.`,
                });
            }

            // ---------------------------------------------
            // SUBTOTAL
            // ---------------------------------------------
            subtotal += price * quantity;

            // ---------------------------------------------
            // PRODUCT NAME
            // ---------------------------------------------
            const productName = variant ? `${product.product_name} - ${variant.variant_name}` : product.product_name;

            // ---------------------------------------------
            // STRIPE PRODUCT DATA
            // ---------------------------------------------
            const productData = {
                name: productName,
            };

            if (product.image_url) {
                productData.images = [product.image_url];
            }

            // ---------------------------------------------
            // STRIPE LINE ITEM
            // ---------------------------------------------
            lineItems.push({
                price_data: {
                    currency: "usd",

                    product_data: productData,

                    unit_amount: Math.round(price * 100),
                },

                quantity,
            });
        }

// =================================================
// LOAD + VERIFY SELECTED SHIPPING METHOD
// SERVER IS THE SOURCE OF TRUTH
// =================================================


const {
    data: shippingSettings,
    error: shippingSettingsError
} = await supabase
    .from("Shipping_Settings")
    .select(`
        free_shipping_enabled,
        free_shipping_minimum,
        local_pickup_enabled,
        local_pickup_address,
        local_pickup_instructions,
        local_pickup_ready_time
    `)
    .limit(1)
    .maybeSingle();


if (shippingSettingsError) {

    console.error(
        "❌ SHIPPING SETTINGS LOOKUP ERROR:",
        shippingSettingsError
    );

    return res.status(500).json({
        error: "Unable to load shipping settings.",
    });
}


// =================================================
// LOCAL PICKUP
// =================================================

let selectedShippingMethod = null;
let shippingAmount = 0;

const isLocalPickup =
    String(shippingMethodId) === "local-pickup";

    if (!shippingMethodId) {
    return res.status(400).json({
        error: "Please select a shipping method."
    });
}


if (isLocalPickup) {

    // ---------------------------------------------
    // VERIFY LOCAL PICKUP IS STILL ENABLED
    // ---------------------------------------------

    if (shippingSettings?.local_pickup_enabled !== true) {

        return res.status(400).json({
            error: "Local Pickup is currently unavailable.",
        });
    }


    // ---------------------------------------------
    // REQUIRE PICKUP ADDRESS
    // FAIL CLOSED
    // ---------------------------------------------

    const pickupAddress =
        String(
            shippingSettings?.local_pickup_address || ""
        ).trim();

    if (!pickupAddress) {

        return res.status(400).json({
            error: "Local Pickup is currently unavailable.",
        });
    }


    // ---------------------------------------------
    // CREATE SERVER-VERIFIED PICKUP METHOD
    // ---------------------------------------------

    selectedShippingMethod = {
        id: "local-pickup",
        name: "Local Pickup",
        price: 0,
        is_local_pickup: true
    };

    shippingAmount = 0;

} else {

    // =================================================
    // REGULAR SHIPPING METHOD
    // =================================================

    const {
        data: databaseShippingMethod,
        error: shippingMethodError
    } = await supabase
        .from("Shipping_Methods")
        .select(`
            id,
            name,
            price,
            estimated_delivery,
            is_active
        `)
        .eq("id", shippingMethodId)
        .eq("is_active", true)
        .maybeSingle();


    if (shippingMethodError) {

        console.error(
            "❌ SHIPPING METHOD LOOKUP ERROR:",
            shippingMethodError
        );

        return res.status(500).json({
            error: "Unable to load shipping method.",
        });
    }


    if (!databaseShippingMethod) {

        return res.status(400).json({
            error:
                "The selected shipping method is unavailable.",
        });
    }


    selectedShippingMethod =
        databaseShippingMethod;

    shippingAmount =
        Number(selectedShippingMethod.price || 0);


    // =================================================
    // FREE STANDARD SHIPPING
    // =================================================

    const freeShippingEnabled =
        shippingSettings?.free_shipping_enabled === true;

    const freeShippingMinimum =
        Number(
            shippingSettings?.free_shipping_minimum || 0
        );

    const isStandardShipping =
        selectedShippingMethod.name
            ?.toLowerCase()
            .includes("standard") === true;


    if (
        freeShippingEnabled &&
        isStandardShipping &&
        subtotal >= freeShippingMinimum
    ) {
        shippingAmount = 0;
    }
}

// =================================================
// VALIDATE SHIPPING ADDRESS + SHIPPING AVAILABILITY
// BEFORE CREATING ORDER OR STRIPE SESSION
// =================================================

let normalizedShippingAddress = null;


// =================================================
// LOAD SHIPPING RESTRICTIONS
// =================================================

const {
    data: shippingRestrictionSettings,
    error: shippingRestrictionSettingsError
} = await supabase
    .from("Shipping_Settings")
    .select(`
        domestic_shipping_enabled,
        international_shipping_enabled,
        restricted_locations
    `)
    .limit(1)
    .maybeSingle();


if (shippingRestrictionSettingsError) {

    console.error(
        "SHIPPING RESTRICTIONS LOAD ERROR:",
        shippingRestrictionSettingsError
    );

    return res.status(500).json({
        error:
            "Unable to verify shipping availability."
    });
}


if (!shippingRestrictionSettings) {

    return res.status(500).json({
        error:
            "Shipping settings could not be found."
    });
}


// =================================================
// SERVER-SIDE ADDRESS VALIDATION
// =================================================

if (!isLocalPickup) {

    if (
        !shippingAddress ||
        typeof shippingAddress !== "object" ||
        Array.isArray(shippingAddress)
    ) {
        return res.status(400).json({
            error:
                "Please enter a valid shipping address."
        });
    }


    // =============================================
    // NORMALIZE CUSTOMER INPUT
    //
    // This does NOT make unsafe HTML safe.
    // Customer values must still NEVER be inserted
    // into raw innerHTML.
    // =============================================

    const cleanAddressValue = (
        value,
        maxLength
    ) => {

        return String(value ?? "")
            .replace(
                /[\u0000-\u001F\u007F]/g,
                ""
            )
            .trim()
            .slice(0, maxLength);
    };


    const firstName =
        cleanAddressValue(
            shippingAddress.firstName,
            60
        );

    const lastName =
        cleanAddressValue(
            shippingAddress.lastName,
            60
        );

    const line1 =
        cleanAddressValue(
            shippingAddress.line1,
            120
        );

    const line2 =
        cleanAddressValue(
            shippingAddress.line2,
            120
        );

    const city =
        cleanAddressValue(
            shippingAddress.city,
            100
        );

    const state =
        cleanAddressValue(
            shippingAddress.state,
            2
        ).toUpperCase();

    const postalCode =
        cleanAddressValue(
            shippingAddress.postalCode,
            10
        ).toUpperCase();

    const country =
        cleanAddressValue(
            shippingAddress.country,
            2
        ).toUpperCase();


    // =============================================
    // REQUIRED FIELDS
    // =============================================

    if (
        !firstName ||
        !lastName ||
        !line1 ||
        !city ||
        !state ||
        !postalCode ||
        !country
    ) {

        return res.status(400).json({
            error:
                "Please complete your shipping address."
        });
    }


    // =============================================
    // CURRENT MTC FORM IS US-ONLY
    // =============================================

    if (country !== "US") {

        return res.status(400).json({
            error:
                "International shipping is currently unavailable."
        });
    }


    // =============================================
    // STATE FORMAT
    // =============================================

    if (!/^[A-Z]{2}$/.test(state)) {

        return res.status(400).json({
            error:
                "Please select a valid state."
        });
    }


    // =============================================
    // ZIP CODE FORMAT
    // =============================================

    if (!/^\d{5}(-\d{4})?$/.test(postalCode)) {

        return res.status(400).json({
            error:
                "Please enter a valid ZIP code."
        });
    }


    normalizedShippingAddress = {
        firstName,
        lastName,
        line1,
        line2,
        city,
        state,
        postalCode,
        country
    };


    // =============================================
// SHIPPING SETTINGS
// =============================================

// Domestic U.S. shipping is always enabled
const domesticShippingEnabled = true;

const internationalShippingEnabled =
    shippingRestrictionSettings
        .international_shipping_enabled === true;


const restrictedShippingLocations =
    Array.isArray(
        shippingRestrictionSettings
            .restricted_locations
    )
        ? shippingRestrictionSettings
            .restricted_locations
            .map(location =>
                String(location)
                    .trim()
                    .toUpperCase()
            )
            .filter(Boolean)
        : [];

    // =============================================
    // CHECK DOMESTIC SHIPPING
    // =============================================

    const isDomesticAddress =
        normalizedShippingAddress.country === "US";


    if (
        isDomesticAddress &&
        !domesticShippingEnabled
    ) {

        return res.status(400).json({
            error:
                "Domestic shipping is currently unavailable."
        });
    }


    // =============================================
    // CHECK INTERNATIONAL SHIPPING
    // =============================================

    if (
        !isDomesticAddress &&
        !internationalShippingEnabled
    ) {

        return res.status(400).json({
            error:
                "International shipping is currently unavailable."
        });
    }


    // =============================================
    // CHECK RESTRICTED LOCATIONS
    // =============================================

    const locationIsRestricted =
        restrictedShippingLocations.includes(
            normalizedShippingAddress.state
        ) ||
        restrictedShippingLocations.includes(
            normalizedShippingAddress.country
        );


    if (locationIsRestricted) {

        return res.status(400).json({
            error:
                "We're sorry, but we currently do not ship to this location."
        });
    }
}

        // =================================================
        // FINAL DISCOUNT VALIDATION
        // SERVER IS THE SOURCE OF TRUTH
        // =================================================

        let appliedDiscount = null;
        let discountAmount = 0;


        const normalizedDiscountCode =
            String(discountCode || "")
                .trim()
                .toUpperCase();


        if (normalizedDiscountCode) {

            const discountResult =
                await validateStoreDiscount(
                    normalizedDiscountCode,
                    subtotal
                );


            if (!discountResult.valid) {

                return res.status(
                    discountResult.serverError
                        ? 500
                        : 400
                ).json({
                    error:
                        discountResult.error
                });
            }


            appliedDiscount =
                discountResult.discount;


            discountAmount =
                Number(
                    appliedDiscount.amount || 0
                );
        }

        // =================================================
        // CREATE PENDING ORDER IN SUPABASE
        // =================================================
        const { data: newOrder, error: orderError } = await supabase
            .from("Orders")
            .insert({
                subtotal: subtotal,

                shipping_amount: shippingAmount,

                tax_amount: 0,

                discount_amount: discountAmount,

                payment_status: "pending",

                order_status: "Pending",
            })
            .select("id, order_id")
            .single();

        if (orderError) {
            console.error("❌ ORDER CREATE ERROR:", orderError);

            return res.status(500).json({
                error: "Unable to create order.",
            });
        }

        console.log("✅ PENDING ORDER CREATED:", newOrder.order_id);

        // =================================================
        // BUILD ORDER ITEMS
        // =================================================
        const orderItems = [];

        for (const cartItem of cart) {
            const product = products.find((item) => String(item.id) === String(cartItem.productId));

            if (!product) {
                throw new Error("Product missing while creating order items.");
            }

            let variant = null;

            if (cartItem.variantId) {
                variant = variants.find((item) => String(item.id) === String(cartItem.variantId));
            }

            const quantity = Math.max(1, Number(cartItem.quantity || 1));

            const price = variant ? Number(variant.price || 0) : Number(product.price || 0);

            orderItems.push({
                // Internal Orders UUID
                order_id: newOrder.id,

                // Customer-facing MTC order number
                order_number: newOrder.order_id,

                product_id: product.id,

                variant_id: variant ? variant.id : null,

                product_name: product.product_name,

                sku: variant?.sku || product.sku || null,

                item_quantity: quantity,

                unit_price: price,

                total_price: Number((price * quantity).toFixed(2)),
            });
        }

        // =================================================
        // INSERT ORDER ITEMS
        // =================================================
        const { error: orderItemsError } = await supabase.from("Order_items").insert(orderItems);

        if (orderItemsError) {
            console.error("❌ ORDER ITEMS CREATE ERROR:", orderItemsError);

            // Remove the pending order because checkout
            // could not be built correctly.
            await supabase.from("Orders").delete().eq("id", newOrder.id);

            return res.status(500).json({
                error: "Unable to create order items.",
            });
        }

// =================================================
// CREATE STRIPE DISCOUNT
// =================================================

let stripeDiscounts = [];

if (
    appliedDiscount &&
    discountAmount > 0
) {
    const couponData = {
        duration: "once",

        name:
            appliedDiscount.code,

        metadata: {
            mtc_discount_id:
                String(appliedDiscount.id),

            mtc_discount_code:
                String(appliedDiscount.code),
        },
    };


    // =============================================
    // PERCENTAGE DISCOUNT
    // =============================================

    if (
        appliedDiscount.type ===
        "percentage"
    ) {
        couponData.percent_off =
            Number(
                appliedDiscount.value
            );
    }


    // =============================================
    // FIXED DOLLAR DISCOUNT
    // =============================================

    else if (
        appliedDiscount.type ===
        "fixed"
    ) {
        couponData.amount_off =
            Math.round(
                discountAmount * 100
            );

        couponData.currency =
            "usd";
    }


    // =============================================
    // CREATE STRIPE COUPON
    // =============================================

    const stripeCoupon =
        await stripe.coupons.create(
            couponData
        );


    stripeDiscounts = [
        {
            coupon:
                stripeCoupon.id,
        },
    ];
}

// =================================================
// LOCAL PICKUP TAX
// =================================================

let checkoutLineItems = lineItems;
let checkoutDiscounts = stripeDiscounts;
let pickupTaxCents = 0;
let pickupTaxCalculationId = "";
if (isLocalPickup) {

    const units = lineItems.flatMap(item =>
        Array.from({ length: item.quantity }, () => ({
            product_data: item.price_data.product_data,
            cents: item.price_data.unit_amount
        }))
    );

    if (units.length > 99) {
        return res.status(400).json({
            error: "Local Pickup cart exceeds the supported item limit."
        });
    }

    const totalCents = units.reduce(
        (sum, item) => sum + item.cents,
        0
    );

    const discountCents = Math.min(
        totalCents,
        Math.max(0, Math.round(discountAmount * 100))
    );

    let remainingDiscount = discountCents;
    let remainingSubtotal = totalCents;

    for (const unit of units) {

        const share = remainingSubtotal > 0
            ? Math.min(
                unit.cents,
                Math.floor(
                    remainingDiscount *
                    unit.cents /
                    remainingSubtotal
                )
            )
            : 0;

        unit.cents -= share;
        remainingDiscount -= share;
        remainingSubtotal -= unit.cents + share;
    }

    for (const unit of units) {

        if (remainingDiscount <= 0) break;

        const share = Math.min(
            unit.cents,
            remainingDiscount
        );

        unit.cents -= share;
        remainingDiscount -= share;
    }

    const taxableUnits = units.filter(
        unit => unit.cents > 0
    );

    if (!taxableUnits.length) {
        return res.status(400).json({
            error: "Checkout total must be greater than zero."
        });
    }

    const pickupCalculation =
        await stripe.tax.calculations.create({

            currency: "usd",

            line_items: taxableUnits.map(
                (unit, index) => ({
                    amount: unit.cents,
                    quantity: 1,
                    reference: `pickup-${index}`
                })
            ),

            customer_details: {
                address: {
                    line1: "5601 S Pennsylvania Ave",
                    city: "Cudahy",
                    state: "WI",
                    postal_code: "53110",
                    country: "US"
                },

                address_source: "shipping"
            }
        });

    pickupTaxCents =
        Number(pickupCalculation.tax_amount_exclusive || 0) +
        Number(pickupCalculation.tax_amount_inclusive || 0);
        pickupTaxCalculationId = pickupCalculation.id;
    checkoutLineItems = taxableUnits.map(unit => ({
        price_data: {
            currency: "usd",
            product_data: unit.product_data,
            unit_amount: unit.cents
        },
        quantity: 1
    }));

    if (pickupTaxCents > 0) {

        checkoutLineItems.push({
            price_data: {
                currency: "usd",
                product_data: {
                    name: "Local Pickup Sales Tax"
                },
                unit_amount: pickupTaxCents
            },
            quantity: 1
        });
    }

    checkoutDiscounts = [];
}

let stripeShippingCustomerId = null;

if (!isLocalPickup && normalizedShippingAddress) {
    const address = normalizedShippingAddress;

    const customer = await stripe.customers.create({
        name: `${address.firstName} ${address.lastName}`.trim(),
        shipping: {
            name: `${address.firstName} ${address.lastName}`.trim(),
            address: {
                line1: address.line1,
                line2: address.line2 || undefined,
                city: address.city,
                state: address.state,
                postal_code: address.postalCode,
                country: address.country
            }
        },
        metadata: {
            mtc_order_id: String(newOrder.order_id)
        }
    });

    stripeShippingCustomerId = customer.id;
}

// =================================================
// CREATE STRIPE CHECKOUT
// =================================================

const session = await stripe.checkout.sessions.create({
    mode: "payment",

    ...(stripeShippingCustomerId
        ? {
            customer: stripeShippingCustomerId,
            customer_update: {
                shipping: "auto"
            }
        }
        : {}),

    payment_method_types: ["card"],

    line_items: checkoutLineItems,

    discounts: checkoutDiscounts,

    phone_number_collection: {
        enabled: true,
    },

    automatic_tax: {
        enabled: !isLocalPickup,
    },

    ...(!isLocalPickup
        ? {
            shipping_address_collection: {
                allowed_countries: ["US"],
            },
        }
        : {}),

    shipping_options: [
        {
            shipping_rate_data: {
                type: "fixed_amount",

                fixed_amount: {
                    amount: Math.round(shippingAmount * 100),
                    currency: "usd",
                },

                display_name:
                    selectedShippingMethod.is_local_pickup === true ||
                    selectedShippingMethod.id === "local-pickup"
                        ? "Local Pickup"
                        : shippingAmount === 0
                            ? "Free Shipping"
                            : selectedShippingMethod.name,
            },
        },
    ],

            // =================================================
            // MTC ORDER IDENTIFICATION + SHIPPING ADDRESS
            // =================================================
            metadata: {
    store: "Midwest Toy Connections",
                pickup_tax_calculation_id: pickupTaxCalculationId,
    pickup_tax_cents: String(pickupTaxCents),

    checkout_type: "store",

                // Customer-facing order number
                order_id:
                    String(newOrder.order_id),

                // Internal Supabase UUID
                order_uuid:
                    String(newOrder.id),

                // Discount used for this order
                discount_id:
                    appliedDiscount
                        ? String(appliedDiscount.id)
                        : "",

                discount_code:
                    appliedDiscount
                        ? String(appliedDiscount.code)
                        : "",

                // Selected shipping method
                shipping_method_id:
                    String(selectedShippingMethod.id),

                shipping_method_name:
                    String(selectedShippingMethod.name),

                // Server-validated MTC shipping address
                shipping_first_name:
                    normalizedShippingAddress?.firstName || "",

                shipping_last_name:
                    normalizedShippingAddress?.lastName || "",

                shipping_address_line1:
                    normalizedShippingAddress?.line1 || "",

                shipping_address_line2:
                    normalizedShippingAddress?.line2 || "",

                shipping_city:
                    normalizedShippingAddress?.city || "",

                shipping_state:
                    normalizedShippingAddress?.state || "",

                shipping_postal_code:
                    normalizedShippingAddress?.postalCode || "",

                shipping_country:
                    normalizedShippingAddress?.country || "",
            },
            
            // =================================================
            // SUCCESS & CANCEL
            // =================================================
            success_url: "https://midwest-tc.github.io/Midwest-Toy-Connections-Website/mw-payment-success.html?session_id={CHECKOUT_SESSION_ID}",

            cancel_url: "https://midwest-tc.github.io/Midwest-Toy-Connections-Website/mw-shoppingcart.html",
                });

        // =================================================
        // SAVE STRIPE SESSION ID
        // =================================================
        const { error: sessionUpdateError } = await supabase
            .from("Orders")
            .update({
                stripe_session_id: session.id,
            })
            .eq("id", newOrder.id);

        if (sessionUpdateError) {
            console.error("⚠️ STRIPE SESSION SAVE ERROR:", sessionUpdateError);
        }

        console.log("✅ MTC CHECKOUT CREATED:", session.id, "| ORDER:", newOrder.order_id);

        // =================================================
        // SEND STRIPE URL TO FRONTEND
        // =================================================
        res.json({
            url: session.url,
        });
    } catch (error) {
        console.error("❌ MTC CHECKOUT ERROR:", error);

        res.status(500).json({
            error: error.message,
        });
    }
});

async function sendOrderConfirmationEmail({ email, customerName, orderNumber, orderId }) {
    // =====================================================
    // LOAD ORDER
    // =====================================================

    const { data: order, error: orderError } = await supabase
        .from("Orders")
        .select(
            `
            id,
            order_id,
            customer_id,
            customer_name,
            customer_email,
            subtotal,
            shipping_amount,
            tax_amount,
            discount_amount,
            payment_status,
            order_status,
            created_at
        `
        )
        .eq("id", orderId)
        .single();

    if (orderError) {
        throw orderError;
    }

    // =====================================================
    // LOAD ORDER ITEMS
    // =====================================================

    const { data: orderItems, error: orderItemsError } = await supabase
        .from("Order_items")
        .select(
            `
            product_name,
            sku,
            item_quantity,
            unit_price,
            total_price
        `
        )
        .eq("order_id", orderId);

    if (orderItemsError) {
        throw orderItemsError;
    }

    // =====================================================
    // LOAD SHIPPING INFORMATION
    // =====================================================

    const { data: shipping, error: shippingError } = await supabase
        .from("Shipping")
        .select(
            `
            shipping_method,
            shipping_cost,
            shipping_status,
            carrier,
            tracking_number
        `
        )
        .eq("order_id", orderId)
        .maybeSingle();

    if (shippingError) {
        console.error("ORDER EMAIL SHIPPING ERROR:", shippingError);
    }

    // =====================================================
    // LOAD SHIPPING ADDRESS
    // =====================================================

    let shippingAddress = null;

    if (order.customer_id) {
        const { data: addressData, error: addressError } = await supabase
            .from("Addresses")
            .select(
                `
                first_name,
                last_name,
                address_line_1,
                address_line_2,
                city,
                state,
                postal_code,
                country,
                phone
            `
            )
            .eq("customer_id", order.customer_id)
            .eq("address_type", "shipping")
            .order("updated_at", {
                ascending: false,
            })
            .limit(1)
            .maybeSingle();

        if (addressError) {
            console.error("ORDER EMAIL ADDRESS ERROR:", addressError);
        } else {
            shippingAddress = addressData;
        }
    }

    // =====================================================
    // FORMAT MONEY
    // =====================================================

    const formatMoney = (value) =>
        Number(value || 0).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
        });

    // =====================================================
    // FORMAT ORDER ITEMS
    // =====================================================

    const itemsText = (orderItems || [])
        .map((item) => {
            const quantity = Number(item.item_quantity || 0);

            const unitPrice = Number(item.unit_price || 0);

            const lineTotal = item.total_price != null ? Number(item.total_price) : quantity * unitPrice;

            return `${item.product_name || "Product"}
SKU: ${item.sku || "—"}
Quantity: ${quantity}
Price: ${formatMoney(unitPrice)}
Total: ${formatMoney(lineTotal)}`;
        })
        .join("\n\n");

    // =====================================================
    // FORMAT SHIPPING ADDRESS
    // =====================================================

    const addressLines = [];

    if (shippingAddress) {
        const shippingName = [shippingAddress.first_name, shippingAddress.last_name].filter(Boolean).join(" ");

        if (shippingName) {
            addressLines.push(shippingName);
        }

        if (shippingAddress.address_line_1) {
            addressLines.push(shippingAddress.address_line_1);
        }

        if (shippingAddress.address_line_2) {
            addressLines.push(shippingAddress.address_line_2);
        }

        const cityStatePostal = [shippingAddress.city, shippingAddress.state, shippingAddress.postal_code]
            .filter(Boolean)
            .join(", ")
            .replace(/,\s([^,]+)$/, " $1");

        if (cityStatePostal) {
            addressLines.push(cityStatePostal);
        }

        if (shippingAddress.country) {
            addressLines.push(shippingAddress.country);
        }
    }

    const shippingAddressText = addressLines.length > 0 ? addressLines.join("\n") : "Shipping address unavailable";

    // =====================================================
    // ORDER TOTAL
    // =====================================================

    const subtotal = Number(order.subtotal || 0);

    const shippingAmount = Number(order.shipping_amount || 0);

    const taxAmount = Number(order.tax_amount || 0);

    const discountAmount = Number(order.discount_amount || 0);

    const orderTotal = subtotal + shippingAmount + taxAmount - discountAmount;

    // =====================================================
    // FORMAT ORDER DATE
    // =====================================================

    const orderDate = order.created_at
        ? new Date(order.created_at).toLocaleString("en-US", {
              timeZone: "America/Chicago",
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
          })
        : "—";

    // =====================================================
    // EMAIL
    // =====================================================

    const emailSubject = `Your Midwest Toy Connections Order ${orderNumber}`;

    const message = `Hi ${customerName || "Customer"},

Thank you for your order from Midwest Toy Connections!

ORDER INFORMATION
--------------------------------
Order Number: ${orderNumber}
Order Date: ${orderDate}
Payment Status: ${order.payment_status || "Paid"}
Order Status: ${order.order_status || "Pending"}

ITEMS PURCHASED
--------------------------------
${itemsText || "No order items found."}

SHIPPING INFORMATION
--------------------------------
Shipping Method: ${shipping?.shipping_method || "Standard Shipping"}
Shipping Status: ${shipping?.shipping_status || "Not Shipped"}

SHIPPING TO
--------------------------------
${shippingAddressText}

ORDER SUMMARY
--------------------------------
Subtotal: ${formatMoney(subtotal)}
Shipping: ${formatMoney(shippingAmount)}
Tax: ${formatMoney(taxAmount)}
Discount: -${formatMoney(discountAmount)}

TOTAL: ${formatMoney(orderTotal)}

You can track your order using order number ${orderNumber} and the email address used during checkout.

Thank you for shopping with Midwest Toy Connections!`;

    // =====================================================
    // SEND THROUGH EMAILJS
    // =====================================================

    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",

        headers: {
            "Content-Type": "application/json",
        },

        body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,

            template_id: EMAILJS_TEMPLATE_ID,

            user_id: EMAILJS_PUBLIC_KEY,

            accessToken: EMAILJS_PRIVATE_KEY,

            template_params: {
                to_email: email,

                customer_name: customerName || "Customer",

                order_number: orderNumber,

                email_subject: emailSubject,

                message: message,
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(`EmailJS failed: ${response.status} ${errorText}`);
    }
}

// =========================================================
// SEND REFUND EMAIL
// =========================================================
async function sendRefundEmail({
    email,
    customerName,
    orderNumber,
    orderId,
    refundAmount,
    totalRefunded,
    remainingAmount,
    fullyRefunded,
}) {
    const cleanRefundAmount = Number(refundAmount) || 0;
    const cleanTotalRefunded = Number(totalRefunded) || 0;
    const cleanRemainingAmount = Number(remainingAmount) || 0;

    const refundStatus = fullyRefunded ? "Full Refund" : "Partial Refund";

    // =====================================================
    // LOAD ORIGINAL ORDER
    // =====================================================

    const { data: order, error: orderError } = await supabase
        .from("Orders")
        .select(
            `
            id,
            order_id,
            customer_id,
            customer_name,
            customer_email,
            subtotal,
            shipping_amount,
            tax_amount,
            discount_amount,
            created_at
        `
        )
        .eq("id", orderId)
        .single();

    if (orderError) {
        throw orderError;
    }

    // =====================================================
    // LOAD ORDER ITEMS
    // =====================================================

    const { data: orderItems, error: orderItemsError } = await supabase
        .from("Order_items")
        .select(
            `
                product_name,
                sku,
                item_quantity,
                unit_price,
                total_price
            `
        )
        .eq("order_id", orderId);

    if (orderItemsError) {
        throw orderItemsError;
    }

    // =====================================================
    // LOAD SHIPPING INFORMATION
    // =====================================================

    const { data: shipping, error: shippingError } = await supabase
        .from("Shipping")
        .select(
            `
                shipping_method,
                shipping_status,
                carrier,
                tracking_number
            `
        )
        .eq("order_id", orderId)
        .maybeSingle();

    if (shippingError) {
        console.error("REFUND EMAIL SHIPPING ERROR:", shippingError);
    }

    // =====================================================
    // LOAD SHIPPING ADDRESS
    // =====================================================

    let shippingAddress = null;

    if (order.customer_id) {
        const { data: addressData, error: addressError } = await supabase
            .from("Addresses")
            .select(
                `
                first_name,
                last_name,
                address_line_1,
                address_line_2,
                city,
                state,
                postal_code,
                country,
                phone
            `
            )
            .eq("customer_id", order.customer_id)
            .eq("address_type", "shipping")
            .order("updated_at", {
                ascending: false,
            })
            .limit(1)
            .maybeSingle();

        if (addressError) {
            console.error("REFUND EMAIL ADDRESS ERROR:", addressError);
        } else {
            shippingAddress = addressData;
        }
    }

    // =====================================================
    // MONEY FORMATTER
    // =====================================================

    const formatMoney = (value) =>
        Number(value || 0).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
        });

    // =====================================================
    // ORDER ITEMS
    // =====================================================

    const itemsText = (orderItems || [])
        .map((item) => {
            const quantity = Number(item.item_quantity || 1);

            const unitPrice = Number(item.unit_price || 0);

            const lineTotal = item.total_price != null ? Number(item.total_price) : quantity * unitPrice;

            return `${item.product_name || "Product"}
SKU: ${item.sku || "—"}
Quantity: ${quantity}
Price: ${formatMoney(unitPrice)}
Item Total: ${formatMoney(lineTotal)}`;
        })
        .join("\n\n");

    // =====================================================
    // SHIPPING ADDRESS
    // =====================================================

    const addressLines = [];

    if (shippingAddress) {
        const shippingName = [shippingAddress.first_name, shippingAddress.last_name].filter(Boolean).join(" ");

        if (shippingName) {
            addressLines.push(shippingName);
        }

        if (shippingAddress.address_line_1) {
            addressLines.push(shippingAddress.address_line_1);
        }

        if (shippingAddress.address_line_2) {
            addressLines.push(shippingAddress.address_line_2);
        }

        const cityStateZip = [shippingAddress.city, shippingAddress.state, shippingAddress.postal_code]
            .filter(Boolean)
            .join(", ")
            .replace(/,\s([^,]+)$/, " $1");

        if (cityStateZip) {
            addressLines.push(cityStateZip);
        }

        if (shippingAddress.country) {
            addressLines.push(shippingAddress.country);
        }
    }

    const shippingAddressText = addressLines.length ? addressLines.join("\n") : "Shipping address unavailable";

    // =====================================================
    // ORDER TOTALS
    // =====================================================

    const subtotal = Number(order.subtotal || 0);

    const shippingAmount = Number(order.shipping_amount || 0);

    const taxAmount = Number(order.tax_amount || 0);

    const discountAmount = Number(order.discount_amount || 0);

    const originalTotal = subtotal + shippingAmount + taxAmount - discountAmount;

    // =====================================================
    // ORDER DATE
    // =====================================================

    const orderDate = order.created_at
        ? new Date(order.created_at).toLocaleString("en-US", {
              timeZone: "America/Chicago",
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
          })
        : "—";

    // =====================================================
    // EMAIL SUBJECT
    // =====================================================

    const emailSubject = fullyRefunded
        ? `Full Refund Processed for Order ${orderNumber}`
        : `Partial Refund Processed for Order ${orderNumber}`;

    // =====================================================
    // EMAIL MESSAGE
    // =====================================================

    const message = `Hi ${customerName || "Customer"},

Your ${fullyRefunded ? "full" : "partial"} refund has been processed for order ${orderNumber}.

REFUND DETAILS
--------------------------------
Refund Status: ${refundStatus}
Refunded Now: ${formatMoney(cleanRefundAmount)}
Total Refunded: ${formatMoney(cleanTotalRefunded)}
Remaining Order Total: ${formatMoney(cleanRemainingAmount)}

The refund has been sent back to your original payment method.

ORDER INFORMATION
--------------------------------
Order Number: ${orderNumber}
Order Date: ${orderDate}

ITEMS PURCHASED
--------------------------------
${itemsText || "No order items found."}

SHIPPING INFORMATION
--------------------------------
Shipping Method: ${shipping?.shipping_method || "Standard Shipping"}
Shipping Status: ${shipping?.shipping_status || "Not Shipped"}

SHIPPING TO
--------------------------------
${shippingAddressText}

ORDER SUMMARY
--------------------------------
Subtotal: ${formatMoney(subtotal)}
Shipping: ${formatMoney(shippingAmount)}
Tax: ${formatMoney(taxAmount)}
Discount: -${formatMoney(discountAmount)}

Original Total: ${formatMoney(originalTotal)}

REFUND SUMMARY
--------------------------------
Refunded Now: ${formatMoney(cleanRefundAmount)}
Total Refunded: ${formatMoney(cleanTotalRefunded)}
Remaining: ${formatMoney(cleanRemainingAmount)}

Please allow several business days for your bank or card provider to post the refund.

If you have any questions about your refund, please contact us through our Contact Us page.

Thank you for shopping with Midwest Toy Connections!`;

    // =====================================================
    // SEND EMAILJS
    // =====================================================

    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",

        headers: {
            "Content-Type": "application/json",
        },

        body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,

            template_id: EMAILJS_TEMPLATE_ID,

            user_id: EMAILJS_PUBLIC_KEY,

            accessToken: EMAILJS_PRIVATE_KEY,

            template_params: {
                to_email: email,

                customer_name: customerName || "Customer",

                order_number: orderNumber,

                email_subject: emailSubject,

                message: message,
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(`EmailJS refund failed: ${response.status} ${errorText}`);
    }
}
// =========================================================
// SEND CUSTOMER REPLY EMAIL
// =========================================================
async function sendCustomerReplyEmail({ email, customerName, subject, replyMessage }) {
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",

        headers: {
            "Content-Type": "application/json",
        },

        body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,

            template_id: EMAILJS_REPLY_TEMPLATE_ID,

            user_id: EMAILJS_PUBLIC_KEY,

            accessToken: EMAILJS_PRIVATE_KEY,

            template_params: {
                email: email,

                name: "Midwest Toy Connections",

                customer_name: customerName || "Customer",

                subject: subject || "Your Message",

                message: `${replyMessage}

------------------------------

PLEASE DO NOT REPLY TO THIS EMAIL.

This email address is not monitored for replies.

If you need further assistance, please submit a new message through the Midwest Toy Connections Contact Form.`,
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(`EmailJS reply failed: ${response.status} ${errorText}`);
    }
}

// =========================================================
// TRACK ORDER
// =========================================================
app.post("/track-order", async (req, res) => {
    try {
        const { orderNumber, email } = req.body;

        if (!orderNumber || !email) {
            return res.status(400).json({
                error: "Order number and email are required.",
            });
        }

        const { data: order, error: orderError } = await supabase
            .from("Orders")
            .select(
                `
          id,
          order_id,
          customer_email,
          customer_name,
          payment_status,
          order_status,
          created_at
      `
            )
            .ilike("order_id", orderNumber.trim())
            .ilike("customer_email", email.trim())
            .maybeSingle();

        if (orderError) {
            throw orderError;
        }

        if (!order) {
            return res.status(404).json({
                error: "Order not found. Check your order number and email.",
            });
        }

        const { data: shipping, error: shippingError } = await supabase
            .from("Shipping")
            .select(
                `
        shipping_method,
        carrier,
        tracking_number,
        shipping_cost,
        shipping_status,
        shipped_at,
        delivered_at
      `
            )
            .eq("order_id", order.id)
            .maybeSingle();

        if (shippingError) {
            throw shippingError;
        }

        res.json({
            success: true,

            order: {
                orderNumber: order.order_id,

                orderStatus: order.order_status,

                paymentStatus: order.payment_status,

                createdAt: order.created_at,

                shipping: shipping || null,
            },
        });
    } catch (error) {
        console.error("❌ TRACK ORDER ERROR:", error);

        res.status(500).json({
            error: "Unable to track order.",
        });
    }
});

// =========================================================
// START SERVER
// =========================================================
const PORT = process.env.PORT || 3000;

// =================================================
// AUTOMATIC PAYPAL TAX RETRIES
// =================================================

let paypalTaxRetryRunning = false;

async function processPendingPayPalTaxRetries() {
    if (paypalTaxRetryRunning) return;

    paypalTaxRetryRunning = true;

    try {
        const cutoff = new Date(
            Date.now() - 20 * 60 * 60 * 1000
        ).toISOString();

        const { data: orders, error } = await supabase
            .from("Orders")
            .select("id, order_id")
            .eq("payment_status", "Paid")
            .eq("paypal_tax_recorded", false)
            .not("paypal_tax_calculation_id", "is", null)
            .gte("created_at", cutoff)
            .order("created_at", { ascending: true })
            .limit(20);

        if (error) throw error;

        for (const order of orders || []) {
            try {
                await retryPayPalTaxRecording(order.id);
            } catch (retryError) {
                console.error(
                    "❌ PAYPAL TAX RETRY FAILED:",
                    order.order_id,
                    retryError
                );
            }
        }
    } catch (error) {
        console.error("PAYPAL TAX RETRY ERROR:", error);
    } finally {
        paypalTaxRetryRunning = false;
    }
}

setInterval(
    processPendingPayPalTaxRetries,
    5 * 60 * 1000
);

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 MTC backend running on port ${PORT}`);
});
