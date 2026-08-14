/* Dublê do supabase-js usado nos testes de navegador.
 *
 * Imita a fatia da API que o app usa: auth.getSession / signInWithPassword /
 * signUp / signOut e from(...).select(...).eq(...).maybeSingle() / upsert().
 *
 * O "servidor" mora no sessionStorage: assim ele sobrevive a um reload da
 * página, que é justamente o que os testes de recarga precisam exercitar.
 *
 * `window.__stub` deixa o teste inspecionar e manipular esse servidor —
 * inclusive simular escrita vinda de outro aparelho e queda de rede.
 */
(function () {
  const SLOT = '__supabase_stub__';

  function load() {
    try {
      const raw = sessionStorage.getItem(SLOT);
      if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return {
      docs: {},
      session: null,
      failAll: false,
      failNext: 0,
      reads: 0,
      writes: 0
    };
  }

  const db = load();

  function persist() {
    try { sessionStorage.setItem(SLOT, JSON.stringify(db)); } catch (_) { /* ignore */ }
  }

  function maybeFail() {
    if (db.failAll || db.failNext > 0) {
      if (db.failNext > 0) db.failNext--;
      persist();
      return { message: 'Failed to fetch', code: 'NETWORK' };
    }
    return null;
  }

  function makeQuery() {
    const q = {
      _key: null,
      _single: false,
      select() { return q; },
      eq(col, val) {
        if (col === 'key') q._key = val;
        return q;
      },
      maybeSingle() {
        q._single = true;
        return q.then(undefined, undefined);
      },
      then(resolve, reject) {
        db.reads++;
        const error = maybeFail();
        persist();
        if (error) return Promise.resolve({ data: null, error }).then(resolve, reject);
        let rows = Object.keys(db.docs).map((key) => ({
          key,
          value: db.docs[key].value,
          updated_at: db.docs[key].updated_at
        }));
        if (q._key) rows = rows.filter((r) => r.key === q._key);
        const data = q._single ? (rows[0] || null) : rows;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
      async upsert(payload) {
        db.writes++;
        const error = maybeFail();
        persist();
        if (error) return { data: null, error };
        db.docs[payload.key] = {
          value: JSON.parse(JSON.stringify(payload.value)),
          updated_at: new Date().toISOString()
        };
        persist();
        return { data: null, error: null };
      }
    };
    return q;
  }

  function createClient() {
    return {
      auth: {
        async getSession() {
          return { data: { session: db.session }, error: null };
        },
        async signInWithPassword({ email }) {
          if (!email || !email.includes('@')) {
            return { data: null, error: { message: 'Invalid login credentials' } };
          }
          db.session = { user: { id: 'user-test-1', email } };
          persist();
          return { data: { session: db.session }, error: null };
        },
        async signUp({ email }) {
          db.session = { user: { id: 'user-test-1', email } };
          persist();
          return { data: { session: db.session }, error: null };
        },
        async signOut() {
          db.session = null;
          persist();
          return { error: null };
        },
        async resetPasswordForEmail() {
          return { error: null };
        },
        onAuthStateChange() {
          return { data: { subscription: { unsubscribe() {} } } };
        }
      },
      from: () => makeQuery()
    };
  }

  window.supabase = { createClient };

  window.__stub = {
    getDoc: (key) => (db.docs[key] ? db.docs[key].value : null),
    setDoc: (key, value) => {
      db.docs[key] = { value, updated_at: new Date().toISOString() };
      persist();
    },
    clear: () => { db.docs = {}; persist(); },
    failNext: (n) => { db.failNext = n; persist(); },
    setFailAll: (v) => { db.failAll = v; persist(); },
    counters: () => ({ reads: db.reads, writes: db.writes })
  };
})();
