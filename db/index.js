const timingStore = require('../utils/timingStore');

let users = [
  { id: 1, name: '张三', email: 'zhangsan@example.com', created_at: new Date().toISOString() },
  { id: 2, name: '李四', email: 'lisi@example.com', created_at: new Date().toISOString() },
  { id: 3, name: '王五', email: 'wangwu@example.com', created_at: new Date().toISOString() }
];

let posts = [
  { id: 1, user_id: 1, title: 'Node.js 入门指南', content: 'Node.js 是一个基于 Chrome V8 引擎的 JavaScript 运行环境。', created_at: new Date().toISOString() },
  { id: 2, user_id: 1, title: 'Express 框架详解', content: 'Express 是一个灵活的 Node.js Web 应用框架。', created_at: new Date().toISOString() },
  { id: 3, user_id: 2, title: 'RESTful API 设计', content: 'RESTful API 是一种软件架构风格。', created_at: new Date().toISOString() }
];

let nextUserId = 4;
let nextPostId = 4;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeStringify(obj, maxLen = 200) {
  try {
    const str = JSON.stringify(obj);
    return str ? str.substring(0, maxLen) : '';
  } catch (e) {
    return '[Unserializable]';
  }
}

function safeSubstring(str, maxLen = 200) {
  try {
    return str ? str.substring(0, maxLen) : '';
  } catch (e) {
    return '';
  }
}

function createDbRecord(operation, sql, params, durationMs, error) {
  const record = {
    operation,
    sql: safeSubstring(sql, 200),
    params: safeStringify(params, 200),
    duration: Number(durationMs.toFixed(3)),
    timestamp: new Date().toISOString()
  };

  if (error) {
    record.error = error.message || String(error);
    record.errorType = error.constructor ? error.constructor.name : 'Unknown';
  }

  return record;
}

function measureDbTime(operation, sql, params, fn) {
  const startTime = process.hrtime.bigint();
  let recorded = false;

  const recordAndLog = (error) => {
    if (recorded) return;
    recorded = true;

    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;
    const record = createDbRecord(operation, sql, params, durationMs, error);

    timingStore.addDbTiming(record);

    if (error) {
      console.log(`[DB] ${operation} FAILED - ${record.duration}ms - ${record.errorType}: ${record.error}`);
    } else {
      console.log(`[DB] ${operation} - ${record.duration}ms`);
    }
  };

  try {
    const result = fn();

    if (result && typeof result.then === 'function') {
      return result
        .then(value => {
          recordAndLog(null);
          return value;
        })
        .catch(error => {
          recordAndLog(error);
          throw error;
        });
    } else {
      recordAndLog(null);
      return result;
    }
  } catch (error) {
    recordAndLog(error);
    throw error;
  }
}

async function run(sql, params = []) {
  return measureDbTime('RUN', sql, params, async () => {
    await delay(Math.random() * 20 + 5);
    
    if (sql.startsWith('INSERT INTO users')) {
      const [name, email] = params;
      const existing = users.find(u => u.email === email);
      if (existing) {
        throw new Error('UNIQUE constraint failed: users.email');
      }
      const user = {
        id: nextUserId++,
        name,
        email,
        created_at: new Date().toISOString()
      };
      users.push(user);
      return { lastInsertRowid: user.id, changes: 1 };
    }
    
    if (sql.startsWith('UPDATE users')) {
      const [name, email, id] = params;
      const existing = users.find(u => u.email === email && u.id !== parseInt(id));
      if (existing) {
        throw new Error('UNIQUE constraint failed: users.email');
      }
      const index = users.findIndex(u => u.id === parseInt(id));
      if (index !== -1) {
        users[index].name = name;
        users[index].email = email;
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    
    if (sql.startsWith('DELETE FROM users')) {
      const [id] = params;
      const index = users.findIndex(u => u.id === parseInt(id));
      if (index !== -1) {
        users.splice(index, 1);
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    
    if (sql.startsWith('INSERT INTO posts')) {
      const [title, content, user_id] = params;
      const post = {
        id: nextPostId++,
        user_id: user_id || null,
        title,
        content,
        created_at: new Date().toISOString()
      };
      posts.push(post);
      return { lastInsertRowid: post.id, changes: 1 };
    }
    
    if (sql.startsWith('UPDATE posts')) {
      const [title, content, id] = params;
      const index = posts.findIndex(p => p.id === parseInt(id));
      if (index !== -1) {
        posts[index].title = title;
        posts[index].content = content;
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    
    if (sql.startsWith('DELETE FROM posts')) {
      const [id] = params;
      const index = posts.findIndex(p => p.id === parseInt(id));
      if (index !== -1) {
        posts.splice(index, 1);
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    
    return { changes: 0 };
  });
}

async function get(sql, params = []) {
  return measureDbTime('GET', sql, params, async () => {
    await delay(Math.random() * 15 + 3);
    const sqlClean = sql.replace(/\s+/g, ' ').trim();
    
    if (sqlClean.includes('FROM users WHERE id =')) {
      const [id] = params;
      return users.find(u => u.id === parseInt(id)) || null;
    }
    
    if (sqlClean.includes('FROM users WHERE email =')) {
      const [email] = params;
      return users.find(u => u.email === email) || null;
    }
    
    if (sqlClean.includes('COUNT(*)')) {
      return { total: posts.length };
    }
    
    if (sqlClean.includes('FROM posts WHERE id =')) {
      const [id] = params;
      return posts.find(p => p.id === parseInt(id)) || null;
    }
    
    if (sqlClean.includes('FROM posts p LEFT JOIN users u ON p.user_id = u.id WHERE p.id =')) {
      const [id] = params;
      const post = posts.find(p => p.id === parseInt(id));
      if (!post) return null;
      const user = users.find(u => u.id === post.user_id);
      return { ...post, author_name: user ? user.name : null };
    }
    
    if (sqlClean.includes('FROM posts p WHERE p.user_id =')) {
      const [id] = params;
      const userPosts = posts.filter(p => p.user_id === parseInt(id));
      return userPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    
    return null;
  });
}

async function all(sql, params = []) {
  return measureDbTime('ALL', sql, params, async () => {
    await delay(Math.random() * 25 + 10);
    const sqlClean = sql.replace(/\s+/g, ' ').trim();
    
    if (sqlClean.includes('FROM users LIMIT')) {
      return [...users];
    }
    
    if (sqlClean.includes('FROM posts p LEFT JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC')) {
      const [limit, offset] = params;
      const result = posts
        .map(post => {
          const user = users.find(u => u.id === post.user_id);
          return { ...post, author_name: user ? user.name : null };
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(offset, offset + limit);
      return result;
    }
    
    if (sqlClean.includes('FROM posts p WHERE p.user_id =')) {
      const [id] = params;
      return posts
        .filter(p => p.user_id === parseInt(id))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 50);
    }
    
    return [];
  });
}

async function exec(sql) {
  return measureDbTime('EXEC', sql, [], async () => {
    await delay(Math.random() * 10 + 5);
    return null;
  });
}

async function initDb() {
  await exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    );
  `);
  console.log('Database initialized with sample data');
  console.log(`  Users: ${users.length} records`);
  console.log(`  Posts: ${posts.length} records`);
}

module.exports = {
  initDb,
  run,
  get,
  all,
  exec
};
