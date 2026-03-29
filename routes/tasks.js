const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
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
        // 1. Regular task summary (standard aggregation)
        const regularSummary = await Task.aggregate([
            {
                $match: {
                    owner: new mongoose.Types.ObjectId(req.userId),
                    date: { $gte: start, $lt: end },
                    isDaily: false
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: ['$completed', 1, 0] } },
                },
            },
        ]);

        // 2. Daily tasks applicable to this month
        const dailyTasks = await Task.find({
            owner: req.userId,
            isDaily: true,
            date: { $lt: end }
        }).lean();

        // 3. Daily task completions for this month
        const completions = await TaskCompletion.find({
            owner: req.userId,
            date: { $gte: start, $lt: end }
        }).lean();

        // 4. Merge results manually for each day of the month
        const summaryMap = {};
        regularSummary.forEach(s => {
            summaryMap[s._id] = { total: s.total, completed: s.completed };
        });

        // Iterate days
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const targetDate = new Date(Date.UTC(year, month - 1, d));

            // Add applicable daily tasks
            const activeDaily = dailyTasks.filter(t =>
                t.date <= targetDate &&
                !t.excludedDates.some(ex => ex.getTime() === targetDate.getTime())
            );

            if (activeDaily.length > 0) {
                if (!summaryMap[dateStr]) summaryMap[dateStr] = { total: 0, completed: 0 };
                summaryMap[dateStr].total += activeDaily.length;

                // Count completions
                activeDaily.forEach(task => {
                    const done = completions.find(c =>
                        c.taskId.toString() === task._id.toString() &&
                        c.date.getTime() === targetDate.getTime() &&
                        c.completed
                    );
                    if (done) summaryMap[dateStr].completed += 1;
                });
            }
        }

        const finalSummary = Object.entries(summaryMap).map(([date, val]) => ({
            date, ...val
        })).sort((a, b) => a.date.localeCompare(b.date));

        res.json(finalSummary);
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

    const [y, m, d] = req.query.date.split('-').map(Number);
    const dayStart = new Date(Date.UTC(y, m - 1, d));
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    try {
        const [regularTasks, dailyTasks, completions] = await Promise.all([
            Task.find({
                owner: req.userId,
                date: { $gte: dayStart, $lt: dayEnd },
                isDaily: false,
            }).lean().sort({ createdAt: 1 }),
            Task.find({
                owner: req.userId,
                isDaily: true,
                date: { $lte: dayStart },
                excludedDates: { $ne: dayStart },
            }).lean().sort({ createdAt: 1 }),
            TaskCompletion.find({
                owner: req.userId,
                date: dayStart,
            }).lean(),
        ]);

        const mergedDaily = dailyTasks.map(t => {
            const status = completions.find(c => c.taskId.toString() === t._id.toString());
            return { ...t, completed: status ? status.completed : false };
        });

        res.json([...regularTasks, ...mergedDaily]);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── POST /api/tasks ──────────────────────────────────────────────────────────
router.post('/', [
    body('title').notEmpty().trim().isLength({ max: 200 }).withMessage('Title required'),
    body('date').isISO8601().withMessage('Valid date required'),
    body('isDaily').optional().isBoolean(),
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
            isDaily: !!req.body.isDaily,
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
        const existing = await Task.findOne({ _id: req.params.id, owner: req.userId });
        if (!existing) return res.status(404).json({ error: 'Task not found' });

        // For daily tasks, updates to 'completed' are day-specific completions
        if (existing.isDaily && req.body.completed !== undefined) {
            const [y, m, d] = req.body.date.split('-').map(Number);
            const targetDate = new Date(Date.UTC(y, m - 1, d));

            const completion = await TaskCompletion.findOneAndUpdate(
                { taskId: existing._id, date: targetDate, owner: req.userId },
                { $set: { completed: req.body.completed } },
                { upsert: true, new: true }
            );
            return res.json({ ...existing.toObject(), completed: completion.completed });
        }

        if (isPastDate(existing.date)) {
            return res.status(403).json({ error: 'Cannot update tasks on past dates' });
        }

        const allowed = {};
        if (req.body.title !== undefined) allowed.title = req.body.title;
        if (req.body.description !== undefined) allowed.description = req.body.description;
        if (req.body.completed !== undefined) allowed.completed = req.body.completed;

        const task = await Task.findOneAndUpdate(
            { _id: req.params.id, owner: req.userId },
            { $set: allowed },
            { new: true, runValidators: true }
        ).lean();

        res.json(task);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── DELETE /api/tasks/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const existing = await Task.findOne({ _id: req.params.id, owner: req.userId });
        if (!existing) return res.status(404).json({ error: 'Task not found' });

        const mode = req.query.mode || 'all'; // 'single' (today only) or 'all' (entire series)
        const targetDateStr = req.query.date; // YYYY-MM-DD for 'single' mode

        if (existing.isDaily && mode === 'single' && targetDateStr) {
            const [y, m, d] = targetDateStr.split('-').map(Number);
            const targetDate = new Date(Date.UTC(y, m - 1, d));

            await Task.updateOne(
                { _id: existing._id },
                { $addToSet: { excludedDates: targetDate } }
            );
            return res.json({ message: 'Task removed for this day' });
        }

        if (!existing.isDaily && isPastDate(existing.date)) {
            return res.status(403).json({ error: 'Cannot delete tasks from past dates' });
        }

        await Promise.all([
            Task.deleteOne({ _id: req.params.id, owner: req.userId }),
            TaskCompletion.deleteMany({ taskId: req.params.id })
        ]);
        res.json({ message: 'Task deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
