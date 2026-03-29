const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true, default: '' },
        completed: { type: Boolean, default: false },
        date: { type: Date, required: true }, // For isDaily=true, this is the startDate
        isDaily: { type: Boolean, default: false },
        excludedDates: [{ type: Date }], // Dates where this daily task was removed
        owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

// Compound index: fast per-user date range queries
taskSchema.index({ owner: 1, date: 1 });

module.exports = mongoose.model('Task', taskSchema);
