import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { queryMonday } from './_monday.js';
import { findConstituentByEmail, createConstituent, createTransaction, getConstituentTransactions } from './_bloomerang.js';
import { isPaidStatus, parseSeatCount } from './_gala_data.js';

const TICKETS_QUERY = `query ($boardId: [ID!]!) {
  boards(ids: $boardId) {
    items_page(limit: 500) {
      items {
        id
        name
        column_values {
          id
          text
          value
        }
      }
    }
  }
}`;

function parseTicketItem(item) {
  const cols = {};
  for (const cv of item.column_values) {
    cols[cv.id] = cv.text || '';
  }
  return {
    mondayItemId: item.id,
    name: item.name,
    firstName: cols.text_mm0www0b || '',
    lastName: cols.text_mm0w97hm || '',
    email: cols.text_mm0wq6xc || '',
    quantity: parseSeatCount(cols.numeric_mm0wwnax) || 0,
    paymentStatus: cols.color_mm0wzwy2 || '',
    city: cols.text_mm0whmng || '',
    state: cols.text_mm0wfw6a || '',
  };
}

/**
 * POST /api/gala/bloomerang-sync
 * Pull ticket buyers from Monday.com and sync to Bloomerang as constituents + transactions
 *
 * GET /api/gala/bloomerang-sync
 * Return recent sync log entries
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  if (!env.BLOOMERANG_API_KEY) return jsonError('Bloomerang API key not configured', 503);
  if (!env.MONDAY_API_KEY || !env.MONDAY_TICKETS_BOARD) return jsonError('Monday.com not configured', 503);

  const results = { created: 0, updated: 0, skipped: 0, errors: [], transactions: 0 };

  try {
    // 1. Fetch all ticket buyers from Monday.com
    const data = await queryMonday(env.MONDAY_API_KEY, TICKETS_QUERY, {
      boardId: [env.MONDAY_TICKETS_BOARD],
    });
    const items = data.boards?.[0]?.items_page?.items || [];
    const buyers = items.map(parseTicketItem);

    // 2. For each buyer, sync to Bloomerang
    for (const buyer of buyers) {
      try {
        if (!buyer.email && !buyer.lastName && !buyer.name) {
          results.skipped++;
          continue;
        }

        // Search for existing constituent
        let constituent = buyer.email
          ? await findConstituentByEmail(env.BLOOMERANG_API_KEY, buyer.email)
          : null;

        if (constituent) {
          // Existing constituent found
          results.updated++;
        } else {
          // Create new constituent
          const nameParts = buyer.name.split(' ');
          constituent = await createConstituent(env.BLOOMERANG_API_KEY, {
            firstName: buyer.firstName || nameParts[0] || '',
            lastName: buyer.lastName || nameParts.slice(1).join(' ') || buyer.name,
            email: buyer.email,
            city: buyer.city,
            state: buyer.state,
          });
          results.created++;
        }

        // 3. Check if gala transaction already exists
        if (constituent?.Id && buyer.quantity > 0 && isPaidStatus(buyer.paymentStatus)) {
          const txData = await getConstituentTransactions(env.BLOOMERANG_API_KEY, constituent.Id);
          const existingGala = (txData.Results || []).find(t =>
            t.Fund?.Name === '2026 Gala' || (t.Note || '').includes('Gala')
          );

          if (!existingGala) {
            await createTransaction(env.BLOOMERANG_API_KEY, {
              constituentId: constituent.Id,
              amount: buyer.quantity * 150, // $150/ticket
              date: new Date().toISOString().split('T')[0],
              note: `Gala 2026 - ${buyer.quantity} ticket(s) - synced from Monday.com`,
              fund: '2026 Gala',
            });
            results.transactions++;
          }
        }

        // 4. Update D1 seat assignments with Bloomerang ID if we have it
        if (env.GALA_DB && constituent?.Id && buyer.mondayItemId) {
          await env.GALA_DB.prepare(
            'UPDATE seat_assignments SET bloomerang_constituent_id = ? WHERE monday_item_id = ?'
          ).bind(String(constituent.Id), buyer.mondayItemId).run();
        }

        // 5. Log to sync_log
        if (env.GALA_DB) {
          await env.GALA_DB.prepare(
            `INSERT INTO sync_log (direction, entity_type, entity_id, status, details)
             VALUES ('monday_to_bloomerang', 'constituent', ?, 'success', ?)`
          ).bind(
            String(constituent?.Id || buyer.mondayItemId),
            `${buyer.name} (${buyer.email || 'no email'})`
          ).run();
        }

      } catch (err) {
        results.errors.push(`${buyer.name}: ${err.message}`);
        if (env.GALA_DB) {
          await env.GALA_DB.prepare(
            `INSERT INTO sync_log (direction, entity_type, entity_id, status, details)
             VALUES ('monday_to_bloomerang', 'constituent', ?, 'error', ?)`
          ).bind(buyer.mondayItemId || 'unknown', err.message).run().catch(() => {});
        }
      }
    }

    return jsonOk({
      ok: true,
      summary: results,
      message: `Synced ${buyers.length} buyers: ${results.created} created, ${results.updated} updated, ${results.transactions} transactions, ${results.skipped} skipped, ${results.errors.length} errors`,
    }, 0);

  } catch (err) {
    return jsonError(`Sync failed: ${err.message}`);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  if (!env.GALA_DB) return jsonOk({ logs: [] }, 0);

  const results = await env.GALA_DB.prepare(
    'SELECT * FROM sync_log WHERE direction = ? ORDER BY created_at DESC LIMIT 50'
  ).bind('monday_to_bloomerang').all();

  return jsonOk({ logs: results.results || [] }, 0);
}
