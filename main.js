// Initialize Stripe with better error handling
let stripe;
try {
    stripe = Stripe('pk_test_51Rsh39Hf80l4CalFqeTdkDFmgU87anDljz6dXhRcbxKxBmhKrfHLt7YVH60LYPzwt7TurUxKeL1SntWwVzPHMXYs00wEbj1w9b'); // Replace with your actual publishable key
} catch (error) {
    console.error('Stripe initialization error:', error);
    stripe = null;
}

// Create card element with better error handling
let cardElement;
if (stripe) {
    cardElement = stripe.elements().create('card', {
        style: {
            base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                    color: '#aab7c4',
                },
            },
            invalid: {
                color: '#9e2146',
            },
        },
    });
}

// Global variables
let userIPInfo = {};
let selectedPaymentMethod = 'stripe';

// IP Detection and Location
async function detectUserLocation() {
    try {
        const response = await fetch('/api/ip-info');
        const data = await response.json();
        
        userIPInfo = data;
        
        // Update UI with IP info
        const countryFlag = document.getElementById('countryFlag');
        const locationInfo = document.getElementById('locationInfo');
        const userIP = document.getElementById('userIP');
        
        if (countryFlag && data.flag) {
            countryFlag.src = data.flag;
        }
        if (locationInfo) {
            locationInfo.textContent = `${data.city}, ${data.country}`;
        }
        if (userIP) {
            userIP.textContent = data.ip;
        }
        
        // Auto-fill country if available
        const countrySelect = document.getElementById('country');
        if (countrySelect && data.countryCode) {
            const countryOption = Array.from(countrySelect.options).find(option => 
                option.value === data.countryCode
            );
            if (countryOption) {
                countrySelect.value = data.countryCode;
            }
        }
        
        console.log('User location detected:', data);
    } catch (error) {
        console.error('Error detecting location:', error);
        const locationInfo = document.getElementById('locationInfo');
        const userIP = document.getElementById('userIP');
        if (locationInfo) locationInfo.textContent = 'Location unavailable';
        if (userIP) userIP.textContent = 'Unknown';
    }
}

// Save user data to database
async function saveUserData(userData) {
    try {
        const response = await fetch('/api/save-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...userData,
                ipInfo: userIPInfo,
                paymentMethod: selectedPaymentMethod
            }),
        });
        
        const result = await response.json();
        console.log('User data saved:', result);
        return result;
    } catch (error) {
        console.error('Error saving user data:', error);
        return null;
    }
}

// Payment method selection
function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    
    // Update button states
    document.querySelectorAll('.payment-method-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const selectedBtn = document.querySelector(`[data-method="${method}"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    // Update enroll button text
    const enrollBtn = document.querySelector('.enroll-btn');
    if (enrollBtn) {
        if (method === 'stripe') {
            enrollBtn.innerHTML = '<i class="fas fa-play"></i> ENROLL NOW';
        } else {
            enrollBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> GO TO STRIPE';
        }
    }
}

// Handle enrollment based on selected payment method
async function handleEnrollment() {
    const form = document.getElementById('registration-form');
    if (!form) {
        alert('Registration form not found.');
        return;
    }
    
    const formData = new FormData(form);
    
    // Validate form
    const inputs = form.querySelectorAll('input[required], select[required]');
    let isValid = true;
    
    inputs.forEach(input => {
        if (!input.value.trim()) {
            isValid = false;
            input.style.borderColor = '#dc2626';
            input.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.1)';
        } else {
            input.style.borderColor = '#e2e8f0';
            input.style.boxShadow = 'none';
        }
    });
    
    if (!isValid) {
        alert('Please fill in all required fields.');
        return;
    }
    
    // Save user data
    const userData = {
        fullName: formData.get('fullName'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        country: formData.get('country'),
        state: formData.get('state'),
        city: formData.get('city')
    };
    
    await saveUserData(userData);
    
    // Handle payment based on selected method
    if (selectedPaymentMethod === 'stripe') {
        openPaymentModal();
    } else {
        // Redirect to Stripe Checkout
        redirectToStripe(userData);
    }
}

// Redirect to Stripe Checkout
async function redirectToStripe(userData) {
    try {
        const response = await fetch('/create-payment-intent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: 1999900, // ₹19,999 in paise
                planName: 'PMP Success Program',
                customerEmail: userData.email,
                customerName: userData.fullName
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const { clientSecret } = await response.json();
        
        if (!stripe) {
            alert('Stripe is not initialized. Please check your configuration.');
            return;
        }
        
        // Redirect to Stripe Checkout
        stripe.redirectToCheckout({
            sessionId: clientSecret
        });
    } catch (error) {
        console.error('Error redirecting to Stripe:', error);
        alert('Error processing payment. Please try again.');
    }
}

// Payment Modal Functions
function openPaymentModal() {
    if (!stripe || !cardElement) {
        alert('Payment system is not available. Please try again later.');
        return;
    }
    
    // Pre-fill modal with form data if available
    const fullName = document.getElementById('fullName')?.value || '';
    const email = document.getElementById('email')?.value || '';
    
    const modalEmail = document.getElementById('modal-email');
    const modalName = document.getElementById('modal-name');
    
    if (fullName && modalName) {
        modalName.value = fullName;
    }
    if (email && modalEmail) {
        modalEmail.value = email;
    }
    
    const modal = document.getElementById('paymentModal');
    if (modal) {
        modal.style.display = 'block';
        
        // Mount card element when modal opens
        setTimeout(() => {
            if (cardElement) {
                cardElement.mount('#card-element');
            }
        }, 100);
    }
}

function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    if (modal) {
        modal.style.display = 'none';
    }
    if (cardElement) {
        cardElement.unmount();
    }
}

function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Handle real-time validation errors from the card Element
if (cardElement) {
    cardElement.on('change', ({error}) => {
        const displayError = document.getElementById('card-errors');
        if (displayError) {
            if (error) {
                displayError.textContent = error.message;
                displayError.style.display = 'block';
            } else {
                displayError.textContent = '';
                displayError.style.display = 'none';
            }
        }
    });
}

// Handle form submission
const form = document.getElementById('payment-form');
if (form) {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const submitButton = document.getElementById('submit-payment');
        const buttonText = document.getElementById('button-text');
        const spinner = document.getElementById('spinner');

        if (!submitButton || !buttonText || !spinner) {
            alert('Payment form elements not found.');
            return;
        }

        // Disable submit button and show loading
        submitButton.disabled = true;
        buttonText.style.display = 'none';
        spinner.classList.remove('hidden');

        try {
            if (!stripe || !cardElement) {
                throw new Error('Stripe is not initialized');
            }

            const {error, paymentMethod} = await stripe.createPaymentMethod({
                type: 'card',
                card: cardElement,
                billing_details: {
                    name: document.getElementById('modal-name')?.value || '',
                    email: document.getElementById('modal-email')?.value || '',
                },
            });

            if (error) {
                showError(error.message);
                resetButton();
                return;
            }

            // Create payment intent on server
            const response = await fetch('/create-payment-intent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amount: 1999900, // ₹19,999 in paise
                    planName: 'PMP Success Program',
                    customerEmail: document.getElementById('modal-email')?.value || '',
                    customerName: document.getElementById('modal-name')?.value || ''
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const {clientSecret} = await response.json();

            // Confirm payment with Stripe
            const {error: confirmError} = await stripe.confirmCardPayment(clientSecret, {
                payment_method: paymentMethod.id
            });

            if (confirmError) {
                showError(confirmError.message);
                resetButton();
            } else {
                // Payment succeeded
                closePaymentModal();
                showSuccessModal();
                resetButton();
            }
        } catch (err) {
            console.error('Payment error:', err);
            showError('An error occurred while processing your payment. Please try again.');
            resetButton();
        }
    });
}

function showError(message) {
    const errorElement = document.getElementById('card-errors');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function resetButton() {
    const submitButton = document.getElementById('submit-payment');
    const buttonText = document.getElementById('button-text');
    const spinner = document.getElementById('spinner');

    if (submitButton) submitButton.disabled = false;
    if (buttonText) buttonText.style.display = 'inline';
    if (spinner) spinner.classList.add('hidden');
}

function showSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const paymentModal = document.getElementById('paymentModal');
    const successModal = document.getElementById('successModal');
    
    if (event.target === paymentModal) {
        closePaymentModal();
    }
    if (event.target === successModal) {
        closeSuccessModal();
    }
}

// Form validation for registration form
document.addEventListener('DOMContentLoaded', function() {
    const registrationForm = document.getElementById('registration-form');
    const enrollBtn = document.querySelector('.enroll-btn');
    
    if (registrationForm && enrollBtn) {
        // Enable/disable enroll button based on form completion
        function validateForm() {
            const inputs = registrationForm.querySelectorAll('input[required], select[required]');
            let isValid = true;
            
            inputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                }
            });
            
            enrollBtn.disabled = !isValid;
            enrollBtn.style.opacity = isValid ? '1' : '0.6';
        }
        
        // Add event listeners to form inputs
        registrationForm.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('input', validateForm);
            input.addEventListener('change', validateForm);
        });
        
        // Initial validation
        validateForm();
    }
    
    // Add payment method button listeners
    document.querySelectorAll('.payment-method-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            selectPaymentMethod(this.dataset.method);
        });
    });
    
    // Initialize IP detection
    detectUserLocation();
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Add scroll animations
window.addEventListener('scroll', () => {
    const elements = document.querySelectorAll('.benefit-item, .bonus-card, .chat-bubble');
    
    elements.forEach(element => {
        const elementTop = element.getBoundingClientRect().top;
        const elementVisible = 150;
        
        if (elementTop < window.innerHeight - elementVisible) {
            element.classList.add('animate');
        }
    });
});

// Video thumbnail click handlers
document.addEventListener('DOMContentLoaded', function() {
    const videoThumbnails = document.querySelectorAll('.video-thumbnail');
    
    videoThumbnails.forEach(thumbnail => {
        thumbnail.addEventListener('click', function() {
            // You can add video modal functionality here
            console.log('Video clicked:', this.querySelector('p')?.textContent);
        });
    });
});

// Add CSS animation class
const style = document.createElement('style');
style.textContent = `
    .benefit-item, .bonus-card, .chat-bubble {
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.6s ease;
    }
    
    .benefit-item.animate, .bonus-card.animate, .chat-bubble.animate {
        opacity: 1;
        transform: translateY(0);
    }
    
    .enroll-btn:disabled {
        cursor: not-allowed;
        transform: none !important;
        box-shadow: none !important;
    }
    
    .payment-method-btn {
        transition: all 0.3s ease;
    }
    
    .payment-method-btn:hover {
        transform: translateY(-2px);
    }
    
    #card-errors {
        color: #dc2626;
        font-size: 0.875rem;
        margin-top: 0.5rem;
        padding: 0.5rem;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 0.25rem;
        display: none;
    }
    
    .form-group input.error {
        border-color: #dc2626 !important;
        box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1) !important;
    }
    
    .modal-content {
        max-height: 90vh;
        overflow-y: auto;
    }
    
    @media (max-width: 768px) {
        .modal-content {
            margin: 5% auto;
            width: 95%;
            max-height: 95vh;
        }
    }
`;
document.head.appendChild(style);