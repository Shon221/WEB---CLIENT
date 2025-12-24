// public/register.js (החלף את הקיים)

function showAlert(message, type = "danger") {
    const box = document.getElementById("alertBox");
    box.className = `alert alert-${type}`;
    box.textContent = message;
    box.classList.remove("d-none");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function hideAlert() {
    const box = document.getElementById("alertBox");
    box.classList.add("d-none");
    box.textContent = "";
}

function hasLetterAndNumber(password) {
    return /[A-Za-z]/.test(password) && /\d/.test(password);
}

document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();

    const username = document.getElementById("username").value.trim();
    const firstName = document.getElementById("firstName").value.trim();
    const imageUrl = document.getElementById("imageUrl").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!username || !firstName || !imageUrl || !password || !confirmPassword) {
        return showAlert("All fields are required.");
    }
    if (password.length < 6) {
        return showAlert("Password must be at least 6 characters long.");
    }
    if (!hasLetterAndNumber(password)) {
        return showAlert("Password must include at least one letter and one number.");
    }
    if (password !== confirmPassword) {
        return showAlert("Passwords do not match.");
    }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, firstName, imageUrl, password })
        });

        const data = await res.json();

        if (res.ok) {
            showAlert("Registration successful! Redirecting...", "success");
            setTimeout(() => window.location.href = "login.html", 1000);
        } else {
            showAlert(data.error || "Registration failed");
        }
    } catch (err) {
        showAlert("Server error. Please try again later.");
    }
});