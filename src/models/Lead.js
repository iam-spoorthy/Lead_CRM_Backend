const mongoose = require('mongoose');
const validator = require('validator');

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'];

// Valid transitions map — key: current status, value: allowed next statuses
const VALID_TRANSITIONS = {
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['CONVERTED', 'LOST'],
  CONVERTED: [], // terminal
  LOST: [],      // terminal
};

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => validator.isEmail(v),
        message: 'email must be a valid email address',
      },
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'NEW',
    },
    source: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    optimisticConcurrency: true,
  }
);

// Static helper: check if a transition is valid
leadSchema.statics.isValidTransition = function (from, to) {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
};

// Static helper: expose statuses
leadSchema.statics.STATUSES = STATUSES;
leadSchema.statics.VALID_TRANSITIONS = VALID_TRANSITIONS;

// Format _id → id, ensure exact key ordering required by the assignment, and hide version key
leadSchema.set('toJSON', {
  transform: (doc, ret) => {
    return {
      id: ret._id ? ret._id.toString() : undefined,
      name: ret.name,
      email: ret.email,
      phone: ret.phone,
      status: ret.status,
      source: ret.source,
      created_at: ret.created_at,
      updated_at: ret.updated_at,
    };
  },
});

module.exports = mongoose.model('Lead', leadSchema);
