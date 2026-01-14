/* =========================
   AUTHENTICATION HANDLER
   ========================= */

// Initialize authentication system
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    const currentUser = JSON.parse(localStorage.getItem('spotify_user'));
    if (currentUser && window.location.pathname.includes('login.html')) {
        window.location.href = 'main.htm';
        return;
    }

    // Login Form Handler
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Register Form Handler
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Social login buttons (placeholder)
    document.querySelectorAll('.social-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Social login coming soon! Please use email registration.');
        });
    });
});

// Handle Login
function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    // Clear previous errors
    errorDiv.classList.remove('show');
    errorDiv.textContent = '';
    
    // Validate inputs
    if (!email || !password) {
        showError(errorDiv, 'Please fill in all fields.');
        return;
    }
    
    // Get users from localStorage
    const users = JSON.parse(localStorage.getItem('spotify_users')) || [];
    
    // Find user by email/username and password
    const user = users.find(u => 
        (u.email === email || u.username === email) && u.password === password
    );
    
    if (user) {
        // Store current user session
        const sessionUser = {
            username: user.username,
            email: user.email,
            loginTime: new Date().toISOString()
        };
        localStorage.setItem('spotify_user', JSON.stringify(sessionUser));
        
        // Redirect to main page
        window.location.href = 'main.htm';
    } else {
        showError(errorDiv, 'Incorrect email/username or password.');
    }
}

// Handle Register
function handleRegister(e) {
    e.preventDefault();
    
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const username = document.getElementById('registerUsername').value.trim();
    const day = document.getElementById('registerDay').value;
    const month = document.getElementById('registerMonth').value;
    const year = document.getElementById('registerYear').value;
    const gender = document.querySelector('input[name="gender"]:checked');
    const errorDiv = document.getElementById('registerError');
    
    // Clear previous errors
    errorDiv.classList.remove('show');
    errorDiv.textContent = '';
    
    // Validate inputs
    if (!email || !password || !username) {
        showError(errorDiv, 'Please fill in all required fields.');
        return;
    }
    
    if (password.length < 8) {
        showError(errorDiv, 'Password must be at least 8 characters long.');
        return;
    }
    
    if (!day || !month || !year) {
        showError(errorDiv, 'Please enter your date of birth.');
        return;
    }
    
    if (!gender) {
        showError(errorDiv, 'Please select your gender.');
        return;
    }
    
    // Validate date
    const birthDate = new Date(year, month - 1, day);
    if (birthDate > new Date() || year < 1900 || year > new Date().getFullYear()) {
        showError(errorDiv, 'Please enter a valid date of birth.');
        return;
    }
    
    // Get existing users
    const users = JSON.parse(localStorage.getItem('spotify_users')) || [];
    
    // Check if email or username already exists
    if (users.some(u => u.email === email)) {
        showError(errorDiv, 'An account with this email already exists.');
        return;
    }
    
    if (users.some(u => u.username === username)) {
        showError(errorDiv, 'This username is already taken.');
        return;
    }
    
    // Create new user
    const newUser = {
        email: email,
        password: password,
        username: username,
        birthDate: {
            day: day,
            month: month,
            year: year
        },
        gender: gender.value,
        createdAt: new Date().toISOString()
    };
    
    // Add user to storage
    users.push(newUser);
    localStorage.setItem('spotify_users', JSON.stringify(users));
    
    // Auto-login after registration
    const sessionUser = {
        username: newUser.username,
        email: newUser.email,
        loginTime: new Date().toISOString()
    };
    localStorage.setItem('spotify_user', JSON.stringify(sessionUser));
    
    // Redirect to main page
    window.location.href = 'main.htm';
}

// Show error message
function showError(errorDiv, message) {
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

// Logout function (can be called from main page)
function logout() {
    localStorage.removeItem('spotify_user');
    window.location.href = 'login.html';
}

