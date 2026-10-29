
async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Request failed.");
    }

    return data;
}

function post(url, data, method = "POST") {
    return api(url, {
        method,
        body: JSON.stringify(data)
    });
}

let currentUser = null;

function setNotice(message, error = false) {
    const element = document.querySelector("#notice");

    if (!element) return;

    element.textContent = message;
    element.style.color = error ? "#ff7777" : "#88ddaa";
}

function showAuth(mode) {
    const dialog = document.querySelector("#auth-dialog");
    const signup = mode === "signup";
    const form = document.querySelector("#auth-form");

    form.reset();

    dialog.dataset.mode = mode;

    document.querySelector("#auth-title").textContent =
        signup ? "Create Account" : "Log In";

    document.querySelector("#username-field").hidden = !signup;
    document.querySelector("#email-field").hidden = !signup;
    document.querySelector("#identity-field").hidden = signup;

    form.elements.username.required = signup;
    form.elements.email.required = signup;
    form.elements.identity.required = !signup;

    document.querySelector("#auth-error").textContent = "";

    dialog.showModal();
}

async function refreshAuth() {
    const data = await api("/api/auth/me");
    currentUser = data.user;

    const container = document.querySelector(".auth-buttons");

    if (!container) return;

    container.replaceChildren();

    if (currentUser) {
        const username = document.createElement("span");
        username.textContent = currentUser.username;

        const logout = document.createElement("button");
        logout.className = "btn";
        logout.textContent = "Log Out";

        logout.onclick = async () => {
            try {
                await post("/api/auth/logout", {});
                window.location.href = "/";
            } catch (error) {
                setNotice(error.message, true);
            }
        };

        container.append(username, logout);
    } else {
        const login = document.createElement("button");
        login.className = "btn login";
        login.textContent = "Login";
        login.onclick = () => showAuth("login");

        const signup = document.createElement("button");
        signup.className = "btn signup";
        signup.textContent = "Sign Up";
        signup.onclick = () => showAuth("signup");

        container.append(login, signup);
    }

    document.dispatchEvent(new Event("authready"));
}

document.addEventListener("DOMContentLoaded", () => {
    const dialog = document.createElement("dialog");
    dialog.id = "auth-dialog";

    dialog.innerHTML = `
        <form id="auth-form">
            <h2 id="auth-title">Log In</h2>

            <label id="username-field" hidden>
                Username
                <input name="username" autocomplete="username"
                    minlength="3" maxlength="24">
            </label>

            <label id="email-field" hidden>
                Email
                <input name="email" type="email"
                    autocomplete="email">
            </label>

            <label id="identity-field">
                Username or Email
                <input name="identity" autocomplete="username">
            </label>

            <label>
                Password
                <input name="password" type="password"
                    autocomplete="current-password"
                    required minlength="10">
            </label>

            <p id="auth-error" role="alert"></p>

            <div class="form-actions">
                <button type="button" id="auth-cancel">
                    Cancel
                </button>
                <button type="submit" class="btn">
                    Continue
                </button>
            </div>
        </form>
    `;

    document.body.appendChild(dialog);

    document.querySelector("#auth-cancel").onclick = () => {
        dialog.close();
    };

    document.querySelector("#auth-form").onsubmit = async (event) => {
        event.preventDefault();

        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        const mode = dialog.dataset.mode;

        try {
            if (mode === "signup") {
                await post("/api/auth/signup", {
                    username: values.username,
                    email: values.email,
                    password: values.password
                });
            } else {
                await post("/api/auth/login", {
                    identity: values.identity,
                    password: values.password
                });
            }

            dialog.close();
            form.reset();

            await refreshAuth();
        } catch (error) {
            document.querySelector("#auth-error").textContent =
                error.message;
        }
    };

    refreshAuth().catch(error => {
        console.error(error);
        setNotice("Could not connect to the server.", true);
    });
});
