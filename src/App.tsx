// ----------------- СТИЛИ -----------------
function GlobalStyles() {
    return (
        <style>
            {`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
            
            * {
                box-sizing: border-box;
            }
            body {
                margin: 0;
                background-color: var(--color-bg-primary); 
                font-family: 'Inter', sans-serif;
            }
            
            :root {
                /* Dark Mode Defaults */
                --color-bg-primary: #1f2937; 
                --color-bg-secondary: #374151; 
                --color-bg-card: #374151; 
                --color-bg-hover: #4b5563; 
                --color-bg-input: #4b5563; 
                --color-text-primary: #e5e7eb; 
                --color-text-secondary: #9ca3af; 
                --color-border: #4b5563; 
                --color-primary-blue: #5b7efc; 
                --color-error-bg: rgba(185, 28, 28, 0.1);
                --color-error-border: #b91c1c;
                --color-error-text: #fca5a5;

                /* Tumbler colors */
                --color-tumbler-bg-off: #6b7280; 
                --color-tumbler-bg-on: #5b7efc;  
                --color-tumbler-knob: white;
            }
            
            .light-mode {
                --color-bg-primary: #f9fafb;
                --color-bg-secondary: #ffffff;
                --color-bg-card: #ffffff;
                --color-bg-hover: #f3f4f6;
                --color-bg-input: #f3f4f6;
                --color-text-primary: #1f2937;
                --color-text-secondary: #6b7280;
                --color-border: #e5e7eb;
                --color-primary-blue: #2563eb;
                --color-error-bg: #fee2e2;
                --color-error-border: #fca5a5;
                --color-error-text: #b91c1c;

                --color-tumbler-bg-off: #ccc;
                --color-tumbler-bg-on: #2563eb;
                --color-tumbler-knob: white;
            }

            .app-container {
                min-height: 100vh;
                background-color: var(--color-bg-primary);
                color: var(--color-text-primary);
                font-family: 'Inter', sans-serif;
                display: flex;
                flex-direction: column;
                transition: background-color 0.3s, color 0.3s;
            }

            /* Login screen styles */
            .login-form-wrapper {
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 2rem;
                width: 100%;
                position: relative; 
            }
            .login-card {
                max-width: 28rem;
                width: 100%;
                background-color: var(--color-bg-card);
                padding: 2.5rem;
                border-radius: 1rem;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                border: 1px solid var(--color-border);
                position: relative;
            }
            .logo-text {
                font-size: 2.5rem;
                font-weight: 900;
                text-align: center;
                margin-bottom: 0.5rem;
                color: var(--color-primary-blue);
            }
            .tagline {
                text-align: center;
                margin-bottom: 2rem;
                color: var(--color-text-secondary);
                font-size: 0.9rem;
            }
            .form {
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
            }
            .login-input {
                width: 100%;
                background-color: var(--color-bg-input);
                border: 1px solid var(--color-border);
                color: var(--color-text-primary);
                padding: 0.75rem;
                border-radius: 0.75rem;
                transition: all 0.15s;
                outline: none;
            }
            .password-input-container {
                position: relative;
            }
            .toggle-password-visibility {
                position: absolute;
                right: 0.75rem;
                top: 50%;
                transform: translateY(-50%);
                background: none;
                border: none;
                color: var(--color-text-secondary);
                cursor: pointer;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
            }

            .login-error, .error-screen {
                padding: 0.75rem;
                background-color: var(--color-error-bg);
                border: 1px solid var(--color-error-border);
                color: var(--color-error-text); 
                font-size: 0.875rem;
                border-radius: 0.5rem;
                margin-top: 1rem;
                display: flex;
                align-items: center;
                text-align: left;
            }
            .error-screen {
                flex-direction: column;
                align-items: center;
                text-align: center;
                padding: 1.5rem;
                margin-top: 0;
            }

            /* Switch/Tumbler styles */
            .checkbox-row {
                display: flex;
                align-items: center;
                font-size: 0.9rem; 
                color: var(--color-text-primary); 
                cursor: pointer;
                justify-content: space-between; 
                width: 100%; 
            }
            .checkbox-row a {
                color: var(--color-primary-blue);
                text-decoration: none;
                font-weight: 600;
            }
            .switch-container {
                position: relative;
                width: 2.5rem; 
                height: 1.25rem; 
                border-radius: 9999px;
                transition: background-color 0.2s ease-in-out;
                flex-shrink: 0;
                background-color: var(--color-tumbler-bg-off); 
                cursor: pointer;
            }
            .switch-container.checked {
                background-color: var(--color-tumbler-bg-on); 
            }
            .switch-knob {
                position: absolute;
                top: 0.125rem; 
                left: 0.125rem; 
                width: 1rem; 
                height: 1rem; 
                background-color: var(--color-tumbler-knob);
                border-radius: 9999px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                transform: translateX(0);
                transition: transform 0.2s ease-in-out;
            }
            .switch-container.checked .switch-knob {
                transform: translateX(1.25rem); 
            }

            /* Header, Main and Buttons */
            .app-header {
                padding: 1rem;
                background-color: var(--color-bg-secondary);
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: sticky;
                top: 0;
                z-index: 10;
                border-bottom: 1px solid var(--color-border);
            }
            .app-main {
                flex-grow: 1;
                padding: 1.5rem 1rem 5rem;
                display: flex;
                flex-direction: column;
                align-items: center;
                width: 100%;
                max-width: 500px; 
                margin: 0 auto;
            }
            .button-primary {
                background-color: var(--color-primary-blue);
                color: white;
                padding: 0.75rem 1.5rem;
                border-radius: 0.75rem;
                font-weight: 600;
                transition: background-color 0.15s;
                border: none;
                cursor: pointer;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            }
             .button-secondary {
                background-color: var(--color-bg-input);
                color: var(--color-text-primary);
                padding: 0.5rem 1rem;
                border-radius: 0.5rem;
                font-weight: 500;
                border: 1px solid var(--color-border);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            /* TabBar Styles */
            .tabbar-container {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                display: flex;
                justify-content: space-around;
                background-color: var(--color-bg-secondary);
                border-top: 1px solid var(--color-border);
                padding: 0.5rem 0;
                z-index: 20;
            }
            .tab-button {
                background: none;
                border: none;
                min-width: 4rem;
                padding: 0.25rem;
            }

            /* Cargo Page Styles */
            .loading-screen, .empty-screen {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 2rem;
                text-align: center;
                color: var(--color-text-secondary);
                font-size: 1rem;
            }
            .section-title {
                font-size: 1.5rem;
                font-weight: 700;
                color: var(--color-text-primary);
                margin-bottom: 1.5rem;
                width: 100%;
                text-align: left;
            }
            .cargo-list-container {
                width: 100%;
            }
            .cargo-card {
                background-color: var(--color-bg-card);
                border: 1px solid var(--color-border);
                border-radius: 0.75rem;
                padding: 1rem;
                margin-bottom: 1rem;
                font-size: 0.9rem;
            }
            .cargo-row {
                display: flex;
                justify-content: space-between;
                padding: 0.2rem 0;
            }
            .cargo-row.main {
                font-weight: 700;
                font-size: 1.1rem;
                margin-bottom: 0.5rem;
                border-bottom: 1px dashed var(--color-border);
                padding-bottom: 0.5rem;
            }
            .cargo-label {
                color: var(--color-text-secondary);
            }
            .cargo-value.status {
                color: var(--color-primary-blue);
            }
            .button-download {
                width: 100%;
                background-color: var(--color-bg-input);
                color: var(--color-text-primary);
                padding: 0.75rem 1rem;
                border-radius: 0.5rem;
                font-weight: 600;
                border: 1px solid var(--color-border);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-top: 1rem;
                transition: background-color 0.15s;
            }
            .button-download:hover:not(:disabled) {
                background-color: var(--color-bg-hover);
            }
            .button-download:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            `}
        </style>
    );
}
