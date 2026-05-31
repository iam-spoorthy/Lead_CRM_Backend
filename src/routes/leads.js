const express = require('express');
const router = express.Router();
const {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  transitionStatus,
  bulkCreateLeads,
  bulkUpdateLeads,
} = require('../controllers/leadController');

// ── Bulk routes must come BEFORE /:id routes (avoid "bulk" matching as an id)
router.post('/bulk', bulkCreateLeads);
router.put('/bulk', bulkUpdateLeads);

// ── Core CRUD
router.post('/', createLead);
router.get('/', getLeads);
router.get('/:id', getLeadById);
router.put('/:id', updateLead);
router.delete('/:id', deleteLead);

// ── Status transition
router.patch('/:id/status', transitionStatus);

module.exports = router;
