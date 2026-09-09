/*
 * Firebase-backed replacement for src/lib/localBackend.js - candidate and
 * announcement rows live in Firestore, and uploaded photos live in Firebase
 * Storage, instead of the browser's own localStorage.
 *
 * The query API deliberately mirrors localBackend.js's shape (and, before
 * it, a PostgREST-style client) - `from(...).select(...).eq(...)`, chained
 * `.order()`, an `.or('col.op.value,...')` filter, `.insert/.update/.delete`,
 * plus `storage.from(bucket).upload()/.getPublicUrl()` - so every admin page
 * written against that shape needs only its import changed, not its logic.
 *
 * Firestore has no native equivalent of the app's `.or('a.neq.x,b.gte.y')`
 * filter across two different fields, so reads fetch the full collection
 * and every filter/sort/count runs client-side in JS - the same approach
 * localBackend.js already took, just against a live Firestore snapshot
 * instead of a JSON blob in localStorage.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { db } from './firebase/firestore';
import { storage } from './firebase/storage';

const COLLECTIONS = new Set(['candidates', 'announcements']);

function collectionRef(table) {
  if (!COLLECTIONS.has(table)) throw new Error(`Unknown Firestore collection: ${table}`);
  return collection(db, table);
}

async function fetchRows(table) {
  const snapshot = await getDocs(collectionRef(table));
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

/**
 * Calls `listener` with every row of `table` now and after each change -
 * including changes made from another tab, browser, or device, since this
 * rides Firestore's own realtime updates rather than the localStorage
 * `storage` event. Returns an unsubscribe function.
 */
export function subscribeTable(table, listener) {
  return onSnapshot(collectionRef(table), (snapshot) => {
    listener(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
  });
}

/** Calls `listener` with every candidate row now and after each change. */
export function subscribeCandidates(listener) {
  return subscribeTable('candidates', listener);
}

/** Calls `listener` with every announcement now and after each change. */
export function subscribeAnnouncements(listener) {
  return subscribeTable('announcements', listener);
}

/* --------------------------------------------------------------- comparisons */

const COMPARATORS = {
  eq: (a, b) => String(a) === String(b),
  neq: (a, b) => String(a) !== String(b),
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
};

/*
 * Parses one `column.operator.value` clause of an `.or(...)` filter, the form
 * the admin dashboard uses to keep today's batch alongside anything unfinished.
 */
function matchesClause(row, clause) {
  const [column, operator, ...rest] = clause.split('.');
  const compare = COMPARATORS[operator];
  if (!compare) return false;

  return compare(row[column], rest.join('.'));
}

/* ------------------------------------------------------------- query builder */

class Query {
  constructor(table, operation, values) {
    this.table = table;
    this.operation = operation;
    this.values = values;
    this.filters = [];
    this.orFilter = null;
    this.orderBy = [];
    this.countOnly = false;
    this.wantSingle = false;
  }

  select(columns, options = {}) {
    if (options.head || options.count) this.countOnly = true;
    return this;
  }

  /* Unwraps an array result down to its one expected row, the way the real
     Storage/Postgres client's `.single()` does - an error (not a thrown
     exception) if the query didn't match exactly one row. */
  single() {
    this.wantSingle = true;
    return this;
  }

  or(expression) {
    this.orFilter = expression.split(',');
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => COMPARATORS.eq(row[column], value));
    return this;
  }

  in(column, values) {
    this.filters.push((row) => values.some((v) => COMPARATORS.eq(row[column], v)));
    return this;
  }

  order(column, options = {}) {
    const ascending = options.ascending !== false;
    this.orderBy.push({ column, ascending });
    return this;
  }

  matching(rows) {
    return rows.filter(
      (row) =>
        this.filters.every((test) => test(row)) &&
        (!this.orFilter || this.orFilter.some((clause) => matchesClause(row, clause)))
    );
  }

  sorted(rows) {
    if (this.orderBy.length === 0) return rows;

    return [...rows].sort((a, b) => {
      for (const entry of this.orderBy) {
        const left = a[entry.column] ?? '';
        const right = b[entry.column] ?? '';
        if (left === right) continue;
        return (left > right ? 1 : -1) * (entry.ascending ? 1 : -1);
      }
      return 0;
    });
  }

  async run() {
    const result = await this.runQuery();
    return this.wantSingle ? toSingleResult(result) : result;
  }

  async runQuery() {
    if (this.operation === 'select') {
      const rows = await fetchRows(this.table);
      const matched = this.sorted(this.matching(rows));

      return this.countOnly
        ? { data: null, error: null, count: matched.length }
        : { data: matched, error: null, count: matched.length };
    }

    if (this.operation === 'insert') {
      try {
        const rows = this.table === 'candidates' ? await fetchRows(this.table) : [];
        const highest = rows.reduce(
          (max, row) => Math.max(max, Number(row.sort_order) || 0),
          0
        );

        const added = await Promise.all(
          this.values.map(async (value, index) => {
            const payload = {
              created_at: new Date().toISOString(),
              // candidates default to visible; other tables don't use this flag
              ...(this.table === 'candidates'
                ? { show_in_visual: true, sort_order: highest + index + 1 }
                : {}),
              ...value,
            };

            const docRef = await addDoc(collectionRef(this.table), payload);
            return { id: docRef.id, ...payload };
          })
        );

        return { data: added, error: null, count: added.length };
      } catch (error) {
        return { data: null, error };
      }
    }

    if (this.operation === 'update') {
      try {
        const rows = await fetchRows(this.table);
        const target = this.matching(rows);

        await Promise.all(
          target.map((row) => updateDoc(doc(db, this.table, row.id), this.values))
        );

        const updated = target.map((row) => ({ ...row, ...this.values }));
        return { data: updated, error: null };
      } catch (error) {
        return { data: null, error };
      }
    }

    if (this.operation === 'delete') {
      try {
        const rows = await fetchRows(this.table);
        const target = this.matching(rows);

        await Promise.all(target.map((row) => deleteDoc(doc(db, this.table, row.id))));
        return { data: null, error: null };
      } catch (error) {
        return { data: null, error };
      }
    }

    return { data: null, error: new Error('Unsupported operation') };
  }

  // makes the builder awaitable, so callers read exactly as they did before
  then(onFulfilled, onRejected) {
    return this.run().then(onFulfilled, onRejected);
  }
}

/* Unwraps a query result's array `data` down to the one row `.single()`
   expects - an error result (not a thrown exception) if that isn't exactly
   one row, matching how the real client reports it. */
function toSingleResult(result) {
  if (result.error) return result;

  const rows = Array.isArray(result.data) ? result.data : [];
  if (rows.length !== 1) {
    return { data: null, error: new Error(`Expected exactly one row, got ${rows.length}.`) };
  }

  return { ...result, data: rows[0] };
}

/* -------------------------------------------------------------- photo upload */

/*
 * `getPublicUrl` mirrors the real Storage SDK's synchronous signature (it
 * doesn't return a promise), so it can only ever read back a URL this same
 * session already resolved - exactly the pattern every caller already uses,
 * fetching it immediately after `await upload(...)` succeeds for that same
 * file name.
 */
const photoUrlCache = new Map();

const firebaseStorageApi = {
  from(bucket) {
    return {
      async upload(fileName, file) {
        try {
          const storageRef = ref(storage, `${bucket}/${fileName}`);
          await uploadBytes(storageRef, file);

          const url = await getDownloadURL(storageRef);
          photoUrlCache.set(fileName, url);

          return { data: { path: fileName }, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },

      getPublicUrl(fileName) {
        return { data: { publicUrl: photoUrlCache.get(fileName) ?? '' } };
      },
    };
  },
};

/* ------------------------------------------------------------------- exports */

export const firebaseClient = {
  from(table) {
    return {
      select: (columns, options) => new Query(table, 'select').select(columns, options),
      insert: (rows) => new Query(table, 'insert', Array.isArray(rows) ? rows : [rows]),
      update: (values) => new Query(table, 'update', values),
      delete: () => new Query(table, 'delete'),
    };
  },

  storage: firebaseStorageApi,
};
