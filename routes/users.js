const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const users = await db.all('SELECT id, name, email, created_at FROM users LIMIT 100');
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await db.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and email are required' });
  }

  try {
    const result = await db.run('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
    const user = await db.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  const { name, email } = req.body;
  try {
    const existing = await db.get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await db.run('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, req.params.id]);
    const user = await db.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: user });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/posts', async (req, res) => {
  try {
    const posts = await db.all(`
      SELECT p.id, p.title, p.content, p.created_at
      FROM posts p
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT 50
    `, [req.params.id]);
    res.json({ success: true, data: posts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
