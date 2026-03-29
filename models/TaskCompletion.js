const mongoose = require('mongoose');

const taskCompletionSchema = new mongoose.Schema(
    {
        taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
        date: { type: Date, required: true }, // The specific date this completion refers to
        completed: { type: Boolean, default: false },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

// Index for fast lookups during aggregation and list fetching
taskCompletionSchema.index({ owner: 1, date: 1, taskId: 1 });

module.exports = mongoose.model('TaskCompletion', taskCompletionSchema);
