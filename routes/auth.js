const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');

const validate = (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return false;
    }
    return true;
};

// Strict rate limit on auth routes: 10 attempts per 15 min
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const signToken = (userId) =>
    jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post(
    '/register',
    authLimiter,
    [
        body('name').trim().notEmpty().isLength({ max: 60 }).withMessage('Name required'),
        body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
        body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
    ],
    async (req, res) => {
        if (!validate(req, res)) return;
        try {
            const exists = await User.findOne({ email: req.body.email }).lean();
            if (exists) return res.status(409).json({ error: 'Email already registered' });

            const user = await User.create({
                name: req.body.name,
                email: req.body.email,
                password: req.body.password,
            });

            res.status(201).json({
                token: signToken(user._id),
                user: { id: user._id, name: user.name, email: user.email },
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server error' });
        }
    }
);

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post(
    '/login',
    authLimiter,
    [
        body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
        body('password').notEmpty().withMessage('Password required'),
    ],
    async (req, res) => {
        if (!validate(req, res)) return;
        try {
            const user = await User.findOne({ email: req.body.email });
            if (!user) return res.status(401).json({ error: 'Invalid credentials' });

            const match = await user.comparePassword(req.body.password);
            if (!match) return res.status(401).json({ error: 'Invalid credentials' });

            res.json({
                token: signToken(user._id),
                user: { id: user._id, name: user.name, email: user.email },
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server error' });
        }
    }
);

module.exports = router;
