const zoneName = process.env.CLOUDFLARE_ZONE_NAME || 'usdwatch.com';
const token = process.env.CLOUDFLARE_API_TOKEN;

const clerkRecords = [
  ['clerk.usdwatch.com', 'frontend-api.clerk.services'],
  ['accounts.usdwatch.com', 'accounts.clerk.services'],
  ['clkmail.usdwatch.com', 'mail.nubxrboqbtp2.clerk.services'],
  ['clk._domainkey.usdwatch.com', 'dkim1.nubxrboqbtp2.clerk.services'],
  ['clk2._domainkey.usdwatch.com', 'dkim2.nubxrboqbtp2.clerk.services'],
];

if (!token) {
  throw new Error('CLOUDFLARE_API_TOKEN is required to manage Clerk DNS records.');
}

async function cloudflare(path, options = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const errors = (body.errors || [])
      .map((error) => `${error.code || res.status}: ${error.message}`)
      .join('; ');
    throw new Error(errors || `Cloudflare request failed with ${res.status}`);
  }
  return body.result;
}

async function upsertRecord(zoneId, name, content) {
  const existing = await cloudflare(
    `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(name)}`,
  );
  const record = existing?.[0];
  const payload = {
    type: 'CNAME',
    name,
    content,
    ttl: 1,
    proxied: false,
    comment: 'Required for Clerk production authentication.',
  };

  if (!record) {
    await cloudflare(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    console.log(`Created ${name} -> ${content}`);
    return;
  }

  if (record.content === content && record.proxied === false) {
    console.log(`Verified ${name} -> ${content}`);
    return;
  }

  await cloudflare(`/zones/${zoneId}/dns_records/${record.id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  console.log(`Updated ${name} -> ${content}`);
}

async function main() {
  const zones = await cloudflare(`/zones?name=${encodeURIComponent(zoneName)}`);
  const zone = zones?.[0];
  if (!zone) {
    throw new Error(`Cloudflare zone not found: ${zoneName}`);
  }

  for (const [name, content] of clerkRecords) {
    await upsertRecord(zone.id, name, content);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
