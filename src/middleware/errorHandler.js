const errorHandler = (err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.path} →`, err.message);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(422).json({ error: messages.join('; ') });
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(404).json({ error: 'Lead not found' });
  }

  // Mongoose optimistic concurrency error (version conflict)
  if (err.name === 'VersionError') {
    return res.status(409).json({ error: 'Concurrent modification detected. Please reload and try again.' });
  }

  // Duplicate key (e.g. unique email if you add that later)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const displayError = field === 'email' ? 'A lead with this email already exists' : `${field} already exists`;
    return res.status(409).json({ error: displayError });
  }

  // Default 500
  res.status(500).json({ error: 'Internal server error' });
};

module.exports = errorHandler;
