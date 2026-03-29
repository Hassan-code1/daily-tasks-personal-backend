const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const Task = require('../models/Task');
const auth = require('../middleware/auth');

const validate = (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return false;
    }
    return true;
};

// Helper: check if date is before today (midnight)
const isPastDate = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return target < today;
};

// Apply auth middleware to ALL task routes
router.use(auth);

// ─── GET /api/tasks/summary?month=3&year=2026 ─────────────────────────────────
router.get('/summary', [
    query('month').isInt({ min: 1, max: 12 }),
    query('year').isInt({ min: 2000, max: 2100 }),
], async (req, res) => {
    if (!validate(req, res)) return;

    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);
    // Use UTC for consistent matching with MongoDB storage
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    try {
        const summary = await Task.aggregate([
            { $match: { owner: req.userId, date: { $gte: start, $lt: end } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: ['$completed', 1, 0] } },
                },
            },
            { $project: { _id: 0, date: '$_id', total: 1, completed: 1 } },
            { $sort: { date: 1 } },
        ]);
        res.json(summary);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── GET /api/tasks?date=YYYY-MM-DD ──────────────────────────────────────────
router.get('/', [
    query('date').isISO8601().withMessage('date query param required (YYYY-MM-DD)'),
], async (req, res) => {
    if (!validate(req, res)) return;

    const dayStart = new Date(Date.UTC(...req.query.date.split('-').map((v, i) => i === 1 ? v - 1 : v)));
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    try {
        const tasks = await Task.find({
            owner: req.userId,
            date: { $gte: dayStart, $lt: dayEnd },
        }).lean().sort({ createdAt: 1 });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── POST /api/tasks ──────────────────────────────────────────────────────────
router.post('/', [
    body('title').notEmpty().trim().isLength({ max: 200 }).withMessage('Title required'),
    body('date').isISO8601().withMessage('Valid date required'),
    body('description').optional().trim().isLength({ max: 1000 }),
], async (req, res) => {
    if (!validate(req, res)) return;

    if (isPastDate(req.body.date)) {
        return res.status(403).json({ error: 'Cannot add tasks to past dates' });
    }

    try {
        const task = await Task.create({
            title: req.body.title,
            description: req.body.description || '',
            date: new Date(req.body.date),
            completed: false,
            owner: req.userId,
        });
        res.status(201).json(task);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── PUT /api/tasks/:id ───────────────────────────────────────────────────────
router.put('/:id', [
    body('title').optional().trim().notEmpty().isLength({ max: 200 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('completed').optional().isBoolean(),
], async (req, res) => {
    if (!validate(req, res)) return;

    try {
        // Check if the existing task is in the past before updating
        const existing = await Task.findOne({ _id: req.params.id, owner: req.userId }).lean();
        if (!existing) return res.status(404).json({ error: 'Task not found' });
        if (isPastDate(existing.date)) {
            return res.status(403).json({ error: 'Cannot update tasks on past dates' });
        }

        // Whitelist — prevent overriding owner/date via $set
        const allowed = {};
        if (req.body.title !== undefined) allowed.title = req.body.title;
        if (req.body.description !== undefined) allowed.description = req.body.description;
        if (req.body.completed !== undefined) allowed.completed = req.body.completed;

        const task = await Task.findOneAndUpdate(
            { _id: req.params.id, owner: req.userId }, // scoped to owner
            { $set: allowed },
            { new: true, runValidators: true }
        ).lean();

        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── DELETE /api/tasks/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const existing = await Task.findOne({ _id: req.params.id, owner: req.userId }).lean();
        if (!existing) return res.status(404).json({ error: 'Task not found' });
        if (isPastDate(existing.date)) {
            return res.status(403).json({ error: 'Cannot delete tasks from past dates' });
        }

        await Task.deleteOne({ _id: req.params.id, owner: req.userId });
        res.json({ message: 'Task deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
