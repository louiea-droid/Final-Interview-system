/*
 * Local stand-in for the backend, for development and testing.
 *
 * Everything lives in this browser: candidate rows in localStorage, uploaded
 * photos as downscaled data URLs. Nothing leaves the machine and no project
 * setup is needed - open the app and it works.
 *
 * The query API deliberately mirrors the shape the admin pages were written
 * against (`from(...).select(...).eq(...)`), so those pages need no changes
 * while we are testing locally. Replacing this file is what swapping in a
 * real backend later will amount to.
 */

const ROWS_KEY = 'local-backend:candidates';
const PHOTOS_KEY = 'local-backend:photos';
const CHANGE_EVENT = 'local-backend:changed';

/* Photos are capped on the long edge so several fit in the localStorage quota. */
const MAX_PHOTO_EDGE = 900;

/* ---------------------------------------------------------------- seed data */

function seedRows() {
  const now = Date.now();
  const iso = (offsetDays) => new Date(now + offsetDays * 86400000).toISOString();

  const people = [
    { name: 'Miku T.', position: 'Warehouse Associate', img: 26, status: 'Scheduled' },
    { name: 'Jose C.', position: 'Forklift Operator', img: 12, status: 'In Progress' },
    { name: 'Angelica B.', position: 'Inventory Clerk', img: 47, status: 'Waiting' },
    { name: 'Rafael D.', position: 'Shift Lead', img: 33, status: 'Scheduled' },
  ];

  return people.map((person, index) => ({
    id: 'seed-' + (index + 1),
    name: person.name,
    position: person.position,
    photo_url: 'https://i.pravatar.cc/400?img=' + person.img,
    status: person.status,
    interview_type: 'Final Interview',
    interview_date: iso(0),
    sort_order: index + 1,
    show_in_visual: true,
    created_at: iso(0),
  }));
}

/* ------------------------------------------------------------------- storage */

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('Local backend could not save to localStorage:', error);
    return false;
  }
}

function loadRows() {
  const stored = readJson(ROWS_KEY, null);
  if (Array.isArray(stored)) return stored;

  // first run in this browser
  const seeded = seedRows();
  writeJson(ROWS_KEY, seeded);
  return seeded;
}

function saveRows(rows) {
  writeJson(ROWS_KEY, rows);
  // same-tab listeners; the storage event only fires in *other* tabs
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Calls `listener` with every candidate row now and after each change,
 * including changes made in another tab. Returns an unsubscribe function.
 */
export function subscribeCandidates(listener) {
  const emit = () => listener(loadRows());

  const onStorage = (event) => {
    if (!event.key || event.key === ROWS_KEY) emit();
  };

  emit();
  window.addEventListener(CHANGE_EVENT, emit);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, emit);
    window.removeEventListener('storage', onStorage);
  };
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
  constructor(operation, values) {
    this.operation = operation;
    this.values = values;
    this.filters = [];
    this.orFilter = null;
    this.orderBy = [];
    this.countOnly = false;
  }

  select(columns, options = {}) {
    if (options.head || options.count) this.countOnly = true;
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

  run() {
    const rows = loadRows();

    if (this.operation === 'select') {
      const matched = this.sorted(this.matching(rows));

      return this.countOnly
        ? { data: null, error: null, count: matched.length }
        : { data: matched, error: null, count: matched.length };
    }

    if (this.operation === 'insert') {
      const highest = rows.reduce(
        (max, row) => Math.max(max, Number(row.sort_order) || 0),
        0
      );

      const added = this.values.map((value, index) => ({
        id:
          'local-' +
          Date.now().toString(36) +
          '-' +
          Math.random().toString(36).slice(2, 7),
        sort_order: highest + index + 1,
        show_in_visual: true,
        created_at: new Date().toISOString(),
        ...value,
      }));

      saveRows([...rows, ...added]);
      return { data: added, error: null, count: added.length };
    }

    if (this.operation === 'update') {
      const target = new Set(this.matching(rows).map((row) => row.id));
      const next = rows.map((row) =>
        target.has(row.id) ? { ...row, ...this.values } : row
      );

      saveRows(next);
      return { data: next.filter((row) => target.has(row.id)), error: null };
    }

    if (this.operation === 'delete') {
      const target = new Set(this.matching(rows).map((row) => row.id));
      saveRows(rows.filter((row) => !target.has(row.id)));
      return { data: null, error: null };
    }

    return { data: null, error: new Error('Unsupported operation') };
  }

  // makes the builder awaitable, so callers read exactly as they did before
  then(onFulfilled, onRejected) {
    return Promise.resolve()
      .then(() => this.run())
      .then(onFulfilled, onRejected);
  }
}

/* -------------------------------------------------------------- photo upload */

/* Draws the image into a canvas no larger than MAX_PHOTO_EDGE, as a data URL. */
function downscaleToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error('Could not decode the image file.'));
      image.onload = () => {
        const scale = Math.min(
          1,
          MAX_PHOTO_EDGE / Math.max(image.width, image.height)
        );

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

const photoUrls = new Map(Object.entries(readJson(PHOTOS_KEY, {})));

const localStorageApi = {
  from() {
    return {
      async upload(fileName, file) {
        try {
          const dataUrl = await downscaleToDataUrl(file);
          photoUrls.set(fileName, dataUrl);

          if (!writeJson(PHOTOS_KEY, Object.fromEntries(photoUrls))) {
            return {
              data: null,
              error: new Error(
                'Out of local storage space - remove some candidate photos.'
              ),
            };
          }

          return { data: { path: fileName }, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },

      // synchronous, matching how the admin pages call it
      getPublicUrl(fileName) {
        return { data: { publicUrl: photoUrls.get(fileName) ?? '' } };
      },
    };
  },
};

/* ------------------------------------------------------------------- exports */

export const localClient = {
  from() {
    return {
      select: (columns, options) => new Query('select').select(columns, options),
      insert: (rows) => new Query('insert', Array.isArray(rows) ? rows : [rows]),
      update: (values) => new Query('update', values),
      delete: () => new Query('delete'),
    };
  },

  storage: localStorageApi,
};

/** Wipes local data so the next load starts from the seed candidates again. */
export function resetLocalData() {
  window.localStorage.removeItem(ROWS_KEY);
  window.localStorage.removeItem(PHOTOS_KEY);
  photoUrls.clear();
  saveRows(loadRows());
}
