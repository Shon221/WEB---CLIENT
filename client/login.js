function getUsers() {
    try {
        return JSON.parse(localStorage.getItem('users')) || [];
    } catch {
        return [];
    }
}

function showAlert(message, type = 'danger') {
    const box = document.getElementById('alertBox');
    box.className = `alert alert-${type}`;
    box.textContent = message;
    box.classList.remove('d-none');
}

function hideAlert() {
    document.getElementById('alertBox').classList.add('d-none');
}

// Show header user info if already logged-in (even on back navigation)
function renderNavUser() {
    const raw = sessionStorage.getItem('currentUser');
    if (!raw) return;

    try {
        const u = JSON.parse(raw);
        document.getElementById('navUserImg').src = u.imageUrl || '';
        document.getElementById('navUserText').textContent = u.username ? `Logged in as ${u.username}` : 'Logged in';
        document.getElementById('userArea').style.display = 'flex';
    } catch { }
}

renderNavUser();

document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    hideAlert();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showAlert('Please enter username and password.');
        return;
    }

    const users = getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

    if (!user) {
        showAlert('Invalid username or password.');
        return;
    }

    // Save currentUser in sessionStorage (required)
    sessionStorage.setItem('currentUser', JSON.stringify({
        username: user.username,
        firstName: user.firstName,
        imageUrl: user.imageUrl
    }));

    showAlert('Login successful! Redirecting to search...', 'success');

    // Redirect to search page (next section)
    setTimeout(() => {
        window.location.href = 'search.html';
    }, 600);
});