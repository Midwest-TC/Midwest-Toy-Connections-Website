document.addEventListener("DOMContentLoaded", async () => {
    const SUPABASE_URL = "https://ujwelweqqjyzknssqgtn.supabase.co";
    const SUPABASE_ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqd2Vsd2VxcWp5emtuc3NxZ3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxOTQwNDgsImV4cCI6MjEwMjc3MDA0OH0.oqVIrfixxHzukjYSAB8VP8pprSL8wCq21MmqdiyyvTM";
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    /* =========================
       FREE SHIPPING HEADER BANNER
    ========================= */

    const freeShippingBanner = document.getElementById("mtcFreeShippingBanner");

    const freeShippingBannerText = document.getElementById("mtcFreeShippingBannerText");

    async function loadFreeShippingBanner() {
        if (!freeShippingBanner || !freeShippingBannerText) {
            return;
        }

        const { data: shippingSettings, error: shippingSettingsError } = await supabase
            .from("Shipping_Settings")
            .select(
                `
                free_shipping_enabled,
                free_shipping_minimum
            `
            )
            .limit(1)
            .maybeSingle();

        if (shippingSettingsError) {
            console.error("FREE SHIPPING BANNER ERROR:", shippingSettingsError);

            return;
        }

        if (!shippingSettings) {
            freeShippingBanner.style.display = "none";

            return;
        }

        /* FREE SHIPPING TURNED OFF */

        if (shippingSettings.free_shipping_enabled !== true) {
            freeShippingBanner.style.display = "none";

            return;
        }

        /* FREE SHIPPING TURNED ON */

        const minimum = Number(shippingSettings.free_shipping_minimum || 0);

        freeShippingBanner.style.display = "";

        freeShippingBannerText.textContent = `Free shipping on orders over $${minimum.toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        })}`;
    }

    await loadFreeShippingBanner();
    /* =========================
  START OF MW-CONTACT STORE SETTINGS
========================= */

    const contactStoreEmail = document.getElementById("mtcContactStoreEmail");

    const contactStorePhone = document.getElementById("mtcContactStorePhone");

    const contactStoreAddress = document.getElementById("mtcContactStoreAddress");

    const contactStoreHours = document.getElementById("mtcContactStoreHours");

    if (contactStoreEmail && contactStorePhone && contactStoreAddress && contactStoreHours) {
        const { data: storeSettings, error: storeSettingsError } = await supabase
            .from("Store_settings")
            .select("*")
            .limit(1)
            .maybeSingle();

        if (storeSettingsError) {
            console.error("Store settings load error:", storeSettingsError);
        } else if (storeSettings) {
            contactStoreEmail.textContent = storeSettings.store_email || "";

            contactStorePhone.textContent = storeSettings.store_phone || "";

            contactStoreAddress.textContent = storeSettings.store_address || "";

            const formatStoreTime = (timeValue) => {
                if (!timeValue) {
                    return "";
                }

                const [hourString, minuteString] = timeValue.split(":");

                let hour = Number(hourString);

                const minute = minuteString;

                const period = hour >= 12 ? "PM" : "AM";

                hour = hour % 12 || 12;

                return minute === "00" ? `${hour}${period}` : `${hour}:${minute}${period}`;
            };

                const openTime = formatStoreTime(storeSettings.store_hours_open);

                const closeTime = formatStoreTime(storeSettings.store_hours_close);

                contactStoreHours.replaceChildren();

                const openHoursLine = document.createTextNode(
                    `${storeSettings.store_hours_days || ""}: ${openTime} - ${closeTime}`
                );

                const breakElement = document.createElement("br");

                const closedLine = document.createTextNode(
                    `${storeSettings.store_closed_days || ""}: Closed`
                );

                contactStoreHours.append(
                    openHoursLine,
                    breakElement,
                    closedLine
                );
        }
    }

    /* =========================
  END OF MW-CONTACT STORE SETTINGS
========================= */

/* =========================
   START OF MW-CONTACT FORM
========================= */

const contactForm =
    document.getElementById("mtcContactForm");

if (contactForm) {

    const contactName =
        document.getElementById("mtcContactName");

    const contactEmail =
        document.getElementById("mtcContactEmail");

    const contactSubject =
        document.getElementById("mtcContactSubject");

    const contactMessage =
        document.getElementById("mtcContactMessage");

    const contactSubmitButton =
        document.getElementById("mtcContactSubmitButton");

    const contactFormStatus =
        document.getElementById("mtcContactFormStatus");


    let isSubmitting = false;


    contactForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            // =========================================
            // PREVENT DOUBLE SUBMIT
            // =========================================

            if (isSubmitting) {
                return;
            }

            isSubmitting = true;


            // =========================================
            // GET + CLEAN FORM VALUES
            // =========================================

            const name =
                contactName.value.trim();

            const email =
                contactEmail.value
                    .trim()
                    .toLowerCase();

            const subject =
                contactSubject.value.trim();

            const message =
                contactMessage.value.trim();


            // =========================================
            // BASIC VALIDATION
            // =========================================

            if (
                !name ||
                !email ||
                !subject ||
                !message
            ) {

                isSubmitting = false;

                if (contactFormStatus) {

                    contactFormStatus.textContent =
                        "Please complete all required fields.";

                    contactFormStatus.style.display =
                        "block";

                    contactFormStatus.style.color =
                        "#ef4444";
                }

                return;
            }


            // =========================================
            // DISABLE SUBMIT BUTTON
            // =========================================

            if (contactSubmitButton) {

                contactSubmitButton.disabled = true;

                contactSubmitButton.textContent =
                    "Sending...";
            }


            try {

                // =========================================
                // SAVE MESSAGE THROUGH SECURE BACKEND
                // =========================================
                const messageResponse = await fetch(
                    "https://mtc-backend-node-production.up.railway.app/contact-message",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            name: name,
                            email: email,
                            subject: subject,
                            message: message
                        })
                    }
                );

                const messageResult = await messageResponse.json();

                if (!messageResponse.ok || !messageResult.success) {
                    throw new Error(
                        messageResult.error || "Unable to save message."
                    );
                }

                const newMessage = {
                    id: messageResult.messageId
                };


                const notificationResponse = await fetch(
                    "https://mtc-backend-node-production.up.railway.app/contact-message-notification",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            messageId: newMessage.id
                        })
                    }
                );

                if (!notificationResponse.ok) {
                    console.error(
                        "CONTACT MESSAGE NOTIFICATION ERROR:",
                        await notificationResponse.text()
                    );
                }

                // =========================================
                // SEND EMAIL NOTIFICATION
                // =========================================

                const templateParams = {
                name: name,
                customer_name: name,
                email: email,
                subject: subject,
                message: "We've received your message and will get back to you as soon as possible. We appreciate you for reaching out to us!"
            };


                await emailjs.send(
                    "service_taig5gh",
                    "template_xfko5sm",
                     templateParams
                );

                // =========================================
                // SEND NEW MESSAGE EMAIL TO MTC
                // =========================================
                const adminEmailParams = {
                    name: name,
                    customer_name: "Midwest Toy Connections",
                    email: "midwesttoyconnections@gmail.com",
                    subject: `New Contact Message: ${subject}`,
                    message: `New message from ${name}

                    Customer Email: ${email}

                    Subject: ${subject}

                    Message:
                    ${message}`
                                    };

                await emailjs.send(
                    "service_taig5gh",
                    "template_xfko5sm",
                    adminEmailParams
                );

                console.log(
                    "MTC contact message sent successfully."
                );


                // =========================================
                // REDIRECT TO THANK YOU PAGE
                // =========================================

                window.location.href =
                    "mw-thank-you.html";


            } catch (error) {

                console.error(
                    "MTC CONTACT FORM ERROR:",
                    error
                );


                isSubmitting = false;


                if (contactSubmitButton) {

                    contactSubmitButton.disabled =
                        false;

                    contactSubmitButton.textContent =
                        "Submit";
                }


                if (contactFormStatus) {

                    contactFormStatus.textContent =
                        "Unable to send your message. Please try again.";

                    contactFormStatus.style.display =
                        "block";

                    contactFormStatus.style.color =
                        "#ef4444";
                }
            }
        }
    );
}

/* =========================
   END OF MW-CONTACT FORM
========================= */

    /* =========================
   START OF DYNAMIC MW-PRIVACY
========================= */

    const privacyContainer = document.getElementById("mtcPrivacyDynamicSections");

    const privacyLastUpdated = document.getElementById("mtcPrivacyLastUpdated");

    if (privacyContainer) {
        const { data: privacyDocument, error: privacyError } = await supabase
            .from("Legal_Documents")
            .select("published_content, published_at")
            .eq("document_type", "privacy")
            .eq("status", "published")
            .maybeSingle();

        if (privacyError) {
            console.error("PRIVACY LOAD ERROR:", privacyError);

            privacyContainer.innerHTML = "<p>Unable to load Privacy Policy.</p>";
        } else if (!privacyDocument || !privacyDocument.published_content) {
            console.warn("No published Privacy Policy found.");

            privacyContainer.innerHTML = `
        <div class="mtc-policy-unavailable">
            <i class="fa-solid fa-file-circle-xmark"></i>

            <h2>Privacy Policy Unavailable</h2>

            <p>
                Our Privacy Policy is currently unavailable.
                Please check back later.
            </p>
        </div>
    `;

            if (privacyLastUpdated) {
                privacyLastUpdated.style.display = "none";
            }
        } else {
            if (privacyLastUpdated) {
                privacyLastUpdated.style.display = "";
            }
            try {
                const privacySections = JSON.parse(privacyDocument.published_content);

                privacyContainer.innerHTML = "";

                Object.values(privacySections).forEach((section, index) => {
                    const privacyItem = document.createElement("div");

                    privacyItem.className = "privacy-item";

                    const privacyHeader = document.createElement("div");

                    privacyHeader.className = "privacy-item-header";

                    const privacyNumber = document.createElement("div");

                    privacyNumber.className = "privacy-number";

                    privacyNumber.textContent = index + 1;

                    const privacyTitle = document.createElement("h3");

                    privacyTitle.textContent = section?.title || `Legal Section ${index + 1}`;

                    const privacyArrow = document.createElement("i");

                    privacyArrow.className = "fa-solid fa-chevron-down privacy-arrow";

                    const privacyContent = document.createElement("div");

                    privacyContent.className = "privacy-content mw-hidden";

                    const privacyParagraph = document.createElement("p");

                    privacyParagraph.textContent = section?.content || "";

                    privacyContent.appendChild(privacyParagraph);

                    privacyHeader.appendChild(privacyNumber);

                    privacyHeader.appendChild(privacyTitle);

                    privacyHeader.appendChild(privacyArrow);

                    privacyItem.appendChild(privacyHeader);

                    privacyItem.appendChild(privacyContent);

                    privacyHeader.addEventListener("click", () => {
                        privacyContent.classList.toggle("mw-hidden");

                        privacyArrow.classList.toggle("mw-arrow-up");
                    });

                    privacyContainer.appendChild(privacyItem);
                });

                if (privacyLastUpdated && privacyDocument.published_at) {
                    const publishedDate = new Date(privacyDocument.published_at);

                    privacyLastUpdated.textContent =
                        "Last updated: " +
                        publishedDate.toLocaleDateString("en-US", {
                            timeZone: "America/Chicago",

                            month: "long",

                            day: "numeric",

                            year: "numeric",
                        });
                }
            } catch (error) {
                console.error("PRIVACY JSON ERROR:", error);

                privacyContainer.innerHTML = "<p>Unable to load Privacy Policy.</p>";
            }
        }
    }

    /* =========================
   END OF DYNAMIC MW-PRIVACY
========================= */

    /* =========================
   START OF DYNAMIC MW-TERMS
========================= */

    const termsContainer = document.getElementById("mtcTermsDynamicSections");

    const termsLastUpdated = document.getElementById("mtcTermsLastUpdated");

    if (termsContainer) {
        const { data: termsDocument, error: termsError } = await supabase
            .from("Legal_Documents")
            .select("published_content, published_at")
            .eq("document_type", "terms")
            .eq("status", "published")
            .maybeSingle();

        if (termsError) {
            console.error("TERMS LOAD ERROR:", termsError);

            termsContainer.innerHTML = "<p>Unable to load Terms of Service.</p>";
        } else if (!termsDocument || !termsDocument.published_content) {
            console.warn("No published Terms of Service found.");

            termsContainer.innerHTML = `
        <div class="mtc-policy-unavailable">
            <i class="fa-solid fa-file-circle-xmark"></i>

            <h2>Terms of Service Unavailable</h2>

            <p>
                Our Terms of Service are currently unavailable.
                Please check back later.
            </p>
        </div>
    `;

            if (termsLastUpdated) {
                termsLastUpdated.style.display = "none";
            }
        } else {
            if (termsLastUpdated) {
                termsLastUpdated.style.display = "";
            }
            try {
                const termsSections = JSON.parse(termsDocument.published_content);

                termsContainer.innerHTML = "";

                Object.values(termsSections).forEach((section, index) => {
                    const termItem = document.createElement("div");

                    termItem.className = "term-item";

                    const termHeader = document.createElement("div");

                    termHeader.className = "term-header";

                    const termNumber = document.createElement("div");

                    termNumber.className = "number";

                    termNumber.textContent = index + 1;

                    const termTitle = document.createElement("h3");

                    termTitle.textContent = section?.title || `Legal Section ${index + 1}`;

                    const arrowWrapper = document.createElement("div");

                    arrowWrapper.className = "arrow";

                    const arrow = document.createElement("i");

                    arrow.className = "fa-solid fa-chevron-down arrow";

                    arrowWrapper.appendChild(arrow);

                    const termContent = document.createElement("div");

                    termContent.className = "term-content mw-hidden";

                    const paragraph = document.createElement("p");

                    paragraph.textContent = section?.content || "";

                    termContent.appendChild(paragraph);

                    termHeader.appendChild(termNumber);

                    termHeader.appendChild(termTitle);

                    termHeader.appendChild(arrowWrapper);

                    termItem.appendChild(termHeader);

                    termItem.appendChild(termContent);

                    termHeader.addEventListener("click", () => {
                        termContent.classList.toggle("mw-hidden");

                        arrow.classList.toggle("mw-arrow-up");
                    });

                    termsContainer.appendChild(termItem);
                });

                if (termsLastUpdated && termsDocument.published_at) {
                    const publishedDate = new Date(termsDocument.published_at);

                    termsLastUpdated.textContent =
                        "Last updated: " +
                        publishedDate.toLocaleDateString("en-US", {
                            timeZone: "America/Chicago",

                            month: "long",

                            day: "numeric",

                            year: "numeric",
                        });
                }
            } catch (error) {
                console.error("TERMS JSON ERROR:", error);

                termsContainer.innerHTML = "<p>Unable to load Terms of Service.</p>";
            }
        }
    }

    /* =========================
   END OF DYNAMIC MW-TERMS
========================= */

    /* =========================
   MAGNIFY SEARCH PRODUCTS
========================= */
    const searchToggle = document.getElementById("nav-search-toggle");
    const searchForm = document.getElementById("nav-search-form");
    const searchInput = document.getElementById("nav-search-input");
    if (searchToggle && searchForm && searchInput) {
        searchToggle.addEventListener("click", () => {
            searchForm.classList.toggle("active");
            if (searchForm.classList.contains("active")) {
                searchInput.focus();
            }
        });
        searchForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const search = searchInput.value.trim();
            if (!search) {
                return;
            }
            window.location.href = `mw-visit-store.html?search=${encodeURIComponent(search)}`;
        });
    }
    /* =========================
 END OF MAGNFIY SEARCH PRODUCT
========================= */

    /* =========================
 START OF MW-EVENT-TOURNAMENT PAGE
========================= */
    const eventTitle = document.getElementById("eventTournamentTitle");
    if (eventTitle) {
        const params = new URLSearchParams(window.location.search);

        const eventId = params.get("id");

        const { data: event, error } = await supabase.from("Events").select("*").eq("id", eventId).maybeSingle();

        if (error || !event) {
            console.error("Event load error:", error);
            eventTitle.textContent = "No Upcoming Event";
        } else {
            // TITLE
            eventTitle.textContent = event.name || "Event Tournament";

            // EVENT TYPE
            const eventType = document.getElementById("eventTournamentType");
            if (eventType) {
                eventType.textContent = event.event_type || event.game || "Tournament";
            }

            // DATE
            const eventDate = document.getElementById("eventTournamentDate");
            if (eventDate) {
                eventDate.textContent = event.date
                    ? new Date(`${event.date}T00:00:00`).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                      })
                    : "TBA";
            }

            // TIME
            const eventTime = document.getElementById("eventTournamentTime");
            if (eventTime) {
                if (event.start_time) {
                    const time = new Date(`1970-01-01T${event.start_time}`);
                    eventTime.textContent = time.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                    });
                } else {
                    eventTime.textContent = "TBA";
                }
            }

            // ENTRY FEE
            const eventFee = document.getElementById("eventTournamentFee");
            if (eventFee) {
                eventFee.textContent =
                    event.entry_fee != null
                        ? Number(event.entry_fee).toLocaleString("en-US", {
                              style: "currency",
                              currency: "USD",
                          })
                        : "Free";
            }

                       // PRIZE
            const eventPrize = document.getElementById("eventTournamentPrize");
            if (eventPrize) {
                eventPrize.textContent = event.prize || event.prize_description || "TBA";
            }

                       // LOCATION
            const eventLocation = document.getElementById("eventTournamentLocation");
            if (eventLocation) {
                eventLocation.textContent = event.location || "Midwest Toy Connections";
            }

           // BANDAI TCG+ REGISTRATION LINK
const bandaiLink =
    document.getElementById(
        "eventTournamentBandaiLink"
    );

if (bandaiLink) {
    let safeBandaiUrl = "";

    try {
        const url =
            new URL(
                String(
                    event.bandai_link || ""
                ).trim()
            );

        if (url.protocol === "https:") {
            safeBandaiUrl =
                url.href;
        }
    } catch {
        safeBandaiUrl = "";
    }

    if (safeBandaiUrl) {
        bandaiLink.href =
            safeBandaiUrl;

        bandaiLink.hidden =
            false;

        bandaiLink.style.display =
            "inline-flex";
    } else {
        bandaiLink.hidden =
            true;

        bandaiLink.style.display =
            "none";

        bandaiLink.removeAttribute(
            "href"
        );
    }
}

            // DESCRIPTION
            const eventDescription = document.getElementById("eventTournamentDescription");
            if (eventDescription) {
                eventDescription.textContent = event.description || "Event details coming soon.";
            }
        }
    }
    /* =========================
 END OF MW-EVENT-TOURNAMENT PAGE
========================= */

    /* =========================
  START OF MW-EVENTS PAGE
========================= */
    const upcomingEventsContainer = document.querySelector(".events-container");

    if (upcomingEventsContainer) {
        const { data: events, error } = await supabase
            .from("Events")
            .select("*")
            .order("date", {
                ascending: true,
            });

        if (error) {
            console.error("Events load error:", error);
        } else {
            upcomingEventsContainer.innerHTML = "";
            if (!events || events.length === 0) {
                upcomingEventsContainer.innerHTML = `
                <article class="event-card">
                    <div class="event-info">
                        <h2>No Upcoming Events</h2>
                        <p>
                            Check back soon for future tournaments and events.
                        </p>
                    </div>
                </article>
            `;
            } else {
                events.forEach((event) => {
    const eventDate =
        event.date
            ? new Date(`${event.date}T00:00:00`)
            : null;

    const month =
        eventDate
            ? eventDate.toLocaleDateString("en-US", {
                  month: "short",
              })
            : "TBA";

    const day =
        eventDate
            ? eventDate.getDate()
            : "--";

    let eventTime = "TBA";

    if (event.start_time) {
        const time =
            new Date(`1970-01-01T${event.start_time}`);

        eventTime =
            time.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
            });
    }

    const eventType =
        event.event_type ||
        event.game ||
        "Tournament";

    /* CREATE EVENT CARD SAFELY */

    const article =
        document.createElement("article");

    article.className =
        "event-card";

    /* DATE */

    const dateContainer =
        document.createElement("div");

    dateContainer.className =
        "event-date";

    const monthElement =
        document.createElement("span");

    monthElement.className =
        "month";

    monthElement.textContent =
        month;

    const dayElement =
        document.createElement("span");

    dayElement.className =
        "day";

    dayElement.textContent =
        day;

    dateContainer.append(
        monthElement,
        dayElement
    );

    /* EVENT INFO */

    const info =
        document.createElement("div");

    info.className =
        "event-info";

    /* EVENT TYPE */

    const typeElement =
        document.createElement("span");

    typeElement.className =
        "event-type";

    typeElement.append(
        document.createTextNode(
            `${eventType} `
        )
    );

    const typeIcon =
        document.createElement("i");

    typeIcon.className =
        "fa-solid fa-layer-group";

    typeElement.appendChild(
        typeIcon
    );

    /* EVENT NAME */

    const title =
        document.createElement("h2");

    title.textContent =
        event.name ||
        "Event";

    /* DESCRIPTION */

    const description =
        document.createElement("p");

    description.textContent =
        event.description ||
        "Event details coming soon.";

    /* DETAILS */

    const details =
        document.createElement("div");

    details.className =
        "event-details";

    /* TIME */

    const timeElement =
        document.createElement("span");

    const timeIcon =
        document.createElement("i");

    timeIcon.className =
        "fa-regular fa-clock";

    timeElement.append(
        timeIcon,
        document.createTextNode(
            ` ${eventTime}`
        )
    );

    /* LOCATION */

    const locationElement =
        document.createElement("span");

    const locationIcon =
        document.createElement("i");

    locationIcon.className =
        "fa-solid fa-location-dot";

    locationElement.append(
        locationIcon,
        document.createTextNode(
            ` ${
                event.location ||
                "Midwest Toy Connections"
            }`
        )
    );

    details.append(
        timeElement,
        locationElement
    );

    /* EVENT DETAILS LINK */

    const eventLink =
        document.createElement("a");

    eventLink.className =
        "event-button";

    eventLink.href =
        `mw-event-tournament.html?id=${encodeURIComponent(
            String(event.id || "")
        )}`;

    eventLink.append(
        document.createTextNode(
            "Event Details "
        )
    );

    const linkIcon =
        document.createElement("i");

    linkIcon.className =
        "fa-solid fa-arrow-right";

    eventLink.appendChild(
        linkIcon
    );

    /* BUILD CARD */

    info.append(
        typeElement,
        title,
        description,
        details,
        eventLink
    );

    article.append(
        dateContainer,
        info
    );

    upcomingEventsContainer.appendChild(
        article
    );
});
            }
        }
    }
    /* =========================
 START OF MW-POLICY PAGE
========================= */

    /* =========================================================
   MTC DYNAMIC CUSTOM LEGAL POLICY
========================================================= */

    async function loadMtcCustomLegalPolicy() {
        const policyContainer = document.getElementById("mtcPolicyDynamicSections");

        const policyTitle = document.getElementById("mtcPolicyTitle");

        const lastUpdated = document.getElementById("mtcPolicyLastUpdated");

        /* Only run this code on mw-policy.html */
        if (!policyContainer || !policyTitle || !lastUpdated) {
            return;
        }

        /* Get ?policy= from the URL */
        const params = new URLSearchParams(window.location.search);

        const policyType = params.get("policy");

        if (!policyType) {
            policyTitle.textContent = "Policy Not Found";

            policyContainer.innerHTML = `
            <div class="mtc-legal-loading">
                This policy could not be found.
            </div>
        `;

            lastUpdated.textContent = "";

            return;
        }

        try {
            const { data, error } = await supabase
                .from("Legal_Documents")
                .select("title, published_content, published_at, status")
                .eq("document_type", policyType)
                .eq("status", "published")
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (!data || !data.published_content) {
                policyTitle.textContent = "Policy Not Found";

                policyContainer.innerHTML = `
    <div class="term-content" style="padding: 30px; text-align: center;">
        <p>This policy is not currently available.</p>
    </div>
`;

                lastUpdated.textContent = "";

                return;
            }

            /* =========================================
           PAGE TITLE
        ========================================= */

            policyTitle.textContent = data.title || "Store Policy";

            document.title = `${data.title || "Store Policy"} | Midwest Toy Connections`;

            /* =========================================
           PARSE POLICY SECTIONS
        ========================================= */

            let sections;

            try {
                sections = JSON.parse(data.published_content);
            } catch (parseError) {
                console.error("Unable to parse policy content:", parseError);

                throw parseError;
            }

            const sectionEntries = Object.entries(sections || {});

            if (!sectionEntries.length) {
                policyContainer.innerHTML = `
                <div class="mtc-legal-loading">
                    This policy does not contain any content.
                </div>
            `;

                return;
            }

            /* =========================================
           BUILD POLICY
        ========================================= */

            policyContainer.innerHTML = "";

            sectionEntries.forEach(([sectionKey, section], index) => {
                /* POLICY ITEM */
                const termItem = document.createElement("div");

                termItem.className = "term-item";

                /* POLICY HEADER */
                const termHeader = document.createElement("div");

                termHeader.className = "term-header";

                /* NUMBER */
                const termNumber = document.createElement("div");

                termNumber.className = "number";

                termNumber.textContent = index + 1;

                /* TITLE */
                const termTitle = document.createElement("h3");

                termTitle.textContent = section?.title || `Section ${index + 1}`;

                /* ARROW WRAPPER */
                const arrowWrapper = document.createElement("div");

                arrowWrapper.className = "arrow";

                /* ARROW */
                const arrow = document.createElement("i");

                arrow.className = "fa-solid fa-chevron-down arrow";

                arrowWrapper.appendChild(arrow);

                /* CONTENT */
                const termContent = document.createElement("div");

                termContent.className = "term-content mw-hidden";

                /* CONTENT PARAGRAPH */
                const paragraph = document.createElement("p");

                paragraph.textContent = section?.content || "";

                termContent.appendChild(paragraph);

                /* BUILD HEADER */
                termHeader.appendChild(termNumber);

                termHeader.appendChild(termTitle);

                termHeader.appendChild(arrowWrapper);

                /* BUILD ITEM */
                termItem.appendChild(termHeader);

                termItem.appendChild(termContent);

                /* ACCORDION CLICK */
                termHeader.addEventListener("click", () => {
                    termContent.classList.toggle("mw-hidden");

                    arrow.classList.toggle("mw-arrow-up");
                });

                /* ADD TO PAGE */
                policyContainer.appendChild(termItem);
            });

            /* =========================================
           LAST UPDATED
        ========================================= */

            if (data.published_at) {
                const publishedDate = new Date(data.published_at);

                lastUpdated.textContent =
                    "Last updated: " +
                    publishedDate.toLocaleDateString("en-US", {
                        timeZone: "America/Chicago",

                        month: "long",

                        day: "numeric",

                        year: "numeric",
                    });
            } else {
                lastUpdated.textContent = "Last updated: Not available";
            }
        } catch (error) {
            console.error("CUSTOM LEGAL POLICY ERROR:", error);

            policyTitle.textContent = "Unable to Load Policy";

            policyContainer.innerHTML = `
            <div class="mtc-legal-loading">
                We were unable to load this policy.
            </div>
        `;

            lastUpdated.textContent = "";
        }
    }

    /* =========================
 END OF MW-POLICY PAGE
========================= */

    /* =========================================================
   MTC DYNAMIC FOOTER POLICY LINKS
========================================================= */

    async function loadMtcFooterPolicyLinks() {
        const footerContainers = document.querySelectorAll(".mtc-dynamic-policy-links");

        if (!footerContainers.length) {
            return;
        }

        const { data, error } = await supabase
            .from("Legal_Documents")
            .select("title, document_type")
            .eq("status", "published")
            .order("title", {
                ascending: true,
            });

        if (error) {
            console.error("FOOTER POLICY LINKS ERROR:", error);
            return;
        }

        const customPolicies = (data || []).filter(
            (policy) => policy.document_type !== "terms" && policy.document_type !== "privacy"
        );

        footerContainers.forEach((container) => {
            container.innerHTML = "";

            customPolicies.forEach((policy) => {
                const link = document.createElement("a");

                link.href = `mw-policy.html?policy=${encodeURIComponent(policy.document_type)}`;

                link.textContent = policy.title;

                container.appendChild(link);
            });
        });
    }

    await loadMtcFooterPolicyLinks();

    await loadMtcCustomLegalPolicy();


    // =========================================================
    // START OF MTC NEWSLETTER SUBSCRIPTION
    // =========================================================

    const newsletterForm =
        document.getElementById("mtcNewsletterForm");

    const newsletterEmail =
        document.getElementById("mtcNewsletterEmail");

    const newsletterSubscribeButton =
        document.getElementById("mtcNewsletterSubscribeButton");

    const newsletterMessage =
        document.getElementById("mtcNewsletterMessage");


    if (
        newsletterForm &&
        newsletterEmail &&
        newsletterSubscribeButton &&
        newsletterMessage
    ) {

        let newsletterSubmitting = false;


        newsletterForm.addEventListener(
            "submit",
            async (event) => {

                event.preventDefault();


                // =========================================
                // PREVENT DOUBLE SUBMIT
                // =========================================

                if (newsletterSubmitting) {
                    return;
                }


                const email =
                    newsletterEmail.value
                        .trim()
                        .toLowerCase();


                // =========================================
                // FRONTEND VALIDATION
                // Backend validates again.
                // =========================================

                if (
                    !email ||
                    !newsletterEmail.checkValidity()
                ) {

                    newsletterMessage.textContent =
                        "Please enter a valid email address.";

                    newsletterMessage.hidden = false;

                    newsletterMessage.style.color =
                        "#ef4444";

                    return;
                }


                newsletterSubmitting = true;

                newsletterSubscribeButton.disabled = true;

                newsletterSubscribeButton.textContent =
                    "Subscribing...";


                newsletterMessage.hidden = true;

                newsletterMessage.textContent = "";


                try {

                    // =========================================
                    // SEND TO SECURE BACKEND
                    // =========================================

                    const response = await fetch(
                        "http://localhost:3000/subscribe",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json",
                            },

                            body: JSON.stringify({
                                email: email,
                            }),
                        }
                    );


                    const result =
                        await response.json();


                    // =========================================
                    // BACKEND ERROR
                    // =========================================

                    if (
                        !response.ok ||
                        result.success !== true
                    ) {

                        throw new Error(
                            result.error ||
                            "Unable to subscribe."
                        );

                    }


                    // =========================================
                    // SUCCESS
                    // =========================================

                    newsletterMessage.textContent =
                        result.message ||
                        "Thanks for subscribing!";

                    newsletterMessage.hidden = false;

                    newsletterMessage.style.color =
                        "#22c55e";


                    newsletterEmail.value = "";


                } catch (error) {

                    console.error(
                        "NEWSLETTER SUBSCRIBE ERROR:",
                        error
                    );


                    newsletterMessage.textContent =
                        error.message ||
                        "Unable to subscribe. Please try again.";

                    newsletterMessage.hidden = false;

                    newsletterMessage.style.color =
                        "#ef4444";

                } finally {

                    newsletterSubmitting = false;

                    newsletterSubscribeButton.disabled =
                        false;

                    newsletterSubscribeButton.textContent =
                        "Subscribe";

                }

            }
        );

    }
    // =========================================================
    // END OF MTC NEWSLETTER SUBSCRIPTION
    // =========================================================
});
