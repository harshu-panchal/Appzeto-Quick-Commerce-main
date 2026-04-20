import express from 'express';
import { getFAQs, createFAQ, updateFAQ, deleteFAQ } from '../controller/faqController.js';

const router = express.Router();

// General Routes (accessible by all)
router.get('/', getFAQs);

// Admin Routes (could add admin middleware here)
router.post('/', createFAQ);
router.get('/:id', getFAQs); // Generic get by id if needed
router.put('/:id', updateFAQ);
router.delete('/:id', deleteFAQ);

export default router;
