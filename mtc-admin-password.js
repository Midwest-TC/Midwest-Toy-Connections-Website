// =========================================
// START OF MTC-CREATE-PASSWORD PAGE JS
// =========================================


// =========================================
// SUPABASE
// =========================================

const MTC_CREATE_PASSWORD_SUPABASE_URL =
    "https://ujwelweqqjyzknssqgtn.supabase.co";

const MTC_CREATE_PASSWORD_SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqd2Vsd2VxcWp5emtuc3NxZ3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxOTQwNDgsImV4cCI6MjEwMjc3MDA0OH0.oqVIrfixxHzukjYSAB8VP8pprSL8wCq21MmqdiyyvTM";


const createPasswordSupabase =
    window.supabase.createClient(
        MTC_CREATE_PASSWORD_SUPABASE_URL,
        MTC_CREATE_PASSWORD_SUPABASE_ANON_KEY
    );


// =========================================
// PAGE ELEMENTS
// =========================================

const createPasswordForm =
    document.getElementById(
        "mtcCreatePasswordForm"
    );

const newPasswordInput =
    document.getElementById(
        "mtcCreatePasswordNew"
    );

const confirmPasswordInput =
    document.getElementById(
        "mtcCreatePasswordConfirm"
    );

const newPasswordToggle =
    document.getElementById(
        "mtcCreatePasswordNewToggle"
    );

const confirmPasswordToggle =
    document.getElementById(
        "mtcCreatePasswordConfirmToggle"
    );

const createPasswordMessage =
    document.getElementById(
        "mtcCreatePasswordMessage"
    );

const createPasswordSubmit =
    document.getElementById(
        "mtcCreatePasswordSubmit"
    );


// =========================================
// CREATE PASSWORD MESSAGE
// =========================================

function showCreatePasswordMessage(
    message,
    type
) {

    if (!createPasswordMessage) {
        return;
    }

    createPasswordMessage.textContent =
        message;

    createPasswordMessage.className =
        "mtc-create-password-message";

    if (type) {

        createPasswordMessage.classList.add(
            type
        );

    }

}


// =========================================
// SHOW / HIDE PASSWORD
// =========================================

function setupPasswordToggle(
    button,
    input
) {

    if (!button || !input) {
        return;
    }

    button.addEventListener(
        "click",
        () => {

            const showingPassword =
                input.type === "text";

            input.type =
                showingPassword
                    ? "password"
                    : "text";

            const icon =
                button.querySelector(
                    "i"
                );

            if (icon) {

                icon.className =
                    showingPassword
                        ? "fa-solid fa-eye"
                        : "fa-solid fa-eye-slash";

            }

            button.setAttribute(
                "aria-label",
                showingPassword
                    ? "Show password"
                    : "Hide password"
            );

        }
    );

}


setupPasswordToggle(
    newPasswordToggle,
    newPasswordInput
);

setupPasswordToggle(
    confirmPasswordToggle,
    confirmPasswordInput
);

// =========================================
// HANDLE SUPABASE INVITATION
// =========================================

async function handleSupabaseInvitation() {

    const urlParams =
        new URLSearchParams(
            window.location.search
        );

    const code =
        urlParams.get("code");

    if (!code) {
        return;
    }

    const {
        error
    } =
        await createPasswordSupabase
            .auth
            .exchangeCodeForSession(
                code
            );

    if (error) {

        console.error(
            "INVITATION SESSION ERROR:",
            error
        );

    }

}

const invitationSessionReady =
    handleSupabaseInvitation();

// =========================================
// PASSWORD VALIDATION
// =========================================

function validatePassword(password) {

    if (password.length < 8) {

        return {
            valid: false,
            message:
                "Password must be at least 8 characters."
        };

    }


    if (!/[A-Z]/.test(password)) {

        return {
            valid: false,
            message:
                "Password must contain at least one uppercase letter."
        };

    }


    if (!/[a-z]/.test(password)) {

        return {
            valid: false,
            message:
                "Password must contain at least one lowercase letter."
        };

    }


    if (!/[0-9]/.test(password)) {

        return {
            valid: false,
            message:
                "Password must contain at least one number."
        };

    }


    return {
        valid: true
    };

}


// =========================================
// CREATE PASSWORD
// =========================================

createPasswordForm?.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const newPassword =
            newPasswordInput.value;

        const confirmPassword =
            confirmPasswordInput.value;


        // =================================
        // CHECK EMPTY FIELDS
        // =================================

        if (
            !newPassword ||
            !confirmPassword
        ) {

            showCreatePasswordMessage(
                "Please enter and confirm your password.",
                "error"
            );

            return;

        }


        // =================================
        // VALIDATE PASSWORD
        // =================================

        const passwordValidation =
            validatePassword(
                newPassword
            );


        if (!passwordValidation.valid) {

            showCreatePasswordMessage(
                passwordValidation.message,
                "error"
            );

            return;

        }


        // =================================
        // CHECK PASSWORDS MATCH
        // =================================

        if (
            newPassword !==
            confirmPassword
        ) {

            showCreatePasswordMessage(
                "The passwords do not match.",
                "error"
            );

            return;

        }


        // =================================
        // DISABLE BUTTON
        // =================================

        createPasswordSubmit.disabled =
            true;

        createPasswordSubmit.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Creating Password...</span>
        `;


        try {

            // =================================
            // VERIFY INVITATION SESSION
            // =================================

            const {
                data: sessionData,
                error: sessionError
            } =
                await createPasswordSupabase
                    .auth
                    .getSession();


            if (sessionError) {

                throw sessionError;

            }


            if (!sessionData.session) {

                showCreatePasswordMessage(
                    "Your invitation link is invalid or has expired. Please request a new invitation.",
                    "error"
                );

                return;

            }


            // =================================
            // UPDATE PASSWORD
            // =================================

            const {
                error: updatePasswordError
            } =
                await createPasswordSupabase
                    .auth
                    .updateUser({
                        password:
                            newPassword
                    });


            if (updatePasswordError) {

                throw updatePasswordError;

            }


            // =================================
            // SUCCESS
            // =================================

            showCreatePasswordMessage(
                "Your password has been created successfully. Redirecting to login...",
                "success"
            );


            // =================================
            // SIGN OUT INVITATION SESSION
            // =================================

            await createPasswordSupabase
                .auth
                .signOut();


            // =================================
            // REDIRECT TO ADMIN LOGIN
            // =================================

            setTimeout(
                () => {

                    window.location.href =
                        "mtc-admin-login.html";

                },
                1500
            );

        }
        catch (error) {

            console.error(
                "CREATE PASSWORD ERROR:",
                error
            );


            showCreatePasswordMessage(
                error.message ||
                "Unable to create your password. Please try again.",
                "error"
            );

        }
        finally {

            createPasswordSubmit.disabled =
                false;

            createPasswordSubmit.innerHTML = `
                <span>Create Password</span>
                <i class="fa-solid fa-arrow-right"></i>
            `;

        }

    }
);
// =========================================
// END OF MTC-CREATE-PASSWORD PAGE JS
// =========================================


// =========================================
// START OF MTC-FORGOT-PASSWORD PAGE JS
// =========================================

const passwordRecoveryForm =
    document.getElementById(
        "mtcPasswordRecoveryForm"
    );

const passwordRecoveryEmail =
    document.getElementById(
        "mtcPasswordRecoveryEmail"
    );

const passwordRecoveryMessage =
    document.getElementById(
        "mtcPasswordRecoveryMessage"
    );

const passwordRecoveryButton =
    document.getElementById(
        "mtcPasswordRecoveryButton"
    );


// =========================================
// FORGOT PASSWORD MESSAGE
// =========================================

function showPasswordRecoveryMessage(
    message,
    type
) {

    if (!passwordRecoveryMessage) {
        return;
    }

    passwordRecoveryMessage.textContent =
        message;

    passwordRecoveryMessage.className =
        "mtc-password-recovery-message";

    if (type) {

        passwordRecoveryMessage.classList.add(
            type
        );

    }

}


// =========================================
// SEND PASSWORD RESET EMAIL
// =========================================

passwordRecoveryForm?.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const email =
            passwordRecoveryEmail
                ?.value
                .trim()
                .toLowerCase();


        // =================================
        // CHECK EMAIL
        // =================================

        if (!email) {

            showPasswordRecoveryMessage(
                "Please enter your email address.",
                "error"
            );

            return;

        }


        // =================================
        // DISABLE BUTTON
        // =================================

        passwordRecoveryButton.disabled =
            true;

        passwordRecoveryButton.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Sending Reset Link...</span>
        `;


        try {

            // =================================
            // SEND RESET EMAIL
            // =================================

            const {
                error
            } =
                await createPasswordSupabase
                    .auth
                    .resetPasswordForEmail(
                        email,
                        {
                            redirectTo:
                                "http://127.0.0.1:5500/mtc-admin-reset-password.html"
                        }
                    );


            if (error) {

                throw error;

            }


            // =================================
            // SUCCESS
            // =================================

            showPasswordRecoveryMessage(
                "If an account exists for that email, a password reset link has been sent.",
                "success"
            );


            passwordRecoveryEmail.value =
                "";

        }
        catch (error) {

            console.error(
                "FORGOT PASSWORD ERROR:",
                error
            );


            // =================================
            // RATE LIMIT
            // =================================

            if (
                error?.status === 429 ||
                error?.message
                    ?.toLowerCase()
                    .includes("rate limit")
            ) {

                showPasswordRecoveryMessage(
                    "Too many reset emails have been requested. Please try again later.",
                    "error"
                );

            }
            else {

                showPasswordRecoveryMessage(
                    "Unable to send the password reset email. Please try again.",
                    "error"
                );

            }

        }
        finally {

            // =================================
            // RESTORE BUTTON
            // =================================

            passwordRecoveryButton.disabled =
                false;

            passwordRecoveryButton.innerHTML = `
                <span>Send Reset Link</span>
                <i class="fa-solid fa-arrow-right"></i>
            `;

        }

    }
);
// =========================================
// END OF MTC-FORGOT-PASSWORD PAGE JS
// =========================================


// =========================================
// START OF MTC-RESET-PASSWORD PAGE JS
// =========================================


// =========================================
// RESET PASSWORD PAGE ELEMENTS
// =========================================

const resetPasswordForm =
    document.getElementById(
        "mtcResetPasswordForm"
    );

const resetPasswordNewInput =
    document.getElementById(
        "mtcResetPasswordNew"
    );

const resetPasswordConfirmInput =
    document.getElementById(
        "mtcResetPasswordConfirm"
    );

const resetPasswordNewToggle =
    document.getElementById(
        "mtcResetPasswordNewToggle"
    );

const resetPasswordConfirmToggle =
    document.getElementById(
        "mtcResetPasswordConfirmToggle"
    );

const resetPasswordMessage =
    document.getElementById(
        "mtcResetPasswordMessage"
    );

const resetPasswordSubmit =
    document.getElementById(
        "mtcResetPasswordSubmit"
    );


// =========================================
// RESET PASSWORD MESSAGE
// =========================================

function showResetPasswordMessage(
    message,
    type
) {

    if (!resetPasswordMessage) {
        return;
    }

    resetPasswordMessage.textContent =
        message;

    resetPasswordMessage.className =
        "mtc-reset-password-message";

    if (type) {

        resetPasswordMessage.classList.add(
            type
        );

    }

}


// =========================================
// SHOW / HIDE RESET PASSWORD
// =========================================

setupPasswordToggle(
    resetPasswordNewToggle,
    resetPasswordNewInput
);

setupPasswordToggle(
    resetPasswordConfirmToggle,
    resetPasswordConfirmInput
);


// =========================================
// 3 MINUTE RESET PAGE LIMIT
// =========================================

let resetPasswordTimer = null;

if (resetPasswordForm) {

    const RESET_PASSWORD_LIMIT =
        3 * 60 * 1000;

    const resetPasswordExpiresAt =
        Date.now() +
        RESET_PASSWORD_LIMIT;

    resetPasswordTimer =
        setInterval(
            async () => {

                if (
                    Date.now() >=
                    resetPasswordExpiresAt
                ) {

                    clearInterval(
                        resetPasswordTimer
                    );

                    resetPasswordTimer =
                        null;


                    // =================================
                    // SIGN OUT RECOVERY SESSION
                    // =================================

                    await createPasswordSupabase
                        .auth
                        .signOut();


                    // =================================
                    // SHOW EXPIRED MESSAGE
                    // =================================

                    showResetPasswordMessage(
                        "Your password reset session has expired. Please request a new reset link.",
                        "error"
                    );


                    // =================================
                    // DISABLE FORM
                    // =================================

                    resetPasswordNewInput.disabled =
                        true;

                    resetPasswordConfirmInput.disabled =
                        true;

                    resetPasswordSubmit.disabled =
                        true;


                    // =================================
                    // RETURN TO FORGOT PASSWORD
                    // =================================

                    setTimeout(
                        () => {

                            window.location.href =
                                "mtc-admin-forgot-password.html";

                        },
                        1500
                    );

                }

            },
            1000
        );

}


// =========================================
// RESET PASSWORD
// =========================================

resetPasswordForm?.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const newPassword =
            resetPasswordNewInput.value;

        const confirmPassword =
            resetPasswordConfirmInput.value;


        // =================================
        // CHECK EMPTY FIELDS
        // =================================

        if (
            !newPassword ||
            !confirmPassword
        ) {

            showResetPasswordMessage(
                "Please enter and confirm your new password.",
                "error"
            );

            return;

        }


        // =================================
        // VALIDATE PASSWORD
        // =================================

        const passwordValidation =
            validatePassword(
                newPassword
            );


        if (!passwordValidation.valid) {

            showResetPasswordMessage(
                passwordValidation.message,
                "error"
            );

            return;

        }


        // =================================
        // CHECK PASSWORDS MATCH
        // =================================

        if (
            newPassword !==
            confirmPassword
        ) {

            showResetPasswordMessage(
                "The passwords do not match.",
                "error"
            );

            return;

        }


        // =================================
        // DISABLE BUTTON
        // =================================

        resetPasswordSubmit.disabled =
            true;

        resetPasswordSubmit.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Resetting Password...</span>
        `;


        let resetSucceeded =
            false;


        try {

            // =================================
            // VERIFY RECOVERY SESSION
            // =================================

            const {
                data: sessionData,
                error: sessionError
            } =
                await createPasswordSupabase
                    .auth
                    .getSession();


            if (sessionError) {

                throw sessionError;

            }


            if (!sessionData.session) {

                showResetPasswordMessage(
                    "Your password reset link is invalid or has expired. Please request a new reset link.",
                    "error"
                );

                return;

            }


            // =================================
            // UPDATE PASSWORD
            // =================================

            const {
                error: updatePasswordError
            } =
                await createPasswordSupabase
                    .auth
                    .updateUser({
                        password:
                            newPassword
                    });


            if (updatePasswordError) {

                throw updatePasswordError;

            }


            resetSucceeded =
                true;


            // =================================
            // STOP 3 MINUTE TIMER
            // =================================

            if (resetPasswordTimer) {

                clearInterval(
                    resetPasswordTimer
                );

                resetPasswordTimer =
                    null;

            }


            // =================================
            // SUCCESS
            // =================================

            showResetPasswordMessage(
                "Your password has been reset successfully. Redirecting to login...",
                "success"
            );


            // =================================
            // SIGN OUT RECOVERY SESSION
            // =================================

            await createPasswordSupabase
                .auth
                .signOut();


            // =================================
            // REDIRECT TO ADMIN LOGIN
            // =================================

            setTimeout(
                () => {

                    window.location.href =
                        "mtc-admin-login.html";

                },
                1500
            );

        }
        catch (error) {

            console.error(
                "RESET PASSWORD ERROR:",
                error
            );


            showResetPasswordMessage(
                error.message ||
                "Unable to reset your password. Please try again.",
                "error"
            );

        }
        finally {

            if (
                !resetSucceeded
            ) {

                resetPasswordSubmit.disabled =
                    false;

                resetPasswordSubmit.innerHTML = `
                    <span>Reset Password</span>
                    <i class="fa-solid fa-arrow-right"></i>
                `;

            }

        }

    }
);
// =========================================
// END OF MTC-RESET-PASSWORD PAGE JS
// =========================================



