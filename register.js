function getUsers() {
    try {
        const raw = localStorage.getItem("users");
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveUsers(users) {
    localStorage.setItem("users", JSON.stringify(users));
}

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
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);
    return hasLetter && hasNumber;
}

document.getElementById("registerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    hideAlert();

    const username = document.getElementById("username").value.trim();
    const firstName = document.getElementById("firstName").value.trim();
    const imageUrl = document.getElementById("imageUrl").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    // Required fields
    if (!username || !firstName || !imageUrl || !password || !confirmPassword) {
        showAlert("All fields are required.");
        return;
    }

    // Password rules
    if (password.length < 6) {
        showAlert("Password must be at least 6 characters long.");
        return;
    }
    if (!hasLetterAndNumber(password)) {
        showAlert("Password must include at least one letter and one number.");
        return;
    }

    // Confirm password
    if (password !== confirmPassword) {
        showAlert("Passwords do not match.");
        return;
    }

    // Unique username
    const users = getUsers();
    const exists = users.some(u => String(u.username).toLowerCase() === username.toLowerCase());
    if (exists) {
        showAlert("This username already exists. Please choose a different username.");
        return;
    }

    // Save new user
    const newUser = {
        username,
        password,     // (For this assignment) stored as plain text in localStorage
        firstName,
        imageUrl
    };

    users.push(newUser);
    saveUsers(users);

    showAlert("Registration successful! Redirecting to login...", "success");

    setTimeout(() => {
        window.location.href = "login.html";
    }, 800);
});