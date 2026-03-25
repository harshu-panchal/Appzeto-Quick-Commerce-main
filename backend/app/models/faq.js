import mongoose from 'mongoose';

const faqSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true,
        trim: true
    },
    answer: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        enum: ['Customer', 'Seller', 'Delivery', 'Orders'], // Orders can be a sub-category or general
        default: 'Customer'
    },
    status: {
        type: String,
        enum: ['published', 'draft'],
        default: 'published'
    },
    views: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

faqSchema.index({ category: 1, status: 1 });

const FAQ = mongoose.model('FAQ', faqSchema);

export default FAQ;
