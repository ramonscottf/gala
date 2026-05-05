// Shared helpers for Bloomerang API v2

const BLOOMERANG_API = 'https://api.bloomerang.co/v2';

/**
 * Execute a Bloomerang API request
 */
export async function bloomerangFetch(apiKey, endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
  };
  if (body && method !== 'GET') {
    opts.body = JSON.stringify(body);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${BLOOMERANG_API}${endpoint}`;
  const res = await fetch(url, opts);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bloomerang ${method} ${endpoint} returned ${res.status}: ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

/**
 * Search for a constituent by email
 */
export async function findConstituentByEmail(apiKey, email) {
  if (!email) return null;
  const data = await bloomerangFetch(apiKey, `/constituents?search=${encodeURIComponent(email)}&take=5`);
  const results = data.Results || [];
  // Find exact email match
  return results.find(c => {
    const emails = (c.EmailAddresses || []).map(e => e.Value?.toLowerCase());
    return emails.includes(email.toLowerCase());
  }) || results[0] || null;
}

/**
 * Create a new constituent in Bloomerang
 */
export async function createConstituent(apiKey, { firstName, lastName, email, city, state }) {
  const payload = {
    Type: 'Individual',
    FirstName: firstName || '',
    LastName: lastName || 'Unknown',
    PrimaryEmail: email ? { Type: 'Home', Value: email, IsPrimary: true } : undefined,
    PrimaryAddress: (city || state) ? {
      Type: 'Home',
      City: city || '',
      State: state || '',
      Country: 'US',
      IsPrimary: true,
    } : undefined,
  };

  return bloomerangFetch(apiKey, '/constituent', 'POST', payload);
}

/**
 * Update an existing constituent
 */
export async function updateConstituent(apiKey, constituentId, fields) {
  return bloomerangFetch(apiKey, `/constituent/${constituentId}`, 'PUT', fields);
}

/**
 * Create a transaction (e.g., gala ticket purchase)
 */
export async function createTransaction(apiKey, { constituentId, amount, date, note, fund }) {
  const payload = {
    AccountId: constituentId,
    Date: date || new Date().toISOString().split('T')[0],
    Amount: amount,
    Method: 'None',
    TransactionType: 'SpecialEventTicketPurchase',
    Fund: { Name: fund || '2026 Gala' },
    Note: note || '',
  };

  return bloomerangFetch(apiKey, '/transaction', 'POST', payload);
}

/**
 * Get transactions for a constituent
 */
export async function getConstituentTransactions(apiKey, constituentId) {
  return bloomerangFetch(apiKey, `/constituent/${constituentId}/transactions?take=50`);
}
