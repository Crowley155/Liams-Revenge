export function casesErrorCopy(error) {
  const message = error?.message || String(error || '');
  if (message.includes('401') || /auth|token|sign-?in/i.test(message)) {
    return {
      title: 'Your account is signed in, but USDWatch could not connect it yet',
      body: 'Refresh the page once. If this keeps happening, sign out and sign back in so USDWatch can reconnect your private workspace.',
    };
  }
  return {
    title: 'Cases could not load',
    body: 'Try again in a moment. Your account and evidence are not affected.',
  };
}
