const express = require('express');
const { initDb } = require('./db');
const routeTiming = require('./middleware/routeTiming');

const usersRouter = require('./routes/users');
const postsRouter = require('./routes/posts');
const timingRouter = require('./routes/timing');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(routeTiming);

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Node.js API with Timing Tracking',
    endpoints: {
      users: '/api/users',
      posts: '/api/posts',
      timing: {
        summary: '/api/timing/summary',
        routes: '/api/timing/routes',
        database: '/api/timing/database',
        report: '/api/timing/report'
      }
    }
  });
});

app.use('/api/users', usersRouter);
app.use('/api/posts', postsRouter);
app.use('/api/timing', timingRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

async function startServer() {
  try {
    await initDb();
    console.log('Database initialized successfully');

    app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Node.js API with Timing Tracking is running                ║
║  Server: http://localhost:${PORT}                              ║
╠══════════════════════════════════════════════════════════════╣
║  Available endpoints:                                       ║
║    GET    /                    - API info                   ║
║    GET    /api/users           - List users                 ║
║    POST   /api/users           - Create user                ║
║    GET    /api/users/:id       - Get user                   ║
║    PUT    /api/users/:id       - Update user                ║
║    DELETE /api/users/:id       - Delete user                ║
║    GET    /api/users/:id/posts - Get user posts             ║
║    GET    /api/posts           - List posts                 ║
║    POST   /api/posts           - Create post                ║
║    GET    /api/posts/:id       - Get post                   ║
║    PUT    /api/posts/:id       - Update post                ║
║    DELETE /api/posts/:id       - Delete post                ║
╠══════════════════════════════════════════════════════════════╣
║  Timing endpoints:                                          ║
║    GET    /api/timing/summary  - Combined timing summary    ║
║    GET    /api/timing/routes   - Route timing stats         ║
║    GET    /api/timing/database - Database timing stats      ║
║    GET    /api/timing/report   - Text performance report    ║
║    DELETE /api/timing/clear    - Clear all timing records   ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

startServer();
