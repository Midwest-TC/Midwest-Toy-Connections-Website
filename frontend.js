/* =========================================================
   MIDWEST TOY CONNECTIONS
   SUPABASE / SHOP / PRODUCTS / VARIANTS / FILTERS / CART
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
    /* =====================================================
       SUPABASE
    ===================================================== */
    const SUPABASE_URL = "https://ujwelweqqjyzknssqgtn.supabase.co";
    const SUPABASE_ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqd2Vsd2VxcWp5emtuc3NxZ3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxOTQwNDgsImV4cCI6MjEwMjc3MDA0OH0.oqVIrfixxHzukjYSAB8VP8pprSL8wCq21MmqdiyyvTM";
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    /* =====================================================
       PAGE ELEMENTS
    ===================================================== */
    const storeReviewStarSelector = document.getElementById("store-review-star-selector");
    const storeReviewRating = document.getElementById("store-review-rating");
    const storeReviewStars =
        storeReviewStarSelector
            ? storeReviewStarSelector.querySelectorAll("button")
            : [];

    if (storeReviewStarSelector && storeReviewRating) {

    storeReviewStars.forEach((button) => {
        button.addEventListener("click", () => {
            const rating = Number(button.dataset.rating);

            storeReviewRating.value = rating;

            storeReviewStars.forEach((starButton) => {
                const starRating = Number(starButton.dataset.rating);
                const icon = starButton.querySelector("i");

                if (starRating <= rating) {
                    icon.className = "fa-solid fa-star";
                } else {
                    icon.className = "fa-regular fa-star";
                }
            });
        });
    });
}
    const storeReviewForm = document.getElementById("store-review-form");
    const storeReviewName = document.getElementById("store-review-name");
    const storeReviewEmail = document.getElementById("store-review-email");
    const storeReviewTitle = document.getElementById("store-review-title");
    const storeReviewComment = document.getElementById("store-review-comment");
    const storeReviewSubmitButton = document.getElementById("store-review-submit-button");
    const storeReviewSubmitResult = document.getElementById("store-review-submit-result");
    const storeReviewsList = document.getElementById("store-reviews-list");
    const storeReviewsPagination = document.getElementById("store-reviews-pagination");
    const storeReviewsEmpty = document.getElementById("store-reviews-empty");
    const storeReviewsAverageRating = document.getElementById("store-reviews-average-rating");
    const storeReviewsAverageStars = document.getElementById("store-reviews-average-stars");
    const storeReviewsCount = document.getElementById("store-reviews-count");
    
    if (storeReviewForm) {
    storeReviewForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const rating = Number(storeReviewRating.value);

        if (!rating || rating < 1 || rating > 5) {
            storeReviewSubmitResult.textContent =
                "Please select a star rating.";
            return;
        }

        const reviewData = {
            customerName: storeReviewName.value.trim(),
            customerEmail: storeReviewEmail.value.trim(),
            rating: rating,
            title: storeReviewTitle.value.trim(),
            comment: storeReviewComment.value.trim()
        };

        const response = await fetch(
    "https://mtc-backend-node-production.up.railway.app/submit-store-review",
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(reviewData)
    }
);

const result = await response.json();

console.log("STORE REVIEW RESPONSE:", result);
if (!response.ok) {
    storeReviewSubmitResult.textContent =
        result.error || "Unable to submit review.";
    return;
}

storeReviewSubmitResult.textContent =
    result.message || "Your review has been submitted and is awaiting approval.";
storeReviewForm.reset();

storeReviewStars.forEach((starButton) => {
    const icon = starButton.querySelector("i");
    icon.className = "fa-regular fa-star";
});

storeReviewRating.value = "";
    });
}
    
    const categoryGrid = document.querySelector(".mw-category-grid");
    const categorySort = document.getElementById("mw-category-sort");
    const storeProductGrid = document.getElementById("store-product-grid");
    const storeResultsCount = document.getElementById("store-results-count");
    const productSearch = document.getElementById("product-search");
    const categoryFilter = document.getElementById("category-filter");
    const priceFilter = document.getElementById("price-filter");
    const availabilityFilter = document.getElementById("availability-filter");
    const sortProductsSelect = document.getElementById("sort-products");
    const clearStoreFilters = document.getElementById("clear-store-filters");
    const clearStoreFiltersEmpty = document.getElementById("clear-store-filters-empty");
    const storeNoResults = document.getElementById("store-no-results");

    /* =====================================================
    STATE
    ===================================================== */
    let categories = [];
    let products = [];
    let variants = [];
    let productImages = [];
    let productReviews = [];
    let inventory = [];
    let selectedCategory = "all";
    let selectedSort = "featured";
    let selectedSearch = new URLSearchParams(window.location.search).get("search")?.trim() || "";

    let selectedPrice = "all";
    let selectedAvailability = "all";
    if (productSearch && selectedSearch) {
        productSearch.value = selectedSearch;
    }
/* =====================================================
   ESCAPE HTML
===================================================== */
function escapeHTML(value) {
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

/* =====================================================
   SAFE URL
===================================================== */
function safeURL(value) {
    if (!value) {
        return "";
    }

    try {
        const url = new URL(
            String(value),
            window.location.origin
        );

        if (
            url.protocol !== "http:" &&
            url.protocol !== "https:"
        ) {
            return "";
        }

        return url.href;
    } catch {
        return "";
    }
}

/* =====================================================
   LOAD CATEGORIES
===================================================== */
async function loadCategories() {
        const { data, error } = await supabase
            .from("Categories")
            .select(
                `
                id,
                name,
                description,
                image_url,
                is_active,
                sort_order
            `
            )
            .eq("is_active", true)
            .order("sort_order", {
                ascending: true,
            });
        if (error) {
            console.error("❌ CATEGORY ERROR:", error);
            return;
        }
        categories = data || [];
        console.log("✅ Categories loaded:", categories);
        renderShopCategories();
        populateStoreCategoryFilter();
    }

    /* =====================================================
       OLD SHOP CATEGORY BUTTONS
    ===================================================== */
    function renderShopCategories() {
        const container = document.querySelector(".mw-category-buttons");
        if (!container) {
            return;
        }
        container.innerHTML = "";
        const allButton = document.createElement("button");
        allButton.type = "button";
        allButton.className = "mw-category-button active";
        allButton.textContent = "All Items";
        allButton.dataset.category = "all";
        container.appendChild(allButton);
        categories.forEach((category) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "mw-category-button";
            button.textContent = category.name;
            button.dataset.category = category.id;
            container.appendChild(button);
        });
        attachCategoryEvents();
    }

    /* =====================================================
        OLD CATEGORY EVENTS
    ===================================================== */
    function attachCategoryEvents() {
        const buttons = document.querySelectorAll(".mw-category-button");
        buttons.forEach((button) => {
            button.addEventListener("click", () => {
                buttons.forEach((btn) => btn.classList.remove("active"));
                button.classList.add("active");
                selectedCategory = button.dataset.category;
                renderProducts();
            });
        });
    }

    /* =====================================================
        CATEGORY FILTER
    ===================================================== */
    function populateStoreCategoryFilter() {
        if (!categoryFilter) return;
        categoryFilter.innerHTML = `<option value="all">All Products</option>`;
        categories.forEach((category) => {
            const option = document.createElement("option");
            option.value = category.id;
            option.textContent = category.name;
            categoryFilter.appendChild(option);
        });
    }

    /* =====================================================
        LOAD PRODUCTS
    ===================================================== */
    async function loadProducts() {
        if (storeProductGrid) {
            storeProductGrid.innerHTML = `
                <div class="store-products-loading">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <p>Loading products...</p>
                </div>
            `;
        }
        const { data, error } = await supabase
            .from("Products")
            .select(
                `
                id,
                sku,
                product_name,
                description,
                category_id,
                condition,
                price,
                compare_at_price,
                cost,
                is_active,
                is_featured,
                is_preorder,
                weight,
                image_url,
                created_at
            `
            )
           .eq("is_active", true);

if (error) {
    console.error("❌ PRODUCT ERROR:", error);

    if (storeProductGrid) {
        storeProductGrid.replaceChildren();

        const errorBox = document.createElement("div");
        errorBox.className = "store-no-results";

        const icon = document.createElement("i");
        icon.className = "fa-solid fa-triangle-exclamation";

        const heading = document.createElement("h3");
        heading.textContent = "Unable to Load Products";

        const message = document.createElement("p");
        message.textContent = "Please try again later.";

        errorBox.append(icon, heading, message);
        storeProductGrid.appendChild(errorBox);
    }

    return;
}
        products = data || [];
        console.log("✅ PRODUCTS:", products);
        console.log("✅ PRODUCT COUNT:", products.length);
        await loadProductImages();
        await loadProductReviews();
        console.log("➡️ Starting loadVariants...");
        await loadVariants();
        console.log("➡️ Starting loadInventory...");
        await loadInventory();
        console.log("✅ VARIANTS:", variants);
        console.log("✅ INVENTORY:", inventory);
        console.log("➡️ Starting renderProducts...");
        renderProducts();
        console.log("✅ renderProducts finished");
    }

    /* =====================================================
    LOAD PRODUCT IMAGES
===================================================== */
    async function loadProductImages() {
        if (!products || products.length === 0) {
            productImages = [];
            return;
        }
        const productIds = products.map((product) => product.id);
        const { data, error } = await supabase
            .from("Product_images")
            .select(
                `
            id,
            product_id,
            image_url,
            alt_text,
            sort_order,
            is_primary
        `
            )
            .in("product_id", productIds)
            .order("sort_order", {
                ascending: true,
            });
        if (error) {
            console.error("❌ PRODUCT IMAGE ERROR:", error);
            productImages = [];
            return;
        }
        productImages = data || [];
        products = products.map((product) => {
            const images = productImages.filter((image) => String(image.product_id) === String(product.id));
            const primaryImage = images.find((image) => image.is_primary === true) || images[0];

            return {
                ...product,
                image_url: primaryImage?.image_url || product.image_url || null,
            };
        });
        console.log("✅ PRODUCT IMAGES:", productImages);
    }

    /* =====================================================
    LOAD INVENTORY
===================================================== */
    async function loadInventory() {
        if (!products || products.length === 0) {
            inventory = [];
            return;
        }
        const productIds = products.map((product) => product.id);
        const { data, error } = await supabase
            .from("Inventory")
            .select(
                `
                id,
                product_id,
                variant_id,
                quantity,
                reserved_quantity,
                low_stock_threshold,
                location
            `
            )
            .in("product_id", productIds);
        if (error) {
            console.error("❌ INVENTORY ERROR:", error);
            inventory = [];
            return;
        }
        inventory = data || [];
        console.log("✅ INVENTORY:", inventory);
    }

    /* =====================================================
    GET PRODUCT REVIEW SUMMARY
===================================================== */
    function getProductReviewSummary(productId) {
        const reviews = productReviews.filter((review) => String(review.product_id) === String(productId));
        const count = reviews.length;
        if (count === 0) {
            return {
                average: 0,
                count: 0,
            };
        }
        const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
        return {
            average: total / count,
            count,
        };
    }

    /* =====================================================
    CREATE PRODUCT CARD STARS
===================================================== */
    function createProductCardStars(rating) {
        const rounded = Math.round(Number(rating || 0));
        let html = "";
        for (let star = 1; star <= 5; star++) {
            html += star <= rounded ? `<i class="fa-solid fa-star"></i>` : `<i class="fa-regular fa-star"></i>`;
        }
        return html;
    }

let storeReviewsCurrentPage = 1;
const STORE_REVIEWS_PER_PAGE = 4;

/* =====================================================
    LOAD APPROVED STORE REVIEWS
===================================================== */
async function loadStoreReviews() {
    const { data, error } = await supabase
        .from("Reviews")
        .select(`
            id,
            customer_name,
            rating,
            title,
            comment,
            is_verified_customer,
            created_at
        `)
        .eq("review_type", "store")
        .eq("is_approved", true)
        .order("created_at", {
            ascending: false
        });

    if (error) {
        console.error("❌ STORE REVIEW ERROR:", error);
        return;
    }

console.log("✅ APPROVED STORE REVIEWS:", data);

const reviews = data || [];

let averageRating = 0;

if (reviews.length > 0) {
    const totalRating = reviews.reduce(
        (total, review) => total + Number(review.rating || 0),
        0
    );

    averageRating = totalRating / reviews.length;
}

console.log("⭐ STORE AVERAGE RATING:", averageRating);

if (storeReviewsAverageRating) {
    storeReviewsAverageRating.textContent =
        averageRating.toFixed(1);
}

if (storeReviewsAverageStars) {
    storeReviewsAverageStars.innerHTML =
        createProductCardStars(averageRating);
}

if (storeReviewsCount) {
    storeReviewsCount.textContent =
        reviews.length === 1
            ? "1 Review"
            : `${reviews.length} Reviews`;
}

renderStoreReviews(reviews);
}

function renderStoreReviews(reviews) {
    if (!storeReviewsList) {
        return;
    }

const startIndex =
    (storeReviewsCurrentPage - 1) * STORE_REVIEWS_PER_PAGE;

const endIndex =
    startIndex + STORE_REVIEWS_PER_PAGE;

const pageReviews =
    reviews.slice(startIndex, endIndex);

    console.log("🏪 RENDER STORE REVIEWS:", reviews);
    if (reviews.length === 0) {
    storeReviewsList.replaceChildren();

    if (storeReviewsEmpty) {
        storeReviewsEmpty.hidden = false;
    }

    return;
}

if (storeReviewsEmpty) {
    storeReviewsEmpty.hidden = true;
}

storeReviewsList.innerHTML = pageReviews
    .map((review) => {
        return `
            <div class="store-review-card">
                <div class="store-review-card-stars">
                    ${createProductCardStars(review.rating)}
                </div>

                <div class="store-review-customer-row">
                    <h3>${escapeHTML(review.customer_name)}</h3>

                    <span class="store-review-date">
                        ${new Date(review.created_at).toLocaleDateString()}
                    </span>
                </div>
                    ${
                        review.is_verified_customer
                            ? `
                                <div class="store-review-verified">
                                    <i class="fa-solid fa-circle-check"></i>
                                    Verified Customer
                                </div>
                            `
                            : ""
                    }
                <h4 class="store-review-card-title">
                    ${escapeHTML(review.title)}
                </h4>

                <p class="store-review-card-comment">${escapeHTML(review.comment)}</p>
            </div>
        `;
    })
    .join("");

    renderStoreReviewsPagination(reviews);
}

function renderStoreReviewsPagination(reviews) {
    if (!storeReviewsPagination) {
        return;
    }

    const totalPages = Math.ceil(
        reviews.length / STORE_REVIEWS_PER_PAGE
    );

    storeReviewsPagination.innerHTML = "";

    if (totalPages <= 1) {
        return;
    }

    for (let page = 1; page <= totalPages; page++) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = page;
    button.dataset.page = page;

    if (page === storeReviewsCurrentPage) {
        button.classList.add("active");
    }

button.addEventListener("click", () => {
    storeReviewsCurrentPage = page;
    renderStoreReviews(reviews);
});

    storeReviewsPagination.appendChild(button);
}
}

/* =====================================================
    LOAD APPROVED PRODUCT REVIEWS
===================================================== */
    async function loadProductReviews() {
        if (!products || products.length === 0) {
            productReviews = [];
            return;
        }
        const productIds = products.map((product) => product.id);
        const { data, error } = await supabase
            .from("Reviews")
            .select(
                `
            id,
            product_id,
            rating,
            is_approved
        `
            )
            .in("product_id", productIds)
            .eq("review_type", "product")
            .eq("is_approved", true);
        if (error) {
            console.error("❌ PRODUCT REVIEW ERROR:", error);
            productReviews = [];
            return;
        }
        productReviews = data || [];
        console.log("✅ APPROVED PRODUCT REVIEWS:", productReviews);
    }
    /* =====================================================
        LOAD PRODUCT VARIANTS
    ===================================================== */
    async function loadVariants() {
        if (!products || products.length === 0) {
            variants = [];
            return;
        }
        const productIds = products.map((product) => product.id);
        const { data, error } = await supabase
            .from("Product_variants")
            .select(
                `
                id,
                product_id,
                sku,
                variant_name,
                price,
                cost,
                barcode,
                weight,
                stock_quantity,
                is_active,
                created_at,
                updated_at
            `
            )
            .in("product_id", productIds)
            .eq("is_active", true);
        if (error) {
            console.error("❌ VARIANT ERROR:", error);
            variants = [];
            return;
        }
        variants = data || [];
        console.log("✅ Product variants loaded:", variants);
    }

    /* =====================================================
        GET PRODUCT VARIANTS
    ===================================================== */
    function getProductVariants(productId) {
        return variants.filter((variant) => String(variant.product_id) === String(productId));
    }

    /* =====================================================
        GET DEFAULT VARIANT
    ===================================================== */
    function getDefaultVariant(product) {
        const productVariants = getProductVariants(product.id);

        if (productVariants.length === 0) {
            return null;
        }

        // If there is only one variant, use it automatically.
        if (productVariants.length === 1) {
            return productVariants[0];
        }

        // For multiple variants, use the first active/in-stock
        // variant as the initial display selection.
        const inStockVariant = productVariants.find((variant) => Number(variant.stock_quantity || 0) > 0);

        return inStockVariant || productVariants[0];
    }

    /* =====================================================
        GET PRODUCT PRICE
    ===================================================== */
    function getProductPrice(product) {
        const variant = getDefaultVariant(product);
        if (variant) {
            return Number(variant.price || 0);
        }
        return Number(product.price || 0);
    }

    /* =====================================================
        GET PRODUCT STOCK
    ===================================================== */
    function getProductStock(product) {
        const inventoryRow = inventory.find((item) => String(item.product_id) === String(product.id));

        if (inventoryRow) {
            return Math.max(0, Number(inventoryRow.quantity || 0));
        }

        const productVariants = getProductVariants(product.id);

        if (productVariants.length === 0) {
            return null;
        }

        return productVariants.reduce((total, variant) => total + Number(variant.stock_quantity || 0), 0);
    }

    /* =====================================================
        CHECK PRODUCT AVAILABILITY
    ===================================================== */
    function isProductAvailable(product) {
        if (product.is_preorder === true) {
            return true;
        }

        const stock = getProductStock(product);

        if (stock !== null) {
            return stock > 0;
        }

        return true;
    }

    /* =====================================================
        SORT PRODUCTS
    ===================================================== */

    function sortProducts(productList) {
        const sorted = [...productList];

        switch (selectedSort) {
            case "newest":
                sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                break;

            case "name-asc":
                sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
                break;

            case "name-desc":
                sorted.sort((a, b) => String(b.name || "").localeCompare(String(a.name || "")));
                break;

            case "price-low":
                sorted.sort((a, b) => getProductPrice(a) - getProductPrice(b));
                break;

            case "price-high":
                sorted.sort((a, b) => getProductPrice(b) - getProductPrice(a));
                break;

            case "featured":
            default:
                sorted.sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
                break;
        }

        return sorted;
    }

    /* =====================================================
    FILTER PRODUCTS
    ===================================================== */
    function filterStoreProducts() {
        let filtered = [...products];

        /* SEARCH */
        if (selectedSearch.trim().length > 0) {
            const search = selectedSearch
                .trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
            filtered = filtered.filter((product) => {
                const name = String(product.name || "")
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");
                const sku = String(product.sku || "").toLowerCase();
                const description = String(product.description || "")
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");
                const category = categories.find((item) => String(item.id) === String(product.category_id));
                const categoryName = String(category?.name || "")
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");
                return (
                    name.includes(search) ||
                    sku.includes(search) ||
                    description.includes(search) ||
                    categoryName.includes(search)
                );
            });
        }

        /* CATEGORY */
        if (selectedCategory !== "all") {
            filtered = filtered.filter((product) => String(product.category_id) === String(selectedCategory));
        }

        /* PRICE */
        if (selectedPrice !== "all") {
            filtered = filtered.filter((product) => {
                const price = getProductPrice(product);
                switch (selectedPrice) {
                    case "under-25":
                        return price < 25;
                    case "25-50":
                        return price >= 25 && price <= 50;
                    case "50-100":
                        return price > 50 && price <= 100;
                    case "over-100":
                        return price > 100;
                    default:
                        return true;
                }
            });
        }

        /* AVAILABILITY */
        if (selectedAvailability === "preorder") {
            filtered = filtered.filter((product) => product.is_preorder === true);
        }
        if (selectedAvailability === "in-stock") {
            filtered = filtered.filter((product) => isProductAvailable(product));
        }
        return filtered;
    }

    /* =====================================================
    RENDER PRODUCTS
===================================================== */

    function renderProducts() {
        if (storeProductGrid) {
            renderVisitStoreProducts();
            return;
        }

        if (!categoryGrid) {
            return;
        }

        let filteredProducts = [...products];

        if (selectedCategory !== "all") {
            filteredProducts = filteredProducts.filter(
                (product) => String(product.category_id) === String(selectedCategory)
            );
        }

        filteredProducts = sortProducts(filteredProducts);

        if (filteredProducts.length === 0) {
            categoryGrid.innerHTML = `
            <div class="mw-products-empty">
                <i class="fa-solid fa-box-open"></i>
                <h3>No Products Found</h3>
                <p>There are currently no products available.</p>
            </div>
        `;
            return;
        }

        categoryGrid.innerHTML = filteredProducts.map((product) => createOldProductCard(product)).join("");

        attachCartEvents();
    }

    /* =====================================================
    VISIT STORE PRODUCTS + PAGINATION
===================================================== */

    const STORE_PRODUCTS_PER_PAGE = 15;

    let storeCurrentPage = 1;

    let lastStoreFilterKey = "";

    /* =====================================================
    RENDER VISIT STORE PRODUCTS
===================================================== */

    function renderVisitStoreProducts() {
        if (!storeProductGrid) {
            return;
        }

        // =========================================
        // RESET TO PAGE 1 WHEN FILTERS CHANGE
        // =========================================

        const currentFilterKey = JSON.stringify({
            search: selectedSearch,
            category: selectedCategory,
            price: selectedPrice,
            availability: selectedAvailability,
            sort: selectedSort,
        });

        if (lastStoreFilterKey && lastStoreFilterKey !== currentFilterKey) {
            storeCurrentPage = 1;
        }

        lastStoreFilterKey = currentFilterKey;

        // =========================================
        // FILTER + SORT PRODUCTS
        // =========================================

        let filteredProducts = filterStoreProducts();

        filteredProducts = sortProducts(filteredProducts);

        // =========================================
        // RESULTS COUNT
        // =========================================

        updateResultsCount(filteredProducts.length);

        // =========================================
        // NO PRODUCTS
        // =========================================

        if (filteredProducts.length === 0) {
            storeProductGrid.innerHTML = "";

            if (storeNoResults) {
                storeNoResults.hidden = false;
            }

            removeStorePagination();

            return;
        }

        if (storeNoResults) {
            storeNoResults.hidden = true;
        }

        // =========================================
        // CALCULATE TOTAL PAGES
        // =========================================

        const totalPages = Math.ceil(filteredProducts.length / STORE_PRODUCTS_PER_PAGE);

        // =========================================
        // KEEP CURRENT PAGE VALID
        // =========================================

        if (storeCurrentPage > totalPages) {
            storeCurrentPage = totalPages;
        }

        if (storeCurrentPage < 1) {
            storeCurrentPage = 1;
        }

        // =========================================
        // GET PRODUCTS FOR CURRENT PAGE
        // =========================================

        const startIndex = (storeCurrentPage - 1) * STORE_PRODUCTS_PER_PAGE;

        const endIndex = startIndex + STORE_PRODUCTS_PER_PAGE;

        const pageProducts = filteredProducts.slice(startIndex, endIndex);

        // =========================================
        // RENDER 15 PRODUCTS
        // =========================================

        storeProductGrid.innerHTML = pageProducts.map((product) => createStoreProductCard(product)).join("");

        attachCartEvents();

        // =========================================
        // RENDER PAGINATION
        // =========================================

        renderStorePagination(totalPages);
    }

    /* =====================================================
    STORE PAGINATION
===================================================== */

    function renderStorePagination(totalPages) {
        let pagination = document.getElementById("store-product-pagination");

        // =========================================
        // CREATE PAGINATION IF IT DOES NOT EXIST
        // =========================================

        if (!pagination) {
            pagination = document.createElement("div");

            pagination.id = "store-product-pagination";

            pagination.className = "store-product-pagination";

            storeProductGrid.insertAdjacentElement("afterend", pagination);
        }

        // =========================================
        // HIDE PAGINATION IF ONLY ONE PAGE
        // =========================================

        if (totalPages <= 1) {
            pagination.innerHTML = "";

            pagination.hidden = true;

            return;
        }

        pagination.hidden = false;

        // =========================================
        // PREVIOUS BUTTON
        // =========================================

        let paginationHTML = `
        <button
            type="button"
            class="store-pagination-button store-pagination-prev"
            ${storeCurrentPage === 1 ? "disabled" : ""}
        >
            <i class="fa-solid fa-chevron-left"></i>
            Previous
        </button>
    `;

        // =========================================
        // PAGE NUMBER BUTTONS
        // =========================================

        for (let page = 1; page <= totalPages; page++) {
            paginationHTML += `
            <button
                type="button"
                class="
                    store-pagination-button
                    store-pagination-number
                    ${page === storeCurrentPage ? "active" : ""}
                "
                data-page="${page}"
            >
                ${page}
            </button>
        `;
        }

        // =========================================
        // NEXT BUTTON
        // =========================================

        paginationHTML += `
        <button
            type="button"
            class="store-pagination-button store-pagination-next"
            ${storeCurrentPage === totalPages ? "disabled" : ""}
        >
            Next
            <i class="fa-solid fa-chevron-right"></i>
        </button>
    `;

        pagination.innerHTML = paginationHTML;

        // =========================================
        // PAGE NUMBER EVENTS
        // =========================================

        pagination.querySelectorAll(".store-pagination-number").forEach((button) => {
            button.addEventListener("click", () => {
                storeCurrentPage = Number(button.dataset.page);

                renderVisitStoreProducts();

                scrollToStoreProducts();
            });
        });

        // =========================================
        // PREVIOUS EVENT
        // =========================================

        const previousButton = pagination.querySelector(".store-pagination-prev");

        if (previousButton) {
            previousButton.addEventListener("click", () => {
                if (storeCurrentPage > 1) {
                    storeCurrentPage--;

                    renderVisitStoreProducts();

                    scrollToStoreProducts();
                }
            });
        }

        // =========================================
        // NEXT EVENT
        // =========================================

        const nextButton = pagination.querySelector(".store-pagination-next");

        if (nextButton) {
            nextButton.addEventListener("click", () => {
                if (storeCurrentPage < totalPages) {
                    storeCurrentPage++;

                    renderVisitStoreProducts();

                    scrollToStoreProducts();
                }
            });
        }
    }

    /* =====================================================
    REMOVE STORE PAGINATION
===================================================== */

    function removeStorePagination() {
        const pagination = document.getElementById("store-product-pagination");

        if (pagination) {
            pagination.remove();
        }
    }

    /* =====================================================
    SCROLL BACK TO PRODUCTS
===================================================== */

    function scrollToStoreProducts() {
        storeProductGrid.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    }

    /* =====================================================
    RESULTS COUNT
===================================================== */

    function updateResultsCount(count) {
        if (!storeResultsCount) {
            return;
        }

        storeResultsCount.textContent = count === 1 ? "1 product found" : `${count} products found`;
    }

    /* =====================================================
    STORE PRODUCT CARD
===================================================== */

    function createStoreProductCard(product) {
        const reviewSummary = getProductReviewSummary(product.id);
        const category = categories.find((category) => String(category.id) === String(product.category_id));

        const categoryName = category ? category.name : "Collectible";
        const variant = getDefaultVariant(product);
        const price = getProductPrice(product).toFixed(2);
        const comparePrice = product.compare_at_price ? Number(product.compare_at_price).toFixed(2) : null;
        const stock = getProductStock(product);
        const hasVariants = getProductVariants(product.id).length > 0;
        const available = isProductAvailable(product);

        /* FIXED DESCRIPTION */
        const description = product.description || "Explore this product from Midwest Toy Connections.";

        /* =================================================
        PRODUCT BADGE
    ================================================= */

        let badge = "";

        if (product.is_preorder === true) {
            badge = `
            <span class="store-product-badge preorder">
                Preorder
            </span>
        `;
        } else if (hasVariants && stock === 0) {
            badge = `
            <span class="store-product-badge soldout">
                Sold Out
            </span>
        `;
        } else if (product.is_featured === true) {
            badge = `
            <span class="store-product-badge">
                Featured
            </span>
        `;
        }

        /* =================================================
PRODUCT IMAGE
================================================= */

const safeProductImageURL =
    safeURL(product.image_url);

const imageHTML = safeProductImageURL
    ? `
    <img
        src="${escapeHTML(safeProductImageURL)}"
        alt="${escapeHTML(product.product_name || product.name)}"
        loading="lazy"
    >
`
    : `
    <div class="store-product-image-placeholder">
        <i class="fa-solid fa-image"></i>
        <span>No Image Available</span>
    </div>
`;

        /* =================================================
        PRODUCT BUTTON
    ================================================= */

        let buttonHTML = "";

        if (product.is_preorder === true) {
            buttonHTML = `
            <button
                type="button"
                class="store-add-cart-btn"
                data-id="${escapeHTML(product.id)}"
                data-variant-id="${variant ? escapeHTML(variant.id) : ""}">
                <i class="fa-solid fa-cart-shopping"></i>
                Preorder
            </button>
        `;
        } else if (hasVariants && stock === 0) {
            buttonHTML = `
            <button
                type="button"
                class="store-add-cart-btn"
                data-id="${escapeHTML(product.id)}"
                data-variant-id="${variant ? escapeHTML(variant.id) : ""}"
                disabled>
                <i class="fa-solid fa-ban"></i>
                Sold Out
            </button>
        `;
        } else if (!available) {
            buttonHTML = `
            <button
                type="button"
                class="store-add-cart-btn"
                data-id="${escapeHTML(product.id)}"
                data-variant-id="${variant ? escapeHTML(variant.id) : ""}"
                disabled>
                <i class="fa-solid fa-ban"></i>
                Sold Out
            </button>
        `;
        } else {
            buttonHTML = `
            <button
                type="button"
                class="store-add-cart-btn"
                data-id="${escapeHTML(product.id)}"
                data-variant-id="${variant ? escapeHTML(variant.id) : ""}">
                <i class="fa-solid fa-cart-shopping"></i>
                Add to Cart
            </button>
        `;
        }

        /* =================================================
        PRODUCT CARD
    ================================================= */
        return `
        <article
            class="store-product-card"
            data-product-id="${escapeHTML(product.id)}"
            data-variant-id="${variant ? escapeHTML(variant.id) : ""}">
            <div class="store-product-image">
                ${badge}
                ${imageHTML}
            </div>
            <div class="store-product-content">
            <div class="store-product-category">
                    ${escapeHTML(categoryName)}
                </div>
                <h3 class="store-product-title">
                    ${escapeHTML(product.product_name)}
                </h3>
                <div class="store-product-rating">
                    <div class="store-product-stars">
                        ${createProductCardStars(reviewSummary.average)}
                    </div>

                    <span>
                        ${
                            reviewSummary.count > 0
                                ? `${reviewSummary.average.toFixed(1)} (${reviewSummary.count})`
                                : "No reviews"
                        }
                    </span>
                </div>
                ${
                    variant && variant.variant_name
                        ? `
                            <div class="store-product-variant">
                                ${escapeHTML(variant.variant_name)}
                            </div>
                        `
                        : ""
                }
               <p class="store-product-description">
                    ${escapeHTML(description)}
                </p>

                <div class="store-product-stock ${stock !== null && stock <= 0 ? "out-of-stock" : "in-stock"}">
                    <i class="fa-solid fa-circle"></i>

                    ${stock !== null && stock <= 0 ? "Out of Stock" : `In Stock: ${stock}`}
                </div>
                <div class="store-product-footer">
                    <div class="store-product-price">
                        <span class="current-price">
                            $${price}
                        </span>
                        ${
                            comparePrice
                                ? `
                                    <span class="compare-price">
                                        $${comparePrice}
                                    </span>
                                `
                                : ""
                        }
                    </div>
                    ${buttonHTML}
                </div>
            </div>
        </article>
    `;
    }

/* =====================================================
OLD PRODUCT CARD
===================================================== */

function createOldProductCard(product) {
    const variant = getDefaultVariant(product);
    const price = getProductPrice(product).toFixed(2);
    const stock = getProductStock(product);

    const safeProductImageURL =
        safeURL(product.image_url);

    const imageHTML = safeProductImageURL
        ? `
        <img
            src="${escapeHTML(safeProductImageURL)}"
            alt="${escapeHTML(product.product_name || product.name)}"
            loading="lazy"
        >
    `
        : `
        <div class="mw-product-image-placeholder">
            <i class="fa-solid fa-image"></i>
            <span>No Image Available</span>
        </div>
    `;

        const soldOut = !product.is_preorder && stock !== null && stock <= 0;

        return `
        <div
            class="mw-product-card"
            data-product-id="${escapeHTML(product.id)}"
            data-variant-id="${variant ? escapeHTML(variant.id) : ""}">

            <div class="mw-product-image">
                ${imageHTML}
            </div>

            <div class="mw-product-details">
                <h4>${escapeHTML(product.name)}</h4>
                <p class="price">$${price}</p>

                ${
                    soldOut
                        ? `
                            <button
                                type="button"
                                class="add-to-cart-btn"
                                disabled>
                                Sold Out
                            </button>
                        `
                        : `
                            <button
                                type="button"
                                class="add-to-cart-btn"
                                data-id="${escapeHTML(product.id)}"
                                data-variant-id="${variant ? escapeHTML(variant.id) : ""}">
                                Add to Cart
                            </button>
                        `
                }
            </div>
        </div>
    `;
    }

    /* =====================================================
    CART
===================================================== */

    function getCart() {
        try {
            const savedCart = localStorage.getItem("mtc-cart");

            if (!savedCart) {
                return [];
            }

            const parsedCart = JSON.parse(savedCart);

            return Array.isArray(parsedCart) ? parsedCart : [];
        } catch (error) {
            console.error("❌ CART LOAD ERROR:", error);
            return [];
        }
    }

    /* =====================================================
    SAVE CART
===================================================== */

    function saveCart(cart) {
        localStorage.setItem("mtc-cart", JSON.stringify(cart));
        updateCartCount();
    }

    /* =====================================================
    ADD PRODUCT TO CART
===================================================== */
    function addToCart(productId, variantId = null, quantity = 1) {
        const product = products.find((product) => String(product.id) === String(productId));

        if (!product) {
            console.error("❌ Product not found:", productId);
            return;
        }

        let variant = null;

        if (variantId) {
            variant = variants.find((item) => String(item.id) === String(variantId));
        }

        if (!variant) {
            variant = getDefaultVariant(product);
        }

        /* =================================================
        CHECK STOCK
    ================================================= */

        if (variant && product.is_preorder !== true && Number(variant.stock_quantity || 0) <= 0) {
            console.warn("Product is sold out:", product.name);
            return;
        }

        const cart = getCart();

        const cartItemId = variant ? `${product.id}_${variant.id}` : `${product.id}`;

        const existingItem = cart.find((item) => item.cartItemId === cartItemId);

        const availableStock = getProductStock(product);

        const currentCartQuantity = existingItem ? Number(existingItem.quantity || 0) : 0;

        if (
            product.is_preorder !== true &&
            availableStock !== null &&
            currentCartQuantity + quantity > availableStock
        ) {
            const stockPopup = document.getElementById("mtc-stock-popup");

            const stockPopupMessage = document.getElementById("mtc-stock-popup-message");

            stockPopupMessage.innerHTML = `
                Only <strong>${Number(availableStock)}</strong> of
                <strong>${escapeHTML(product.product_name)}</strong>
                available.
            `;
            stockPopup.hidden = false;
            const stockPopupClose = document.getElementById("mtc-stock-popup-close");

            stockPopupClose.onclick = () => {
                stockPopup.hidden = true;
            };
            return;
        }

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            cart.push({
                cartItemId,
                productId: product.id,
                variantId: variant ? variant.id : null,
                sku: variant ? variant.sku : product.sku,
                name: product.product_name,
                variantName: variant ? variant.variant_name : null,
                price: variant ? Number(variant.price || 0) : Number(product.price || 0),
                quantity: quantity,
                image_url: product.image_url || null,
            });
        }

        saveCart(cart);

        /* =================================================
    SHOW MINI CART
================================================= */

        const miniCart = document.getElementById("mini-cart");

        const miniCartProductName = document.getElementById("mini-cart-product-name");

        const miniCartProductImage = document.getElementById("mini-cart-product-image");

        const miniCartQuantity = document.getElementById("mini-cart-quantity");

        const miniCartPrice = document.getElementById("mini-cart-price");

        const miniCartSubtotal = document.getElementById("mini-cart-subtotal");

        if (miniCart) {
            const itemPrice = variant ? Number(variant.price || 0) : Number(product.price || 0);

            /* PRODUCT NAME */

            if (miniCartProductName) {
                miniCartProductName.textContent = product.name || "Product";
            }

            /* PRODUCT IMAGE */

            if (miniCartProductImage) {
    const safeMiniCartProductURL =
        safeURL(product.image_url);

    if (safeMiniCartProductURL) {
        miniCartProductImage.src =
            safeMiniCartProductURL;

        miniCartProductImage.alt =
            product.product_name ||
            product.name ||
            "Product";

        miniCartProductImage.style.display = "";
    } else {
        miniCartProductImage.removeAttribute("src");
        miniCartProductImage.alt = "";
        miniCartProductImage.style.display = "none";
    }
}

            /* QUANTITY JUST ADDED */

            if (miniCartQuantity) {
                miniCartQuantity.textContent = `Quantity: ${quantity}`;
            }

            /* ITEM PRICE */

            if (miniCartPrice) {
                miniCartPrice.textContent = `$${itemPrice.toFixed(2)}`;
            }

            /* ENTIRE CART SUBTOTAL */

            const updatedCart = getCart();

            const subtotal = updatedCart.reduce(
                (total, item) => total + Number(item.price || 0) * Number(item.quantity || 0),
                0
            );

            if (miniCartSubtotal) {
                miniCartSubtotal.textContent = `$${subtotal.toFixed(2)}`;
            }

            /* SHOW MINI CART */

            renderMiniCart();

            miniCart.hidden = false;
        }

        console.log("✅ Added to cart:", product.name, variant);
    }

    /* =====================================================
    CART COUNT
===================================================== */

    function updateCartCount() {
        const cart = getCart();

        const totalQuantity = cart.reduce((total, item) => total + Number(item.quantity || 0), 0);

        const cartCounters = document.querySelectorAll(".cart span");

        cartCounters.forEach((counter) => {
            counter.textContent = totalQuantity;
        });
    }
    /* =====================================================
   RENDER SHOPPING CART
===================================================== */
async function renderShoppingCart() {
    const cartItemsContainer =
        document.getElementById("cart-items");

    if (!cartItemsContainer) return;

    let cart = getCart();

    /* EMPTY CART */
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="cart-empty">
                <i class="fa-solid fa-cart-shopping"></i>
                <h3>Your cart is empty</h3>
                <p>Add some products to your cart to get started.</p>
                <a href="mw-visit-store.html" class="checkout-btn">
                    Continue Shopping
                </a>
            </div>
        `;

        updateCartSummary();
        return;
    }

    /* =================================================
       VALIDATE STORED CART QUANTITIES AGAINST INVENTORY
    ================================================= */

    let cartChanged = false;

    for (const item of cart) {
        let quantity =
            Math.floor(Number(item.quantity));

        /* INVALID / DECIMAL / ZERO / NEGATIVE */
        if (
            !Number.isFinite(quantity) ||
            quantity < 1
        ) {
            quantity = 1;
        }

        let inventoryQuery = supabase
            .from("Inventory")
            .select("quantity")
            .eq("product_id", item.productId);

        if (item.variantId) {
            inventoryQuery =
                inventoryQuery.eq(
                    "variant_id",
                    item.variantId
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
            error: inventoryError
        } = await inventoryQuery.maybeSingle();

        if (inventoryError) {
            console.error(
                "CART LOAD INVENTORY CHECK ERROR:",
                inventoryError
            );

            continue;
        }

        const availableQuantity =
            Math.max(
                0,
                Number(
                    inventoryRecord?.quantity || 0
                )
            );

        /* DON'T ALLOW STORED QUANTITY ABOVE STOCK */
        if (
            availableQuantity > 0 &&
            quantity > availableQuantity
        ) {
            quantity = availableQuantity;
        }

        /* FIX INVALID QUANTITY */
        if (Number(item.quantity) !== quantity) {
            item.quantity = quantity;
            cartChanged = true;
        }

        /* GET REAL PRICE FROM LOADED DATABASE DATA */
        let realPrice = null;

        if (item.variantId) {
            const realVariant = variants.find(
                (variant) =>
                    String(variant.id) === String(item.variantId) &&
                    String(variant.product_id) === String(item.productId)
            );

            if (realVariant) {
                realPrice = Number(realVariant.price);
            }
        } else {
            const realProduct = products.find(
                (product) =>
                    String(product.id) === String(item.productId)
            );

            if (realProduct) {
                realPrice = Number(realProduct.price);
            }
        }

        /* REPLACE TAMPERED PRICE */
        if (
            realPrice !== null &&
            Number.isFinite(realPrice) &&
            Number(item.price) !== realPrice
        ) {
            item.price = realPrice;
            cartChanged = true;
        }
        }
    /* SAVE CORRECTED CART */
    if (cartChanged) {
        saveCart(cart);
    }

    /* RENDER CART ITEMS */
    cartItemsContainer.innerHTML = cart
        .map((item) => {
            let price = 0;

        if (item.variantId) {
            const variant = variants.find(
                (variant) =>
                    String(variant.id) ===
                    String(item.variantId)
            );

            price = Number(variant?.price || 0);
        } else {
            const product = products.find(
                (product) =>
                    String(product.id) ===
                    String(item.productId)
            );

            price = Number(product?.price || 0);
        }

            const quantity =
                Math.max(
                    1,
                    Math.floor(
                        Number(item.quantity || 1)
                    )
                );

            const itemTotal =
                price * quantity;

            const safeCartImageURL =
                safeURL(item.image_url);

            const imageHTML =
                safeCartImageURL
                    ? `<img src="${escapeHTML(
                          safeCartImageURL
                      )}" alt="${escapeHTML(
                          item.name
                      )}">`
                    : `<div class="cart-product-placeholder">
                           <i class="fa-solid fa-image"></i>
                       </div>`;

            return `
                <div
                    class="cart-item"
                    data-cart-item-id="${escapeHTML(
                        item.cartItemId
                    )}">

                    <div class="product">
                        ${imageHTML}

                        <div>
                            <h4>${escapeHTML(
                                item.name
                            )}</h4>

                            ${
                                item.variantName
                                    ? `<small>${escapeHTML(
                                          item.variantName
                                      )}</small>`
                                    : ""
                            }
                        </div>
                    </div>

                    <div>
                        $${price.toFixed(2)}
                    </div>

                    <div class="quantity">

                        <button
                            type="button"
                            class="cart-quantity-minus"
                            data-cart-item-id="${escapeHTML(
                                item.cartItemId
                            )}">
                            -
                        </button>

                        <input
                            type="number"
                            min="1"
                            step="1"
                            value="${quantity}"
                            class="cart-quantity-input"
                            data-cart-item-id="${escapeHTML(
                                item.cartItemId
                            )}">

                        <button
                            type="button"
                            class="cart-quantity-plus"
                            data-cart-item-id="${escapeHTML(
                                item.cartItemId
                            )}">
                            +
                        </button>

                    </div>

                    <div>
                        $${itemTotal.toFixed(2)}
                    </div>

                    <button
                        type="button"
                        class="remove cart-remove-btn"
                        data-cart-item-id="${escapeHTML(
                            item.cartItemId
                        )}"
                        aria-label="Remove ${escapeHTML(
                            item.name
                        )}">

                        <i class="fas fa-times"></i>

                    </button>

                </div>
            `;
        })
        .join("");

    attachShoppingCartEvents();
    renderCartShippingMethods();
    updateCartSummary();
}

    /* =====================================================
    CART QUANTITY / REMOVE EVENTS
===================================================== */
    function attachShoppingCartEvents() {
        /* MINUS BUTTON */
        document.querySelectorAll(".cart-quantity-minus").forEach((button) => {
            button.addEventListener("click", () => {
                changeCartQuantity(button.dataset.cartItemId, -1);
            });
        });

        /* PLUS BUTTON */
        document.querySelectorAll(".cart-quantity-plus").forEach((button) => {
            button.addEventListener("click", () => {
                changeCartQuantity(button.dataset.cartItemId, 1);
            });
        });

        /* MANUAL QUANTITY INPUT */
        document.querySelectorAll(".cart-quantity-input").forEach((input) => {
            input.addEventListener("change", () => {
                let quantity = parseInt(input.value, 10);
                if (isNaN(quantity) || quantity < 1) quantity = 1;
                setCartQuantity(input.dataset.cartItemId, quantity);
            });
        });

        /* REMOVE BUTTON */
        document.querySelectorAll(".cart-remove-btn").forEach((button) => {
            button.addEventListener("click", () => {
                removeFromCart(button.dataset.cartItemId);
            });
        });
    }

    /* =====================================================
    CHANGE CART QUANTITY
===================================================== */
   async function changeCartQuantity(cartItemId, amount) {
    const cart = getCart();

    const item = cart.find(
        (item) =>
            String(item.cartItemId) ===
            String(cartItemId)
    );

    if (!item) return;

    const currentQuantity =
        Math.max(
            1,
            Number(item.quantity || 1)
        );

    const newQuantity =
        currentQuantity + amount;

    // =============================================
    // REMOVE ITEM IF QUANTITY REACHES 0
    // =============================================

    if (newQuantity <= 0) {
        removeFromCart(cartItemId);
        return;
    }

    // =============================================
    // CHECK LIVE INVENTORY BEFORE INCREASING
    // =============================================

    if (amount > 0) {
        let inventoryQuery =
            supabase
                .from("Inventory")
                .select("quantity")
                .eq(
                    "product_id",
                    item.productId
                );

        if (item.variantId) {
            inventoryQuery =
                inventoryQuery.eq(
                    "variant_id",
                    item.variantId
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
            error: inventoryError
        } = await inventoryQuery.maybeSingle();

        if (inventoryError) {
            console.error(
                "CART INVENTORY CHECK ERROR:",
                inventoryError
            );

            alert(
                "Unable to verify inventory. Please try again."
            );

            return;
        }

        const availableQuantity =
            Math.max(
                0,
                Number(
                    inventoryRecord?.quantity || 0
                )
            );

        if (
            newQuantity >
            availableQuantity
        ) {
            alert(
                `Only ${availableQuantity} available in stock.`
            );

            return;
        }
    }

    // =============================================
    // UPDATE CART
    // =============================================

    item.quantity = newQuantity;

    saveCart(cart);

    if (appliedCartDiscount) {
        await revalidateAppliedCartDiscount();
    }

    renderShoppingCart();
}


/* =====================================================
   SET CART QUANTITY
===================================================== */

async function setCartQuantity(
    cartItemId,
    quantity
) {
    const cart = getCart();

    const item = cart.find(
        (item) =>
            String(item.cartItemId) ===
            String(cartItemId)
    );

    if (!item) return;

    const requestedQuantity =
        Math.max(
            1,
            Number(quantity || 1)
        );

    // =============================================
    // CHECK LIVE INVENTORY
    // =============================================

    let inventoryQuery =
        supabase
            .from("Inventory")
            .select("quantity")
            .eq(
                "product_id",
                item.productId
            );

    if (item.variantId) {
        inventoryQuery =
            inventoryQuery.eq(
                "variant_id",
                item.variantId
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
        error: inventoryError
    } = await inventoryQuery.maybeSingle();

    if (inventoryError) {
        console.error(
            "CART INVENTORY CHECK ERROR:",
            inventoryError
        );

        alert(
            "Unable to verify inventory. Please try again."
        );

        renderShoppingCart();

        return;
    }

    const availableQuantity =
        Math.max(
            0,
            Number(
                inventoryRecord?.quantity || 0
            )
        );

    // =============================================
    // BLOCK QUANTITY ABOVE AVAILABLE STOCK
    // =============================================

    if (
        requestedQuantity >
        availableQuantity
    ) {
        alert(
            `Only ${availableQuantity} available in stock.`
        );

        item.quantity =
            Math.max(
                1,
                availableQuantity
            );

        saveCart(cart);
        renderShoppingCart();

        return;
    }

    // =============================================
    // UPDATE CART
    // =============================================

    item.quantity =
        requestedQuantity;

    saveCart(cart);

    if (appliedCartDiscount) {
        await revalidateAppliedCartDiscount();
    }

    renderShoppingCart();
}


/* =====================================================
   REMOVE FROM CART
===================================================== */

function removeFromCart(cartItemId) {
    let cart = getCart();

    cart = cart.filter(
        (item) =>
            String(item.cartItemId) !==
            String(cartItemId)
    );

    saveCart(cart);
    renderShoppingCart();
}


/* =====================================================
   UPDATE CART SUMMARY
===================================================== */

// =========================================================
// CART SHIPPING METHODS
// =========================================================
let cartShippingMethods = [];
let selectedCartShippingMethod = null;

// =========================================================
// CART DISCOUNT
// =========================================================
let appliedCartDiscount = null;

let cartFreeShippingEnabled = false;
let cartFreeShippingMinimum = 0;
let cartFreeShippingName = "Free Standard Shipping";
let cartFreeShippingDescription =
    "Free standard shipping on qualifying orders";

let cartLocalPickupEnabled = false;
let cartLocalPickupAddress = "";
let cartLocalPickupInstructions = "";
let cartLocalPickupReadyTime = "";

async function loadCartShippingMethods() {

    const shippingMethodsContainer =
        document.getElementById("cart-shipping-methods");
const {
    data: shippingSettings,
    error: shippingSettingsError
} = await supabase
    .from("Shipping_Settings")
    .select(`
    free_shipping_enabled,
    free_shipping_minimum,
    free_shipping_name,
    free_shipping_description,
    local_pickup_enabled,
    local_pickup_address,
    local_pickup_instructions,
    local_pickup_ready_time
`)
    .limit(1)
    .maybeSingle();

if (shippingSettingsError) {
    console.error(
        "CART SHIPPING SETTINGS ERROR:",
        shippingSettingsError
    );
} else if (shippingSettings) {
    cartFreeShippingEnabled =
        shippingSettings.free_shipping_enabled === true;

    cartFreeShippingMinimum =
        Number(
            shippingSettings.free_shipping_minimum || 0
        );

    cartFreeShippingName =
        shippingSettings.free_shipping_name ||
        "Free Standard Shipping";

    cartFreeShippingDescription =
        shippingSettings.free_shipping_description ||
        "Free standard shipping on qualifying orders";

        cartLocalPickupEnabled =
            shippingSettings.local_pickup_enabled === true;

        cartLocalPickupAddress =
            String(
                shippingSettings.local_pickup_address || ""
            );

        cartLocalPickupInstructions =
            String(
                shippingSettings.local_pickup_instructions || ""
            );

        cartLocalPickupReadyTime =
            String(
                shippingSettings.local_pickup_ready_time || ""
            );
        }
            if (!shippingMethodsContainer) {
                return;
            }

    // =============================================
    // LOAD ACTIVE METHODS FROM SUPABASE
    // =============================================

    const { data, error } = await supabase
        .from("Shipping_Methods")
        .select(`
            id,
            name,
            description,
            price,
            estimated_delivery,
            is_active,
            sort_order
        `)
        .eq("is_active", true)
        .order("sort_order", {
            ascending: true
        });

    if (error) {
        console.error(
            "SHIPPING METHODS LOAD ERROR:",
            error
        );

        shippingMethodsContainer.innerHTML = `
            <div class="cart-shipping-method-loading">
                Unable to load shipping options.
            </div>
        `;

        return;
    }

    cartShippingMethods = data || [];

    if (cartShippingMethods.length === 0) {
        shippingMethodsContainer.innerHTML = `
            <div class="cart-shipping-method-loading">
                No shipping methods are currently available.
            </div>
        `;

        return;
    }

    // =============================================
    // SELECT STANDARD SHIPPING BY DEFAULT
    // =============================================

    selectedCartShippingMethod =
        cartShippingMethods.find(method =>
            method.name
                ?.toLowerCase()
                .includes("standard")
        ) || cartShippingMethods[0];

    renderCartShippingMethods();

    await updateCartSummary();
}


// =========================================================
// RENDER SHIPPING METHODS
// =========================================================

function renderCartShippingMethods() {
    const shippingMethodsContainer =
        document.getElementById("cart-shipping-methods");

    if (!shippingMethodsContainer) {
        return;
    }

    // =============================================
    // GET CURRENT CART SUBTOTAL
    // =============================================

    const cart = getCart();

    const subtotal = cart.reduce(
        (total, item) =>
            total +
            Number(item.price || 0) *
            Number(item.quantity || 0),
        0
    );


    // =============================================
    // CHECK FREE SHIPPING
    // =============================================

    const qualifiesForFreeShipping =
        cartFreeShippingEnabled === true &&
        subtotal > 0 &&
        subtotal >= cartFreeShippingMinimum;

// =============================================
// FREE SHIPPING ONLY
// =============================================

if (qualifiesForFreeShipping) {

    const standardShippingMethod =
        cartShippingMethods.find(method =>
            String(method.name || "")
                .trim()
                .toLowerCase()
                .includes("standard")
        );

    if (!standardShippingMethod) {
        console.error(
            "❌ Standard Shipping method was not found."
        );

        selectedCartShippingMethod = null;

        return; 
    }

    selectedCartShippingMethod = {
        id: standardShippingMethod.id,
        name: cartFreeShippingName,
        description: cartFreeShippingDescription,
        price: 0,
        estimated_delivery:
            standardShippingMethod.estimated_delivery || null,
        is_free_shipping: true
    };

        shippingMethodsContainer.innerHTML = `
            <label class="cart-shipping-method selected">

                <input
                    type="radio"
                    name="cart-shipping-method"
                    value="free-standard-shipping"
                    checked
                >

                <div class="cart-shipping-method-info">

                    <strong>
                        ${escapeHTML(cartFreeShippingName)}
                    </strong>

                    ${
                        cartFreeShippingDescription
                            ? `
                                <span>
                                    ${escapeHTML(
                                        cartFreeShippingDescription
                                    )}
                                </span>
                            `
                            : ""
                    }

                </div>

                <strong class="cart-shipping-method-price">
                    FREE
                </strong>

            </label>
        `;

        return;
    }

    // =============================================
    // SWITCH BACK TO PAID SHIPPING
    // IF CART DROPS BELOW FREE SHIPPING MINIMUM
    // =============================================

    if (
        !selectedCartShippingMethod ||
        selectedCartShippingMethod.is_free_shipping === true
    ) {
        selectedCartShippingMethod =
            cartShippingMethods.find(method =>
                method.name
                    ?.toLowerCase()
                    .includes("standard")
            ) || cartShippingMethods[0] || null;
    }

    // =============================================
// RENDER PAID SHIPPING METHODS
// =============================================

shippingMethodsContainer.innerHTML =
    cartShippingMethods.map(method => {

        const methodPrice =
            Number(method.price || 0);

        const isSelected =
            selectedCartShippingMethod?.id === method.id;

        return `
            <label class="cart-shipping-method ${
                isSelected ? "selected" : ""
            }">

                <input
                    type="radio"
                    name="cart-shipping-method"
                    value="${escapeHTML(method.id)}"
                    ${isSelected ? "checked" : ""}
                >

                <div class="cart-shipping-method-info">

                    <strong>
                        ${escapeHTML(method.name)}
                    </strong>

                    ${
                        method.estimated_delivery
                            ? `
                                <span>
                                    ${escapeHTML(
                                        method.estimated_delivery
                                    )}
                                </span>
                            `
                            : ""
                    }

                </div>

                <strong class="cart-shipping-method-price">
                    $${methodPrice.toFixed(2)}
                </strong>

            </label>
        `;
    }).join("");


/* =====================================================
   LOCAL PICKUP
===================================================== */

if (cartLocalPickupEnabled) {

    const pickupLabel =
        document.createElement("label");

    pickupLabel.className =
        "cart-shipping-method";

    const pickupRadio =
        document.createElement("input");

    pickupRadio.type = "radio";
    pickupRadio.name = "cart-shipping-method";
    pickupRadio.value = "local-pickup";

    pickupRadio.checked =
    selectedCartShippingMethod?.is_local_pickup === true;

    if (pickupRadio.checked) {
        pickupLabel.classList.add("selected");
    }

    const pickupInfo =
        document.createElement("div");

    pickupInfo.className =
        "cart-shipping-method-info";

    const pickupName =
        document.createElement("strong");

    pickupName.textContent = "Local Pickup";

    pickupInfo.appendChild(pickupName);


    // READY TIME

    if (cartLocalPickupReadyTime) {

        const readyTime =
            document.createElement("span");

        readyTime.textContent =
            `Ready in: ${cartLocalPickupReadyTime}`;

        pickupInfo.appendChild(readyTime);
    }


    // PICKUP ADDRESS

    if (cartLocalPickupAddress) {

        const address =
            document.createElement("span");

        address.textContent =
            cartLocalPickupAddress;

        pickupInfo.appendChild(address);
    }


    // PICKUP INSTRUCTIONS

    if (cartLocalPickupInstructions) {

        const instructions =
            document.createElement("span");

        instructions.textContent =
            cartLocalPickupInstructions;

        pickupInfo.appendChild(instructions);
    }


    // FREE PRICE

    const pickupPrice =
        document.createElement("strong");

    pickupPrice.className =
        "cart-shipping-method-price";

    pickupPrice.textContent = "FREE";


    pickupLabel.append(
        pickupRadio,
        pickupInfo,
        pickupPrice
    );

    shippingMethodsContainer.appendChild(
        pickupLabel
    );
}


// =============================================
// SHIPPING METHOD CHANGE
// =============================================

shippingMethodsContainer
    .querySelectorAll(
        'input[name="cart-shipping-method"]'
    )
    .forEach(input => {

        input.addEventListener(
            "change",
            async () => {

                if (input.value === "local-pickup") {

    selectedCartShippingMethod = {
        id: "local-pickup",
        name: "Local Pickup",
        price: 0,
        is_local_pickup: true
    };

} else {

    selectedCartShippingMethod =
        cartShippingMethods.find(
            method =>
                String(method.id) ===
                String(input.value)
        ) || null;
}

                renderCartShippingMethods();

                await updateCartSummary();
            }
        );
    });
}

/* =====================================================
UPDATE CART SUMMARY
USES ADMIN SHIPPING SETTINGS
===================================================== */
async function updateCartSummary() {

    const cart = getCart();

    const subtotal = cart.reduce(
        (total, item) =>
            total +
            Number(item.price || 0) *
            Number(item.quantity || 0),
        0
    );

    const itemCount = cart.reduce(
        (total, item) =>
            total + Number(item.quantity || 0),
        0
    );

    /* =============================================
       DEFAULT SHIPPING VALUES
    ============================================= */

    let freeShippingEnabled = true;

    let freeShippingMinimum = 85;

    let standardShippingPrice = 9.99;

    /* =============================================
       LOAD SHIPPING SETTINGS
    ============================================= */

    try {

        const {
            data: shippingSettings,
            error: shippingSettingsError
        } = await supabase
            .from("Shipping_Settings")
            .select(`
                free_shipping_enabled,
                free_shipping_minimum
            `)
            .limit(1)
            .maybeSingle();

        if (shippingSettingsError) {
            console.error(
                "❌ SHIPPING SETTINGS ERROR:",
                shippingSettingsError
            );
        }

        if (shippingSettings) {

            freeShippingEnabled =
                shippingSettings.free_shipping_enabled === true;

            freeShippingMinimum =
                Number(
                    shippingSettings.free_shipping_minimum || 0
                );
        }

        /* =============================================
           LOAD STANDARD SHIPPING METHOD
        ============================================= */

        const {
            data: shippingMethods,
            error: shippingMethodsError
        } = await supabase
            .from("Shipping_Methods")
            .select(`
                name,
                price,
                is_active,
                sort_order
            `)
            .eq("is_active", true)
            .order("sort_order", {
                ascending: true
            });

        if (shippingMethodsError) {
            console.error(
                "❌ SHIPPING METHODS ERROR:",
                shippingMethodsError
            );
        }

        if (
            shippingMethods &&
            shippingMethods.length > 0
        ) {

            const standardMethod =
                shippingMethods.find(
                    (method) =>
                        String(method.name || "")
                            .toLowerCase()
                            .includes("standard")
                ) || shippingMethods[0];

            standardShippingPrice =
                Number(
                    standardMethod.price || 0
                );
        }

    } catch (error) {

        console.error(
            "❌ SHIPPING LOAD ERROR:",
            error
        );
    }

    /* =============================================
       CALCULATE SHIPPING
    ============================================= */
let shipping =
    subtotal > 0
        ? Number(selectedCartShippingMethod?.price || 0)
        : 0;

/* =============================================
   LOAD FREE SHIPPING SETTINGS
============================================= */

try {

    const {
        data: shippingSettings,
        error: shippingSettingsError
    } = await supabase
        .from("Shipping_Settings")
        .select(`
            free_shipping_enabled,
            free_shipping_minimum
        `)
        .limit(1)
        .maybeSingle();

    if (shippingSettingsError) {

        console.error(
            "❌ SHIPPING SETTINGS ERROR:",
            shippingSettingsError
        );

    } else if (shippingSettings) {

        freeShippingEnabled =
            shippingSettings.free_shipping_enabled === true;

        freeShippingMinimum =
            Number(
                shippingSettings.free_shipping_minimum || 0
            );
    }

} catch (error) {

    console.error(
        "❌ SHIPPING SETTINGS LOAD ERROR:",
        error
    );
}


/* =============================================
   FREE SHIPPING
   ONLY STANDARD SHIPPING BECOMES FREE
============================================= */

const isStandardShipping =
    selectedCartShippingMethod?.name
        ?.toLowerCase()
        .includes("standard") === true;

if (
    freeShippingEnabled &&
    isStandardShipping &&
    subtotal >= freeShippingMinimum
) {
    shipping = 0;
}
const tax = 0;

// =============================================
// APPLIED DISCOUNT
// RECALCULATE WHEN CART SUBTOTAL CHANGES
// =============================================

let discountAmount = 0;

if (
    appliedCartDiscount &&
    subtotal >= Number(appliedCartDiscount.minimumOrderAmount || 0)
) {

    const discountType =
        String(
            appliedCartDiscount.type || ""
        ).toLowerCase();

    const discountValue =
        Number(
            appliedCartDiscount.value || 0
        );

    // Percentage discount
    if (discountType === "percentage") {

        discountAmount =
            subtotal *
            (discountValue / 100);
    }

    // Fixed dollar discount
    else if (discountType === "fixed") {

        discountAmount =
            discountValue;
    }

    // Never discount more than the subtotal
    discountAmount =
        Math.min(
            discountAmount,
            subtotal
        );
}

const total =
    Math.max(
        0,
        subtotal +
        shipping +
        tax -
        discountAmount
    );

    /* =============================================
       UPDATE HTML
    ============================================= */

    const subtotalLabel =
        document.getElementById(
            "cart-subtotal-label"
        );

    const subtotalElement =
        document.getElementById(
            "cart-subtotal"
        );

    const shippingElement =
        document.getElementById(
            "cart-shipping"
        );

    const taxElement =
        document.getElementById(
            "cart-tax"
        );

    const totalElement =
        document.getElementById(
            "cart-total"
        );

    const discountRow =
        document.getElementById(
            "cart-discount-row"
        );

    const discountElement =
        document.getElementById(
            "cart-discount"
        );

    if (subtotalLabel) {

        subtotalLabel.textContent =
            `Subtotal (${itemCount} ${
                itemCount === 1
                    ? "Item"
                    : "Items"
            })`;
    }

    if (subtotalElement) {

        subtotalElement.textContent =
            `$${subtotal.toFixed(2)}`;
    }

    if (shippingElement) {

        shippingElement.textContent =
            shipping === 0
                ? "FREE"
                : `$${shipping.toFixed(2)}`;
    }

    if (taxElement) {

        taxElement.textContent =
            `$${tax.toFixed(2)}`;
    }

if (
    discountRow &&
    discountElement
) {

    if (
        appliedCartDiscount &&
        discountAmount > 0
    ) {

        discountRow.hidden = false;

        discountElement.textContent =
            `-$${discountAmount.toFixed(2)}`;

    } else {

        discountRow.hidden = true;

        discountElement.textContent =
            "-$0.00";
    }
}

    if (totalElement) {

        totalElement.textContent =
            `$${total.toFixed(2)}`;
    }

    /* =============================================
       CHECKOUT BUTTON
    ============================================= */

    const checkoutButton =
        document.getElementById(
            "checkout-btn"
        );

    if (checkoutButton) {

        checkoutButton.disabled =
            cart.length === 0;
    }

    /* =============================================
       UPDATE CART COUNT
    ============================================= */

    updateCartCount();
}


// =========================================================
// DISCOUNT MESSAGE POPUP
// =========================================================

function showDiscountMessage(
    title,
    message,
    type = "error"
) {

    const popup =
        document.getElementById(
            "discount-message-popup"
        );

    const titleElement =
        document.getElementById(
            "discount-message-title"
        );

    const messageElement =
        document.getElementById(
            "discount-message-text"
        );

    const icon =
        document.getElementById(
            "discount-message-icon"
        );

    if (
        !popup ||
        !titleElement ||
        !messageElement ||
        !icon
    ) {
        return;
    }


    titleElement.textContent =
        String(title || "");

    messageElement.textContent =
        String(message || "");


    if (type === "success") {

        icon.innerHTML =
            '<i class="fa-solid fa-circle-check"></i>';

        icon.style.background =
            "#e8f5e9";

        icon.style.color =
            "#2e7d32";

    } else {

        icon.innerHTML =
            '<i class="fa-solid fa-circle-exclamation"></i>';

        icon.style.background =
            "#fbe9e9";

        icon.style.color =
            "#b42318";
    }


    popup.hidden = false;
}


function closeDiscountMessage() {

    const popup =
        document.getElementById(
            "discount-message-popup"
        );

    if (popup) {
        popup.hidden = true;
    }
}


const discountMessageClose =
    document.getElementById(
        "discount-message-close"
    );

const discountMessageOk =
    document.getElementById(
        "discount-message-ok"
    );


if (discountMessageClose) {

    discountMessageClose.addEventListener(
        "click",
        closeDiscountMessage
    );
}


if (discountMessageOk) {

    discountMessageOk.addEventListener(
        "click",
        closeDiscountMessage
    );
}

async function revalidateAppliedCartDiscount() {

    if (!appliedCartDiscount) {
        return;
    }

    const cart = getCart();

    if (cart.length === 0) {
        return;
    }

    const discountCode =
        appliedCartDiscount.code;

    try {

        const response =
            await fetch(
                "https://mtc-backend-node-production.up.railway.app/validate-discount",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        discountCode: discountCode,
                        cart: cart
                    })
                }
            );

        const data =
            await response.json();

        if (response.ok && data.success === true) {

            appliedCartDiscount = {
                code: String(data.code || discountCode),
                type: data.discountType,
                value: Number(data.discountValue || 0),
                amount: Number(data.discountAmount || 0),
                minimumOrderAmount:
                    Number(data.minimumOrderAmount || 0)
            };
        }
    } catch (error) {

        console.error(
            "❌ DISCOUNT REVALIDATION ERROR:",
            error
        );
    }
}

// =========================================================
// APPLY CART DISCOUNT
// =========================================================

const promoCodeInput =
    document.getElementById("promo-code");

const applyPromoButton =
    document.getElementById("apply-promo");


if (
    promoCodeInput &&
    applyPromoButton
) {

    applyPromoButton.addEventListener(
        "click",
        async () => {

            const discountCode =
                String(
                    promoCodeInput.value || ""
                )
                    .trim()
                    .toUpperCase();


            if (!discountCode) {

                alert(
                    "Please enter a discount code."
                );

                return;
            }


            const cart =
                getCart();


            if (!cart.length) {

                alert(
                    "Your cart is empty."
                );

                return;
            }


            try {

                applyPromoButton.disabled =
                    true;

                applyPromoButton.textContent =
                    "Applying...";


                const response =
                    await fetch(
                        "https://mtc-backend-node-production.up.railway.app/validate-discount",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                discountCode:
                                    discountCode,

                                cart:
                                    cart
                            })
                        }
                    );


                const data =
                    await response.json();

                console.log("DISCOUNT RESPONSE:", data);


                if (
                    !response.ok ||
                    data.success !== true
                ) {

                    appliedCartDiscount =
                        null;

                    await updateCartSummary();


                    throw new Error(
                        data.error ||
                        "Unable to apply discount code."
                    );
                }


                // =========================================
                // SAVE VALIDATED DISCOUNT
                // =========================================

                appliedCartDiscount = {

                    code:
                        String(
                            data.code ||
                            discountCode
                        ),

                    type:
                        data.discountType,

                    value:
                        Number(
                            data.discountValue || 0
                        ),

                    amount:
                        Number(
                            data.discountAmount || 0
                        ),

                    minimumOrderAmount:
                        Number(
                            data.minimumOrderAmount || 0
                        )
                };


                promoCodeInput.value =
                    appliedCartDiscount.code;


                await updateCartSummary();


                showDiscountMessage(
                    "Discount Applied",
                    `Discount ${appliedCartDiscount.code} was successfully applied to your order.`,
                    "success"
                );


            } catch (error) {

                console.error(
                    "❌ APPLY DISCOUNT ERROR:",
                    error
                );


               showDiscountMessage(
                    "Invalid Discount Code",
                    error.message ||
                        "This discount code is invalid.",
                    "error"
                );


            } finally {

                applyPromoButton.disabled =
                    false;

                applyPromoButton.textContent =
                    "Apply";
            }
        }
    );
}


    /* =====================================================
    MINI CART
===================================================== */

    function renderMiniCart() {

        const miniCart =
            document.getElementById(
                "mini-cart"
            );

        const miniCartItems =
            document.getElementById(
                "mini-cart-items"
            );

        const miniCartSubtotal =
            document.getElementById(
                "mini-cart-subtotal"
            );

        if (
            !miniCart ||
            !miniCartItems ||
            !miniCartSubtotal
        ) {
            return;
        }

        const cart = getCart();

        /* =========================================
       EMPTY CART
    ========================================= */

        if (cart.length === 0) {
            miniCartItems.innerHTML = `
            <div class="mini-cart-empty">
                <i class="fa-solid fa-cart-shopping"></i>
                Your cart is empty.
            </div>
        `;

            miniCartSubtotal.textContent = "$0.00";

            return;
        }

        /* =========================================
BUILD CART ITEMS
========================================= */

miniCartItems.innerHTML = cart
    .map((item) => {
        const price = Number(item.price || 0);

        const quantity = Math.max(1, Number(item.quantity || 1));

        const safeMiniCartImageURL =
            safeURL(item.image_url);

        const imageHTML = safeMiniCartImageURL
            ? `
                <div class="mini-cart-item-image">
                    <img
                        src="${escapeHTML(safeMiniCartImageURL)}"
                        alt="${escapeHTML(item.name)}">
                </div>
            `
            : `
                <div class="mini-cart-item-placeholder">
                    <i class="fa-solid fa-image"></i>
                </div>
            `;

        return `
        <div
            class="mini-cart-item"
            data-cart-item-id="${escapeHTML(item.cartItemId)}">

            ${imageHTML}

                    <div class="mini-cart-item-info">

                        <div class="mini-cart-item-name">
                            ${escapeHTML(item.name)}
                        </div>

                        ${
                            item.variantName
                                ? `
                                    <span class="mini-cart-item-variant">
                                        ${escapeHTML(item.variantName)}
                                    </span>
                                `
                                : ""
                        }

                        <div class="mini-cart-item-price">
                            $${price.toFixed(2)}
                        </div>


                        <div class="mini-cart-item-controls">

                            <button
                                type="button"
                                class="mini-cart-qty-minus"
                                data-cart-item-id="${escapeHTML(item.cartItemId)}"
                                aria-label="Decrease quantity">

                                <i class="fa-solid fa-minus"></i>

                            </button>


                            <span class="mini-cart-item-quantity">
                                ${quantity}
                            </span>


                            <button
                                type="button"
                                class="mini-cart-qty-plus"
                                data-cart-item-id="${escapeHTML(item.cartItemId)}"
                                aria-label="Increase quantity">

                                <i class="fa-solid fa-plus"></i>

                            </button>

                        </div>

                    </div>


                    <button
                        type="button"
                        class="mini-cart-remove"
                        data-cart-item-id="${escapeHTML(item.cartItemId)}"
                        aria-label="Remove ${escapeHTML(item.name)}">

                        <i class="fa-solid fa-trash-can"></i>

                    </button>

                </div>
            `;
            })
            .join("");

        /* =========================================
       SUBTOTAL
    ========================================= */

        const subtotal = cart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);

        miniCartSubtotal.textContent = `$${subtotal.toFixed(2)}`;

        /* =========================================
       MINUS BUTTONS
    ========================================= */

        miniCartItems.querySelectorAll(".mini-cart-qty-minus").forEach((button) => {
            button.addEventListener("click", () => {
                const cartItemId = button.dataset.cartItemId;

                const updatedCart = getCart();

                const item = updatedCart.find((item) => String(item.cartItemId) === String(cartItemId));

                if (!item) {
                    return;
                }

                if (Number(item.quantity || 1) <= 1) {
                    return;
                }

                item.quantity = Number(item.quantity || 1) - 1;

                saveCart(updatedCart);

                renderMiniCart();
            });
        });

        /* =========================================
       PLUS BUTTONS
    ========================================= */

        miniCartItems.querySelectorAll(".mini-cart-qty-plus").forEach((button) => {
            button.addEventListener("click", () => {
                const cartItemId = button.dataset.cartItemId;

                const updatedCart = getCart();

                const item = updatedCart.find((item) => String(item.cartItemId) === String(cartItemId));

                if (!item) {
                    return;
                }

                const product = products.find((product) => String(product.id) === String(item.productId));

                if (product) {
                    const availableStock = getProductStock(product);

                    if (
                        product.is_preorder !== true &&
                        availableStock !== null &&
                        Number(item.quantity || 1) >= availableStock
                    ) {
                        return;
                    }
                }

                item.quantity = Number(item.quantity || 1) + 1;

                saveCart(updatedCart);

                renderMiniCart();
            });
        });

        /* =========================================
       TRASH BUTTONS
    ========================================= */

        miniCartItems.querySelectorAll(".mini-cart-remove").forEach((button) => {
            button.addEventListener("click", () => {
                const cartItemId = button.dataset.cartItemId;

                let updatedCart = getCart();

                updatedCart = updatedCart.filter((item) => String(item.cartItemId) !== String(cartItemId));

                saveCart(updatedCart);

                renderMiniCart();
            });
        });
    }

    /* =====================================================
    MINI CART CLOSE EVENTS
===================================================== */

    const miniCart = document.getElementById("mini-cart");

    const miniCartClose = document.getElementById("mini-cart-close");

    const miniCartContinue = document.getElementById("mini-cart-continue");

    if (miniCart && miniCartClose) {
        miniCartClose.addEventListener("click", () => {
            miniCart.hidden = true;
        });
    }

    if (miniCart && miniCartContinue) {
        miniCartContinue.addEventListener("click", () => {
            miniCart.hidden = true;
        });
    }

    /* =====================================================
    CART BUTTON EVENTS
===================================================== */
    function attachCartEvents() {
        const cartButtons = document.querySelectorAll(
            ".store-add-cart-btn:not(:disabled), .add-to-cart-btn:not(:disabled)"
        );

        cartButtons.forEach((button) => {
            button.addEventListener("click", (event) => {
                const productId = event.currentTarget.dataset.id;
                const variantId = event.currentTarget.dataset.variantId || null;

                const quantityElement = document.querySelector(`.store-qty-value[data-product-id="${productId}"]`);

                const selectedQuantity = quantityElement ? Math.max(1, Number(quantityElement.value || 1)) : 1;

                addToCart(productId, variantId, selectedQuantity);
            });
        });

        document.querySelectorAll(".store-qty-minus").forEach((button) => {
            button.addEventListener("click", () => {
                const productId = button.dataset.productId;

                const quantityElement = document.querySelector(`.store-qty-value[data-product-id="${productId}"]`);

                if (!quantityElement) return;

                let quantity = Number(quantityElement.value || 1);

                quantity = Math.max(1, quantity - 1);

                quantityElement.value = quantity;
            });
        });

        document.querySelectorAll(".store-qty-plus").forEach((button) => {
            button.addEventListener("click", (event) => {
                const productId = event.currentTarget.dataset.productId;

                const product = products.find((item) => String(item.id) === String(productId));

                if (!product) {
                    return;
                }

                const quantityElement = document.querySelector(`.store-qty-value[data-product-id="${productId}"]`);

                if (!quantityElement) {
                    return;
                }

                const currentQuantity = Math.max(1, Number(quantityElement.value || 1));

                const availableStock = getProductStock(product);

                if (product.is_preorder !== true && availableStock !== null && currentQuantity >= availableStock) {
                    return;
                }

                quantityElement.value = currentQuantity + 1;
            });
        });
    }

    /* =====================================================
    RESET FILTERS
===================================================== */

    function resetFilters() {
        selectedSearch = "";
        selectedCategory = "all";
        selectedPrice = "all";
        selectedAvailability = "all";
        selectedSort = "featured";

        if (productSearch) {
            productSearch.value = "";
        }

        if (categoryFilter) {
            categoryFilter.value = "all";
        }

        if (priceFilter) {
            priceFilter.value = "all";
        }

        if (availabilityFilter) {
            availabilityFilter.value = "all";
        }

        if (sortProductsSelect) {
            sortProductsSelect.value = "featured";
        }

        renderProducts();
    }

    /* =====================================================
    SEARCH
===================================================== */
    if (productSearch) {
        productSearch.addEventListener("input", (event) => {
            selectedSearch = event.target.value;
            renderProducts();
        });
    }

    /* =====================================================
    CATEGORY FILTER
===================================================== */
    if (categoryFilter) {
        categoryFilter.addEventListener("change", (event) => {
            selectedCategory = event.target.value;
            renderProducts();
        });
    }

    /* =====================================================
    PRICE FILTER
===================================================== */
    if (priceFilter) {
        priceFilter.addEventListener("change", (event) => {
            selectedPrice = event.target.value;
            renderProducts();
        });
    }

    /* =====================================================
    AVAILABILITY FILTER
===================================================== */
    if (availabilityFilter) {
        availabilityFilter.addEventListener("change", (event) => {
            selectedAvailability = event.target.value;
            renderProducts();
        });
    }

    /* =====================================================
    SORT
===================================================== */
    if (sortProductsSelect) {
        sortProductsSelect.addEventListener("change", (event) => {
            selectedSort = event.target.value;
            renderProducts();
        });
    }

    /* =====================================================
    CLEAR FILTERS
===================================================== */

if (clearStoreFilters) {
    clearStoreFilters.addEventListener("click", resetFilters);
}

if (clearStoreFiltersEmpty) {
    clearStoreFiltersEmpty.addEventListener("click", resetFilters);
}


/* =====================================================
    SHIPPING ADDRESS + STRIPE CHECKOUT
===================================================== */

const checkoutButton =
    document.getElementById("checkout-btn");
    
const paypalButton =
    document.getElementById("paypal-btn");
    console.log("PAYPAL BUTTON FOUND:", paypalButton);

const shippingAddressModal =
    document.getElementById("shipping-address-modal");

const shippingAddressClose =
    document.getElementById("shipping-address-close");

const shippingAddressForm =
    document.getElementById("shipping-address-form");

const shippingAddressError =
    document.getElementById("shipping-address-error");

const shippingAddressContinue =
    document.getElementById("shipping-address-continue");

let checkoutShippingAddress = null;

let checkoutPaymentMethod = "stripe";


/* =====================================================
    OPEN SHIPPING ADDRESS MODAL
===================================================== */

function openShippingAddressModal() {

    if (!shippingAddressModal) {
        console.error(
            "Shipping address modal was not found."
        );

        return;
    }

    if (shippingAddressError) {
        shippingAddressError.hidden = true;
        shippingAddressError.textContent = "";
    }

    shippingAddressModal.hidden = false;
}


/* =====================================================
    CLOSE SHIPPING ADDRESS MODAL
===================================================== */

function closeShippingAddressModal() {

    if (!shippingAddressModal) {
        return;
    }

    shippingAddressModal.hidden = true;
}


/* =====================================================
    CLOSE BUTTON
===================================================== */

shippingAddressClose?.addEventListener(
    "click",
    closeShippingAddressModal
);


/* =====================================================
    CLOSE WHEN CLICKING OVERLAY
===================================================== */

shippingAddressModal
    ?.querySelector(".shipping-address-overlay")
    ?.addEventListener(
        "click",
        closeShippingAddressModal
    );


/* =====================================================
    CREATE STRIPE CHECKOUT
===================================================== */

async function startStoreCheckout() {

    const cart = getCart();

    if (!cart.length) {
        alert("Your cart is empty.");
        return;
    }

    if (!selectedCartShippingMethod?.id) {
        alert("Please select a shipping method.");
        return;
    }

    try {

        checkoutButton.disabled = true;

        checkoutButton.textContent =
            "Loading Checkout...";

        if (shippingAddressContinue) {
            shippingAddressContinue.disabled = true;

            shippingAddressContinue.textContent =
                "Checking Address...";
        }

        const response = await fetch(
            "https://mtc-backend-node-production.up.railway.app/create-store-checkout-session",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                },

                body: JSON.stringify({
                    cart,

                    shippingMethodId:
                        selectedCartShippingMethod.id,

                    shippingAddress:
                        checkoutShippingAddress,

                    discountCode:
                        appliedCartDiscount?.code || null,
                }),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Unable to create checkout session."
            );
        }

        if (!data.url) {
            throw new Error(
                "Stripe checkout URL was not returned."
            );
        }

        window.location.href = data.url;

    } catch (error) {

        console.error(
            "❌ CHECKOUT ERROR:",
            error
        );

        if (
            shippingAddressModal &&
            shippingAddressModal.hidden === false &&
            shippingAddressError
        ) {

            shippingAddressError.textContent =
                error.message;

            shippingAddressError.hidden = false;

        } else {

            alert(error.message);
        }

        checkoutButton.disabled = false;

        checkoutButton.textContent =
            "Proceed To Checkout";

        if (shippingAddressContinue) {

            shippingAddressContinue.disabled = false;

            shippingAddressContinue.textContent =
                "Continue To Payment";
        }
    }
}

/* =====================================================
    START PAYPAL CHECKOUT
===================================================== */

async function startPayPalCheckout() {

    const cart = getCart();

    if (!cart.length) {
        alert("Your cart is empty.");
        return;
    }

    if (!selectedCartShippingMethod?.id) {
        alert("Please select a shipping method.");
        return;
    }

    try {

        console.log(
            "STARTING PAYPAL CHECKOUT"
        );

        const response = await fetch(
            "https://mtc-backend-node-production.up.railway.app/create-paypal-order",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    cart,
                    shippingMethodId:
                        selectedCartShippingMethod.id,
                    shippingAddress:
                        checkoutShippingAddress,
                    discountCode:
                        appliedCartDiscount?.code || null
                })
            }
        );

        const data = await response.json();

        console.log(
            "PAYPAL BACKEND RESPONSE:",
            data
        );

        if (!response.ok || !data.success) {
            throw new Error(
                data.error || "Unable to start PayPal checkout."
            );
        }

        if (!data.approvalUrl) {
            throw new Error(
                "PayPal approval URL was not returned."
            );
        }

        window.location.href = data.approvalUrl;

    } catch (error) {

        console.error(
            "PAYPAL CHECKOUT ERROR:",
            error
        );
    }
}

/* =====================================================
    PROCEED TO CHECKOUT BUTTON
===================================================== */

if (checkoutButton) {

    checkoutButton.addEventListener(
        "click",
        async () => {

    checkoutPaymentMethod = "stripe";

            const cart = getCart();

            if (!cart.length) {
                alert("Your cart is empty.");
                return;
            }

            if (!selectedCartShippingMethod?.id) {
                alert(
                    "Please select a shipping method."
                );

                return;
            }

            /* =========================================
               LOCAL PICKUP
            ========================================= */

            if (
                selectedCartShippingMethod
                    .is_local_pickup === true ||
                selectedCartShippingMethod.id ===
                    "local-pickup"
            ) {

                checkoutShippingAddress = null;

                await startStoreCheckout();

                return;
            }

            /* =========================================
               SHIPPING ORDER
            ========================================= */

            openShippingAddressModal();
        }
    );
}

/* =====================================================
    PAYPAL CHECKOUT BUTTON
===================================================== */

if (paypalButton) {

    paypalButton.addEventListener(
        "click",
        async () => {

    checkoutPaymentMethod = "paypal";

            const cart = getCart();

            if (!cart.length) {
                alert("Your cart is empty.");
                return;
            }

            if (!selectedCartShippingMethod?.id) {
                alert(
                    "Please select a shipping method."
                );

                return;
            }

            /* =========================================
            LOCAL PICKUP
            ========================================= */

            if (
                selectedCartShippingMethod.is_local_pickup === true ||
                selectedCartShippingMethod.id === "local-pickup"
            ) {

                checkoutShippingAddress = null;

                console.log(
                    "PAYPAL READY - LOCAL PICKUP"
                );
                await startPayPalCheckout();
                return;
            }

            /* =========================================
            SHIPPING ORDER
            ========================================= */

            openShippingAddressModal();
        }
    );
}

/* =====================================================
    SHIPPING ADDRESS FORM
===================================================== */

shippingAddressForm?.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const firstName =
            document
                .getElementById(
                    "shipping-first-name"
                )
                ?.value.trim() || "";

        const lastName =
            document
                .getElementById(
                    "shipping-last-name"
                )
                ?.value.trim() || "";

        const line1 =
            document
                .getElementById(
                    "shipping-address-line1"
                )
                ?.value.trim() || "";

        const line2 =
            document
                .getElementById(
                    "shipping-address-line2"
                )
                ?.value.trim() || "";

        const city =
            document
                .getElementById(
                    "shipping-city"
                )
                ?.value.trim() || "";

        const state =
            document
                .getElementById(
                    "shipping-state"
                )
                ?.value.trim()
                .toUpperCase() || "";

        const postalCode =
            document
                .getElementById(
                    "shipping-zip"
                )
                ?.value.trim() || "";

        if (
            !firstName ||
            !lastName ||
            !line1 ||
            !city ||
            !state ||
            !postalCode
        ) {

            if (shippingAddressError) {

                shippingAddressError.textContent =
                    "Please complete your shipping address.";

                shippingAddressError.hidden = false;
            }

            return;
        }

        checkoutShippingAddress = {
            firstName,
            lastName,
            line1,
            line2,
            city,
            state,
            postalCode,
            country: "US",
        };

        if (shippingAddressError) {
            shippingAddressError.hidden = true;
            shippingAddressError.textContent = "";
        }

        if (checkoutPaymentMethod === "paypal") {

            await startPayPalCheckout();

        } else {

            await startStoreCheckout();

        }
    }
);

/* =====================================================
    INITIALIZATION
===================================================== */

await loadCategories();
await loadProducts();
await loadStoreReviews();
updateCartCount();

await loadCartShippingMethods();

renderShoppingCart();

function getCarrierTrackingUrl(carrier, trackingNumber) {

    if (!carrier || !trackingNumber) {
        return null;
    }

    const normalizedCarrier =
        String(carrier)
            .trim()
            .toLowerCase();

    const tracking =
        encodeURIComponent(
            String(trackingNumber).trim()
        );

    // USPS
    if (normalizedCarrier === "usps") {
        return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`;
    }

    // UPS
    if (normalizedCarrier === "ups") {
        return `https://www.ups.com/track?loc=en_US&tracknum=${tracking}`;
    }

    // FEDEX
    if (
        normalizedCarrier === "fedex" ||
        normalizedCarrier === "fed ex"
    ) {
        return `https://www.fedex.com/fedextrack/?trknbr=${tracking}`;
    }

    // DHL
    if (
        normalizedCarrier === "dhl" ||
        normalizedCarrier === "dhl express"
    ) {
        return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${tracking}`;
    }

    return null;
}

    /* =====================================================
   TRACK ORDER PAGE
===================================================== */

    const trackOrderForm = document.getElementById("track-order-form");

    if (trackOrderForm) {
        trackOrderForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const orderNumber = document.getElementById("order-number").value.trim();

            const email = document.getElementById("order-email").value.trim();

            const result = document.getElementById("track-order-result");

            result.innerHTML = `
            <div class="track-order-loading">
                <i class="fa-solid fa-spinner fa-spin"></i>
                Looking up your order...
            </div>
        `;

            try {
                const response = await fetch("https://mtc-backend-node-production.up.railway.app/track-order", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        orderNumber,
                        email,
                    }),
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.error || "Unable to find that order.");
                }

                const order = data.order;
                const shipping = order.shipping;
                const trackingUrl = getCarrierTrackingUrl(shipping?.carrier, shipping?.tracking_number);
                result.innerHTML = `
                <div class="track-order-status-card">

                    <h3>
                        Order ${escapeHTML(order.orderNumber)}
                    </h3>

                    <div class="track-order-status-grid">

                        <div>
                            <span>Order Status</span>
                            <strong>
                                ${escapeHTML(
                                    (order.orderStatus || "pending")
                                        .replace(/\b\w/g, letter => letter.toUpperCase())
                                )}
                            </strong>
                        </div>

                        <div>
                            <span>Payment Status</span>
                            <strong>
                                ${escapeHTML(order.paymentStatus || "pending")}
                            </strong>
                        </div>

                        <div>
                            <span>Shipping Status</span>
                            <strong>
                                ${escapeHTML(shipping?.shipping_status || "pending")}
                            </strong>
                        </div>

                        <div>
                            <span>Shipping Method</span>
                            <strong>
                                ${escapeHTML(shipping?.shipping_method || "Not available")}
                            </strong>
                        </div>

                        <div>
                            <span>Carrier</span>
                            <strong>
                                ${escapeHTML(shipping?.carrier || "Not assigned yet")}
                            </strong>
                        </div>

                        <div>
    <span>View Tracking Number</span>

    ${
        trackingUrl
            ? `
                <a
                    class="carrier-tracking-link"
                    href="${trackingUrl}"
                    target="_blank"
                    rel="noopener noreferrer">

                    ${escapeHTML(shipping.tracking_number)}

                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                </a>
            `
            : `
                <strong>
                    ${escapeHTML(shipping?.tracking_number || "Not available yet")}
                </strong>
            `
    }
</div>

                    </div>

                </div>
            `;
            } catch (error) {
                result.innerHTML = `
                <div class="track-order-error">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    ${escapeHTML(error.message)}
                </div>
            `;
            }
        });
    }

    /* =====================================================
   PRODUCT DETAIL PAGE
===================================================== */

    const productDetailContent = document.getElementById("product-detail-content");

    if (productDetailContent) {
        const productDetailLoading = document.getElementById("product-detail-loading");

        const productNotFound = document.getElementById("product-not-found");

        const productReviewsSection = document.getElementById("product-reviews-section");

        const productMainImage = document.getElementById("product-main-image");

        const productThumbnailList = document.getElementById("product-thumbnail-list");

        const productStockStatus = document.getElementById("product-stock-status");

        const productCategoryElement = document.getElementById("product-category");

        const productNameElement = document.getElementById("product-name");

        const productPriceElement = document.getElementById("product-price");

        const productComparePrice = document.getElementById("product-compare-price");

        const productDescriptionElement = document.getElementById("product-description");

        const productVariantSection = document.getElementById("product-variant-section");

        const productVariantSelect = document.getElementById("product-variant-select");

        const productQtyMinus = document.getElementById("product-qty-minus");

        const productQtyPlus = document.getElementById("product-qty-plus");

        const productQtyValue = document.getElementById("product-qty-value");

        const productAddToCart = document.getElementById("product-add-to-cart");

        const productRatingStars = document.getElementById("product-rating-stars");

        const productRatingText = document.getElementById("product-rating-text");

        const reviewsAverageRating = document.getElementById("reviews-average-rating");

        const reviewsAverageStars = document.getElementById("reviews-average-stars");

        const reviewsCount = document.getElementById("reviews-count");

        const productReviewsList = document.getElementById("product-reviews-list");

        const productNoReviews = document.getElementById("product-no-reviews");

        const productReviewForm = document.getElementById("product-review-form");

        const reviewStarSelector = document.getElementById("review-star-selector");

        const reviewRatingInput = document.getElementById("review-rating");

        const reviewSubmitResult = document.getElementById("review-submit-result");

        /* =====================================================
       PRODUCT DETAIL STATE
    ===================================================== */

        let detailProduct = null;
        let detailVariants = [];
        let detailVariant = null;
        let detailInventory = [];
        let detailImages = [];
        let detailReviews = [];

        const DETAIL_REVIEWS_PER_PAGE = 5;

        let detailReviewsCurrentPage = 1;

        let detailQuantity = 1;
        let detailRating = 0;

        /* =====================================================
       PRODUCT NOT FOUND
    ===================================================== */

        function showDetailNotFound() {
            if (productDetailLoading) {
                productDetailLoading.hidden = true;
            }

            if (productDetailContent) {
                productDetailContent.hidden = true;
            }

            if (productReviewsSection) {
                productReviewsSection.hidden = true;
            }

            if (productNotFound) {
                productNotFound.hidden = false;
            }
        }

        /* =====================================================
       GET PRODUCT FROM URL
    ===================================================== */

        function getDetailIdentifier() {
            const params = new URLSearchParams(window.location.search);

            return params.get("product") || params.get("id") || null;
        }

        /* =====================================================
       CREATE STARS
    ===================================================== */

        function detailStars(rating) {
            const rounded = Math.round(Number(rating || 0));

            let html = "";

            for (let star = 1; star <= 5; star++) {
                if (star <= rounded) {
                    html += `
                    <i class="fa-solid fa-star"></i>
                `;
                } else {
                    html += `
                    <i class="fa-regular fa-star"></i>
                `;
                }
            }

            return html;
        }

        /* =====================================================
       GET PRODUCT STOCK
    ===================================================== */

        function getDetailStock() {
            /*
            INVENTORY TABLE FIRST
        */

            if (detailInventory.length > 0) {
                if (detailVariant) {
                    const variantInventory = detailInventory.find(
                        (item) => String(item.variant_id) === String(detailVariant.id)
                    );

                    if (variantInventory) {
                        return Math.max(
                            0,
                            Number(variantInventory.quantity || 0) - Number(variantInventory.reserved_quantity || 0)
                        );
                    }
                }

                const generalInventory = detailInventory.find((item) => !item.variant_id);

                if (generalInventory) {
                    return Math.max(
                        0,
                        Number(generalInventory.quantity || 0) - Number(generalInventory.reserved_quantity || 0)
                    );
                }
            }

            /*
            FALLBACK TO VARIANT STOCK
        */

            if (detailVariant) {
                return Number(detailVariant.stock_quantity || 0);
            }

            return null;
        }

        /* =====================================================
       GET PRODUCT PRICE
    ===================================================== */

        function getDetailPrice() {
            if (detailVariant) {
                return Number(detailVariant.price || 0);
            }

            return Number(detailProduct?.price || 0);
        }

        /* =====================================================
       UPDATE PRICE
    ===================================================== */

        function updateDetailPrice() {
            const price = getDetailPrice();

            productPriceElement.textContent = `$${price.toFixed(2)}`;

            const compare = Number(detailProduct?.compare_at_price || 0);

            if (compare > price) {
                productComparePrice.textContent = `$${compare.toFixed(2)}`;
            } else {
                productComparePrice.textContent = "";
            }
        }

        /* =====================================================
       UPDATE STOCK
    ===================================================== */

        function updateDetailStock() {
            const stock = getDetailStock();

            /* PREORDER */

            if (detailProduct?.is_preorder === true) {
                productStockStatus.textContent = "Preorder";

                productStockStatus.className = "product-stock-status preorder";

                productAddToCart.disabled = false;

                productAddToCart.innerHTML = `
                <i class="fa-solid fa-cart-shopping"></i>
                Preorder
            `;

                return;
            }

            /* SOLD OUT */

            if (stock !== null && stock <= 0) {
                productStockStatus.textContent = "Out of Stock";

                productStockStatus.className = "product-stock-status soldout";

                productAddToCart.disabled = true;

                productAddToCart.innerHTML = `
                <i class="fa-solid fa-ban"></i>
                Sold Out
            `;

                return;
            }

            /* LOW STOCK */

            if (stock !== null && stock <= 5) {
                productStockStatus.textContent = `Low Stock - ${stock} Left`;
            } else {
                productStockStatus.textContent = "In Stock";
            }

            productStockStatus.className = "product-stock-status";

            productAddToCart.disabled = false;

            productAddToCart.innerHTML = `
            <i class="fa-solid fa-cart-shopping"></i>
            Add to Cart
        `;
        }

        /* =====================================================
PRODUCT IMAGES
===================================================== */

function renderDetailImages() {
    let images = [...detailImages];

    if (images.length === 0 && detailProduct?.image_url) {
        images = [
            {
                image_url: detailProduct.image_url,

                alt_text: detailProduct.product_name || detailProduct.name,

                is_primary: true,
            },
        ];
    }

    images = images.filter((image) =>
        safeURL(image.image_url)
    );

    if (images.length === 0) {
        productMainImage.removeAttribute("src");

        productMainImage.alt = "No image available";

        return;
    }

    const primaryImage =
        images.find((image) => image.is_primary === true) ||
        images[0];

    productMainImage.src =
        safeURL(primaryImage.image_url);

    productMainImage.alt =
        primaryImage.alt_text ||
        detailProduct.product_name ||
        detailProduct.name ||
        "Product image";

            productThumbnailList.innerHTML = images
    .map((image, index) => {
        const safeThumbnailURL =
            safeURL(image.image_url);

        if (!safeThumbnailURL) {
            return "";
        }

        return `
        <button
            type="button"
            class="product-thumbnail-button ${index === 0 ? "active" : ""}"
            data-image-index="${index}"
            aria-label="View product image ${index + 1}"
        >
            <img
                src="${escapeHTML(safeThumbnailURL)}"
                alt="${escapeHTML(
                    image.alt_text ||
                    detailProduct.product_name ||
                    detailProduct.name ||
                    "Product image"
                )}"
            >
        </button>
    `;
    })
    .join("");

            productThumbnailList.querySelectorAll(".product-thumbnail-button").forEach((button) => {
    button.addEventListener("click", () => {
        const image = images[Number(button.dataset.imageIndex)];

        if (!image) {
            return;
        }

        const safeImageURL =
            safeURL(image.image_url);

        if (!safeImageURL) {
            return;
        }

        productMainImage.src = safeImageURL;

        productMainImage.alt =
            image.alt_text ||
            detailProduct.product_name ||
            detailProduct.name ||
            "Product image";

        productThumbnailList.querySelectorAll(".product-thumbnail-button").forEach((item) => {
            item.classList.remove("active");
        });

        button.classList.add("active");
    });
});
        }

        /* =====================================================
       PRODUCT VARIANTS
    ===================================================== */

        function renderDetailVariants() {
            if (detailVariants.length <= 1) {
                productVariantSection.hidden = true;

                return;
            }

            productVariantSection.hidden = false;

            productVariantSelect.innerHTML = detailVariants
                .map((variant) => {
                    const stock = Number(variant.stock_quantity || 0);

                    return `
                        <option
                            value="${escapeHTML(variant.id)}"
                        >
                            ${escapeHTML(variant.variant_name || "Default")}

                            ${stock <= 0 ? " - Sold Out" : ""}
                        </option>
                    `;
                })
                .join("");

            if (detailVariant) {
                productVariantSelect.value = detailVariant.id;
            }

            productVariantSelect.addEventListener("change", () => {
                detailVariant =
                    detailVariants.find((variant) => String(variant.id) === String(productVariantSelect.value)) || null;

                detailQuantity = 1;

                productQtyValue.textContent = "1";

                updateDetailPrice();
                updateDetailStock();
            });
        }

        /* =====================================================
       REVIEW SUMMARY
    ===================================================== */

        function renderDetailReviewSummary() {
            const count = detailReviews.length;

            if (count === 0) {
                productRatingStars.innerHTML = detailStars(0);

                productRatingText.textContent = "No reviews yet";

                reviewsAverageRating.textContent = "0.0";

                reviewsAverageStars.innerHTML = detailStars(0);

                reviewsCount.textContent = "0 reviews";

                return;
            }

            const average = detailReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count;

            productRatingStars.innerHTML = detailStars(average);

            productRatingText.textContent = `${average.toFixed(1)} (${count} ${count === 1 ? "review" : "reviews"})`;

            reviewsAverageRating.textContent = average.toFixed(1);

            reviewsAverageStars.innerHTML = detailStars(average);

            reviewsCount.textContent = `${count} ${count === 1 ? "review" : "reviews"}`;
        }

        /* =====================================================
       DISPLAY REVIEWS
    ===================================================== */

        function renderDetailReviews() {
            if (detailReviews.length === 0) {
                productReviewsList.innerHTML = "";

                productNoReviews.hidden = false;

                return;
            }

            productNoReviews.hidden = true;

            const startIndex = (detailReviewsCurrentPage - 1) * DETAIL_REVIEWS_PER_PAGE;

            const endIndex = startIndex + DETAIL_REVIEWS_PER_PAGE;

            const reviewsForCurrentPage = detailReviews.slice(startIndex, endIndex);

            productReviewsList.innerHTML = reviewsForCurrentPage
                .map((review) => {
                    const date = new Date(review.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                    });

                    return `
                        <article class="product-review-item">

                            <div class="review-customer-row">

                                <div>

                                    <span class="review-customer-name">
                                        Customer
                                    </span>

                                    ${
                                        review.is_verified_purchase
                                            ? `
                                                <span class="review-verified">

                                                    <i class="fa-solid fa-circle-check"></i>

                                                    Verified Purchase

                                                </span>
                                            `
                                            : ""
                                    }

                                </div>

                                <span class="review-date">

                                    ${escapeHTML(date)}

                                </span>

                            </div>


                            <div class="review-stars">

                                ${detailStars(review.rating)}

                            </div>


                            ${
                                review.title
                                    ? `
                                        <h3 class="review-title">

                                            ${escapeHTML(review.title)}

                                        </h3>
                                    `
                                    : ""
                            }


                            <p class="review-comment">

                                ${escapeHTML(review.comment)}

                            </p>

                        </article>
                    `;
                })
                .join("");
            const totalPages = Math.ceil(detailReviews.length / DETAIL_REVIEWS_PER_PAGE);

            if (totalPages > 1) {
                productReviewsList.innerHTML += `
                <div class="product-reviews-pagination">

                    <button
                        type="button"
                        class="product-reviews-page-button"
                        data-review-page="previous"
                        ${detailReviewsCurrentPage === 1 ? "disabled" : ""}
                    >
                        <i class="fa-solid fa-chevron-left"></i>
                        Previous
                    </button>

                    <div class="product-reviews-page-numbers">

                        ${Array.from(
                            {
                                length: totalPages,
                            },
                            (_, index) => {
                                const page = index + 1;

                                return `
                                    <button
                                        type="button"
                                        class="product-reviews-page-number ${
                                            page === detailReviewsCurrentPage ? "active" : ""
                                        }"
                                        data-review-page="${page}"
                                    >
                                        ${page}
                                    </button>
                                `;
                            }
                        ).join("")}

                    </div>

                    <button
                        type="button"
                        class="product-reviews-page-button"
                        data-review-page="next"
                        ${detailReviewsCurrentPage === totalPages ? "disabled" : ""}
                    >
                        Next
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>

                </div>
            `;
            }
        }

        productReviewsList.addEventListener("click", (event) => {
            const button = event.target.closest("[data-review-page]");

            if (!button) {
                return;
            }

            const totalPages = Math.ceil(detailReviews.length / DETAIL_REVIEWS_PER_PAGE);

            const pageValue = button.dataset.reviewPage;

            if (pageValue === "previous") {
                detailReviewsCurrentPage = Math.max(1, detailReviewsCurrentPage - 1);
            } else if (pageValue === "next") {
                detailReviewsCurrentPage = Math.min(totalPages, detailReviewsCurrentPage + 1);
            } else {
                const selectedPage = Number(pageValue);

                if (Number.isInteger(selectedPage) && selectedPage >= 1 && selectedPage <= totalPages) {
                    detailReviewsCurrentPage = selectedPage;
                }
            }

            renderDetailReviews();
        });
        /* =====================================================
       LOAD PRODUCT DETAIL
    ===================================================== */

        async function loadDetailPage() {
            const identifier = getDetailIdentifier();
            if (!identifier) {
                showDetailNotFound();
                return;
            }
            let query = supabase
                .from("Products")
                .select(
                    `
                    id,
                    sku,
                    product_name,
                    description,
                    category_id,
                    condition,
                    price,
                    compare_at_price,
                    is_active,
                    is_featured,
                    is_preorder,
                    weight,
                    image_url,
                    created_at
                `
                )
                .eq("is_active", true);

            const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                identifier
            );

            if (looksLikeUuid) {
                query = query.eq("id", identifier);
            } else {
                query = query.eq("slug", identifier);
            }

            const { data: productData, error: productError } = await query.maybeSingle();

            if (productError || !productData) {
                console.error("❌ PRODUCT DETAIL ERROR:", productError);

                showDetailNotFound();

                return;
            }

            detailProduct = productData;

            /* =================================================
           LOAD EVERYTHING FOR PRODUCT
        ================================================= */

            const [categoryResult, imageResult, variantResult, inventoryResult, reviewResult] = await Promise.all([
                /* CATEGORY */

                detailProduct.category_id
                    ? supabase.from("Categories").select("id, name").eq("id", detailProduct.category_id).maybeSingle()
                    : Promise.resolve({
                          data: null,
                          error: null,
                      }),

                /* IMAGES */

                supabase
                    .from("Product_images")
                    .select(
                        `
                        id,
                        product_id,
                        image_url,
                        alt_text,
                        sort_order,
                        is_primary
                    `
                    )
                    .eq("product_id", detailProduct.id)
                    .order("sort_order", {
                        ascending: true,
                    }),

                /* VARIANTS */

                supabase
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
                    .eq("product_id", detailProduct.id)
                    .eq("is_active", true),

                /* INVENTORY */

                supabase
                    .from("Inventory")
                    .select(
                        `
                        id,
                        product_id,
                        variant_id,
                        quantity,
                        reserved_quantity,
                        low_stock_threshold,
                        location
                    `
                    )
                    .eq("product_id", detailProduct.id),

                /* REVIEWS */

                supabase
                    .from("Reviews")
                    .select(
                        `
                        id,
                        product_id,
                        customer_id,
                        rating,
                        title,
                        comment,
                        is_verified_purchase,
                        is_approved,
                        created_at
                    `
                    )
                    .eq("product_id", detailProduct.id)
                    .eq("is_approved", true)
                    .order("created_at", {
                        ascending: false,
                    }),
            ]);

            detailProduct.category = categoryResult.data || null;

            detailImages = imageResult.data || [];

            detailVariants = variantResult.data || [];

            detailInventory = inventoryResult.data || [];

            detailReviews = reviewResult.data || [];

            detailVariant =
                detailVariants.find((variant) => Number(variant.stock_quantity || 0) > 0) || detailVariants[0] || null;

            /* =================================================
           SHOW PAGE
        ================================================= */

            productDetailLoading.hidden = true;

            productDetailContent.hidden = false;

            productReviewsSection.hidden = false;

            productNameElement.textContent = detailProduct.product_name;

            productCategoryElement.textContent = detailProduct.category?.name || "Collectible";

            productDescriptionElement.textContent =
                detailProduct.description || "Explore this product from Midwest Toy Connections.";

            document.title = `${detailProduct.name} | Midwest Toy Connections`;

            renderDetailImages();
            renderDetailVariants();
            updateDetailPrice();
            updateDetailStock();
            renderDetailReviewSummary();
            renderDetailReviews();
        }

        /* =====================================================
       QUANTITY MINUS
    ===================================================== */

        productQtyMinus?.addEventListener("click", () => {
            detailQuantity = Math.max(1, detailQuantity - 1);

            productQtyValue.value = detailQuantity;
        });

        /* =====================================================
       QUANTITY PLUS
    ===================================================== */

        productQtyPlus?.addEventListener("click", () => {
            const stock = getDetailStock();

            if (detailProduct?.is_preorder !== true && stock !== null && detailQuantity >= stock) {
                return;
            }

            detailQuantity += 1;

            productQtyValue.value = detailQuantity;
        });

        productQtyValue?.addEventListener("input", () => {
            // Allow the field to be temporarily empty
            // while the customer is typing a new quantity.
            if (productQtyValue.value === "") {
                return;
            }

            const stock = getDetailStock();

            let quantity = Number(productQtyValue.value);

            if (!Number.isFinite(quantity)) {
                return;
            }

            quantity = Math.max(1, Math.floor(quantity));

            if (detailProduct?.is_preorder !== true && stock !== null) {
                quantity = Math.min(quantity, stock);
            }

            detailQuantity = quantity;

            productQtyValue.value = detailQuantity;
        });
        /* =====================================================
   ADD DETAIL PRODUCT TO CART
===================================================== */

        productAddToCart?.addEventListener("click", () => {
            if (!detailProduct) {
                return;
            }

            const stock = getDetailStock();

            /* GET MANUALLY ENTERED QUANTITY */

            let enteredQuantity = Number(productQtyValue.value);

            if (!Number.isFinite(enteredQuantity) || enteredQuantity < 1) {
                enteredQuantity = 1;
            }

            enteredQuantity = Math.floor(enteredQuantity);

            if (detailProduct.is_preorder !== true && stock !== null && stock > 0) {
                enteredQuantity = Math.min(enteredQuantity, stock);
            }

            detailQuantity = enteredQuantity;

            productQtyValue.value = detailQuantity;

            const cart = getCart();

            const cartItemId = detailVariant ? `${detailProduct.id}_${detailVariant.id}` : `${detailProduct.id}`;

            const existingItem = cart.find((item) => String(item.cartItemId) === String(cartItemId));

            const alreadyInCart = existingItem ? Number(existingItem.quantity || 0) : 0;

            if (detailProduct.is_preorder !== true && stock !== null && alreadyInCart + detailQuantity > stock) {
                console.log("detailProduct:", detailProduct);
                alert(`Only ${stock} of ${productNameElement.textContent.trim()} are available.`);

                return;
            }

            if (existingItem) {
                existingItem.quantity += detailQuantity;
            } else {
                cart.push({
                    cartItemId,

                    productId: detailProduct.id,

                    variantId: detailVariant ? detailVariant.id : null,

                    sku: detailVariant?.sku || detailProduct.sku || null,

                    name: detailProduct.name,

                    variantName: detailVariant?.variant_name || null,

                    price: getDetailPrice(),

                    quantity: detailQuantity,

                    image_url: productMainImage?.src || detailProduct.image_url || null,
                });
            }

            saveCart(cart);

            window.location.href = "mw-shoppingcart.html";
        });

        /* =====================================================
       REVIEW STAR SELECTOR
    ===================================================== */
        if (reviewStarSelector) {
            const starButtons = reviewStarSelector.querySelectorAll("button");
            starButtons.forEach((button) => {
                button.addEventListener("click", () => {
                    detailRating = Number(button.dataset.rating);
                    reviewRatingInput.value = detailRating;
                    starButtons.forEach((starButton) => {
                        const starRating = Number(starButton.dataset.rating);
                        const icon = starButton.querySelector("i");
                        if (starRating <= detailRating) {
                            starButton.classList.add("active");
                            icon.className = "fa-solid fa-star";
                        } else {
                            starButton.classList.remove("active");
                            icon.className = "fa-regular fa-star";
                        }
                    });
                });
            });
        }

        /* =====================================================
       SUBMIT REVIEW
    ===================================================== */
        productReviewForm?.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!detailProduct) {
                return;
            }
            if (detailRating < 1 || detailRating > 5) {
                reviewSubmitResult.innerHTML = `
            <div class="review-submit-error">
                Please select a star rating.
            </div>
        `;
                return;
            }
            const customerName = document.getElementById("review-name").value.trim();
            const customerEmail = document.getElementById("review-email").value.trim();
            const title = document.getElementById("review-title").value.trim();
            const comment = document.getElementById("review-comment").value.trim();
            const submitButton = document.getElementById("review-submit-button");
            try {
                submitButton.disabled = true;
                submitButton.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Submitting...
        `;
                reviewSubmitResult.innerHTML = "";
                const response = await fetch("https://mtc-backend-node-production.up.railway.app/submit-review", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        productId: detailProduct.id,
                        customerName,
                        customerEmail,
                        rating: detailRating,
                        title,
                        comment,
                    }),
                });
                const data = await response.json();
                if (!response.ok || !data.success) {
                    throw new Error(data.error || "Unable to submit review.");
                }
                reviewSubmitResult.innerHTML = `
                <div class="review-submit-success">
                    <i class="fa-solid fa-circle-check"></i>
                    Thank you! Your review was submitted and is waiting for approval.
                </div>
            `;
                productReviewForm.reset();
                detailRating = 0;
                reviewRatingInput.value = "";
                reviewStarSelector.querySelectorAll("button").forEach((button) => {
                    button.classList.remove("active");
                    const icon = button.querySelector("i");
                    icon.className = "fa-regular fa-star";
                });
            } catch (error) {
                console.error("❌ REVIEW SUBMIT ERROR:", error);
                reviewSubmitResult.innerHTML = `
            <div class="review-submit-error">
                <i class="fa-solid fa-circle-exclamation"></i>
                ${escapeHTML(error.message)}
            </div>
        `;
            } finally {
                submitButton.disabled = false;
                submitButton.innerHTML = `
            <i class="fa-solid fa-star"></i>
            Submit Review
        `;
            }
        });

        /* =====================================================
LOAD PRODUCT PAGE
===================================================== */
        await loadDetailPage();
    }

    /* =====================================================
PRODUCT CARDS -> PRODUCT DETAIL PAGE
===================================================== */

    document.addEventListener("click", (event) => {
        const card = event.target.closest(".store-product-card");

        if (!card) {
            return;
        }

        /*
        Do not open product page
        when clicking quantity
        or Add to Cart.
    */
        if (event.target.closest(".store-add-cart-btn") || event.target.closest(".store-product-quantity")) {
            return;
        }

        const productId = card.dataset.productId;

        if (!productId) {
            return;
        }

        window.location.href = `mw-product-review.html?product=${encodeURIComponent(productId)}`;
    });

    /* =====================================================
   PAYMENT SUCCESS PAGE
===================================================== */

async function handlePaymentSuccessPage() {

    const orderNumberElement =
        document.getElementById(
            "successOrderNumber"
        );

    // Not the payment success page.
    if (!orderNumberElement) {
        return;
    }

    const params =
        new URLSearchParams(
            window.location.search
        );

    // =================================================
    // PAYPAL
    // =================================================

    if (
        params.get("payment") === "paypal"
    ) {

        const paypalOrderId =
            params.get("token");

        if (!paypalOrderId) {

            console.error(
                "❌ Missing PayPal token."
            );

            orderNumberElement.textContent =
                "Unable to confirm order";

            return;
        }

        try {

            console.log(
                "CAPTURING PAYPAL PAYMENT:",
                paypalOrderId
            );

            const response =
                await fetch(
                    "https://mtc-backend-node-production.up.railway.app/capture-paypal-order",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                paypalOrderId
                            })
                    }
                );

            const data =
                await response.json();

            console.log(
                "PAYPAL CAPTURE RESPONSE:",
                data
            );

            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.error ||
                    "Unable to confirm PayPal payment."
                );
            }

            orderNumberElement.textContent =
                data.orderNumber ||
                "Confirmed";

            localStorage.removeItem(
                "mtc-cart"
            );

            updateCartCount();

            console.log(
                "✅ PAYPAL ORDER COMPLETE:",
                data.orderNumber
            );

        } catch (error) {

            console.error(
                "❌ PAYPAL PAYMENT CONFIRMATION ERROR:",
                error
            );

            orderNumberElement.textContent =
                "Unable to confirm order";
        }

        return;
    }

    // =================================================
    // STRIPE
    // =================================================

    const sessionId =
        params.get("session_id");

    if (!sessionId) {
        return;
    }

    try {

        const response =
            await fetch(
                `https://mtc-backend-node-production.up.railway.app/store-order-by-session/${encodeURIComponent(sessionId)}`
            );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.error ||
                "Unable to confirm order."
            );
        }

        if (data.orderNumber) {
            orderNumberElement.textContent =
                data.orderNumber;
        }

        localStorage.removeItem(
            "mtc-cart"
        );

        updateCartCount();

    } catch (error) {

        console.error(
            "❌ STRIPE PAYMENT SUCCESS ERROR:",
            error
        );
    }
}


/* =====================================================
   RUN PAYMENT SUCCESS PAGE
===================================================== */

/* =====================================================
   PAYMENT SUCCESS PAGE
===================================================== */

async function handlePaymentSuccessPage() {

    const orderNumberElement =
        document.getElementById(
            "successOrderNumber"
        );

    const paymentStatusElement =
        document.getElementById(
            "successPaymentStatus"
        );

    const orderStatusElement =
        document.getElementById(
            "successOrderStatus"
        );

    // Not the payment success page.
    if (!orderNumberElement) {
        return;
    }

    const params =
        new URLSearchParams(
            window.location.search
        );


    // =================================================
    // PAYPAL
    // =================================================

    if (
        params.get("payment") === "paypal"
    ) {

        const paypalOrderId =
            params.get("token");

        if (!paypalOrderId) {

            orderNumberElement.textContent =
                "Unable to confirm order";

            if (paymentStatusElement) {
                paymentStatusElement.textContent =
                    "Unable to confirm";
            }

            if (orderStatusElement) {
                orderStatusElement.textContent =
                    "Unable to confirm";
            }

            return;
        }

        try {

            const response =
                await fetch(
                    "https://mtc-backend-node-production.up.railway.app/capture-paypal-order",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                paypalOrderId
                            })
                    }
                );

            const data =
                await response.json();

            console.log(
                "PAYPAL CAPTURE RESPONSE:",
                data
            );

            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.error ||
                    "Unable to confirm PayPal payment."
                );
            }


            orderNumberElement.textContent =
                data.orderNumber ||
                "Confirmed";


            if (paymentStatusElement) {

                paymentStatusElement.textContent =
                    data.paymentStatus ||
                    "Paid";
            }


            if (orderStatusElement) {

                orderStatusElement.textContent =
                    data.orderStatus ||
                    "Pending";
            }


            localStorage.removeItem(
                "mtc-cart"
            );

            updateCartCount();


            console.log(
                "✅ PAYPAL ORDER COMPLETE:",
                data.orderNumber
            );


        } catch (error) {

            console.error(
                "❌ PAYPAL PAYMENT CONFIRMATION ERROR:",
                error
            );

            orderNumberElement.textContent =
                "Unable to confirm order";

            if (paymentStatusElement) {
                paymentStatusElement.textContent =
                    "Unable to confirm";
            }

            if (orderStatusElement) {
                orderStatusElement.textContent =
                    "Unable to confirm";
            }
        }

        return;
    }


    // =================================================
    // STRIPE
    // =================================================

    const sessionId =
        params.get("session_id");

    if (!sessionId) {
        return;
    }


    try {

        const response =
            await fetch(
                `https://mtc-backend-node-production.up.railway.app/store-order-by-session/${encodeURIComponent(sessionId)}`
            );

        const data =
            await response.json();

        console.log(
            "STRIPE SUCCESS RESPONSE:",
            data
        );


        if (
            !response.ok ||
            !data.success ||
            !data.order
        ) {

            throw new Error(
                data.error ||
                "Unable to confirm order."
            );
        }


        orderNumberElement.textContent =
            data.order.orderNumber ||
            "Confirmed";


        if (paymentStatusElement) {

            paymentStatusElement.textContent =
                data.order.paymentStatus ||
                "Pending";
        }


        if (orderStatusElement) {

            orderStatusElement.textContent =
                data.order.orderStatus ||
                "Pending";
        }


        localStorage.removeItem(
            "mtc-cart"
        );

        updateCartCount();


        console.log(
            "✅ STRIPE ORDER COMPLETE:",
            data.order.orderNumber
        );


    } catch (error) {

        console.error(
            "❌ STRIPE PAYMENT SUCCESS ERROR:",
            error
        );

        orderNumberElement.textContent =
            "Unable to confirm order";

        if (paymentStatusElement) {
            paymentStatusElement.textContent =
                "Unable to confirm";
        }

        if (orderStatusElement) {
            orderStatusElement.textContent =
                "Unable to confirm";
        }
    }
}


/* =====================================================
   RUN PAYMENT SUCCESS PAGE
===================================================== */

await handlePaymentSuccessPage();

});
