.login-form-wrapper {
  display: flex;
  justify-content: center;
  padding: 40px 16px;
}

.login-card {
  background: var(--color-bg-secondary, #ffffff);
  padding: 32px;
  border-radius: 18px;
  max-width: 420px;
  width: 100%;
  border: 1px solid #e5e7eb;
}

.login-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo-text {
  font-size: 32px;
  font-weight: 800;
  color: #4a7fff;
  text-align: center;
}

.login-subtitle {
  text-align: center;
  color: #6b7280;
  margin-bottom: 24px;
  margin-top: 12px;
}

.login-input {
  width: 100%;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #f3f4f6;
  font-size: 16px;
  outline: none;
}

.field {
  margin-bottom: 18px;
}

.password-input-container {
  position: relative;
}

.password-visibility {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
}

.button-primary {
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  background: #4a7fff;
  color: white;
  font-size: 18px;
  font-weight: 600;
  border: none;
  cursor: pointer;
}

.button-primary:disabled {
  opacity: 0.6;
}
