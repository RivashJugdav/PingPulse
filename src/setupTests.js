// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'your-secret-key';

// Add any global test setup here
// For example, you might want to set up global mocks or configure test environment

// Example: Increase timeout for all tests
jest.setTimeout(10000);

// Example: Suppress console.error during tests
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Warning: ReactDOM.render is no longer supported')
  ) {
    return;
  }
  console.warn(...args);
}; 