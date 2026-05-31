const Lead = require('../models/Lead');
const cache = require('../config/cache');

const CACHE_TTL = 60; // seconds

// ─── helpers ────────────────────────────────────────────────────────────────

const cacheKey = (id) => `lead:${id}`;

const invalidateLeadCache = async (id) => {
  await cache.del(cacheKey(id));
};

// ─── POST /leads ─────────────────────────────────────────────────────────────

const createLead = async (req, res, next) => {
  try {
    const { name, email, phone, source } = req.body;
    const lead = await Lead.create({ name, email, phone, source });
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
};

// ─── GET /leads ──────────────────────────────────────────────────────────────

const getLeads = async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.status) {
      const statusStr = String(req.query.status);
      if (!Lead.STATUSES.includes(statusStr)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${Lead.STATUSES.join(', ')}`,
        });
      }
      filter.status = statusStr;
    }

    if (req.query.source) {
      filter.source = String(req.query.source);
    }

    if (req.query.name) {
      const nameStr = String(req.query.name);
      // Escape regex characters to prevent regular expression injection (ReDoS)
      const escapedName = nameStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = new RegExp(escapedName, 'i');
    }

    // Pagination (bonus quality)
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    // Sorting
    const sortField = req.query.sortBy || 'created_at';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    const [leads, total] = await Promise.all([
      Lead.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limit),
      Lead.countDocuments(filter),
    ]);

    res.json({
      total,
      page,
      limit,
      data: leads,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /leads/:id ───────────────────────────────────────────────────────────

const getLeadById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check cache first
    const cached = await cache.get(cacheKey(id));
    if (cached) {
      return res.json({ ...cached, _cached: true });
    }

    const lead = await Lead.findById(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Store in cache
    await cache.set(cacheKey(id), lead.toJSON(), CACHE_TTL);

    res.json(lead);
  } catch (err) {
    next(err);
  }
};

// ─── PUT /leads/:id ───────────────────────────────────────────────────────────

const updateLead = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Disallow changing status via PUT — must use PATCH /status
    const { status, ...allowedUpdates } = req.body;

    const lead = await Lead.findByIdAndUpdate(
      id,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    );

    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    await invalidateLeadCache(id);
    res.json(lead);
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /leads/:id ────────────────────────────────────────────────────────

const deleteLead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const lead = await Lead.findByIdAndDelete(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    await invalidateLeadCache(id);
    res.status(200).json({ message: 'Lead deleted successfully', id });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /leads/:id/status ──────────────────────────────────────────────────

const transitionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body;

    if (!newStatus) {
      return res.status(400).json({ error: 'status is required in request body' });
    }

    if (!Lead.STATUSES.includes(newStatus)) {
      return res.status(400).json({
        error: `Invalid status value. Must be one of: ${Lead.STATUSES.join(', ')}`,
      });
    }

    const lead = await Lead.findById(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const currentStatus = lead.status;

    if (currentStatus === newStatus) {
      return res.status(400).json({ error: `Lead is already in ${newStatus} status` });
    }

    if (!Lead.isValidTransition(currentStatus, newStatus)) {
      return res.status(400).json({
        error: `Invalid status transition from ${currentStatus} to ${newStatus}`,
      });
    }

    lead.status = newStatus;
    await lead.save();

    await invalidateLeadCache(id);
    res.json(lead);
  } catch (err) {
    next(err);
  }
};

// ─── POST /leads/bulk ─────────────────────────────────────────────────────────

const bulkCreateLeads = async (req, res, next) => {
  try {
    const leads = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'Request body must be a non-empty array of leads' });
    }

    if (leads.length > 100) {
      return res.status(400).json({ error: 'Bulk create limit is 100 leads per request' });
    }

    const results = await Promise.all(
      leads.map(async (leadData, index) => {
        try {
          const { name, email, phone, source } = leadData;
          const lead = await Lead.create({ name, email, phone, source });
          return { index, success: true, lead };
        } catch (err) {
          const message = extractMongooseError(err);
          return { index, success: false, error: message };
        }
      })
    );

    const successful = results.filter((r) => r.success).length;
    const failed = results.length - successful;

    res.status(207).json({ total: leads.length, successful, failed, results });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /leads/bulk ──────────────────────────────────────────────────────────

const bulkUpdateLeads = async (req, res, next) => {
  try {
    const updates = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Request body must be a non-empty array of update objects' });
    }

    if (updates.length > 100) {
      return res.status(400).json({ error: 'Bulk update limit is 100 leads per request' });
    }

    const results = await Promise.all(
      updates.map(async (updateData, index) => {
        try {
          const { id, status, ...allowedUpdates } = updateData;

          if (!id) return { index, success: false, error: 'id is required for each update' };

          const lead = await Lead.findByIdAndUpdate(
            id,
            { $set: allowedUpdates },
            { new: true, runValidators: true }
          );

          if (!lead) return { index, success: false, error: `Lead with id ${id} not found` };

          await invalidateLeadCache(id);
          return { index, success: true, lead };
        } catch (err) {
          const message = extractMongooseError(err);
          return { index, success: false, error: message };
        }
      })
    );

    const successful = results.filter((r) => r.success).length;
    const failed = results.length - successful;

    res.status(207).json({ total: updates.length, successful, failed, results });
  } catch (err) {
    next(err);
  }
};

// ─── util: readable mongoose errors ──────────────────────────────────────────

const extractMongooseError = (err) => {
  if (err.name === 'ValidationError') {
    return Object.values(err.errors)
      .map((e) => e.message)
      .join('; ');
  }
  if (err.name === 'CastError') return `Invalid id format`;
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return field === 'email' ? 'A lead with this email already exists' : `${field} already exists`;
  }
  return err.message;
};

module.exports = {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  transitionStatus,
  bulkCreateLeads,
  bulkUpdateLeads,
};
