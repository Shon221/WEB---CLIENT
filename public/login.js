
function showAlert(message, type = 'danger') {
    const box = document.getElementById('alertBox');
    box.className = `alert alert-${type}`;
    box.textContent = message;
    box.classList.remove('d-none');
}

function hideAlert() {
    document.getElementById('alertBox').classList.add('d-none');
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        return showAlert('Please enter username and password.');
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (res.ok) {
            sessionStorage.setItem('currentUser', JSON.stringify(data.user));
            showAlert('Login successful! Redirecting...', 'success');
            setTimeout(() => window.location.href = 'search.html', 600);
        } else {
            showAlert(data.error || 'Login failed');
        }
    } catch (err) {
        showAlert('Server connection failed.');
    }
});