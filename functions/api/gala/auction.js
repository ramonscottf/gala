import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { queryMonday } from './_monday.js';

const QUERY = `query ($boardId: [ID!]!) {
  boards(ids: $boardId) {
    items_page(limit: 500) {
      items {
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

function normalizeItem(item) {
  const cols = {};
  for (const cv of item.column_values) {
    cols[cv.id] = cv.text || '';
  }
  return {
    name: item.name,
    status: cols.status || '',
    date: cols.date4 || '',
    assignee: cols.person || '',
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) {
    return jsonError('Unauthorized', 401);
  }

  if (!env.MONDAY_API_KEY || !env.MONDAY_AUCTION_BOARD) {
    return jsonError('Monday.com not configured', 503);
  }

  try {
    const data = await queryMonday(env.MONDAY_API_KEY, QUERY, {
      boardId: [env.MONDAY_AUCTION_BOARD],
    });

    const items = data.boards?.[0]?.items_page?.items || [];
    const auction = items.map(normalizeItem);

    return jsonOk({ auction, count: auction.length });
  } catch (err) {
    return jsonError(err.message);
  }
}
