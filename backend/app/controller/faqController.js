import FAQ from '../models/faq.js';
import { handleResponse } from '../utils/helper.js';
import getPagination from '../utils/pagination.js';

export const getFAQs = async (req, res) => {
    try {
        const { category, status, search } = req.query;
        const query = {};
        if (category && category !== 'All') query.category = category;
        if (status) query.status = status;

        if (search && search.trim()) {
            query.$or = [
                { question: { $regex: search.trim(), $options: 'i' } },
                { answer: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        const { page, limit, skip } = getPagination(req, { defaultLimit: 25, maxLimit: 200 });

        const [faqs, total] = await Promise.all([
            FAQ.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            FAQ.countDocuments(query)
        ]);

        return handleResponse(res, 200, "FAQs fetched successfully", {
            items: faqs,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const createFAQ = async (req, res) => {
    try {
        const { question, answer, category, status } = req.body;
        const newFAQ = new FAQ({ question, answer, category, status });
        await newFAQ.save();
        return handleResponse(res, 201, "FAQ created successfully", newFAQ);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const updateFAQ = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedFAQ = await FAQ.findByIdAndUpdate(id, req.body, { new: true });
        if (!updatedFAQ) return handleResponse(res, 404, "FAQ not found");
        return handleResponse(res, 200, "FAQ updated successfully", updatedFAQ);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const deleteFAQ = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedFAQ = await FAQ.findByIdAndDelete(id);
        if (!deletedFAQ) return handleResponse(res, 404, "FAQ not found");
        return handleResponse(res, 200, "FAQ deleted successfully");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
