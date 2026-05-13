export function casesErrorCopy(error) {
  const message = error?.message || String(error || '');
  if (message.includes('401') || /auth|token|sign-?in/i.test(message)) {
    return {
      title: 'Your account is signed in, but USDWatch could not connect it yet',
      body: 'Refresh the page once. If this keeps happening, sign out and sign back in so USDWatch can reconnect your private workspace.',
    };
  }
  if (/plan includes \d+ draft or active case/i.test(message)) {
    return {
      title: 'New case limit reached',
      body: 'Your current plan is limited to the current case count. Archive an old case or upgrade the workspace before creating another case.',
    };
  }
  return {
    title: 'Cases could not load',
    body: 'Try again in a moment. Your account and evidence are not affected.',
  };
}
