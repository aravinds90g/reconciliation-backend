const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    console.log('[Auth Debug] Header:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[Auth Debug] Missing or invalid header format');
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    let decoded;
    try {
        decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || 'your-secret-key'
        );
    } catch (err) {
        console.log('[Auth Debug] Verify failed:', err.message);
        throw err;
    }
    
    // Get user from database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      console.log('[Auth Debug] User not found for ID:', decoded.id);
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (!user.isActive) {
      console.log('[Auth Debug] User inactive:', user.email);
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated'
      });
    }
    
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }
    
    next(error);
  }
};

exports.authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }
    
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to perform this action'
      });
    }
    
    next();
  };
};

exports.isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
};

exports.isAnalystOrAdmin = (req, res, next) => {
  if (!['admin', 'analyst'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Analyst or admin access required'
    });
  }
  next();
};
