// =========================================
// SUPABASE CLIENT
// =========================================
const SUPABASE_URL = "https://ujwelweqqjyzknssqgtn.supabase.co";
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqd2Vsd2VxcWp5emtuc3NxZ3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxOTQwNDgsImV4cCI6MjEwMjc3MDA0OH0.oqVIrfixxHzukjYSAB8VP8pprSL8wCq21MmqdiyyvTM";
const adminSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
/* =========================================
   ADMIN XSS PROTECTION HELPERS
========================================= */

function escapeAdminHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function safeAdminURL(value) {
    if (!value) {
        return "";
    }

    try {
        const url = new URL(String(value), window.location.origin);

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return "";
        }

        return url.href;
    } catch {
        return "";
    }
}

// =========================================
// ADMIN INACTIVITY TIMEOUT
// =========================================

let adminInactivityTimer = null;

let adminSessionTimeoutMinutes = null;

function clearAdminInactivityTimer() {
    if (adminInactivityTimer) {
        clearTimeout(adminInactivityTimer);

        adminInactivityTimer = null;
    }
}

// =========================================
// LOG OUT INACTIVE ADMIN
// =========================================

async function logoutInactiveAdmin() {
    console.log("ADMIN SESSION EXPIRED DUE TO INACTIVITY");

    clearAdminInactivityTimer();

    localStorage.removeItem("mtcAdminRememberMe");

    sessionStorage.removeItem("mtcAdminSessionOnly");

    try {
        await adminSupabase.auth.signOut({
            scope: "local",
        });
    } catch (error) {
        console.error("INACTIVITY SIGN OUT ERROR:", error);
    }

    // Force browser back to Admin Login
    window.location.href = "mtc-admin-login.html";
}

// =========================================
// RESET ADMIN INACTIVITY TIMER
// =========================================

function resetAdminInactivityTimer() {
    if (!adminSessionTimeoutMinutes || adminSessionTimeoutMinutes <= 0) {
        return;
    }

    clearAdminInactivityTimer();

    const timeoutMilliseconds = adminSessionTimeoutMinutes * 60 * 1000;

    adminInactivityTimer = setTimeout(logoutInactiveAdmin, timeoutMilliseconds);
}

// =========================================
// PROTECT ALL ADMIN PAGES
// =========================================
document.addEventListener("DOMContentLoaded", async () => {
    const currentPage = window.location.pathname.split("/").pop();

    // Do NOT protect the login page
    if (currentPage === "mtc-admin-login.html") {
        return;
    }

    // Only run on admin pages
    if (!currentPage.startsWith("mtc-admin-")) {
        return;
    }

    // =========================================
    // REMEMBER ME / SESSION ONLY
    // =========================================
    const rememberAdmin = localStorage.getItem("mtcAdminRememberMe") === "true";

    const sessionOnlyAdmin = sessionStorage.getItem("mtcAdminSessionOnly") === "true";

    if (!rememberAdmin && !sessionOnlyAdmin) {
        await adminSupabase.auth.signOut();

        window.location.replace("mtc-admin-login.html");

        return;
    }

    // =========================================
    // LOAD ADMIN SESSION TIMEOUT
    // =========================================

    const { data: securitySettings, error: securitySettingsError } = await adminSupabase
        .from("Admin_Security_Settings")
        .select("session_timeout_minutes")
        .limit(1)
        .maybeSingle();

    if (securitySettingsError || !securitySettings) {
        console.error("ADMIN SESSION TIMEOUT LOAD ERROR:", securitySettingsError);

        return;
    }

    adminSessionTimeoutMinutes = Number(securitySettings.session_timeout_minutes);

    resetAdminInactivityTimer();

    // =========================================
    // RESET TIMEOUT ON ADMIN ACTIVITY
    // =========================================

    const adminActivityEvents = ["mousedown", "keydown", "scroll", "touchstart"];

    adminActivityEvents.forEach((eventName) => {
        document.addEventListener(eventName, resetAdminInactivityTimer, {
            passive: true,
        });
    });

    // =========================================
    // UPDATE ADMIN LAST LOGIN
    // =========================================

    // =========================================
    // CHECK AUTHENTICATED USER
    // =========================================
    const {
        data: { user },
        error: userError,
    } = await adminSupabase.auth.getUser();

    if (userError || !user) {
        window.location.replace("mtc-admin-login.html");

        return;
    }

    // =========================================
    // VERIFY ACTIVE MTC ADMIN SESSION
    // =========================================
    const { data: sessionData } = await adminSupabase.auth.getSession();

    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
        window.location.replace("mtc-admin-login.html");

        return;
    }

    const activeSessionResponse = await fetch("https://mtc-backend-node-production.up.railway.app/admin-active-sessions", {
        method: "GET",

        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    console.log("ACTIVE SESSION CHECK STATUS:", activeSessionResponse.status);

    if (activeSessionResponse.status === 401) {
        await adminSupabase.auth.signOut({
            scope: "local",
        });

        localStorage.removeItem("mtcAdminRememberMe");

        sessionStorage.removeItem("mtcAdminSessionOnly");

        window.location.replace("mtc-admin-login.html");

        return;
    }

    // =========================================
    // CHECK ADMIN ACCESS
    // =========================================
    const { data: isAdmin, error: adminError } = await adminSupabase.rpc("is_admin");

    if (adminError || isAdmin !== true) {
        await adminSupabase.auth.signOut();

        window.location.replace("mtc-admin-login.html");

        return;
    }
    setInterval(async () => {
        const { data: sessionData } = await adminSupabase.auth.getSession();

        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) {
            return;
        }

        const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-active-sessions", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (response.status === 401) {
            await adminSupabase.auth.signOut({
                scope: "local",
            });

            localStorage.removeItem("mtcAdminRememberMe");

            sessionStorage.removeItem("mtcAdminSessionOnly");

            window.location.replace("mtc-admin-login.html");
        }
    }, 5000);

    // Authentication passed
    document.documentElement.style.visibility = "visible";
});
// =========================================
// ADMIN SIGN OUT - ALL ADMIN PAGES
// =========================================
document.addEventListener("DOMContentLoaded", () => {
    const logoutButtons = document.querySelectorAll(".mw-dashboard-logout-link");

    logoutButtons.forEach((logoutButton) => {
        logoutButton.addEventListener("click", async (event) => {
            event.preventDefault();

            const { error } = await adminSupabase.auth.signOut({
                scope: "local",
            });

            if (error) {
                console.error("Logout error:", error);

                return;
            }

            window.location.href = "mtc-admin-login.html";
        });
    });
});

// =========================================
// ADMIN MOBILE SIDEBAR
// EVENTS + SETTINGS
// =========================================
document.addEventListener("DOMContentLoaded", () => {
    const sidebarSetups = [
        {
            button: ".mtc-admin-events-menu-button",
        },

        {
            button: ".mtc-admin-settings-menu-button",
        },

        {
            button: ".mtc-admin-reviews-menu-button",
        },

        {
            button: ".mtc-admin-subscribers-menu-button",
        },
    ];

    sidebarSetups.forEach((setup) => {
        const menuButton = document.querySelector(setup.button);

        const sidebar = document.querySelector(".mw-dashboard-sidebar");

        if (!menuButton || !sidebar) {
            return;
        }

        menuButton.addEventListener("click", (event) => {
            event.stopPropagation();

            sidebar.classList.toggle("mw-dashboard-sidebar-open");
        });
    });
});

// =========================================
// START OF MTC-ADMIN-LOGIN JS
// =========================================
document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("adminLoginForm");
    const rememberMe = document.getElementById("rememberMe");
    const loginPasswordInput = document.getElementById("adminPassword");
    const passwordToggle = document.getElementById("passwordToggle");

    if (loginPasswordInput && passwordToggle) {
        passwordToggle.addEventListener("click", () => {
            const isHidden = loginPasswordInput.type === "password";

            loginPasswordInput.type = isHidden ? "text" : "password";

            const icon = passwordToggle.querySelector("i");

            if (icon) {
                icon.classList.toggle("fa-eye", !isHidden);

                icon.classList.toggle("fa-eye-slash", isHidden);
            }

            passwordToggle.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
        });
    }
    const emailInput = document.getElementById("adminEmail");
    const passwordInput = document.getElementById("adminPassword");
    const loginError = document.getElementById("loginError");
    if (!loginForm) {
        return;
    }
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const shouldRemember = rememberMe?.checked || false;
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (loginError) {
            loginError.style.display = "none";
        }
        const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email: email,
                password: password,
            }),
        });

        const result = await response.json();

        if (!response.ok || result.success !== true) {
            if (loginError) {
                const errorText = loginError.querySelector("span");

                if (errorText) {
                    errorText.textContent = result.error || "Unable to log in.";
                }

                loginError.style.display = "flex";
            }

            return;
        }

        const { error: sessionError } = await adminSupabase.auth.setSession({
            access_token: result.session.access_token,
            refresh_token: result.session.refresh_token,
        });

        if (sessionError) {
            console.error("Admin session error:", sessionError);

            return;
        }

        if (shouldRemember) {
            localStorage.setItem("mtcAdminRememberMe", "true");

            sessionStorage.removeItem("mtcAdminSessionOnly");
        } else {
            localStorage.removeItem("mtcAdminRememberMe");

            sessionStorage.setItem("mtcAdminSessionOnly", "true");
        }

        window.location.href = "mtc-admin-dashboard.html";
    });
});
// =========================================
// END OF MTC-ADMIN-LOGIN JS
// =========================================

// =========================================
// START OF MTC-ADMIN-DASHBOARD JS
// =========================================
document.addEventListener("DOMContentLoaded", async () => {
    const isDashboardPage = window.location.pathname.endsWith("mtc-admin-dashboard.html");

    if (!isDashboardPage) {
        return;
    }

    const {
        data: { user },
        error: userError,
    } = await adminSupabase.auth.getUser();

    if (userError || !user) {
        window.location.replace("mtc-admin-login.html");

        return;
    }

    const { data: isAdmin, error: adminError } = await adminSupabase.rpc("is_admin");

    if (adminError || isAdmin !== true) {
        await adminSupabase.auth.signOut();

        window.location.replace("mtc-admin-login.html");

        return;
    }

    // Dashboard code continues below here

    // =========================================
    // DASHBOARD SIDEBAR
    // =========================================
    const menuToggle = document.getElementById("mwDashboardMenuToggle");
    const sidebar = document.querySelector(".mw-dashboard-sidebar");
    if (menuToggle && sidebar) {
        menuToggle.addEventListener("click", () => {
            sidebar.classList.toggle("mw-dashboard-sidebar-open");
        });
    }

    // =========================================
    // CLOSE SIDEBAR WHEN CLICKING RANDOMLY OUTSIDE OF IT
    // =========================================

    document.addEventListener("click", (event) => {
        const sidebarIsOpen = sidebar.classList.contains("mw-dashboard-sidebar-open");
        if (!sidebarIsOpen) {
            return;
        }
        const clickedInsideSidebar = sidebar.contains(event.target);
        const clickedMenuButton = menuToggle.contains(event.target);
        if (!clickedInsideSidebar && !clickedMenuButton) {
            sidebar.classList.remove("mw-dashboard-sidebar-open");
        }
    });

    // =========================================
    // DASHBOARD TOP STATS
    // SALES, ORDERS, CUSTOMERS, PRODUCTS,
    // REFUNDED ORDERS, TOTAL REFUNDED
    // =========================================
    async function loadDashboardStats() {
        const totalSalesElement = document.getElementById("mwDashboardTotalSales");

        const salesChartCanvas = document.getElementById("mwDashboardSalesChart");

        const salesRangeSelect = document.getElementById("mwDashboardSalesRange");

        const totalOrdersElement = document.getElementById("mwDashboardTotalOrders");

        const customerCountElement = document.getElementById("mwDashboardCustomerCount");

        const productCountElement = document.getElementById("mwDashboardProductCount");

        const refundedOrdersElement = document.getElementById("mwDashboardRefundedOrders");

        const totalRefundedElement = document.getElementById("mwDashboardTotalRefunded");

        // =========================================
        // GET ORDERS
        // =========================================

        const { data: orders, error: ordersError } = await adminSupabase.from("Orders").select(`
            id,
            subtotal,
            shipping_amount,
            tax_amount,
            discount_amount,
            payment_status
        `);

        // =========================================
        // GET PAYMENTS + REFUNDS
        // =========================================

        const { data: payments, error: paymentsError } = await adminSupabase.from("Payments").select(`
            order_id,
            refund_amount
        `);

        if (paymentsError) {
            console.error("Dashboard payments error:", paymentsError);
        }

        if (ordersError) {
            console.error("Dashboard sales error:", ordersError);
        } else {
            const allOrders = orders || [];

            const allPayments = payments || [];

            // =========================================
            // PAID ORDERS
            // =========================================

            const paidOrders = allOrders.filter(
                (order) =>
                    String(order.payment_status || "")
                        .trim()
                        .toLowerCase() === "paid"
            );

            // =========================================
            // TOTAL SALES AFTER REFUNDS
            // =========================================

            const totalSales = paidOrders.reduce((total, order) => {
                const subtotal = Number(order.subtotal || 0);

                const shipping = Number(order.shipping_amount || 0);

                const tax = Number(order.tax_amount || 0);

                const discount = Number(order.discount_amount || 0);

                const payment = allPayments.find((payment) => String(payment.order_id) === String(order.id));

                const refundedAmount = Number(payment?.refund_amount || 0);

                return total + subtotal + shipping + tax - discount - refundedAmount;
            }, 0);

            // =========================================
            // REFUNDED ORDERS COUNT
            // =========================================

            const refundedOrderIds = new Set(
                allPayments
                    .filter((payment) => Number(payment.refund_amount || 0) > 0)
                    .map((payment) => String(payment.order_id))
            );

            const refundedOrdersCount = refundedOrderIds.size;

            // =========================================
            // TOTAL REFUNDED
            // =========================================

            const totalRefunded = allPayments.reduce((total, payment) => total + Number(payment.refund_amount || 0), 0);

            // =========================================
            // DISPLAY TOTAL SALES
            // =========================================

            if (totalSalesElement) {
                totalSalesElement.textContent = totalSales.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                });
            }

            // =========================================
            // DISPLAY TOTAL ORDERS
            // =========================================

            if (totalOrdersElement) {
                totalOrdersElement.textContent = allOrders.length;
            }

            // =========================================
            // DISPLAY REFUNDED ORDERS
            // =========================================

            if (refundedOrdersElement) {
                refundedOrdersElement.textContent = refundedOrdersCount;
            }

            // =========================================
            // DISPLAY TOTAL REFUNDED
            // =========================================

            if (totalRefundedElement) {
                totalRefundedElement.textContent = totalRefunded.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                });
            }

            console.log("DASHBOARD PAID ORDERS:", paidOrders);

            console.log("DASHBOARD TOTAL SALES:", totalSales);

            console.log("DASHBOARD REFUNDED ORDERS:", refundedOrdersCount);

            console.log("DASHBOARD TOTAL REFUNDED:", totalRefunded);
        }

        // =========================================
        // GET CUSTOMERS
        // =========================================

        const { count: customerCount, error: customersError } = await adminSupabase.from("Customers").select("*", {
            count: "exact",
            head: true,
        });

        if (!customersError && customerCountElement) {
            customerCountElement.textContent = customerCount ?? 0;
        }

        // =========================================
        // GET PRODUCTS
        // =========================================

        const { count: productCount, error: productsError } = await adminSupabase
            .from("Products")
            .select("*", {
                count: "exact",
                head: true,
            })
            .eq("is_active", true);

        console.log("DASHBOARD PRODUCT COUNT:", productCount, productsError);

        if (!productsError && productCountElement) {
            productCountElement.textContent = productCount ?? 0;
        }
    }

    await loadDashboardStats();

    // =========================================
    // DASHBOARD RECENT ORDERS
    // =========================================

    async function loadRecentOrders() {
        const tableBody = document.getElementById("mwDashboardOrdersTableBody");

        if (!tableBody) {
            return;
        }

        const { data: orders, error } = await adminSupabase
            .from("Orders")
            .select(
                `
            order_id,
            customer_name,
            customer_email,
            subtotal,
            shipping_amount,
            tax_amount,
            discount_amount,
            order_status,
            created_at
            `
            )
            .order("created_at", {
                ascending: false,
            })
            .limit(5);

        if (error) {
            console.error("Recent orders error:", error);

            tableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    Unable to load orders.
                </td>
            </tr>
        `;

            return;
        }

        if (!orders || orders.length === 0) {
            tableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    No orders found.
                </td>
            </tr>
        `;

            return;
        }

        tableBody.innerHTML = orders
            .map((order) => {
                const customer = order.customer_name || order.customer_email || "Guest";

                const orderTotal =
                    Number(order.subtotal || 0) +
                    Number(order.shipping_amount || 0) +
                    Number(order.tax_amount || 0) -
                    Number(order.discount_amount || 0);

                const formattedTotal = orderTotal.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                });

                const formattedDate = new Date(order.created_at).toLocaleDateString("en-US");

                const status = String(order.order_status || "pending");

                const safeStatusClass = status.toLowerCase().replace(/[^a-z0-9_-]/g, "");

                return `
                        <tr>
                            <td>
                                ${escapeAdminHTML(order.order_id)}
                            </td>

                           <td>
                                ${escapeAdminHTML(customer)}
                            </td>

                            <td>
                                ${escapeAdminHTML(order.customer_email || "—")}
                            </td>

                            <td>
                                —
                            </td>

                            <td>
                                ${escapeAdminHTML(formattedDate)}
                            </td>

                            <td>
                                ${escapeAdminHTML(formattedTotal)}
                            </td>

                            <td>
                                <span
                                    class="
                                        mw-order-status
                                        mw-order-${safeStatusClass}
                                    "
                                >
                                    ${escapeAdminHTML(status)}
                                </span>
                            </td>
                        </tr>
                    `;
            })
            .join("");
    }

    await loadRecentOrders();

    // =========================================
    // DASHBOARD INVENTORY OVERVIEW
    // =========================================
    async function loadInventoryOverview() {
        const { data: products, error: productsError } = await adminSupabase
            .from("Products")
            .select(
                `
        id,
        category_id,
        Categories (
            name
        )
    `
            )
            .eq("is_active", true);
        const { data: inventory, error: inventoryError } = await adminSupabase
            .from("Inventory")
            .select("product_id, quantity");
        if (productsError || inventoryError) {
            console.error("Inventory overview error:", productsError || inventoryError);
            return;
        }
        const totals = {
            tradingCards: 0,
            toys: 0,
            games: 0,
        };
        products.forEach((product) => {
            const inventoryRow = inventory.find((item) => String(item.product_id) === String(product.id));
            const quantity = Number(inventoryRow?.quantity || 0);
            const categoryName = (product.Categories?.name || "").toLowerCase();

            if (categoryName.includes("tcg") || categoryName.includes("trading card")) {
                totals.tradingCards += quantity;
            } else if (
                categoryName.includes("figure") ||
                categoryName.includes("die-cast") ||
                categoryName.includes("building") ||
                categoryName.includes("collectible")
            ) {
                totals.toys += quantity;
            } else {
                totals.games += quantity;
            }
        });
        const highestTotal = Math.max(totals.tradingCards, totals.toys, totals.games, 1);

        // TRADING CARDS
        const tradingCardsCount = document.getElementById("mwDashboardTradingCardsCount");
        const tradingCardsProgress = document.getElementById("mwDashboardTradingCardsProgress");
        if (tradingCardsCount) {
            tradingCardsCount.textContent = `${totals.tradingCards} items`;
        }
        if (tradingCardsProgress) {
            tradingCardsProgress.style.width = `${(totals.tradingCards / highestTotal) * 100}%`;
        }

        // TOYS
        const toyCount = document.getElementById("mwDashboardToyCount");
        const toyProgress = document.getElementById("mwDashboardToyProgress");
        if (toyCount) {
            toyCount.textContent = `${totals.toys} items`;
        }
        if (toyProgress) {
            toyProgress.style.width = `${(totals.toys / highestTotal) * 100}%`;
        }

        // ACCESSORIES / OTHER INVENTORY
        const otherCount = document.getElementById("mwDashboardOtherCount");

        const otherProgress = document.getElementById("mwDashboardOtherProgress");

        if (otherCount) {
            otherCount.textContent = `${totals.games} items`;
        }

        if (otherProgress) {
            otherProgress.style.width = `${(totals.games / highestTotal) * 100}%`;
        }
    }
    await loadInventoryOverview();

    // =========================================
    // DASHBOARD UPCOMING EVENTS
    // =========================================
    async function loadUpcomingEvents() {
        const eventList = document.getElementById("mwDashboardEventList");

        if (!eventList) {
            return;
        }

        const { data: events, error } = await adminSupabase
            .from("Events")
            .select("*")
            .order("date", {
                ascending: true,
            })
            .limit(5);

        if (error) {
            console.error("Upcoming events error:", error);

            eventList.innerHTML = `
            <div class="mw-dashboard-loading">
                Unable to load events.
            </div>
        `;

            return;
        }

        if (!events || events.length === 0) {
            eventList.innerHTML = `
            <div class="mw-dashboard-loading">
                No upcoming events.
            </div>
        `;

            return;
        }

        eventList.innerHTML = events
            .map((event) => {
                const eventName = event.name || "Event";

                const eventDate = event.date
                    ? new Date(`${event.date}T00:00:00`).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                      })
                    : "Date TBD";

                let eventTime = "Time TBD";

                if (event.start_time) {
                    const time = new Date(`1970-01-01T${event.start_time}`);

                    eventTime = time.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                    });
                }

                return `
                <div class="mw-dashboard-event-item">
                    <div>
                        <strong>
                            ${escapeAdminHTML(eventName)}
                        </strong>

                        <span>
                            ${escapeAdminHTML(eventDate)}
                            •
                            ${escapeAdminHTML(eventTime)}
                        </span>

                        <span>
                            ${escapeAdminHTML(event.location || "Midwest Toy Connections")}
                        </span>
                    </div>
                </div>
            `;
            })
            .join("");
    }

    await loadUpcomingEvents();

    // =========================================
    // DASHBOARD SALES ANALYTICS CHART
    // =========================================
    let dashboardSalesChart = null;
    async function loadDashboardSalesChart(days = 30) {
        const salesChartCanvas = document.getElementById("mwDashboardSalesChart");

        if (!salesChartCanvas) return;

        const startDate = new Date();

        startDate.setDate(startDate.getDate() - (days - 1));

        startDate.setHours(0, 0, 0, 0);

        const { data: orders, error } = await adminSupabase
            .from("Orders")
            .select(
                `
                created_at,
                subtotal,
                shipping_amount,
                tax_amount,
                discount_amount,
                payment_status
            `
            )
            .eq("payment_status", "Paid")
            .gte("created_at", startDate.toISOString())
            .order("created_at", {
                ascending: true,
            });

        if (error) {
            console.error("Sales chart error:", error);
            return;
        }

        console.log("Sales chart orders:", orders);
        const salesByDate = {};

        for (let i = 0; i < days; i++) {
            const date = new Date(startDate);

            date.setDate(startDate.getDate() + i);

            const key = date.toISOString().split("T")[0];

            salesByDate[key] = 0;
        }

        orders.forEach((order) => {
            const orderDateObject = new Date(order.created_at);

            const orderDate = `${orderDateObject.getFullYear()}-${String(orderDateObject.getMonth() + 1).padStart(
                2,
                "0"
            )}-${String(orderDateObject.getDate()).padStart(2, "0")}`;

            const orderTotal =
                Number(order.subtotal || 0) +
                Number(order.shipping_amount || 0) +
                Number(order.tax_amount || 0) -
                Number(order.discount_amount || 0);

            if (salesByDate[orderDate] !== undefined) {
                salesByDate[orderDate] += orderTotal;
            }
        });

        const labels = Object.keys(salesByDate).map((date) => {
            return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
            });
        });

        const salesData = Object.values(salesByDate);

        if (dashboardSalesChart) {
            dashboardSalesChart.destroy();
        }

        dashboardSalesChart = new Chart(salesChartCanvas, {
            type: "line",

            data: {
                labels: labels,

                datasets: [
                    {
                        label: "Sales",
                        data: salesData,
                        borderWidth: 3,
                        tension: 0.35,
                        fill: true,
                    },
                ],
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                plugins: {
                    legend: {
                        display: false,
                    },

                    tooltip: {
                        callbacks: {
                            label: (context) =>
                                Number(context.raw).toLocaleString("en-US", {
                                    style: "currency",
                                    currency: "USD",
                                }),
                        },
                    },
                },

                scales: {
                    y: {
                        beginAtZero: true,

                        ticks: {
                            callback: (value) => `$${value}`,
                        },
                    },
                },
            },
        });
    }

    await loadDashboardSalesChart();
    const salesRangeSelect = document.getElementById("mwDashboardSalesRange");

    salesRangeSelect?.addEventListener("change", async () => {
        const days = Number(salesRangeSelect.value);

        await loadDashboardSalesChart(days);
    });
});
// =========================================
// LOAD ADMIN NOTIFICATIONS
// =========================================

document.addEventListener("DOMContentLoaded", async () => {
    const notificationList = document.getElementById("mwNotificationList");

    const notificationCount = document.getElementById("mwNotificationCount");

    const notificationDot = document.getElementById("mwNotificationDot");

    if (!notificationList || !notificationCount || !notificationDot) {
        return;
    }

    const {
        data: { user },
        error: userError,
    } = await adminSupabase.auth.getUser();

    if (userError || !user) {
        return;
    }

    console.log("ADMIN NOTIFICATION CODE REACHED:", user.id);

    const { data: notifications, error: notificationError } = await adminSupabase
        .from("Admin_Notifications")
        .select(
            `
            id,
            notification_type,
            title,
            message,
            is_read,
            related_email,
            related_ip_address,
            related_order_id,
            related_message_id,
            related_review_id,
            related_product_id,
            related_discount_id,
            related_subscription_id,
            destination_page,
            destination_action,
            created_at
                                    `
        )
        .eq("admin_user_id", user.id)
        .order("created_at", {
            ascending: false,
        })
        .limit(10);

    if (notificationError) {
        console.error("ADMIN NOTIFICATION LOAD ERROR:", notificationError);

        return;
    }

    let adminNotifications = notifications || [];

    const unreadNotifications = adminNotifications.filter((notification) => notification.is_read === false);

    notificationCount.textContent = `${unreadNotifications.length} new`;

    notificationDot.style.display = unreadNotifications.length > 0 ? "block" : "none";

    if (adminNotifications.length === 0) {
        notificationList.innerHTML = `
                        <div class="mw-dashboard-empty-notification">
                                No new notifications
                        </div>
                `;
    }

    notificationList.innerHTML = adminNotifications
        .map((notification) => {
            const notificationDate = new Date(notification.created_at).toLocaleString("en-US", {
                timeZone: "America/Chicago",
            });

            return `
            <div
                class="mw-dashboard-notification-item"

                data-notification-id="${escapeAdminHTML(notification.id)}"

                data-order-id="${escapeAdminHTML(notification.related_order_id || "")}"

                data-message-id="${escapeAdminHTML(notification.related_message_id || "")}"

                data-review-id="${escapeAdminHTML(notification.related_review_id || "")}"

                data-product-id="${escapeAdminHTML(notification.related_product_id || "")}"

                data-destination-page="${escapeAdminHTML(notification.destination_page || "")}"

                data-destination-action="${escapeAdminHTML(notification.destination_action || "")}"
            >

                <div class="mw-dashboard-notification-item-content">

                    <strong>
                        ${escapeAdminHTML(notification.title || "Notification")}
                    </strong>

                    <p>
                        ${escapeAdminHTML(notification.message || "")}
                    </p>

                    <span>
                        ${escapeAdminHTML(notificationDate)}
                    </span>

                </div>

                <button
                    type="button"
                    class="mw-dashboard-notification-delete"

                    data-notification-id="${escapeAdminHTML(notification.id)}"

                    aria-label="Delete notification"
                >
                    <i class="fa-solid fa-trash"></i>
                </button>

            </div>
        `;
        })
        .join("");

    adminSupabase
        .channel(`admin-notifications-${user.id}`)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "Admin_Notifications",
                filter: `admin_user_id=eq.${user.id}`,
            },
            (payload) => {
                console.log("REALTIME ADMIN NOTIFICATION:", payload);

                const newNotification = payload.new;

                adminNotifications.unshift(newNotification);

                const notificationDate = new Date(newNotification.created_at).toLocaleString("en-US", {
                    timeZone: "America/Chicago",
                });

                notificationList.insertAdjacentHTML(
                    "afterbegin",
                    `
                    <div
                        class="mw-dashboard-notification-item"

                        data-notification-id="${escapeAdminHTML(newNotification.id)}"

                        data-order-id="${escapeAdminHTML(newNotification.related_order_id || "")}"

                        data-message-id="${escapeAdminHTML(newNotification.related_message_id || "")}"

                        data-review-id="${escapeAdminHTML(newNotification.related_review_id || "")}"

                        data-product-id="${escapeAdminHTML(newNotification.related_product_id || "")}"

                        data-destination-page="${escapeAdminHTML(newNotification.destination_page || "")}"

                        data-destination-action="${escapeAdminHTML(newNotification.destination_action || "")}"
                    >

                        <div class="mw-dashboard-notification-item-content">

                            <strong>
                                ${escapeAdminHTML(newNotification.title || "Notification")}
                            </strong>

                            <p>
                                ${escapeAdminHTML(newNotification.message || "")}
                            </p>

                            <span>
                                ${escapeAdminHTML(notificationDate)}
                            </span>

                        </div>

                        <button
                            type="button"
                            class="mw-dashboard-notification-delete"

                            data-notification-id="${escapeAdminHTML(newNotification.id)}"

                            aria-label="Delete notification"
                        >
                            <i class="fa-solid fa-trash"></i>
                        </button>

                    </div>
                `
                );

                const unreadCount = adminNotifications.filter((notification) => notification.is_read === false).length;

                notificationCount.textContent = `${unreadCount} new`;

                notificationDot.style.display = unreadCount > 0 ? "block" : "none";
            }
        )
        .subscribe((status) => {
            console.log("ADMIN NOTIFICATION REALTIME STATUS:", status);
        });

    notificationList.addEventListener("click", async (event) => {
        const notificationItem = event.target.closest(".mw-dashboard-notification-item");

        if (!notificationItem) {
            return;
        }

        const orderId = notificationItem.dataset.orderId || null;

        const messageId = notificationItem.dataset.messageId || null;

        const reviewId = notificationItem.dataset.reviewId || null;

        const productId = notificationItem.dataset.productId || null;

        const destinationPage = notificationItem.dataset.destinationPage || "";

        const destinationAction = notificationItem.dataset.destinationAction || "";

        const deleteButton = event.target.closest(".mw-dashboard-notification-delete");

        // =========================================
        // OPEN NOTIFICATION
        // =========================================

        if (!deleteButton) {
            // =========================================
            // SECURITY
            // =========================================

            if (destinationPage === "security" && destinationAction === "open_security") {
                window.location.href = "mtc-admin-settings.html?section=security";

                return;
            }

            // =========================================
            // ORDER DETAILS
            // =========================================

            if (destinationPage === "orders" && destinationAction === "open_order_details" && orderId) {
                window.location.href = `mtc-admin-orders.html?orderId=${encodeURIComponent(
                    orderId
                )}&action=open_order_details`;

                return;
            }

            // =========================================
            // REFUND - READ ONLY ORDER DETAILS
            // =========================================

            if (destinationPage === "orders" && destinationAction === "open_order_details_read_only" && orderId) {
                window.location.href = `mtc-admin-orders.html?orderId=${encodeURIComponent(
                    orderId
                )}&action=open_order_details_read_only`;

                return;
            }

            // =========================================
            // MESSAGE
            // =========================================

            if (destinationPage === "messages" && destinationAction === "open_message" && messageId) {
                window.location.href = `mtc-admin-messages.html?messageId=${encodeURIComponent(
                    messageId
                )}&action=open_message`;

                return;
            }

            // =========================================
            // REVIEW
            // =========================================

            if (destinationPage === "reviews" && destinationAction === "open_review" && reviewId) {
                window.location.href = `mtc-admin-reviews.html?reviewId=${encodeURIComponent(
                    reviewId
                )}&action=open_review`;

                return;
            }

            // =========================================
            // LOW STOCK PRODUCT
            // =========================================

            if (
                destinationPage === "products" &&
                destinationAction === "open_product" &&
                productId
            ) {
                window.location.href = `mtc-admin-products.html?productId=${encodeURIComponent(
                    productId
                )}&action=open_product`;

                return;
            }


            // =========================================
            // NEW SUBSCRIBER
            // =========================================

            if (
                destinationPage === "subscribers" &&
                destinationAction === "open_subscribers"
            ) {
                window.location.href = "mtc-admin-subscribers.html";

                return;
            }


            return;
            }

        // =========================================
        // DELETE NOTIFICATION
        // =========================================

        const notificationId = deleteButton.dataset.notificationId;

        const notificationToDelete = adminNotifications.find(
            (notification) => String(notification.id) === String(notificationId)
        );

        if (!notificationToDelete) {
            console.error("NOTIFICATION NOT FOUND FOR ACTIVITY LOG:", notificationId);
            return;
        }

        const { data: currentAdmin, error: currentAdminError } = await adminSupabase
            .from("Admins")
            .select(
                `
        user_id,
        email,
        first_name,
        last_name,
        Admin_Roles (
            Admin_Positions (
                name
            )
        )
    `
            )
            .eq("user_id", user.id)
            .maybeSingle();

        if (currentAdminError) {
            console.error("NOTIFICATION ACTIVITY ADMIN LOAD ERROR:", currentAdminError);

            return;
        }

        const adminName =
            `${currentAdmin?.first_name || ""} ${currentAdmin?.last_name || ""}`.trim() ||
            currentAdmin?.email ||
            "Admin";

        const adminPosition =
            (currentAdmin?.Admin_Roles || [])
                .map((role) => role.Admin_Positions?.name)
                .filter(Boolean)
                .join(", ") || null;
        const { error: activityLogError } = await adminSupabase.from("Admin_Notification_Activity_Log").insert({
            notification_id: notificationToDelete.id,
            admin_user_id: user.id,
            admin_email: currentAdmin?.email || user.email || null,
            admin_name: adminName,
            admin_position: adminPosition,

            action: "Deleted Notification",

            notification_type: notificationToDelete.notification_type || null,

            notification_title: notificationToDelete.title || null,

            notification_message: notificationToDelete.message || null,

            related_order_id: notificationToDelete.related_order_id || null,

            related_message_id: notificationToDelete.related_message_id || null,

            related_review_id: notificationToDelete.related_review_id || null,

            related_product_id: notificationToDelete.related_product_id || null,

            related_discount_id: notificationToDelete.related_discount_id || null,

            related_subscription_id: notificationToDelete.related_subscription_id || null,

            destination_page: notificationToDelete.destination_page || null,

            destination_action: notificationToDelete.destination_action || null,
        });

        if (activityLogError) {
            console.error("NOTIFICATION ACTIVITY LOG ERROR:", activityLogError);

            return;
        }

        const { data, error } = await adminSupabase
            .from("Admin_Notifications")
            .delete()
            .eq("id", notificationId)
            .eq("admin_user_id", user.id)
            .select("id");

        console.log("ADMIN NOTIFICATION DELETE DATA:", data);

        if (error) {
            console.error("ADMIN NOTIFICATION DELETE ERROR:", error);

            return;
        }

        const deletedNotificationIndex = adminNotifications.findIndex(
            (notification) => String(notification.id) === String(notificationId)
        );

        if (deletedNotificationIndex !== -1) {
            adminNotifications.splice(deletedNotificationIndex, 1);
        }

        deleteButton.closest(".mw-dashboard-notification-item")?.remove();

        const remainingNotifications = notificationList.querySelectorAll(".mw-dashboard-notification-item");

        notificationCount.textContent = `${remainingNotifications.length} new`;

        notificationDot.style.display = remainingNotifications.length > 0 ? "block" : "none";

        if (remainingNotifications.length === 0) {
            notificationCount.textContent = "No notifications";

            notificationList.innerHTML = `
            <div class="mw-dashboard-empty-notification">
                No notifications
            </div>
        `;
        }
    });
});

/* =================================================
        ADMIN HEADER DROPDOWNS
        ================================================= */
function initializeAdminHeaderMenus() {
    const notificationButton = document.getElementById("mwNotificationButton");
    const notificationMenu = document.getElementById("mwNotificationMenu");
    const profileButton = document.getElementById("mwProfileButton");
    const profileMenu = document.getElementById("mwProfileMenu");
    if (notificationButton && notificationMenu) {
        notificationButton.addEventListener("click", function (event) {
            event.stopPropagation();
            notificationMenu.classList.toggle("open");
            if (profileMenu) {
                profileMenu.classList.remove("open");
            }
        });
    }
    if (profileButton && profileMenu) {
        profileButton.addEventListener("click", function (event) {
            event.stopPropagation();
            profileMenu.classList.toggle("open");
            if (notificationMenu) {
                notificationMenu.classList.remove("open");
            }
        });
    }
    document.addEventListener("click", function (event) {
        if (notificationMenu && !notificationMenu.contains(event.target) && event.target !== notificationButton) {
            notificationMenu.classList.remove("open");
        }
        if (profileMenu && !profileMenu.contains(event.target) && event.target !== profileButton) {
            profileMenu.classList.remove("open");
        }
    });
}
document.addEventListener("DOMContentLoaded", initializeAdminHeaderMenus);
/* =========================================
    END OF MTC-ADMIN-DASHBOARD JS
========================================= */

/* =========================================
   START OF MTC-ADMIN-EVENTS JS
========================================= */
document.addEventListener("DOMContentLoaded", async () => {
    const isEventsPage = window.location.pathname.endsWith("mtc-admin-events.html");

    if (!isEventsPage) {
        return;
    }

    // =========================================
    // LOAD CURRENT ADMIN EVENT PERMISSIONS
    // =========================================

    const {
        data: { user: currentEventAdmin },
        error: currentEventAdminError,
    } = await adminSupabase.auth.getUser();

    if (currentEventAdminError || !currentEventAdmin) {
        return;
    }

    const { data: eventAdminAccount, error: eventAdminAccountError } = await adminSupabase
        .from("Admins")
        .select(
            `
                user_id,
                Admin_Roles (
                    Admin_Positions (
                        name
                    )
                )
            `
        )
        .eq("user_id", currentEventAdmin.id)
        .maybeSingle();

    if (eventAdminAccountError) {
        console.error("EVENT ADMIN PERMISSION LOAD ERROR:", eventAdminAccountError);

        return;
    }

    // =========================================
    // EVENT PERMISSION FLAGS
    // =========================================

    const eventAdminPosition = eventAdminAccount?.Admin_Roles?.Admin_Positions?.name || "";

    const normalizedEventAdminPosition = String(eventAdminPosition).trim().toLowerCase();

    const eventFullAccessPositions = ["owner", "web developer", "operations manager", "store manager"];

    const hasEventFullAccess = eventFullAccessPositions.includes(normalizedEventAdminPosition);

    let canCreateEvents = hasEventFullAccess;
    let canEditEvents = hasEventFullAccess;
    let canDeleteEvents = hasEventFullAccess;

    // =========================================
    // CHECK INDIVIDUAL EVENT PERMISSIONS
    // =========================================

    const {
        data: { session: eventPermissionSession },
    } = await adminSupabase.auth.getSession();

    if (eventPermissionSession?.access_token) {
        const eventPermissionHeaders = {
            Authorization: `Bearer ${eventPermissionSession.access_token}`,
        };

        const [createEventPermissionResponse, editEventPermissionResponse, deleteEventPermissionResponse] =
            await Promise.all([
                fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=events.create", {
                    headers: eventPermissionHeaders,
                }),
                fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=events.edit", {
                    headers: eventPermissionHeaders,
                }),
                fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=events.delete", {
                    headers: eventPermissionHeaders,
                }),
            ]);

        const [createEventPermissionResult, editEventPermissionResult, deleteEventPermissionResult] = await Promise.all(
            [
                createEventPermissionResponse.json(),
                editEventPermissionResponse.json(),
                deleteEventPermissionResponse.json(),
            ]
        );

        canCreateEvents = hasEventFullAccess || createEventPermissionResult?.allowed === true;

        canEditEvents = hasEventFullAccess || editEventPermissionResult?.allowed === true;

        canDeleteEvents = hasEventFullAccess || deleteEventPermissionResult?.allowed === true;
    }

    console.log("EVENT PERMISSIONS:", {
        position: eventAdminPosition,
        canCreateEvents,
        canEditEvents,
        canDeleteEvents,
    });

    // =========================================
    // ELEMENTS
    // =========================================

    const createButton = document.getElementById("mtcAdminEventsCreateButton");

    const modal = document.getElementById("mtcAdminEventsModal");

    const modalOverlay = document.getElementById("mtcAdminEventsModalOverlay");

    const modalClose = document.getElementById("mtcAdminEventsModalClose");

    const cancelButton = document.getElementById("mtcAdminEventsCancelButton");

    const form = document.getElementById("mtcAdminEventsForm");

    const saveButton = document.getElementById("mtcAdminEventsSaveButton");

    const modalTitle = document.getElementById("mtcAdminEventsModalTitle");

    const totalCount = document.getElementById("mtcAdminEventsTotalCount");

    const eventsList = document.getElementById("mtcAdminEventsList");

    const eventsTableBody = document.getElementById("mtcAdminEventsTableBody");

    const deleteModal = document.getElementById("mtcAdminDeleteModal");

    const deleteModalOverlay = document.getElementById("mtcAdminDeleteModalOverlay");

    const deleteCancelButton = document.getElementById("mtcAdminDeleteCancelButton");

    const deleteConfirmButton = document.getElementById("mtcAdminDeleteConfirmButton");

    const deleteModalMessage = document.getElementById("mtcAdminDeleteModalMessage");

    let eventPendingDelete = null;
    function closeDeleteModal() {
        eventPendingDelete = null;

        deleteModal?.classList.remove("active");

        deleteModal?.setAttribute("aria-hidden", "true");
    }

    deleteCancelButton?.addEventListener("click", closeDeleteModal);

    deleteModalOverlay?.addEventListener("click", closeDeleteModal);

    deleteConfirmButton?.addEventListener("click", async () => {
        if (!eventPendingDelete) {
            return;
        }

        // =========================================
        // CHECK DELETE EVENT PERMISSION
        // =========================================

        if (!canDeleteEvents) {
            alert("You do not have permission to delete events.");

            closeDeleteModal();

            return;
        }

        const eventId = eventPendingDelete.id;

        deleteConfirmButton.disabled = true;

        deleteConfirmButton.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin"></i>
                Deleting...
            `;

        const { data, error } = await adminSupabase.from("Events").delete().eq("id", eventId).select("id");

        if (error) {
            console.error("Event delete error:", error);

            alert("Unable to delete event.");

            deleteConfirmButton.disabled = false;

            deleteConfirmButton.innerHTML = `
                    <i class="fa-solid fa-trash"></i>
                    Delete Event
                `;

            return;
        }

        if (!data || data.length === 0) {
            alert("Event was not deleted.");

            deleteConfirmButton.disabled = false;

            deleteConfirmButton.innerHTML = `
                    <i class="fa-solid fa-trash"></i>
                    Delete Event
                `;

            return;
        }
        const deletedEventName = eventPendingDelete.name || "Unknown Event";

        const { data: activitySessionData } = await adminSupabase.auth.getSession();

        const activityAccessToken = activitySessionData?.session?.access_token;

        if (activityAccessToken) {
            await fetch("https://mtc-backend-node-production.up.railway.app/admin-activity-log", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    Authorization: `Bearer ${activityAccessToken}`,
                },

                body: JSON.stringify({
                    category: "Events",

                    action: "Event Deleted",

                    description: `Deleted event: ${deletedEventName}.`,

                    targetType: "Event",

                    targetId: eventId,

                    targetName: deletedEventName,

                    metadata: {
                        event_name: deletedEventName,

                        event_date: eventPendingDelete.date,
                    },
                }),
            });
        }
        window.location.reload();
    });
    // =========================================
    // EDIT STATE
    // =========================================

    let editingEventId = null;

    // =========================================
    // OPEN CREATE EVENT MODAL
    // =========================================

    function openCreateEventModal() {
        editingEventId = null;

        form?.reset();

        if (modalTitle) {
            modalTitle.textContent = "Create Event";
        }

        if (saveButton) {
            saveButton.disabled = false;

            saveButton.innerHTML = `
                    <i class="fa-solid fa-check"></i>
                    Save Event
                `;
        }

        modal?.classList.add("active");

        modal?.setAttribute("aria-hidden", "false");
    }

    // =========================================
    // CLOSE MODAL
    // =========================================

    function closeEventModal() {
        modal?.classList.remove("active");

        modal?.setAttribute("aria-hidden", "true");
    }

    if (createButton) {
        if (canCreateEvents) {
            createButton.style.display = "";

            createButton.addEventListener("click", openCreateEventModal);
        } else {
            createButton.style.display = "none";
        }
    }

    modalClose?.addEventListener("click", closeEventModal);

    cancelButton?.addEventListener("click", closeEventModal);

    modalOverlay?.addEventListener("click", closeEventModal);

    // =========================================
    // LOAD EVENTS
    // =========================================
    const { data: events, error: eventsError } = await adminSupabase
        .from("Events")
        .select(
            `
            id,
            name,
            description,
            event_type,
            game,
            date,
            start_time,
            end_time,
            location,
            entry_fee,
            prize,
            bandai_link,
            image_url,
            created_at
        `
        )
        .order("date", {
            ascending: true,
        });

    if (eventsError) {
        console.error("Events load error:", JSON.stringify(eventsError, null, 2));

        return;
    }

    const allEvents = events || [];

    // =========================================
    // TOTAL EVENTS
    // =========================================

    if (totalCount) {
        totalCount.textContent = allEvents.length;
    }

    // =========================================
    // EVENTS
    // =========================================

    if (eventsList) {
        if (allEvents.length === 0) {
            eventsList.innerHTML = `
            <div class="mtc-admin-events-loading">
                No events found.
            </div>
        `;
        } else {
            eventsList.innerHTML = allEvents
                .map(
                    (event) => `
                    <div class="mtc-admin-event-card">

                        <div class="mtc-admin-event-card-main">

                            <div class="mtc-admin-event-card-icon">
                                <i class="fa-solid fa-calendar-days"></i>
                            </div>

                            <div class="mtc-admin-event-card-info">

                                <h3>
                                    ${escapeAdminHTML(event.name || "Event")}
                                </h3>

                                <div class="mtc-admin-event-card-meta">

                                    <span>
                                        <i class="fa-regular fa-calendar"></i>
                                        ${escapeAdminHTML(event.date || "No date")}
                                    </span>

                                    <span>
                                        <i class="fa-solid fa-gamepad"></i>
                                        ${escapeAdminHTML(event.game || event.event_type || "Event")}
                                    </span>

                                </div>

                            </div>

                        </div>

                        <div class="mtc-admin-event-card-prize">

                            <span>
                                Prize Pool
                            </span>

                            <strong>
                                ${escapeAdminHTML(event.prize || "Not Set")}
                            </strong>

                        </div>

                    </div>
                `
                )
                .join("");
        }
    }

    // =========================================
    // RENDER ALL EVENTS TABLE
    // =========================================

    function renderEventsTable(eventsToRender) {
        if (!eventsTableBody) {
            return;
        }

        if (!eventsToRender || eventsToRender.length === 0) {
            eventsTableBody.innerHTML = `
            <tr>
                <td
                    colspan="7"
                    class="mtc-admin-events-loading-cell"
                >
                    No events found.
                </td>
            </tr>
        `;

            return;
        }

        eventsTableBody.innerHTML = eventsToRender
            .map(
                (event) => `
                <tr>

                    <td>
                        ${escapeAdminHTML(event.name || "Event")}
                    </td>

                    <td>
                        ${escapeAdminHTML(event.game || event.event_type || "—")}
                    </td>

                    <td>
                        ${escapeAdminHTML(
                            event.date
                                ? (() => {
                                      const [year, month, day] = event.date.split("-");

                                      return `${Number(month)}/${Number(day)}/${year}`;
                                  })()
                                : "—"
                        )}
                    </td>

                    <td>
                        ${escapeAdminHTML(
                            event.start_time
                                ? new Date(`2000-01-01T${event.start_time}`).toLocaleTimeString("en-US", {
                                      hour: "numeric",
                                      minute: "2-digit",
                                  })
                                : "—"
                        )}
                    </td>

                    <td>
                        ${escapeAdminHTML(
                            Number(event.entry_fee || 0).toLocaleString("en-US", {
                                style: "currency",
                                currency: "USD",
                            })
                        )}
                    </td>

                    <td>
                        ${escapeAdminHTML(event.prize || "—")}
                    </td>

                    <td>
                        ${
                            canEditEvents
                                ? `
                                    <button
                                        type="button"
                                        class="mtc-admin-event-edit-button"
                                        data-event-id="${escapeAdminHTML(event.id)}">
                                        Edit
                                    </button>
                                `
                                : ""
                        }

                        ${
                            canDeleteEvents
                                ? `
                                    <button
                                        type="button"
                                        class="mtc-admin-event-delete-button"
                                        data-event-id="${escapeAdminHTML(event.id)}">
                                        Delete
                                    </button>
                                `
                                : ""
                        }
                    </td>

                </tr>
            `
            )
            .join("");
    }

    // =========================================
    // INITIAL TABLE
    // =========================================

    renderEventsTable(allEvents);

    // =========================================
    // EDIT / DELETE EVENT
    // =========================================

    eventsTableBody?.addEventListener("click", async (event) => {
        // =========================================
        // DELETE EVENT
        // =========================================

        const deleteButton = event.target.closest(".mtc-admin-event-delete-button");

        if (deleteButton) {
            if (!canDeleteEvents) {
                alert("You do not have permission to delete events.");
                return;
            }

            const eventId = deleteButton.dataset.eventId;

            const selectedEvent = allEvents.find((item) => String(item.id) === String(eventId));

            if (!selectedEvent) {
                return;
            }

            eventPendingDelete = selectedEvent;

            if (deleteModalMessage) {
                deleteModalMessage.textContent = `Are you sure you want to delete "${selectedEvent.name}"?`;
            }

            if (deleteConfirmButton) {
                deleteConfirmButton.disabled = false;

                deleteConfirmButton.innerHTML = `
                    <i class="fa-solid fa-trash"></i>
                    Delete Event
                `;
            }

            deleteModal?.classList.add("active");

            deleteModal?.setAttribute("aria-hidden", "false");

            return;
        }

        // =========================================
        // EDIT EVENT
        // =========================================

        const editButton = event.target.closest(".mtc-admin-event-edit-button");

        if (!editButton) {
            return;
        }

        if (!canEditEvents) {
            alert("You do not have permission to edit events.");
            return;
        }

        const eventId = editButton.dataset.eventId;

        const selectedEvent = allEvents.find((item) => String(item.id) === String(eventId));

        if (!selectedEvent) {
            return;
        }

        editingEventId = selectedEvent.id;

        document.getElementById("mtcAdminEventsName").value = selectedEvent.name || "";

        document.getElementById("mtcAdminEventsDescription").value = selectedEvent.description || "";

        document.getElementById("mtcAdminEventsType").value = selectedEvent.event_type || "";

        document.getElementById("mtcAdminEventsGame").value = selectedEvent.game || "";

        document.getElementById("mtcAdminEventsDate").value = selectedEvent.date || "";

        document.getElementById("mtcAdminEventsStartTime").value = selectedEvent.start_time
            ? selectedEvent.start_time.slice(0, 5)
            : "";

        document.getElementById("mtcAdminEventsEntryFee").value = selectedEvent.entry_fee ?? "";

        document.getElementById("mtcAdminEventsPrize").value = selectedEvent.prize || "";

        document.getElementById("mtcAdminEventsBandaiLink").value = selectedEvent.bandai_link || "";

        if (modalTitle) {
            modalTitle.textContent = "Edit Event";
        }

        if (saveButton) {
            saveButton.disabled = false;

            saveButton.innerHTML = `
                <i class="fa-solid fa-check"></i>
                Update Event
            `;
        }

        modal?.classList.add("active");

        modal?.setAttribute("aria-hidden", "false");
    });
    // =========================================
    // SAVE / UPDATE EVENT
    // =========================================

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();

        // =========================================
        // CHECK CREATE / EDIT EVENT PERMISSION
        // =========================================

        if (!editingEventId && !canCreateEvents) {
            alert("You do not have permission to create events.");
            return;
        }

        const eventData = {
            name: document.getElementById("mtcAdminEventsName").value.trim(),

            description: document.getElementById("mtcAdminEventsDescription").value.trim() || null,

            event_type: document.getElementById("mtcAdminEventsType").value.trim() || null,

            game: document.getElementById("mtcAdminEventsGame").value || null,

            date: document.getElementById("mtcAdminEventsDate").value || null,

            start_time: document.getElementById("mtcAdminEventsStartTime").value || null,

            location: "Midwest Toy Connections - 5601 S Pennsylvania Ave, Cudahy, WI 53110",

            entry_fee: document.getElementById("mtcAdminEventsEntryFee").value || 0,

            prize: document.getElementById("mtcAdminEventsPrize").value.trim() || null,

            bandai_link: document.getElementById("mtcAdminEventsBandaiLink").value.trim() || null,
        };

        saveButton.disabled = true;

        saveButton.innerHTML = `
                    <i class="fa-solid fa-spinner fa-spin"></i>

                    ${editingEventId ? "Updating..." : "Saving..."}
                `;

        // =========================================
        // UPDATE EXISTING EVENT
        // =========================================

        if (editingEventId) {
            const { data, error } = await adminSupabase
                .from("Events")
                .update(eventData)
                .eq("id", editingEventId)
                .select("id");

            if (error) {
                console.error("Event update error:", JSON.stringify(error, null, 2));

                alert("Unable to update event.");

                saveButton.disabled = false;

                saveButton.innerHTML = `
                            <i class="fa-solid fa-check"></i>
                            Update Event
                        `;

                return;
            }

            if (!data || data.length === 0) {
                console.error("Event update failed: no event row was updated.");

                alert("Event was not updated. Check the Events UPDATE policy in Supabase.");

                saveButton.disabled = false;

                saveButton.innerHTML = `
                            <i class="fa-solid fa-check"></i>
                            Update Event
                        `;

                return;
            }

            console.log("✅ EVENT UPDATED:", editingEventId);
        }

        // =========================================
        // CREATE NEW EVENT
        // =========================================
        else {
            const { error } = await adminSupabase.from("Events").insert(eventData);

            if (error) {
                console.error("Event create error:", JSON.stringify(error, null, 2));

                alert("Unable to create event.");

                saveButton.disabled = false;

                saveButton.innerHTML = `
                            <i class="fa-solid fa-check"></i>
                            Save Event
                        `;

                return;
            }

            console.log("✅ EVENT CREATED");
            const { data: activitySessionData } = await adminSupabase.auth.getSession();

            const activityAccessToken = activitySessionData?.session?.access_token;

            if (activityAccessToken) {
                await fetch("https://mtc-backend-node-production.up.railway.app/admin-activity-log", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",

                        Authorization: `Bearer ${activityAccessToken}`,
                    },

                    body: JSON.stringify({
                        category: "Events",

                        action: "Event Created",

                        description: `Created event: ${eventData.name}.`,

                        targetType: "Event",

                        targetName: eventData.name,

                        metadata: {
                            event_name: eventData.name,

                            event_date: eventData.date,
                        },
                    }),
                });
            }
        }

        editingEventId = null;

        closeEventModal();

        window.location.reload();
    });
});
/* =========================================
   END OF MTC-ADMIN-EVENTS JS
========================================= */

/* =========================================
   START OF MTC-ADMIN-ORDERS JS
========================================= */

let currentAdminPositions = [];

let currentAdminCanProcessRefund = false;
let currentAdminCanRequestRefund = false;
let currentAdminCanViewRefundHistory = true;
let currentAdminCanEditOrders = false;
let currentAdminCanEditInventory = false;

document.addEventListener("DOMContentLoaded", async () => {
    const isOrdersPage = window.location.pathname.endsWith("mtc-admin-orders.html");
    if (!isOrdersPage) {
        return;
    }
    const orderNotificationUrlParams = new URLSearchParams(window.location.search);

    const orderIdFromNotification = orderNotificationUrlParams.get("orderId");

    const orderActionFromNotification = orderNotificationUrlParams.get("action");

    // =========================================
    // PROTECT ORDERS PAGE
    // =========================================
    const {
        data: { user },
        error: userError,
    } = await adminSupabase.auth.getUser();

    if (userError || !user) {
        window.location.replace("mtc-admin-login.html");

        return;
    }

    const { data: isAdmin, error: adminError } = await adminSupabase.rpc("is_admin");

    if (adminError || isAdmin !== true) {
        await adminSupabase.auth.signOut();
        window.location.replace("mtc-admin-login.html");
        return;
    }
    // =========================================
    // LOAD CURRENT ADMIN POSITIONS
    // =========================================

    const { data: currentAdminAccount, error: currentAdminAccountError } = await adminSupabase
        .from("Admins")
        .select(
            `
        user_id,
        status,
        authority_level,
       Admin_Roles (
    position_id,
    Admin_Positions (
        name,
        authority_level
    )
)
    `
        )
        .eq("user_id", user.id)
        .single();

    if (currentAdminAccountError) {
        console.error("CURRENT ADMIN ACCOUNT ERROR:", currentAdminAccountError);
    } else {
        currentAdminPositions = (currentAdminAccount?.Admin_Roles || [])
            .map((role) => role.Admin_Positions?.name)
            .filter(Boolean);
    }

    console.log("CURRENT ADMIN POSITIONS:", currentAdminPositions);

    console.log("CURRENT ADMIN ACCOUNT:", currentAdminAccount);

    const {
        data: { session: permissionSession },
    } = await adminSupabase.auth.getSession();

    if (permissionSession?.access_token) {
        // =========================================
        // REFUND PROCESS PERMISSION
        // =========================================

        const permissionResponse = await fetch(
            "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=refunds.process",
            {
                headers: {
                    Authorization: `Bearer ${permissionSession.access_token}`,
                },
            }
        );

        const permissionResult = await permissionResponse.json();

        const currentAdminRefundAuthorityLevel = Number(currentAdminAccount?.authority_level) || 0;

        currentAdminCanProcessRefund = currentAdminRefundAuthorityLevel >= 60 && permissionResult?.allowed === true;

        // =========================================
        // REFUND REQUEST PERMISSION
        // =========================================

        const requestPermissionResponse = await fetch(
            "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=refunds.request",
            {
                headers: {
                    Authorization: `Bearer ${permissionSession.access_token}`,
                },
            }
        );

        const requestPermissionResult = await requestPermissionResponse.json();

        currentAdminCanRequestRefund =
            currentAdminRefundAuthorityLevel < 60 || requestPermissionResult?.allowed === true;

        // =========================================
        // REFUND HISTORY VIEW SWITCHING
        // =========================================

        const refundHistoryPanel = document.getElementById("mtcAdminRefundHistoryPanel");

        const refundHistoryTab = document.getElementById("mtcAdminRefundHistoryTab");

        const allOrdersContent = document.getElementById("mtcAdminAllOrdersContent");

        const ordersSectionTitle = document.getElementById("mtcAdminOrdersSectionTitle");

        const ordersSectionSubtitle = document.getElementById("mtcAdminOrdersSectionSubtitle");

        if (refundHistoryTab && currentAdminCanViewRefundHistory) {
            refundHistoryTab.style.display = "";

            refundHistoryTab.addEventListener("click", () => {
                const showingRefundHistory = refundHistoryPanel.style.display !== "none";

                if (showingRefundHistory) {
                    // SHOW ALL ORDERS
                    refundHistoryPanel.style.display = "none";
                    allOrdersContent.style.display = "";

                    ordersSectionTitle.textContent = "All Orders";
                    ordersSectionSubtitle.textContent = "View and manage customer orders.";

                    refundHistoryTab.innerHTML = `
    Refund History
    <i class="fa-solid fa-arrow-right"></i>
`;
                } else {
                    // SHOW REFUND HISTORY
                    allOrdersContent.style.display = "none";
                    refundHistoryPanel.style.display = "";

                    ordersSectionTitle.textContent = "Refund History";
                    ordersSectionSubtitle.textContent = "View all refund activity and completed refunds.";

                    refundHistoryTab.innerHTML = `
                <i class="fa-solid fa-arrow-left"></i>
                All Orders
            `;
                }
            });
        } else if (refundHistoryTab) {
            refundHistoryTab.style.display = "none";
        }
        // =========================================
        // EDIT ORDERS PERMISSION
        // =========================================

        const editOrdersPermissionResponse = await fetch(
            "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=orders.edit",
            {
                headers: {
                    Authorization: `Bearer ${permissionSession.access_token}`,
                },
            }
        );

        const editOrdersPermissionResult = await editOrdersPermissionResponse.json();

        currentAdminCanEditOrders =
            currentAdminPositions.includes("Owner") ||
            currentAdminPositions.includes("Web Developer") ||
            editOrdersPermissionResult?.allowed === true;

        // =========================================
        // EDIT INVENTORY PERMISSION
        // =========================================

        const editInventoryPermissionResponse = await fetch(
            "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=inventory.edit",
            {
                headers: {
                    Authorization: `Bearer ${permissionSession.access_token}`,
                },
            }
        );

        const editInventoryPermissionResult = await editInventoryPermissionResponse.json();
    }

    // =========================================
    // ELEMENTS
    // =========================================
    const { data: orders, error: ordersError } = await adminSupabase.from("Orders").select("*").order("created_at", {
        ascending: false,
    });

    if (ordersError) {
        console.error("Orders page error:", ordersError);
        return;
    }

    const { data: payments, error: paymentsError } = await adminSupabase
        .from("Payments")
        .select("order_id, card_last4, refund_amount, payment_status, last_refunded_at");

    if (paymentsError) {
        console.error("Load payments error:", paymentsError);
    }

    console.log("PAYMENTS DATA:", payments);

    const ordersPerPage = 10;
    let currentPage = 1;

    // Keep every order for Refund History
    const refundSourceOrders = orders || [];

    // All Orders starts with the complete list,
    // then fully refunded orders are removed below.
    let allOrders = [...refundSourceOrders];
    // =========================================
    // REFUND HISTORY
    // =========================================

    const refundHistoryTable = document.getElementById("mtcAdminRefundHistoryTable");

    const refundHistoryTableBody = refundHistoryTable?.querySelector("tbody");

    const refundHistoryPanel = document.getElementById("mtcAdminRefundHistoryPanel");

    let refundHistorySearch = document.getElementById("mtcAdminRefundHistorySearch");

    // Add search bar automatically if it does not exist yet
    if (refundHistoryPanel && !refundHistorySearch) {
        const searchWrapper = document.createElement("div");

        searchWrapper.className = "mtc-admin-orders-toolbar";

        searchWrapper.innerHTML = `
        <div class="mtc-admin-orders-search">
            <i class="fa-solid fa-magnifying-glass"></i>

            <input
                type="search"
                id="mtcAdminRefundHistorySearch"
                placeholder="Search refund history..."
                autocomplete="off">
        </div>
    `;

        refundHistoryPanel.insertBefore(searchWrapper, refundHistoryPanel.firstChild);

        refundHistorySearch = document.getElementById("mtcAdminRefundHistorySearch");
    }

    function getOriginalOrderTotal(order) {
        return (
            Number(order.subtotal || 0) +
            Number(order.shipping_amount || 0) +
            Number(order.tax_amount || 0) -
            Number(order.discount_amount || 0)
        );
    }

    const REFUND_HISTORY_PER_PAGE = 10;
    let refundHistoryCurrentPage = 1;

    const refundHistoryPrevious = document.getElementById("mtcAdminRefundHistoryPrevious");

    const refundHistoryNext = document.getElementById("mtcAdminRefundHistoryNext");

    const refundHistoryPageInfo = document.getElementById("mtcAdminRefundHistoryPageInfo");

    function getRefundHistoryOrders() {
        return refundSourceOrders
            .map((order) => {
                const payment = payments?.find((payment) => String(payment.order_id) === String(order.id));

                const refundedAmount = Number(payment?.refund_amount || 0);

                if (refundedAmount <= 0) {
                    return null;
                }

                const originalTotal = getOriginalOrderTotal(order);

                const remainingAmount = Math.max(0, originalTotal - refundedAmount);

                const fullyRefunded =
                    refundedAmount >= originalTotal ||
                    String(payment?.payment_status || "").toLowerCase() === "refunded" ||
                    String(order.order_status || "").toLowerCase() === "refunded";

                return {
                    order,
                    payment,
                    originalTotal,
                    refundedAmount,
                    remainingAmount,
                    refundStatus: fullyRefunded ? "Fully Refunded" : "Partially Refunded",
                    lastRefundedAt: payment?.last_refunded_at || order.updated_at || order.created_at,
                };
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.lastRefundedAt) - new Date(a.lastRefundedAt));
    }

    function renderRefundHistory(searchTerm = "") {
        if (!refundHistoryTableBody) {
            return;
        }

        const cleanSearch = String(searchTerm || "")
            .trim()
            .toLowerCase();

        const refundOrders = getRefundHistoryOrders().filter((entry) => {
            if (!cleanSearch) {
                return true;
            }

            const order = entry.order;

            return (
                String(order.order_id || "")
                    .toLowerCase()
                    .includes(cleanSearch) ||
                String(order.customer_name || "")
                    .toLowerCase()
                    .includes(cleanSearch) ||
                String(order.customer_email || "")
                    .toLowerCase()
                    .includes(cleanSearch) ||
                entry.refundStatus.toLowerCase().includes(cleanSearch)
            );
        });

        const totalRefundHistoryPages = Math.max(1, Math.ceil(refundOrders.length / REFUND_HISTORY_PER_PAGE));

        if (refundHistoryPageInfo) {
            refundHistoryPageInfo.textContent = `Page ${refundHistoryCurrentPage} of ${totalRefundHistoryPages}`;
        }

        if (refundHistoryCurrentPage > totalRefundHistoryPages) {
            refundHistoryCurrentPage = totalRefundHistoryPages;
        }

        const refundHistoryStartIndex = (refundHistoryCurrentPage - 1) * REFUND_HISTORY_PER_PAGE;

        const pagedRefundOrders = refundOrders.slice(
            refundHistoryStartIndex,
            refundHistoryStartIndex + REFUND_HISTORY_PER_PAGE
        );

        if (refundOrders.length === 0) {
            refundHistoryTableBody.innerHTML = `
            <tr>
                <td colspan="9">
                    No refund history found.
                </td>
            </tr>
        `;

            return;
        }

        refundHistoryTableBody.innerHTML = pagedRefundOrders
            .map((entry) => {
                const order = entry.order;

                const customer = order.customer_name || order.customer_email || "Guest";

                const refundDate = new Date(entry.lastRefundedAt).toLocaleString("en-US", {
                    timeZone: "America/Chicago",
                });

                const originalTotal = entry.originalTotal.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                });

                const refunded = entry.refundedAmount.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                });

                const remaining = entry.remainingAmount.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                });

                const statusClass =
                    entry.refundStatus === "Fully Refunded" ? "mw-order-refunded" : "mw-order-partially_refunded";

                return `
            <tr>
                <td>
                    ${escapeAdminHTML(order.order_id || "—")}
                </td>

                <td>
                    ${escapeAdminHTML(customer)}
                </td>

                <td>
                    ${escapeAdminHTML(order.customer_email || "—")}
                </td>

                <td>
                    ${escapeAdminHTML(originalTotal)}
                </td>

                <td>
                    ${escapeAdminHTML(refunded)}
                </td>

                <td>
                    ${escapeAdminHTML(remaining)}
                </td>

                <td>
                    <span
                        class="mw-order-status ${statusClass}"
                    >
                        ${escapeAdminHTML(entry.refundStatus)}
                    </span>
                </td>

                <td>
                    ${escapeAdminHTML(refundDate)}
                </td>

                <td>
                    <button
                        type="button"
                        class="
                            mtc-admin-orders-view-button
                            mtc-refund-history-order-details
                        "
                        data-order-id="${escapeAdminHTML(order.id)}"
                        data-read-only="true"
                    >
                        Order Details
                    </button>
                </td>
            </tr>
        `;
            })
            .join("");
    }

    refundHistorySearch?.addEventListener("input", () => {
        renderRefundHistory(refundHistorySearch.value);
    });

    refundHistoryPrevious?.addEventListener("click", () => {
        if (refundHistoryCurrentPage > 1) {
            refundHistoryCurrentPage--;

            renderRefundHistory(refundHistorySearch?.value || "");
        }
    });

    refundHistoryNext?.addEventListener("click", () => {
        const cleanSearch = String(refundHistorySearch?.value || "")
            .trim()
            .toLowerCase();

        const filteredRefundOrders = getRefundHistoryOrders().filter((entry) => {
            if (!cleanSearch) {
                return true;
            }

            const order = entry.order;

            return (
                String(order.order_id || "")
                    .toLowerCase()
                    .includes(cleanSearch) ||
                String(order.customer_name || "")
                    .toLowerCase()
                    .includes(cleanSearch) ||
                String(order.customer_email || "")
                    .toLowerCase()
                    .includes(cleanSearch) ||
                entry.refundStatus.toLowerCase().includes(cleanSearch)
            );
        });

        const totalPages = Math.max(1, Math.ceil(filteredRefundOrders.length / REFUND_HISTORY_PER_PAGE));

        if (refundHistoryCurrentPage < totalPages) {
            refundHistoryCurrentPage++;

            renderRefundHistory(refundHistorySearch?.value || "");
        }
    });

    renderRefundHistory();

    // =========================================
    // OPEN REFUND ORDER FROM NOTIFICATION
    // =========================================

    if (orderIdFromNotification && orderActionFromNotification === "open_order_details_read_only") {
        const refundOrderDetailsButton = document.querySelector(
            `.mtc-refund-history-order-details[data-order-id="${orderIdFromNotification}"][data-read-only="true"]`
        );

        if (refundOrderDetailsButton) {
            refundOrderDetailsButton.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });

            refundOrderDetailsButton.click();

            window.history.replaceState({}, document.title, "mtc-admin-orders.html");
        }
    }

    // Fully refunded orders do NOT belong in All Orders.
    // Partially refunded orders stay.
    allOrders = allOrders.filter((order) => {
        const payment = payments?.find((payment) => String(payment.order_id) === String(order.id));

        const originalTotal = getOriginalOrderTotal(order);

        const refundedAmount = Number(payment?.refund_amount || 0);

        const fullyRefunded =
            String(order.order_status || "")
                .trim()
                .toLowerCase() === "refunded" ||
            String(payment?.payment_status || "")
                .trim()
                .toLowerCase() === "refunded" ||
            (refundedAmount > 0 && refundedAmount >= originalTotal);

        return !fullyRefunded;
    });
    if (orderIdFromNotification) {
        const orderIndex = allOrders.findIndex((order) => String(order.id) === String(orderIdFromNotification));
        console.log("ORDER FROM NOTIFICATION:", orderIdFromNotification, "ORDER INDEX:", orderIndex);
        if (orderIndex !== -1) {
            currentPage = Math.floor(orderIndex / ordersPerPage) + 1;
        }
    }
    /* =========================================
        LOAD ORDER ITEM QUANTITIES
        ========================================= */
    const orderIds = allOrders.map((order) => order.id);
    let orderItems = [];
    if (orderIds.length > 0) {
        const { data: items, error: itemsError } = await adminSupabase
            .from("Order_items")
            .select("order_id, item_quantity")
            .in("order_id", orderIds);
        if (itemsError) {
            console.error("Order items error:", itemsError);
        } else {
            orderItems = items || [];

            console.log("ORDER ITEMS FROM SUPABASE:", orderItems);
        }
    }
    // =========================================
    // EXPORT ORDERS
    // =========================================

    const exportButton = document.getElementById("mtcAdminOrdersExportButton");

    if (exportButton) {
        exportButton.addEventListener("click", async () => {
            if (allOrders.length === 0) {
                alert("There are no orders to export.");
                return;
            }

            exportButton.disabled = true;

            exportButton.innerHTML = `
                            <i class="fa-solid fa-spinner fa-spin"></i>
                            <span>Exporting...</span>
                        `;

            const orderIds = allOrders.map((order) => order.id);

            const { data: shippingRows, error: shippingError } = await adminSupabase
                .from("Shipping")
                .select("order_id, shipping_status")
                .in("order_id", orderIds);

            if (shippingError) {
                console.error("Export shipping error:", shippingError);

                exportButton.disabled = false;

                exportButton.innerHTML = `
                                <i class="fa-solid fa-download"></i>
                                <span>Export</span>
                            `;

                return;
            }

            const csvValue = (value) => {
                const text = String(value ?? "");

                return `"${text.replace(/"/g, '""')}"`;
            };

            const headers = [
                "Order Number",
                "Customer",
                "Email",
                "Date",
                "Item Quantity",
                "Subtotal",
                "Shipping",
                "Tax",
                "Discount",
                "Total",
                "Payment Status",
                "Order Status",
                "Shipping Status",
            ];

            const rows = allOrders.map((order) => {
                const itemQuantity = orderItems
                    .filter((item) => String(item.order_id) === String(order.id))
                    .reduce((total, item) => total + Number(item.item_quantity || 0), 0);

                const subtotal = Number(order.subtotal || 0);

                const shipping = Number(order.shipping_amount || 0);

                const tax = Number(order.tax_amount || 0);

                const discount = Number(order.discount_amount || 0);

                const total = subtotal + shipping + tax - discount;

                const shippingRecord = (shippingRows || []).find((row) => String(row.order_id) === String(order.id));

                const shippingStatus = shippingRecord?.shipping_status || "Not Shipped";

                const orderDate = order.created_at
                    ? new Date(order.created_at).toLocaleString("en-US", {
                          timeZone: "America/Chicago",
                      })
                    : "";

                return [
                    order.order_id,
                    order.customer_name || "Guest",
                    order.customer_email || "",
                    orderDate,
                    itemQuantity,
                    subtotal.toFixed(2),
                    shipping.toFixed(2),
                    tax.toFixed(2),
                    discount.toFixed(2),
                    total.toFixed(2),
                    order.payment_status || "pending",
                    order.order_status || "pending",
                    shippingStatus,
                ]
                    .map(csvValue)
                    .join(",");
            });

            const csvContent = [headers.map(csvValue).join(","), ...rows].join("\n");

            const blob = new Blob([csvContent], {
                type: "text/csv;charset=utf-8;",
            });
            const downloadUrl = URL.createObjectURL(blob);
            const downloadLink = document.createElement("a");
            const today = new Date().toISOString().split("T")[0];
            downloadLink.href = downloadUrl;
            downloadLink.download = `MTC-Orders-${today}.csv`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(downloadUrl);
            exportButton.disabled = false;
            exportButton.innerHTML = `
                            <i class="fa-solid fa-download"></i>
                            <span>Export</span>
                        `;
        });
    }

    const totalCount = document.getElementById("mtcAdminOrdersTotalCount");

    const pendingCount = document.getElementById("mtcAdminOrdersPendingCount");

    const processingCount = document.getElementById("mtcAdminOrdersProcessingCount");

    const completedCount = document.getElementById("mtcAdminOrdersCompletedCount");
    const paginationInfo = document.getElementById("mtcAdminOrdersPaginationInfo");

    const previousButton = document.getElementById("mtcAdminOrdersPreviousButton");

    const nextButton = document.getElementById("mtcAdminOrdersNextButton");

    const pendingOrders = allOrders.filter((order) => (order.order_status || "").toLowerCase() === "pending");
    const processingOrders = allOrders.filter((order) => (order.order_status || "").toLowerCase() === "processing");
    const completedOrders = allOrders.filter((order) => (order.order_status || "").toLowerCase() === "completed");
    if (totalCount) {
        totalCount.textContent = allOrders.length;
    }
    if (pendingCount) {
        pendingCount.textContent = pendingOrders.length;
    }
    if (processingCount) {
        processingCount.textContent = processingOrders.length;
    }
    if (completedCount) {
        completedCount.textContent = completedOrders.length;
    }
    const tableBody = document.getElementById("mtcAdminOrdersTableBody");

    const emptyMessage = document.getElementById("mtcAdminOrdersEmpty");
    // =========================================
    // NO ORDERS
    // =========================================
    if (allOrders.length === 0) {
        tableBody.innerHTML = "";
        if (emptyMessage) {
            emptyMessage.style.display = "block";
        }
        return;
    }

    // =========================================
    // DISPLAY ORDERS
    // =========================================
    function renderOrdersPage() {
        const totalPages = Math.ceil(allOrders.length / ordersPerPage);

        const startIndex = (currentPage - 1) * ordersPerPage;

        const endIndex = startIndex + ordersPerPage;

        const pagedOrders = allOrders.slice(startIndex, endIndex);

        if (paginationInfo) {
            paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        }

        if (previousButton) {
            previousButton.disabled = currentPage <= 1;
        }

        if (nextButton) {
            nextButton.disabled = currentPage >= totalPages;
        }

        tableBody.innerHTML = pagedOrders
            .map((order) => {
                const payment = payments?.find((payment) => String(payment.order_id) === String(order.id));

                const cardLast4 = payment?.card_last4 || "—";
                const customer = order.customer_name || order.customer_email || "Guest";
                const itemQuantity = orderItems
                    .filter((item) => String(item.order_id) === String(order.id))
                    .reduce((total, item) => total + Number(item.item_quantity || 0), 0);
                const formattedDate = new Date(order.created_at).toLocaleDateString("en-US", {
                    timeZone: "America/Chicago",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                });
                const refundedAmount = Number(payment?.refund_amount || 0);

                const orderTotal =
                    Number(order.subtotal || 0) +
                    Number(order.shipping_amount || 0) +
                    Number(order.tax_amount || 0) -
                    Number(order.discount_amount || 0) -
                    refundedAmount;
                const formattedTotal = orderTotal.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                });
                const status = order.order_status || "pending";
                const statusLabel =
                    status === "partially_refunded"
                        ? "Partially Refunded"
                        : status === "refunded"
                          ? "Fully Refunded"
                          : status;
                return `
                    <tr data-order-row-id="${order.id}">
                       <td>
                            ${order.order_id}
                        </td>

                        <td>
                            ${customer}
                        </td>

                        <td>
                            ${order.customer_email || "—"}
                        </td>

                        <td>
                            ${cardLast4}
                        </td>

                        <td>
                            ${formattedDate}
                        </td>

                        <td>
                            ${itemQuantity}
                        </td>

                        <td class="mtc-admin-order-total">
    ${formattedTotal}
</td>
                    <td>
                        <div class="mtc-admin-order-status-actions">

                                <button
                                type="button"
                                class="mtc-admin-orders-view-button"
                                data-order-id="${order.id}">
                                Order Details
                                </button>

                                <span class="mw-order-status mw-order-${status.toLowerCase()}">
                                ${statusLabel}
                                </span>

                        </div>
                        </td>
                        </tr>
                        `;
            })
            .join("");
    }

    renderOrdersPage();
    // =========================================
    // REALTIME NEW ORDERS
    // =========================================
    adminSupabase
        .channel("mtc-admin-orders-realtime")
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "Orders",
            },
            async (payload) => {
                console.log("REALTIME ORDER EVENT:", payload);

                const updatedOrder = payload.new;

                const orderIndex = allOrders.findIndex((order) => order.id === updatedOrder.id);

                if (orderIndex !== -1) {
                    allOrders[orderIndex] = {
                        ...allOrders[orderIndex],
                        ...updatedOrder,
                    };
                } else {
                    allOrders.unshift(updatedOrder);
                }

                const { data: refreshedOrderItems, error: refreshedOrderItemsError } = await adminSupabase
                    .from("Order_items")
                    .select("order_id, item_quantity")
                    .eq("order_id", updatedOrder.id);

                if (refreshedOrderItemsError) {
                    console.error("Realtime order items refresh error:", refreshedOrderItemsError);
                } else {
                    orderItems = orderItems.filter((item) => item.order_id !== updatedOrder.id);

                    orderItems.push(...(refreshedOrderItems || []));
                }

                renderOrdersPage();
            }
        )
        .subscribe((status) => {
            console.log("ORDERS REALTIME STATUS:", status);
        });

    if (orderIdFromNotification) {
        const targetOrderRow = document.querySelector(`[data-order-row-id="${orderIdFromNotification}"]`);

        if (targetOrderRow) {
            targetOrderRow.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });

            const updateButton = targetOrderRow.querySelector(".mtc-admin-orders-view-button");

            updateButton?.click();

            // Remove notification order ID from URL
            // so refreshing stays on the main Orders page.
            window.history.replaceState({}, document.title, "mtc-admin-orders.html");
        }
    }

    // =========================================
    // ADMIN SUCCESS ALERT
    // =========================================

    function showAdminSuccessAlert(title, message) {
        const existingAlert = document.getElementById("mtcAdminSuccessAlert");

        existingAlert?.remove();

        const alertBox = document.createElement("div");

        alertBox.id = "mtcAdminSuccessAlert";

        alertBox.className = "mtc-admin-success-alert";

        alertBox.innerHTML = `
        <div class="mtc-admin-success-alert-icon">
            <i class="fa-solid fa-check"></i>
        </div>

        <div class="mtc-admin-success-alert-content">
            <strong>
                ${escapeAdminHTML(title)}
            </strong>

            <p>
                ${escapeAdminHTML(message)}
            </p>
        </div>

        <button
            type="button"
            class="mtc-admin-success-alert-close"
            aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

        document.body.appendChild(alertBox);

        alertBox.querySelector(".mtc-admin-success-alert-close")?.addEventListener("click", () => {
            alertBox.remove();
        });
    }

    // =========================================
    // REFUND MODAL
    // =========================================

    function openRefundModal(order, refundAction, refundRequestId = null) {
        const existingModal = document.getElementById("mtcAdminRefundModal");

        existingModal?.remove();

        const payment = payments?.find((payment) => String(payment.order_id) === String(order.id));

        const refundedAmount = Number(payment?.refund_amount || 0);

        const orderTotal =
            Number(order.subtotal || 0) +
            Number(order.shipping_amount || 0) +
            Number(order.tax_amount || 0) -
            Number(order.discount_amount || 0) -
            refundedAmount;

        const formattedTotal = orderTotal.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
        });

        const modal = document.createElement("div");

        modal.id = "mtcAdminRefundModal";

        modal.innerHTML = `
        <div class="mtc-admin-refund-modal-card">

            <button
                type="button"
                class="mtc-admin-refund-modal-close"
                aria-label="Close Refund">
                <i class="fa-solid fa-xmark"></i>
            </button>

            <h3>
    ${refundAction === "direct" ? "Refund Order" : "Request Refund"}
</h3>

<p>
    ${
        refundAction === "direct"
            ? "Are you sure you want to process this refund?"
            : "Are you sure you want to submit this refund request?"
    }
</p>

<div class="mtc-admin-refund-order-info">

    <span>
        Order
    </span>

                <strong>
                    ${order.order_id || "—"}
                </strong>

            </div>

            <div class="mtc-admin-refund-order-info">

                <span>
                    Order Total
                </span>

                <strong>
                    ${formattedTotal}
                </strong>

            </div>

            <label
                for="mtcAdminRefundAmount">
                Refund Amount
            </label>

            <input
                type="number"
                id="mtcAdminRefundAmount"
                min="0.01"
                max="${orderTotal.toFixed(2)}"
                step="0.01"
                value="${orderTotal.toFixed(2)}">

            <label
                for="mtcAdminRefundReason">
                Reason for Refund
            </label>

            <textarea
                id="mtcAdminRefundReason"
                placeholder="Enter reasoning for this refund request..."
                required></textarea>

            <div class="mtc-admin-refund-modal-actions">

    <button
        type="button"
        class="mtc-admin-refund-cancel">
        Cancel
    </button>

    <button
        type="button"
        class="mtc-admin-refund-submit"
        data-order-id="${order.id}">
        ${refundAction === "direct" ? "Process Refund" : "Submit Refund Request"}
    </button>

</div>

        </div>
    `;

        document.body.appendChild(modal);

        const closeButton = modal.querySelector(".mtc-admin-refund-modal-close");

        const cancelButton = modal.querySelector(".mtc-admin-refund-cancel");

        closeButton?.addEventListener("click", () => {
            modal.remove();
        });
        const submitButton = modal.querySelector(".mtc-admin-refund-submit");

        submitButton?.addEventListener("click", async () => {
            const refundAmountInput = modal.querySelector("#mtcAdminRefundAmount");

            const refundReasonInput = modal.querySelector("#mtcAdminRefundReason");

            const refundAmount = Number(refundAmountInput.value);

            const refundReason = refundReasonInput.value.trim();

            // =============================================
            // VALIDATE REFUND AMOUNT
            // =============================================

            if (!refundAmount || refundAmount <= 0) {
                alert("Please enter a valid refund amount.");
                return;
            }

            if (refundAmount > orderTotal) {
                alert("Refund amount cannot be greater than the order total.");
                return;
            }

            // =============================================
            // VALIDATE REFUND REASON
            // =============================================

            if (!refundReason) {
                alert("Please enter a reason for the refund.");
                return;
            }

            // =============================================
            // GET ADMIN SESSION
            // =============================================

            const { data: sessionData, error: sessionError } = await adminSupabase.auth.getSession();

            const session = sessionData?.session;

            if (sessionError || !session?.access_token) {
                alert("Your Admin session has expired. Please log in again.");

                return;
            }

            // =============================================
            // DISABLE BUTTON
            // =============================================

            submitButton.disabled = true;

            submitButton.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Submitting...
        `;

            if (refundAction === "direct") {
                const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-refund", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",

                        Authorization: `Bearer ${session.access_token}`,
                    },

                    body: JSON.stringify({
                        orderId: order.id,

                        refundAmount: refundAmount,

                        refundReason: refundReason,

                        refundRequestId: refundRequestId,
                    }),
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.error || "Unable to process refund.");
                }
                const paymentRecord = payments?.find((payment) => String(payment.order_id) === String(order.id));

                if (paymentRecord) {
                    paymentRecord.refund_amount = Number(paymentRecord.refund_amount || 0) + refundAmount;
                }

                if (paymentRecord) {
                    paymentRecord.payment_status =
                        result.orderStatus === "refunded" ? "refunded" : "partially_refunded";

                    paymentRecord.last_refunded_at = new Date().toISOString();
                }

                order.order_status = result.orderStatus;

                order.updated_at = new Date().toISOString();

                renderRefundHistory(refundHistorySearch?.value || "");

                if (result.orderStatus === "refunded") {
                    allOrders = allOrders.filter((existingOrder) => String(existingOrder.id) !== String(order.id));

                    currentPage = 1;

                    renderOrdersPage();
                }

                modal.remove();

                showAdminSuccessAlert("Refund Processed", "The refund was processed successfully.");
                const refundAmountCents = Math.round(refundAmount * 100);

                const orderTotalCents = Math.round(orderTotal * 100);

                const newRefundStatus = refundAmountCents >= orderTotalCents ? "refunded" : "partially_refunded";

                const orderRow = document.querySelector(`[data-order-row-id="${order.id}"]`);

                const orderTotalCell = orderRow?.querySelector(".mtc-admin-order-total");

                if (orderTotalCell) {
                    const updatedOrderTotal =
                        Number(order.subtotal || 0) +
                        Number(order.shipping_amount || 0) +
                        Number(order.tax_amount || 0) -
                        Number(order.discount_amount || 0) -
                        Number(paymentRecord?.refund_amount || 0);

                    orderTotalCell.textContent = updatedOrderTotal.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                    });
                }

                const statusBadge = orderRow?.querySelector(".mw-order-status");

                if (statusBadge) {
                    statusBadge.className = `mw-order-status mw-order-${newRefundStatus}`;

                    statusBadge.textContent = newRefundStatus === "refunded" ? "Fully Refunded" : "Partially Refunded";
                }

                return;
            }
            try {
                // =============================================
                // CREATE REFUND REQUEST
                // =============================================

                const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-refund-request", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",

                        Authorization: `Bearer ${session.access_token}`,
                    },

                    body: JSON.stringify({
                        orderId: order.id,

                        refundAmount: refundAmount,

                        refundReason: refundReason,
                    }),
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.error || "Unable to submit refund request.");
                }

                // =============================================
                // SUCCESS
                // =============================================

                modal.remove();

                showAdminSuccessAlert("Refund Request Submitted", "The refund request was submitted successfully.");
            } catch (error) {
                console.error("REFUND REQUEST ERROR:", error);

                alert(error.message || "Unable to submit refund request.");
            } finally {
                if (document.body.contains(submitButton)) {
                    submitButton.disabled = false;

                    submitButton.innerHTML = `
                    Submit Refund
                `;
                }
            }
        });
        cancelButton?.addEventListener("click", () => {
            modal.remove();
        });
    }

    // =========================================
    // REFUND REQUEST REVIEW
    // PROCESS / DECLINE
    // =========================================

    document.addEventListener("click", async (event) => {
        const processButton = event.target.closest(".mtc-admin-refund-process-request");

        const declineButton = event.target.closest(".mtc-admin-refund-decline-request");

        if (!processButton && !declineButton) {
            return;
        }

        // =========================================
        // VERIFY PERMISSION
        // =========================================

        if (!currentAdminCanProcessRefund) {
            alert("You do not have permission to process refund requests.");

            return;
        }

        const actionButton = processButton || declineButton;

        const refundRequestId = actionButton.dataset.refundRequestId;

        if (!refundRequestId) {
            alert("Refund request ID was not found.");

            return;
        }

        const decision = processButton ? "approve" : "decline";

        // =========================================
        // APPROVE REFUND REQUEST
        // Go directly to existing Refund Order box
        // =========================================

        if (decision === "approve") {
            const refundOrder = selectedAdminOrder;

            if (!refundOrder) {
                alert("Unable to load this order.");
                return;
            }

            openRefundModal(refundOrder, "direct", refundRequestId);

            return;
        }

        // =========================================
        // REVIEW REASON
        // Decline requires reason.
        // Approve gets reason from Refund Order box.
        // =========================================

        let reviewReason = "";

        if (decision === "decline") {
            reviewReason = window.prompt("Enter the reason for declining this refund:");

            // Cancel was clicked
            if (reviewReason === null) {
                return;
            }
        }

        const cleanReviewReason = reviewReason.trim();

        if (decision === "decline" && !cleanReviewReason) {
            alert("A reason is required.");

            return;
        }

        // =========================================
        // ADMIN SESSION
        // =========================================

        const { data: sessionData, error: sessionError } = await adminSupabase.auth.getSession();

        const session = sessionData?.session;

        if (sessionError || !session?.access_token) {
            alert("Your Admin session has expired. Please log in again.");

            return;
        }

        // =========================================
        // DISABLE BUTTON
        // =========================================

        actionButton.disabled = true;

        const originalButtonText = actionButton.textContent;

        actionButton.textContent = decision === "approve" ? "Approving..." : "Declining...";

        try {
            // =========================================
            // REVIEW REFUND REQUEST
            // =========================================

            const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-refund-request/review", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    Authorization: `Bearer ${session.access_token}`,
                },

                body: JSON.stringify({
                    refundRequestId: refundRequestId,

                    decision: decision,

                    reviewReason: cleanReviewReason,
                }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || "Unable to review refund request.");
            }

            // =========================================
            // APPROVED
            // HAND OFF TO ORIGINAL REFUND SYSTEM
            // =========================================

            if (decision === "approve") {
                const refundOrder = selectedAdminOrder;

                if (!refundOrder) {
                    throw new Error("Unable to find the order for this refund.");
                }

                // Close Order Details
                const orderDetailsModal = document.getElementById("mtcAdminOrdersModal");

                orderDetailsModal?.classList.remove("open");

                orderDetailsModal?.setAttribute("aria-hidden", "true");

                // IMPORTANT:
                // This opens the ORIGINAL Full / Partial
                // refund processing modal.
                openRefundModal(refundOrder, "direct", refundRequestId);

                return;
            }

            // =========================================
            // DECLINED
            // =========================================

            showAdminSuccessAlert("Refund Request Declined", "The refund request was declined successfully.");

            // Close Order Details so stale
            // Pending information is not displayed.
            const orderDetailsModal = document.getElementById("mtcAdminOrdersModal");

            orderDetailsModal?.classList.remove("open");

            orderDetailsModal?.setAttribute("aria-hidden", "true");
        } catch (error) {
            console.error("REFUND REQUEST REVIEW ERROR:", error);

            alert(error.message || "Unable to review refund request.");

            actionButton.disabled = false;

            actionButton.textContent = originalButtonText;
        }
    });

    // =========================================
    // REFUND BUTTON CLICK
    // =========================================

    document.addEventListener("click", (event) => {
        const refundButton = event.target.closest(".mtc-admin-order-refund-button");

        if (!refundButton) {
            return;
        }

        const orderId = refundButton.dataset.orderId;

        const refundAction = refundButton.dataset.refundAction;

        const order = allOrders.find((order) => String(order.id) === String(orderId));

        if (!order) {
            console.error("Refund order not found:", orderId);

            return;
        }

        openRefundModal(order, refundAction);
    });

    previousButton?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;

            sessionStorage.setItem("mtcAdminOrdersCurrentPage", String(currentPage));

            renderOrdersPage();
        }
    });

    nextButton?.addEventListener("click", () => {
        const totalPages = Math.ceil(allOrders.length / ordersPerPage);

        if (currentPage < totalPages) {
            currentPage++;

            sessionStorage.setItem("mtcAdminOrdersCurrentPage", String(currentPage));

            renderOrdersPage();
        }
    });

    const ordersSearchInput = document.getElementById("mtcAdminOrdersSearch");
    // =========================================
    // SEARCH ORDERS
    // =========================================

    ordersSearchInput?.addEventListener("input", () => {
        const searchTerm = ordersSearchInput.value.trim().toLowerCase();

        const filteredOrders = allOrders.filter((order) => {
            const orderNumber = String(order.order_id || "").toLowerCase();

            const customerName = String(order.customer_name || "").toLowerCase();

            const customerEmail = String(order.customer_email || "").toLowerCase();

            const orderStatus = String(order.order_status || "").toLowerCase();

            return (
                orderNumber.includes(searchTerm) ||
                customerName.includes(searchTerm) ||
                customerEmail.includes(searchTerm) ||
                orderStatus.includes(searchTerm)
            );
        });

        if (filteredOrders.length === 0) {
            tableBody.innerHTML = "";

            if (emptyMessage) {
                emptyMessage.style.display = "block";
            }

            return;
        }

        if (emptyMessage) {
            emptyMessage.style.display = "none";
        }

        tableBody.innerHTML = filteredOrders
            .map((order) => {
                const customer = order.customer_name || order.customer_email || "Guest";

                const itemQuantity = orderItems
                    .filter((item) => String(item.order_id) === String(order.id))
                    .reduce((total, item) => total + Number(item.item_quantity || 0), 0);

                const formattedDate = new Date(order.created_at).toLocaleDateString("en-US", {
                    timeZone: "America/Chicago",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                });

                const payment = payments?.find((payment) => String(payment.order_id) === String(order.id));

                const refundedAmount = Number(payment?.refund_amount || 0);

                const orderTotal =
                    Number(order.subtotal || 0) +
                    Number(order.shipping_amount || 0) +
                    Number(order.tax_amount || 0) -
                    Number(order.discount_amount || 0) -
                    refundedAmount;

                const formattedTotal = orderTotal.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                });

                const status = String(order.order_status || "pending");

                const safeStatusClass = status.toLowerCase().replace(/[^a-z0-9_-]/g, "");

                const statusLabel =
                    status === "partially_refunded"
                        ? "Partially Refunded"
                        : status === "refunded"
                          ? "Fully Refunded"
                          : status;

                return `
                            <tr>
                                <td>
                                    ${escapeAdminHTML(order.order_id)}
                                </td>

                                <td>
                                    ${escapeAdminHTML(customer)}
                                </td>

                                <td>
                                    ${escapeAdminHTML(order.customer_email || "—")}
                                </td>

                                <td>
                                    ${escapeAdminHTML(cardLast4)}
                                </td>

                               <td class="mtc-admin-order-total">
                                    ${escapeAdminHTML(formattedTotal)}
                                </td>

                                <td>
                                    ${escapeAdminHTML(itemQuantity)}
                                </td>

                                <td class="mtc-admin-order-total">
                                    ${formattedTotal}
                                </td>

                                <td>
                                    <div class="mtc-admin-order-status-actions">

                                        <button
                                            type="button"
                                            class="mtc-admin-orders-view-button"
                                            data-order-id="${escapeAdminHTML(order.id)}">
                                            Update
                                        </button>

                                        <span class="mw-order-status mw-order-${status.toLowerCase()}">
                                            ${statusLabel}
                                        </span>

                                    </div>
                                </td>
                            </tr>
                        `;
            })
            .join("");
    });
});

/* =========================================
   VIEW ORDER DETAILS
========================================= */
let selectedAdminOrder = null;
document.addEventListener("click", async (event) => {
    const viewButton = event.target.closest(".mtc-admin-orders-view-button");
    if (!viewButton) {
        return;
    }
    const orderId = viewButton.dataset.orderId;

    const urlParams = new URLSearchParams(window.location.search);

    const orderAction = urlParams.get("action");

    const isReadOnlyOrderDetails =
        viewButton.dataset.readOnly === "true" || orderAction === "open_order_details_read_only";
    const modal = document.getElementById("mtcAdminOrdersModal");
    const modalSubtitle = document.getElementById("mtcAdminOrdersModalSubtitle");
    const modalContent = document.getElementById("mtcAdminOrdersModalContent");
    if (!modal || !modalContent) {
        return;
    }
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    modalSubtitle.textContent = "Loading order...";
    modalContent.innerHTML = `
            <div class="mtc-admin-orders-loading">
                Loading...
            </div>
        `;
    const { data: order, error } = await adminSupabase.from("Orders").select("*").eq("id", orderId).single();
    if (error || !order) {
        console.error("Order details error:", error);
        const { data: orderItemDetails, error: orderItemsDetailsError } = await adminSupabase
            .from("Order_items")
            .select(
                `
            id,
            product_name,
            sku,
            item_quantity,
            unit_price,
            total_price
        `
            )
            .eq("order_id", order.id);

        if (orderItemsDetailsError) {
            console.error("Order item details error:", orderItemsDetailsError);
        }
        const orderItemsHtml = (orderItemDetails || [])
            .map(
                (item) => `
            <div
                class="mtc-order-details-row"
                data-order-item-id="${item.id}">
                <div>
                    <div class="mtc-order-details-value">
                        ${item.product_name || "Product"}
                    </div>
                    <div class="mtc-order-details-label">
                        SKU: ${item.sku || "—"}
                    </div>
                </div>
                <div class="mtc-order-item-quantity-controls">
                    <button
                        type="button"
                        class="mtc-order-item-minus">
                        −
                    </button>
                    <input
                        type="number"
                        class="mtc-order-item-quantity"
                        value="${item.item_quantity || 1}"
                        min="1">
                    <button
                        type="button"
                        class="mtc-order-item-plus">
                        +
                    </button>
                    <button
                        type="button"
                        class="mtc-order-item-quantity-update">
                        Update
                    </button>
                </div>
            </div>
        `
            )
            .join("");
        modalContent.innerHTML = `
                <p>Unable to load order.</p>
            `;
        return;
    }
    selectedAdminOrder = order;
    const updateOrderButton = document.getElementById("mtcAdminOrdersModalSave");

    if (updateOrderButton) {
        updateOrderButton.style.display = currentAdminCanEditOrders && !isReadOnlyOrderDetails ? "" : "none";
    }

    console.log("ORDER CUSTOMER ID:", order.customer_id);
    console.log("MODAL ORDER STATUS:", order.order_status);
    modalSubtitle.textContent = order.order_id || "Order Details";
    const { data: orderItemDetails, error: orderItemsDetailsError } = await adminSupabase
        .from("Order_items")
        .select(
            `
                    id,
                    product_name,
                    sku,
                    item_quantity,
                    unit_price,
                    total_price
                `
        )
        .eq("order_id", order.id);

    if (orderItemsDetailsError) {
        console.error("Order item details error:", orderItemsDetailsError);
    }

    // =========================================
    // LOAD CUSTOMER INFORMATION
    // =========================================

    let customerDetails = null;

    if (order.customer_id) {
        const { data: customerData, error: customerError } = await adminSupabase
            .from("Customers")
            .select(
                `
            id,
            first_name,
            last_name,
            email,
            phone
        `
            )
            .eq("id", order.customer_id)
            .maybeSingle();

        if (customerError) {
            console.error("Order customer details error:", customerError);
        } else {
            customerDetails = customerData;
        }
    }

    // =========================================
    // LOAD REFUND REQUEST
    // =========================================

    let orderRefundRequest = null;

    const { data: refundRequestData, error: refundRequestLoadError } = await adminSupabase
        .from("Refund_Requests")
        .select(
            `
        id,
        order_id,
        order_number,
        refund_amount,
        request_reason,
        status,
        requested_by_name,
        requested_by_email,
        requested_by_position,
        requested_at,
        reviewed_by_name,
        reviewed_by_email,
        reviewed_by_position,
        review_reason,
        reviewed_at,
        stripe_refund_id,
        refunded_at
    `
        )
        .eq("order_id", order.id)
        .order("requested_at", {
            ascending: false,
        })
        .limit(1)
        .maybeSingle();

    if (refundRequestLoadError) {
        console.error("ORDER REFUND REQUEST LOAD ERROR:", refundRequestLoadError);
    } else {
        orderRefundRequest = refundRequestData;
    }

    // =========================================
    // LOAD ORDER SHIPPING / TRACKING
    // =========================================

    let orderShippingDetails = null;

    const { data: shippingData, error: shippingError } = await adminSupabase
        .from("Shipping")
        .select(
            `
        id,
        order_id,
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
        console.error("Order shipping details error:", shippingError);
    } else {
        orderShippingDetails = shippingData;
    }

    // =========================================
    // LOAD ENABLED SHIPPING CARRIERS
    // =========================================

    let enabledShippingCarriers = [];

    const { data: carrierData, error: carrierError } = await adminSupabase
        .from("Shipping_Carriers")
        .select(
            `
        carrier_name,
        is_enabled,
        sort_order
    `
        )
        .eq("is_enabled", true)
        .order("sort_order", {
            ascending: true,
        });

    if (carrierError) {
        console.error("Order shipping carriers error:", carrierError);
    } else {
        enabledShippingCarriers = carrierData || [];
    }

    // =========================================
    // LOAD SHIPPING ADDRESS
    // =========================================

    let shippingAddress = null;

    if (order.customer_id) {
        const { data: addressData, error: addressError } = await adminSupabase
            .from("Addresses")
            .select(
                `
            id,
            customer_id,
            address_type,
            first_name,
            last_name,
            address_line_1,
            address_line_2,
            city,
            state,
            postal_code,
            country,
            phone,
            is_default
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
            console.error("Order shipping address error:", addressError);
        } else {
            shippingAddress = addressData;
            console.log("SHIPPING ADDRESS FROM SUPABASE:", shippingAddress);
            console.log("SHIPPING ADDRESS ERROR:", addressError);
        }
    }

    // =========================================
    // CUSTOMER DISPLAY VALUES
    // =========================================

    const customerFullName =
        [customerDetails?.first_name, customerDetails?.last_name].filter(Boolean).join(" ") ||
        order.customer_name ||
        "Guest";

    const customerEmail = customerDetails?.email || order.customer_email || "—";

    const rawCustomerPhone = shippingAddress?.phone || customerDetails?.phone || "";

    let phoneDigits = rawCustomerPhone.replace(/\D/g, "");

    if (phoneDigits.length === 11 && phoneDigits.startsWith("1")) {
        phoneDigits = phoneDigits.slice(1);
    }

    const customerPhone =
        phoneDigits.length === 10
            ? `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`
            : rawCustomerPhone || "—";

    // =========================================
    // SHIPPING ADDRESS DISPLAY
    // =========================================

    const shippingAddressLines = [];

    if (shippingAddress?.address_line_1) {
        shippingAddressLines.push(shippingAddress.address_line_1);
    }

    if (shippingAddress?.address_line_2) {
        shippingAddressLines.push(shippingAddress.address_line_2);
    }

    const shippingCityStatePostal = [shippingAddress?.city, shippingAddress?.state, shippingAddress?.postal_code]
        .filter(Boolean)
        .join(", ")
        .replace(/,\s([^,]+)$/, " $1");

    if (shippingCityStatePostal) {
        shippingAddressLines.push(shippingCityStatePostal);
    }

    if (shippingAddress?.country) {
        shippingAddressLines.push(shippingAddress.country);
    }

    const shippingAddressHtml = shippingAddressLines.length > 0 ? shippingAddressLines.join("<br>") : "—";

    // =========================================
    // ORDER SUMMARY VALUES
    // =========================================

    const orderSubtotal = Number(order.subtotal || 0);

    const orderShipping = Number(order.shipping_amount || 0);

    const orderTax = Number(order.tax_amount || 0);

    const orderDiscount = Number(order.discount_amount || 0);

    const orderTotal = orderSubtotal + orderShipping + orderTax - orderDiscount;

    const formatOrderMoney = (amount) =>
        Number(amount || 0).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
        });

    const orderItemsHtml = (orderItemDetails || [])
        .map(
            (item) => `
    <div
        class="mtc-order-details-row"
        data-order-item-id="${item.id}">
        <div>
            <div class="mtc-order-details-value">
                ${item.product_name || "Product"}
            </div>

            <div class="mtc-order-details-label">
                SKU: ${item.sku || "—"}
            </div>
        </div>

        <div class="mtc-order-details-value">
            Quantity: ${item.item_quantity || 1}
        </div>
    </div>
`
        )
        .join("");

    // =========================================================
    // BUILD ORDER DETAILS MODAL SAFELY
    // No customer/database content is inserted with innerHTML
    // =========================================================

    modalContent.replaceChildren();

    // =========================================================
    // HELPERS
    // =========================================================

    function createOrderDetailsSection(title) {
        const section = document.createElement("div");

        section.className = "mtc-order-details-section";

        const heading = document.createElement("h3");

        heading.textContent = title;

        section.appendChild(heading);

        return section;
    }

    function createOrderDetailsRow(labelText, valueText, valueClass = "mtc-order-details-value") {
        const row = document.createElement("div");

        row.className = "mtc-order-details-row";

        const label = document.createElement("span");

        label.className = "mtc-order-details-label";

        label.textContent = labelText;

        const value = document.createElement("span");

        value.className = valueClass;

        value.textContent = valueText ?? "—";

        row.append(label, value);

        return row;
    }

    // =========================================================
    // MAIN ORDER DETAILS CONTAINER
    // =========================================================

    const orderDetails = document.createElement("div");

    orderDetails.className = "mtc-order-details";

    // =========================================================
    // CUSTOMER INFORMATION
    // =========================================================

    const customerSection = createOrderDetailsSection("Customer Information");

    customerSection.appendChild(createOrderDetailsRow("Name", customerFullName || "—"));

    customerSection.appendChild(createOrderDetailsRow("Email", customerEmail || "—"));

    customerSection.appendChild(createOrderDetailsRow("Phone", customerPhone || "—"));

    // =========================================================
    // SHIPPING ADDRESS
    // =========================================================

    const addressRow = document.createElement("div");

    addressRow.className = "mtc-order-details-row";

    const addressLabel = document.createElement("span");

    addressLabel.className = "mtc-order-details-label";

    addressLabel.textContent = "Shipping Address";

    const addressValue = document.createElement("span");

    addressValue.className = "mtc-order-details-value mtc-order-details-address";

    // IMPORTANT:
    // Use the original address values here,
    // NOT shippingAddressHtml.

    if (shippingAddress) {
        const addressParts = [
            shippingAddress.address_line_1,
            shippingAddress.address_line_2,
            shippingAddress.city,
            shippingAddress.state,
            shippingAddress.postal_code,
            shippingAddress.country,
        ]
            .filter(Boolean)
            .map((value) => String(value).trim());

        addressValue.textContent = addressParts.length ? addressParts.join(", ") : "Not available";
    } else {
        addressValue.textContent = "Not available";
    }

    addressRow.append(addressLabel, addressValue);

    customerSection.appendChild(addressRow);

    orderDetails.appendChild(customerSection);

    // =========================================================
    // SHIPPING INFORMATION
    // =========================================================

    const shippingSection = createOrderDetailsSection("Shipping Information");

    shippingSection.appendChild(
        createOrderDetailsRow("Shipping Method", orderShippingDetails?.shipping_method || "Not available")
    );

    shippingSection.appendChild(
        createOrderDetailsRow("Shipping Status", orderShippingDetails?.shipping_status || "Not Shipped")
    );

    // =========================================================
    // CARRIER
    // =========================================================

    const carrierRow = document.createElement("div");

    carrierRow.className = "mtc-order-details-row";

    const carrierLabel = document.createElement("label");

    carrierLabel.className = "mtc-order-details-label";

    carrierLabel.htmlFor = "mtcAdminOrderCarrier";

    carrierLabel.textContent = "Carrier";

    const carrierSelect = document.createElement("select");

    carrierSelect.id = "mtcAdminOrderCarrier";

    const carrierPlaceholder = document.createElement("option");

    carrierPlaceholder.value = "";

    carrierPlaceholder.textContent = "Select Carrier";

    carrierSelect.appendChild(carrierPlaceholder);

    const currentCarrier = String(orderShippingDetails?.carrier || "")
        .trim()
        .toLowerCase();

    (enabledShippingCarriers || []).forEach((carrier) => {
        const carrierName = String(carrier?.carrier_name || "").trim();

        if (!carrierName) {
            return;
        }

        const option = document.createElement("option");

        option.value = carrierName;

        option.textContent = carrierName;

        if (carrierName.toLowerCase() === currentCarrier) {
            option.selected = true;
        }

        carrierSelect.appendChild(option);
    });

    carrierRow.append(carrierLabel, carrierSelect);

    shippingSection.appendChild(carrierRow);

    // =========================================================
    // TRACKING NUMBER
    // =========================================================

    const trackingRow = document.createElement("div");

    trackingRow.className = "mtc-order-details-row";

    const trackingLabel = document.createElement("label");

    trackingLabel.className = "mtc-order-details-label";

    trackingLabel.htmlFor = "mtcAdminOrderTrackingNumber";

    trackingLabel.textContent = "Tracking Number";

    const trackingInput = document.createElement("input");

    trackingInput.type = "text";

    trackingInput.id = "mtcAdminOrderTrackingNumber";

    trackingInput.value = String(orderShippingDetails?.tracking_number || "");

    trackingInput.placeholder = "Enter tracking number";

    trackingInput.autocomplete = "off";

    trackingInput.maxLength = 100;

    trackingRow.append(trackingLabel, trackingInput);

    shippingSection.appendChild(trackingRow);

    // =========================================================
    // ORDER STATUS
    // =========================================================

    const statusRow = document.createElement("div");

    statusRow.className = "mtc-order-details-row";

    const statusLabel = document.createElement("label");

    statusLabel.className = "mtc-order-details-label";

    statusLabel.htmlFor = "mtcAdminOrderStatusSelect";

    statusLabel.textContent = "Order Status";

    const statusSelect = document.createElement("select");

    statusSelect.id = "mtcAdminOrderStatusSelect";

    [
        ["pending", "Pending"],
        ["processing", "Processing"],
        ["completed", "Completed"],
    ].forEach(([value, text]) => {
        const option = document.createElement("option");

        option.value = value;

        option.textContent = text;

        statusSelect.appendChild(option);
    });

    const currentOrderStatus = String(order.order_status || "pending").toLowerCase();

    if (["pending", "processing", "completed"].includes(currentOrderStatus)) {
        statusSelect.value = currentOrderStatus;
    }

    statusRow.append(statusLabel, statusSelect);

    shippingSection.appendChild(statusRow);

    if (!isReadOnlyOrderDetails) {
        orderDetails.appendChild(shippingSection);
    }

    // =========================================================
    // ORDER ITEMS
    // =========================================================

    const itemsSection = createOrderDetailsSection("Order Items");

    if (Array.isArray(orderItemDetails) && orderItemDetails.length > 0) {
        orderItemDetails.forEach((item) => {
            const itemRow = document.createElement("div");

            itemRow.className = "mtc-order-details-row";

            const itemName = document.createElement("span");

            itemName.className = "mtc-order-details-label";

            itemName.textContent = item.product_name || item.name || "Item";

            const itemValue = document.createElement("span");

            itemValue.className = "mtc-order-details-value";

            const quantity = Number(item.item_quantity || item.quantity || 0);

            const price = Number(item.item_price || item.price || 0);

            itemValue.textContent = `${quantity} × ${formatOrderMoney(price)}`;

            itemRow.append(itemName, itemValue);

            itemsSection.appendChild(itemRow);
        });
    } else {
        const noItems = document.createElement("div");

        noItems.className = "mtc-order-details-row";

        const noItemsText = document.createElement("span");

        noItemsText.className = "mtc-order-details-label";

        noItemsText.textContent = "No items found";

        noItems.appendChild(noItemsText);

        itemsSection.appendChild(noItems);
    }

    orderDetails.appendChild(itemsSection);

    // =========================================================
    // ORDER INFORMATION
    // =========================================================

    const informationSection = createOrderDetailsSection("Order Information");

    informationSection.appendChild(
        createOrderDetailsRow("Payment Status", order.payment_status || "pending", "mtc-order-payment-status")
    );

    orderDetails.appendChild(informationSection);

    // =========================================================
    // ORDER SUMMARY
    // =========================================================

    const summarySection = createOrderDetailsSection("Order Summary");

    summarySection.classList.add("mtc-order-summary-section");

    summarySection.appendChild(createOrderDetailsRow("Subtotal", formatOrderMoney(orderSubtotal)));

    summarySection.appendChild(createOrderDetailsRow("Shipping", formatOrderMoney(orderShipping)));

    summarySection.appendChild(createOrderDetailsRow("Tax", formatOrderMoney(orderTax)));

    summarySection.appendChild(createOrderDetailsRow("Discount", `-${formatOrderMoney(orderDiscount)}`));

    // =========================================================
    // TOTAL
    // =========================================================

    const totalRow = createOrderDetailsRow("Total", formatOrderMoney(orderTotal));

    totalRow.classList.add("mtc-order-summary-total");

    summarySection.appendChild(totalRow);

    orderDetails.appendChild(summarySection);

    // =========================================================
    // REFUND SECTION
    // =========================================================

    const refundSection = document.createElement("div");

    refundSection.className = "mtc-admin-order-refund-section";

    // =========================================================
    // REFUND REQUEST DETAILS
    // =========================================================

    if (orderRefundRequest) {
        const refundRequestDetails = createOrderDetailsSection("Refund Request");

        const refundRequestStatus = String(orderRefundRequest.status || "Pending");

        const refundRequestAmount = formatOrderMoney(orderRefundRequest.refund_amount);

        const refundRequestedBy =
            orderRefundRequest.requested_by_name || orderRefundRequest.requested_by_email || "Admin";

        const refundRequestedDate = orderRefundRequest.requested_at
            ? new Date(orderRefundRequest.requested_at).toLocaleString("en-US", {
                  timeZone: "America/Chicago",
              })
            : "—";

        refundRequestDetails.appendChild(createOrderDetailsRow("Status", refundRequestStatus));

        refundRequestDetails.appendChild(createOrderDetailsRow("Refund Amount", refundRequestAmount));

        refundRequestDetails.appendChild(createOrderDetailsRow("Requested By", refundRequestedBy));

        refundRequestDetails.appendChild(createOrderDetailsRow("Requested", refundRequestedDate));

        refundRequestDetails.appendChild(
            createOrderDetailsRow("Request Reason", orderRefundRequest.request_reason || "—")
        );

        // =========================================
        // REFUND REQUEST RESULT
        // =========================================

        const normalizedRefundRequestStatus = String(orderRefundRequest.status || "")
            .trim()
            .toLowerCase();

        if (normalizedRefundRequestStatus === "processed" || normalizedRefundRequestStatus === "declined") {
            const reviewedByName =
                orderRefundRequest.reviewed_by_name || orderRefundRequest.reviewed_by_email || "Admin";

            const reviewedByPosition = orderRefundRequest.reviewed_by_position || "";

            const reviewedBy = reviewedByPosition ? `${reviewedByName} — ${reviewedByPosition}` : reviewedByName;

            // =========================================
            // PROCESSED REFUND
            // =========================================

            if (normalizedRefundRequestStatus === "processed") {
                const processedDate = orderRefundRequest.refunded_at || orderRefundRequest.reviewed_at;

                const formattedProcessedDate = processedDate
                    ? new Date(processedDate).toLocaleString("en-US", {
                          timeZone: "America/Chicago",
                      })
                    : "—";

                refundRequestDetails.appendChild(createOrderDetailsRow("Approved By", reviewedBy));

                refundRequestDetails.appendChild(createOrderDetailsRow("Approved", formattedProcessedDate));

                refundRequestDetails.appendChild(
                    createOrderDetailsRow("Approval Reason", orderRefundRequest.review_reason || "—")
                );
            }

            // =========================================
            // DECLINED REFUND
            // =========================================

            if (normalizedRefundRequestStatus === "declined") {
                const declinedDate = orderRefundRequest.reviewed_at
                    ? new Date(orderRefundRequest.reviewed_at).toLocaleString("en-US", {
                          timeZone: "America/Chicago",
                      })
                    : "—";

                refundRequestDetails.appendChild(createOrderDetailsRow("Declined By", reviewedBy));

                refundRequestDetails.appendChild(createOrderDetailsRow("Declined", declinedDate));

                refundRequestDetails.appendChild(
                    createOrderDetailsRow("Decline Reason", orderRefundRequest.review_reason || "—")
                );
            }
        }

        orderDetails.appendChild(refundRequestDetails);
    }

    let refundAction = null;
    let refundText = null;

    const refundRequestStatus = String(orderRefundRequest?.status || "")
        .trim()
        .toLowerCase();

    // =========================================================
    // PENDING REFUND REQUEST
    // =========================================================

    if (orderRefundRequest && refundRequestStatus === "pending") {
        if (currentAdminCanProcessRefund) {
            const reviewActions = document.createElement("div");

            reviewActions.className = "mtc-admin-refund-review-actions";

            // =========================================
            // PROCESS REFUND
            // =========================================

            const processRefundButton = document.createElement("button");

            processRefundButton.type = "button";

            processRefundButton.className = "mtc-admin-refund-process-request";

            processRefundButton.textContent = "Process Refund";

            processRefundButton.dataset.refundRequestId = String(orderRefundRequest.id);

            // =========================================
            // DECLINE REQUEST
            // =========================================

            const declineRefundButton = document.createElement("button");

            declineRefundButton.type = "button";

            declineRefundButton.className = "mtc-admin-refund-decline-request";

            declineRefundButton.textContent = "Decline Request";

            declineRefundButton.dataset.refundRequestId = String(orderRefundRequest.id);

            reviewActions.append(processRefundButton, declineRefundButton);

            refundSection.appendChild(reviewActions);
        }
    } else {
        // =====================================================
        // NORMAL REFUND / REQUEST REFUND BUTTON
        // =====================================================

        if (!isReadOnlyOrderDetails && currentAdminCanProcessRefund) {
            refundAction = "direct";
            refundText = "Refund";
        } else if (!isReadOnlyOrderDetails && currentAdminCanRequestRefund) {
            refundAction = "request";
            refundText = "Request Refund";
        }

        if (refundAction) {
            const refundButton = document.createElement("button");

            refundButton.type = "button";

            refundButton.className = "mtc-admin-order-refund-button";

            refundButton.dataset.orderId = String(order.id || "");

            refundButton.dataset.refundAction = refundAction;

            const refundIcon = document.createElement("i");

            refundIcon.className = "fa-solid fa-rotate-left";

            const refundButtonText = document.createTextNode(` ${refundText}`);

            refundButton.append(refundIcon, refundButtonText);

            refundSection.appendChild(refundButton);
        }
    }

    // =========================================================
    // ADD EVERYTHING TO MODAL
    // =========================================================

    modalContent.appendChild(orderDetails);

    // Show refund section for:
    // 1. Normal Order Details
    // 2. Pending refund requests opened from notifications
    const shouldShowRefundSection =
        !isReadOnlyOrderDetails ||
        (orderRefundRequest && refundRequestStatus === "pending" && currentAdminCanProcessRefund);

    if (shouldShowRefundSection) {
        modalContent.appendChild(refundSection);
    }

    const existingOrderStatusSelect = document.getElementById("mtcAdminOrderStatusSelect");

    if (existingOrderStatusSelect) {
        existingOrderStatusSelect.value = order.order_status || "pending";
    }

    const { data: shippingStatusData, error: shippingLoadError } = await adminSupabase
        .from("Shipping")
        .select("shipping_status")
        .eq("order_id", order.id)
        .maybeSingle();

    if (shippingLoadError) {
        console.error("Shipping status load error:", shippingLoadError);
    } else {
        const shippingStatusSelect = document.getElementById("mtcAdminShippingStatusSelect");

        if (shippingStatusSelect && shippingStatusData) {
            shippingStatusSelect.value = shippingStatusData.shipping_status || "Not Shipped";
        }
    }
});
document.addEventListener("click", async (event) => {
    const updateButton = event.target.closest("#mtcAdminShippingStatusUpdate");

    if (!updateButton) {
        return;
    }

    if (!currentAdminCanEditOrders) {
        alert("You do not have permission to edit orders.");
        return;
    }

    if (!selectedAdminOrder) {
        return;
    }

    const shippingStatusSelect = document.getElementById("mtcAdminShippingStatusSelect");

    if (!shippingStatusSelect) {
        return;
    }

    const newShippingStatus = shippingStatusSelect.value;

    const { error: shippingUpdateError } = await adminSupabase
        .from("Shipping")
        .update({
            shipping_status: newShippingStatus,
            carrier: newCarrier,
            tracking_number: newTrackingNumber,
        })
        .eq("order_id", selectedAdminOrder.id);

    if (error) {
        console.error("Shipping status update error:", error);

        return;
    }

    console.log("✅ SHIPPING STATUS UPDATED:", newShippingStatus);
});
document.addEventListener("click", async (event) => {
    const updateOrderButton = event.target.closest("#mtcAdminOrdersModalSave");

    if (!updateOrderButton) {
        return;
    }

    if (!currentAdminCanEditOrders) {
        alert("You do not have permission to edit orders.");
        return;
    }

    if (!selectedAdminOrder) {
        return;
    }

    const orderStatusSelect = document.getElementById("mtcAdminOrderStatusSelect");

    const shippingStatusSelect = document.getElementById("mtcAdminShippingStatusSelect");

    const carrierSelect = document.getElementById("mtcAdminOrderCarrier");

    const trackingNumberInput = document.getElementById("mtcAdminOrderTrackingNumber");

    const newCarrier = carrierSelect?.value.trim() || null;

    const newTrackingNumber = trackingNumberInput?.value.trim() || null;

    if (!orderStatusSelect) {
        return;
    }

    const newOrderStatus = orderStatusSelect.value;

    const newShippingStatus = shippingStatusSelect?.value || null;

    updateOrderButton.disabled = true;

    updateOrderButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Updating...
    `;

    // =========================================
    // UPDATE ORDER STATUS
    // =========================================

    const { error: orderError } = await adminSupabase
        .from("Orders")
        .update({
            order_status: newOrderStatus,
            updated_at: new Date().toISOString(),
        })
        .eq("id", selectedAdminOrder.id);

    if (orderError) {
        console.error("Order status update error:", orderError);

        alert("Unable to update order status.");

        updateOrderButton.disabled = false;

        updateOrderButton.innerHTML = `
            <i class="fa-solid fa-check"></i>
            Update Order
        `;

        return;
    }

    // =========================================
    // UPDATE SHIPPING STATUS
    // =========================================

    const finalShippingStatus = newTrackingNumber ? "Shipped" : newShippingStatus;

    const { data: updatedShipping, error: shippingError } = await adminSupabase
        .from("Shipping")
        .update({
            shipping_status: finalShippingStatus,
            carrier: newCarrier,
            tracking_number: newTrackingNumber,
            shipped_at: newTrackingNumber ? new Date().toISOString() : null,
        })
        .eq("order_id", selectedAdminOrder.id).select(`
        id,
        order_id,
        shipping_status,
        carrier,
        tracking_number,
        shipped_at
    `);

    console.log("SHIPPING UPDATE RESULT:", updatedShipping);

    if (shippingError) {
        console.error("Shipping status update error:", shippingError);
        alert("Unable to update shipping status.");
        updateOrderButton.disabled = false;
        updateOrderButton.innerHTML = `
            <i class="fa-solid fa-check"></i>
            Update Order
        `;
        return;
    }

    console.log("✅ ORDER STATUS UPDATED:", newOrderStatus);
    console.log("✅ SHIPPING STATUS UPDATED:", newShippingStatus);
    const previousOrderStatus = selectedAdminOrder.order_status || "pending";

    const { data: activitySessionData } = await adminSupabase.auth.getSession();

    const activityAccessToken = activitySessionData?.session?.access_token;

    if (activityAccessToken && previousOrderStatus !== newOrderStatus) {
        await fetch("https://mtc-backend-node-production.up.railway.app/admin-activity-log", {
            method: "POST",

            headers: {
                "Content-Type": "application/json",

                Authorization: `Bearer ${activityAccessToken}`,
            },

            body: JSON.stringify({
                category: "Orders",

                action: "Order Status Updated",

                description: `Changed order ${selectedAdminOrder.order_id} from ${previousOrderStatus} to ${newOrderStatus}.`,

                targetType: "Order",

                targetId: selectedAdminOrder.id,

                targetName: selectedAdminOrder.order_id,

                metadata: {
                    previous_status: previousOrderStatus,

                    new_status: newOrderStatus,
                },
            }),
        });
    }
    selectedAdminOrder.order_status = newOrderStatus;

    window.location.reload();
});
document.addEventListener("click", (event) => {
    const closeButton = event.target.closest("#mtcAdminOrdersModalClose");

    if (!closeButton) {
        return;
    }

    const modal = document.getElementById("mtcAdminOrdersModal");

    if (!modal) {
        return;
    }

    modal.classList.remove("open");

    modal.setAttribute("aria-hidden", "true");

    selectedAdminOrder = null;
});
document.addEventListener("click", (event) => {
    const closeButton = event.target.closest("#mtcAdminOrdersModalCancel");

    if (!closeButton) {
        return;
    }

    const modal = document.getElementById("mtcAdminOrdersModal");

    if (!modal) {
        return;
    }

    modal.classList.remove("open");

    modal.setAttribute("aria-hidden", "true");

    selectedAdminOrder = null;
});
/* =====================================================
   ADMIN ORDERS SIDEBAR TOGGLE
===================================================== */

const adminOrdersMenuButton = document.getElementById("mtcAdminOrdersMenuButton");

const adminOrdersSidebar = document.querySelector(".mw-dashboard-sidebar");

adminOrdersMenuButton?.addEventListener("click", () => {
    adminOrdersSidebar?.classList.toggle("sidebar-open");
});
/* =========================================
   END OF MTC-ADMIN-ORDERS JS
========================================= */

/* =========================================
   START OF MTC-ADMIN-PRODUCTS JS
========================================= */
document.addEventListener("DOMContentLoaded", async () => {
    const isProductsPage = window.location.pathname.endsWith("mtc-admin-products.html");
    if (!isProductsPage) {
        return;
    }

    // =========================================
    // PRODUCT FROM NOTIFICATION
    // =========================================

    const productUrlParams = new URLSearchParams(window.location.search);

    const productIdFromNotification = productUrlParams.get("productId");

    const productActionFromNotification = productUrlParams.get("action");

    const tableBody = document.getElementById("mtcAdminProductsTableBody");
    const totalCount = document.getElementById("mtcAdminProductsTotalCount");
    const activeCount = document.getElementById("mtcAdminProductsActiveCount");
    const lowStockCount = document.getElementById("mtcAdminProductsLowStockCount");
    const outOfStockCount = document.getElementById("mtcAdminProductsOutOfStockCount");
    const productSearchInput = document.getElementById("mtcAdminProductsSearchInput");
    const productCategoryFilter = document.getElementById("mtcAdminProductsCategoryFilter");
    const productStockFilter = document.getElementById("mtcAdminProductsStockFilter");
    const previousProductsButton = document.getElementById("mtcAdminProductsPreviousButton");

    const nextProductsButton = document.getElementById("mtcAdminProductsNextButton");

    const productsPaginationInfo = document.getElementById("mtcAdminProductsPaginationInfo");
    const productsCurrentPage = document.getElementById("mtcAdminProductsCurrentPage");
    console.log("CATEGORY FILTER ELEMENT:", productCategoryFilter);
    console.log("INVENTORY FILTER ELEMENT:", productStockFilter);

    let editingProductId = null;
    let canCreateProduct = false;
    let canEditProduct = false;
    let canDeleteProduct = false;

    const {
        data: { session: inventoryPermissionSession },
    } = await adminSupabase.auth.getSession();

    if (inventoryPermissionSession?.access_token) {
        const editProductPermissionResponse = await fetch(
            "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=products.edit",
            {
                headers: {
                    Authorization: `Bearer ${inventoryPermissionSession.access_token}`,
                },
            }
        );

        const editProductPermissionResult = await editProductPermissionResponse.json();

        canEditProduct = editProductPermissionResult?.allowed === true;
        const deleteProductPermissionResponse = await fetch(
            "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=products.delete",
            {
                headers: {
                    Authorization: `Bearer ${inventoryPermissionSession.access_token}`,
                },
            }
        );

        const deleteProductPermissionResult = await deleteProductPermissionResponse.json();

        canDeleteProduct = deleteProductPermissionResult?.allowed === true;

        const inventoryPermissionResponse = await fetch(
            "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=products.create",
            {
                headers: {
                    Authorization: `Bearer ${inventoryPermissionSession.access_token}`,
                },
            }
        );

        const inventoryPermissionResult = await inventoryPermissionResponse.json();

        canCreateProduct = inventoryPermissionResult?.allowed === true;
    }

    // =========================================
    // LOAD PRODUCTS
    // =========================================
    const { data: products, error: productsError } = await adminSupabase
        .from("Products")
        .select(
            `
                id,
                sku,
                product_name,
                description,
                price,
                compare_at_price,
                cost,
                weight,
                image_url,
                category_id,
                is_active,
                updated_at
            `
        )
        .eq("is_active", true)
        .order("updated_at", {
            ascending: false,
        });
    if (productsError) {
        console.error("Products page error:", productsError);
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7">
                        Unable to load products.
                    </td>
                </tr>
            `;
        }
        return;
    }
    const allProducts = products || [];
    // =========================================
    // LOAD INVENTORY
    // =========================================
    const productIds = allProducts.map((product) => product.id);
    let inventoryRows = [];
    if (productIds.length > 0) {
        const { data: inventory, error: inventoryError } = await adminSupabase
            .from("Inventory")
            .select("product_id, quantity")
            .in("product_id", productIds);
        if (inventoryError) {
            console.error("Products inventory error:", inventoryError);
        } else {
            inventoryRows = inventory || [];
        }
    }

    // =========================================
    // LOAD CATEGORIES
    // =========================================
    const { data: categories, error: categoriesError } = await adminSupabase
        .from("Categories")
        .select("id, name")
        .order("name", {
            ascending: true,
        });

    if (categoriesError) {
        console.error("Products categories error:", categoriesError);
    }

    const categoryRows = categories || [];

    const productCategoryInput = document.getElementById("mtcAdminProductsCategory");

    if (productCategoryInput) {
        productCategoryInput.replaceChildren();

        const placeholderOption = document.createElement("option");

        placeholderOption.value = "";
        placeholderOption.textContent = "Select Category";

        productCategoryInput.appendChild(placeholderOption);

        categoryRows.forEach((category) => {
            const option = document.createElement("option");

            option.value = String(category.id || "");
            option.textContent = String(category.name || "");

            productCategoryInput.appendChild(option);
        });
    }

    // =========================================
    // POPULATE CATEGORY FILTER
    // =========================================
    if (productCategoryFilter) {
        productCategoryFilter.replaceChildren();

        const allCategoriesOption = document.createElement("option");

        allCategoriesOption.value = "all";
        allCategoriesOption.textContent = "All Categories";

        productCategoryFilter.appendChild(allCategoriesOption);

        categoryRows.forEach((category) => {
            const option = document.createElement("option");

            option.value = String(category.id || "");

            option.textContent = String(category.name || "");

            productCategoryFilter.appendChild(option);
        });
    }
    // =========================================
    // UPDATE PRODUCT STATS
    // =========================================
    const inventoryByProduct = {};
    inventoryRows.forEach((row) => {
        inventoryByProduct[row.product_id] = Number(row.quantity) || 0;
    });
    const totalProducts = allProducts.length;
    const activeProducts = allProducts.filter((product) => product.is_active === true).length;
    const lowStockProducts = allProducts.filter((product) => {
        const quantity = inventoryByProduct[product.id] || 0;
        return quantity > 0 && quantity <= 5;
    }).length;
    const outOfStockProducts = allProducts.filter((product) => {
        const quantity = inventoryByProduct[product.id] || 0;
        return quantity === 0;
    }).length;
    if (totalCount) {
        totalCount.textContent = totalProducts;
    }
    if (activeCount) {
        activeCount.textContent = activeProducts;
    }
    if (lowStockCount) {
        lowStockCount.textContent = lowStockProducts;
    }
    if (outOfStockCount) {
        outOfStockCount.textContent = outOfStockProducts;
    }

    let currentProductsPage = 1;
    const productsPerPage = 10;

    function renderProducts(productsToShow) {
        if (!tableBody) {
            return;
        }

        if (productsToShow.length === 0) {
            tableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    No products found.
                </td>
            </tr>
        `;
            return;
        }

        tableBody.innerHTML = productsToShow
            .map((product) => {
                const category = categoryRows.find((item) => item.id === product.category_id);

                const quantity = inventoryByProduct[product.id] || 0;

                const formattedPrice = Number(product.price || 0).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                });

                const formattedDate = product.updated_at
                    ? new Date(product.updated_at).toLocaleDateString("en-US", {
                          timeZone: "America/Chicago",
                      })
                    : "-";

                const statusText = product.is_active ? "Active" : "Inactive";

                return `
                <tr>
                    <td>${escapeAdminHTML(product.product_name || "-")}</td>
                    <td>${escapeAdminHTML(category?.name || "-")}</td>
                    <td>${formattedPrice}</td>
                    <td>${quantity}</td>
                    <td>${statusText}</td>
                    <td>${formattedDate}</td>
                    <td>
                       ${
                           canEditProduct
                               ? `
            <button
                type="button"
                class="mtc-admin-orders-update-button mtc-admin-products-edit-button"
                data-product-id="${escapeAdminHTML(product.id)}">
                <i class="fa-solid fa-pen"></i>
                <span>Edit</span>
            </button>
        `
                               : ""
                       }
${
    canDeleteProduct
        ? `
            <button
                type="button"
                class="mtc-admin-products-delete-button"
                data-product-id="${escapeAdminHTML(product.id)}">
                <i class="fa-solid fa-trash"></i>
                <span>Delete</span>
            </button>
        `
        : ""
}
                    </td>
                </tr>
            `;
            })
            .join("");
    }

    // =========================================
    // RENDER PRODUCTS PAGE
    // =========================================

    function renderProductsPage(products = allProducts) {
        const totalPages = Math.max(1, Math.ceil(products.length / productsPerPage));

        if (currentProductsPage > totalPages) {
            currentProductsPage = totalPages;
        }

        if (currentProductsPage < 1) {
            currentProductsPage = 1;
        }

        const startIndex = (currentProductsPage - 1) * productsPerPage;

        const endIndex = startIndex + productsPerPage;

        const pagedProducts = products.slice(startIndex, endIndex);

        renderProducts(pagedProducts);

        if (productsCurrentPage) {
            productsCurrentPage.textContent = currentProductsPage;
        }

        if (productsPaginationInfo) {
            productsPaginationInfo.textContent = `Page ${currentProductsPage} of ${totalPages}`;
        }

        if (previousProductsButton) {
            previousProductsButton.disabled = currentProductsPage <= 1;
        }

        if (nextProductsButton) {
            nextProductsButton.disabled = currentProductsPage >= totalPages;
        }
    }

    // =========================================
    // RENDER PRODUCTS TABLE
    // =========================================

    renderProductsPage();

    // =========================================
    // OPEN PRODUCT FROM NOTIFICATION
    // =========================================

    if (productIdFromNotification && productActionFromNotification === "open_product") {
        const productIndex = allProducts.findIndex(
            (product) => String(product.id) === String(productIdFromNotification)
        );

        if (productIndex !== -1) {
            // =========================================
            // FIND PRODUCT'S PAGE
            // =========================================

            currentProductsPage = Math.floor(productIndex / productsPerPage) + 1;

            // =========================================
            // RENDER CORRECT PAGE
            // =========================================

            renderProductsPage();

            // =========================================
            // FIND EXACT PRODUCT
            // =========================================

            const targetProductButton = document.querySelector(
                `.mtc-admin-products-edit-button[data-product-id="${productIdFromNotification}"]`
            );

            // =========================================
            // OPEN EXACT PRODUCT
            // =========================================

            if (targetProductButton) {
                targetProductButton.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });

                targetProductButton.click();
            }

            // =========================================
            // CLEAN NOTIFICATION URL
            // =========================================

            window.history.replaceState({}, document.title, "mtc-admin-products.html");
        }
    }

    // =========================================
    // PREVIOUS PRODUCTS PAGE
    // =========================================

    previousProductsButton?.addEventListener("click", () => {
        if (currentProductsPage > 1) {
            currentProductsPage--;

            renderProductsPage();
        }
    });

    // =========================================
    // NEXT PRODUCTS PAGE
    // =========================================

    nextProductsButton?.addEventListener("click", () => {
        const totalPages = Math.max(1, Math.ceil(allProducts.length / productsPerPage));

        if (currentProductsPage < totalPages) {
            currentProductsPage++;

            renderProductsPage();
        }
    });

    // =========================================
    // SEARCH PRODUCTS
    // =========================================
    productSearchInput?.addEventListener("input", () => {
        const searchTerm = productSearchInput.value.trim().toLowerCase();
        const filteredProducts = allProducts.filter((product) => {
            const productName = String(product.product_name || "").toLowerCase();
            const category = categoryRows.find((item) => item.id === product.category_id);
            const categoryName = String(category?.name || "").toLowerCase();
            return productName.includes(searchTerm) || categoryName.includes(searchTerm);
        });
        if (filteredProducts.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7">
                        No products found.
                    </td>
                </tr>
            `;
            return;
        }
        tableBody.innerHTML = filteredProducts
            .map((product) => {
                const category = categoryRows.find((item) => item.id === product.category_id);
                const quantity = inventoryByProduct[product.id] || 0;
                const formattedPrice = Number(product.price || 0).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                });
                const formattedDate = product.updated_at ? new Date(product.updated_at).toLocaleDateString() : "-";

                const statusText = product.is_active ? "Active" : "Inactive";

                return `
        <tr>
            <td class="mtc-admin-reviews-checkbox-column">
            <input
                type="checkbox"
                class="mtc-admin-reviews-row-checkbox"
                data-review-id="${escapeAdminHTML(review.id)}"
            />
        </td>
        <td>
            ${escapeAdminHTML(product.product_name || "-")}
        </td>

        <td>
            ${escapeAdminHTML(category?.name || "-")}
        </td>

        <td>
            ${escapeAdminHTML(formattedPrice)}
        </td>

        <td>
            ${escapeAdminHTML(quantity)}
        </td>

        <td>
            ${escapeAdminHTML(statusText)}
        </td>

        <td>
            ${escapeAdminHTML(formattedDate)}
        </td>

        <td>
            ${
                canEditProduct
                    ? `
                        <button
                            type="button"
                            class="mtc-admin-orders-update-button mtc-admin-products-edit-button"

                            data-product-id="${escapeAdminHTML(product.id)}"
                        >
                            <i class="fa-solid fa-pen"></i>
                            <span>Edit</span>
                        </button>
                    `
                    : ""
            }

            ${
                canDeleteProduct
                    ? `
                        <button
                            type="button"
                            class="mtc-admin-products-delete-button"

                            data-product-id="${escapeAdminHTML(product.id)}"
                        >
                            <i class="fa-solid fa-trash"></i>
                            <span>Delete</span>
                        </button>
                    `
                    : ""
            }
        </td>
    </tr>
`;
            })
            .join("");
    });
    // =========================================
    // CATEGORY FILTER
    // =========================================
    productCategoryFilter?.addEventListener("change", () => {
        console.log("CATEGORY CHANGED:", productCategoryFilter.value);
        const selectedCategory = productCategoryFilter.value;
        const filteredProducts =
            selectedCategory === "all"
                ? [...allProducts]
                : allProducts.filter((product) => product.category_id === selectedCategory);
        if (filteredProducts.length === 0) {
            tableBody.innerHTML = `
                        <tr>
                            <td colspan="7">
                                No products found.
                            </td>
                        </tr>
                    `;
            return;
        }
        tableBody.innerHTML = filteredProducts
            .map((product) => {
                const category = categoryRows.find((item) => item.id === product.category_id);
                const quantity = inventoryByProduct[product.id] || 0;
                const formattedPrice = Number(product.price || 0).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                });
                const formattedDate = product.updated_at ? new Date(product.updated_at).toLocaleDateString() : "-";
                const statusText = product.is_active ? "Active" : "Inactive";

                return `
                            <tr>
                                <td>
                                    ${escapeAdminHTML(product.product_name || "-")}
                                </td>
                                <td>
                                    ${escapeAdminHTML(category?.name || "-")}}
                                </td>
                                <td>
                                    ${formattedPrice}
                                </td>
                                <td>
                                    ${quantity}
                                </td>
                                <td>
                                    ${statusText}
                                </td>
                                <td>
                                    ${formattedDate}
                                </td>
                               <td>
                                   ${
                                       canEditProduct
                                           ? `
            <button
                type="button"
                class="mtc-admin-orders-update-button mtc-admin-products-edit-button"
               data-product-id="${escapeAdminHTML(product.id)}">
                <i class="fa-solid fa-pen"></i>
                <span>Edit</span>
            </button>
        `
                                           : ""
                                   }
                                  ${
                                      canDeleteProduct
                                          ? `
            <button
                type="button"
                class="mtc-admin-products-delete-button"
                data-product-id="${escapeAdminHTML(product.id)}">
                <i class="fa-solid fa-trash"></i>
                <span>Delete</span>
            </button>
        `
                                          : ""
                                  }
                                </td>
                            </tr>
                        `;
            })
            .join("");
    });

    // =========================================
    // OPEN EDIT PRODUCT MODAL
    // =========================================
    const productModal = document.getElementById("mtcAdminProductsModal");
    const productModalTitle = document.getElementById("mtcAdminProductsModalTitle");
    const addProductButton = document.getElementById("mtcAdminProductsAddButton");

    // =========================================
    // CREATE PRODUCT BUTTON PERMISSION
    // =========================================

    if (addProductButton) {
        if (canCreateProduct) {
            addProductButton.style.display = "";
        } else {
            addProductButton.style.display = "none";
        }
    }

    addProductButton?.addEventListener("click", () => {
        editingProductId = null;

        if (!canCreateProduct) {
            return;
        }

        document.getElementById("mtcAdminProductsSku").value = "";

        document.getElementById("mtcAdminProductsDescription").value = "";

        document.getElementById("mtcAdminProductsComparePrice").value = "";

        document.getElementById("mtcAdminProductsCost").value = "";

        document.getElementById("mtcAdminProductsWeight").value = "";

        document.getElementById("mtcAdminProductsImage").value = "";

        document.getElementById("mtcAdminProductsImagePreview").innerHTML = `
                <span>No image selected</span>
            `;

        document.getElementById("mtcAdminProductsName").value = "";
        document.getElementById("mtcAdminProductsPrice").value = "";
        document.getElementById("mtcAdminProductsCategory").value = "";
        document.getElementById("mtcAdminProductsQuantity").value = "";
        if (productModalTitle) {
            productModalTitle.textContent = "Create Product";
        }
        const saveButton = document.getElementById("mtcAdminProductsSaveButton");
        if (saveButton) {
            saveButton.querySelector("span").textContent = "Add Product";
        }
        if (productModal) {
            productModal.classList.add("active");

            productModal.setAttribute("aria-hidden", "false");
        }
    });
    // =========================================
    // EDIT PRODUCT
    // =========================================
    const deleteAllButton = document.getElementById("mtcAdminProductsDeleteAllButton");
    if (deleteAllButton && !canDeleteProduct) {
        deleteAllButton.style.display = "none";
    }
    const deleteModal = document.getElementById("mtcAdminDeleteModal");
    const deleteModalMessage = document.getElementById("mtcAdminDeleteModalMessage");
    const deleteCancelButton = document.getElementById("mtcAdminDeleteCancelButton");
    const deleteConfirmButton = document.getElementById("mtcAdminDeleteConfirmButton");
    let pendingDeleteProductId = null;
    let pendingDeleteButton = null;
    tableBody?.addEventListener("click", (event) => {
        const editButton = event.target.closest(".mtc-admin-products-edit-button");

        if (!editButton) {
            return;
        }

        if (!canEditProduct) {
            alert("You do not have permission to edit products.");
            return;
        }

        const productId = editButton.dataset.productId;

        editingProductId = productId;

        const product = allProducts.find((item) => item.id === productId);

        if (!product) {
            return;
        }

        console.log("Editing product:", product);

        const productNameInput = document.getElementById("mtcAdminProductsName");

        const productSkuInput = document.getElementById("mtcAdminProductsSku");

        const productDescriptionInput = document.getElementById("mtcAdminProductsDescription");

        const productComparePriceInput = document.getElementById("mtcAdminProductsComparePrice");

        const productCostInput = document.getElementById("mtcAdminProductsCost");

        const productWeightInput = document.getElementById("mtcAdminProductsWeight");

        const productImagePreview = document.getElementById("mtcAdminProductsImagePreview");

        if (productSkuInput) {
            productSkuInput.value = product.sku || "";
        }

        if (productDescriptionInput) {
            productDescriptionInput.value = product.description || "";
        }

        if (productComparePriceInput) {
            productComparePriceInput.value = product.compare_at_price ?? "";
        }

        if (productCostInput) {
            productCostInput.value = product.cost ?? "";
        }

        if (productWeightInput) {
            productWeightInput.value = product.weight ?? "";
        }

        if (productImagePreview) {
            productImagePreview.innerHTML = product.image_url
                ? `
                                    <img
                                        src="${product.image_url}"
                                        alt="Product preview">
                                `
                : `
                                    <span>No image selected</span>
                                `;
        }

        const productPriceInput = document.getElementById("mtcAdminProductsPrice");

        const productCategoryInput = document.getElementById("mtcAdminProductsCategory");

        const productQuantityInput = document.getElementById("mtcAdminProductsQuantity");

        if (productNameInput) {
            productNameInput.value = product.product_name || "";
        }

        if (productPriceInput) {
            productPriceInput.value = product.price ?? "";
        }

        if (productCategoryInput) {
            productCategoryInput.value = product.category_id || "";
        }

        if (productQuantityInput) {
            const currentQuantity = inventoryByProduct[product.id] || 0;

            productQuantityInput.value = currentQuantity > 0 ? currentQuantity : "";

            productQuantityInput.disabled = !canEditProduct;
        }

        if (productModalTitle) {
            productModalTitle.textContent = "Edit Product";
        }

        if (productModal) {
            productModal.classList.add("active");

            productModal.setAttribute("aria-hidden", "false");
        }
    });

    // =========================================
    // DELETE INDIVIDUAL PRODUCT
    // =========================================
    tableBody?.addEventListener("click", async (event) => {
        const deleteButton = event.target.closest(".mtc-admin-products-delete-button");

        if (!deleteButton) {
            return;
        }

        if (!canDeleteProduct) {
            alert("You do not have permission to delete products.");
            return;
        }

        if (!canDeleteProduct) {
            alert("You do not have permission to delete products.");
            return;
        }

        const productId = deleteButton.dataset.productId;

        const product = allProducts.find((item) => item.id === productId);

        const productName = product?.product_name || "this product";

        pendingDeleteProductId = productId;
        pendingDeleteButton = deleteButton;

        if (deleteModalMessage) {
            deleteModalMessage.textContent = `Are you sure you want to delete "${productName}"?`;
        }

        if (deleteModal) {
            deleteModal.classList.add("active");
            deleteModal.setAttribute("aria-hidden", "false");
        }

        return;
    });
    // =========================================
    // DELETE ALL PRODUCTS
    // =========================================

    deleteAllButton?.addEventListener("click", () => {
        if (!allProducts || allProducts.length === 0) {
            alert("There are no products to delete.");

            return;
        }

        pendingDeleteProductId = "DELETE_ALL";

        pendingDeleteButton = deleteAllButton;

        if (deleteModalMessage) {
            deleteModalMessage.textContent = "Are you sure you want to delete ALL products?";
        }

        if (deleteConfirmButton) {
            deleteConfirmButton.disabled = false;

            deleteConfirmButton.innerHTML = `
                <i class="fa-solid fa-trash"></i>
                <span>Delete All Products</span>
            `;
        }

        if (deleteModal) {
            deleteModal.classList.add("active");

            deleteModal.setAttribute("aria-hidden", "false");
        }
    });

    // =========================================
    // CONFIRM PRODUCT DELETE
    // =========================================

    deleteConfirmButton?.addEventListener("click", async () => {
        if (!pendingDeleteProductId || !pendingDeleteButton) {
            return;
        }

        const productId = pendingDeleteProductId;

        const deleteButton = pendingDeleteButton;

        const isDeleteAll = productId === "DELETE_ALL";

        deleteConfirmButton.disabled = true;

        deleteConfirmButton.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Deleting...</span>
        `;

        if (isDeleteAll) {
            const productIds = allProducts.map((product) => product.id);

            const { error: deleteError } = await adminSupabase.from("Products").delete().in("id", productIds);

            if (deleteError) {
                console.error("Delete all products error:", deleteError);

                alert("Unable to delete all products: " + deleteError.message);

                deleteConfirmButton.disabled = false;
                deleteButton.disabled = false;

                deleteConfirmButton.innerHTML = `
                    <i class="fa-solid fa-trash"></i>
                    <span>Delete All Products</span>
                `;

                return;
            }

            window.location.reload();
            return;
        }

        const { error: deleteError } = await adminSupabase
            .from("Products")
            .update({
                is_active: false,
            })
            .eq("id", productId);

        if (deleteError) {
            console.error("Delete product error:", deleteError);

            alert("Unable to delete product: " + deleteError.message);

            deleteConfirmButton.disabled = false;
            deleteButton.disabled = false;

            deleteConfirmButton.innerHTML = `
                <i class="fa-solid fa-trash"></i>
                <span>Delete Product</span>
            `;

            return;
        }
        const deletedProduct = allProducts.find((product) => String(product.id) === String(productId));

        const deletedProductName = deletedProduct?.product_name || "Unknown Product";

        const { data: activitySessionData } = await adminSupabase.auth.getSession();

        const activityAccessToken = activitySessionData?.session?.access_token;

        if (activityAccessToken) {
            await fetch("https://mtc-backend-node-production.up.railway.app/admin-activity-log", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    Authorization: `Bearer ${activityAccessToken}`,
                },

                body: JSON.stringify({
                    category: "Products",

                    action: "Product Deleted",

                    description: `Deleted product: ${deletedProductName}.`,

                    targetType: "Product",

                    targetId: productId,

                    targetName: deletedProductName,

                    metadata: {
                        product_name: deletedProductName,

                        sku: deletedProduct?.sku || null,

                        price: deletedProduct?.price ?? null,
                    },
                }),
            });
        }
        window.location.reload();
    });

    deleteCancelButton?.addEventListener("click", () => {
        if (deleteModal) {
            deleteModal.classList.remove("active");

            deleteModal.setAttribute("aria-hidden", "true");
        }

        if (deleteConfirmButton) {
            deleteConfirmButton.disabled = false;

            deleteConfirmButton.innerHTML = `
                <i class="fa-solid fa-trash"></i>
                <span>Delete Product</span>
            `;
        }

        if (deleteAllButton) {
            deleteAllButton.disabled = false;
        }

        pendingDeleteProductId = null;
        pendingDeleteButton = null;
    });

    // =========================================
    // CLOSE PRODUCT MODAL
    // =========================================

    const productModalClose = document.getElementById("mtcAdminProductsModalClose");

    productModalClose?.addEventListener("click", () => {
        if (!productModal) {
            return;
        }

        productModal.classList.remove("active");

        productModal.setAttribute("aria-hidden", "true");

        editingProductId = null;
    });
    // =========================================
    // UPDATE PRODUCT
    // =========================================
    const productForm = document.getElementById("mtcAdminProductsForm");
    productForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (editingProductId && !canEditProduct) {
            alert("You do not have permission to edit products.");
            return;
        }

        if (!editingProductId && !canCreateProduct) {
            alert("You do not have permission to create products.");
            return;
        }

        const productSku = document.getElementById("mtcAdminProductsSku").value.trim();

        const productDescription = document.getElementById("mtcAdminProductsDescription").value.trim();

        const productCompareAtPrice = document.getElementById("mtcAdminProductsComparePrice").value;

        const productCost = document.getElementById("mtcAdminProductsCost").value;

        const productWeight = document.getElementById("mtcAdminProductsWeight").value;

        const productName = document.getElementById("mtcAdminProductsName").value.trim();
        const productPrice = Number(document.getElementById("mtcAdminProductsPrice").value);
        const productCategory = document.getElementById("mtcAdminProductsCategory").value;
        const productQuantity = Number(document.getElementById("mtcAdminProductsQuantity").value);

        const productImageFile = document.getElementById("mtcAdminProductsImage").files[0];

        let productImageUrl = null;

        if (editingProductId) {
            const existingProduct = allProducts.find((product) => product.id === editingProductId);

            productImageUrl = existingProduct?.image_url || null;
        }

        if (productImageFile) {
            const fileExtension = productImageFile.name.split(".").pop();

            const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

            const { error: uploadError } = await adminSupabase.storage
                .from("product-images")
                .upload(fileName, productImageFile);

            if (uploadError) {
                console.error("Product image upload error:", uploadError);

                alert("Product image could not be uploaded.");

                return;
            }

            const { data: publicUrlData } = adminSupabase.storage.from("product-images").getPublicUrl(fileName);

            productImageUrl = publicUrlData.publicUrl;
        }

        if (!editingProductId) {
            const { data: newProduct, error: insertProductError } = await adminSupabase
                .from("Products")
                .insert({
                    sku: productSku,

                    product_name: productName,

                    description: productDescription,

                    price: productPrice,

                    compare_at_price: productCompareAtPrice ? Number(productCompareAtPrice) : null,

                    cost: productCost ? Number(productCost) : null,

                    weight: productWeight ? Number(productWeight) : null,

                    image_url: productImageUrl,

                    category_id: productCategory,

                    is_active: true,
                })

                .select()
                .single();

            if (insertProductError) {
                console.error("Add product error:", insertProductError);

                alert("Add Product failed:\n\n" + insertProductError.message);

                return;
            }
            const { error: insertInventoryError } = await adminSupabase.from("Inventory").insert({
                product_id: newProduct.id,
                quantity: productQuantity,
            });

            if (insertInventoryError) {
                console.error("Add inventory error:", insertInventoryError);
                return;
            }
            const { data: activitySessionData } = await adminSupabase.auth.getSession();

            const activityAccessToken = activitySessionData?.session?.access_token;

            if (activityAccessToken) {
                await fetch("https://mtc-backend-node-production.up.railway.app/admin-activity-log", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",

                        Authorization: `Bearer ${activityAccessToken}`,
                    },

                    body: JSON.stringify({
                        category: "Products",

                        action: "Product Created",

                        description: `Created product: ${productName}.`,

                        targetType: "Product",

                        targetId: newProduct.id,

                        targetName: productName,

                        metadata: {
                            sku: productSku,

                            price: productPrice,

                            quantity: productQuantity,

                            category_id: productCategory,
                        },
                    }),
                });
            }
            window.location.reload();
            return;
        }
        const { data, error } = await adminSupabase
            .from("Products")
            .update({
                sku: productSku,

                product_name: productName,

                description: productDescription,

                price: productPrice,

                compare_at_price: productCompareAtPrice ? Number(productCompareAtPrice) : null,

                cost: productCost ? Number(productCost) : null,

                weight: productWeight ? Number(productWeight) : null,

                image_url: productImageUrl,

                category_id: productCategory,

                updated_at: new Date().toISOString(),
            })
            .eq("id", editingProductId)
            .select();

        if (error) {
            console.error("Update product error:", error);
            alert("Update failed: " + error.message);
            return;
        }
        if (canEditProduct) {
            const { data: inventoryData, error: inventorySaveError } = await adminSupabase
                .from("Inventory")
                .update({
                    quantity: productQuantity,
                })
                .eq("product_id", editingProductId)
                .select();

            console.log("INVENTORY UPDATED:", inventoryData);

            if (inventorySaveError) {
                console.error("Inventory save error:", inventorySaveError);
                alert("Inventory update failed: " + inventorySaveError.message);
                return;
            }
        }

        console.log("Product updated:", data);
        productModal.classList.remove("active");
        productModal.setAttribute("aria-hidden", "true");
        window.location.reload();
    });
});
const productImageInput = document.getElementById("mtcAdminProductsImage");

const productImagePreview = document.getElementById("mtcAdminProductsImagePreview");

productImageInput?.addEventListener("change", () => {
    const file = productImageInput.files?.[0];

    if (!file) {
        productImagePreview.innerHTML = `
                <span>No image selected</span>
            `;

        return;
    }

    const imageUrl = URL.createObjectURL(file);

    productImagePreview.innerHTML = `
            <img
                src="${imageUrl}"
                alt="Product preview">
        `;
});

/* =====================================================
   ADMIN PRODUCTS SIDEBAR TOGGLE
===================================================== */

const adminProductsMenuButton = document.getElementById("mtcAdminProductsMenuButton");

const adminProductsSidebar = document.querySelector(".mw-dashboard-sidebar");

adminProductsMenuButton?.addEventListener("click", () => {
    adminProductsSidebar?.classList.toggle("sidebar-open");
});
/* =========================================
   END OF MTC-ADMIN-PRODUCTS JS
========================================= */

/* =====================================================
   START OF ADMIN-CATEGORIES PAGE
===================================================== */

document.addEventListener("DOMContentLoaded", async () => {
    /* =================================================
           PAGE CHECK
        ================================================= */

    const isCategoriesPage = window.location.pathname.endsWith("mtc-admin-categories.html");

    if (!isCategoriesPage) {
        return;
    }

    /* =================================================
           ELEMENTS
        ================================================= */

    const tableBody = document.getElementById("mtcAdminCategoriesTableBody");

    const totalCount = document.getElementById("mtcAdminCategoriesTotalCount");

    const productCount = document.getElementById("mtcAdminCategoriesProductCount");

    const emptyCount = document.getElementById("mtcAdminCategoriesEmptyCount");

    const searchInput = document.getElementById("mtcAdminCategoriesSearchInput");

    const emptyState = document.getElementById("mtcAdminCategoriesEmpty");

    const tableWrapper = document.getElementById("mtcAdminCategoriesTableWrapper");

    const clearSearchButton = document.getElementById("mtcAdminCategoriesClearSearchButton");

    /* =================================================
           ADD / EDIT MODAL
        ================================================= */

    const modal = document.getElementById("mtcAdminCategoriesModal");

    const modalOverlay = document.getElementById("mtcAdminCategoriesModalOverlay");

    const modalTitle = document.getElementById("mtcAdminCategoriesModalTitle");

    const modalClose = document.getElementById("mtcAdminCategoriesModalClose");

    const cancelButton = document.getElementById("mtcAdminCategoriesCancelButton");

    const addButton = document.getElementById("mtcAdminCategoriesAddButton");

    const form = document.getElementById("mtcAdminCategoriesForm");

    const nameInput = document.getElementById("mtcAdminCategoriesName");

    const descriptionInput = document.getElementById("mtcAdminCategoriesDescription");

    const saveButton = document.getElementById("mtcAdminCategoriesSaveButton");

    /* =================================================
           DELETE MODAL
        ================================================= */

    const deleteModal = document.getElementById("mtcAdminCategoriesDeleteModal");

    const deleteMessage = document.getElementById("mtcAdminCategoriesDeleteMessage");

    const deleteCancelButton = document.getElementById("mtcAdminCategoriesDeleteCancelButton");

    const deleteConfirmButton = document.getElementById("mtcAdminCategoriesDeleteConfirmButton");

    /* =================================================
           SIDEBAR
        ================================================= */

    const menuButton = document.getElementById("mtcAdminCategoriesMenuButton");

    const sidebar = document.querySelector(".mw-dashboard-sidebar");

    /* =================================================
           STATE
        ================================================= */

    let allCategories = [];

    let allProducts = [];

    let editingCategoryId = null;

    let deletingCategoryId = null;

    // =================================================
    // CATEGORY PERMISSIONS
    // ALL ADMINS CAN VIEW CATEGORIES
    // CREATE / EDIT / DELETE STILL REQUIRE PERMISSION
    // =================================================

    let canCreateCategories = false;
    let canEditCategories = false;
    let canDeleteCategories = false;

    const {
        data: { session: categoryPermissionSession },
    } = await adminSupabase.auth.getSession();

    if (categoryPermissionSession?.access_token) {
        const categoryPermissionHeaders = {
            Authorization: `Bearer ${categoryPermissionSession.access_token}`,
        };

        const [createCategoriesResponse, editCategoriesResponse, deleteCategoriesResponse] = await Promise.all([
            fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=categories.create", {
                headers: categoryPermissionHeaders,
            }),

            fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=categories.edit", {
                headers: categoryPermissionHeaders,
            }),

            fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=categories.delete", {
                headers: categoryPermissionHeaders,
            }),
        ]);

        const [createCategoriesResult, editCategoriesResult, deleteCategoriesResult] = await Promise.all([
            createCategoriesResponse.json(),
            editCategoriesResponse.json(),
            deleteCategoriesResponse.json(),
        ]);

        canCreateCategories = createCategoriesResult?.allowed === true;

        canEditCategories = editCategoriesResult?.allowed === true;

        canDeleteCategories = deleteCategoriesResult?.allowed === true;
    }

    console.log("CATEGORY PERMISSIONS:", {
        view: true,
        create: canCreateCategories,
        edit: canEditCategories,
        delete: canDeleteCategories,
    });

    /* =================================================
       ESCAPE HTML
    ================================================= */

    function escapeCategoryHTML(value) {
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

    /* =================================================
           FORMAT DATE
        ================================================= */

    function formatCategoryDate(value) {
        if (!value) {
            return "—";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }

    /* =================================================
           PRODUCT COUNT FOR CATEGORY
        ================================================= */

    function getCategoryProductCount(categoryId) {
        return allProducts.filter((product) => String(product.category_id) === String(categoryId)).length;
    }

    /* =================================================
           UPDATE STATS
        ================================================= */

    function updateCategoryStats() {
        const totalCategories = allCategories.length;

        const assignedProducts = allProducts.filter((product) => product.category_id).length;

        const emptyCategories = allCategories.filter((category) => getCategoryProductCount(category.id) === 0).length;

        if (totalCount) {
            totalCount.textContent = totalCategories;
        }

        if (productCount) {
            productCount.textContent = assignedProducts;
        }

        if (emptyCount) {
            emptyCount.textContent = emptyCategories;
        }
    }

    /* =================================================
           RENDER CATEGORIES
        ================================================= */

    function renderCategories(categories) {
        if (!tableBody) {
            return;
        }

        if (!categories || categories.length === 0) {
            tableBody.innerHTML = "";

            if (tableWrapper) {
                tableWrapper.style.display = "none";
            }

            if (emptyState) {
                emptyState.hidden = false;
            }

            return;
        }

        if (tableWrapper) {
            tableWrapper.style.display = "";
        }

        if (emptyState) {
            emptyState.hidden = true;
        }

        tableBody.innerHTML = categories
            .map((category) => {
                const categoryProducts = getCategoryProductCount(category.id);

                const description = category.description || "No description";

                return `
                         <tr>
                        <td>
                                <div class="mtc-admin-category-name">
                                <div class="mtc-admin-category-icon">
                                        <i class="fa-solid fa-tag"> </i>
                                </div>

                                <div>
                                        <strong> ${escapeCategoryHTML(category.name)} </strong>

                                        <span> ${escapeCategoryHTML(description)} </span>
                                </div>
                                </div>
                        </td>

                        <td>${categoryProducts}</td>

                        <td>${formatCategoryDate(category.created_at)}</td>

                        <td>
                                <div class="mtc-admin-category-actions">

    ${
        canEditCategories
            ? `
                <button
                    type="button"
                    class="mtc-admin-category-edit"
                    data-category-id="${category.id}"
                    aria-label="Edit category"
                >
                    <i class="fa-solid fa-pen"> </i>
                </button>
            `
            : ""
    }

    ${
        canDeleteCategories
            ? `
                <button
                    type="button"
                    class="mtc-admin-category-delete"
                    data-category-id="${category.id}"
                    aria-label="Delete category"
                >
                    <i class="fa-solid fa-trash"> </i>
                </button>
            `
            : ""
    }

</div>
                        </td>
                        </tr>

                        `;
            })
            .join("");

        attachCategoryActionEvents();
    }

    /* =================================================
       LOAD CATEGORIES
    ================================================= */

    async function loadAdminCategories() {
        if (tableBody) {
            tableBody.innerHTML = `
            <tr>
                <td colspan="4">
                    <div
                        class="mtc-admin-categories-loading">
                        Loading categories...
                    </div>
                </td>
            </tr>
        `;
        }

        // =========================================
        // GET CURRENT ADMIN SESSION
        // =========================================

        const {
            data: { session: categorySession },
        } = await adminSupabase.auth.getSession();

        if (!categorySession?.access_token) {
            if (tableBody) {
                tableBody.innerHTML = `
                <tr>
                    <td colspan="4">
                        Unable to verify administrator session.
                    </td>
                </tr>
            `;
            }

            return;
        }

        try {
            // =========================================
            // LOAD CATEGORIES THROUGH BACKEND
            // =========================================

            const categoryResponse = await fetch("https://mtc-backend-node-production.up.railway.app/admin-categories", {
                method: "GET",

                headers: {
                    Authorization: `Bearer ${categorySession.access_token}`,
                },
            });

            const categoryResult = await categoryResponse.json();

            // =========================================
            // LOAD PRODUCTS FOR CATEGORY COUNTS
            // =========================================

            const { data: productData, error: productError } = await adminSupabase
                .from("Products")
                .select("id, category_id")
                .eq("is_active", true);

            if (productError) {
                console.error("Category product count error:", productError);
            }

            // =========================================
            // SAVE LOADED DATA
            // =========================================

            allCategories = categoryResult.categories || [];

            allProducts = productData || [];

            // =========================================
            // UPDATE PAGE
            // =========================================

            updateCategoryStats();

            renderCategories(allCategories);
        } catch (error) {
            console.error("Categories load request error:", error);

            if (tableBody) {
                tableBody.innerHTML = `
                <tr>
                    <td colspan="4">
                        Unable to load categories.
                    </td>
                </tr>
            `;
            }
        }
    }

    /* =================================================
       OPEN ADD MODAL
    ================================================= */

    function openAddCategoryModal() {
        editingCategoryId = null;

        if (form) {
            form.reset();
        }

        if (modalTitle) {
            modalTitle.textContent = "Create Category";
        }

        if (saveButton) {
            saveButton.innerHTML = `
                    <i
                        class="fa-solid fa-floppy-disk">
                    </i>

                    <span>
                        Save Category
                    </span>
                `;
        }

        if (modal) {
            modal.classList.add("open");

            modal.setAttribute("aria-hidden", "false");
        }

        setTimeout(() => {
            nameInput?.focus();
        }, 50);
    }

    /* =================================================
           OPEN EDIT MODAL
        ================================================= */

    function openEditCategoryModal(categoryId) {
        const category = allCategories.find((item) => String(item.id) === String(categoryId));

        if (!category) {
            return;
        }

        editingCategoryId = category.id;

        if (nameInput) {
            nameInput.value = category.name || "";
        }

        if (descriptionInput) {
            descriptionInput.value = category.description || "";
        }

        if (modalTitle) {
            modalTitle.textContent = "Edit Category";
        }

        if (saveButton) {
            saveButton.innerHTML = `
                    <i
                        class="fa-solid fa-check">
                    </i>

                    <span>
                        Update Category
                    </span>
                `;
        }

        if (modal) {
            modal.classList.add("open");

            modal.setAttribute("aria-hidden", "false");
        }

        setTimeout(() => {
            nameInput?.focus();
        }, 50);
    }

    /* =================================================
           CLOSE CATEGORY MODAL
        ================================================= */

    function closeCategoryModal() {
        if (modal) {
            modal.classList.remove("open");

            modal.setAttribute("aria-hidden", "true");
        }

        editingCategoryId = null;

        if (form) {
            form.reset();
        }
    }

    /* =================================================
       SAVE CATEGORY
    ================================================= */

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();

        // =========================================
        // CHECK CATEGORY PERMISSION
        // =========================================

        if (editingCategoryId) {
            if (!canEditCategories) {
                alert("You do not have permission to edit categories.");

                return;
            }
        } else {
            if (!canCreateCategories) {
                alert("You do not have permission to create categories.");

                return;
            }
        }

        // =========================================
        // GET CATEGORY VALUES
        // =========================================

        const categoryName = nameInput.value.trim();

        const categoryDescription = descriptionInput.value.trim();

        if (!categoryName) {
            nameInput.focus();

            return;
        }

        // =========================================
        // GET CURRENT ADMIN SESSION
        // =========================================

        const {
            data: { session: categorySaveSession },
        } = await adminSupabase.auth.getSession();

        if (!categorySaveSession?.access_token) {
            alert("Unable to verify administrator session.");

            return;
        }

        // =========================================
        // SHOW SAVING STATE
        // =========================================

        if (saveButton) {
            saveButton.disabled = true;

            saveButton.innerHTML = `
            <i
                class="fa-solid fa-spinner fa-spin">
            </i>

            <span>
                Saving...
            </span>
        `;
        }

        try {
            let categorySaveUrl;

            let categorySaveBody;

            // =========================================
            // EDIT CATEGORY
            // =========================================

            if (editingCategoryId) {
                categorySaveUrl = "https://mtc-backend-node-production.up.railway.app/admin-categories/update";

                categorySaveBody = {
                    categoryId: editingCategoryId,

                    name: categoryName,

                    description: categoryDescription || null,
                };
            } else {
                // =========================================
                // ADD CATEGORY
                // =========================================

                categorySaveUrl = "https://mtc-backend-node-production.up.railway.app/admin-categories/create";

                categorySaveBody = {
                    name: categoryName,

                    description: categoryDescription || null,
                };
            }

            // =========================================
            // SEND REQUEST TO BACKEND
            // =========================================

            const categorySaveResponse = await fetch(categorySaveUrl, {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    Authorization: `Bearer ${categorySaveSession.access_token}`,
                },

                body: JSON.stringify(categorySaveBody),
            });

            // =========================================
            // READ BACKEND RESPONSE
            // =========================================

            const categorySaveResult = await categorySaveResponse.json();

            // =========================================
            // HANDLE ERROR
            // =========================================

            if (!categorySaveResponse.ok || categorySaveResult?.success !== true) {
                console.error("Category save error:", categorySaveResult);

                alert(categorySaveResult?.error || "Unable to save category.");

                return;
            }

            // =========================================
            // SUCCESS
            // =========================================

            console.log(editingCategoryId ? "✅ CATEGORY UPDATED" : "✅ CATEGORY CREATED");

            closeCategoryModal();

            await loadAdminCategories();
        } catch (error) {
            console.error("Category save request error:", error);

            alert("Unable to save category.");
        } finally {
            // =========================================
            // RESTORE SAVE BUTTON
            // =========================================

            if (saveButton) {
                saveButton.disabled = false;

                saveButton.innerHTML = `
                <i
                    class="fa-solid fa-floppy-disk">
                </i>

                <span>
                    Save Category
                </span>
            `;
            }
        }
    });

    /* =================================================
           SEARCH
        ================================================= */

    searchInput?.addEventListener("input", () => {
        const searchValue = searchInput.value.trim().toLowerCase();

        const filteredCategories = allCategories.filter((category) => {
            const name = String(category.name || "").toLowerCase();

            const description = String(category.description || "").toLowerCase();

            return name.includes(searchValue) || description.includes(searchValue);
        });

        renderCategories(filteredCategories);
    });

    /* =================================================
           CLEAR SEARCH
        ================================================= */

    clearSearchButton?.addEventListener("click", () => {
        if (searchInput) {
            searchInput.value = "";
        }

        renderCategories(allCategories);
    });

    /* =================================================
           CATEGORY ACTION EVENTS
        ================================================= */

    function attachCategoryActionEvents() {
        /* =============================================
               EDIT BUTTONS
            ============================================= */

        document.querySelectorAll(".mtc-admin-category-edit").forEach((button) => {
            button.addEventListener("click", () => {
                openEditCategoryModal(button.dataset.categoryId);
            });
        });

        /* =============================================
               DELETE BUTTONS
            ============================================= */

        document.querySelectorAll(".mtc-admin-category-delete").forEach((button) => {
            button.addEventListener("click", () => {
                openDeleteCategoryModal(button.dataset.categoryId);
            });
        });
    }

    /* =================================================
           OPEN DELETE MODAL
        ================================================= */

    function openDeleteCategoryModal(categoryId) {
        const category = allCategories.find((item) => String(item.id) === String(categoryId));

        if (!category) {
            return;
        }

        deletingCategoryId = category.id;

        const productsInCategory = getCategoryProductCount(category.id);

        if (deleteMessage) {
            deleteMessage.innerHTML = `
                    Are you sure you want to delete
                    <strong>
                        ${escapeCategoryHTML(category.name)}
                    </strong>?
                `;
        }

        if (deleteConfirmButton) {
            deleteConfirmButton.disabled = productsInCategory > 0;

            if (productsInCategory > 0) {
                deleteConfirmButton.innerHTML = `
                        <i
                            class="fa-solid fa-lock">
                        </i>

                        <span>
                            ${productsInCategory}
                            Product${productsInCategory === 1 ? "" : "s"}
                            Assigned
                        </span>
                    `;
            } else {
                deleteConfirmButton.innerHTML = `
                        <i
                            class="fa-solid fa-trash">
                        </i>

                        <span>
                            Delete Category
                        </span>
                    `;
            }
        }

        if (deleteModal) {
            deleteModal.classList.add("open");

            deleteModal.setAttribute("aria-hidden", "false");
        }
    }

    /* =================================================
           CLOSE DELETE MODAL
        ================================================= */

    function closeDeleteCategoryModal() {
        if (deleteModal) {
            deleteModal.classList.remove("open");

            deleteModal.setAttribute("aria-hidden", "true");
        }

        deletingCategoryId = null;
    }

    /* =================================================
       DELETE CATEGORY
    ================================================= */

    deleteConfirmButton?.addEventListener("click", async () => {
        // =========================================
        // CHECK DELETE PERMISSION
        // =========================================

        if (!canDeleteCategories) {
            alert("You do not have permission to delete categories.");

            return;
        }

        // =========================================
        // MAKE SURE CATEGORY EXISTS
        // =========================================

        if (!deletingCategoryId) {
            return;
        }

        // =========================================
        // DO NOT DELETE CATEGORY WITH PRODUCTS
        // =========================================

        const productsInCategory = getCategoryProductCount(deletingCategoryId);

        if (productsInCategory > 0) {
            return;
        }

        // =========================================
        // GET CURRENT ADMIN SESSION
        // =========================================

        const {
            data: { session: categoryDeleteSession },
        } = await adminSupabase.auth.getSession();

        if (!categoryDeleteSession?.access_token) {
            alert("Unable to verify administrator session.");

            return;
        }

        // =========================================
        // SHOW DELETING STATE
        // =========================================

        deleteConfirmButton.disabled = true;

        deleteConfirmButton.innerHTML = `
        <i
            class="fa-solid fa-spinner fa-spin">
        </i>

        <span>
            Deleting...
        </span>
    `;

        try {
            // =========================================
            // SEND DELETE TO PROTECTED BACKEND
            // =========================================

            const categoryDeleteResponse = await fetch("https://mtc-backend-node-production.up.railway.app/admin-categories/delete", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    Authorization: `Bearer ${categoryDeleteSession.access_token}`,
                },

                body: JSON.stringify({
                    categoryId: deletingCategoryId,
                }),
            });

            // =========================================
            // READ BACKEND RESPONSE
            // =========================================

            const categoryDeleteResult = await categoryDeleteResponse.json();

            // =========================================
            // HANDLE BACKEND ERROR / 403
            // =========================================

            if (!categoryDeleteResponse.ok || categoryDeleteResult?.success !== true) {
                console.error("Category delete error:", categoryDeleteResult);

                alert(categoryDeleteResult?.error || "Unable to delete category.");

                return;
            }

            // =========================================
            // SUCCESS
            // =========================================

            console.log("✅ CATEGORY DELETED");

            closeDeleteCategoryModal();

            await loadAdminCategories();
        } catch (error) {
            console.error("Category delete request error:", error);

            alert("Unable to delete category.");
        } finally {
            // =========================================
            // RESTORE DELETE BUTTON
            // =========================================

            if (deleteConfirmButton && deletingCategoryId) {
                deleteConfirmButton.disabled = false;

                deleteConfirmButton.innerHTML = `
                <i
                    class="fa-solid fa-trash">
                </i>

                <span>
                    Delete Category
                </span>
            `;
            }
        }
    });

    /* =================================================
   MODAL BUTTON EVENTS
================================================= */

    if (addButton) {
        if (canCreateCategories) {
            addButton.style.display = "";

            addButton.addEventListener("click", openAddCategoryModal);
        } else {
            addButton.style.display = "none";
        }
    }

    modalClose?.addEventListener("click", closeCategoryModal);

    cancelButton?.addEventListener("click", closeCategoryModal);

    modalOverlay?.addEventListener("click", closeCategoryModal);

    deleteCancelButton?.addEventListener("click", closeDeleteCategoryModal);

    /* =================================================
   ESC KEY
================================================= */

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        closeCategoryModal();
        closeDeleteCategoryModal();
    });
    /* =================================================
           SIDEBAR TOGGLE
        ================================================= */

    menuButton?.addEventListener("click", () => {
        sidebar?.classList.toggle("sidebar-open");
    });

    /* =================================================
           INITIAL LOAD
        ================================================= */

    await loadAdminCategories();
});
/* =====================================================
   END OF ADMIN-CATEGORIES PAGE
===================================================== */

/* =========================================
   START OF MTC-ADMIN-MESSAGES JS
========================================= */
document.addEventListener("DOMContentLoaded", () => {
    const menuButton = document.querySelector(".mtc-admin-messages-menu-button");

    const sidebar = document.querySelector(".mw-dashboard-sidebar");

    if (!menuButton || !sidebar) {
        return;
    }

    menuButton.addEventListener("click", (event) => {
        event.stopPropagation();

        sidebar.classList.toggle("mw-dashboard-sidebar-open");
    });
});

document.addEventListener("DOMContentLoaded", async () => {
    const messagesList = document.getElementById("mtcAdminMessagesList");

    const inboxTab = document.getElementById("mtcAdminMessagesInboxTab");
    const deletedTab = document.getElementById("mtcAdminMessagesDeletedTab");
    const historyTab = document.getElementById("mtcAdminMessagesHistoryTab");

    const inboxTitle = document.getElementById("mtcAdminMessagesInboxTitle");

    const historyList = document.getElementById("mtcAdminMessageHistoryList");
    const historyPagination = document.getElementById("mtcAdminMessageHistoryPagination");
    const historyPrevious = document.getElementById("mtcAdminMessageHistoryPrevious");
    const historyNext = document.getElementById("mtcAdminMessageHistoryNext");
    const historyPage = document.getElementById("mtcAdminMessageHistoryPage");

    let currentMessagesFolder = "inbox";

    let messages = [];

    let messageHistory = [];
    let filteredMessageHistory = [];

    const MESSAGE_HISTORY_PER_PAGE = 10;

    let messageHistoryCurrentPage = 1;

    async function getCurrentMessageAdmin() {
        const {
            data: { user },
        } = await adminSupabase.auth.getUser();

        if (!user) {
            return null;
        }

        const { data: admin, error } = await adminSupabase
            .from("Admins")
            .select(
                `
            user_id,
            first_name,
            last_name,
            Admin_Roles (
                Admin_Positions (
                    name
                )
            )
        `
            )
            .eq("user_id", user.id)
            .maybeSingle();

        if (error) {
            console.error("MESSAGE HISTORY ADMIN LOAD ERROR:", error);
            return null;
        }

        const fullName =
            [admin?.first_name, admin?.last_name].filter(Boolean).join(" ").trim() || user.email || "Administrator";

        const positions = (admin?.Admin_Roles || []).map((role) => role.Admin_Positions?.name).filter(Boolean);

        return {
            userId: user.id,
            name: fullName,
            position: positions.join(", ") || "Administrator",
        };
    }

    async function recordMessageHistory(message, activityType, options = {}) {
        if (!message) {
            return;
        }

        const currentAdmin = await getCurrentMessageAdmin();

        if (!currentAdmin) {
            console.error("MESSAGE HISTORY: Unable to determine current administrator.");
            return;
        }

        const { error } = await adminSupabase.from("Admin_Message_History").insert({
            message_id: message.id || null,

            customer_name: message.name || "Customer",
            customer_email: message.email || null,
            subject: message.subject || "No Subject",
            original_message: message.message || "",

            activity_type: activityType,
            activity_details: options.activityDetails || null,

            reply_message: options.replyMessage || null,

            performed_by: currentAdmin.userId,
            performed_by_name: currentAdmin.name,
            performed_by_position: currentAdmin.position,
        });

        if (error) {
            console.error("MESSAGE HISTORY INSERT ERROR:", error);
        }
    }

    function formatMessageHistoryActivity(activityType) {
        const activityNames = {
            replied: "Replied",
            deleted: "Moved to Deleted",
            restored: "Restored",
            permanently_deleted: "Permanently Deleted",
        };

        return activityNames[activityType] || activityType || "Activity";
    }

    async function loadMessageHistory() {
        const { data, error } = await adminSupabase.from("Admin_Message_History").select("*").order("created_at", {
            ascending: false,
        });

        if (error) {
            console.error("MESSAGE HISTORY LOAD ERROR:", error);

            messageHistory = [];
            filteredMessageHistory = [];

            renderMessageHistory();

            return;
        }

        messageHistory = data || [];

        console.log("MESSAGE HISTORY LOADED:", data);

        filterMessageHistory();
    }

    function filterMessageHistory() {
        const searchValue = document.getElementById("mtcAdminMessagesSearch")?.value.trim().toLowerCase() || "";

        const selectedActivity = document.getElementById("mtcAdminMessagesStatusFilter")?.value || "all";

        filteredMessageHistory = messageHistory.filter((history) => {
            const searchableText = [
                history.customer_name,
                history.customer_email,
                history.subject,
                history.performed_by_name,
                history.performed_by_position,
                formatMessageHistoryActivity(history.activity_type),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const matchesSearch = searchableText.includes(searchValue);

            const matchesActivity = selectedActivity === "all" || history.activity_type === selectedActivity;

            return matchesSearch && matchesActivity;
        });

        const totalPages = Math.max(1, Math.ceil(filteredMessageHistory.length / MESSAGE_HISTORY_PER_PAGE));

        if (messageHistoryCurrentPage > totalPages) {
            messageHistoryCurrentPage = totalPages;
        }

        renderMessageHistory();
    }

    function renderMessageHistory() {
        console.log("ACTIVITY LOG RENDER:", {
            historyList,
            filteredMessageHistory,
            page: messageHistoryCurrentPage,
        });

        if (!historyList) {
            return;
        }

        const totalPages = Math.max(1, Math.ceil(filteredMessageHistory.length / MESSAGE_HISTORY_PER_PAGE));

        const startIndex = (messageHistoryCurrentPage - 1) * MESSAGE_HISTORY_PER_PAGE;

        const pageRecords = filteredMessageHistory.slice(startIndex, startIndex + MESSAGE_HISTORY_PER_PAGE);

        if (pageRecords.length === 0) {
            historyList.innerHTML = `
            <div class="mtc-admin-messages-empty">
                <i class="fa-solid fa-clock-rotate-left"></i>
                <h3>No message history</h3>
                <p>Message activity will appear here.</p>
            </div>
        `;
        } else {
            console.log("ACTIVITY LOG PAGE RECORDS:", pageRecords);
            historyList.innerHTML = pageRecords
                .map((history) => {
                    const activity = formatMessageHistoryActivity(history.activity_type);

                    const date = new Date(history.created_at).toLocaleString("en-US", {
                        timeZone: "America/Chicago",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                    });

                    return `
    <button
        type="button"
        class="mtc-admin-message-history-item"
        data-history-id="${escapeAdminHTML(history.id)}">

        <div class="mtc-admin-message-history-item-top">
            <span class="mtc-admin-message-history-item-name">
                ${escapeAdminHTML(history.customer_name || "Customer")}
            </span>

            <span class="mtc-admin-message-history-item-date">
                ${escapeAdminHTML(date)}
            </span>
        </div>

        <div class="mtc-admin-message-history-item-subject">
            ${escapeAdminHTML(history.subject || "No Subject")}
        </div>

        <span class="mtc-admin-message-history-badge">
            ${escapeAdminHTML(activity)}
        </span>
    </button>
`;
                })
                .join("");
            console.log("ACTIVITY LOG HTML RENDERED");
        }

        if (historyPage) {
            historyPage.textContent = `Page ${messageHistoryCurrentPage} of ${totalPages}`;
        }

        if (historyPrevious) {
            historyPrevious.disabled = messageHistoryCurrentPage <= 1;
        }

        if (historyNext) {
            historyNext.disabled = messageHistoryCurrentPage >= totalPages;
        }
    }

    // =========================================
    // MESSAGE HISTORY PAGINATION
    // =========================================
    historyPrevious?.addEventListener("click", () => {
        if (messageHistoryCurrentPage <= 1) {
            return;
        }

        messageHistoryCurrentPage--;

        renderMessageHistory();
    });

    historyNext?.addEventListener("click", () => {
        const totalPages = Math.max(1, Math.ceil(filteredMessageHistory.length / MESSAGE_HISTORY_PER_PAGE));

        if (messageHistoryCurrentPage >= totalPages) {
            return;
        }

        messageHistoryCurrentPage++;

        renderMessageHistory();
    });

    // =========================================
    // MESSAGE HISTORY DETAILS
    // =========================================

    historyList?.addEventListener("click", (event) => {
        const historyButton = event.target.closest(".mtc-admin-message-history-item");

        if (!historyButton) {
            return;
        }

        const history = messageHistory.find((record) => String(record.id) === String(historyButton.dataset.historyId));

        if (!history) {
            return;
        }

        const modal = document.getElementById("mtcAdminMessageHistoryModal");

        document.getElementById("mtcAdminHistoryCustomer").textContent = history.customer_name || "Customer";

        document.getElementById("mtcAdminHistoryEmail").textContent = history.customer_email || "--";

        document.getElementById("mtcAdminHistorySubject").textContent = history.subject || "No Subject";

        document.getElementById("mtcAdminHistoryActivity").textContent = formatMessageHistoryActivity(
            history.activity_type
        );

        document.getElementById("mtcAdminHistoryAdmin").textContent = history.performed_by_name || "Administrator";

        document.getElementById("mtcAdminHistoryPosition").textContent =
            history.performed_by_position || "Administrator";

        document.getElementById("mtcAdminHistoryDate").textContent = new Date(history.created_at).toLocaleString(
            "en-US",
            {
                timeZone: "America/Chicago",
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
            }
        );

        document.getElementById("mtcAdminHistoryOriginalMessage").textContent = history.original_message || "";

        const replySection = document.getElementById("mtcAdminHistoryReplySection");

        const reply = document.getElementById("mtcAdminHistoryReply");

        if (history.reply_message) {
            replySection.hidden = false;

            reply.textContent = history.reply_message;
        } else {
            replySection.hidden = true;

            reply.textContent = "";
        }

        modal.hidden = false;
    });

    // =========================================
    // MESSAGE HISTORY MODAL CLOSE
    // =========================================

    const messageHistoryModal = document.getElementById("mtcAdminMessageHistoryModal");

    const messageHistoryClose = document.getElementById("mtcAdminMessageHistoryClose");

    messageHistoryClose?.addEventListener("click", () => {
        messageHistoryModal.hidden = true;
    });

    messageHistoryModal?.addEventListener("click", (event) => {
        if (event.target === messageHistoryModal) {
            messageHistoryModal.hidden = true;
        }
    });

    // =========================================
    // ADMIN MESSAGE PERMISSIONS
    // =========================================
    let canReplyMessages = false;
    let canDeleteMessages = false;

    const {
        data: { session: messagePermissionSession },
    } = await adminSupabase.auth.getSession();

    if (messagePermissionSession?.access_token) {
        const messagePermissionHeaders = {
            Authorization: `Bearer ${messagePermissionSession.access_token}`,
        };

        const [replyMessagePermissionResponse, deleteMessagePermissionResponse] = await Promise.all([
            fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=messages.reply", {
                headers: messagePermissionHeaders,
            }),

            fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=messages.delete", {
                headers: messagePermissionHeaders,
            }),
        ]);

        const [replyMessagePermissionResult, deleteMessagePermissionResult] = await Promise.all([
            replyMessagePermissionResponse.json(),
            deleteMessagePermissionResponse.json(),
        ]);

        canReplyMessages = replyMessagePermissionResult?.allowed === true;
        canDeleteMessages = deleteMessagePermissionResult?.allowed === true;
    }

    console.log("MESSAGE PERMISSIONS:", {
        canReplyMessages,
        canDeleteMessages,
    });

    const messagesLayout = document.querySelector(".mtc-admin-messages-layout");

    const mobileBackButton = document.getElementById("mtcAdminMessagesMobileBack");
    const deleteButton = document.getElementById("mtcAdminMessagesDeleteButton");
    const restoreButton = document.getElementById("mtcAdminMessagesRestoreButton");
    const restoreSelectedButton = document.getElementById("mtcAdminMessagesRestoreSelected");

    if (!canDeleteMessages) {
        if (deleteButton) {
            deleteButton.style.display = "none";
        }

        if (restoreButton) {
            restoreButton.style.display = "none";
        }

        if (restoreSelectedButton) {
            restoreSelectedButton.style.display = "none";
        }
    }

    if (messagesList) {
        messagesList.addEventListener("change", (event) => {
            if (!event.target.classList.contains("mtc-admin-messages-select-checkbox")) {
                return;
            }

            const checkedMessages = messagesList.querySelectorAll(".mtc-admin-messages-select-checkbox:checked");

            if (restoreSelectedButton) {
                restoreSelectedButton.disabled = checkedMessages.length === 0;
            }
        });
    }
    const totalCount = document.getElementById("mtcAdminMessagesTotalCount");

    const newCount = document.getElementById("mtcAdminMessagesNewCount");

    const readCount = document.getElementById("mtcAdminMessagesReadCount");

    const repliedCount = document.getElementById("mtcAdminMessagesRepliedCount");

    const deleteModal = document.getElementById("mtcAdminDeleteModal");

    const deleteCancelButton = document.getElementById("mtcAdminDeleteCancel");

    const deleteConfirmButton = document.getElementById("mtcAdminDeleteConfirm");

    let selectedMessageId = null;

    // =========================================
    // MESSAGE FROM NOTIFICATION
    // =========================================

    const messageUrlParams = new URLSearchParams(window.location.search);

    const messageIdFromNotification = messageUrlParams.get("messageId");

    const messageActionFromNotification = messageUrlParams.get("action");

    const replyDrafts = {};

    async function getMessagesForCurrentFolder() {
        if (!messagesList) {
            return;
        }

        const { data, error } = await adminSupabase
            .from("Messages")
            .select("*")
            .eq("is_deleted", currentMessagesFolder === "deleted")
            .order(currentMessagesFolder === "deleted" ? "deleted_at" : "created_at", {
                ascending: false,
            });

        if (error) {
            console.error("ADMIN MESSAGES LOAD ERROR:", error);

            return;
        }

        messages = data || [];

        console.log("LOADED MESSAGE DATA:", messages);

        totalCount.textContent = messages.length;

        newCount.textContent = messages.filter((message) => message.status === "New").length;

        readCount.textContent = messages.filter((message) => message.status === "Read").length;

        repliedCount.textContent = messages.filter((message) => message.status === "Replied").length;

        renderAdminMessages();

        if (error) {
            console.error("ADMIN MESSAGES LOAD ERROR:", error);

            return;
        }
        totalCount.textContent = messages.length;

        newCount.textContent = messages.filter((message) => message.status === "New").length;

        readCount.textContent = messages.filter((message) => message.status === "Read").length;

        repliedCount.textContent = messages.filter((message) => message.status === "Replied").length;
    }

    await getMessagesForCurrentFolder();

    // =========================================
    // OPEN MESSAGE FROM BELL NOTIFICATION
    // =========================================

    if (messageIdFromNotification && messageActionFromNotification === "open_message") {
        const targetMessage = document.querySelector(
            `.mtc-admin-messages-list-item[data-message-id="${messageIdFromNotification}"]`
        );

        if (targetMessage) {
            targetMessage.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });

            targetMessage.click();

            window.history.replaceState({}, document.title, "mtc-admin-messages.html");
        }
    }

    inboxTab?.addEventListener("click", async () => {
        currentMessagesFolder = "inbox";

        messagesList.hidden = false;
        historyList.hidden = true;
        historyPagination.hidden = true;

        historyTab?.classList.remove("active");

        const messagesStatusFilter = document.getElementById("mtcAdminMessagesStatusFilter");

        if (messagesStatusFilter) {
            messagesStatusFilter.innerHTML = `
            <option value="all">All Messages</option>
            <option value="New">New</option>
            <option value="Read">Read</option>
            <option value="Replied">Replied</option>
        `;
        }

        // KEEP THE REST OF YOUR EXISTING INBOX CODE HERE

        if (restoreSelectedButton) {
            restoreSelectedButton.style.display = "none";
        }

        inboxTitle.textContent = "Customer Inbox";

        inboxTab.classList.add("active");

        deletedTab?.classList.remove("active");

        await getMessagesForCurrentFolder();
    });

    deletedTab?.addEventListener("click", async () => {
        currentMessagesFolder = "deleted";

        messagesList.hidden = false;
        historyList.hidden = true;
        historyPagination.hidden = true;

        const messagesStatusFilter = document.getElementById("mtcAdminMessagesStatusFilter");

        if (messagesStatusFilter) {
            messagesStatusFilter.innerHTML = `
            <option value="all">All Messages</option>
            <option value="New">New</option>
            <option value="Read">Read</option>
            <option value="Replied">Replied</option>
        `;
        }

        if (restoreSelectedButton) {
            restoreSelectedButton.style.display = "inline-flex";
        }

        inboxTitle.textContent = "Recently Deleted";

        deletedTab.classList.add("active");

        inboxTab?.classList.remove("active");
        historyTab?.classList.remove("active");

        await getMessagesForCurrentFolder();
    });

    historyTab?.addEventListener("click", async () => {
        console.log("ACTIVITY LOG TAB CLICKED");

        currentMessagesFolder = "history";

        inboxTitle.textContent = "Log History";

        inboxTab?.classList.remove("active");
        deletedTab?.classList.remove("active");
        historyTab.classList.add("active");

        messagesList.hidden = true;

        historyList.hidden = false;
        historyPagination.hidden = false;

        if (restoreSelectedButton) {
            restoreSelectedButton.style.display = "none";
        }

        const messagesStatusFilter = document.getElementById("mtcAdminMessagesStatusFilter");

        if (messagesStatusFilter) {
            messagesStatusFilter.innerHTML = `
                <option value="all">All Activity</option>
                <option value="replied">Replied</option>
                <option value="deleted">Moved to Deleted</option>
                <option value="restored">Restored</option>
                <option value="permanently_deleted">Permanently Deleted</option>
            `;
        }

        await loadMessageHistory();
    });

    function renderAdminMessages() {
        messagesList.innerHTML = messages
            .map((message) => {
                const createdDate = new Date(message.created_at).toLocaleString("en-US", {
                    timeZone: "America/Chicago",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                });

                const status = message.status || "New";

                const safeName = String(message.name || "Customer")
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");

                const safeSubject = String(message.subject || "No Subject")
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");

                const safeMessage = String(message.message || "")
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");

                return `
    <div class="mtc-admin-messages-bulk-row">

        <label class="mtc-admin-messages-row-checkbox">
            <input
                type="checkbox"
                class="mtc-admin-messages-select-checkbox"
                data-message-id="${message.id}"
            >
        </label>

        <button
            type="button"
            class="mtc-admin-messages-list-item ${status === "New" ? "new" : ""}"
            data-message-id="${message.id}">

            <div class="mtc-admin-messages-list-top">

                <span class="mtc-admin-messages-list-name">
                    ${safeName}
                </span>

                <div class="mtc-admin-messages-list-meta">

                    <span class="mtc-admin-messages-list-date">
                        ${createdDate}
                    </span>

                    <span
                        class="mtc-admin-messages-status-badge status-${status.toLowerCase()}">
                        ${status}
                    </span>

                </div>

            </div>

            <div class="mtc-admin-messages-list-subject">
                ${safeSubject}
            </div>

            <div class="mtc-admin-messages-list-preview">
                ${safeMessage}
            </div>

        </button>

    </div>
`;
            })
            .join("");
    }

    adminSupabase
        .channel("admin-messages-realtime")
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "Messages",
            },
            (payload) => {
                console.log("NEW MESSAGE RECEIVED:", payload.new);

                messages.unshift(payload.new);

                renderAdminMessages();
            }
        )
        .subscribe((status) => {
            console.log("ADMIN MESSAGES REALTIME STATUS:", status);
        });

    const noSelection = document.getElementById("mtcAdminMessagesNoSelection");

    const selectedMessage = document.getElementById("mtcAdminMessagesSelected");

    const customerAvatar = document.getElementById("mtcAdminMessagesAvatar");

    const customerName = document.getElementById("mtcAdminMessagesCustomerName");

    const customerEmail = document.getElementById("mtcAdminMessagesCustomerEmail");

    const messageStatus = document.getElementById("mtcAdminMessagesStatus");

    const messageSubject = document.getElementById("mtcAdminMessagesSubject");

    const messageDate = document.getElementById("mtcAdminMessagesDate");

    const messageBody = document.getElementById("mtcAdminMessagesBody");

    const sendReplyButton = document.getElementById("mtcAdminMessagesSendButton");

    const replyTextarea = document.getElementById("mtcAdminMessagesReply");

    const sentRepliesList = document.getElementById("mtcAdminMessagesSentList");

    const sentRepliesCount = document.getElementById("mtcAdminMessagesSentCount");

    if (!canReplyMessages) {
        if (sendReplyButton) {
            sendReplyButton.style.display = "none";
        }

        if (replyTextarea) {
            replyTextarea.disabled = true;
            replyTextarea.placeholder = "You do not have permission to reply to messages.";
        }
    }

    mobileBackButton?.addEventListener("click", (event) => {
        event.preventDefault();

        messagesLayout?.classList.remove("mobile-message-open");
    });

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    async function loadSentReplies(messageId) {
        if (!sentRepliesList || !sentRepliesCount) {
            return;
        }

        const { data, error } = await adminSupabase
            .from("Message_replies")
            .select("*")
            .eq("message_id", messageId)
            .order("created_at", {
                ascending: true,
            });

        if (error) {
            console.error("SENT REPLIES LOAD ERROR:", error);

            return;
        }

        const replies = data || [];

        sentRepliesCount.textContent = `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`;

        sentRepliesList.innerHTML = replies
            .map((reply) => {
                const formattedDate = new Date(reply.created_at).toLocaleString("en-US", {
                    timeZone: "America/Chicago",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                });

                return `
                    <div class="mtc-admin-messages-sent-item">

                        <div class="mtc-admin-messages-sent-text">
                            ${escapeHtml(reply.message || "")}
                        </div>

                        <div class="mtc-admin-messages-sent-meta">
                            Sent ${formattedDate}
                        </div>

                    </div>
                `;
            })
            .join("");
    }
    console.log("MESSAGE CLICK LISTENER ATTACHED");

    messagesList?.addEventListener("click", async (event) => {
        console.log("MESSAGE CLICKED", event.target);
        const messageButton = event.target.closest(".mtc-admin-messages-list-item");

        if (!messageButton) {
            return;
        }

        const messageId = messageButton.dataset.messageId;

        const selected = messages.find((message) => String(message.id) === String(messageId));

        if (!selected) {
            return;
        }

        messagesLayout?.classList.add("mobile-message-open");

        selectedMessageId = selected.id;

        if (restoreButton) {
            restoreButton.style.display = currentMessagesFolder === "deleted" ? "inline-flex" : "none";
        }

        if (selected.status === "New") {
            const { error: readError } = await adminSupabase
                .from("Messages")
                .update({
                    status: "Read",
                })
                .eq("id", selected.id);

            if (readError) {
                console.error("ADMIN MESSAGE READ ERROR:", readError);
            } else {
                selected.status = "Read";

                messageButton.classList.remove("new");
            }
        }
        const statusBadge = messageButton.querySelector(".mtc-admin-messages-status-badge");

        if (statusBadge) {
            statusBadge.textContent = "Read";

            statusBadge.className = "mtc-admin-messages-status-badge status-read";
            newCount.textContent = Math.max(0, Number(newCount.textContent) - 1);

            readCount.textContent = Number(readCount.textContent) + 1;
        }

        document.querySelectorAll(".mtc-admin-messages-list-item").forEach((item) => {
            item.classList.remove("active");
        });

        messageButton.classList.add("active");

        customerAvatar.textContent = (selected.name || "C").charAt(0).toUpperCase();

        customerName.textContent = selected.name || "Customer";

        customerEmail.textContent = selected.email || "";

        customerEmail.href = `mailto:${selected.email || ""}`;

        messageStatus.textContent = selected.status || "New";

        messageStatus.className = "mtc-admin-messages-status";

        messageStatus.classList.add(`status-${String(selected.status || "New").toLowerCase()}`);

        messageSubject.textContent = selected.subject || "No Subject";

        messageDate.textContent = new Date(selected.created_at).toLocaleString("en-US", {
            timeZone: "America/Chicago",
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });

        messageBody.textContent = selected.message || "";

        noSelection.hidden = true;
        selectedMessage.hidden = false;
        await loadSentReplies(selected.id);
        const replyTextarea = document.getElementById("mtcAdminMessagesReply");

        if (replyTextarea) {
            replyTextarea.value = replyDrafts[selected.id] || "";
        }

        restoreButton?.addEventListener("click", async () => {
            if (!canDeleteMessages) {
                alert("You do not have permission to restore messages.");
                return;
            }

            if (!selectedMessageId) {
                return;
            }

            const messageBeingRestored = messages.find((message) => String(message.id) === String(selectedMessageId));

            const { error } = await adminSupabase
                .from("Messages")
                .update({
                    is_deleted: false,
                    deleted_at: null,
                })

                .eq("id", selectedMessageId);

            if (error) {
                console.error("MESSAGE RESTORE ERROR:", error);

                return;
            }

            selectedMessageId = null;

            await recordMessageHistory(messageBeingRestored, "restored", {
                activityDetails: "Message restored to Inbox.",
            });

            noSelection.hidden = false;
            selectedMessage.hidden = true;

            messagesLayout?.classList.remove("mobile-message-open");

            await getMessagesForCurrentFolder();
        });
    });

    restoreSelectedButton?.addEventListener("click", async () => {
        if (!canDeleteMessages) {
            alert("You do not have permission to restore messages.");
            return;
        }

        const selectedIds = Array.from(
            messagesList.querySelectorAll(".mtc-admin-messages-select-checkbox:checked")
        ).map((checkbox) => checkbox.dataset.messageId);

        if (selectedIds.length === 0) {
            return;
        }

        const messagesBeingRestored = messages.filter((message) => selectedIds.includes(String(message.id)));

        const { error } = await adminSupabase
            .from("Messages")
            .update({
                is_deleted: false,
                deleted_at: null,
            })
            .in("id", selectedIds);

        if (error) {
            console.error("BULK MESSAGE RESTORE ERROR:", error);
            return;
        }

        for (const message of messagesBeingRestored) {
            await recordMessageHistory(message, "restored", {
                activityDetails: "Message restored to Inbox.",
            });
        }

        restoreSelectedButton.disabled = true;

        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;

        await getMessagesForCurrentFolder();

        updateDeleteSelectedButton();

        await getMessagesForCurrentFolder();
    });

    replyTextarea?.addEventListener("input", () => {
        if (!selectedMessageId) {
            return;
        }

        replyDrafts[selectedMessageId] = replyTextarea.value;
    });

    sendReplyButton?.addEventListener("click", async () => {
        if (!canReplyMessages) {
            alert("You do not have permission to reply to messages.");
            return;
        }

        if (!selectedMessageId) {
            return;
        }

        const replyText = replyTextarea.value.trim();

        if (!replyText) {
            alert("Please enter a reply.");
            return;
        }

        const selected = messages.find((message) => String(message.id) === String(selectedMessageId));

        if (!selected) {
            return;
        }

        const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-message-reply", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messageId: selected.id,
                email: selected.email,
                customerName: selected.name,
                subject: selected.subject,
                replyMessage: replyText,
            }),
        });

        const result = await response.json();

        console.log("SEND REPLY RESULT:", result);

        if (result.success) {
            selected.status = "Replied";

            replyDrafts[selected.id] = "";

            replyTextarea.value = "";

            await recordMessageHistory(selected, "replied", {
                activityDetails: "Administrator replied to customer message.",
                replyMessage: replyText,
            });

            messageStatus.textContent = "Replied";

            messageStatus.className = "mtc-admin-messages-status status-replied";

            const statusBadge = document.querySelector(
                `.mtc-admin-messages-list-item[data-message-id="${selected.id}"] .mtc-admin-messages-status-badge`
            );

            if (statusBadge) {
                statusBadge.textContent = "Replied";

                statusBadge.className = "mtc-admin-messages-status-badge status-replied";
            }
            await loadSentReplies(selected.id);
            sendReplyButton.textContent = "Reply Sent ✓";

            setTimeout(() => {
                sendReplyButton.textContent = "Send Reply";
            }, 2000);
        }
    });

    let deleteMode = "single";
    let bulkDeleteIds = [];

    deleteButton?.addEventListener("click", () => {
        if (!canDeleteMessages) {
            alert("You do not have permission to delete messages.");
            return;
        }

        if (!selectedMessageId) {
            return;
        }

        deleteMode = "single";
        bulkDeleteIds = [];

        deleteModal.hidden = false;

        deleteModal.classList.add("active");
    });

    deleteCancelButton?.addEventListener("click", () => {
        deleteModal.classList.remove("active");

        deleteModal.hidden = true;
    });

    console.log("DELETE CONFIRM ELEMENT:", deleteConfirmButton);

    document.addEventListener("click", async (event) => {
        const confirmButton = event.target.closest("#mtcAdminDeleteConfirm");

        if (!confirmButton) {
            return;
        }

        if (!canDeleteMessages) {
            alert("You do not have permission to delete messages.");
            return;
        }

        console.log("DELETE CONFIRM CLICKED");

        const deletingPermanently = currentMessagesFolder === "deleted";

        let historyMessages = [];

        if (deleteMode === "bulk") {
            historyMessages = messages.filter((message) => bulkDeleteIds.includes(String(message.id)));
        } else {
            const messageToDelete = messages.find((message) => String(message.id) === String(selectedMessageId));

            if (messageToDelete) {
                historyMessages = [messageToDelete];
            }
        }

        console.log("MESSAGE HISTORY DELETE DEBUG:", {
            deleteMode,
            selectedMessageId,
            bulkDeleteIds,
            historyMessages,
        });

        let deleteResult;

        if (deleteMode === "bulk") {
            if (bulkDeleteIds.length === 0) {
                return;
            }

            if (currentMessagesFolder === "deleted") {
                deleteResult = await adminSupabase.from("Messages").delete().in("id", bulkDeleteIds).select();
            } else {
                deleteResult = await adminSupabase
                    .from("Messages")
                    .update({
                        is_deleted: true,
                        deleted_at: new Date().toISOString(),
                    })
                    .in("id", bulkDeleteIds)
                    .select();
            }
        } else {
            if (!selectedMessageId) {
                return;
            }

            if (currentMessagesFolder === "deleted") {
                deleteResult = await adminSupabase.from("Messages").delete().eq("id", selectedMessageId).select();
            } else {
                deleteResult = await adminSupabase
                    .from("Messages")
                    .update({
                        is_deleted: true,
                        deleted_at: new Date().toISOString(),
                    })
                    .eq("id", selectedMessageId)
                    .select();
            }
        }

        const { data, error } = deleteResult;

        console.log("DELETE DATA:", data);
        console.log("DELETE ERROR:", error);

        if (error) {
            console.error("ADMIN MESSAGE DELETE ERROR:", error);
            return;
        }

        for (const message of historyMessages) {
            await recordMessageHistory(message, deletingPermanently ? "permanently_deleted" : "deleted", {
                activityDetails: deletingPermanently
                    ? "Message permanently deleted."
                    : "Message moved to Recently Deleted.",
            });
        }

        deleteModal.hidden = true;

        location.reload();
    });

    const selectAllCheckbox = document.getElementById("mtcAdminMessagesSelectAll");

    const deleteSelectedButton = document.getElementById("mtcAdminMessagesDeleteSelected");

    


    if (!canDeleteMessages && deleteSelectedButton) {
        deleteSelectedButton.style.display = "none";
    }

    function updateDeleteSelectedButton() {
        const selectedCount = document.querySelectorAll(".mtc-admin-messages-select-checkbox:checked").length;

        deleteSelectedButton.disabled = selectedCount === 0;

        if (selectedCount > 0) {
            deleteSelectedButton.innerHTML = `
                            <i class="fa-solid fa-trash"></i>
                            Delete Selected (${selectedCount})
                        `;
        } else {
            deleteSelectedButton.innerHTML = `
                            <i class="fa-solid fa-trash"></i>
                            Delete Selected
                        `;
        }
    }

    selectAllCheckbox?.addEventListener("change", () => {
        document.querySelectorAll(".mtc-admin-messages-select-checkbox").forEach((checkbox) => {
            checkbox.checked = selectAllCheckbox.checked;
        });

        updateDeleteSelectedButton();

        if (restoreSelectedButton) {
            restoreSelectedButton.disabled = !selectAllCheckbox.checked;
        }
    });

    messagesList?.addEventListener("change", (event) => {
        if (!event.target.matches(".mtc-admin-messages-select-checkbox")) {
            return;
        }

        const checkedCount = document.querySelectorAll(".mtc-admin-messages-select-checkbox:checked").length;

        const totalCheckboxes = document.querySelectorAll(".mtc-admin-messages-select-checkbox").length;

        selectAllCheckbox.checked = checkedCount === totalCheckboxes;

        selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < totalCheckboxes;

        updateDeleteSelectedButton();
    });

    deleteSelectedButton?.addEventListener("click", () => {
        if (!canDeleteMessages) {
            alert("You do not have permission to delete messages.");
            return;
        }

        const selectedIds = Array.from(document.querySelectorAll(".mtc-admin-messages-select-checkbox:checked")).map(
            (checkbox) => checkbox.dataset.messageId
        );

        if (selectedIds.length === 0) {
            return;
        }

        deleteMode = "bulk";
        bulkDeleteIds = selectedIds;

        deleteModal.hidden = false;

        deleteModal.classList.add("active");
    });

    const messagesSearch = document.getElementById("mtcAdminMessagesSearch");

    messagesSearch?.addEventListener("input", () => {
        if (currentMessagesFolder === "history") {
            messageHistoryCurrentPage = 1;

            filterMessageHistory();

            return;
        }

        const searchValue = messagesSearch.value.trim().toLowerCase();

        document.querySelectorAll(".mtc-admin-messages-bulk-row").forEach((row) => {
            const messageButton = row.querySelector(".mtc-admin-messages-list-item");

            const name = messageButton.querySelector(".mtc-admin-messages-list-name")?.textContent.toLowerCase() || "";

            const subject =
                messageButton.querySelector(".mtc-admin-messages-list-subject")?.textContent.toLowerCase() || "";

            const preview =
                messageButton.querySelector(".mtc-admin-messages-list-preview")?.textContent.toLowerCase() || "";

            const matchesSearch =
                name.includes(searchValue) || subject.includes(searchValue) || preview.includes(searchValue);

            row.style.display = matchesSearch ? "" : "none";
        });
    });

    const messagesStatusFilter = document.getElementById("mtcAdminMessagesStatusFilter");

    function filterAdminMessages() {
        const searchValue = messagesSearch.value.trim().toLowerCase();

        const selectedStatus = messagesStatusFilter.value;
        document.querySelectorAll(".mtc-admin-messages-bulk-row").forEach((row) => {
            const name = row.querySelector(".mtc-admin-messages-list-name")?.textContent.toLowerCase() || "";

            const subject = row.querySelector(".mtc-admin-messages-list-subject")?.textContent.toLowerCase() || "";

            const preview = row.querySelector(".mtc-admin-messages-list-preview")?.textContent.toLowerCase() || "";
            const status = row.querySelector(".mtc-admin-messages-status-badge")?.textContent.trim() || "";
            const matchesSearch =
                name.includes(searchValue) || subject.includes(searchValue) || preview.includes(searchValue);

            const matchesStatus = selectedStatus === "All" || status === selectedStatus;
            row.style.display = matchesSearch && matchesStatus ? "" : "none";
        });
    }

    messagesStatusFilter?.addEventListener("change", () => {
        if (currentMessagesFolder === "history") {
            messageHistoryCurrentPage = 1;

            filterMessageHistory();

            return;
        }

        const selectedStatus = messagesStatusFilter.value;

        document.querySelectorAll(".mtc-admin-messages-bulk-row").forEach((row) => {
            const statusBadge = row.querySelector(".mtc-admin-messages-status-badge");

            const rowStatus = statusBadge?.textContent.trim() || "";

            const matchesStatus = selectedStatus === "all" || rowStatus === selectedStatus;

            row.style.display = matchesStatus ? "" : "none";
        });
    });
});
/* =========================================
        END OF MTC-ADMIN-MESSAGES JS
========================================= */

/* =========================================
        START OF MTC-ADMIN-SETTINGS JS
========================================= */
document.addEventListener("DOMContentLoaded", async () => {
    const isSettingsPage = window.location.pathname.endsWith("mtc-admin-settings.html");

    if (!isSettingsPage) {
        return;
    }

    const mtcAdminLoginUnlockSuccessButton = document.getElementById("mtcAdminLoginUnlockSuccessButton");

    const mtcAdminLoginUnlockErrorButton = document.getElementById("mtcAdminLoginUnlockErrorButton");

    const mtcAdminLoginUnlockErrorMessage = document.getElementById("mtcAdminLoginUnlockErrorMessage");

    if (mtcAdminLoginUnlockErrorButton) {
        mtcAdminLoginUnlockErrorButton.addEventListener("click", () => {
            const errorModal = document.getElementById("mtcAdminLoginUnlockErrorModal");

            if (errorModal) {
                errorModal.style.display = "none";
            }
        });
    }

    if (mtcAdminLoginUnlockSuccessButton) {
        mtcAdminLoginUnlockSuccessButton.addEventListener("click", () => {
            localStorage.setItem("mtcAdminSettingsActiveTab", "security");

            window.location.reload();
        });
    }

    const unlockLoginButton = document.getElementById("mtcAdminUnlockLoginButton");

    const unlockEmailInput = document.getElementById("mtcAdminUnlockEmail");

    const unlockIpAddressInput = document.getElementById("mtcAdminUnlockIpAddress");

    // =========================================
    // SECURITY SETTINGS ELEMENTS
    // =========================================

    const securityFailedAttemptLimitInput = document.getElementById("mtcAdminSecurityFailedAttemptLimit");

    const securityLockoutDurationInput = document.getElementById("mtcAdminSecurityLockoutDuration");

    const securitySessionTimeoutInput = document.getElementById("mtcAdminSecuritySessionTimeout");

    let canManageSecurity = false;
    let canRevokeAdminSessions = false;
    let canUnlockAdminLogins = false;
    let canManageShipping = false;

    // =========================================
    // SETTINGS TAB VIEW PERMISSIONS
    // =========================================

    let canViewStoreSettings = false;
    let canViewAdminProfile = false;
    let canViewAccountManagement = false;
    let canViewNotifications = false;
    let canViewShipping = false;
    let canViewSecurity = false;

    const {
        data: { session: securityPermissionSession },
    } = await adminSupabase.auth.getSession();

    if (securityPermissionSession?.access_token) {
        const securityPermissionHeaders = {
            Authorization: `Bearer ${securityPermissionSession.access_token}`,
        };

        const [manageSecurityResponse, revokeSessionsResponse, unlockLoginsResponse, manageShippingResponse] =
            await Promise.all([
                fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=security.manage_settings", {
                    headers: securityPermissionHeaders,
                }),

                fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=security.revoke_sessions", {
                    headers: securityPermissionHeaders,
                }),

                fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=security.unlock_logins", {
                    headers: securityPermissionHeaders,
                }),

                fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=shipping.manage", {
                    headers: securityPermissionHeaders,
                }),
            ]);

        const manageSecurityResult = await manageSecurityResponse.json();

        const [revokeSessionsResult, unlockLoginsResult, manageShippingResult] = await Promise.all([
            revokeSessionsResponse.json(),
            unlockLoginsResponse.json(),
            manageShippingResponse.json(),
        ]);

        canManageSecurity = manageSecurityResponse.ok && manageSecurityResult?.allowed === true;

        canRevokeAdminSessions = revokeSessionsResult?.allowed === true;

        canUnlockAdminLogins = unlockLoginsResult?.allowed === true;

        canManageShipping = manageShippingResult?.allowed === true;

        // =========================================
        // ALL AUTHENTICATED ADMINS CAN VIEW THESE
        // =========================================

        canViewStoreSettings = true;

        canViewAdminProfile = true;

        canViewAccountManagement = true;

        canViewNotifications = true;

        canViewShipping = true;

        canViewSecurity = true;

        const securitySettingsSaveButton = document.getElementById("mtcAdminSecuritySettingsSaveButton");

        const securitySuccessModal = document.getElementById("mtcAdminSecuritySuccessModal");

        const securitySuccessButton = document.getElementById("mtcAdminSecuritySuccessButton");

        const securitySuccessOverlay = document.getElementById("mtcAdminSecuritySuccessOverlay");

        // =========================================
        // SECURITY SETTINGS SUCCESS MODAL
        // =========================================

        function closeSecuritySuccessModal() {
            if (!securitySuccessModal) {
                return;
            }

            securitySuccessModal.classList.remove("active");

            securitySuccessModal.setAttribute("aria-hidden", "true");
        }

        securitySuccessButton?.addEventListener("click", closeSecuritySuccessModal);

        securitySuccessOverlay?.addEventListener("click", closeSecuritySuccessModal);

        // =========================================
        // LOAD SECURITY SETTINGS
        // =========================================

        async function loadAdminSecuritySettings() {
            if (!securityFailedAttemptLimitInput || !securityLockoutDurationInput || !securitySessionTimeoutInput) {
                return;
            }

            try {
                const { data: securitySettings, error: securitySettingsError } = await adminSupabase
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

                if (securitySettingsError) {
                    console.error("Security settings load error:", securitySettingsError);

                    return;
                }

                if (!securitySettings) {
                    return;
                }

                securityFailedAttemptLimitInput.value = securitySettings.failed_attempt_limit;

                securityLockoutDurationInput.value = securitySettings.lockout_duration_minutes;

                securitySessionTimeoutInput.value = securitySettings.session_timeout_minutes;
            } catch (error) {
                console.error("Security settings error:", error);
            }
        }

        // =========================================
        // START SECURITY SETTINGS
        // =========================================

        loadAdminSecuritySettings();

        // =========================================
        // START SECURITY SETTINGS
        // =========================================

        loadAdminSecuritySettings();

        // =========================================
        // SAVE SECURITY SETTINGS
        // =========================================

        securitySettingsSaveButton?.addEventListener("click", async () => {
            const failedAttemptLimit = Number(securityFailedAttemptLimitInput.value);

            const lockoutDurationMinutes = Number(securityLockoutDurationInput.value);

            const sessionTimeoutMinutes = Number(securitySessionTimeoutInput.value);

            try {
                securitySettingsSaveButton.disabled = true;

                securitySettingsSaveButton.innerHTML = `
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    Saving...
                `;

                const { data: sessionData, error: sessionError } = await adminSupabase.auth.getSession();

                if (sessionError || !sessionData?.session?.access_token) {
                    throw new Error("Admin session not found.");
                }

                const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-security-settings", {
                    method: "PUT",

                    headers: {
                        "Content-Type": "application/json",

                        Authorization: `Bearer ${sessionData.session.access_token}`,
                    },

                    body: JSON.stringify({
                        failedAttemptLimit: failedAttemptLimit,

                        lockoutDurationMinutes: lockoutDurationMinutes,

                        sessionTimeoutMinutes: sessionTimeoutMinutes,
                    }),
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.error || "Unable to save Security Settings.");
                }

                const securitySuccessModal = document.getElementById("mtcAdminSecuritySuccessModal");

                if (securitySuccessModal) {
                    securitySuccessModal.classList.add("active");

                    securitySuccessModal.setAttribute("aria-hidden", "false");
                }

                await loadAdminSecuritySettings();
            } catch (error) {
                console.error("Security Settings save error:", error);

                alert(error.message || "Unable to save Security Settings.");
            } finally {
                securitySettingsSaveButton.disabled = false;

                securitySettingsSaveButton.innerHTML = `
                    <i class="fa-solid fa-floppy-disk"></i>
                    Save Security Settings
                `;
            }
        });

        // =========================================
        // SECURITY TABLE ELEMENTS
        // =========================================
        // =========================================
        // SECURITY TABLE ELEMENTS
        // =========================================

        const mtcAdminLoginLockoutTableBody = document.getElementById("mtcAdminLoginLockoutTableBody");

        const mtcAdminLoginAttemptHistoryTableBody = document.getElementById("mtcAdminLoginAttemptHistoryTableBody");

        const mtcAdminLoginAttemptHistorySearch = document.getElementById("mtcAdminLoginAttemptHistorySearch");

        const mtcAdminLoginAttemptHistoryResultFilter = document.getElementById(
            "mtcAdminLoginAttemptHistoryResultFilter"
        );

        const mtcAdminLoginAttemptPrevious = document.getElementById("mtcAdminLoginAttemptPrevious");

        const mtcAdminLoginAttemptNext = document.getElementById("mtcAdminLoginAttemptNext");

        const mtcAdminLoginAttemptPageInfo = document.getElementById("mtcAdminLoginAttemptPageInfo");

        const ADMIN_LOGIN_ATTEMPTS_PER_PAGE = 15;

        let adminLoginAttempts = [];
        let adminLoginAttemptCurrentPage = 1;

        // =========================================
        // ACTIVE SESSION ELEMENTS
        // =========================================

        const mtcAdminActiveSessionsTableBody = document.getElementById("mtcAdminActiveSessionsTableBody");

        const mtcAdminActiveSessionsPrevious = document.getElementById("mtcAdminActiveSessionsPrevious");

        const mtcAdminActiveSessionsNext = document.getElementById("mtcAdminActiveSessionsNext");

        const mtcAdminActiveSessionsPageInfo = document.getElementById("mtcAdminActiveSessionsPageInfo");

        const ADMIN_ACTIVE_SESSIONS_PER_PAGE = 5;

        let adminActiveSessions = [];
        let adminActiveSessionsCurrentPage = 1;

        if (mtcAdminActiveSessionsPrevious) {
            mtcAdminActiveSessionsPrevious.addEventListener("click", () => {
                if (adminActiveSessionsCurrentPage > 1) {
                    adminActiveSessionsCurrentPage--;

                    loadAdminActiveSessions();
                }
            });
        }

        if (mtcAdminActiveSessionsNext) {
            mtcAdminActiveSessionsNext.addEventListener("click", () => {
                const totalPages = Math.max(1, Math.ceil(adminActiveSessions.length / ADMIN_ACTIVE_SESSIONS_PER_PAGE));

                if (adminActiveSessionsCurrentPage < totalPages) {
                    adminActiveSessionsCurrentPage++;

                    loadAdminActiveSessions();
                }
            });
        }

        async function loadAdminLoginLockouts() {
            if (!mtcAdminLoginLockoutTableBody) {
                return;
            }

            try {
                const { data: sessionData } = await adminSupabase.auth.getSession();

                const accessToken = sessionData?.session?.access_token;

                if (!accessToken) {
                    mtcAdminLoginLockoutTableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        Unable to verify Admin session.
                    </td>
                </tr>
            `;

                    return;
                }

                const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-login/lockouts", {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    mtcAdminLoginLockoutTableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        ${result.error || "Unable to load login lockouts."}
                    </td>
                </tr>
            `;

                    return;
                }

                const lockouts = result.lockouts || [];

                if (lockouts.length === 0) {
                    mtcAdminLoginLockoutTableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        No current login lockouts.
                    </td>
                </tr>
            `;

                    return;
                }

                mtcAdminLoginLockoutTableBody.innerHTML = "";

                lockouts.forEach((lockout) => {
                    const row = document.createElement("tr");

                    const emailCell = document.createElement("td");

                    const ipCell = document.createElement("td");

                    const attemptsCell = document.createElement("td");

                    const lockedUntilCell = document.createElement("td");

                    const statusCell = document.createElement("td");

                    emailCell.textContent = lockout.email || "—";

                    ipCell.textContent = lockout.ip_address || "—";

                    attemptsCell.textContent = String(lockout.failed_attempts ?? 0);

                    if (lockout.locked_until) {
                        const lockedUntil = new Date(lockout.locked_until);

                        lockedUntilCell.textContent = lockedUntil.toLocaleString();

                        if (Date.now() < lockedUntil.getTime()) {
                            statusCell.textContent = "Locked";
                        } else {
                            statusCell.textContent = "Expired";
                        }
                    } else {
                        lockedUntilCell.textContent = "—";

                        statusCell.textContent = "Monitoring";
                    }

                    row.appendChild(emailCell);
                    row.appendChild(ipCell);
                    row.appendChild(attemptsCell);
                    row.appendChild(lockedUntilCell);
                    row.appendChild(statusCell);

                    mtcAdminLoginLockoutTableBody.appendChild(row);
                });
            } catch (error) {
                console.error("ADMIN LOGIN LOCKOUT LOAD ERROR:", error);

                mtcAdminLoginLockoutTableBody.innerHTML = `
            <tr>
                <td colspan="5">
                    Unable to connect to the Admin login server.
                </td>
            </tr>
        `;
            }
        }

        function renderAdminLoginAttemptHistory() {
            const startIndex = (adminLoginAttemptCurrentPage - 1) * ADMIN_LOGIN_ATTEMPTS_PER_PAGE;

            const endIndex = startIndex + ADMIN_LOGIN_ATTEMPTS_PER_PAGE;

            const pageAttempts = adminLoginAttempts.slice(startIndex, endIndex);

            mtcAdminLoginAttemptHistoryTableBody.innerHTML = "";
            pageAttempts.forEach((attempt) => {
                const row = document.createElement("tr");

                const dateCell = document.createElement("td");

                const emailCell = document.createElement("td");

                const ipCell = document.createElement("td");

                const resultCell = document.createElement("td");

                const reasonCell = document.createElement("td");

                dateCell.textContent = attempt.created_at ? new Date(attempt.created_at).toLocaleString() : "—";

                emailCell.textContent = attempt.email || "—";

                ipCell.textContent = attempt.ip_address || "—";

                const loginWasSuccessful = attempt.success === true || attempt.success === "true";

                resultCell.textContent = loginWasSuccessful ? "Successful" : "Failed";

                resultCell.classList.add(
                    loginWasSuccessful ? "mtc-admin-login-attempt-success" : "mtc-admin-login-attempt-failed"
                );

                reasonCell.textContent = loginWasSuccessful ? "—" : attempt.failure_reason || "Unknown";

                row.appendChild(dateCell);

                row.appendChild(emailCell);

                row.appendChild(ipCell);

                row.appendChild(resultCell);

                row.appendChild(reasonCell);

                mtcAdminLoginAttemptHistoryTableBody.appendChild(row);
            });

            console.log("LOGIN ATTEMPT PAGE:", pageAttempts);

            const totalPages = Math.max(1, Math.ceil(adminLoginAttempts.length / ADMIN_LOGIN_ATTEMPTS_PER_PAGE));

            if (mtcAdminLoginAttemptPageInfo) {
                mtcAdminLoginAttemptPageInfo.textContent = `Page ${adminLoginAttemptCurrentPage} of ${totalPages}`;
            }

            if (mtcAdminLoginAttemptPrevious) {
                mtcAdminLoginAttemptPrevious.disabled = adminLoginAttemptCurrentPage <= 1;
            }
            if (mtcAdminLoginAttemptNext) {
                mtcAdminLoginAttemptNext.disabled = adminLoginAttemptCurrentPage >= totalPages;
            }
        }
        mtcAdminLoginAttemptPrevious?.addEventListener("click", () => {
            if (adminLoginAttemptCurrentPage > 1) {
                adminLoginAttemptCurrentPage--;

                renderAdminLoginAttemptHistory();
            }
        });
        mtcAdminLoginAttemptNext?.addEventListener("click", () => {
            const totalPages = Math.max(1, Math.ceil(adminLoginAttempts.length / ADMIN_LOGIN_ATTEMPTS_PER_PAGE));

            if (adminLoginAttemptCurrentPage < totalPages) {
                adminLoginAttemptCurrentPage++;

                renderAdminLoginAttemptHistory();
            }
        });
        async function loadAdminLoginAttemptHistory() {
            // =========================================
            // ADMIN ACTIVITY LOG
            // =========================================

            const mtcAdminActivityLogTableBody = document.getElementById("mtcAdminActivityLogTableBody");
            const mtcAdminActivityLogNext = document.getElementById("mtcAdminActivityLogNext");
            const mtcAdminActivityLogPrevious = document.getElementById("mtcAdminActivityLogPrevious");
            let adminActivityLog = [];

            let adminActivityLogCurrentPage = 1;

            const ADMIN_ACTIVITY_LOG_PER_PAGE = 7;

            // =========================================
            // RENDER ADMIN ACTIVITY LOG
            // =========================================

            function renderAdminActivityLog() {
                if (!mtcAdminActivityLogTableBody) {
                    return;
                }

                mtcAdminActivityLogTableBody.innerHTML = "";

                if (!adminActivityLog || adminActivityLog.length === 0) {
                    mtcAdminActivityLogTableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    No Admin activity found.
                </td>
            </tr>
        `;

                    return;
                }
                const totalPages = Math.ceil(adminActivityLog.length / ADMIN_ACTIVITY_LOG_PER_PAGE);
                mtcAdminActivityLogPageInfo.textContent = `Page ${adminActivityLogCurrentPage} of ${totalPages}`;
                if (mtcAdminActivityLogPrevious) {
                    mtcAdminActivityLogPrevious.disabled = adminActivityLogCurrentPage <= 1;
                }

                if (mtcAdminActivityLogNext) {
                    mtcAdminActivityLogNext.disabled = adminActivityLogCurrentPage >= totalPages;
                }
                const startIndex = (adminActivityLogCurrentPage - 1) * ADMIN_ACTIVITY_LOG_PER_PAGE;

                const endIndex = startIndex + ADMIN_ACTIVITY_LOG_PER_PAGE;

                const activityForPage = adminActivityLog.slice(startIndex, endIndex);

                activityForPage.forEach((activity) => {
                    const row = document.createElement("tr");

                    const dateCell = document.createElement("td");

                    const adminCell = document.createElement("td");

                    const positionCell = document.createElement("td");

                    const categoryCell = document.createElement("td");

                    const actionCell = document.createElement("td");

                    const descriptionCell = document.createElement("td");

                    dateCell.textContent = activity.created_at ? new Date(activity.created_at).toLocaleString() : "—";

                    adminCell.textContent = activity.admin_name || activity.admin_email || "—";

                    positionCell.textContent = activity.position || "—";

                    categoryCell.textContent = activity.category || "—";

                    actionCell.textContent = activity.action || "—";

                    descriptionCell.textContent = activity.description || "—";

                    row.appendChild(dateCell);

                    row.appendChild(adminCell);

                    row.appendChild(positionCell);

                    row.appendChild(categoryCell);

                    row.appendChild(actionCell);

                    row.appendChild(descriptionCell);

                    mtcAdminActivityLogTableBody.appendChild(row);
                });
            }

            // =========================================
            // LOAD ADMIN ACTIVITY LOG
            // =========================================

            async function loadAdminActivityLog() {
                if (!mtcAdminActivityLogTableBody) {
                    return;
                }

                try {
                    const { data: sessionData } = await adminSupabase.auth.getSession();

                    const accessToken = sessionData?.session?.access_token;

                    if (!accessToken) {
                        mtcAdminActivityLogTableBody.innerHTML = `
                    <tr>
                        <td colspan="6">
                            Unable to verify Admin session.
                        </td>
                    </tr>
                `;

                        return;
                    }

                    const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-activity-log", {
                        method: "GET",

                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    });

                    const result = await response.json();

                    if (!response.ok || result.success !== true) {
                        console.error("Admin activity log load failed:", result.error);

                        mtcAdminActivityLogTableBody.innerHTML = `
                    <tr>
                        <td colspan="6">
                            Unable to load Admin activity.
                        </td>
                    </tr>
                `;

                        return;
                    }

                    adminActivityLog = result.activity || [];

                    adminActivityLog.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                    adminActivityLogCurrentPage = 1;

                    renderAdminActivityLog();
                } catch (error) {
                    console.error("Admin activity log error:", error);

                    mtcAdminActivityLogTableBody.innerHTML = `
                <tr>
                    <td colspan="6">
                        Unable to connect to the Admin activity server.
                    </td>
                </tr>
            `;
                }
            }

            // =========================================
            // START ADMIN ACTIVITY LOG
            // =========================================
            mtcAdminActivityLogNext?.addEventListener("click", () => {
                const totalPages = Math.ceil(adminActivityLog.length / ADMIN_ACTIVITY_LOG_PER_PAGE);

                if (adminActivityLogCurrentPage < totalPages) {
                    adminActivityLogCurrentPage++;
                    renderAdminActivityLog();
                }
            });

            mtcAdminActivityLogPrevious?.addEventListener("click", () => {
                if (adminActivityLogCurrentPage > 1) {
                    adminActivityLogCurrentPage--;
                    renderAdminActivityLog();
                }
            });
            loadAdminActivityLog();
            if (!mtcAdminLoginAttemptHistoryTableBody) {
                return;
            }

            try {
                const { data: sessionData } = await adminSupabase.auth.getSession();

                const accessToken = sessionData?.session?.access_token;

                if (!accessToken) {
                    mtcAdminLoginAttemptHistoryTableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        Unable to verify Admin session.
                    </td>
                </tr>
            `;

                    return;
                }

                const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-login/attempts", {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    mtcAdminLoginAttemptHistoryTableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        ${result.error || "Unable to load login attempt history."}
                    </td>
                </tr>
            `;

                    return;
                }

                adminLoginAttempts = [...(result.attempts || [])].sort(
                    (a, b) => new Date(b.created_at) - new Date(a.created_at)
                );

                adminLoginAttemptCurrentPage = 1;

                if (adminLoginAttempts.length === 0) {
                    mtcAdminLoginAttemptHistoryTableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        No login attempt history found.
                    </td>
                </tr>
            `;

                    return;
                }

                renderAdminLoginAttemptHistory();

                return;
            } catch (error) {
                console.error("ADMIN LOGIN ATTEMPT HISTORY LOAD ERROR:", error);

                mtcAdminLoginAttemptHistoryTableBody.innerHTML = `
            <tr>
                <td colspan="5">
                    Unable to connect to the Admin login server.
                </td>
            </tr>
        `;
            }
        }

        async function loadAdminActiveSessions() {
            if (!mtcAdminActiveSessionsTableBody) {
                return;
            }

            try {
                const { data: sessionData } = await adminSupabase.auth.getSession();

                const accessToken = sessionData?.session?.access_token;

                if (!accessToken) {
                    mtcAdminActiveSessionsTableBody.innerHTML = `
                <tr>
                    <td colspan="6">
                        Unable to verify Admin session.
                    </td>
                </tr>
            `;

                    return;
                }

                const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-active-sessions", {
                    method: "GET",

                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    mtcAdminActiveSessionsTableBody.innerHTML = `
                <tr>
                    <td colspan="6">
                        ${result.error || "Unable to load active Admin sessions."}
                    </td>
                </tr>
            `;

                    return;
                }

                adminActiveSessions = result.sessions || [];

                if (!adminActiveSessionsCurrentPage || adminActiveSessionsCurrentPage < 1) {
                    adminActiveSessionsCurrentPage = 1;
                }

                if (adminActiveSessions.length === 0) {
                    mtcAdminActiveSessionsTableBody.innerHTML = `
                <tr>
                    <td colspan="6">
                        No active Admin sessions found.
                    </td>
                </tr>
            `;

                    if (mtcAdminActiveSessionsPageInfo) {
                        mtcAdminActiveSessionsPageInfo.textContent = "Page 1 of 1";
                    }

                    if (mtcAdminActiveSessionsPrevious) {
                        mtcAdminActiveSessionsPrevious.disabled = true;
                    }

                    if (mtcAdminActiveSessionsNext) {
                        mtcAdminActiveSessionsNext.disabled = true;
                    }

                    return;
                }

                const totalPages = Math.max(1, Math.ceil(adminActiveSessions.length / ADMIN_ACTIVE_SESSIONS_PER_PAGE));

                if (adminActiveSessionsCurrentPage > totalPages) {
                    adminActiveSessionsCurrentPage = totalPages;
                }

                const startIndex = (adminActiveSessionsCurrentPage - 1) * ADMIN_ACTIVE_SESSIONS_PER_PAGE;

                const endIndex = startIndex + ADMIN_ACTIVE_SESSIONS_PER_PAGE;

                const sessionsForPage = adminActiveSessions.slice(startIndex, endIndex);

                mtcAdminActiveSessionsTableBody.innerHTML = "";

                sessionsForPage.forEach((session) => {
                    const row = document.createElement("tr");

                    const administratorCell = document.createElement("td");

                    const ipCell = document.createElement("td");

                    const deviceCell = document.createElement("td");

                    const signedInCell = document.createElement("td");

                    const lastActivityCell = document.createElement("td");

                    const actionCell = document.createElement("td");

                    administratorCell.textContent = session.email || "—";

                    ipCell.textContent = session.ip_address || "—";

                    const userAgent = session.user_agent || "";

                    let browserName = "Unknown Browser";

                    let operatingSystem = "Unknown OS";

                    if (userAgent.includes("Edg/")) {
                        browserName = "Microsoft Edge";
                    } else if (userAgent.includes("Chrome/")) {
                        browserName = "Google Chrome";
                    } else if (userAgent.includes("Firefox/")) {
                        browserName = "Mozilla Firefox";
                    } else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome/")) {
                        browserName = "Safari";
                    }

                    if (userAgent.includes("Windows NT 10.0")) {
                        operatingSystem = "Windows";
                    } else if (userAgent.includes("Mac OS X")) {
                        operatingSystem = "macOS";
                    } else if (userAgent.includes("Android")) {
                        operatingSystem = "Android";
                    } else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
                        operatingSystem = "iOS";
                    }

                    deviceCell.textContent = `${browserName} on ${operatingSystem}`;

                    signedInCell.textContent = session.signed_in_at
                        ? new Date(session.signed_in_at).toLocaleString()
                        : "—";

                    lastActivityCell.textContent = session.last_activity_at
                        ? new Date(session.last_activity_at).toLocaleString()
                        : "—";

                    const revokeButton = document.createElement("button");

                    revokeButton.type = "button";

                    revokeButton.className = "mtc-admin-revoke-session-button";

                    revokeButton.textContent = "Revoke Access";

                    revokeButton.dataset.sessionId = session.id;

                    revokeButton.dataset.authSessionId = session.auth_session_id || "";
                    if (!canRevokeAdminSessions) {
                        revokeButton.style.display = "none";
                    }
                    revokeButton.addEventListener("click", async () => {
                        if (!canRevokeAdminSessions) {
                            alert("You do not have permission to revoke Admin sessions.");
                            return;
                        }
                        const { data: sessionData } = await adminSupabase.auth.getSession();

                        const accessToken = sessionData?.session?.access_token;

                        if (!accessToken) {
                            alert("Unable to verify Admin session.");

                            return;
                        }

                        revokeButton.disabled = true;

                        revokeButton.textContent = "Revoking...";

                        try {
                            const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-active-sessions/revoke", {
                                method: "POST",

                                headers: {
                                    "Content-Type": "application/json",

                                    Authorization: `Bearer ${accessToken}`,
                                },

                                body: JSON.stringify({
                                    sessionId: session.id,
                                }),
                            });

                            const result = await response.json();

                            if (!response.ok || !result.success) {
                                throw new Error(result.error || "Unable to revoke Admin access.");
                            }

                            adminActiveSessions = adminActiveSessions.filter((item) => item.id !== session.id);

                            const updatedTotalPages = Math.max(
                                1,
                                Math.ceil(adminActiveSessions.length / ADMIN_ACTIVE_SESSIONS_PER_PAGE)
                            );

                            if (adminActiveSessionsCurrentPage > updatedTotalPages) {
                                adminActiveSessionsCurrentPage = updatedTotalPages;
                            }

                            loadAdminActiveSessions();
                        } catch (error) {
                            console.error("ADMIN SESSION REVOKE ERROR:", error);

                            alert(error.message || "Unable to revoke Admin access.");

                            revokeButton.disabled = false;

                            revokeButton.textContent = "Revoke Access";
                        }
                    });

                    actionCell.appendChild(revokeButton);

                    row.appendChild(administratorCell);

                    row.appendChild(ipCell);

                    row.appendChild(deviceCell);

                    row.appendChild(signedInCell);

                    row.appendChild(lastActivityCell);

                    row.appendChild(actionCell);

                    mtcAdminActiveSessionsTableBody.appendChild(row);
                });

                if (mtcAdminActiveSessionsPageInfo) {
                    mtcAdminActiveSessionsPageInfo.textContent = `Page ${adminActiveSessionsCurrentPage} of ${totalPages}`;
                }

                if (mtcAdminActiveSessionsPrevious) {
                    mtcAdminActiveSessionsPrevious.disabled = adminActiveSessionsCurrentPage <= 1;
                }

                if (mtcAdminActiveSessionsNext) {
                    mtcAdminActiveSessionsNext.disabled = adminActiveSessionsCurrentPage >= totalPages;
                }
            } catch (error) {
                console.error("ACTIVE ADMIN SESSIONS LOAD ERROR:", error);

                mtcAdminActiveSessionsTableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    Unable to connect to the Admin login server.
                </td>
            </tr>
        `;
            }
        }

        loadAdminLoginLockouts();
        loadAdminLoginAttemptHistory();
        loadAdminActiveSessions();

        if (mtcAdminLoginAttemptHistorySearch) {
            mtcAdminLoginAttemptHistorySearch.addEventListener("input", () => {
                const searchValue = mtcAdminLoginAttemptHistorySearch.value.trim().toLowerCase();

                const rows = mtcAdminLoginAttemptHistoryTableBody?.querySelectorAll("tr");

                if (!rows) {
                    return;
                }

                rows.forEach((row) => {
                    const rowText = row.textContent.toLowerCase();

                    row.style.display = rowText.includes(searchValue) ? "" : "none";
                });
            });
        }

        if (mtcAdminLoginAttemptHistoryResultFilter) {
            mtcAdminLoginAttemptHistoryResultFilter.addEventListener("change", () => {
                const selectedResult = mtcAdminLoginAttemptHistoryResultFilter.value;

                const rows = mtcAdminLoginAttemptHistoryTableBody?.querySelectorAll("tr");

                if (!rows) {
                    return;
                }

                rows.forEach((row) => {
                    const resultCell = row.children[3];

                    if (!resultCell) {
                        return;
                    }

                    const resultText = resultCell.textContent.trim().toLowerCase();

                    if (selectedResult === "all") {
                        row.style.display = "";
                    } else {
                        row.style.display = resultText === selectedResult ? "" : "none";
                    }
                });
            });
        }

        if (unlockLoginButton && !canUnlockAdminLogins) {
            unlockLoginButton.style.display = "none";
        }
        unlockLoginButton?.addEventListener("click", async () => {
            if (!canUnlockAdminLogins) {
                alert("You do not have permission to unlock Admin logins.");
                return;
            }
            const email = unlockEmailInput?.value.trim().toLowerCase();

            const ipAddress = unlockIpAddressInput?.value.trim();

            if (!email || !ipAddress) {
                mtcAdminLoginUnlockErrorMessage.textContent = "Email address and IP address are required.";

                document.getElementById("mtcAdminLoginUnlockErrorModal").style.display = "flex";

                return;
            }

            const {
                data: { session },
                error: sessionError,
            } = await adminSupabase.auth.getSession();

            if (sessionError || !session) {
                mtcAdminLoginUnlockErrorMessage.textContent =
                    "Your Admin session could not be verified. Please log in again.";

                document.getElementById("mtcAdminLoginUnlockErrorModal").style.display = "flex";

                return;
            }

            unlockLoginButton.disabled = true;

            unlockLoginButton.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Unlocking...
        `;

            try {
                const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-login/unlock", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",

                        Authorization: `Bearer ${session.access_token}`,
                    },

                    body: JSON.stringify({
                        email: email,
                        ipAddress: ipAddress,
                    }),
                });

                const result = await response.json();

                if (!response.ok || result.success !== true) {
                    mtcAdminLoginUnlockErrorMessage.textContent = result.error || "Unable to unlock Admin login.";

                    document.getElementById("mtcAdminLoginUnlockErrorModal").style.display = "flex";

                    return;
                }

                const unlockSuccessModal = document.getElementById("mtcAdminLoginUnlockSuccessModal");

                if (unlockSuccessModal) {
                    unlockSuccessModal.style.display = "flex";
                }

                unlockEmailInput.value = "";

                unlockIpAddressInput.value = "";
            } catch (error) {
                console.error("Admin login unlock error:", error);

                mtcAdminLoginUnlockErrorMessage.textContent = "Unable to connect to the Admin login server.";

                document.getElementById("mtcAdminLoginUnlockErrorModal").style.display = "flex";
            } finally {
                unlockLoginButton.disabled = false;

                unlockLoginButton.innerHTML = `
                <i class="fa-solid fa-unlock"></i>
                Unlock Login
            `;
            }
        });
        /* =========================================
   ADMIN ACCOUNT - LOAD CURRENT USER
========================================= */

        const {
            data: { user: currentAdminUser },
            error: currentAdminUserError,
        } = await adminSupabase.auth.getUser();

        // =========================================
        // LOAD ADMIN NOTIFICATION SETTINGS
        // =========================================

        async function loadAdminNotificationSettings() {
            if (!currentAdminUser) {
                return;
            }

            const notificationEmailInput = document.getElementById("mtcAdminNotificationEmail");
            const newOrdersInput = document.getElementById("mtcAdminNotificationNewOrders");
            const newCustomersInput = document.getElementById("mtcAdminNotificationNewCustomers");
            const newMessagesInput = document.getElementById("mtcAdminNotificationNewMessages");
            const newReviewsInput = document.getElementById("mtcAdminNotificationNewReviews");
            const lowStockInput = document.getElementById("mtcAdminNotificationLowStock");
            const securityInput = document.getElementById("mtcAdminNotificationSecurity");

            const { data: notificationSettings, error: notificationSettingsError } = await adminSupabase
                .from("Admin_Notification_Settings")
                .select(
                    `
                new_orders,
                new_customers,
                new_messages,
                new_reviews,
                low_stock,
                security_alerts
            `
                )
                .eq("admin_id", currentAdminUser.id)
                .maybeSingle();

            if (notificationSettingsError) {
                console.error("ADMIN NOTIFICATION SETTINGS LOAD ERROR:", notificationSettingsError);

                return;
            }

            // =========================================
            // NO SAVED SETTINGS YET
            // =========================================

            if (!notificationSettings) {
                if (newOrdersInput) {
                    newOrdersInput.checked = true;
                }

                if (newCustomersInput) {
                    newCustomersInput.checked = true;
                }

                if (newMessagesInput) {
                    newMessagesInput.checked = true;
                }

                if (newReviewsInput) {
                    newReviewsInput.checked = true;
                }

                if (lowStockInput) {
                    lowStockInput.checked = true;
                }

                if (securityInput) {
                    securityInput.checked = true;
                }

                return;
            }

            // =========================================
            // LOAD SAVED SETTINGS
            // =========================================

            if (newOrdersInput) {
                newOrdersInput.checked = notificationSettings.new_orders;
            }

            if (newCustomersInput) {
                newCustomersInput.checked = notificationSettings.new_customers;
            }

            if (newMessagesInput) {
                newMessagesInput.checked = notificationSettings.new_messages;
            }

            if (newReviewsInput) {
                newReviewsInput.checked = notificationSettings.new_reviews;
            }

            if (lowStockInput) {
                lowStockInput.checked = notificationSettings.low_stock;
            }

            if (securityInput) {
                securityInput.checked = true;
            }
        }

        // =========================================
        // SAVE ADMIN NOTIFICATION SETTINGS
        // =========================================

        const notificationSaveButton = document.getElementById("mtcAdminNotificationSaveButton");

        notificationSaveButton?.addEventListener("click", async () => {
            notificationSaveButton.disabled = true;

            const newOrders = document.getElementById("mtcAdminNotificationNewOrders")?.checked === true;

            const newCustomers = document.getElementById("mtcAdminNotificationNewCustomers")?.checked === true;

            const newMessages = document.getElementById("mtcAdminNotificationNewMessages")?.checked === true;

            const newReviews = document.getElementById("mtcAdminNotificationNewReviews")?.checked === true;

            const lowStock = document.getElementById("mtcAdminNotificationLowStock")?.checked === true;

            const { error: notificationSaveError } = await adminSupabase.from("Admin_Notification_Settings").upsert(
                {
                    admin_id: currentAdminUser.id,
                    new_orders: newOrders,
                    new_customers: newCustomers,
                    new_messages: newMessages,
                    new_reviews: newReviews,
                    low_stock: lowStock,

                    // Security alerts are mandatory.
                    security_alerts: true,

                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: "admin_id",
                }
            );

            if (notificationSaveError) {
                console.error("ADMIN NOTIFICATION SETTINGS SAVE ERROR:", notificationSaveError);

                alert("Unable to save notification settings.");
                notificationSaveButton.disabled = false;
                return;
            }

            notificationSaveButton.innerHTML = '<i class="fa-solid fa-check"></i> Saved';

            setTimeout(() => {
                notificationSaveButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';

                notificationSaveButton.disabled = false;
            }, 1500);
        });

        // =========================================
        // NOTIFICATION ACTIVITY LOG
        // =========================================

        const notificationActivityTableBody = document.getElementById("mtcAdminNotificationActivityTableBody");

        const notificationActivitySearch = document.getElementById("mtcAdminNotificationActivitySearch");

        const notificationActivityPrevious = document.getElementById("mtcAdminNotificationActivityPrevious");

        const notificationActivityNext = document.getElementById("mtcAdminNotificationActivityNext");

        const notificationActivityPageInfo = document.getElementById("mtcAdminNotificationActivityPageInfo");

        let notificationActivityLog = [];
        let filteredNotificationActivityLog = [];
        let notificationActivityCurrentPage = 1;

        const NOTIFICATION_ACTIVITY_PER_PAGE = 10;

        // =========================================
        // RENDER NOTIFICATION ACTIVITY LOG
        // =========================================

        function renderNotificationActivityLog() {
            if (!notificationActivityTableBody) {
                return;
            }

            notificationActivityTableBody.innerHTML = "";

            if (filteredNotificationActivityLog.length === 0) {
                notificationActivityTableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    No notification activity found.
                </td>
            </tr>
        `;

                if (notificationActivityPageInfo) {
                    notificationActivityPageInfo.textContent = "Page 1 of 1";
                }

                if (notificationActivityPrevious) {
                    notificationActivityPrevious.disabled = true;
                }

                if (notificationActivityNext) {
                    notificationActivityNext.disabled = true;
                }

                return;
            }

            const totalPages = Math.ceil(filteredNotificationActivityLog.length / NOTIFICATION_ACTIVITY_PER_PAGE);

            if (notificationActivityCurrentPage > totalPages) {
                notificationActivityCurrentPage = totalPages;
            }

            const startIndex = (notificationActivityCurrentPage - 1) * NOTIFICATION_ACTIVITY_PER_PAGE;

            const endIndex = startIndex + NOTIFICATION_ACTIVITY_PER_PAGE;

            const pageActivity = filteredNotificationActivityLog.slice(startIndex, endIndex);

            pageActivity.forEach((activity) => {
                const row = document.createElement("tr");

                const dateCell = document.createElement("td");
                const adminCell = document.createElement("td");
                const actionCell = document.createElement("td");
                const typeCell = document.createElement("td");
                const notificationCell = document.createElement("td");
                const relatedCell = document.createElement("td");

                dateCell.textContent = activity.created_at ? new Date(activity.created_at).toLocaleString() : "—";

                adminCell.textContent = activity.admin_name || activity.admin_email || "—";

                actionCell.textContent = activity.action || "—";

                typeCell.textContent = activity.notification_type || "—";

                notificationCell.textContent = activity.notification_title || activity.notification_message || "—";

                // =========================================
                // RELATED RECORD LINK
                // =========================================

                let relatedLabel = "";
                let relatedPage = "";
                let relatedId = "";
                let relatedAction = activity.destination_action || "";

                if (activity.related_order_id) {
                    relatedLabel = "View Order";
                    relatedPage = "orders";
                    relatedId = activity.related_order_id;
                } else if (activity.related_message_id) {
                    relatedLabel = "View Message";
                    relatedPage = "messages";
                    relatedId = activity.related_message_id;
                } else if (activity.related_review_id) {
                    relatedLabel = "View Review";
                    relatedPage = "reviews";
                    relatedId = activity.related_review_id;
                } else if (activity.related_product_id) {
                    relatedLabel = "View Product";
                    relatedPage = "products";
                    relatedId = activity.related_product_id;
                } else if (activity.related_discount_id) {
                    relatedLabel = "View Discount";
                    relatedPage = "discounts";
                    relatedId = activity.related_discount_id;
                } else if (activity.related_subscription_id) {
                    relatedLabel = "View Subscription";
                    relatedPage = "subscriptions";
                    relatedId = activity.related_subscription_id;
                }

                if (relatedId) {
                    const relatedButton = document.createElement("button");

                    relatedButton.type = "button";

                    relatedButton.className = "mtc-admin-notification-related-button";

                    relatedButton.textContent = relatedLabel;

                    relatedButton.dataset.relatedPage = relatedPage;

                    relatedButton.dataset.relatedId = relatedId;

                    relatedButton.dataset.relatedAction = relatedAction;

                    relatedCell.appendChild(relatedButton);
                } else {
                    relatedCell.textContent = "—";
                }

                row.appendChild(dateCell);
                row.appendChild(adminCell);
                row.appendChild(actionCell);
                row.appendChild(typeCell);
                row.appendChild(notificationCell);
                row.appendChild(relatedCell);

                notificationActivityTableBody.appendChild(row);
            });

            if (notificationActivityPageInfo) {
                notificationActivityPageInfo.textContent = `Page ${notificationActivityCurrentPage} of ${totalPages}`;
            }

            if (notificationActivityPrevious) {
                notificationActivityPrevious.disabled = notificationActivityCurrentPage <= 1;
            }

            if (notificationActivityNext) {
                notificationActivityNext.disabled = notificationActivityCurrentPage >= totalPages;
            }
        }

        // =========================================
        // LOAD NOTIFICATION ACTIVITY LOG
        // =========================================

        async function loadNotificationActivityLog() {
            if (!notificationActivityTableBody) {
                return;
            }

            const { data, error } = await adminSupabase
                .from("Admin_Notification_Activity_Log")
                .select(
                    `
            id,
            notification_id,
            admin_user_id,
            admin_email,
            admin_name,
            admin_position,
            action,
            notification_type,
            notification_title,
            notification_message,
            related_order_id,
            related_message_id,
            related_review_id,
            related_product_id,
            related_discount_id,
            related_subscription_id,
            destination_page,
            destination_action,
            created_at
        `
                )
                .order("created_at", {
                    ascending: false,
                });

            if (error) {
                console.error("NOTIFICATION ACTIVITY LOG LOAD ERROR:", error);

                notificationActivityTableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    Unable to load notification activity.
                </td>
            </tr>
        `;

                return;
            }

            notificationActivityLog = data || [];

            filteredNotificationActivityLog = [...notificationActivityLog];

            notificationActivityCurrentPage = 1;

            renderNotificationActivityLog();
        }

        // =========================================
        // SEARCH NOTIFICATION ACTIVITY
        // =========================================

        notificationActivitySearch?.addEventListener("input", () => {
            const searchValue = notificationActivitySearch.value.trim().toLowerCase();

            filteredNotificationActivityLog = notificationActivityLog.filter((activity) => {
                const searchableText = `
                        ${activity.admin_name || ""}
                        ${activity.admin_email || ""}
                        ${activity.admin_position || ""}
                        ${activity.action || ""}
                        ${activity.notification_type || ""}
                        ${activity.notification_title || ""}
                        ${activity.notification_message || ""}
                    `.toLowerCase();

                return searchableText.includes(searchValue);
            });

            notificationActivityCurrentPage = 1;

            renderNotificationActivityLog();
        });

        // =========================================
        // PREVIOUS PAGE
        // =========================================

        notificationActivityPrevious?.addEventListener("click", () => {
            if (notificationActivityCurrentPage <= 1) {
                return;
            }

            notificationActivityCurrentPage--;

            renderNotificationActivityLog();
        });

        // =========================================
        // NEXT PAGE
        // =========================================

        notificationActivityNext?.addEventListener("click", () => {
            const totalPages = Math.ceil(filteredNotificationActivityLog.length / NOTIFICATION_ACTIVITY_PER_PAGE);

            if (notificationActivityCurrentPage >= totalPages) {
                return;
            }

            notificationActivityCurrentPage++;

            renderNotificationActivityLog();
        });

        // =========================================
        // OPEN RELATED NOTIFICATION RECORD
        // =========================================

        notificationActivityTableBody?.addEventListener("click", (event) => {
            const relatedButton = event.target.closest(".mtc-admin-notification-related-button");

            if (!relatedButton) {
                return;
            }

            const relatedPage = relatedButton.dataset.relatedPage;

            const relatedId = relatedButton.dataset.relatedId;

            const relatedAction = relatedButton.dataset.relatedAction || "";

            if (!relatedPage || !relatedId) {
                return;
            }

            // =========================================
            // ORDER
            // =========================================

            if (relatedPage === "orders") {
                window.location.href = `mtc-admin-orders.html?orderId=${encodeURIComponent(
                    relatedId
                )}&action=${encodeURIComponent(relatedAction || "open_order_details")}`;

                return;
            }

            // =========================================
            // MESSAGE
            // =========================================

            if (relatedPage === "messages") {
                window.location.href = `mtc-admin-messages.html?messageId=${encodeURIComponent(relatedId)}`;

                return;
            }

            // =========================================
            // REVIEW
            // =========================================

            if (relatedPage === "reviews") {
                window.location.href = `mtc-admin-reviews.html?reviewId=${encodeURIComponent(relatedId)}`;

                return;
            }

            // =========================================
            // PRODUCT
            // =========================================

            if (relatedPage === "products") {
                window.location.href = `mtc-admin-products.html?productId=${encodeURIComponent(relatedId)}`;

                return;
            }

            // =========================================
            // DISCOUNT
            // =========================================

            if (relatedPage === "discounts") {
                window.location.href = `mtc-admin-discounts.html?discountId=${encodeURIComponent(relatedId)}`;

                return;
            }

            // =========================================
            // SUBSCRIPTION
            // =========================================

            if (relatedPage === "subscriptions") {
                window.location.href = `mtc-admin-subscriptions.html?subscriptionId=${encodeURIComponent(relatedId)}`;

                return;
            }
        });

        // =========================================
        // START NOTIFICATION SETTINGS
        // =========================================

        await loadAdminNotificationSettings();

        // =========================================
        // START NOTIFICATION ACTIVITY LOG
        // =========================================

        await loadNotificationActivityLog();

        // =========================================
        // ACCOUNT MANAGEMENT - OWNER OPTIONS
        // =========================================

        const { data: currentAdminAccount, error: currentAdminAccountError } = await adminSupabase
            .from("Admins")
            .select(
                `
            user_id,
            status,
            authority_level,
            Admin_Roles (
    position_id,
    Admin_Positions (
        name,
        authority_level
    )
)
        `
            )
            .eq("user_id", currentAdminUser.id)
            .single();

        let currentPositionNames = [];

        let canCreatePosition = false;
        let canDeletePosition = false;

        if (currentAdminAccountError) {
            console.error("Current admin account error:", currentAdminAccountError);
        } else {
            currentPositionNames = (currentAdminAccount?.Admin_Roles || [])
                .map((role) => role.Admin_Positions?.name)
                .filter(Boolean);

            const currentPositionAuthorityLevel = Math.max(
                ...(currentAdminAccount?.Admin_Roles || []).map(
                    (role) => Number(role.Admin_Positions?.authority_level) || 0
                ),
                0
            );

            currentAdminAuthorityLevel = Number(currentAdminAccount?.authority_level) || currentPositionAuthorityLevel;

            console.log("CURRENT ADMIN AUTHORITY LEVEL:", currentAdminAuthorityLevel);
            const accountRole = document.getElementById("mtcAdminSettingsAccountRole");

            if (accountRole) {
                accountRole.textContent = currentPositionNames.length > 0 ? currentPositionNames.join(" • ") : "—";
            }

            const isOwner = currentPositionNames.includes("Owner") && currentAdminAccount?.status === "Active";

            const canManagePositions =
                currentAdminAccount?.status === "Active" &&
                (currentPositionNames.includes("Owner") || currentPositionNames.includes("Web Developer"));

            const createPositionButton = document.getElementById("mtcAdminCreatePositionButton");

            const deletePositionButton = document.getElementById("mtcAdminDeletePositionButton");

            // =========================================
            // CREATE / DELETE POSITION PERMISSIONS
            // =========================================

            const {
                data: { session: positionPermissionSession },
            } = await adminSupabase.auth.getSession();

            if (positionPermissionSession?.access_token) {
                const positionPermissionHeaders = {
                    Authorization: `Bearer ${positionPermissionSession.access_token}`,
                };

                const [createPositionPermissionResponse, deletePositionPermissionResponse] = await Promise.all([
                    fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=accounts.create_position", {
                        headers: positionPermissionHeaders,
                    }),
                    fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=accounts.delete_position", {
                        headers: positionPermissionHeaders,
                    }),
                ]);

                const [createPositionPermissionResult, deletePositionPermissionResult] = await Promise.all([
                    createPositionPermissionResponse.json(),
                    deletePositionPermissionResponse.json(),
                ]);

                canCreatePosition =
                    currentAdminAuthorityLevel >= 60 && createPositionPermissionResult?.allowed === true;

                canDeletePosition =
                    currentAdminAuthorityLevel >= 60 && deletePositionPermissionResult?.allowed === true;
            }

            // =========================================
            // SHOW / HIDE CREATE POSITION
            // =========================================

            if (createPositionButton) {
                createPositionButton.style.display = canCreatePosition ? "" : "none";
            }

            // =========================================
            // SHOW / HIDE DELETE POSITION
            // =========================================

            if (deletePositionButton) {
                deletePositionButton.style.display = canDeletePosition ? "" : "none";
            }

            const addOwnerOption = document.getElementById("mtcAdminAddOwnerOption");

            const editOwnerOption = document.getElementById("mtcAdminEditOwnerOption");
            addOwnerOption?.setAttribute("hidden", "");

            editOwnerOption?.setAttribute("hidden", "");

            const isWebDeveloper =
                currentPositionNames.includes("Web Developer") && currentAdminAccount?.status === "Active";

            if (isOwner || isWebDeveloper) {
                addOwnerOption?.removeAttribute("hidden");

                editOwnerOption?.removeAttribute("hidden");
            }

            // =========================================
            // SECURITY SETTINGS PERMISSIONS
            // OWNER + WEB DEVELOPER ONLY
            // =========================================

            const canManageSecuritySettings = canManageSecurity;

            if (securityFailedAttemptLimitInput) {
                securityFailedAttemptLimitInput.disabled = !canManageSecuritySettings;
            }

            if (securityLockoutDurationInput) {
                securityLockoutDurationInput.disabled = !canManageSecuritySettings;
            }

            if (securitySessionTimeoutInput) {
                securitySessionTimeoutInput.disabled = !canManageSecuritySettings;
            }

            if (securitySettingsSaveButton) {
                securitySettingsSaveButton.disabled = !canManageSecuritySettings;

                if (!canManageSecuritySettings) {
                    securitySettingsSaveButton.title = "You do not have permission to change Security Settings.";
                } else {
                    securitySettingsSaveButton.removeAttribute("title");
                }
            }
        }
        // =========================================
        // UPDATE ADMIN LAST LOGIN
        // =========================================

        const { error: lastLoginUpdateError } = await adminSupabase
            .from("Admins")
            .update({
                last_login: new Date().toISOString(),
            })
            .eq("user_id", currentAdminUser.id);

        if (lastLoginUpdateError) {
            console.error("Last login update error:", lastLoginUpdateError);
        }

        if (currentAdminUserError) {
            console.error("Error loading admin user:", currentAdminUserError);
        }

        if (currentAdminUser) {
            const adminEmailInput = document.getElementById("mtcAdminSettingsAdminEmail");

            if (adminEmailInput) {
                adminEmailInput.value = currentAdminUser.email || "";
            }

            const accountCreated = document.getElementById("mtcAdminSettingsAccountCreated");

            if (accountCreated && currentAdminUser.created_at) {
                accountCreated.textContent = new Date(currentAdminUser.created_at).toLocaleDateString("en-US", {
                    timeZone: "America/Chicago",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                });
            }

            const accountForm = document.getElementById("mtcAdminSettingsAccountForm");

            if (accountForm) {
                accountForm.addEventListener("submit", async (event) => {
                    event.preventDefault();

                    const firstName = document.getElementById("mtcAdminSettingsFirstName")?.value.trim();

                    const lastName = document.getElementById("mtcAdminSettingsLastName")?.value.trim();
                    const adminEmail = document.getElementById("mtcAdminSettingsAdminEmail")?.value.trim();
                    const emailChanged = adminEmail && adminEmail !== currentAdminUser.email;
                    if (emailChanged) {
                        const { error: updateEmailError } = await adminSupabase.auth.updateUser({
                            email: adminEmail,
                        });

                        if (updateEmailError) {
                            alert("There was a problem updating the administrator email.");

                            console.error("Email update error:", updateEmailError);

                            return;
                        }
                    }

                    if (emailChanged) {
                        alert(
                            "A confirmation email may have been sent. Please verify the new administrator email to complete the change."
                        );
                    }
                    const currentPassword = document.getElementById("mtcAdminSettingsCurrentPassword")?.value;
                    const newPassword = document.getElementById("mtcAdminSettingsNewPassword")?.value;
                    const confirmPassword = document.getElementById("mtcAdminSettingsConfirmPassword")?.value;
                    if (newPassword && newPassword !== confirmPassword) {
                        alert("New Password and Confirm Password do not match.");

                        return;
                    }

                    if (newPassword && !currentPassword) {
                        alert("Please enter your current password.");

                        return;
                    }

                    if (newPassword && currentPassword) {
                        const { error: verifyPasswordError } = await adminSupabase.auth.signInWithPassword({
                            email: currentAdminUser.email,
                            password: currentPassword,
                        });

                        if (verifyPasswordError) {
                            alert("Your current password is incorrect.");

                            return;
                        }
                    }

                    if (newPassword) {
                        const { error: updatePasswordError } = await adminSupabase.auth.updateUser({
                            password: newPassword,
                        });

                        if (updatePasswordError) {
                            alert("There was a problem updating your password.");

                            console.error("Password update error:", updatePasswordError);

                            return;
                        }
                    }

                    if (newPassword) {
                        document.getElementById("mtcAdminSettingsCurrentPassword").value = "";

                        document.getElementById("mtcAdminSettingsNewPassword").value = "";

                        document.getElementById("mtcAdminSettingsConfirmPassword").value = "";
                    }

                    const { error: updateProfileError } = await adminSupabase.auth.updateUser({
                        data: {
                            first_name: firstName,
                            last_name: lastName,
                        },
                    });

                    if (updateProfileError) {
                        console.error("Error updating admin profile:", updateProfileError);

                        return;
                    }

                    const accountSaveButton = document.getElementById("mtcAdminSettingsAccountSaveButton");

                    if (accountSaveButton) {
                        accountSaveButton.innerHTML = emailChanged
                            ? '<i class="fa-solid fa-check"></i> Email Update Sent'
                            : newPassword
                              ? '<i class="fa-solid fa-check"></i> Password Updated'
                              : '<i class="fa-solid fa-check"></i> Updated';

                        setTimeout(() => {
                            accountSaveButton.innerHTML = '<i class="fa-solid fa-check"></i> Update Account';
                        }, 2000);
                    }
                });
            }

            const lastLogin = document.getElementById("mtcAdminSettingsAccountLastLogin");

            if (lastLogin && currentAdminUser.last_sign_in_at) {
                lastLogin.textContent = new Date(currentAdminUser.last_sign_in_at).toLocaleString("en-US", {
                    timeZone: "America/Chicago",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                });
            }

            const firstNameInput = document.getElementById("mtcAdminSettingsFirstName");

            const lastNameInput = document.getElementById("mtcAdminSettingsLastName");

            if (firstNameInput) {
                firstNameInput.value = currentAdminUser.user_metadata?.first_name || "";
            }

            if (lastNameInput) {
                lastNameInput.value = currentAdminUser.user_metadata?.last_name || "";
            }
        }

        const {
            data: { session: deleteAccountPermissionSession },
        } = await adminSupabase.auth.getSession();

        let hasDeleteAdminPermission = false;

        if (deleteAccountPermissionSession?.access_token) {
            const deleteAdminPermissionResponse = await fetch(
                "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=accounts.delete",
                {
                    headers: {
                        Authorization: `Bearer ${deleteAccountPermissionSession.access_token}`,
                    },
                }
            );

            const deleteAdminPermissionResult = await deleteAdminPermissionResponse.json();

            hasDeleteAdminPermission = deleteAdminPermissionResult?.allowed === true;
        }

        const {
            data: { session: editAccountPermissionSession },
        } = await adminSupabase.auth.getSession();

        let hasEditAdminPermission = false;

        if (editAccountPermissionSession?.access_token) {
            const editAdminPermissionResponse = await fetch(
                "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=accounts.edit",
                {
                    headers: {
                        Authorization: `Bearer ${editAccountPermissionSession.access_token}`,
                    },
                }
            );

            const editAdminPermissionResult = await editAdminPermissionResponse.json();

            hasEditAdminPermission = editAdminPermissionResult?.allowed === true;
            console.log("TEST ADMIN accounts.edit:", editAdminPermissionResult);

            console.log("hasEditAdminPermission:", hasEditAdminPermission);
        }

        const {
            data: { session: manageEmployeePermissionsSession },
        } = await adminSupabase.auth.getSession();

        let hasManageEmployeePermissions = false;

        if (manageEmployeePermissionsSession?.access_token) {
            const manageEmployeePermissionsResponse = await fetch(
                "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=accounts.manage_permissions",
                {
                    headers: {
                        Authorization: `Bearer ${manageEmployeePermissionsSession.access_token}`,
                    },
                }
            );

            const manageEmployeePermissionsResult = await manageEmployeePermissionsResponse.json();

            hasManageEmployeePermissions = manageEmployeePermissionsResult?.allowed === true;
        }

        const canManageEmployeePermissions =
            currentPositionNames.includes("Owner") ||
            currentPositionNames.includes("Web Developer") ||
            hasManageEmployeePermissions === true;

        const canDeleteAdminAccount =
            currentPositionNames.includes("Owner") ||
            currentPositionNames.includes("Web Developer") ||
            hasDeleteAdminPermission === true;

        const canEditAdminAccount =
            currentPositionNames.includes("Owner") ||
            currentPositionNames.includes("Web Developer") ||
            hasEditAdminPermission === true;

        const canViewAdminAccounts =
            currentPositionNames.includes("Owner") ||
            currentPositionNames.includes("Web Developer") ||
            hasEditAdminPermission === true ||
            hasDeleteAdminPermission === true ||
            hasManageEmployeePermissions === true;

        // =========================================
        // ACCOUNT MANAGEMENT - LOAD ADMINS
        // =========================================

        const adminAccountTableBody = document.getElementById("mtcAdminAccountTableBody");

        if (adminAccountTableBody) {
            const { data: adminAccounts, error: adminAccountsError } = await adminSupabase
                .from("Admins")
                .select(
                    `
                user_id,
                email,
                first_name,
                last_name,
                status,
                authority_level,
                created_at,
                last_login,
                Admin_Roles (
                    position_id,
                    Admin_Positions (
                        id,
                        name,
                        authority_level
                    )
                )
            `
                )
                .order("created_at", {
                    ascending: true,
                });

            if (adminAccountsError) {
                console.error("Admin accounts error:", adminAccountsError);

                adminAccountTableBody.innerHTML = `
            <tr>
                <td colspan="5">
                    Unable to load administrators.
                </td>
            </tr>
        `;
            } else {
                const allAdmins = adminAccounts || [];

                const currentAdminIsTopLevel =
                    currentPositionNames.includes("Owner") || currentPositionNames.includes("Web Developer");

                const admins = allAdmins.filter((admin) => {
                    const isOwnAccount = String(admin.user_id) === String(currentAdminAccount.user_id);

                    // Everyone can always see their own account.
                    if (isOwnAccount) {
                        return true;
                    }

                    // Anyone with Account Management access
                    // can see the other administrator accounts.
                    return canViewAdminAccounts;
                });

                if (admins.length === 0) {
                    adminAccountTableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        No administrators found.
                    </td>
                </tr>
            `;
                } else {
                    adminAccountTableBody.innerHTML = admins
                        .map((admin) => {
                            const firstName = admin.first_name || "";

                            const lastName = admin.last_name || "";

                            const fullName = `${firstName} ${lastName}`.trim() || admin.email || "Administrator";

                            const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "A";

                            const positions = (admin.Admin_Roles || [])
                                .map((role) => role.Admin_Positions?.name)
                                .filter(Boolean);

                            const positionAuthorityLevel = Math.max(
                                ...(admin.Admin_Roles || []).map(
                                    (role) => Number(role.Admin_Positions?.authority_level) || 0
                                ),
                                0
                            );

                            const adminAuthorityLevel = Number(admin.authority_level) || positionAuthorityLevel;

                            const isOwnAccount = String(admin.user_id) === String(currentAdminAccount.user_id);

                            const isTopLevelCurrentAdmin =
                                currentPositionNames.includes("Owner") ||
                                currentPositionNames.includes("Web Developer");

                            const targetIsTopLevel = positions.includes("Owner") || positions.includes("Web Developer");

                            const targetIsLowerAuthority = adminAuthorityLevel < currentAdminAuthorityLevel;

                            const currentIsWebDeveloper = currentPositionNames.includes("Web Developer");

                            const targetIsOwner = positions.includes("Owner");

                            const webDeveloperManagingOwner = currentIsWebDeveloper && targetIsOwner && !isOwnAccount;

                            const canManageThisAccount =
                                !isOwnAccount &&
                                (webDeveloperManagingOwner || (!targetIsTopLevel && targetIsLowerAuthority));

                            const positionsText = positions.length > 0 ? positions.join(" • ") : "No Position";

                            const status = admin.status || "Active";

                            const lastLogin = admin.last_login
                                ? new Date(admin.last_login).toLocaleString("en-US", {
                                      timeZone: "America/Chicago",
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                      hour: "numeric",
                                      minute: "2-digit",
                                  })
                                : "Never";

                            return `
                            <tr>

                                <td>
                                    <div class="mtc-admin-account-user">

                                       <div class="mtc-admin-account-avatar">
                                            ${escapeAdminHTML(initials)}
                                        </div>

                                        <div class="mtc-admin-account-user-info">

                                            <strong>
                                                ${escapeAdminHTML(fullName)}
                                            </strong>

                                            <span>
                                                ${escapeAdminHTML(admin.email || "")}
                                            </span>

                                        </div>

                                        </div>
                                        </td>

                                        <td>
                                            <span class="mtc-admin-account-role">
                                                ${escapeAdminHTML(positionsText)}
                                            </span>

                                            <div class="mtc-admin-account-authority">
                                                Authority Level:
                                                ${escapeAdminHTML(adminAuthorityLevel)}
                                            </div>
                                        </td>

                                        <td>
                                            <span
                                                class="mtc-admin-account-status ${String(status)
                                                    .toLowerCase()
                                                    .replace(/[^a-z0-9_-]/g, "")}">
                                                ${escapeAdminHTML(status)}
                                            </span>
                                        </td>
                                <td>

<div class="mtc-admin-account-actions">

${
    isOwnAccount || canViewAdminAccounts
        ? `
            <button
                type="button"
                class="mtc-admin-account-action-button mtc-admin-edit-account"
                data-user-id="${escapeAdminHTML(admin.user_id)}">

                <i class="fa-solid fa-pen"></i>

                Edit
            </button>
        `
        : ""
}

${
    !isOwnAccount &&
    canDeleteAdminAccount &&
    !targetIsOwner &&
    !positions.includes("Web Developer") &&
    (isTopLevelCurrentAdmin || canManageThisAccount)
        ? `
            <button
                type="button"
                class="mtc-admin-account-action-button danger mtc-admin-delete-account"
                data-user-id="${escapeAdminHTML(admin.user_id)}">

                <i class="fa-solid fa-trash"></i>

                Delete
            </button>
        `
        : ""
}

</div>

</td>

                    </tr>
                `;
                        })
                        .join("");
                }
            }
        }

        // =========================================
        // ACCOUNT MANAGEMENT - EDIT MODAL
        // =========================================

        const editAccountModal = document.getElementById("mtcAdminEditAccountModal");

        const editAccountClose = document.getElementById("mtcAdminEditAccountClose");

        const editAccountCancel = document.getElementById("mtcAdminEditAccountCancel");

        const editUserId = document.getElementById("mtcAdminEditUserId");

        const editFirstName = document.getElementById("mtcAdminEditFirstName");

        const editLastName = document.getElementById("mtcAdminEditLastName");

        const editRole = document.getElementById("mtcAdminEditRole");

        const editStatus = document.getElementById("mtcAdminEditStatus");

        const editPermissionOptions = document.getElementById("mtcAdminEditPermissionOptions");

        function closeEditAccountModal() {
            editAccountModal?.classList.remove("active");
        }

        async function loadEditAccountPermissions(userId, selectedPositionIds = null) {
            if (!editPermissionOptions) {
                return;
            }

            if (!canManageEmployeePermissions) {
                editPermissionOptions.innerHTML = `
            <p>
                You do not have permission to manage employee permissions.
            </p>
        `;

                return;
            }

            if (!userId) {
                editPermissionOptions.innerHTML = `
            <p>
                Unable to load employee permissions.
            </p>
        `;

                return;
            }

            editPermissionOptions.innerHTML = `
        <p>Loading permissions...</p>
    `;

            // =============================================
            // LOAD ALL PERMISSIONS
            // =============================================

            const { data: permissions, error: permissionsError } = await adminSupabase
                .from("Admin_Permissions")
                .select(
                    `
            id,
            permission_key,
            category,
            name
        `
                )
                .order("category", {
                    ascending: true,
                })
                .order("name", {
                    ascending: true,
                });

            if (permissionsError) {
                console.error("LOAD EDIT ACCOUNT PERMISSIONS ERROR:", permissionsError);

                editPermissionOptions.innerHTML = `
            <p>Unable to load permissions.</p>
        `;

                return;
            }

            // =============================================
            // DETERMINE WHICH POSITIONS TO PREVIEW
            // =============================================
            //
            // If selectedPositionIds was passed in,
            // use the positions currently checked in the modal.
            //
            // Otherwise load the employee's saved positions.
            // =============================================

            let targetPositionIds = [];

            // TRUE means the administrator just selected
            // a different position in the Edit Account modal.
            // In that case we want a clean preview of the
            // NEW position's permissions without applying
            // the employee's old individual overrides.
            const isPositionPreview = Array.isArray(selectedPositionIds);

            if (isPositionPreview) {
                targetPositionIds = selectedPositionIds.filter(Boolean);
            } else {
                const { data: targetRoles, error: targetRolesError } = await adminSupabase
                    .from("Admin_Roles")
                    .select("position_id")
                    .eq("user_id", userId);

                if (targetRolesError) {
                    console.error("LOAD TARGET ROLES ERROR:", targetRolesError);

                    editPermissionOptions.innerHTML = `
                <p>Unable to load employee permissions.</p>
            `;

                    return;
                }

                targetPositionIds = (targetRoles || []).map((role) => role.position_id).filter(Boolean);
            }

            // Remove duplicate position IDs.
            targetPositionIds = [...new Set(targetPositionIds)];

            // =============================================
            // CHECK FOR PROTECTED TOP-LEVEL POSITION
            // OWNER + WEB DEVELOPER ALWAYS HAVE EVERYTHING
            // =============================================

            let targetIsTopLevelPosition = false;

            if (targetPositionIds.length > 0) {
                const { data: targetPositions, error: targetPositionsError } = await adminSupabase
                    .from("Admin_Positions")
                    .select(
                        `
            id,
            name
        `
                    )
                    .in("id", targetPositionIds);

                if (targetPositionsError) {
                    console.error("LOAD TARGET POSITION NAMES ERROR:", targetPositionsError);

                    editPermissionOptions.innerHTML = `
            <p>Unable to load employee permissions.</p>
        `;

                    return;
                }

                targetIsTopLevelPosition = (targetPositions || []).some(
                    (position) => position.name === "Owner" || position.name === "Web Developer"
                );
            }

            // =============================================
            // LOAD PERMISSIONS INHERITED FROM POSITIONS
            // =============================================

            let inheritedPermissionIds = [];

            if (targetPositionIds.length > 0) {
                const { data: inheritedPermissions, error: inheritedPermissionsError } = await adminSupabase
                    .from("Admin_Position_Permissions")
                    .select("permission_id")
                    .in("position_id", targetPositionIds);

                if (inheritedPermissionsError) {
                    console.error("LOAD INHERITED PERMISSIONS ERROR:", inheritedPermissionsError);

                    editPermissionOptions.innerHTML = `
                <p>Unable to load employee permissions.</p>
            `;

                    return;
                }

                inheritedPermissionIds = [
                    ...new Set((inheritedPermissions || []).map((row) => row.permission_id).filter(Boolean)),
                ];
            }

            // =============================================
            // LOAD INDIVIDUAL USER OVERRIDES
            // =============================================

            const { data: userOverrides, error: userOverridesError } = await adminSupabase
                .from("Admin_User_Permissions")
                .select(
                    `
            permission_id,
            permission_state
        `
                )
                .eq("user_id", userId);

            if (userOverridesError) {
                console.error("LOAD USER PERMISSION OVERRIDES ERROR:", userOverridesError);

                editPermissionOptions.innerHTML = `
            <p>Unable to load employee permissions.</p>
        `;

                return;
            }

            const overrideMap = new Map();

            // Only apply saved individual permission overrides
            // when loading the employee's CURRENT saved position.
            //
            // If a NEW position is being previewed, start clean
            // with that position's inherited permissions.
            if (!isPositionPreview) {
                (userOverrides || []).forEach((override) => {
                    overrideMap.set(override.permission_id, override.permission_state);
                });
            }

            // =============================================
            // GROUP PERMISSIONS BY CATEGORY
            // =============================================

            const groupedPermissions = {};

            (permissions || []).forEach((permission) => {
                if (!groupedPermissions[permission.category]) {
                    groupedPermissions[permission.category] = [];
                }

                groupedPermissions[permission.category].push(permission);
            });

            // =============================================
            // RENDER EFFECTIVE PERMISSIONS
            // =============================================

            editPermissionOptions.innerHTML = Object.entries(groupedPermissions)
                .map(([category, categoryPermissions]) => {
                    return `
                        <div
                            class="
                                mtc-admin-position-permission-group
                            "
                        >
                            <h4>
                                ${escapeAdminHTML(category)}
                            </h4>

                            <div
                                class="
                                    mtc-admin-position-permission-list
                                "
                            >

                                ${categoryPermissions
                                    .map((permission) => {
                                        const inherited = inheritedPermissionIds.includes(permission.id);

                                        const overrideState = overrideMap.get(permission.id) || null;

                                        let effectiveAllowed = targetIsTopLevelPosition ? true : inherited;

                                        // Individual ALLOW
                                        // overrides position permissions.
                                        if (overrideState === "allow") {
                                            effectiveAllowed = true;
                                        }

                                        // Individual DENY
                                        // overrides position permissions.
                                        if (overrideState === "deny" && !targetIsTopLevelPosition) {
                                            effectiveAllowed = false;
                                        }

                                        return `
                                                <label
                                                    class="
                                                        mtc-admin-position-permission-item
                                                    "
                                                >
                                                    <input
                                                        type="checkbox"
                                                        class="
                                                            mtc-admin-position-permission-checkbox
                                                            mtc-admin-edit-permission-checkbox
                                                        "
                                                        value="${permission.id}"
                                                        data-permission-key="${permission.permission_key}"
                                                        data-inherited="${inherited ? "true" : "false"}"
                                                        ${effectiveAllowed ? "checked" : ""}
                                                    />

                                                    <span>
                                                        ${permission.name}
                                                    </span>
                                                </label>
                                            `;
                                    })
                                    .join("")}

                            </div>
                        </div>
                    `;
                })
                .join("");
        }

        // =========================================
        // ACCOUNT MANAGEMENT - LOAD POSITIONS
        // =========================================

        let adminPositions = [];

        async function loadAdminPositions() {
            const { data, error } = await adminSupabase
                .from("Admin_Positions")
                .select(
                    `
            id,
            name,
            is_system,
            authority_level
        `
                )
                .order("name", {
                    ascending: true,
                });

            if (error) {
                console.error("Load admin positions error:", error);

                return;
            }

            adminPositions = data || [];

            console.log(
                "EDIT POSITION NAMES:",
                adminPositions.map((position) => position.name)
            );
        }

        await loadAdminPositions();
        const addPositionOptions = document.getElementById("mtcAdminAddPositionOptions");

        addPositionOptions.innerHTML = "";
        const currentIsWebDeveloper = currentPositionNames.includes("Web Developer");

        const positionsForAdd = adminPositions.filter((position) => {
            // Web Developer is never assignable through Add Account.
            if (position.name === "Web Developer") {
                return false;
            }

            // Only Web Developer can assign Owner.
            if (position.name === "Owner" && !currentIsWebDeveloper) {
                return false;
            }

            return true;
        });

        positionsForAdd.forEach((position) => {
            const label = document.createElement("label");

            label.className = "mtc-admin-position-option";

            const radio = document.createElement("input");

            radio.type = "radio";

            radio.name = "mtcAdminAddPosition";

            radio.value = String(position.id || "");

            radio.dataset.positionName = String(position.name || "");

            const name = document.createElement("span");

            name.textContent = String(position.name || "");

            label.append(radio, name);

            addPositionOptions.appendChild(label);
        });

        function openPositionConfirmation(checkbox, intendedState) {
            const positionConfirmModal = document.getElementById("mtcPositionConfirmModal");

            const positionConfirmMessage = document.getElementById("mtcPositionConfirmMessage");

            const positionName = checkbox.dataset.positionName || "this position";

            if (positionConfirmMessage) {
                positionConfirmMessage.textContent = intendedState
                    ? `Are you sure you want to assign the ${positionName} position?`
                    : `Are you sure you want to remove the ${positionName} position?`;
            }

            positionConfirmModal?.classList.add("active");

            positionConfirmModal?.setAttribute("aria-hidden", "false");
        }

        const positionConfirmModal = document.getElementById("mtcPositionConfirmModal");

        const positionConfirmCancel = document.getElementById("mtcPositionConfirmCancel");

        const positionConfirmButton = document.getElementById("mtcPositionConfirmButton");

        const positionConfirmOverlay = document.getElementById("mtcPositionConfirmOverlay");

        let pendingPositionCheckbox = null;
        let pendingPositionState = false;
        let previousPositionRadio = null;

        addPositionOptions?.addEventListener("change", (event) => {
            const radio = event.target.closest('input[type="radio"][name="mtcAdminAddPosition"]');

            if (!radio) {
                return;
            }

            previousPositionRadio = addPositionOptions.querySelector(
                'input[type="radio"][name="mtcAdminAddPosition"][data-previously-selected="true"]'
            );

            pendingPositionCheckbox = radio;
            pendingPositionState = true;

            openPositionConfirmation(radio, true);
        });
        positionConfirmCancel?.addEventListener("click", async () => {
            const wasEditingAccount = pendingPositionCheckbox?.name === "mtcAdminEditPosition";

            // Remove the newly selected position.
            if (pendingPositionCheckbox) {
                pendingPositionCheckbox.checked = false;
            }

            // Restore the previous position.
            if (previousPositionRadio) {
                previousPositionRadio.checked = true;
            }

            // If this confirmation came from Edit Account,
            // restore the permission preview for the
            // employee's ORIGINAL saved position.
            if (wasEditingAccount && editUserId?.value) {
                await loadEditAccountPermissions(editUserId.value);
            }

            pendingPositionCheckbox = null;
            pendingPositionState = false;
            previousPositionRadio = null;

            positionConfirmModal?.classList.remove("active");

            positionConfirmModal?.setAttribute("aria-hidden", "true");
        });

        positionConfirmButton?.addEventListener("click", () => {
            if (pendingPositionCheckbox) {
                // Clear the old marker.
                document.querySelectorAll('input[type="radio"][data-previously-selected="true"]').forEach((radio) => {
                    radio.removeAttribute("data-previously-selected");
                });

                // Keep the newly selected position.
                pendingPositionCheckbox.checked = true;

                // Remember it in case the user changes
                // positions again.
                pendingPositionCheckbox.setAttribute("data-previously-selected", "true");
            }

            pendingPositionCheckbox = null;
            pendingPositionState = false;
            previousPositionRadio = null;

            positionConfirmModal?.classList.remove("active");

            positionConfirmModal?.setAttribute("aria-hidden", "true");
        });

        positionConfirmOverlay?.addEventListener("click", async () => {
            const wasEditingAccount = pendingPositionCheckbox?.name === "mtcAdminEditPosition";

            // Remove the newly selected position.
            if (pendingPositionCheckbox) {
                pendingPositionCheckbox.checked = false;
            }

            // Restore the previous position.
            if (previousPositionRadio) {
                previousPositionRadio.checked = true;
            }

            // Restore the employee's ORIGINAL saved
            // position permissions when the position
            // change is cancelled by clicking outside.
            if (wasEditingAccount && editUserId?.value) {
                await loadEditAccountPermissions(editUserId.value);
            }

            pendingPositionCheckbox = null;
            pendingPositionState = false;
            previousPositionRadio = null;

            positionConfirmModal?.classList.remove("active");

            positionConfirmModal?.setAttribute("aria-hidden", "true");
        });

        const editPositionOptions = document.getElementById("mtcAdminEditPositionOptions");
        // =============================================
        // EDIT ACCOUNT
        // LIVE POSITION PERMISSION PREVIEW
        // =============================================

        editPositionOptions?.addEventListener("change", async (event) => {
            const positionCheckbox = event.target.closest('input[type="radio"][name="mtcAdminEditPosition"]');

            if (!positionCheckbox) {
                return;
            }

            const positionName = positionCheckbox.dataset.positionName || "";

            const positionAuthorityLevel = Number(positionCheckbox.dataset.authorityLevel) || 0;

            const editAuthority = document.getElementById("mtcAdminEditAuthority");

            if (editAuthority) {
                if (positionName === "Owner") {
                    editAuthority.value = "100";
                    editAuthority.disabled = true;
                } else {
                    editAuthority.value = positionAuthorityLevel > 0 ? String(positionAuthorityLevel) : "";

                    editAuthority.disabled = false;
                }
            }

            const userId = editUserId?.value;

            if (!userId) {
                return;
            }

            // =========================================
            // GET CURRENTLY SELECTED POSITIONS
            // =========================================

            const selectedPositionIds = Array.from(
                editPositionOptions.querySelectorAll('input[type="radio"][name="mtcAdminEditPosition"]:checked')
            )
                .map((radio) => radio.value)
                .filter(Boolean);

            // =========================================
            // RECALCULATE PERMISSIONS
            // =========================================

            await loadEditAccountPermissions(userId, selectedPositionIds);
        });
        if (editPositionOptions) {
            editPositionOptions.innerHTML = "";

            const positionsForEdit = adminPositions.filter((position) => {
                // Web Developer is a protected system position.
                // It can never be assigned through Edit Account.
                if (position.name === "Web Developer") {
                    return false;
                }

                // Only Web Developer can see/assign/remove Owner.
                if (position.name === "Owner" && !currentIsWebDeveloper) {
                    return false;
                }

                return true;
            });

            positionsForEdit.forEach((position) => {
                const label = document.createElement("label");

                label.className = "mtc-admin-position-option";

                const radio = document.createElement("input");

                radio.type = "radio";

                radio.name = "mtcAdminEditPosition";

                radio.value = String(position.id || "");

                radio.dataset.positionName = String(position.name || "");

                radio.dataset.authorityLevel = String(Number(position.authority_level) || 0);

                const name = document.createElement("span");

                name.textContent = String(position.name || "");

                label.append(radio, name);

                editPositionOptions.appendChild(label);
            });
        }

        editPositionOptions?.addEventListener("change", (event) => {
            const radio = event.target.closest('input[type="radio"][name="mtcAdminEditPosition"]');

            if (!radio) {
                return;
            }

            previousPositionRadio = editPositionOptions.querySelector(
                'input[type="radio"][name="mtcAdminEditPosition"][data-previously-selected="true"]'
            );

            pendingPositionCheckbox = radio;
            pendingPositionState = true;

            openPositionConfirmation(radio, true);
        });

        // =========================================
        // ACCOUNT MANAGEMENT - DELETE ACCOUNT MODAL
        // =========================================

        const deleteAccountModal = document.getElementById("mtcAdminDeleteAccountModal");

        const deleteAccountClose = document.getElementById("mtcAdminDeleteAccountClose");

        const deleteAccountCancel = document.getElementById("mtcAdminDeleteAccountCancel");

        const deleteAccountConfirm = document.getElementById("mtcAdminDeleteAccountConfirm");

        let accountPendingDeleteId = null;

        document.addEventListener("click", (event) => {
            const deleteButton = event.target.closest(".mtc-admin-delete-account");

            if (!deleteButton) {
                return;
            }

            accountPendingDeleteId = deleteButton.dataset.userId;

            deleteAccountModal?.classList.add("active");
        });

        deleteAccountCancel?.addEventListener("click", () => {
            deleteAccountModal?.classList.remove("active");

            accountPendingDeleteId = null;
        });

        deleteAccountConfirm?.addEventListener("click", async () => {
            if (!accountPendingDeleteId) {
                return;
            }

            const { data: sessionData, error: sessionError } = await adminSupabase.auth.getSession();

            const accessToken = sessionData?.session?.access_token;

            if (sessionError || !accessToken) {
                alert("Your session has expired. Please sign in again.");
                return;
            }

            deleteAccountConfirm.disabled = true;

            deleteAccountConfirm.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Deleting...
        `;

            try {
                const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin/delete", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",

                        Authorization: `Bearer ${accessToken}`,
                    },

                    body: JSON.stringify({
                        userId: accountPendingDeleteId,
                    }),
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.error || "Unable to delete employee account.");
                }

                localStorage.setItem("mtcAdminSettingsActiveTab", "users");

                window.location.reload();
            } catch (error) {
                console.error("Delete employee account error:", error);

                alert(error.message || "Unable to delete employee account.");

                deleteAccountConfirm.disabled = false;

                deleteAccountConfirm.innerHTML = `
                <i class="fa-solid fa-trash"></i>
                Delete Account
            `;
            }
        });

        deleteAccountModal?.addEventListener("click", (event) => {
            if (event.target !== deleteAccountModal) {
                return;
            }

            deleteAccountModal.classList.remove("active");

            accountPendingDeleteId = null;
        });

        // =========================================
        // REFUND PERMISSION DEPENDENCY
        // Process Refund overrides Request Refund
        // =========================================

        document.addEventListener("change", (event) => {
            const checkbox = event.target.closest('input[type="checkbox"][data-permission-key]');

            if (!checkbox) {
                return;
            }

            if (!editPermissionOptions?.contains(checkbox)) {
                return;
            }

            const permissionKey = checkbox.dataset.permissionKey;

            const al60PermissionKeys = ["accounts.create_position", "accounts.delete_position", "refunds.process"];

            if (al60PermissionKeys.includes(permissionKey) && checkbox.checked) {
                const targetAdmin = adminAccounts.find((admin) => String(admin.user_id) === String(editUserId?.value));

                const editAuthoritySelect = document.getElementById("mtcAdminEditAuthority");

                const targetAuthorityLevel = Number(editAuthoritySelect?.value) || 0;

                if (targetAuthorityLevel < 60) {
                    checkbox.checked = false;

                    const permissionName = checkbox.closest("label")?.innerText?.trim() || permissionKey;

                    alert(`${permissionName} requires Authority Level 60 or higher.`);
                    return;
                }
                if (permissionKey === "refunds.process" && checkbox.checked) {
                    const container =
                        checkbox.closest(".mtc-admin-position-permission-list") ||
                        checkbox.parentElement?.parentElement;

                    const requestRefundCheckbox = container?.querySelector(
                        'input[data-permission-key="refunds.request"]'
                    );

                    if (requestRefundCheckbox) {
                        requestRefundCheckbox.checked = false;
                    }
                }
            }
        });

        // =========================================
        // ACCOUNT MANAGEMENT - CREATE POSITION MODAL
        // =========================================

        const createPositionModal = document.getElementById("mtcAdminCreatePositionModal");

        function showPositionCreatedSuccess() {
            const overlay = document.createElement("div");

            overlay.id = "mtcAdminPositionSuccessModal";

            overlay.innerHTML = `
        <div class="mtc-admin-position-success-card">

            <div class="mtc-admin-position-success-icon">
                <i class="fa-solid fa-check"></i>
            </div>

            <h3>Position Created</h3>

            <p>
                The new position was created successfully.
            </p>

            <button
                type="button"
                class="mtc-admin-position-success-button">
                Done
            </button>

        </div>
    `;

            document.body.appendChild(overlay);
            overlay.querySelector(".mtc-admin-position-success-button")?.addEventListener("click", () => {
                overlay.remove();

                localStorage.setItem("mtcAdminSettingsActiveTab", "users");

                window.location.reload();
            });
        }

        const createPositionButton = document.getElementById("mtcAdminCreatePositionButton");

        const createPositionClose = document.getElementById("mtcAdminCreatePositionClose");

        const createPositionCancel = document.getElementById("mtcAdminCreatePositionCancel");

        const createPositionName = document.getElementById("mtcAdminCreatePositionName");

        const createPositionSave = document.getElementById("mtcAdminCreatePositionSave");

        const createPositionPermissions = document.getElementById("mtcAdminCreatePositionPermissions");

        async function loadCreatePositionPermissions() {
            if (!createPositionPermissions) {
                return;
            }

            createPositionPermissions.innerHTML = `
        <p>Loading permissions...</p>
    `;

            const { data: permissions, error } = await adminSupabase
                .from("Admin_Permissions")
                .select(
                    `
            id,
            permission_key,
            category,
            name,
            description
        `
                )
                .order("category", {
                    ascending: true,
                })
                .order("name", {
                    ascending: true,
                });

            if (error) {
                console.error("LOAD POSITION PERMISSIONS ERROR:", error);

                createPositionPermissions.innerHTML = `
            <p>
                Unable to load permissions.
            </p>
        `;

                return;
            }

            // Never display the protected Owner-management
            // permission as something that can be delegated.
            const usablePermissions = (permissions || []).filter(
                (permission) => permission.permission_key !== "positions.manage_owner"
            );

            const groupedPermissions = {};

            usablePermissions.forEach((permission) => {
                if (!groupedPermissions[permission.category]) {
                    groupedPermissions[permission.category] = [];
                }

                groupedPermissions[permission.category].push(permission);
            });

            createPositionPermissions.innerHTML = Object.entries(groupedPermissions)
                .map(([category, categoryPermissions]) => {
                    return `
                        <div
                            class="mtc-admin-position-permission-group"
                        >
                            <h4>
                                ${escapeAdminHTML(category)}
                            </h4>

                            <div
                                class="mtc-admin-position-permission-list"
                            >
                                ${categoryPermissions
                                    .map((permission) => {
                                        return `
                                                <label
                                                    class="mtc-admin-position-permission-item"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        class="mtc-admin-position-permission-checkbox"
                                                       value="${escapeAdminHTML(permission.id)}"
                                                       data-permission-key="${escapeAdminHTML(
                                                           permission.permission_key
                                                       )}"
                                                    />

                                                    <span>
                                                       ${escapeAdminHTML(permission.name)}
                                                    </span>
                                                </label>
                                            `;
                                    })
                                    .join("")}
                            </div>
                        </div>
                    `;
                })
                .join("");
        }

        function openCreatePositionModal() {
            if (!createPositionModal) {
                return;
            }

            createPositionModal.classList.add("active");

            loadCreatePositionPermissions();

            if (createPositionName) {
                createPositionName.value = "";
                createPositionName.focus();
            }
        }

        function closeCreatePositionModal() {
            createPositionModal?.classList.remove("active");
        }

        createPositionButton?.addEventListener("click", () => {
            if (!canCreatePosition) {
                alert("You do not have permission to create positions.");
                return;
            }

            openCreatePositionModal();
        });

        createPositionClose?.addEventListener("click", closeCreatePositionModal);
        createPositionCancel?.addEventListener("click", closeCreatePositionModal);
        createPositionSave?.addEventListener("click", async () => {
            const positionName = createPositionName?.value.trim();

            if (!positionName) {
                alert("Enter a position name.");
                return;
            }

            const selectedPermissionIds = Array.from(
                createPositionPermissions?.querySelectorAll(".mtc-admin-position-permission-checkbox:checked") || []
            ).map((checkbox) => checkbox.value);

            const {
                data: { session },
            } = await adminSupabase.auth.getSession();

            if (!session?.access_token) {
                alert("Your administrator session has expired. Please log in again.");
                return;
            }

            // =============================================
            // CREATE POSITION - AUTHORITY LEVEL
            // =============================================

            const createPositionAuthority = document.getElementById("mtcAdminCreatePositionAuthority");

            const authorityLevel = Number(createPositionAuthority?.value);

            const allowedAuthorityLevels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

            if (!allowedAuthorityLevels.includes(authorityLevel)) {
                alert("Select a valid authority level.");

                return;
            }

            // Position must be STRICTLY below
            // the logged-in administrator.
            if (authorityLevel >= currentAdminAuthorityLevel) {
                alert(`You can only create positions below your authority level (${currentAdminAuthorityLevel}).`);

                return;
            }

            try {
                createPositionSave.disabled = true;

                const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-position/create", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                    },

                    body: JSON.stringify({
                        positionName,
                        authorityLevel,
                        selectedPermissionIds,
                    }),
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    console.error("Create position error:", result);

                    showPositionCreateError(result.error || "The position could not be created.");

                    return;
                }

                showPositionCreatedSuccess();

                closeCreatePositionModal();
            } catch (error) {
                console.error("Create position request error:", error);

                showPositionCreateError("Unable to connect to the server.");
            } finally {
                createPositionSave.disabled = false;
            }

            function showPositionCreateError(message) {
                document.getElementById("mtcAdminPositionErrorModal")?.remove();

                const overlay = document.createElement("div");

                overlay.id = "mtcAdminPositionErrorModal";

                overlay.innerHTML = `
            <div class="mtc-admin-position-error-card">

                <div class="mtc-admin-position-error-icon">
                    <i class="fa-solid fa-xmark"></i>
                </div>

                <h3>
                    Unable to Create Position
                </h3>

                <p>
                    ${escapeAdminHTML(message)}
                </p>

                <button
                    type="button"
                    class="mtc-admin-position-error-button"
                >
                    Try Again
                </button>

            </div>
        `;

                document.body.appendChild(overlay);

                overlay.querySelector(".mtc-admin-position-error-button")?.addEventListener("click", () => {
                    overlay.remove();
                });
            }
        });

        // =========================================
        // ACCOUNT MANAGEMENT - DELETE POSITION
        // =========================================

        const deletePositionButton = document.getElementById("mtcAdminDeletePositionButton");

        deletePositionButton?.addEventListener("click", () => {
            // =========================================
            // DELETE POSITION PERMISSION CHECK
            // =========================================

            if (!canDeletePosition) {
                alert("You do not have permission to delete positions.");
                return;
            }

            console.log("DELETE POSITION CURRENT ACCOUNT:", currentAdminAccount);

            console.log("DELETE POSITION CURRENT ROLES:", currentAdminAccount?.Admin_Roles);

            const currentAdminPositionIds = new Set(
                (currentAdminAccount?.Admin_Roles || []).map((role) => String(role.position_id)).filter(Boolean)
            );

            const deletablePositions = adminPositions.filter(
                (position) =>
                    Number(position.authority_level) < currentAdminAuthorityLevel &&
                    !currentAdminPositionIds.has(String(position.id))
            );

            const existingMenu = document.getElementById("mtcAdminDeletePositionMenu");

            existingMenu?.remove();

            console.log("CONFIRM MODAL FUNCTION RUNNING");

            const menu = document.createElement("div");
            menu.id = "mtcAdminDeletePositionMenu";

            menu.innerHTML = `
            <button
                type="button"
                id="mtcAdminDeletePositionClose"
                aria-label="Close Delete Position">
                <i class="fa-solid fa-xmark"></i>
            </button>

           ${deletablePositions
               .map(
                   (position) => `
            <label>
                <input
                    type="checkbox"
                    value="${escapeAdminHTML(position.id)}">

                ${escapeAdminHTML(position.name)}
            </label>
        `
               )
               .join("")}

            <button
                type="button"
                id="mtcAdminDeletePositionConfirm">
                <i class="fa-solid fa-trash"></i>
                Delete Selected
            </button>
        `;

            deletePositionButton.parentElement.appendChild(menu);
            const deletePositionClose = document.getElementById("mtcAdminDeletePositionClose");

            deletePositionClose?.addEventListener("click", () => {
                menu.remove();
            });
            const deletePositionConfirm = document.getElementById("mtcAdminDeletePositionConfirm");

            const showDeletePositionConfirm = (count, onConfirm, onCancel) => {
                const overlay = document.createElement("div");

                overlay.id = "mtcAdminDeletePositionConfirmModal";

                overlay.innerHTML = `
        <div class="mtc-admin-delete-position-confirm-card">

            <button
                type="button"
                class="mtc-admin-delete-position-confirm-close"
                aria-label="Close">
                <i class="fa-solid fa-xmark"></i>
            </button>

            <div class="mtc-admin-delete-position-confirm-icon">
                <i class="fa-solid fa-trash"></i>
            </div>

            <h3>
                Delete Position${count > 1 ? "s" : ""}
            </h3>

            <p>
                Are you sure you want to delete
                ${count === 1 ? "this position" : `these ${count} positions`}?
                This action cannot be undone.
            </p>

            <div class="mtc-admin-delete-position-confirm-actions">

                <button
                    type="button"
                    class="mtc-admin-delete-position-cancel">
                    Cancel
                </button>

                <button
                    type="button"
                    class="mtc-admin-delete-position-confirm-delete">
                    <i class="fa-solid fa-trash"></i>
                    Delete
                </button>

            </div>

        </div>
    `;

                document.body.appendChild(overlay);

                console.log("MODAL ADDED TO PAGE", overlay);

                const closeModal = () => {
                    overlay.remove();
                    onCancel?.();
                };

                overlay
                    .querySelector(".mtc-admin-delete-position-confirm-close")
                    ?.addEventListener("click", closeModal);

                overlay.querySelector(".mtc-admin-delete-position-cancel")?.addEventListener("click", closeModal);

                overlay.querySelector(".mtc-admin-delete-position-confirm-delete")?.addEventListener("click", () => {
                    console.log("FINAL DELETE BUTTON CLICKED");
                    overlay.remove();
                    onConfirm();
                });
            };

            deletePositionConfirm?.addEventListener("click", async () => {
                const selectedPositionIds = Array.from(menu.querySelectorAll('input[type="checkbox"]:checked')).map(
                    (checkbox) => checkbox.value
                );

                const selectedPositions = adminPositions.filter((position) =>
                    selectedPositionIds.includes(String(position.id))
                );

                const hasEqualOrHigherPosition = selectedPositions.some(
                    (position) => Number(position.authority_level) >= currentAdminAuthorityLevel
                );

                if (hasEqualOrHigherPosition) {
                    alert("You can only delete positions below your authority level.");
                    return;
                }

                if (selectedPositionIds.length === 0) {
                    alert("Select at least one position.");

                    return;
                }

                console.log("OPENING DELETE POSITION CONFIRM", selectedPositionIds);
                showDeletePositionConfirm(
                    selectedPositionIds.length,

                    async () => {
                        deletePositionConfirm.disabled = true;
                        console.log("DELETE CALLBACK STARTED", selectedPositionIds);
                        deletePositionConfirm.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Deleting...
        `;

                        // =========================================
                        // FIND USERS ASSIGNED TO DELETED POSITIONS
                        // =========================================

                        const { data: affectedRoles, error: affectedRolesError } = await adminSupabase
                            .from("Admin_Roles")
                            .select("user_id")
                            .in("position_id", selectedPositionIds);

                        console.log("AFFECTED ROLES RESULT:", affectedRoles, affectedRolesError);

                        if (affectedRolesError) {
                            console.error("Unable to find users assigned to deleted positions:", affectedRolesError);

                            alert("Unable to delete position.");

                            deletePositionConfirm.disabled = false;

                            deletePositionConfirm.innerHTML = `
        <i class="fa-solid fa-trash"></i>
        Delete Selected
    `;

                            return;
                        }

                        const affectedUserIds = [
                            ...new Set((affectedRoles || []).map((role) => role.user_id).filter(Boolean)),
                        ];

                        const {
                            data: { session: deletePositionSession },
                        } = await adminSupabase.auth.getSession();

                        const deletePositionResponse = await fetch("https://mtc-backend-node-production.up.railway.app/admin-position/delete", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${deletePositionSession?.access_token}`,
                            },
                            body: JSON.stringify({
                                selectedPositionIds: selectedPositionIds,
                            }),
                        });

                        const data = await deletePositionResponse.json();

                        const error = deletePositionResponse.ok ? null : data;

                        if (error) {
                            console.error("Delete position error:", error);

                            alert("Unable to delete position.");

                            deletePositionConfirm.disabled = false;

                            deletePositionConfirm.innerHTML = `
                <i class="fa-solid fa-trash"></i>
                Delete Selected
            `;

                            return;
                        }

                        if (!data || data.length === 0) {
                            alert("Position was not deleted.");

                            deletePositionConfirm.disabled = false;

                            deletePositionConfirm.innerHTML = `
                <i class="fa-solid fa-trash"></i>
                Delete Selected
            `;

                            return;
                        }
                        // =========================================
                        // CLEAR PERMISSIONS FOR USERS WITH NO POSITION
                        // =========================================

                        for (const affectedUserId of affectedUserIds) {
                            const { data: remainingRoles, error: remainingRolesError } = await adminSupabase
                                .from("Admin_Roles")
                                .select("position_id")
                                .eq("user_id", affectedUserId);

                            if (remainingRolesError) {
                                console.error(
                                    "Unable to check remaining user positions:",
                                    affectedUserId,
                                    remainingRolesError
                                );

                                continue;
                            }

                            if ((remainingRoles || []).length === 0) {
                                // =========================================
                                // NO POSITION = AUTHORITY LEVEL 0
                                // =========================================

                                const { error: resetAuthorityError } = await adminSupabase
                                    .from("Admins")
                                    .update({
                                        authority_level: 0,
                                    })
                                    .eq("user_id", affectedUserId);

                                if (resetAuthorityError) {
                                    console.error(
                                        "Unable to reset authority level for user:",
                                        affectedUserId,
                                        resetAuthorityError
                                    );
                                }

                                // =========================================
                                // CLEAR INDIVIDUAL PERMISSIONS
                                // =========================================

                                const { error: clearPermissionsError } = await adminSupabase
                                    .from("Admin_User_Permissions")
                                    .delete()
                                    .eq("user_id", affectedUserId);

                                if (clearPermissionsError) {
                                    console.error(
                                        "Unable to clear permissions for user:",
                                        affectedUserId,
                                        clearPermissionsError
                                    );
                                }
                            }
                        }
                        localStorage.setItem("mtcAdminSettingsActiveTab", "users");

                        window.location.reload();
                    },

                    () => {
                        console.log("Delete position cancelled.");
                    }
                );

                return;
            });
        });

        // =========================================
        // ACCOUNT MANAGEMENT - ADD ADMIN MODAL
        // =========================================

        const addAccountModal = document.getElementById("mtcAdminAddAccountModal");

        const addAccountButton = document.getElementById("mtcAdminAddUserButton");
        const {
            data: { session: addAccountPermissionSession },
        } = await adminSupabase.auth.getSession();

        let hasCreateAdminPermission = false;

        if (addAccountPermissionSession?.access_token) {
            const createAdminPermissionResponse = await fetch(
                "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=accounts.create",
                {
                    headers: {
                        Authorization: `Bearer ${addAccountPermissionSession.access_token}`,
                    },
                }
            );

            const createAdminPermissionResult = await createAdminPermissionResponse.json();

            hasCreateAdminPermission = createAdminPermissionResult?.allowed === true;
        }
        const canAddEmployee =
            currentPositionNames.includes("Owner") ||
            currentPositionNames.includes("Web Developer") ||
            hasCreateAdminPermission === true;

        if (addAccountButton) {
            addAccountButton.style.display = canAddEmployee ? "" : "none";
        }

        const addAccountClose = document.getElementById("mtcAdminAddAccountClose");

        const addAccountCancel = document.getElementById("mtcAdminAddAccountCancel");

        function closeAddAccountModal() {
            addAccountModal?.classList.remove("active");
        }

        addAccountButton?.addEventListener("click", () => {
            addAccountModal?.classList.add("active");
        });

        addAccountClose?.addEventListener("click", closeAddAccountModal);

        addAccountCancel?.addEventListener("click", closeAddAccountModal);

        addAccountModal?.addEventListener("click", (event) => {
            if (event.target === addAccountModal) {
                closeAddAccountModal();
            }
        });

        // =========================================
        // ACCOUNT MANAGEMENT - CREATE ADMIN
        // =========================================

        const addAccountSave = document.getElementById("mtcAdminAddAccountSave");

        addAccountSave?.addEventListener("click", async () => {
            const firstName = document.getElementById("mtcAdminAddFirstName")?.value.trim();

            const lastName = document.getElementById("mtcAdminAddLastName")?.value.trim();

            const email = document.getElementById("mtcAdminAddEmail")?.value.trim();

            const selectedPositionIds = Array.from(
                document.querySelectorAll(
                    '#mtcAdminAddPositionOptions input[type="radio"][name="mtcAdminAddPosition"]:checked'
                )
            ).map((radio) => radio.value);

            if (!firstName || !lastName || !email) {
                alert("Please complete all fields.");

                return;
            }

            if (selectedPositionIds.length !== 1) {
                alert("Select one position.");

                return;
            }

            addAccountSave.disabled = true;

            addAccountSave.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Adding...
        `;
            try {
                const {
                    data: { session: createAdminSession },
                } = await adminSupabase.auth.getSession();

                if (!createAdminSession?.access_token) {
                    alert("Your administrator session has expired. Please log in again.");
                    return;
                }

                const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin/create", {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${createAdminSession.access_token}`,
                    },

                    body: JSON.stringify({
                        firstName,
                        lastName,
                        email,
                        selectedPositionIds,
                    }),
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || "Unable to create administrator.");
                }

                localStorage.setItem("mtcAdminSettingsActiveTab", "users");

                window.location.reload();
            } catch (error) {
                console.error("Create admin error:", error);

                alert(error.message);

                addAccountSave.disabled = false;

                addAccountSave.innerHTML = `
                <i class="fa-solid fa-user-plus"></i>
                Add Admin
            `;
            }
        });

        document.addEventListener("click", async (event) => {
            const editButton = event.target.closest(".mtc-admin-edit-account");

            if (!editButton) {
                return;
            }

            const selectedUserId = editButton.dataset.userId;

            const { data: selectedAdmin, error: selectedAdminError } = await adminSupabase
                .from("Admins")
                .select(
                    `
                   user_id,
                    email,
                    first_name,
                    last_name,
                    status,
                    authority_level,
                    Admin_Roles (
                        position_id,
                        Admin_Positions (
                            id,
                            name,
                            authority_level
                        )
                    )
                `
                )
                .eq("user_id", selectedUserId)
                .single();

            if (selectedAdminError || !selectedAdmin) {
                console.error("Selected admin error:", selectedAdminError);

                return;
            }

            editUserId.value = selectedAdmin.user_id;
            editFirstName.value = selectedAdmin.first_name || "";
            editLastName.value = selectedAdmin.last_name || "";
            editStatus.value = selectedAdmin.status || "Active";

            // =============================================
            // LOAD CURRENT AUTHORITY LEVEL
            // =============================================

            const editAuthority = document.getElementById("mtcAdminEditAuthority");

            const selectedPositionAuthorityLevel = Math.max(
                ...(selectedAdmin.Admin_Roles || []).map((role) => Number(role.Admin_Positions?.authority_level) || 0),
                0
            );

            const selectedAuthorityLevel = Number(selectedAdmin.authority_level) || selectedPositionAuthorityLevel;

            if (editAuthority) {
                editAuthority.value = selectedAuthorityLevel > 0 ? String(selectedAuthorityLevel) : "";
            }

            const selectedPositionIds = (selectedAdmin.Admin_Roles || []).map((role) => role.position_id);

            // =============================================
            // POSITION ASSIGNMENT PERMISSION
            // =============================================

            const isTopLevelAdmin =
                currentPositionNames.includes("Owner") || currentPositionNames.includes("Web Developer");

            let hasManagePositionsPermission = false;

            const managePositionsSession = (await adminSupabase.auth.getSession()).data.session;

            if (managePositionsSession?.access_token) {
                const managePositionsResponse = await fetch(
                    "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=accounts.manage_positions",
                    {
                        headers: {
                            Authorization: `Bearer ${managePositionsSession.access_token}`,
                        },
                    }
                );

                const managePositionsResult = await managePositionsResponse.json();

                hasManagePositionsPermission = managePositionsResult?.allowed === true;
            }

            const canManagePositions = isTopLevelAdmin || hasManagePositionsPermission;

            // =============================================
            // EDIT AUTHORITY LEVEL PERMISSION
            // =============================================

            let hasEditAuthorityPermission = false;

            const editAuthoritySession = (await adminSupabase.auth.getSession()).data.session;

            if (editAuthoritySession?.access_token) {
                const editAuthorityResponse = await fetch(
                    "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=accounts.edit_authority",
                    {
                        headers: {
                            Authorization: `Bearer ${editAuthoritySession.access_token}`,
                        },
                    }
                );

                const editAuthorityResult = await editAuthorityResponse.json();

                hasEditAuthorityPermission = editAuthorityResult?.allowed === true;
            }

            const canEditAuthority = isTopLevelAdmin || hasEditAuthorityPermission;

            // =============================================
            // ACCOUNT AUTHORITY EDIT ACCESS
            // =============================================

            const isOwnSelectedAccount = String(selectedAdmin.user_id) === String(currentAdminAccount.user_id);

            const targetIsLowerAuthority = selectedAuthorityLevel < currentAdminAuthorityLevel;

            const selectedPositionNames = (selectedAdmin.Admin_Roles || [])
                .map((role) => role.Admin_Positions?.name)
                .filter(Boolean);

            const selectedIsOwner = selectedPositionNames.includes("Owner");

            const selectedIsWebDeveloper = selectedPositionNames.includes("Web Developer");

            const currentIsWebDeveloperForEdit = currentPositionNames.includes("Web Developer");

            const currentIsOwnerForEdit = currentPositionNames.includes("Owner");

            const webDeveloperManagingOwner = currentIsWebDeveloperForEdit && selectedIsOwner && !isOwnSelectedAccount;

            const ownerTryingToManageOwner =
                currentIsOwnerForEdit && !currentIsWebDeveloperForEdit && selectedIsOwner && !isOwnSelectedAccount;

            const ownTopLevelAccount = isOwnSelectedAccount && isTopLevelAdmin;

            const canModifySelectedAccount =
                !selectedIsWebDeveloper &&
                !ownerTryingToManageOwner &&
                !isOwnSelectedAccount &&
                (currentIsWebDeveloperForEdit || (targetIsLowerAuthority && canEditAdminAccount));

            // First / Last Name
            editFirstName.disabled = !(canModifySelectedAccount || ownTopLevelAccount);

            editLastName.disabled = !(canModifySelectedAccount || ownTopLevelAccount);

            // Never change your own status.
            // Owner also cannot manage another Owner account.
            editStatus.disabled = ownTopLevelAccount || ownerTryingToManageOwner || !canModifySelectedAccount;

            // Authority Level
            if (editAuthority) {
                if (selectedIsOwner) {
                    editAuthority.value = "100";
                }

                editAuthority.disabled =
                    selectedIsOwner ||
                    selectedIsWebDeveloper ||
                    isOwnSelectedAccount ||
                    ownerTryingToManageOwner ||
                    (!currentIsWebDeveloperForEdit && !targetIsLowerAuthority) ||
                    !canEditAuthority;

                Array.from(editAuthority.options).forEach((option) => {
                    if (!option.value) {
                        option.disabled = false;
                        return;
                    }

                    const optionAuthority = Number(option.value);

                    const tooHigh = optionAuthority >= currentAdminAuthorityLevel;

                    option.disabled = tooHigh;
                });
            }

            // Save button
            if (editAccountSave) {
                editAccountSave.style.display = canModifySelectedAccount || ownTopLevelAccount ? "" : "none";
            }
            editPositionOptions
                ?.querySelectorAll('input[type="radio"][name="mtcAdminEditPosition"]')
                .forEach((radio) => {
                    const isSelected = selectedPositionIds.includes(radio.value);

                    radio.checked = isSelected;

                    const radioPositionName = radio.dataset.positionName;

                    const isOwnerPosition = radioPositionName === "Owner";

                    radio.disabled =
                        isOwnSelectedAccount ||
                        ownerTryingToManageOwner ||
                        !canModifySelectedAccount ||
                        !canManagePositions ||
                        (isOwnerPosition && !currentIsWebDeveloperForEdit);

                    if (isSelected) {
                        radio.setAttribute("data-previously-selected", "true");
                    } else {
                        radio.removeAttribute("data-previously-selected");
                    }
                });

            await loadEditAccountPermissions(selectedAdmin.user_id);

            if (isOwnSelectedAccount || ownerTryingToManageOwner) {
                editPermissionOptions?.querySelectorAll(".mtc-admin-edit-permission-checkbox").forEach((checkbox) => {
                    checkbox.disabled = true;
                });
            }

            editAccountModal?.classList.add("active");
        });

        const editAuthoritySelect = document.getElementById("mtcAdminEditAuthority");

        editAuthoritySelect?.addEventListener("change", () => {
            const authorityLevel = Number(editAuthoritySelect.value) || 0;

            if (authorityLevel >= 60) {
                return;
            }

            const al60PermissionKeys = ["accounts.create_position", "accounts.delete_position", "refunds.process"];

            const removedPermissions = [];

            al60PermissionKeys.forEach((permissionKey) => {
                const checkbox = editPermissionOptions?.querySelector(`input[data-permission-key="${permissionKey}"]`);

                if (checkbox?.checked) {
                    checkbox.checked = false;
                    removedPermissions.push(checkbox.closest("label")?.innerText?.trim() || permissionKey);
                }
            });

            if (removedPermissions.length > 0) {
                alert("Authority Level 60 or higher is required for:\n\n" + removedPermissions.join("\n"));
            }
        });
        editAccountClose?.addEventListener("click", closeEditAccountModal);

        editAccountCancel?.addEventListener("click", closeEditAccountModal);

        editAccountModal?.addEventListener("click", (event) => {
            if (event.target === editAccountModal) {
                closeEditAccountModal();
            }
        });

        // =========================================
        // ACCOUNT MANAGEMENT - SAVE EDIT
        // =========================================

        const editAccountSave = document.getElementById("mtcAdminEditAccountSave");

        editAccountSave?.addEventListener("click", async (event) => {
            event.preventDefault();

            console.log("EDIT SAVE CLICKED");

            const userId = editUserId.value;

            const firstName = editFirstName.value.trim();

            const lastName = editLastName.value.trim();

            const selectedPositionIds = Array.from(
                editPositionOptions?.querySelectorAll('input[type="radio"][name="mtcAdminEditPosition"]:checked') || []
            ).map((radio) => radio.value);

            if (selectedPositionIds.length !== 1) {
                alert("Select one position.");

                return;
            }

            const status = editStatus.value;

            // =========================================
            // EDIT ACCOUNT - AUTHORITY LEVEL
            // =========================================

            const editAuthority = document.getElementById("mtcAdminEditAuthority");

            let authorityLevel = Number(editAuthority?.value) || 0;
            const selectedPositionRadio = editPositionOptions?.querySelector(
                'input[type="radio"][name="mtcAdminEditPosition"]:checked'
            );

            const selectedPositionName = selectedPositionRadio?.dataset.positionName || "";

            if (selectedPositionName === "Owner") {
                authorityLevel = 100;
            }
            const allowedAuthorityLevels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

            if (!allowedAuthorityLevels.includes(authorityLevel)) {
                alert("The selected position does not have a valid authority level.");
                return;
            }

            const permissionOverrides = Array.from(
                editPermissionOptions?.querySelectorAll(".mtc-admin-edit-permission-checkbox") || []
            )
                .map((checkbox) => {
                    const permissionId = checkbox.value;

                    const inherited = checkbox.dataset.inherited === "true";

                    const checked = checkbox.checked;

                    let permissionState = null;

                    // Position grants it, but this
                    // employee should NOT have it.
                    if (inherited && !checked) {
                        permissionState = "deny";
                    }

                    // Position does not grant it,
                    // but this employee SHOULD have it.
                    if (!inherited && checked) {
                        permissionState = "allow";
                    }

                    return {
                        permissionId,
                        permissionState,
                    };
                })
                .filter((permission) => permission.permissionState !== null);
            if (selectedPositionIds.length === 0) {
                alert("Select at least one position.");

                return;
            }

            editAccountSave.disabled = true;

            editAccountSave.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Saving...
        `;

            // =========================================
            // LOAD EXISTING POSITIONS
            // =========================================

            const { data: existingRoles, error: existingRolesError } = await adminSupabase
                .from("Admin_Roles")
                .select("position_id")
                .eq("user_id", userId);

            if (existingRolesError) {
                console.error("Load existing positions error:", existingRolesError);

                editAccountSave.disabled = false;

                editAccountSave.innerHTML = `
                <i class="fa-solid fa-floppy-disk"></i>
                Save Changes
            `;

                return;
            }

            const existingPositionIds = (existingRoles || []).map((role) => role.position_id);

            // =========================================
            // FIND CHANGES
            // =========================================

            const positionsToAdd = selectedPositionIds.filter(
                (positionId) => !existingPositionIds.includes(positionId)
            );

            const ownerPosition = adminPositions.find((position) => position.name === "Owner");

            const positionsToRemove = existingPositionIds.filter(
                (positionId) => !selectedPositionIds.includes(positionId)
            );

            const {
                data: { session },
            } = await adminSupabase.auth.getSession();
            if (!session?.access_token) {
                editAccountSave.disabled = false;

                editAccountSave.innerHTML = `
        <i class="fa-solid fa-floppy-disk"></i>
        Save Changes
    `;

                alert("Your admin session has expired. Please log in again.");

                return;
            }

            const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-account/update", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    Authorization: `Bearer ${session.access_token}`,
                },

                body: JSON.stringify({
                    userId,
                    firstName,
                    lastName,
                    status,
                    authorityLevel,
                    selectedPositionIds,
                    permissionOverrides,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                console.error("Admin account update error:", result);

                editAccountSave.disabled = false;

                editAccountSave.innerHTML = `
        <i class="fa-solid fa-floppy-disk"></i>
        Save Changes
    `;

                alert(result.error || "Unable to update administrator account.");

                return;
            }
            localStorage.setItem("mtcAdminSettingsActiveTab", "users");

            window.location.reload();
        });

        // =========================================
        // ACCOUNT MANAGEMENT - DISABLE ADMIN
        // =========================================

        document.addEventListener("click", async (event) => {
            const disableButton = event.target.closest(".mtc-admin-disable-account");

            if (!disableButton) {
                return;
            }

            const userId = disableButton.dataset.userId;

            disableButton.disabled = true;

            disableButton.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Disabling...
        `;

            const { error: disableAdminError } = await adminSupabase
                .from("Admins")
                .update({
                    status: "Disabled",
                })
                .eq("user_id", userId);

            if (disableAdminError) {
                console.error("Disable admin error:", disableAdminError);

                disableButton.disabled = false;

                disableButton.innerHTML = "Disable";

                return;
            }

            localStorage.setItem("mtcAdminSettingsActiveTab", "users");

            window.location.reload();
        });

        // =========================================
        // SETTINGS TAB FROM NOTIFICATION / URL
        // =========================================

        const settingsUrlParams = new URLSearchParams(window.location.search);

        const settingsSectionFromUrl = settingsUrlParams.get("section");

        const savedSettingsTab = settingsSectionFromUrl || localStorage.getItem("mtcAdminSettingsActiveTab");
        const settingsTabs = document.querySelectorAll(".mtc-admin-settings-tab");
        const settingsPanels = document.querySelectorAll(".mtc-admin-settings-panel");

        // =========================================
        // SETTINGS TAB ACCESS
        // OWNER + WEB DEVELOPER SEE EVERY TAB
        // OTHER ADMINS REQUIRE THE TAB VIEW PERMISSION
        // =========================================

        const isSettingsTopLevelAdmin =
            currentAdminAccount?.status === "Active" &&
            (currentPositionNames.includes("Owner") || currentPositionNames.includes("Web Developer"));

        if (isSettingsTopLevelAdmin) {
            canViewStoreSettings = true;
            canViewAdminProfile = true;
            canViewAccountManagement = true;
            canViewNotifications = true;
            canViewShipping = true;
            canViewSecurity = true;
        }

        const settingsTabPermissions = {
            store: canViewStoreSettings,
            account: canViewAdminProfile,
            users: canViewAccountManagement,
            notifications: canViewNotifications,
            shipping: canViewShipping,
            security: canViewSecurity,
        };

        Object.entries(settingsTabPermissions).forEach(([tabName, allowed]) => {
            const tabButton = document.querySelector(`[data-settings-tab="${tabName}"]`);
            const tabPanel = document.querySelector(`[data-settings-panel="${tabName}"]`);

            if (allowed) {
                tabButton?.style.removeProperty("display");
                return;
            }

            tabButton?.style.setProperty("display", "none");
            tabButton?.classList.remove("active");
            tabPanel?.classList.remove("active");

            if (localStorage.getItem("mtcAdminSettingsActiveTab") === tabName) {
                localStorage.removeItem("mtcAdminSettingsActiveTab");
            }
        });

        let tabToActivate = savedSettingsTab;

        if (!tabToActivate || settingsTabPermissions[tabToActivate] !== true) {
            tabToActivate = Object.keys(settingsTabPermissions).find(
                (tabName) => settingsTabPermissions[tabName] === true
            );
        }

        settingsTabs.forEach((tab) => {
            tab.classList.remove("active");
        });

        settingsPanels.forEach((panel) => {
            panel.classList.remove("active");
        });

        if (tabToActivate) {
            const tabButton = document.querySelector(`[data-settings-tab="${tabToActivate}"]`);
            const tabPanel = document.querySelector(`[data-settings-panel="${tabToActivate}"]`);

            tabButton?.classList.add("active");
            tabPanel?.classList.add("active");
        }

        localStorage.removeItem("mtcAdminSettingsActiveTab");

        settingsTabs.forEach((tab) => {
            tab.addEventListener("click", () => {
                const selectedTab = tab.dataset.settingsTab;

                if (settingsTabPermissions[selectedTab] !== true) {
                    return;
                }

                settingsTabs.forEach((item) => {
                    item.classList.remove("active");
                });

                settingsPanels.forEach((panel) => {
                    panel.classList.remove("active");
                });

                tab.classList.add("active");

                const selectedPanel = document.querySelector(`[data-settings-panel="${selectedTab}"]`);

                selectedPanel?.classList.add("active");
            });
        });
    }
});

document.addEventListener("DOMContentLoaded", async () => {
    const isSettingsPage = window.location.pathname.endsWith("mtc-admin-settings.html");

    if (!isSettingsPage) {
        return;
    }

    // =========================================
    // STORE SETTINGS PERMISSIONS
    // =========================================

    let canManageStoreSettings = false;

    const {
        data: { session: storeSettingsPermissionSession },
    } = await adminSupabase.auth.getSession();

    if (storeSettingsPermissionSession?.access_token) {
        const storeSettingsPermissionHeaders = {
            Authorization: `Bearer ${storeSettingsPermissionSession.access_token}`,
        };

        const manageStoreSettingsResponse = await fetch(
            "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=store_settings.manage",
            {
                headers: storeSettingsPermissionHeaders,
            }
        );

        const manageStoreSettingsResult = await manageStoreSettingsResponse.json();

        canManageStoreSettings = manageStoreSettingsResult?.allowed === true;
    }

    console.log("STORE SETTINGS MANAGE PERMISSION:", {
        manage: canManageStoreSettings,
    });

    // =========================================
    // STORE SETTINGS TAB ACCESS
    // =========================================
    const { data: storeSettings, error } = await adminSupabase
        .from("Store_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("Error loading store settings:", error);

        return;
    }

    if (!storeSettings) {
        return;
    }

    document.getElementById("mtcAdminSettingsStoreName").value = storeSettings.store_name || "";

    document.getElementById("mtcAdminSettingsStoreEmail").value = storeSettings.store_email || "";

    document.getElementById("mtcAdminSettingsStorePhone").value = storeSettings.store_phone || "";

    document.getElementById("mtcStoreAddress").value = storeSettings.store_address || "";

    document.getElementById("mtcAdminSettingsStoreDescription").value = storeSettings.store_description || "";

    document.getElementById("mtcStoreHoursDays").value = storeSettings.store_hours_days || "";

    document.getElementById("mtcStoreHoursOpen").value = storeSettings.store_hours_open || "";

    document.getElementById("mtcStoreHoursClose").value = storeSettings.store_hours_close || "";

    document.getElementById("mtcStoreClosedDays").value = storeSettings.store_closed_days || "";

    // =========================================
    // MANAGE STORE SETTINGS ACCESS
    // =========================================

    const storeSettingsSaveButton = document.getElementById("mtcAdminSettingsStoreSaveButton");

    const storeSettingsInputs = [
        document.getElementById("mtcAdminSettingsStoreName"),

        document.getElementById("mtcAdminSettingsStoreEmail"),

        document.getElementById("mtcAdminSettingsStorePhone"),

        document.getElementById("mtcStoreAddress"),

        document.getElementById("mtcAdminSettingsStoreDescription"),

        document.getElementById("mtcStoreHoursDays"),

        document.getElementById("mtcStoreHoursOpen"),

        document.getElementById("mtcStoreHoursClose"),

        document.getElementById("mtcStoreClosedDays"),
    ];

    if (!canManageStoreSettings) {
        storeSettingsInputs.forEach((input) => {
            if (input) {
                input.disabled = true;
            }
        });

        if (storeSettingsSaveButton) {
            storeSettingsSaveButton.style.display = "none";
        }
    }

    const storeSettingsForm = document.getElementById("mtcAdminSettingsStoreForm");

    storeSettingsForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        // =========================================
        // CHECK MANAGE STORE SETTINGS PERMISSION
        // =========================================

        if (!canManageStoreSettings) {
            alert("You do not have permission to manage Store Settings.");
            return;
        }

        const storeName = document.getElementById("mtcAdminSettingsStoreName").value.trim();

        const storeEmail = document.getElementById("mtcAdminSettingsStoreEmail").value.trim();

        const storePhone = document.getElementById("mtcAdminSettingsStorePhone").value.trim();

        const storeAddress = document.getElementById("mtcStoreAddress").value.trim();

        const storeDescription = document.getElementById("mtcAdminSettingsStoreDescription").value.trim();

        const storeHoursDays = document.getElementById("mtcStoreHoursDays").value.trim();

        const storeHoursOpen = document.getElementById("mtcStoreHoursOpen").value;

        const storeHoursClose = document.getElementById("mtcStoreHoursClose").value;

        const storeClosedDays = document.getElementById("mtcStoreClosedDays").value.trim();

        console.log({
            storeName,
            storeEmail,
            storePhone,
            storeAddress,
            storeDescription,
            storeHoursDays,
            storeHoursOpen,
            storeHoursClose,
            storeClosedDays,
        });

        const saveButton = document.getElementById("mtcAdminSettingsStoreSaveButton");

        saveButton.disabled = true;
        saveButton.innerHTML = `
    <i class="fa-solid fa-spinner fa-spin"></i>
    Saving...
`;

        const { error: updateError } = await adminSupabase
            .from("Store_settings")
            .update({
                store_name: storeName,

                store_email: storeEmail,

                store_phone: storePhone,

                store_address: storeAddress,

                store_description: storeDescription,

                store_hours_days: storeHoursDays,

                store_hours_open: storeHoursOpen || null,

                store_hours_close: storeHoursClose || null,

                store_closed_days: storeClosedDays,

                updated_at: new Date().toISOString(),
            })
            .eq("id", storeSettings.id);

        if (updateError) {
            console.error("Error saving store settings:", updateError);

            return;
        }

        saveButton.innerHTML = `
    <i class="fa-solid fa-check"></i>
    Changes Saved
`;

        saveButton.classList.add("saved");

        setTimeout(() => {
            saveButton.innerHTML = `
            <i class="fa-solid fa-check"></i>
            Save Changes
        `;

            saveButton.classList.remove("saved");
            saveButton.disabled = false;
        }, 2000);
    });
});

/* =========================================
        END OF MTC-ADMIN-SETTINGS JS
========================================= */

/* =========================================
        START OF MTC-ADMIN-REVIEWS JS
========================================= */

(async () => {
    "use strict";

    const isReviewsPage = window.location.pathname.endsWith("mtc-admin-reviews.html");

    if (!isReviewsPage) {
        return;
    }

    const REVIEWS_PER_PAGE = 10;

    let adminReviews = [];

    let filteredAdminReviews = [];

    let adminReviewsCurrentPage = 1;

    let denyReviewId = null;

    let canApproveReviews = false;
    let canDenyReviews = false;

    // =========================================
    // LOAD REVIEW PERMISSIONS
    // =========================================

    async function loadReviewPermissions() {
        const {
            data: { session },
        } = await adminSupabase.auth.getSession();

        if (!session?.access_token) {
            return;
        }

        const headers = {
            Authorization: `Bearer ${session.access_token}`,
        };

        const [approveResponse, denyResponse] = await Promise.all([
            fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=reviews.approve", { headers }),
            fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=reviews.deny", { headers }),
        ]);

        const [approveResult, denyResult] = await Promise.all([approveResponse.json(), denyResponse.json()]);

        canApproveReviews = approveResult?.allowed === true;

        canDenyReviews = denyResult?.allowed === true;
    }

    await loadReviewPermissions();
    // =========================================
// ELEMENTS
// =========================================

const reviewsTableBody = document.getElementById("mtcAdminReviewsTableBody");

const selectAllCheckbox = document.getElementById("mtcAdminReviewsSelectAll");

const deleteSelectedButton = document.getElementById("mtcAdminReviewsDeleteSelected");

const deleteReviewsModal = document.getElementById("mtcAdminReviewsDeleteModal");

const deleteReviewsModalClose = document.getElementById("mtcAdminReviewsDeleteModalClose");

const deleteReviewsCancel = document.getElementById("mtcAdminReviewsDeleteCancel");

const deleteReviewsConfirm = document.getElementById("mtcAdminReviewsDeleteConfirm");

// =========================================
// DELETE SELECTED REVIEWS MODAL
// =========================================

function closeDeleteReviewsModal() {
    if (!deleteReviewsModal) {
        return;
    }

    deleteReviewsModal.hidden = true;
}

deleteSelectedButton?.addEventListener("click", () => {
    const checkedReviews = reviewsTableBody.querySelectorAll(".mtc-admin-reviews-row-checkbox:checked");

    if (checkedReviews.length === 0) {
        return;
    }

    if (deleteReviewsModal) {
        deleteReviewsModal.hidden = false;
    }
});

deleteReviewsModalClose?.addEventListener("click", closeDeleteReviewsModal);

deleteReviewsCancel?.addEventListener("click", closeDeleteReviewsModal);

deleteReviewsModal
    ?.querySelector(".mtc-admin-reviews-modal-overlay")
    ?.addEventListener("click", closeDeleteReviewsModal);

    deleteReviewsConfirm?.addEventListener("click", async () => {
    const checkedReviews = reviewsTableBody.querySelectorAll(".mtc-admin-reviews-row-checkbox:checked");

    const reviewIds = Array.from(checkedReviews)
        .map((checkbox) => checkbox.dataset.reviewId)
        .filter(Boolean);

    if (reviewIds.length === 0) {
        closeDeleteReviewsModal();
        return;
    }

    deleteReviewsConfirm.disabled = true;

    deleteReviewsConfirm.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Deleting...
    `;

    const { data, error } = await adminSupabase.from("Reviews").delete().in("id", reviewIds).select("id");

    if (error) {
        console.error("REVIEW DELETE ERROR:", error);

        deleteReviewsConfirm.disabled = false;

        deleteReviewsConfirm.innerHTML = `
            <i class="fa-solid fa-trash"></i>
            Delete Reviews
        `;

        return;
    }

    console.log("DELETED REVIEWS:", data);

    window.location.reload();
});


const totalElement = document.getElementById("mtcAdminReviewsTotal");

const pendingElement = document.getElementById("mtcAdminReviewsPending");

const approvedElement = document.getElementById("mtcAdminReviewsApproved");

const averageElement = document.getElementById("mtcAdminReviewsAverage");

const averageCountElement = document.getElementById("mtcAdminReviewsAverageCount");

const searchInput = document.getElementById("mtcAdminReviewsSearch");

const statusFilter = document.getElementById("mtcAdminReviewsStatusFilter");

const ratingFilter = document.getElementById("mtcAdminReviewsRatingFilter");

const productFilter = document.getElementById("mtcAdminReviewsProductFilter");

const productReviewsTab = document.getElementById("mtcAdminReviewsProductTab");

const storeReviewsTab = document.getElementById("mtcAdminReviewsStoreTab");

const reviewNavigation = performance.getEntriesByType("navigation")[0];

const isReviewPageReload = reviewNavigation?.type === "reload";

let activeReviewType = isReviewPageReload ? sessionStorage.getItem("mtcAdminActiveReviewType") || "store" : "store";

const clearFiltersButton = document.getElementById("mtcAdminReviewsClearFilters");

const refreshButton = document.getElementById("mtcAdminReviewsRefreshButton");

const emptyState = document.getElementById("mtcAdminReviewsEmpty");

const paginationInfo = document.getElementById("mtcAdminReviewsPaginationInfo");

const previousPageButton = document.getElementById("mtcAdminReviewsPreviousPage");

const nextPageButton = document.getElementById("mtcAdminReviewsNextPage");

const pageNumberElement = document.getElementById("mtcAdminReviewsPageNumber");

const viewModal = document.getElementById("mtcAdminReviewsViewModal");

const viewModalClose = document.getElementById("mtcAdminReviewsModalClose");

const viewModalContent = document.getElementById("mtcAdminReviewsModalContent");

const denyModal = document.getElementById("mtcAdminReviewsDenyModal");

const denyModalClose = document.getElementById("mtcAdminReviewsDenyModalClose");

const denyCancelButton = document.getElementById("mtcAdminReviewsDenyCancel");

const denyConfirmButton = document.getElementById("mtcAdminReviewsDenyConfirm");

if (!reviewsTableBody) {
    return;
}

// =========================================
// REVIEW CHECKBOX SELECTION
// =========================================

selectAllCheckbox?.addEventListener("change", () => {
    const reviewCheckboxes = reviewsTableBody.querySelectorAll(".mtc-admin-reviews-row-checkbox");

    reviewCheckboxes.forEach((checkbox) => {
        checkbox.checked = selectAllCheckbox.checked;
    });

    deleteSelectedButton.disabled =
        reviewsTableBody.querySelectorAll(".mtc-admin-reviews-row-checkbox:checked").length === 0;
});

reviewsTableBody.addEventListener("change", (event) => {
    if (!event.target.classList.contains("mtc-admin-reviews-row-checkbox")) {
        return;
    }

    const reviewCheckboxes = reviewsTableBody.querySelectorAll(".mtc-admin-reviews-row-checkbox");

    const checkedCheckboxes = reviewsTableBody.querySelectorAll(".mtc-admin-reviews-row-checkbox:checked");

    deleteSelectedButton.disabled = checkedCheckboxes.length === 0;

    selectAllCheckbox.checked = reviewCheckboxes.length > 0 && checkedCheckboxes.length === reviewCheckboxes.length;

    selectAllCheckbox.indeterminate =
        checkedCheckboxes.length > 0 && checkedCheckboxes.length < reviewCheckboxes.length;
});


    // =========================================
    // ESCAPE HTML
    // =========================================

    function escapeAdminReviewHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    // =========================================
    // RELATION OBJECT
    // =========================================

    function getRelationObject(value) {
        if (Array.isArray(value)) {
            return value[0] || null;
        }

        return value || null;
    }

    // =========================================
    // REVIEW STATUS
    // =========================================

    function getReviewStatus(review) {
        if (review?.is_denied === true) {
            return "denied";
        }

        if (review?.is_approved === true) {
            return "approved";
        }

        return "pending";
    }

    function getReviewStatusText(review) {
        const status = getReviewStatus(review);

        if (status === "approved") {
            return "Approved";
        }

        if (status === "denied") {
            return "Denied";
        }

        return "Pending";
    }

    function getReviewStatusClass(review) {
        const status = getReviewStatus(review);

        if (status === "approved") {
            return "mtc-admin-reviews-status-approved";
        }

        if (status === "denied") {
            return "mtc-admin-reviews-status-denied";
        }

        return "mtc-admin-reviews-status-pending";
    }

    // =========================================
    // DATE FORMATTING
    // =========================================

    function formatReviewDate(value) {
        if (!value) {
            return "—";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return date.toLocaleDateString("en-US", {
            timeZone: "America/Chicago",

            month: "short",

            day: "numeric",

            year: "numeric",
        });
    }

    function formatReviewDateTime(value) {
        if (!value) {
            return "—";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
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

    // =========================================
    // SAFE IMAGE URL
    // =========================================

    function getSafeImageUrl(value) {
        if (!value) {
            return "";
        }

        try {
            const url = new URL(value, window.location.origin);

            if (url.protocol !== "http:" && url.protocol !== "https:") {
                return "";
            }

            return url.href;
        } catch (error) {
            return "";
        }
    }

    // =========================================
    // STAR RATING
    // =========================================

    function renderStars(rating) {
        const safeRating = Math.max(0, Math.min(5, Number(rating) || 0));

        return Array.from(
            {
                length: 5,
            },
            (_, index) => {
                return `
                    <i
                        class="${index < safeRating ? "fa-solid" : "fa-regular"} fa-star"
                    ></i>
                `;
            }
        ).join("");
    }

    // =========================================
    // ADD DENIED FILTER OPTION
    // =========================================

    function ensureDeniedFilterOption() {
        if (!statusFilter) {
            return;
        }

        const existingOption = Array.from(statusFilter.options).find((option) => option.value === "denied");

        if (existingOption) {
            return;
        }

        const deniedOption = document.createElement("option");

        deniedOption.value = "denied";

        deniedOption.textContent = "Denied";

        statusFilter.appendChild(deniedOption);
    }

    // =========================================
    // RENDER STATS
    // =========================================

    function renderReviewStats() {
        const total = adminReviews.length;

        const pending = adminReviews.filter((review) => getReviewStatus(review) === "pending").length;

        const approved = adminReviews.filter((review) => getReviewStatus(review) === "approved");

        if (totalElement) {
            totalElement.textContent = total;
        }

        if (pendingElement) {
            pendingElement.textContent = pending;
        }

        if (approvedElement) {
            approvedElement.textContent = approved.length;
        }

        const ratingTotal = approved.reduce((currentTotal, review) => {
            return currentTotal + Number(review.rating || 0);
        }, 0);

        const averageRating = approved.length > 0 ? ratingTotal / approved.length : 0;

        if (averageElement) {
            averageElement.textContent = averageRating.toFixed(1);
        }

        if (averageCountElement) {
            averageCountElement.textContent = `Based on ${approved.length} approved review${
                approved.length === 1 ? "" : "s"
            }`;
        }
    }
    // =========================================
    // POPULATE PRODUCT FILTER
    // =========================================

    function populateProductFilter() {
        if (!productFilter) {
            return;
        }

        const currentValue = productFilter.value || "all";

        const productsMap = new Map();

        adminReviews.forEach((review) => {
            const product = getRelationObject(review.Products);

            if (!product?.id || !product?.product_name) {
                return;
            }

            productsMap.set(product.id, product.product_name);
        });

        const sortedProducts = Array.from(productsMap.entries()).sort((a, b) =>
            String(a[1]).localeCompare(String(b[1]))
        );

        productFilter.innerHTML = "";

        const allOption = document.createElement("option");

        allOption.value = "all";

        allOption.textContent = "All Products";

        productFilter.appendChild(allOption);

        sortedProducts.forEach(([productId, productName]) => {
            const option = document.createElement("option");

            option.value = productId;

            option.textContent = productName;

            productFilter.appendChild(option);
        });

        const valueStillExists = Array.from(productFilter.options).some((option) => option.value === currentValue);

        productFilter.value = valueStillExists ? currentValue : "all";
    }

    // =========================================
    // FILTER REVIEWS
    // =========================================

    function applyReviewFilters(resetPage = true) {
        if (resetPage) {
            adminReviewsCurrentPage = 1;
        }

        const searchValue = (searchInput?.value || "").trim().toLowerCase();

        const statusValue = statusFilter?.value || "all";

        const ratingValue = ratingFilter?.value || "all";

        const productValue = productFilter?.value || "all";

        filteredAdminReviews = adminReviews.filter((review) => {
            const product = getRelationObject(review.Products);

            const customer = getRelationObject(review.Customers);

            const productName = product?.product_name || "";

            const firstName = customer?.first_name || "";

            const lastName = customer?.last_name || "";

            const customerName = `${firstName} ${lastName}`.trim();

            const customerEmail = customer?.email || "";

            const reviewTitle = review.title || "";

            const reviewComment = review.comment || "";

            const searchableText = `
                            ${productName}
                            ${customerName}
                            ${customerEmail}
                            ${reviewTitle}
                            ${reviewComment}
                        `.toLowerCase();
            const reviewType = String(review.review_type || "product")
                .trim()
                .toLowerCase();

            const matchesReviewType = reviewType === activeReviewType;

            const matchesSearch = !searchValue || searchableText.includes(searchValue);

            const reviewStatus = getReviewStatus(review);

            const matchesStatus = statusValue === "all" || reviewStatus === statusValue;

            const matchesRating = ratingValue === "all" || Number(review.rating) === Number(ratingValue);

            const matchesProduct = productValue === "all" || String(review.product_id) === String(productValue);

            return matchesReviewType && matchesSearch && matchesStatus && matchesRating && matchesProduct;
        });

        renderReviewsTable();
    }

    // =========================================
    // RENDER REVIEWS TABLE
    // =========================================

    function renderReviewsTable() {
        if (!reviewsTableBody) {
            return;
        }

        const totalReviews = filteredAdminReviews.length;

        const totalPages = Math.max(1, Math.ceil(totalReviews / REVIEWS_PER_PAGE));

        if (adminReviewsCurrentPage > totalPages) {
            adminReviewsCurrentPage = totalPages;
        }

        if (adminReviewsCurrentPage < 1) {
            adminReviewsCurrentPage = 1;
        }

        const startIndex = (adminReviewsCurrentPage - 1) * REVIEWS_PER_PAGE;

        const endIndex = startIndex + REVIEWS_PER_PAGE;

        const pageReviews = filteredAdminReviews.slice(startIndex, endIndex);

        // =========================================
        // EMPTY STATE
        // =========================================

        if (pageReviews.length === 0) {
            reviewsTableBody.innerHTML = "";

            if (emptyState) {
                emptyState.hidden = false;
            }

            if (paginationInfo) {
                paginationInfo.textContent = "Showing 0 reviews";
            }

            if (pageNumberElement) {
                pageNumberElement.textContent = "Page 1 of 1";
            }

            if (previousPageButton) {
                previousPageButton.disabled = true;
            }

            if (nextPageButton) {
                nextPageButton.disabled = true;
            }

            return;
        }

        if (emptyState) {
            emptyState.hidden = true;
        }

        // =========================================
        // BUILD TABLE ROWS
        // =========================================

        reviewsTableBody.innerHTML = pageReviews
            .map((review) => {
                const product = getRelationObject(review.Products);

                const customer = getRelationObject(review.Customers);

                const productName = product?.product_name || "Unknown Product";

                const firstName = customer?.first_name || "";

                const lastName = customer?.last_name || "";

                const customerName = `${firstName} ${lastName}`.trim() || customer?.email || "Unknown Customer";

                const status = getReviewStatus(review);

                const statusText = getReviewStatusText(review);

                const statusClass = getReviewStatusClass(review);

                const reviewDate = formatReviewDate(review.created_at);

                const safeProductName = escapeAdminReviewHTML(productName);

                const safeCustomerName = escapeAdminReviewHTML(customerName);

                const safeTitle = escapeAdminReviewHTML(review.title || "No title");

                const safeReviewId = escapeAdminReviewHTML(review.id);

                return `
                            <tr>
                                <td class="mtc-admin-reviews-checkbox-column">
                                    <input
                                        type="checkbox"
                                        class="mtc-admin-reviews-row-checkbox"
                                        data-review-id="${safeReviewId}"
                                    />
                                </td>

                                <td>
                                    ${safeProductName}
                                </td>

                                <td>
                                    ${safeCustomerName}
                                </td>

                                <td>
                                    <div
                                        class="mtc-admin-reviews-rating"
                                        aria-label="${Number(review.rating) || 0} out of 5 stars"
                                    >
                                        ${renderStars(review.rating)}
                                    </div>
                                </td>

                                <td>
                                    ${safeTitle}
                                </td>

                                <td>
                                    <span
                                        class="
                                            mtc-admin-reviews-status
                                            ${statusClass}
                                        "
                                    >
                                        ${statusText}
                                    </span>
                                </td>

                                <td>
                                    ${reviewDate}
                                </td>

                                <td>
                                    <div
                                        class="mtc-admin-reviews-actions"
                                    >

                                        ${
                                            canApproveReviews && status !== "approved"
                                                ? `
                                                    <button
                                                        type="button"
                                                        class="mtc-admin-reviews-approve-button"
                                                        data-review-id="${safeReviewId}"
                                                    >
                                                        Approve
                                                    </button>
                                                `
                                                : ""
                                        }

                                        ${
                                            canDenyReviews && status !== "denied"
                                                ? `
                                                    <button
                                                        type="button"
                                                        class="mtc-admin-reviews-deny-button"
                                                        data-review-id="${safeReviewId}"
                                                    >
                                                        Deny
                                                    </button>
                                                `
                                                : ""
                                        }

                                        <button
                                            type="button"
                                            class="mtc-admin-reviews-view-button"
                                            data-review-id="${safeReviewId}"
                                        >
                                            View
                                        </button>

                                    </div>
                                </td>

                            </tr>
                        `;
            })
            .join("");

        // =========================================
        // PAGINATION DISPLAY
        // =========================================

        const shownStart = startIndex + 1;

        const shownEnd = Math.min(endIndex, totalReviews);

        if (paginationInfo) {
            paginationInfo.textContent = `Showing ${shownStart}-${shownEnd} of ${totalReviews} review${
                totalReviews === 1 ? "" : "s"
            }`;
        }

        if (pageNumberElement) {
            pageNumberElement.textContent = `Page ${adminReviewsCurrentPage} of ${totalPages}`;
        }

        if (previousPageButton) {
            previousPageButton.disabled = adminReviewsCurrentPage <= 1;
        }

        if (nextPageButton) {
            nextPageButton.disabled = adminReviewsCurrentPage >= totalPages;
        }
    }
    // =========================================
    // LOADING STATE
    // =========================================

    function showReviewsLoading() {
        if (!reviewsTableBody) {
            return;
        }

        reviewsTableBody.innerHTML = `
            <tr
                class="mtc-admin-reviews-loading-row"
            >
                <td colspan="7">
                    <div
                        class="mtc-admin-reviews-loading"
                    >
                        <i
                            class="fa-solid fa-spinner fa-spin"
                        ></i>

                        <span>
                            Loading reviews...
                        </span>
                    </div>
                </td>
            </tr>
        `;

        if (emptyState) {
            emptyState.hidden = true;
        }
    }

    // =========================================
    // ERROR STATE
    // =========================================

    function showReviewsError(message = "Unable to load reviews.") {
        if (!reviewsTableBody) {
            return;
        }

        reviewsTableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div
                        class="mtc-admin-reviews-loading"
                    >
                        <i
                            class="fa-solid fa-triangle-exclamation"
                        ></i>

                        <span>
                            ${escapeAdminReviewHTML(message)}
                        </span>
                    </div>
                </td>
            </tr>
        `;

        if (emptyState) {
            emptyState.hidden = true;
        }

        if (paginationInfo) {
            paginationInfo.textContent = "Showing 0 reviews";
        }

        if (pageNumberElement) {
            pageNumberElement.textContent = "Page 1 of 1";
        }

        if (previousPageButton) {
            previousPageButton.disabled = true;
        }

        if (nextPageButton) {
            nextPageButton.disabled = true;
        }
    }

    // =========================================
    // LOAD REVIEWS
    // =========================================

    async function loadAdminReviews() {
        showReviewsLoading();

        if (refreshButton) {
            refreshButton.disabled = true;
        }

        try {
            const { data: reviews, error: reviewsError } = await adminSupabase
                .from("Reviews")
                .select(
                    `
                        id,
                        review_type,
                        product_id,
                        customer_id,
                        order_id,
                        rating,
                        title,
                        comment,
                        is_verified_purchase,
                        is_approved,
                        is_denied,
                        created_at,
                        updated_at,
                        Products (
                            id,
                            product_name,
                            image_url
                        ),
                        Customers (
                            id,
                            email,
                            first_name,
                            last_name
                        )
                    `
                )
                .order("created_at", {
                    ascending: false,
                });

            if (reviewsError) {
                throw reviewsError;
            }

            adminReviews = Array.isArray(reviews) ? reviews : [];

            filteredAdminReviews = [...adminReviews];

            renderReviewStats();

            populateProductFilter();

            applyReviewFilters(false);

            console.log("ADMIN REVIEWS LOADED:", adminReviews.length);
        } catch (error) {
            console.error("ADMIN REVIEWS LOAD ERROR:", error);

            adminReviews = [];

            filteredAdminReviews = [];

            renderReviewStats();

            showReviewsError("Unable to load reviews.");
        } finally {
            if (refreshButton) {
                refreshButton.disabled = false;
            }
        }
    }

    // =========================================
    // FIND REVIEW BY ID
    // =========================================

    function findAdminReviewById(reviewId) {
        if (!reviewId) {
            return null;
        }

        return adminReviews.find((review) => String(review.id) === String(reviewId)) || null;
    }

    // =========================================
    // REFRESH ONE REVIEW LOCALLY
    // =========================================

    function updateReviewLocally(reviewId, updates) {
        const reviewIndex = adminReviews.findIndex((review) => String(review.id) === String(reviewId));

        if (reviewIndex === -1) {
            return;
        }

        adminReviews[reviewIndex] = {
            ...adminReviews[reviewIndex],
            ...updates,
        };

        renderReviewStats();

        populateProductFilter();

        applyReviewFilters(false);
    }

    // =========================================
    // SET ACTION BUTTON BUSY STATE
    // =========================================

    function setReviewActionButtonBusy(button, isBusy, busyText, normalText) {
        if (!button) {
            return;
        }

        button.disabled = isBusy;

        if (isBusy) {
            button.dataset.originalText = button.innerHTML;

            button.textContent = busyText;

            return;
        }

        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;

            delete button.dataset.originalText;

            return;
        }

        if (normalText) {
            button.textContent = normalText;
        }
    }

    // =========================================
    // UPDATE REVIEW IN SUPABASE
    // =========================================

    async function updateAdminReviewStatus(reviewId, { isApproved, isDenied }) {
        if (!reviewId) {
            throw new Error("Missing review ID.");
        }

        const { data, error } = await adminSupabase
            .from("Reviews")
            .update({
                is_approved: isApproved,

                is_denied: isDenied,

                updated_at: new Date().toISOString(),
            })
            .eq("id", reviewId)
            .select(
                `
                    id,
                    is_approved,
                    is_denied,
                    updated_at
                `
            )
            .single();

        if (error) {
            throw error;
        }

        return data;
    }
    // =========================================
    // OPEN VIEW REVIEW MODAL
    // =========================================

    function openReviewViewModal(reviewId) {
        if (!viewModal || !viewModalContent) {
            return;
        }

        const review = findAdminReviewById(reviewId);

        if (!review) {
            console.error("ADMIN REVIEW NOT FOUND:", reviewId);

            return;
        }

        const product = getRelationObject(review.Products);

        const customer = getRelationObject(review.Customers);

        const productName = product?.product_name || "Unknown Product";

        const productImage = getSafeImageUrl(product?.image_url);

        const firstName = customer?.first_name || "";

        const lastName = customer?.last_name || "";

        const customerName = `${firstName} ${lastName}`.trim() || "Unknown Customer";

        const customerEmail = customer?.email || "No email available";

        const reviewTitle = review.title || "No title";

        const reviewComment = review.comment || "No review comment provided.";

        const statusText = getReviewStatusText(review);

        const statusClass = getReviewStatusClass(review);

        const verifiedText = review.is_verified_purchase ? "Verified Purchase" : "Not Verified";

        const verifiedClass = review.is_verified_purchase
            ? "mtc-admin-reviews-verified"
            : "mtc-admin-reviews-not-verified";

        const createdDate = formatReviewDateTime(review.created_at);

        const updatedDate = formatReviewDateTime(review.updated_at);

        const safeProductName = escapeAdminReviewHTML(productName);

        const safeCustomerName = escapeAdminReviewHTML(customerName);

        const safeCustomerEmail = escapeAdminReviewHTML(customerEmail);

        const safeTitle = escapeAdminReviewHTML(reviewTitle);

        const safeComment = escapeAdminReviewHTML(reviewComment);

        const safeCreatedDate = escapeAdminReviewHTML(createdDate);

        const safeUpdatedDate = escapeAdminReviewHTML(updatedDate);

        const imageHTML = productImage
            ? `
                    <img
                        src="${escapeAdminReviewHTML(productImage)}"
                        alt="${safeProductName}"
                        class="mtc-admin-reviews-modal-product-image"
                    />
                `
            : `
                    <div
                        class="mtc-admin-reviews-modal-product-image-placeholder"
                    >
                        <i
                            class="fa-regular fa-image"
                        ></i>
                    </div>
                `;

        viewModalContent.innerHTML = `
            <div
                class="mtc-admin-reviews-modal-details"
            >

                <div
                    class="mtc-admin-reviews-modal-product"
                >

                    ${imageHTML}

                    <div
                        class="mtc-admin-reviews-modal-product-info"
                    >
                        <span>
                            Product
                        </span>

                        <h3>
                            ${safeProductName}
                        </h3>
                    </div>

                </div>



                <div
                    class="mtc-admin-reviews-modal-section"
                >

                    <div
                        class="mtc-admin-reviews-modal-section-header"
                    >
                        <h3>
                            Customer
                        </h3>
                    </div>

                    <div
                        class="mtc-admin-reviews-modal-info-grid"
                    >

                        <div
                            class="mtc-admin-reviews-modal-info-item"
                        >
                            <span>
                                Name
                            </span>

                            <strong>
                                ${safeCustomerName}
                            </strong>
                        </div>

                        <div
                            class="mtc-admin-reviews-modal-info-item"
                        >
                            <span>
                                Email
                            </span>

                            <strong>
                                ${safeCustomerEmail}
                            </strong>
                        </div>

                    </div>

                </div>



                <div
                    class="mtc-admin-reviews-modal-section"
                >

                    <div
                        class="mtc-admin-reviews-modal-section-header"
                    >
                        <h3>
                            Review
                        </h3>

                        <span
                            class="
                                mtc-admin-reviews-status
                                ${statusClass}
                            "
                        >
                            ${statusText}
                        </span>
                    </div>



                    <div
                        class="mtc-admin-reviews-modal-rating-row"
                    >

                        <div
                            class="mtc-admin-reviews-rating"
                        >
                            ${renderStars(review.rating)}
                        </div>

                        <span>
                            ${Number(review.rating) || 0} / 5
                        </span>

                    </div>



                    <div
                        class="mtc-admin-reviews-modal-review-title"
                    >
                        ${safeTitle}
                    </div>



                    <div class="mtc-admin-reviews-modal-review-comment">${safeComment}</div>

                </div>



                <div
                    class="mtc-admin-reviews-modal-section"
                >

                    <div
                        class="mtc-admin-reviews-modal-info-grid"
                    >

                        <div
                            class="mtc-admin-reviews-modal-info-item"
                        >
                            <span>
                                Purchase
                            </span>

                            <strong
                                class="${verifiedClass}"
                            >
                                ${verifiedText}
                            </strong>
                        </div>

                        <div
                            class="mtc-admin-reviews-modal-info-item"
                        >
                            <span>
                                Submitted
                            </span>

                            <strong>
                                ${safeCreatedDate}
                            </strong>
                        </div>

                        <div
                            class="mtc-admin-reviews-modal-info-item"
                        >
                            <span>
                                Last Updated
                            </span>

                            <strong>
                                ${safeUpdatedDate}
                            </strong>
                        </div>

                    </div>

                </div>

            </div>
        `;

        viewModal.hidden = false;

        document.body.classList.add("mtc-admin-reviews-modal-open");
    }

    // =========================================
    // CLOSE VIEW REVIEW MODAL
    // =========================================

    function closeReviewViewModal() {
        if (!viewModal) {
            return;
        }

        viewModal.hidden = true;

        if (viewModalContent) {
            viewModalContent.innerHTML = "";
        }

        document.body.classList.remove("mtc-admin-reviews-modal-open");
    }

    // =========================================
    // OPEN DENY MODAL
    // =========================================

    function openReviewDenyModal(reviewId) {
        if (!denyModal) {
            return;
        }

        const review = findAdminReviewById(reviewId);

        if (!review) {
            console.error("ADMIN REVIEW NOT FOUND FOR DENY:", reviewId);

            return;
        }

        denyReviewId = reviewId;

        denyModal.hidden = false;

        document.body.classList.add("mtc-admin-reviews-modal-open");
    }

    // =========================================
    // CLOSE DENY MODAL
    // =========================================

    function closeReviewDenyModal() {
        denyReviewId = null;

        if (denyModal) {
            denyModal.hidden = true;
        }

        if (denyConfirmButton) {
            denyConfirmButton.disabled = false;

            denyConfirmButton.innerHTML = `
                <i class="fa-solid fa-xmark"></i>
                Deny Review
            `;

            delete denyConfirmButton.dataset.originalText;
        }

        if (!viewModal || viewModal.hidden) {
            document.body.classList.remove("mtc-admin-reviews-modal-open");
        }
    }
    // =========================================
    // APPROVE REVIEW
    // =========================================

    async function approveAdminReview(reviewId, button) {
        const review = findAdminReviewById(reviewId);

        if (!review) {
            console.error("ADMIN REVIEW NOT FOUND FOR APPROVE:", reviewId);

            return;
        }

        setReviewActionButtonBusy(button, true, "Approving...", "Approve");

        try {
            const updatedReview = await updateAdminReviewStatus(reviewId, {
                isApproved: true,

                isDenied: false,
            });

            updateReviewLocally(reviewId, {
                is_approved: updatedReview.is_approved,

                is_denied: updatedReview.is_denied,

                updated_at: updatedReview.updated_at,
            });

            console.log("ADMIN REVIEW APPROVED:", reviewId);
        } catch (error) {
            console.error("ADMIN REVIEW APPROVE ERROR:", error);

            setReviewActionButtonBusy(button, false, "", "Approve");
        }
    }

    // =========================================
    // DENY REVIEW
    // =========================================

    async function denyAdminReview(reviewId) {
        const review = findAdminReviewById(reviewId);

        if (!review) {
            console.error("ADMIN REVIEW NOT FOUND FOR DENY:", reviewId);

            return;
        }

        if (!denyConfirmButton) {
            return;
        }

        setReviewActionButtonBusy(denyConfirmButton, true, "Denying...", "Deny Review");

        try {
            const updatedReview = await updateAdminReviewStatus(reviewId, {
                isApproved: false,

                isDenied: true,
            });

            updateReviewLocally(reviewId, {
                is_approved: updatedReview.is_approved,

                is_denied: updatedReview.is_denied,

                updated_at: updatedReview.updated_at,
            });

            console.log("ADMIN REVIEW DENIED:", reviewId);

            closeReviewDenyModal();
        } catch (error) {
            console.error("ADMIN REVIEW DENY ERROR:", error);

            setReviewActionButtonBusy(denyConfirmButton, false, "", "Deny Review");
        }
    }

    // =========================================
    // TABLE ACTION CLICK HANDLER
    // =========================================

    document.addEventListener("click", async (event) => {
        const approveButton = event.target.closest(".mtc-admin-reviews-approve-button");

        if (approveButton) {
            if (!canApproveReviews) {
                alert("You do not have permission to approve reviews.");
                return;
            }
            const reviewId = approveButton.dataset.reviewId;

            if (!reviewId) {
                return;
            }

            await approveAdminReview(reviewId, approveButton);

            return;
        }

        const denyButton = event.target.closest(".mtc-admin-reviews-deny-button");

        if (denyButton) {
            if (!canDenyReviews) {
                alert("You do not have permission to deny reviews.");
                return;
            }
            const reviewId = denyButton.dataset.reviewId;

            if (!reviewId) {
                return;
            }

            openReviewDenyModal(reviewId);

            return;
        }

        const viewButton = event.target.closest(".mtc-admin-reviews-view-button");

        if (viewButton) {
            const reviewId = viewButton.dataset.reviewId;

            if (!reviewId) {
                return;
            }

            openReviewViewModal(reviewId);
        }
    });

    // =========================================
    // DENY CONFIRM BUTTON
    // =========================================

    if (denyConfirmButton) {
        denyConfirmButton.addEventListener("click", async () => {
            if (!denyReviewId) {
                return;
            }

            await denyAdminReview(denyReviewId);
        });
    }

    // =========================================
    // DENY CANCEL BUTTON
    // =========================================

    if (denyCancelButton) {
        denyCancelButton.addEventListener("click", () => {
            closeReviewDenyModal();
        });
    }

    // =========================================
    // DENY MODAL CLOSE BUTTON
    // =========================================

    if (denyModalClose) {
        denyModalClose.addEventListener("click", () => {
            closeReviewDenyModal();
        });
    }

    // =========================================
    // VIEW MODAL CLOSE BUTTON
    // =========================================

    if (viewModalClose) {
        viewModalClose.addEventListener("click", () => {
            closeReviewViewModal();
        });
    }

    // =========================================
    // MODAL OVERLAY CLICK
    // =========================================

    document.addEventListener("click", (event) => {
        if (event.target.matches("#mtcAdminReviewsViewModal .mtc-admin-reviews-modal-overlay")) {
            closeReviewViewModal();

            return;
        }

        if (event.target.matches("#mtcAdminReviewsDenyModal .mtc-admin-reviews-modal-overlay")) {
            closeReviewDenyModal();
        }
    });

    // =========================================
    // ESCAPE KEY CLOSE MODALS
    // =========================================

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        if (denyModal && !denyModal.hidden) {
            closeReviewDenyModal();

            return;
        }

        if (viewModal && !viewModal.hidden) {
            closeReviewViewModal();
        }
    });
    // =========================================
    // SEARCH INPUT
    // =========================================

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            applyReviewFilters(true);
        });
    }

    // =========================================
    // STATUS FILTER
    // =========================================

    if (statusFilter) {
        statusFilter.addEventListener("change", () => {
            applyReviewFilters(true);
        });
    }

    // =========================================
    // RATING FILTER
    // =========================================

    if (ratingFilter) {
        ratingFilter.addEventListener("change", () => {
            applyReviewFilters(true);
        });
    }

    // =========================================
    // REVIEW TYPE TABS
    // =========================================

    // Restore the correct tab when the page loads
    if (activeReviewType === "store") {
        storeReviewsTab?.classList.add("active");
        productReviewsTab?.classList.remove("active");
    } else {
        productReviewsTab?.classList.add("active");
        storeReviewsTab?.classList.remove("active");
    }

    // =========================================
    // PRODUCT REVIEWS TAB
    // =========================================

    if (productReviewsTab) {
        productReviewsTab.addEventListener("click", () => {
            activeReviewType = "product";

            sessionStorage.setItem(
                "mtcAdminActiveReviewType",
                "product"
            );

            productReviewsTab.classList.add("active");
            storeReviewsTab?.classList.remove("active");

            adminReviewsCurrentPage = 1;

            if (selectAllCheckbox) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            }

            if (deleteSelectedButton) {
                deleteSelectedButton.disabled = true;
            }

            applyReviewFilters(false);
        });
    }

    // =========================================
    // STORE REVIEWS TAB
    // =========================================

    if (storeReviewsTab) {
        storeReviewsTab.addEventListener("click", () => {
            activeReviewType = "store";

            sessionStorage.setItem(
                "mtcAdminActiveReviewType",
                "store"
            );

            storeReviewsTab.classList.add("active");
            productReviewsTab?.classList.remove("active");

            adminReviewsCurrentPage = 1;

            if (selectAllCheckbox) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            }

            if (deleteSelectedButton) {
                deleteSelectedButton.disabled = true;
            }

            applyReviewFilters(false);
        });
    }

    // =========================================
    // PRODUCT FILTER
    // =========================================

    if (productFilter) {
        productFilter.addEventListener("change", () => {
            applyReviewFilters(true);
        });
    }

    // =========================================
    // CLEAR FILTERS
    // =========================================

    if (clearFiltersButton) {
        clearFiltersButton.addEventListener("click", () => {
            if (searchInput) {
                searchInput.value = "";
            }

            if (statusFilter) {
                statusFilter.value = "all";
            }

            if (ratingFilter) {
                ratingFilter.value = "all";
            }

            if (productFilter) {
                productFilter.value = "all";
            }

            adminReviewsCurrentPage = 1;

            applyReviewFilters(false);
        });
    }

    // =========================================
    // PREVIOUS PAGE
    // =========================================

    if (previousPageButton) {
        previousPageButton.addEventListener("click", () => {
            if (adminReviewsCurrentPage <= 1) {
                return;
            }

            adminReviewsCurrentPage -= 1;

            renderReviewsTable();
        });
    }

    // =========================================
    // NEXT PAGE
    // =========================================

    if (nextPageButton) {
        nextPageButton.addEventListener("click", () => {
            const totalPages = Math.max(1, Math.ceil(filteredAdminReviews.length / REVIEWS_PER_PAGE));

            if (adminReviewsCurrentPage >= totalPages) {
                return;
            }

            adminReviewsCurrentPage += 1;

            renderReviewsTable();
        });
    }

    // =========================================
    // REFRESH BUTTON
    // =========================================

    if (refreshButton) {
        refreshButton.addEventListener("click", async () => {
            adminReviewsCurrentPage = 1;

            await loadAdminReviews();
        });
    }

    // =========================================
    // INITIALIZE REVIEWS PAGE
    // =========================================

    async function initializeAdminReviewsPage() {
        ensureDeniedFilterOption();

        await loadAdminReviews();

        // =========================================
        // OPEN REVIEW FROM NOTIFICATION
        // =========================================

        const reviewUrlParams = new URLSearchParams(window.location.search);

        const reviewIdFromNotification = reviewUrlParams.get("reviewId");

        const reviewActionFromNotification = reviewUrlParams.get("action");

        if (reviewIdFromNotification && reviewActionFromNotification === "open_review") {
            const reviewFromNotification = findAdminReviewById(reviewIdFromNotification);

            if (reviewFromNotification) {
                openReviewViewModal(reviewIdFromNotification);

                window.history.replaceState({}, document.title, "mtc-admin-reviews.html");
            }
        }
    }

    // =========================================
    // START
    // =========================================

    initializeAdminReviewsPage();
})();
/* =========================================
        END OF MTC-ADMIN-REVIEWS JS
========================================= */

/* =========================================
        START OF MTC-ADMIN-SHIPPING JS
========================================= */
(async () => {
    const mtcAdminShippingMain = document.getElementById("mtcAdminShippingMain");

    if (mtcAdminShippingMain) {
        /* =====================================================
       MANAGE SHIPPING PERMISSION
    ===================================================== */

        let canManageShippingPage = false;

        const {
            data: { session: shippingPermissionSession },
        } = await adminSupabase.auth.getSession();

        if (shippingPermissionSession?.access_token) {
            const manageShippingResponse = await fetch(
                "https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=shipping.manage",
                {
                    headers: {
                        Authorization: `Bearer ${shippingPermissionSession.access_token}`,
                    },
                }
            );

            const manageShippingResult = await manageShippingResponse.json();

            canManageShippingPage = manageShippingResult?.allowed === true;
        }

        console.log("MANAGE SHIPPING PERMISSION:", canManageShippingPage);

        /* =====================================================
       SHIPPING ELEMENTS
    ===================================================== */

        const shippingMethodsTableBody = document.getElementById("mtcAdminShippingMethodsTableBody");

        const addShippingMethodButton = document.getElementById("mtcAdminShippingAddMethodButton");

        const shippingMethodModal = document.getElementById("mtcAdminShippingMethodModal");

        const shippingMethodModalOverlay = document.getElementById("mtcAdminShippingMethodModalOverlay");

        const shippingMethodModalClose = document.getElementById("mtcAdminShippingMethodModalClose");

        const shippingMethodCancelButton = document.getElementById("mtcAdminShippingMethodCancelButton");

        const shippingMethodModalTitle = document.getElementById("mtcAdminShippingMethodModalTitle");

        const shippingMethodForm = document.getElementById("mtcAdminShippingMethodForm");

        const shippingMethodId = document.getElementById("mtcAdminShippingMethodId");

        const shippingMethodName = document.getElementById("mtcAdminShippingMethodName");

        const shippingMethodDescription = document.getElementById("mtcAdminShippingMethodDescription");

        const shippingMethodPrice = document.getElementById("mtcAdminShippingMethodPrice");

        const shippingMethodDelivery = document.getElementById("mtcAdminShippingMethodDelivery");

        const shippingMethodActive = document.getElementById("mtcAdminShippingMethodActive");

        /* =====================================================
       SETTINGS ELEMENTS
    ===================================================== */

        const freeShippingEnabled = document.getElementById("mtcAdminFreeShippingEnabled");

        const freeShippingMinimum = document.getElementById("mtcAdminFreeShippingMinimum");

        const freeShippingSaveButton = document.getElementById("mtcAdminFreeShippingSaveButton");
        const freeShippingNameInput = document.getElementById("mtcAdminFreeShippingName");

        const freeShippingDescriptionInput = document.getElementById("mtcAdminFreeShippingDescription");

        const localPickupEnabled = document.getElementById("mtcAdminLocalPickupEnabled");

        const localPickupAddress = document.getElementById("mtcAdminLocalPickupAddress");

        const localPickupInstructions = document.getElementById("mtcAdminLocalPickupInstructions");

        const localPickupReadyTime = document.getElementById("mtcAdminLocalPickupReadyTime");

        const localPickupSaveButton = document.getElementById("mtcAdminLocalPickupSaveButton");

        const shippingRateMethod = document.getElementById("mtcAdminShippingRateMethod");

        const shippingCombineItems = document.getElementById("mtcAdminShippingCombineItems");

        const shippingTaxShipping = document.getElementById("mtcAdminShippingTaxShipping");

        const shippingRateRulesSaveButton = document.getElementById("mtcAdminShippingRateRulesSaveButton");

        const shippingProcessingTime = document.getElementById("mtcAdminShippingProcessingTime");

        const shippingPaidStatus = document.getElementById("mtcAdminShippingPaidStatus");

        const shippingTrackingEmail = document.getElementById("mtcAdminShippingTrackingEmail");

        const shippingFulfillmentSaveButton = document.getElementById("mtcAdminShippingFulfillmentSaveButton");

        const internationalShippingEnabled = document.getElementById("mtcAdminInternationalShippingEnabled");

        const shippingRestrictedLocations = document.getElementById("mtcAdminShippingRestrictedLocations");

        const shippingRestrictionsSaveButton = document.getElementById("mtcAdminShippingRestrictionsSaveButton");

        const shippingCarriersSaveButton = document.getElementById("mtcAdminShippingCarriersSaveButton");

        /* =====================================================
   APPLY MANAGE SHIPPING PERMISSION
===================================================== */

        function applyShippingManagePermission() {
            if (canManageShippingPage) {
                return;
            }

            const shippingControls = mtcAdminShippingMain.querySelectorAll("input, select, textarea, button");

            shippingControls.forEach((control) => {
                // Keep navigation/non-editing controls alone if needed
                if (control.type === "hidden") {
                    return;
                }

                control.disabled = true;
                control.setAttribute("aria-disabled", "true");
            });

            // Extra protection for the Free Shipping minimum field
            const freeShippingMinimum = document.getElementById("mtcAdminFreeShippingMinimum");

            if (freeShippingMinimum) {
                freeShippingMinimum.disabled = true;
                freeShippingMinimum.readOnly = true;
            }
        }

        /* =====================================================
   REQUIRE MANAGE SHIPPING PERMISSION
===================================================== */

        function requireManageShippingPermission() {
            if (canManageShippingPage) {
                return true;
            }

            alert("You do not have permission to manage shipping.");

            return false;
        }

        /* =====================================================
   CURRENT SHIPPING SETTINGS ROW
===================================================== */

        let currentShippingSettingsId = null;

        /* =====================================================
   HTML ESCAPE
===================================================== */

        function escapeShippingHTML(value) {
            if (value === null || value === undefined) {
                return "";
            }

            return String(value)
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#039;");
        }

        /* =====================================================
       MONEY FORMATTER
    ===================================================== */

        function formatShippingMoney(value) {
            const number = Number(value || 0);

            return new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
            }).format(number);
        }

        /* =====================================================
       SHIPPING MESSAGE
    ===================================================== */

        function showShippingMessage(message, type = "success") {
            let messageBox = document.getElementById("mtcAdminShippingMessage");

            if (!messageBox) {
                messageBox = document.createElement("div");

                messageBox.id = "mtcAdminShippingMessage";

                messageBox.style.position = "fixed";
                messageBox.style.right = "24px";
                messageBox.style.bottom = "24px";
                messageBox.style.zIndex = "20000";
                messageBox.style.maxWidth = "360px";
                messageBox.style.padding = "13px 16px";
                messageBox.style.borderRadius = "10px";
                messageBox.style.fontSize = "13px";
                messageBox.style.fontWeight = "700";
                messageBox.style.boxShadow = "0 12px 35px rgba(0,0,0,.35)";

                document.body.appendChild(messageBox);
            }

            if (type === "error") {
                messageBox.style.background = "#7f1d1d";

                messageBox.style.color = "#fecaca";

                messageBox.style.border = "1px solid rgba(248,113,113,.4)";
            } else {
                messageBox.style.background = "#14532d";

                messageBox.style.color = "#bbf7d0";

                messageBox.style.border = "1px solid rgba(74,222,128,.35)";
            }

            messageBox.textContent = message;

            messageBox.style.display = "block";

            clearTimeout(window.mtcShippingMessageTimer);

            window.mtcShippingMessageTimer = setTimeout(() => {
                messageBox.style.display = "none";
            }, 3500);
        }

        /* =====================================================
       OPEN SHIPPING METHOD MODAL
    ===================================================== */

        function openShippingMethodModal(method = null) {
            shippingMethodForm.reset();

            shippingMethodId.value = "";

            shippingMethodActive.checked = true;

            shippingMethodPrice.value = "0.00";

            if (method) {
                shippingMethodModalTitle.textContent = "Edit Shipping Method";

                shippingMethodId.value = method.id || "";

                shippingMethodName.value = method.name || "";

                shippingMethodDescription.value = method.description || "";

                shippingMethodPrice.value = Number(method.price || 0).toFixed(2);

                shippingMethodDelivery.value = method.estimated_delivery || "";

                shippingMethodActive.checked = method.is_active === true;
            } else {
                shippingMethodModalTitle.textContent = "Add Shipping Method";
            }

            shippingMethodModal.classList.add("active");

            shippingMethodModal.setAttribute("aria-hidden", "false");

            document.body.style.overflow = "hidden";
        }

        /* =====================================================
       CLOSE SHIPPING METHOD MODAL
    ===================================================== */

        function closeShippingMethodModal() {
            shippingMethodModal.classList.remove("active");

            shippingMethodModal.setAttribute("aria-hidden", "true");

            document.body.style.overflow = "";
        }

        /* =====================================================
       LOAD SHIPPING METHODS
    ===================================================== */

        async function loadAdminShippingMethods() {
            if (!shippingMethodsTableBody) {
                return;
            }

            shippingMethodsTableBody.innerHTML = `
            <tr>
                <td colspan="5">
                    Loading shipping methods...
                </td>
            </tr>
        `;

            try {
                const { data, error } = await adminSupabase
                    .from("Shipping_Methods")
                    .select("*")
                    .order("sort_order", {
                        ascending: true,
                    })
                    .order("created_at", {
                        ascending: true,
                    });

                if (error) {
                    throw error;
                }

                renderAdminShippingMethods(data || []);
            } catch (error) {
                console.error("LOAD SHIPPING METHODS ERROR:", error);

                shippingMethodsTableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        Unable to load shipping methods.
                    </td>
                </tr>
            `;

                showShippingMessage("Unable to load shipping methods.", "error");
            }
        }

        /* =====================================================
       RENDER SHIPPING METHODS
    ===================================================== */

        function renderAdminShippingMethods(methods) {
            if (!methods.length) {
                shippingMethodsTableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        No shipping methods have been created.
                    </td>
                </tr>
            `;

                return;
            }

            shippingMethodsTableBody.innerHTML = methods
                .map((method) => {
                    const encodedMethod = encodeURIComponent(JSON.stringify(method));

                    return `
                        <tr>

                            <td>
                                <strong>
                                    ${escapeShippingHTML(method.name)}
                                </strong>
                            </td>

                            <td>
                                ${formatShippingMoney(method.price)}
                            </td>

                            <td>
                                ${escapeShippingHTML(method.estimated_delivery || "—")}
                            </td>

                            <td>
                                <span
                                    class="
                                        mtc-admin-shipping-status
                                        ${method.is_active ? "active" : "inactive"}
                                    "
                                >
                                    ${method.is_active ? "Active" : "Inactive"}
                                </span>
                            </td>

                            <td>

                                <div
                                    class="
                                        mtc-admin-shipping-table-actions
                                    "
                                >

                                    <button
                                        type="button"
                                        class="
                                            mtc-admin-shipping-action-button
                                            mtc-admin-shipping-edit-method
                                        "
                                        data-method="${encodedMethod}"
                                        title="Edit"
                                    >
                                        <i
                                            class="
                                                fa-solid
                                                fa-pen
                                            "
                                        ></i>
                                    </button>

                                    <button
                                        type="button"
                                        class="
                                            mtc-admin-shipping-action-button
                                            delete
                                            mtc-admin-shipping-delete-method
                                        "
                                        data-method-id="${method.id}"
                                        data-method-name="${escapeShippingHTML(method.name)}"
                                        title="Delete"
                                    >
                                        <i
                                            class="
                                                fa-solid
                                                fa-trash
                                            "
                                        ></i>
                                    </button>

                                </div>

                            </td>

                        </tr>
                    `;
                })
                .join("");
        }

        /* =====================================================
       ADD SHIPPING METHOD BUTTON
    ===================================================== */

        addShippingMethodButton?.addEventListener("click", () => {
            openShippingMethodModal();
        });

        /* =====================================================
       CLOSE MODAL BUTTONS
    ===================================================== */

        shippingMethodModalClose?.addEventListener("click", closeShippingMethodModal);

        shippingMethodCancelButton?.addEventListener("click", closeShippingMethodModal);

        shippingMethodModalOverlay?.addEventListener("click", closeShippingMethodModal);

        /* =====================================================
       SAVE SHIPPING METHOD
===================================================== */

        shippingMethodForm?.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (!requireManageShippingPermission()) {
                return;
            }

            const id = shippingMethodId.value.trim();

            const name = shippingMethodName.value.trim();

            const description = shippingMethodDescription.value.trim();

            const price = Number(shippingMethodPrice.value);

            const estimatedDelivery = shippingMethodDelivery.value.trim();

            const isActive = shippingMethodActive.checked;

            if (!name) {
                showShippingMessage("Enter a shipping method name.", "error");

                return;
            }

            if (!Number.isFinite(price) || price < 0) {
                showShippingMessage("Enter a valid shipping price.", "error");

                return;
            }

            const payload = {
                name,

                description: description || null,

                price,

                estimated_delivery: estimatedDelivery || null,

                is_active: isActive,

                updated_at: new Date().toISOString(),
            };

            try {
                let error;

                if (id) {
                    const result = await adminSupabase.from("Shipping_Methods").update(payload).eq("id", id);

                    error = result.error;
                } else {
                    const result = await adminSupabase.from("Shipping_Methods").insert(payload);

                    error = result.error;
                }

                if (error) {
                    throw error;
                }

                closeShippingMethodModal();

                await loadAdminShippingMethods();

                showShippingMessage(id ? "Shipping method updated." : "Shipping method created.");
            } catch (error) {
                console.error("SAVE SHIPPING METHOD ERROR:", error);

                showShippingMessage(error.message || "Unable to save shipping method.", "error");
            }
        });

        /* =====================================================
   EDIT / DELETE SHIPPING METHOD
===================================================== */

        shippingMethodsTableBody?.addEventListener("click", async (event) => {
            const editButton = event.target.closest(".mtc-admin-shipping-edit-method");

            if (editButton) {
                if (!requireManageShippingPermission()) {
                    return;
                }

                try {
                    const method = JSON.parse(decodeURIComponent(editButton.dataset.method));

                    openShippingMethodModal(method);
                } catch (error) {
                    console.error("EDIT SHIPPING METHOD ERROR:", error);
                }

                return;
            }

            const deleteButton = event.target.closest(".mtc-admin-shipping-delete-method");

            if (!deleteButton) {
                return;
            }

            if (!requireManageShippingPermission()) {
                return;
            }

            const methodId = deleteButton.dataset.methodId;

            const methodName = deleteButton.dataset.methodName || "this shipping method";

            const confirmed = window.confirm(`Delete ${methodName}?`);

            if (!confirmed) {
                return;
            }

            try {
                const { error } = await adminSupabase.from("Shipping_Methods").delete().eq("id", methodId);

                if (error) {
                    throw error;
                }

                await loadAdminShippingMethods();

                showShippingMessage("Shipping method deleted.");
            } catch (error) {
                console.error("DELETE SHIPPING METHOD ERROR:", error);

                showShippingMessage(error.message || "Unable to delete shipping method.", "error");
            }
        });

        /* =====================================================
   LOAD SHIPPING SETTINGS
===================================================== */

        async function loadAdminShippingSettings() {
            try {
                const { data, error } = await adminSupabase
                    .from("Shipping_Settings")
                    .select("*")
                    .limit(1)
                    .maybeSingle();

                if (error) {
                    throw error;
                }

                if (!data) {
                    return;
                }

                currentShippingSettingsId = data.id;

                /* FREE SHIPPING */

                freeShippingEnabled.checked = data.free_shipping_enabled === true;

                freeShippingMinimum.value = Number(data.free_shipping_minimum || 0).toFixed(2);

                freeShippingNameInput.value = data.free_shipping_name || "Free Standard Shipping";

                freeShippingDescriptionInput.value =
                    data.free_shipping_description || "Free standard shipping on qualifying orders";

                let cartLocalPickupEnabled = false;
                let cartLocalPickupAddress = "";
                let cartLocalPickupInstructions = "";
                let cartLocalPickupReadyTime = "";

                /* RATE RULES */

                shippingRateMethod.value = data.rate_calculation_method || "flat_rate";

                shippingCombineItems.checked = data.combine_items === true;

                shippingTaxShipping.checked = data.calculate_tax_on_shipping === true;

                /* LOCAL PICKUP */

                localPickupEnabled.checked = data.local_pickup_enabled === true;

                localPickupAddress.value = data.local_pickup_address || "";

                localPickupInstructions.value = data.local_pickup_instructions || "";

                localPickupReadyTime.value = data.local_pickup_ready_time || "2 hours";

                /* FULFILLMENT */

                shippingProcessingTime.value = data.processing_time || "1-2 business days";

                shippingPaidStatus.value = data.order_status_after_payment || "Not Shipped";

                shippingTrackingEmail.checked = data.send_tracking_email === true;

                /* RESTRICTIONS */

                internationalShippingEnabled.checked = data.international_shipping_enabled === true;

                shippingRestrictedLocations.value = Array.isArray(data.restricted_locations)
                    ? data.restricted_locations.join(", ")
                    : "";
            } catch (error) {
                console.error("LOAD SHIPPING SETTINGS ERROR:", error);

                showShippingMessage("Unable to load shipping settings.", "error");
            }
        }

        /* =====================================================
   UPDATE SHIPPING SETTINGS
===================================================== */

        async function updateAdminShippingSettings(updates, successMessage) {
            if (!requireManageShippingPermission()) {
                return false;
            }

            if (!currentShippingSettingsId) {
                showShippingMessage("Shipping settings record was not found.", "error");

                return false;
            }

            try {
                const { error } = await adminSupabase
                    .from("Shipping_Settings")
                    .update({
                        ...updates,

                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", currentShippingSettingsId);

                if (error) {
                    throw error;
                }

                showShippingMessage(successMessage);

                return true;
            } catch (error) {
                console.error("UPDATE SHIPPING SETTINGS ERROR:", error);

                showShippingMessage(error.message || "Unable to save shipping settings.", "error");

                return false;
            }
        }

        /* =====================================================
   SAVE FREE SHIPPING
===================================================== */

        freeShippingSaveButton?.addEventListener("click", async () => {
            if (!requireManageShippingPermission()) {
                return;
            }

            const minimum = Number(freeShippingMinimum.value);

            if (!Number.isFinite(minimum) || minimum < 0) {
                showShippingMessage("Enter a valid free shipping minimum.", "error");

                return;
            }

            await updateAdminShippingSettings(
                {
                    free_shipping_enabled: freeShippingEnabled.checked,

                    free_shipping_minimum: minimum,

                    free_shipping_name: freeShippingNameInput.value.trim() || "Free Standard Shipping",

                    free_shipping_description:
                        freeShippingDescriptionInput.value.trim() || "Free standard shipping on qualifying orders",
                },
                "Free shipping settings saved."
            );
        });

        /* =====================================================
   SAVE RATE RULES
===================================================== */

        shippingRateRulesSaveButton?.addEventListener("click", async () => {
            await updateAdminShippingSettings(
                {
                    rate_calculation_method: shippingRateMethod.value,

                    combine_items: shippingCombineItems.checked,

                    calculate_tax_on_shipping: shippingTaxShipping.checked,
                },
                "Shipping rate rules saved."
            );
        });

        /* =====================================================
   SAVE LOCAL PICKUP
===================================================== */

        localPickupSaveButton?.addEventListener("click", async () => {
            if (!requireManageShippingPermission()) {
                return;
            }

            const pickupAddress = localPickupAddress.value.trim();

            const pickupInstructions = localPickupInstructions.value.trim();

            const allowedReadyTimes = ["1 hour", "2 hours", "4 hours", "Same day", "Next business day"];

            const pickupReadyTime = allowedReadyTimes.includes(localPickupReadyTime.value)
                ? localPickupReadyTime.value
                : "2 hours";

            if (localPickupEnabled.checked && pickupAddress.length === 0) {
                alert("Enter a store pickup address before enabling Local Pickup.");

                localPickupAddress.focus();

                return;
            }

            if (pickupAddress.length > 500) {
                alert("The pickup address is too long.");

                localPickupAddress.focus();

                return;
            }

            if (pickupInstructions.length > 1000) {
                alert("The pickup instructions are too long.");

                localPickupInstructions.focus();

                return;
            }

            await updateAdminShippingSettings(
                {
                    local_pickup_enabled: localPickupEnabled.checked,

                    local_pickup_address: pickupAddress || null,

                    local_pickup_instructions: pickupInstructions || null,

                    local_pickup_ready_time: pickupReadyTime,
                },
                "Local pickup settings saved."
            );
        });

        /* =====================================================
   LOAD SHIPPING CARRIERS
===================================================== */

        async function loadAdminShippingCarriers() {
            try {
                const { data, error } = await adminSupabase.from("Shipping_Carriers").select("*").order("sort_order", {
                    ascending: true,
                });

                if (error) {
                    throw error;
                }

                document.querySelectorAll("[data-shipping-carrier]").forEach((checkbox) => {
                    const carrier = (data || []).find(
                        (row) => row.carrier_name.toLowerCase() === checkbox.dataset.shippingCarrier.toLowerCase()
                    );

                    checkbox.checked = carrier?.is_enabled === true;
                });
            } catch (error) {
                console.error("LOAD SHIPPING CARRIERS ERROR:", error);

                showShippingMessage("Unable to load shipping carriers.", "error");
            }
        }

        /* =====================================================
   SAVE SHIPPING CARRIERS
===================================================== */

        shippingCarriersSaveButton?.addEventListener("click", async () => {
            if (!requireManageShippingPermission()) {
                return;
            }

            const checkboxes = [...document.querySelectorAll("[data-shipping-carrier]")];

            try {
                for (const checkbox of checkboxes) {
                    const carrierName = checkbox.dataset.shippingCarrier;

                    const { error } = await adminSupabase
                        .from("Shipping_Carriers")
                        .update({
                            is_enabled: checkbox.checked,

                            updated_at: new Date().toISOString(),
                        })
                        .eq("carrier_name", carrierName);

                    if (error) {
                        throw error;
                    }
                }

                showShippingMessage("Carrier settings saved.");
            } catch (error) {
                console.error("SAVE SHIPPING CARRIERS ERROR:", error);

                showShippingMessage(error.message || "Unable to save carrier settings.", "error");
            }
        });

        /* =====================================================
       SAVE FULFILLMENT
    ===================================================== */

        shippingFulfillmentSaveButton?.addEventListener("click", async () => {
            await updateAdminShippingSettings(
                {
                    processing_time: shippingProcessingTime.value,

                    order_status_after_payment: shippingPaidStatus.value,

                    send_tracking_email: shippingTrackingEmail.checked,
                },
                "Fulfillment settings saved."
            );
        });

        /* =====================================================
   SAVE SHIPPING RESTRICTIONS
===================================================== */

        shippingRestrictionsSaveButton?.addEventListener("click", async () => {
            if (!requireManageShippingPermission()) {
                return;
            }

            const restrictedLocations = shippingRestrictedLocations.value
                .split(",")
                .map((location) => location.trim().toUpperCase())
                .filter(Boolean);

            await updateAdminShippingSettings(
                {
                    international_shipping_enabled: internationalShippingEnabled.checked,

                    restricted_locations: restrictedLocations,
                },
                "Shipping restrictions saved."
            );
        });

        /* =====================================================
       SHIPPING TAB SCROLL / ACTIVE STATE
    ===================================================== */

        const shippingTabs = document.querySelectorAll(".mtc-admin-shipping-tab");

        shippingTabs.forEach((tab) => {
            tab.addEventListener("click", () => {
                shippingTabs.forEach((item) => {
                    item.classList.remove("active");
                });

                tab.classList.add("active");
            });
        });

        /* =====================================================
       ESC KEY CLOSES MODAL
    ===================================================== */

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && shippingMethodModal?.classList.contains("active")) {
                closeShippingMethodModal();
            }
        });

        /* =====================================================
       INITIALIZE SHIPPING PAGE
    ===================================================== */
        async function initializeAdminShipping() {
            await Promise.all([loadAdminShippingMethods(), loadAdminShippingSettings(), loadAdminShippingCarriers()]);

            applyShippingManagePermission();
        }

        initializeAdminShipping();
    }

    /* =========================================================
   ADMIN SHIPPING - PART 2
========================================================= */

    if (document.getElementById("mtcAdminShippingMain")) {
        /* =====================================================
   SHIPPING SECTION TAB NAVIGATION
===================================================== */

        const shippingSectionTabs = document.querySelectorAll(".mtc-admin-shipping-tab");

        const shippingSections = document.querySelectorAll(".mtc-admin-shipping-section");

        function openShippingSection(tab) {
            const href = tab.getAttribute("href");

            if (!href || !href.startsWith("#")) {
                return;
            }

            const targetSection = document.querySelector(href);

            if (!targetSection) {
                return;
            }

            /* REMOVE ACTIVE TAB */

            shippingSectionTabs.forEach((item) => {
                item.classList.remove("active");
            });

            /* HIDE ALL SHIPPING SECTIONS */

            shippingSections.forEach((section) => {
                section.style.display = "none";
            });

            /* ACTIVATE CLICKED TAB */

            tab.classList.add("active");

            /* SHOW CLICKED SECTION */

            targetSection.style.display = "";

            /* REMEMBER CURRENT TAB */

            sessionStorage.setItem("mtcAdminShippingActiveTab", href);
        }

        shippingSectionTabs.forEach((tab) => {
            tab.addEventListener("click", (event) => {
                event.preventDefault();

                openShippingSection(tab);
            });
        });

        /* =====================================================
   OPEN SAVED TAB OR FIRST TAB
===================================================== */

        const savedShippingTab = sessionStorage.getItem("mtcAdminShippingActiveTab");

        let startingShippingTab = shippingSectionTabs[0];

        if (savedShippingTab) {
            const savedTab = Array.from(shippingSectionTabs).find(
                (tab) => tab.getAttribute("href") === savedShippingTab
            );

            if (savedTab) {
                startingShippingTab = savedTab;
            }
        }

        if (startingShippingTab) {
            openShippingSection(startingShippingTab);
        }

        /* =====================================================
       FREE SHIPPING FIELD STATE
    ===================================================== */

        const shippingFreeEnabled = document.getElementById("mtcAdminFreeShippingEnabled");

        const shippingFreeMinimum = document.getElementById("mtcAdminFreeShippingMinimum");

        function updateFreeShippingFieldState() {
            if (!shippingFreeEnabled || !shippingFreeMinimum) {
                return;
            }

            shippingFreeMinimum.disabled = !shippingFreeEnabled.checked;
        }

        shippingFreeEnabled?.addEventListener("change", updateFreeShippingFieldState);

        /* =====================================================
       LOCAL PICKUP FIELD STATE
    ===================================================== */

        const shippingPickupEnabled = document.getElementById("mtcAdminLocalPickupEnabled");

        const shippingPickupAddress = document.getElementById("mtcAdminLocalPickupAddress");

        const shippingPickupInstructions = document.getElementById("mtcAdminLocalPickupInstructions");

        const shippingPickupReadyTime = document.getElementById("mtcAdminLocalPickupReadyTime");

        function updateLocalPickupFieldState() {
            if (!shippingPickupEnabled) {
                return;
            }

            const disabled = !shippingPickupEnabled.checked;

            if (shippingPickupAddress) {
                shippingPickupAddress.disabled = disabled;
            }

            if (shippingPickupInstructions) {
                shippingPickupInstructions.disabled = disabled;
            }

            if (shippingPickupReadyTime) {
                shippingPickupReadyTime.disabled = disabled;
            }
        }

        shippingPickupEnabled?.addEventListener("change", updateLocalPickupFieldState);

        /* =====================================================
       SAVE BUTTON LOADING STATE
    ===================================================== */

        function setShippingButtonLoading(button, loading, loadingText = "Saving...") {
            if (!button) {
                return;
            }

            if (loading) {
                if (!button.dataset.originalHtml) {
                    button.dataset.originalHtml = button.innerHTML;
                }

                button.disabled = true;

                button.innerHTML = `
                <i
                    class="
                        fa-solid
                        fa-spinner
                        fa-spin
                    "
                ></i>

                ${loadingText}
            `;
            } else {
                button.disabled = false;

                if (button.dataset.originalHtml) {
                    button.innerHTML = button.dataset.originalHtml;
                }
            }
        }

        /* =====================================================
       NORMALIZE EXCLUDED STATES
    ===================================================== */

        const excludedStatesInput = document.getElementById("mtcAdminShippingExcludedStates");

        excludedStatesInput?.addEventListener("blur", () => {
            const states = excludedStatesInput.value
                .split(",")
                .map((state) => state.trim().toUpperCase())
                .filter(Boolean);

            const uniqueStates = [...new Set(states)];

            excludedStatesInput.value = uniqueStates.join(", ");
        });

        /* =====================================================
       PRICE INPUT CLEANUP
    ===================================================== */

        const shippingPriceInput = document.getElementById("mtcAdminShippingMethodPrice");

        shippingPriceInput?.addEventListener("blur", () => {
            if (shippingPriceInput.value === "") {
                return;
            }

            const value = Number(shippingPriceInput.value);

            if (!Number.isFinite(value)) {
                return;
            }

            shippingPriceInput.value = Math.max(0, value).toFixed(2);
        });

        /* =====================================================
       FREE SHIPPING MINIMUM CLEANUP
    ===================================================== */

        shippingFreeMinimum?.addEventListener("blur", () => {
            if (shippingFreeMinimum.value === "") {
                return;
            }

            const value = Number(shippingFreeMinimum.value);

            if (!Number.isFinite(value)) {
                return;
            }

            shippingFreeMinimum.value = Math.max(0, value).toFixed(2);
        });

        /* =====================================================
       SHIPPING METHOD NAME LENGTH
    ===================================================== */

        const shippingMethodNameInput = document.getElementById("mtcAdminShippingMethodName");

        shippingMethodNameInput?.addEventListener("input", () => {
            if (shippingMethodNameInput.value.length > 100) {
                shippingMethodNameInput.value = shippingMethodNameInput.value.slice(0, 100);
            }
        });

        /* =====================================================
       SHIPPING METHOD DELIVERY LENGTH
    ===================================================== */

        const shippingDeliveryInput = document.getElementById("mtcAdminShippingMethodDelivery");

        shippingDeliveryInput?.addEventListener("input", () => {
            if (shippingDeliveryInput.value.length > 100) {
                shippingDeliveryInput.value = shippingDeliveryInput.value.slice(0, 100);
            }
        });

        /* =====================================================
       SHIPPING DESCRIPTION LENGTH
    ===================================================== */

        const shippingDescriptionInput = document.getElementById("mtcAdminShippingMethodDescription");

        shippingDescriptionInput?.addEventListener("input", () => {
            if (shippingDescriptionInput.value.length > 500) {
                shippingDescriptionInput.value = shippingDescriptionInput.value.slice(0, 500);
            }
        });

        /* =====================================================
       DESTINATION / INTERNATIONAL STATE
    ===================================================== */

        const shippingDestinationSelect = document.getElementById("mtcAdminShippingDestination");

        function updateShippingDestinationState() {
            if (!shippingDestinationSelect) {
                return;
            }

            const selectedDestination = shippingDestinationSelect.value;

            console.log("SHIPPING DESTINATION:", selectedDestination);
        }

        shippingDestinationSelect?.addEventListener("change", updateShippingDestinationState);

        /* =====================================================
       CARRIER CHECKBOX VISUAL STATE
    ===================================================== */

        function updateShippingCarrierVisuals() {
            document.querySelectorAll(".mtc-admin-shipping-carrier").forEach((carrier) => {
                const checkbox = carrier.querySelector("[data-shipping-carrier]");

                if (!checkbox) {
                    return;
                }

                carrier.classList.toggle("active", checkbox.checked);
            });
        }

        document.querySelectorAll("[data-shipping-carrier]").forEach((checkbox) => {
            checkbox.addEventListener("change", updateShippingCarrierVisuals);
        });

        /* =====================================================
       SHIPPING MOBILE HAMBURGER MENU
    ===================================================== */

        const shippingMenuButton = document.getElementById("mtcAdminShippingMenuButton");

        const shippingSidebar = document.querySelector(".mw-dashboard-sidebar");

        if (shippingMenuButton && shippingSidebar) {
            shippingMenuButton.addEventListener("click", (event) => {
                event.preventDefault();

                event.stopPropagation();

                shippingSidebar.classList.toggle("mw-dashboard-sidebar-open");

                const isOpen = shippingSidebar.classList.contains("mw-dashboard-sidebar-open");

                shippingMenuButton.setAttribute("aria-expanded", String(isOpen));
            });

            /* =================================================
           CLOSE SHIPPING SIDEBAR ON OUTSIDE CLICK
        ================================================= */

            document.addEventListener("click", (event) => {
                if (!shippingSidebar.classList.contains("mw-dashboard-sidebar-open")) {
                    return;
                }

                const clickedInsideSidebar = shippingSidebar.contains(event.target);

                const clickedMenuButton = shippingMenuButton.contains(event.target);

                if (!clickedInsideSidebar && !clickedMenuButton) {
                    shippingSidebar.classList.remove("mw-dashboard-sidebar-open");

                    shippingMenuButton.setAttribute("aria-expanded", "false");
                }
            });

            /* =================================================
           CLOSE AFTER CLICKING SIDEBAR LINK ON MOBILE
        ================================================= */

            shippingSidebar.querySelectorAll(".mw-dashboard-nav-link").forEach((link) => {
                link.addEventListener("click", () => {
                    if (window.innerWidth > 900) {
                        return;
                    }

                    shippingSidebar.classList.remove("mw-dashboard-sidebar-open");

                    shippingMenuButton.setAttribute("aria-expanded", "false");
                });
            });
        }

        /* =====================================================
       ESCAPE KEY
       CLOSE MODAL + MOBILE SIDEBAR
    ===================================================== */

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") {
                return;
            }

            /* CLOSE SHIPPING METHOD MODAL */

            const modal = document.getElementById("mtcAdminShippingMethodModal");

            if (modal && modal.classList.contains("active")) {
                modal.classList.remove("active");

                modal.setAttribute("aria-hidden", "true");

                document.body.style.overflow = "";
            }

            /* CLOSE MOBILE SIDEBAR */

            if (shippingSidebar && shippingSidebar.classList.contains("mw-dashboard-sidebar-open")) {
                shippingSidebar.classList.remove("mw-dashboard-sidebar-open");

                shippingMenuButton?.setAttribute("aria-expanded", "false");
            }
        });

        /* =====================================================
       INITIAL UI STATE
    ===================================================== */

        setTimeout(() => {
            updateFreeShippingFieldState();

            updateLocalPickupFieldState();

            updateShippingDestinationState();

            updateShippingCarrierVisuals();
        }, 250);
    }
})();
/* =========================================
   END OF MTC-ADMIN-SHIPPING JS
========================================= */

// =========================================================
// START OF MTC-ADMIN-SUBSCRIBERS JS
// =========================================================

document.addEventListener("DOMContentLoaded", async () => {
    const isSubscribersPage = window.location.pathname.endsWith("mtc-admin-subscribers.html");

    if (!isSubscribersPage) {
        return;
    }

    // =====================================================
    // ELEMENTS
    // =====================================================

    const subscribersTab = document.getElementById("mtcAdminSubscribersTab");

    const discountsTab = document.getElementById("mtcAdminDiscountsTab");

    const subscribersPanel = document.getElementById("mtcAdminSubscribersPanel");

    const discountsPanel = document.getElementById("mtcAdminDiscountsPanel");

    const subscribersSearchInput = document.getElementById("mtcAdminSubscribersSearchInput");

    const discountsSearchInput = document.getElementById("mtcAdminDiscountsSearchInput");

    const subscribersTableBody = document.getElementById("mtcAdminSubscribersTableBody");

    const subscribersSelectAll = document.getElementById("mtcAdminSubscribersSelectAll");

    const sendPromotionButton = document.getElementById("mtcAdminSubscribersSendPromotionButton");
    // =====================================================
    // SEND PROMOTION MODAL ELEMENTS
    // =====================================================

    const promotionModal = document.getElementById("mtcAdminPromotionModal");

    const promotionModalCloseButton = document.getElementById("mtcAdminPromotionModalClose");

    const promotionCancelButton = document.getElementById("mtcAdminPromotionCancelButton");

    const promotionForm = document.getElementById("mtcAdminPromotionForm");

    const promotionRecipientCount = document.getElementById("mtcAdminPromotionRecipientCount");

    const promotionSubjectInput = document.getElementById("mtcAdminPromotionSubject");

    const promotionMessageInput = document.getElementById("mtcAdminPromotionMessage");

    const promotionDiscountSelect = document.getElementById("mtcAdminPromotionDiscount");

    const promotionMessageStatus = document.getElementById("mtcAdminPromotionMessageStatus");

    const promotionSubmitButton = document.getElementById("mtcAdminPromotionSubmitButton");
    const discountsTableBody = document.getElementById("mtcAdminDiscountsTableBody");

    const createDiscountButton = document.getElementById("mtcAdminSubscribersCreateDiscountButton");

    const totalSubscriberCount = document.getElementById("mtcAdminSubscribersTotalCount");

    const activeSubscriberCount = document.getElementById("mtcAdminSubscribersActiveCount");

    const discountCount = document.getElementById("mtcAdminSubscribersDiscountCount");

    // =====================================================
    // CREATE DISCOUNT MODAL ELEMENTS
    // =====================================================

    const discountModal = document.getElementById("mtcAdminDiscountModal");

    const discountModalCloseButton = document.getElementById("mtcAdminDiscountModalClose");

    const discountCancelButton = document.getElementById("mtcAdminDiscountCancelButton");

    const discountForm = document.getElementById("mtcAdminDiscountForm");

    const discountCodeInput = document.getElementById("mtcAdminDiscountCode");

    const discountTypeInput = document.getElementById("mtcAdminDiscountType");

    const discountValueInput = document.getElementById("mtcAdminDiscountValue");

    const discountMinimumInput = document.getElementById("mtcAdminDiscountMinimum");

    const discountUsageLimitInput = document.getElementById("mtcAdminDiscountUsageLimit");

    const discountStartsAtInput = document.getElementById("mtcAdminDiscountStartsAt");

    const discountExpiresAtInput = document.getElementById("mtcAdminDiscountExpiresAt");

    const discountActiveInput = document.getElementById("mtcAdminDiscountActive");

    const discountMessage = document.getElementById("mtcAdminDiscountMessage");

    const discountSubmitButton = document.getElementById("mtcAdminDiscountSubmitButton");

    // =====================================================
    // UPDATE DISCOUNT ELEMENTS
    // =====================================================

    const updateDiscountModal = document.getElementById("mtcAdminUpdateDiscountModal");

    const updateDiscountCloseButton = document.getElementById("mtcAdminUpdateDiscountClose");

    const updateDiscountForm = document.getElementById("mtcAdminUpdateDiscountForm");

    const updateDiscountCodeInput = document.getElementById("mtcAdminUpdateDiscountCode");

    const updateDiscountTypeInput = document.getElementById("mtcAdminUpdateDiscountType");

    const updateDiscountValueInput = document.getElementById("mtcAdminUpdateDiscountValue");

    const updateDiscountMinimumInput = document.getElementById("mtcAdminUpdateDiscountMinimum");

    const updateDiscountUsageLimitInput = document.getElementById("mtcAdminUpdateDiscountUsageLimit");

    const updateDiscountStartsAtInput = document.getElementById("mtcAdminUpdateDiscountStartsAt");

    const updateDiscountExpiresAtInput = document.getElementById("mtcAdminUpdateDiscountExpiresAt");

    const updateDiscountActiveInput = document.getElementById("mtcAdminUpdateDiscountActive");

    const updateDiscountMessage = document.getElementById("mtcAdminUpdateDiscountMessage");

    const updateDiscountDeleteButton = document.getElementById("mtcAdminUpdateDiscountDeleteButton");

    const updateDiscountSubmitButton = document.getElementById("mtcAdminUpdateDiscountSubmitButton");

    // =====================================================
    // DELETE DISCOUNT ELEMENTS
    // =====================================================

    const discountDeleteModal = document.getElementById("mtcAdminDiscountDeleteModal");

    const discountDeleteCloseButton = document.getElementById("mtcAdminDiscountDeleteClose");

    const discountDeleteCode = document.getElementById("mtcAdminDiscountDeleteCode");

    const discountDeleteMessage = document.getElementById("mtcAdminDiscountDeleteMessage");

    const discountDeleteConfirmButton = document.getElementById("mtcAdminDiscountDeleteConfirm");

    // =====================================================
    // DATA
    // =====================================================

    let subscribers = [];

    let selectedSubscriberIds = new Set();

    let discounts = [];

    // =====================================================
    // SEND PROMOTION MODAL
    // =====================================================

    function populatePromotionDiscounts() {
        if (!promotionDiscountSelect) {
            return;
        }

        promotionDiscountSelect.replaceChildren();

        const noDiscountOption = document.createElement("option");

        noDiscountOption.value = "";
        noDiscountOption.textContent = "No Discount Code";

        promotionDiscountSelect.appendChild(noDiscountOption);

        const activeDiscounts = discounts.filter((discount) => discount.is_active === true);

        activeDiscounts.forEach((discount) => {
            const option = document.createElement("option");

            option.value = String(discount.id || "");

            option.textContent = String(discount.code || "");

            promotionDiscountSelect.appendChild(option);
        });
    }

    // =====================================================
    // OPEN SEND PROMOTION MODAL
    // =====================================================

    function openPromotionModal() {
        if (!promotionModal || !canSendSubscriberEmails || selectedSubscriberIds.size === 0) {
            return;
        }

        if (promotionRecipientCount) {
            promotionRecipientCount.textContent = String(selectedSubscriberIds.size);
        }

        populatePromotionDiscounts();

        if (promotionMessageStatus) {
            promotionMessageStatus.hidden = true;

            promotionMessageStatus.textContent = "";
        }

        promotionModal.hidden = false;

        promotionSubjectInput?.focus();
    }

    // =====================================================
    // CLOSE SEND PROMOTION MODAL
    // =====================================================

    function closePromotionModal() {
        if (!promotionModal) {
            return;
        }

        promotionModal.hidden = true;

        if (promotionMessageStatus) {
            promotionMessageStatus.hidden = true;

            promotionMessageStatus.textContent = "";
        }
    }

    // =====================================================
    // SEND PROMOTION BUTTON
    // =====================================================

    sendPromotionButton?.addEventListener("click", () => {
        openPromotionModal();
    });

    // =====================================================
    // CLOSE BUTTON
    // =====================================================

    promotionModalCloseButton?.addEventListener("click", () => {
        closePromotionModal();
    });

    // =====================================================
    // CANCEL BUTTON
    // =====================================================

    promotionCancelButton?.addEventListener("click", () => {
        closePromotionModal();
    });

    // =====================================================
    // SUBMIT SEND PROMOTION
    // =====================================================

    promotionForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        // =============================================
        // PERMISSION
        // =============================================

        if (!canSendSubscriberEmails) {
            alert("You do not have permission to send subscriber emails.");

            return;
        }

        // =============================================
        // SELECTED SUBSCRIBERS
        // =============================================

        const subscriberIds = Array.from(selectedSubscriberIds);

        if (subscriberIds.length === 0) {
            if (promotionMessageStatus) {
                promotionMessageStatus.textContent = "Select at least one subscriber.";

                promotionMessageStatus.hidden = false;
            }

            return;
        }

        // =============================================
        // FORM VALUES
        // =============================================

        const subject = String(promotionSubjectInput?.value || "").trim();

        const message = String(promotionMessageInput?.value || "").trim();

        const discountId = String(promotionDiscountSelect?.value || "").trim();

        // =============================================
        // VALIDATE SUBJECT
        // =============================================

        if (!subject) {
            if (promotionMessageStatus) {
                promotionMessageStatus.textContent = "Enter an email subject.";

                promotionMessageStatus.hidden = false;
            }

            promotionSubjectInput?.focus();

            return;
        }

        // =============================================
        // VALIDATE MESSAGE
        // =============================================

        if (!message) {
            if (promotionMessageStatus) {
                promotionMessageStatus.textContent = "Enter a promotional message.";

                promotionMessageStatus.hidden = false;
            }

            promotionMessageInput?.focus();

            return;
        }

        // =============================================
        // GET CURRENT ADMIN SESSION
        // =============================================

        const {
            data: { session },
        } = await adminSupabase.auth.getSession();

        if (!session?.access_token) {
            alert("Your admin session has expired. Please sign in again.");

            return;
        }

        // =============================================
        // SENDING STATE
        // =============================================

        const originalButtonHTML = promotionSubmitButton?.innerHTML || "";

        if (promotionSubmitButton) {
            promotionSubmitButton.disabled = true;

            promotionSubmitButton.textContent = "Sending...";
        }

        if (promotionMessageStatus) {
            promotionMessageStatus.hidden = true;

            promotionMessageStatus.textContent = "";
        }

        try {
            // =========================================
            // SEND TO BACKEND
            // =========================================

            const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-subscribers/send-promotion", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    Authorization: `Bearer ${session.access_token}`,
                },

                body: JSON.stringify({
                    subscriberIds: subscriberIds,

                    subject: subject,

                    message: message,

                    discountId: discountId || null,
                }),
            });

            const result = await response.json();

            // =========================================
            // BACKEND ERROR
            // =========================================

            if (!response.ok || !result?.success) {
                throw new Error(result?.error || "Unable to send promotion.");
            }

            // =========================================
            // SUCCESS MESSAGE
            // =========================================

            if (promotionMessageStatus) {
                promotionMessageStatus.textContent = result.message || "Promotion sent successfully.";

                promotionMessageStatus.hidden = false;
            }

            // =========================================
            // CLEAR FORM
            // =========================================

            if (promotionSubjectInput) {
                promotionSubjectInput.value = "";
            }

            if (promotionMessageInput) {
                promotionMessageInput.value = "";
            }

            if (promotionDiscountSelect) {
                promotionDiscountSelect.value = "";
            }

            // =========================================
            // CLEAR SELECTED SUBSCRIBERS
            // =========================================

            selectedSubscriberIds.clear();

            if (subscribersSelectAll) {
                subscribersSelectAll.checked = false;

                subscribersSelectAll.indeterminate = false;
            }

            // =========================================
            // UPDATE SUBSCRIBER UI
            // =========================================

            renderSubscribers(subscribers);

            // =========================================
            // CLOSE AFTER SUCCESS
            // =========================================

            setTimeout(() => {
                closePromotionModal();
            }, 1200);
        } catch (error) {
            console.error("SEND PROMOTION ERROR:", error);

            if (promotionMessageStatus) {
                promotionMessageStatus.textContent = error.message || "Unable to send promotion.";

                promotionMessageStatus.hidden = false;
            }
        } finally {
            // =========================================
            // RESTORE BUTTON
            // =========================================

            if (promotionSubmitButton) {
                promotionSubmitButton.disabled = false;

                promotionSubmitButton.innerHTML = originalButtonHTML;
            }
        }
    });

    // =====================================================
    // CLICK OUTSIDE MODAL
    // =====================================================

    promotionModal?.addEventListener("click", (event) => {
        if (event.target === promotionModal) {
            closePromotionModal();
        }
    });

    // =====================================================
    // ESCAPE KEY
    // =====================================================

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && promotionModal && !promotionModal.hidden) {
            closePromotionModal();
        }
    });
    let canCreateDiscounts = false;

    let canEditDiscounts = false;

    let canSendSubscriberEmails = false;

    let editingDiscountId = null;

    let pendingDeleteDiscountId = null;

    // =====================================================
    // TAB SWITCHING
    // =====================================================

    function showSubscribersTab() {
        if (subscribersPanel) {
            subscribersPanel.hidden = false;
        }

        if (discountsPanel) {
            discountsPanel.hidden = true;
        }

        subscribersTab?.classList.add("active");

        discountsTab?.classList.remove("active");
    }

    function showDiscountsTab() {
        if (subscribersPanel) {
            subscribersPanel.hidden = true;
        }

        if (discountsPanel) {
            discountsPanel.hidden = false;
        }

        subscribersTab?.classList.remove("active");

        discountsTab?.classList.add("active");
    }

    subscribersTab?.addEventListener("click", showSubscribersTab);

    discountsTab?.addEventListener("click", showDiscountsTab);

    // =====================================================
    // SUBSCRIBER SELECTION / RENDERING
    // =====================================================

    function updatePromotionButton() {
        if (!sendPromotionButton) {
            return;
        }

        sendPromotionButton.hidden = !canSendSubscriberEmails || selectedSubscriberIds.size === 0;
    }

    function updateSubscriberCounts() {
        if (totalSubscriberCount) {
            totalSubscriberCount.textContent = String(subscribers.length);
        }

        if (activeSubscriberCount) {
            const activeCount = subscribers.filter((subscriber) => subscriber.is_active === true).length;

            activeSubscriberCount.textContent = String(activeCount);
        }
    }

    function updateSelectAllState() {
        if (!subscribersSelectAll || !subscribersTableBody) {
            return;
        }

        const visibleCheckboxes = Array.from(subscribersTableBody.querySelectorAll(".mtc-admin-subscriber-select"));

        if (visibleCheckboxes.length === 0) {
            subscribersSelectAll.checked = false;
            subscribersSelectAll.indeterminate = false;
            subscribersSelectAll.disabled = true;
            return;
        }

        subscribersSelectAll.disabled = false;

        const checkedCount = visibleCheckboxes.filter((checkbox) => checkbox.checked).length;

        subscribersSelectAll.checked = checkedCount === visibleCheckboxes.length;

        subscribersSelectAll.indeterminate = checkedCount > 0 && checkedCount < visibleCheckboxes.length;
    }

    function renderSubscribers(subscribersToRender) {
        if (!subscribersTableBody) {
            return;
        }

        subscribersTableBody.replaceChildren();

        if (!Array.isArray(subscribersToRender) || subscribersToRender.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 4;
            cell.textContent = "No subscribers found.";
            cell.classList.add("mtc-admin-subscribers-loading-cell");

            row.appendChild(cell);
            subscribersTableBody.appendChild(row);

            updateSelectAllState();
            updatePromotionButton();
            return;
        }

        subscribersToRender.forEach((subscriber) => {
            const row = document.createElement("tr");
            const subscriberId = String(subscriber.id || "");

            const selectCell = document.createElement("td");

            const selectCheckbox = document.createElement("input");

            selectCheckbox.type = "checkbox";
            selectCheckbox.classList.add("mtc-admin-subscriber-select");
            selectCheckbox.dataset.subscriberId = subscriberId;
            selectCheckbox.dataset.subscriberEmail = subscriber.email || "";
            selectCheckbox.checked = selectedSubscriberIds.has(subscriberId);
            selectCheckbox.setAttribute("aria-label", `Select ${subscriber.email || "subscriber"}`);

            selectCheckbox.addEventListener("change", () => {
                if (!subscriberId) {
                    selectCheckbox.checked = false;
                    return;
                }

                if (selectCheckbox.checked) {
                    selectedSubscriberIds.add(subscriberId);
                } else {
                    selectedSubscriberIds.delete(subscriberId);
                }

                updateSelectAllState();
                updatePromotionButton();
            });

            selectCell.appendChild(selectCheckbox);

            const emailCell = document.createElement("td");
            emailCell.textContent = subscriber.email || "—";

            const statusCell = document.createElement("td");
            const statusBadge = document.createElement("span");
            const isActive = subscriber.is_active === true;

            statusBadge.classList.add("mtc-admin-subscribers-status", isActive ? "active" : "inactive");
            statusBadge.textContent = isActive ? "Active" : "Inactive";
            statusCell.appendChild(statusBadge);

            const dateCell = document.createElement("td");

            if (subscriber.subscribed_at) {
                const subscribedDate = new Date(subscriber.subscribed_at);

                dateCell.textContent = Number.isNaN(subscribedDate.getTime())
                    ? "—"
                    : subscribedDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                      });
            } else {
                dateCell.textContent = "—";
            }

            row.append(selectCell, emailCell, statusCell, dateCell);

            subscribersTableBody.appendChild(row);
        });

        updateSelectAllState();
        updatePromotionButton();
    }

    subscribersSelectAll?.addEventListener("change", () => {
        const visibleCheckboxes = subscribersTableBody?.querySelectorAll(".mtc-admin-subscriber-select") || [];

        visibleCheckboxes.forEach((checkbox) => {
            checkbox.checked = subscribersSelectAll.checked;

            const subscriberId = String(checkbox.dataset.subscriberId || "");

            if (!subscriberId) {
                return;
            }

            if (subscribersSelectAll.checked) {
                selectedSubscriberIds.add(subscriberId);
            } else {
                selectedSubscriberIds.delete(subscriberId);
            }
        });

        updateSelectAllState();
        updatePromotionButton();
    });

    // =====================================================
    // LOAD SUBSCRIBERS
    // =====================================================

    async function loadSubscribers() {
        if (!subscribersTableBody) {
            return;
        }

        try {
            const { data: sessionData } = await adminSupabase.auth.getSession();

            const accessToken = sessionData?.session?.access_token;

            if (!accessToken) {
                return;
            }

            const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-subscribers", {
                method: "GET",

                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            let result = null;

            try {
                result = await response.json();
            } catch {
                result = null;
            }

            if (!response.ok || result?.success !== true) {
                throw new Error(result?.error || "Unable to load subscribers.");
            }

            subscribers = Array.isArray(result.subscribers) ? result.subscribers : [];

            const validSubscriberIds = new Set(subscribers.map((subscriber) => String(subscriber.id || "")));

            selectedSubscriberIds = new Set(
                Array.from(selectedSubscriberIds).filter((subscriberId) => validSubscriberIds.has(subscriberId))
            );

            updateSubscriberCounts();

            renderSubscribers(subscribers);
        } catch (error) {
            console.error("LOAD SUBSCRIBERS ERROR:", error);

            subscribersTableBody.replaceChildren();

            const row = document.createElement("tr");

            const cell = document.createElement("td");

            cell.colSpan = 4;

            cell.textContent = "Unable to load subscribers.";

            row.appendChild(cell);

            subscribersTableBody.appendChild(row);
        }
    }

    // =====================================================
    // SUBSCRIBER SEARCH
    // =====================================================

    subscribersSearchInput?.addEventListener("input", () => {
        const searchValue = subscribersSearchInput.value.trim().toLowerCase();

        const filtered = subscribers.filter((subscriber) => {
            const email = String(subscriber.email || "").toLowerCase();

            const status = subscriber.is_active ? "active" : "inactive";

            return email.includes(searchValue) || status.includes(searchValue);
        });

        renderSubscribers(filtered);
    });

    // =====================================================
    // RENDER DISCOUNTS
    // XSS SAFE - NO DATABASE HTML INSERTION
    // =====================================================

    function renderDiscounts(discountsToRender) {
        if (!discountsTableBody) {
            return;
        }

        discountsTableBody.replaceChildren();

        if (!Array.isArray(discountsToRender) || discountsToRender.length === 0) {
            const row = document.createElement("tr");

            const cell = document.createElement("td");

            cell.colSpan = 7;

            cell.textContent = "No discounts found.";

            row.appendChild(cell);

            discountsTableBody.appendChild(row);

            if (discountCount) {
                discountCount.textContent = "0";
            }

            return;
        }

        discountsToRender.forEach((discount) => {
            const row = document.createElement("tr");

            // CODE

            const codeCell = document.createElement("td");

            codeCell.textContent = discount.code || "—";

            // DISCOUNT

            const discountCell = document.createElement("td");

            const discountValue = Number(discount.discount_value);

            if (discount.discount_type === "percentage") {
                discountCell.textContent = `${discountValue}%`;
            } else {
                discountCell.textContent = discountValue.toLocaleString("en-US", {
                    style: "currency",

                    currency: "USD",
                });
            }

            // MINIMUM

            const minimumCell = document.createElement("td");

            if (discount.minimum_order_amount === null || discount.minimum_order_amount === undefined) {
                minimumCell.textContent = "None";
            } else {
                minimumCell.textContent = Number(discount.minimum_order_amount).toLocaleString("en-US", {
                    style: "currency",

                    currency: "USD",
                });
            }

            // USAGE

            const usageCell = document.createElement("td");

            const timesUsed = Number(discount.times_used || 0);

            if (discount.usage_limit === null || discount.usage_limit === undefined) {
                usageCell.textContent = `${timesUsed} / Unlimited`;
            } else {
                usageCell.textContent = `${timesUsed} / ${discount.usage_limit}`;
            }

            // EXPIRES

            const expiresCell = document.createElement("td");

            if (discount.expires_at) {
                const expirationDate = new Date(discount.expires_at);

                expiresCell.textContent = Number.isNaN(expirationDate.getTime())
                    ? "—"
                    : expirationDate.toLocaleDateString("en-US");
            } else {
                expiresCell.textContent = "Never";
            }

            // STATUS

            const statusCell = document.createElement("td");

            const statusBadge = document.createElement("span");

            statusBadge.className = discount.is_active
                ? "mtc-admin-subscribers-status active"
                : "mtc-admin-subscribers-status inactive";

            statusBadge.textContent = discount.is_active ? "Active" : "Inactive";

            statusCell.appendChild(statusBadge);

            // ACTIONS
            // Edit/Delete comes next.

            // =====================================
            // ACTIONS
            // =====================================

            const actionsCell = document.createElement("td");

            if (canEditDiscounts) {
                const updateButton = document.createElement("button");

                updateButton.type = "button";

                updateButton.className = "mtc-admin-discount-update-button";

                updateButton.dataset.discountId = String(discount.id || "");

                const updateIcon = document.createElement("i");

                updateIcon.className = "fa-solid fa-pen";

                const updateText = document.createElement("span");

                updateText.textContent = "Update";

                updateButton.append(updateIcon, updateText);

                actionsCell.appendChild(updateButton);
            } else {
                actionsCell.textContent = "—";
            }

            row.append(codeCell, discountCell, minimumCell, usageCell, expiresCell, statusCell, actionsCell);

            discountsTableBody.appendChild(row);
        });

        if (discountCount) {
            discountCount.textContent = String(discounts.length);
        }
    }

    // =====================================================
    // DISCOUNT SEARCH
    // =====================================================

    discountsSearchInput?.addEventListener("input", () => {
        const searchValue = discountsSearchInput.value.trim().toLowerCase();

        const filtered = discounts.filter((discount) => {
            const code = String(discount.code || "").toLowerCase();

            const type = String(discount.discount_type || "").toLowerCase();

            const status = discount.is_active ? "active" : "inactive";

            return code.includes(searchValue) || type.includes(searchValue) || status.includes(searchValue);
        });

        renderDiscounts(filtered);
    });

    // =====================================================
    // LOAD DISCOUNTS FROM SECURE BACKEND
    // =====================================================

    async function loadDiscounts() {
        if (!discountsTableBody) {
            return;
        }

        try {
            // =========================================
            // GET CURRENT ADMIN SESSION
            // =========================================

            const { data: sessionData, error: sessionError } = await adminSupabase.auth.getSession();

            const accessToken = sessionData?.session?.access_token;

            if (sessionError || !accessToken) {
                throw new Error("Admin session is unavailable.");
            }

            // =========================================
            // GET SAVED DISCOUNTS FROM BACKEND
            // =========================================

            const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-discounts", {
                method: "GET",

                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            let result = null;

            try {
                result = await response.json();
            } catch {
                throw new Error("Invalid response from server.");
            }

            // =========================================
            // CHECK RESPONSE
            // =========================================

            if (!response.ok || result?.success !== true) {
                throw new Error(result?.error || "Unable to load discounts.");
            }

            // =========================================
            // SAVE DISCOUNTS
            // =========================================

            discounts = Array.isArray(result.discounts) ? result.discounts : [];

            // =========================================
            // DISPLAY DISCOUNTS
            // =========================================

            renderDiscounts(discounts);
        } catch (error) {
            console.error("LOAD DISCOUNTS ERROR:", error);

            discounts = [];

            renderDiscounts(discounts);
        }
    }

    // =====================================================
    // CHECK DISCOUNT PERMISSIONS
    // =====================================================

    async function loadDiscountPermissions() {
        try {
            const { data: sessionData } = await adminSupabase.auth.getSession();

            const accessToken = sessionData?.session?.access_token;

            if (!accessToken) {
                canCreateDiscounts = false;
                canEditDiscounts = false;
                canSendSubscriberEmails = false;

                return;
            }

            const permissionHeaders = {
                Authorization: `Bearer ${accessToken}`,
            };

            const [createResponse, editResponse, sendEmailResponse] = await Promise.all([
                fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=discounts.create", {
                    headers: permissionHeaders,
                }),

                fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=discounts.edit", {
                    headers: permissionHeaders,
                }),

                fetch("https://mtc-backend-node-production.up.railway.app/admin-permission/check?permission=subscriptions.send_email", {
                    headers: permissionHeaders,
                }),
            ]);

            const [createResult, editResult, sendEmailResult] = await Promise.all([
                createResponse.json(),

                editResponse.json(),

                sendEmailResponse.json(),
            ]);

            canCreateDiscounts = createResponse.ok && createResult?.allowed === true;

            canEditDiscounts = editResponse.ok && editResult?.allowed === true;

            canSendSubscriberEmails = sendEmailResponse.ok && sendEmailResult?.allowed === true;
        } catch (error) {
            console.error("DISCOUNT PERMISSION ERROR:", error);

            canCreateDiscounts = false;

            canEditDiscounts = false;

            canSendSubscriberEmails = false;
        }

        if (createDiscountButton) {
            createDiscountButton.style.display = canCreateDiscounts ? "" : "none";
        }

        renderDiscounts(discounts);

        updatePromotionButton();
    }

    // =====================================================
    // DISCOUNT MESSAGE
    // =====================================================

    function showDiscountMessage(message, isError = false) {
        if (!discountMessage) {
            return;
        }

        discountMessage.hidden = false;

        discountMessage.textContent = message;

        discountMessage.classList.toggle("error", isError);

        discountMessage.classList.toggle("success", !isError);
    }

    function clearDiscountMessage() {
        if (!discountMessage) {
            return;
        }

        discountMessage.hidden = true;

        discountMessage.textContent = "";

        discountMessage.classList.remove("error", "success");
    }

    // =====================================================
    // OPEN CREATE DISCOUNT MODAL
    // =====================================================

    function openDiscountModal() {
        if (!discountModal || !canCreateDiscounts) {
            return;
        }

        clearDiscountMessage();

        discountModal.hidden = false;

        document.body.style.overflow = "hidden";

        requestAnimationFrame(() => {
            discountCodeInput?.focus();
        });
    }

    // =====================================================
    // CLOSE CREATE DISCOUNT MODAL
    // =====================================================

    function closeDiscountModal() {
        if (!discountModal) {
            return;
        }

        discountModal.hidden = true;

        document.body.style.overflow = "";

        discountForm?.reset();

        clearDiscountMessage();

        if (discountActiveInput) {
            discountActiveInput.checked = true;
        }

        createDiscountButton?.focus();
    }

    createDiscountButton?.addEventListener("click", openDiscountModal);

    discountModalCloseButton?.addEventListener("click", closeDiscountModal);

    discountCancelButton?.addEventListener("click", closeDiscountModal);

    discountModal?.addEventListener("click", (event) => {
        if (event.target === discountModal) {
            closeDiscountModal();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && discountModal && !discountModal.hidden) {
            closeDiscountModal();
        }
    });

    // =====================================================
    // CREATE DISCOUNT
    // =====================================================

    discountForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!canCreateDiscounts) {
            showDiscountMessage("You do not have permission to create discounts.", true);

            return;
        }

        clearDiscountMessage();

        // =========================================
        // GET AUTH TOKEN
        // =========================================

        const { data: sessionData } = await adminSupabase.auth.getSession();

        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) {
            showDiscountMessage("Your admin session has expired. Please log in again.", true);

            return;
        }

        // =========================================
        // CLIENT-SIDE VALUES
        // Server validates them again.
        // =========================================

        const code = discountCodeInput?.value.trim().toUpperCase() || "";

        const discountType = discountTypeInput?.value || "";

        const discountValue = discountValueInput?.value || "";

        const minimumOrderAmount = discountMinimumInput?.value.trim() || "";

        const usageLimit = discountUsageLimitInput?.value.trim() || "";

        const startsAtValue = discountStartsAtInput?.value || "";

        const expiresAtValue = discountExpiresAtInput?.value || "";

        // =========================================
        // BASIC FRONTEND VALIDATION
        // =========================================

        if (!code) {
            showDiscountMessage("Enter a discount code.", true);

            discountCodeInput?.focus();

            return;
        }

        if (!discountType || !discountValue) {
            showDiscountMessage("Choose a discount type and enter a value.", true);

            return;
        }

        // =========================================
        // DATE CONVERSION
        // =========================================

        let startsAt = null;

        let expiresAt = null;

        if (startsAtValue) {
            const date = new Date(startsAtValue);

            if (Number.isNaN(date.getTime())) {
                showDiscountMessage("Invalid start date.", true);

                return;
            }

            startsAt = date.toISOString();
        }

        if (expiresAtValue) {
            const date = new Date(expiresAtValue);

            if (Number.isNaN(date.getTime())) {
                showDiscountMessage("Invalid expiration date.", true);

                return;
            }

            expiresAt = date.toISOString();
        }

        // =========================================
        // DISABLE BUTTON DURING REQUEST
        // =========================================

        if (discountSubmitButton) {
            discountSubmitButton.disabled = true;

            discountSubmitButton.textContent = "Creating...";
        }

        try {
            // =====================================
            // SECURE BACKEND REQUEST
            // =====================================

            const response = await fetch("https://mtc-backend-node-production.up.railway.app/admin-discounts", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    Authorization: `Bearer ${accessToken}`,
                },

                body: JSON.stringify({
                    code: code,

                    discountType: discountType,

                    discountValue: discountValue,

                    minimumOrderAmount: minimumOrderAmount,

                    usageLimit: usageLimit,

                    startsAt: startsAt,

                    expiresAt: expiresAt,

                    isActive: discountActiveInput?.checked !== false,
                }),
            });

            let result = null;

            try {
                result = await response.json();
            } catch {
                result = null;
            }

            if (!response.ok || result?.success !== true) {
                throw new Error(result?.error || "Unable to create discount.");
            }

            // =====================================
            // ADD NEW DISCOUNT TO PAGE
            // =====================================

            if (result.discount) {
                discounts.unshift(result.discount);
            }

            renderDiscounts(discounts);

            showDiscountsTab();

            // =====================================
            // SUCCESS MESSAGE
            // =====================================

            showDiscountMessage("Discount created successfully.");

            // Briefly show success before closing.

            setTimeout(() => {
                closeDiscountModal();
            }, 700);
        } catch (error) {
            console.error("CREATE DISCOUNT ERROR:", error);

            showDiscountMessage(error.message || "Unable to create discount.", true);
        } finally {
            if (discountSubmitButton) {
                discountSubmitButton.disabled = false;

                discountSubmitButton.textContent = "Create Discount";
            }
        }
    });

    // =====================================================
    // UPDATE DISCOUNT HELPERS
    // =====================================================

    function toDateTimeLocalValue(value) {
        if (!value) {
            return "";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        const timezoneOffset = date.getTimezoneOffset();

        const localDate = new Date(date.getTime() - timezoneOffset * 60000);

        return localDate.toISOString().slice(0, 16);
    }

    function showUpdateDiscountMessage(message, isError = false) {
        if (!updateDiscountMessage) {
            return;
        }

        updateDiscountMessage.hidden = false;

        updateDiscountMessage.textContent = message;

        updateDiscountMessage.classList.toggle("error", isError);

        updateDiscountMessage.classList.toggle("success", !isError);
    }

    function clearUpdateDiscountMessage() {
        if (!updateDiscountMessage) {
            return;
        }

        updateDiscountMessage.hidden = true;

        updateDiscountMessage.textContent = "";

        updateDiscountMessage.classList.remove("error", "success");
    }

    // =====================================================
    // OPEN UPDATE DISCOUNT
    // =====================================================

    function openUpdateDiscountModal(discount) {
        if (!updateDiscountModal || !discount) {
            return;
        }

        editingDiscountId = String(discount.id);

        clearUpdateDiscountMessage();

        if (updateDiscountCodeInput) {
            updateDiscountCodeInput.value = discount.code || "";
        }

        if (updateDiscountTypeInput) {
            updateDiscountTypeInput.value = discount.discount_type || "percentage";
        }

        if (updateDiscountValueInput) {
            updateDiscountValueInput.value = discount.discount_value ?? "";
        }

        if (updateDiscountMinimumInput) {
            updateDiscountMinimumInput.value = discount.minimum_order_amount ?? "";
        }

        if (updateDiscountUsageLimitInput) {
            updateDiscountUsageLimitInput.value = discount.usage_limit ?? "";
        }

        if (updateDiscountStartsAtInput) {
            updateDiscountStartsAtInput.value = toDateTimeLocalValue(discount.starts_at);
        }

        if (updateDiscountExpiresAtInput) {
            updateDiscountExpiresAtInput.value = toDateTimeLocalValue(discount.expires_at);
        }

        if (updateDiscountActiveInput) {
            updateDiscountActiveInput.checked = discount.is_active === true;
        }

        // =========================================
        // DELETE PERMISSION
        // =========================================

        if (updateDiscountDeleteButton) {
            updateDiscountDeleteButton.style.display = canEditDiscounts ? "" : "none";
        }

        updateDiscountModal.hidden = false;

        document.body.style.overflow = "hidden";

        requestAnimationFrame(() => {
            updateDiscountCodeInput?.focus();
        });
    }

    // =====================================================
    // CLOSE UPDATE DISCOUNT
    // =====================================================

    function closeUpdateDiscountModal() {
        if (!updateDiscountModal) {
            return;
        }

        updateDiscountModal.hidden = true;

        editingDiscountId = null;

        updateDiscountForm?.reset();

        clearUpdateDiscountMessage();

        if (!discountDeleteModal || discountDeleteModal.hidden) {
            document.body.style.overflow = "";
        }
    }

    // =====================================================
    // CLICK UPDATE BUTTON IN TABLE
    // =====================================================

    discountsTableBody?.addEventListener("click", (event) => {
        const updateButton = event.target.closest(".mtc-admin-discount-update-button");

        if (!updateButton) {
            return;
        }

        const discountId = updateButton.dataset.discountId;

        const discount = discounts.find((item) => String(item.id) === String(discountId));

        if (!discount) {
            console.error("DISCOUNT NOT FOUND:", discountId);

            return;
        }

        openUpdateDiscountModal(discount);
    });

    updateDiscountCloseButton?.addEventListener("click", closeUpdateDiscountModal);

    updateDiscountModal?.addEventListener("click", (event) => {
        if (event.target === updateDiscountModal) {
            closeUpdateDiscountModal();
        }
    });

    // =====================================================
    // SAVE UPDATED DISCOUNT
    // =====================================================

    updateDiscountForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!canEditDiscounts || !editingDiscountId) {
            showUpdateDiscountMessage("You do not have permission to update discounts.", true);

            return;
        }

        clearUpdateDiscountMessage();

        const { data: sessionData } = await adminSupabase.auth.getSession();

        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) {
            showUpdateDiscountMessage("Your admin session has expired. Please log in again.", true);

            return;
        }

        const code = updateDiscountCodeInput?.value.trim().toUpperCase() || "";

        const discountType = updateDiscountTypeInput?.value || "";

        const discountValue = updateDiscountValueInput?.value || "";

        const minimumOrderAmount = updateDiscountMinimumInput?.value.trim() || "";

        const usageLimit = updateDiscountUsageLimitInput?.value.trim() || "";

        const startsAtValue = updateDiscountStartsAtInput?.value || "";

        const expiresAtValue = updateDiscountExpiresAtInput?.value || "";

        if (!code) {
            showUpdateDiscountMessage("Enter a discount code.", true);

            updateDiscountCodeInput?.focus();

            return;
        }

        if (!discountType || !discountValue) {
            showUpdateDiscountMessage("Choose a discount type and enter a value.", true);

            return;
        }

        let startsAt = null;

        let expiresAt = null;

        if (startsAtValue) {
            const startDate = new Date(startsAtValue);

            if (Number.isNaN(startDate.getTime())) {
                showUpdateDiscountMessage("Invalid start date.", true);

                return;
            }

            startsAt = startDate.toISOString();
        }

        if (expiresAtValue) {
            const expirationDate = new Date(expiresAtValue);

            if (Number.isNaN(expirationDate.getTime())) {
                showUpdateDiscountMessage("Invalid expiration date.", true);

                return;
            }

            expiresAt = expirationDate.toISOString();
        }

        if (updateDiscountSubmitButton) {
            updateDiscountSubmitButton.disabled = true;

            updateDiscountSubmitButton.textContent = "Updating...";
        }

        try {
            const response = await fetch(
                `https://mtc-backend-node-production.up.railway.app/admin-discounts/${encodeURIComponent(editingDiscountId)}`,
                {
                    method: "PATCH",

                    headers: {
                        "Content-Type": "application/json",

                        Authorization: `Bearer ${accessToken}`,
                    },

                    body: JSON.stringify({
                        code: code,

                        discountType: discountType,

                        discountValue: discountValue,

                        minimumOrderAmount: minimumOrderAmount,

                        usageLimit: usageLimit,

                        startsAt: startsAt,

                        expiresAt: expiresAt,

                        isActive: updateDiscountActiveInput?.checked === true,
                    }),
                }
            );

            let result = null;

            try {
                result = await response.json();
            } catch {
                result = null;
            }

            if (!response.ok || result?.success !== true) {
                throw new Error(result?.error || "Unable to update discount.");
            }

            if (result.discount) {
                const discountIndex = discounts.findIndex((item) => String(item.id) === String(editingDiscountId));

                if (discountIndex !== -1) {
                    discounts[discountIndex] = result.discount;
                }
            }

            renderDiscounts(discounts);

            showUpdateDiscountMessage("Discount updated successfully.");

            setTimeout(() => {
                closeUpdateDiscountModal();
            }, 700);
        } catch (error) {
            console.error("UPDATE DISCOUNT ERROR:", error);

            showUpdateDiscountMessage(error.message || "Unable to update discount.", true);
        } finally {
            if (updateDiscountSubmitButton) {
                updateDiscountSubmitButton.disabled = false;

                updateDiscountSubmitButton.textContent = "Update";
            }
        }
    });

    // =====================================================
    // DELETE DISCOUNT MESSAGE
    // =====================================================

    function showDeleteDiscountMessage(message, isError = false) {
        if (!discountDeleteMessage) {
            return;
        }

        discountDeleteMessage.hidden = false;

        discountDeleteMessage.textContent = message;

        discountDeleteMessage.classList.toggle("error", isError);

        discountDeleteMessage.classList.toggle("success", !isError);
    }

    function clearDeleteDiscountMessage() {
        if (!discountDeleteMessage) {
            return;
        }

        discountDeleteMessage.hidden = true;

        discountDeleteMessage.textContent = "";

        discountDeleteMessage.classList.remove("error", "success");
    }

    // =====================================================
    // OPEN DELETE CONFIRMATION
    // =====================================================

    updateDiscountDeleteButton?.addEventListener("click", () => {
        if (!canEditDiscounts || !editingDiscountId) {
            return;
        }

        const discount = discounts.find((item) => String(item.id) === String(editingDiscountId));

        if (!discount) {
            return;
        }

        pendingDeleteDiscountId = String(discount.id);

        clearDeleteDiscountMessage();

        if (discountDeleteCode) {
            discountDeleteCode.textContent = discount.code || "";
        }

        if (discountDeleteModal) {
            discountDeleteModal.hidden = false;
        }

        document.body.style.overflow = "hidden";
    });

    // =====================================================
    // CLOSE DELETE CONFIRMATION
    // =====================================================

    function closeDeleteDiscountModal() {
        if (!discountDeleteModal) {
            return;
        }

        discountDeleteModal.hidden = true;

        pendingDeleteDiscountId = null;

        clearDeleteDiscountMessage();

        if (!updateDiscountModal || updateDiscountModal.hidden) {
            document.body.style.overflow = "";
        }
    }

    discountDeleteCloseButton?.addEventListener("click", closeDeleteDiscountModal);

    discountDeleteModal?.addEventListener("click", (event) => {
        if (event.target === discountDeleteModal) {
            closeDeleteDiscountModal();
        }
    });

    // =====================================================
    // CONFIRM DELETE DISCOUNT
    // =====================================================

    discountDeleteConfirmButton?.addEventListener("click", async () => {
        if (!canEditDiscounts || !pendingDeleteDiscountId) {
            showDeleteDiscountMessage("You do not have permission to delete discounts.", true);

            return;
        }

        const discountId = pendingDeleteDiscountId;

        const { data: sessionData } = await adminSupabase.auth.getSession();

        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) {
            showDeleteDiscountMessage("Your admin session has expired. Please log in again.", true);

            return;
        }

        if (discountDeleteConfirmButton) {
            discountDeleteConfirmButton.disabled = true;

            discountDeleteConfirmButton.textContent = "Deleting...";
        }

        try {
            const response = await fetch(`https://mtc-backend-node-production.up.railway.app/admin-discounts/${encodeURIComponent(discountId)}`, {
                method: "DELETE",

                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            let result = null;

            try {
                result = await response.json();
            } catch {
                result = null;
            }

            if (!response.ok || result?.success !== true) {
                throw new Error(result?.error || "Unable to delete discount.");
            }

            discounts = discounts.filter((item) => String(item.id) !== String(discountId));

            renderDiscounts(discounts);

            closeDeleteDiscountModal();

            closeUpdateDiscountModal();
        } catch (error) {
            console.error("DELETE DISCOUNT ERROR:", error);

            showDeleteDiscountMessage(error.message || "Unable to delete discount.", true);
        } finally {
            if (discountDeleteConfirmButton) {
                discountDeleteConfirmButton.disabled = false;

                discountDeleteConfirmButton.textContent = "Delete";
            }
        }
    });

    // =====================================================
    // ESCAPE KEY
    // =====================================================

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        if (discountDeleteModal && !discountDeleteModal.hidden) {
            closeDeleteDiscountModal();

            return;
        }

        if (updateDiscountModal && !updateDiscountModal.hidden) {
            closeUpdateDiscountModal();
        }
    });

    // =====================================================
    // INITIAL LOAD
    // =====================================================

    showSubscribersTab();

    await loadDiscountPermissions();

    await loadSubscribers();

    await loadDiscounts();
}); // CLOSE SUBSCRIBERS DOMContentLoaded
// =========================================================
// END OF MTC-ADMIN-SUBSCRIBERS JS
// =========================================================

/* =====================================================
   GLOBAL FOR ALL ADMIN SIDEBAR - CLOSE ON OUTSIDE CLICK
===================================================== */

document.addEventListener("click", (event) => {
    const sidebar = document.querySelector(".mw-dashboard-sidebar");

    if (!sidebar) {
        return;
    }

    const clickedInsideSidebar = sidebar.contains(event.target);

    const clickedMenuButton = event.target.closest(
        `
            .mw-dashboard-mobile-toggle,
            .mtc-admin-products-menu-button,
            .mtc-admin-orders-menu-button,
            .mtc-admin-categories-menu-button,
            .mtc-admin-events-menu-button,
            .mtc-admin-settings-menu-button,
            .mtc-admin-reviews-menu-button,
            .mtc-admin-messages-menu-button,
            .mtc-admin-shipping-menu-button,
            #mtcAdminShippingMenuButton
            `
    );

        if (!clickedInsideSidebar && !clickedMenuButton) {
        sidebar.classList.remove("sidebar-open");

        sidebar.classList.remove("mw-dashboard-sidebar-open");
    }
});
/* =========================================
   GLOBAL ADMIN PAGE NAVIGATION TRANSITION
========================================= */

document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");

    if (!link) {
        return;
    }

    // Allow Ctrl/Cmd/Shift/Alt clicks normally
    if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
    ) {
        return;
    }

    // Ignore links that open another tab/window
    if (link.target === "_blank") {
        return;
    }

    // Ignore downloads
    if (link.hasAttribute("download")) {
        return;
    }

    const href = link.getAttribute("href");

    if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:")
    ) {
        return;
    }

    const destination = new URL(href, window.location.href);

    // Only transition between MTC admin HTML pages
    if (
        destination.origin !== window.location.origin ||
        !destination.pathname.includes("mtc-admin-") ||
        !destination.pathname.endsWith(".html")
    ) {
        return;
    }

    event.preventDefault();

    document.body.classList.add("mtc-admin-page-leaving");

    setTimeout(() => {
        window.location.href = destination.href;
    }, 220);
});
    
