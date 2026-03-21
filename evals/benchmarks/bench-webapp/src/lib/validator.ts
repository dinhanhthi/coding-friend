/**
 * Validates an email address format.
 */
export function validateEmail(email: string): boolean {
  if (!email) return false;
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

/**
 * Validates a password meets strength requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 */
export function validatePassword(password: string): boolean {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

/**
 * Validates a username:
 * - Between 3 and 20 characters
 * - Only alphanumeric and underscores
 */
export function validateUsername(username: string): boolean {
  if (username.length < 3 || username.length > 20) return false;
  return /^[a-zA-Z0-9_]+$/.test(username);
}

export function validatePhone(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-()]{7,15}$/;
  return phoneRegex.test(phone.trim());
}
