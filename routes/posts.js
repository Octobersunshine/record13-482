const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const posts = await db.all(`
      SELECT p.id, p.title, p.content, p.user_id, p.created_at, u.name as author_name
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const count = await db.get('SELECT COUNT(*) as total FROM posts');

    res.json({
      success: true,
      data: posts,
      pagination: {
        total: count.total,
        limit,
        offset
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const post = await db.get(`
      SELECT p.id, p.title, p.content, p.user_id, p.created_at, u.name as author_name
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `, [req.params.id]);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  const { title, content, user_id } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }

  try {
    if (user_id) {
      const user = await db.get('SELECT id FROM users WHERE id = ?', [user_id]);
      if (!user) {
        return res.status(400).json({ success: false, error: 'User not found' });
      }
    }

    const result = await db.run(
      'INSERT INTO posts (title, content, user_id) VALUES (?, ?, ?)',
      [title, content || '', user_id || null]
    );

    const post = await db.get('SELECT id, title, content, user_id, created_at FROM posts WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  const { title, content } = req.body;
  try {
    const existing = await db.get('SELECT id FROM posts WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    await db.run('UPDATE posts SET title = ?, content = ? WHERE id = ?', [title, content, req.params.id]);
    const post = await db.get('SELECT id, title, content, user_id, created_at FROM posts WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await db.run('DELETE FROM posts WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    res.json({ success: true, message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
